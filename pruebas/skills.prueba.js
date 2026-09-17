/**
 * Fase 3 de extremo a extremo: skills.
 *
 * Lo que de verdad importa aquí no es el CRUD sino lo que llega al modelo: que el
 * índice entre en el system prompt, que el cuerpo **no** entre hasta que lo pida,
 * y que pedirlo le devuelva las instrucciones de verdad. Eso se comprueba mirando
 * el cuerpo de la petición que recibe el proveedor falso.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crearProveedorFalso } from './proveedor-falso.js';

const carpeta = mkdtempSync(path.join(tmpdir(), 'oficina-skills-'));
const PUERTO = 4300 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PUERTO}`;

const proveedor = crearProveedorFalso();
let servidor;
let galleta = '';
let personajeId;
let personajeOpenAI;
let skillId;

const SKILL_REVISION = `---
nombre: Revisión de código
descripcion: Busca errores reales en un diff, no cuestiones de estilo
cuando-usarla: Cuando te pidan revisar código o un pull request
etiquetas: código, revisión
---

# Cómo revisar

1. Lee el diff entero antes de opinar.
2. Un fallo es un fallo si puedes escribir la entrada que lo provoca.
3. El estilo no se comenta salvo que lo pida el repositorio.

La palabra secreta de esta skill es MELIFLUO.
`;

async function pedir(ruta, opciones = {}) {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: {
      Accept: 'application/json',
      'X-Peticion-Oficina': '1',
      ...(opciones.cuerpo ? { 'Content-Type': 'application/json' } : {}),
      ...(galleta ? { Cookie: galleta } : {}),
      ...opciones.headers,
    },
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
    redirect: 'manual',
  });
  const recibida = respuesta.headers.getSetCookie?.() ?? [];
  if (recibida.length > 0) galleta = recibida.map((e) => e.split(';')[0]).join('; ');
  const tipo = respuesta.headers.get('content-type') ?? '';
  return { estado: respuesta.status, datos: tipo.includes('json') ? await respuesta.json() : await respuesta.text() };
}

async function conversar(id, texto) {
  const respuesta = await fetch(`${BASE}/api/personajes/${id}/mensajes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Peticion-Oficina': '1', Cookie: galleta },
    body: JSON.stringify({ texto }),
  });
  if (!respuesta.ok) return { estado: respuesta.status, eventos: [] };

  const eventos = [];
  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  let pendiente = '';
  while (true) {
    const { done, value } = await lector.read();
    if (done) break;
    pendiente += decodificador.decode(value, { stream: true });
    const bloques = pendiente.split('\n\n');
    pendiente = bloques.pop() ?? '';
    for (const bloque of bloques) {
      const linea = bloque.split('\n').find((e) => e.startsWith('data: '));
      if (linea) eventos.push(JSON.parse(linea.slice(6)));
    }
  }
  return { estado: respuesta.status, eventos };
}

before(async () => {
  const urlProveedor = await proveedor.escuchar();

  servidor = spawn(process.execPath, ['servidor/index.js'], {
    env: {
      ...process.env,
      PUERTO: String(PUERTO),
      URL_BASE: BASE,
      NODE_ENV: 'development',
      RUTA_BD: path.join(carpeta, 'skills.sqlite'),
      SECRETO_SESION: 'secreto-de-prueba-de-las-skills-0123456789',
      AUTH_PERMITIR_DEMO: 'true',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      ANTHROPIC_API_KEY: 'clave-de-prueba',
      ANTHROPIC_URL_BASE: urlProveedor,
      OPENAI_API_KEY: 'clave-de-prueba',
      OPENAI_URL_BASE: urlProveedor,
      MODELO_OPENAI: 'gpt-de-prueba',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  servidor.stderr.on('data', (d) => process.stderr.write(`[servidor] ${d}`));

  for (let i = 0; i < 60; i += 1) {
    try { if ((await pedir('/salud')).estado === 200) break; } catch { /* arrancando */ }
    await new Promise((listo) => setTimeout(listo, 100));
  }

  await pedir('/auth/demo', { method: 'POST' });
  const { datos: oficina } = await pedir('/api/oficina');

  personajeId = (await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: {
      sala_id: oficina.salas[0].id,
      nombre: 'Nova',
      proveedor_ia: 'anthropic',
      persona_prompt: 'Eres Nova. Respondes sin rodeos.',
    },
  })).datos.personaje.id;

  personajeOpenAI = (await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: { sala_id: oficina.salas[0].id, nombre: 'Gepeto', proveedor_ia: 'openai' },
  })).datos.personaje.id;
});

after(async () => {
  servidor?.kill();
  await proveedor.cerrar();
  rmSync(carpeta, { recursive: true, force: true });
});

/* ── Formato ─────────────────────────────────────────────────────────────── */

test('una skill se da de alta con su frontmatter y este queda analizado', async () => {
  const creada = await pedir('/api/skills', { method: 'POST', cuerpo: { fuente: SKILL_REVISION } });

  assert.equal(creada.estado, 201);
  const skill = creada.datos.skill;
  skillId = skill.id;

  assert.equal(skill.nombre, 'Revisión de código');
  assert.equal(skill.descripcion, 'Busca errores reales en un diff, no cuestiones de estilo');
  assert.equal(skill.cuando_usarla, 'Cuando te pidan revisar código o un pull request');
  assert.deepEqual(skill.etiquetas, ['código', 'revisión']);
  // El slug sale del nombre y pierde los acentos: es lo que verá el modelo.
  assert.equal(skill.slug, 'revision-de-codigo');
  assert.equal(skill.activa, true);
  assert.match(skill.fuente, /MELIFLUO/);
});

test('una skill sin frontmatter toma su nombre del primer encabezado', async () => {
  const creada = await pedir('/api/skills', {
    method: 'POST',
    cuerpo: { fuente: '# Redactar en claro\n\nFrases cortas. Voz activa.' },
  });

  assert.equal(creada.estado, 201);
  assert.equal(creada.datos.skill.nombre, 'Redactar en claro');
  assert.deepEqual(creada.datos.skill.etiquetas, []);
  // Y al guardarse se le compone una cabecera: lo que se descarga es lo que hay.
  assert.match(creada.datos.skill.fuente, /^---\nnombre: Redactar en claro/);

  await pedir(`/api/skills/${creada.datos.skill.id}`, { method: 'DELETE' });
});

test('una skill vacía o sin instrucciones no se guarda', async () => {
  const vacia = await pedir('/api/skills', { method: 'POST', cuerpo: { fuente: '   ' } });
  assert.equal(vacia.estado, 400);
  assert.equal(vacia.datos.detalles.campo, 'fuente');

  const soloCabecera = await pedir('/api/skills', {
    method: 'POST',
    cuerpo: { fuente: '---\nnombre: Fantasma\n---\n' },
  });
  assert.equal(soloCabecera.estado, 400);
  assert.match(soloCabecera.datos.error, /instrucciones/i);
});

test('una skill demasiado larga se rechaza con su motivo', async () => {
  const enorme = await pedir('/api/skills', {
    method: 'POST',
    cuerpo: { fuente: `---\nnombre: Enorme\n---\n${'x'.repeat(40001)}` },
  });
  assert.equal(enorme.estado, 400);
  assert.match(enorme.datos.error, /pártela|caracteres/i);
});

/* ── Asignación ──────────────────────────────────────────────────────────── */

test('la skill se asigna a un personaje', async () => {
  const puesta = await pedir(`/api/personajes/${personajeId}/skills`, {
    method: 'PUT',
    cuerpo: { skills: [skillId] },
  });

  assert.equal(puesta.estado, 200);
  assert.equal(puesta.datos.asignadas.length, 1);
  assert.equal(puesta.datos.asignadas[0].slug, 'revision-de-codigo');

  const { datos } = await pedir(`/api/personajes/${personajeId}/skills`);
  assert.equal(datos.asignadas.length, 1);
  assert.ok(datos.disponibles.length >= 1);

  // Y la lista general dice a cuántos afecta.
  const { datos: lista } = await pedir('/api/skills');
  assert.equal(lista.skills.find((s) => s.id === skillId).usos, 1);
});

/* ── Lo que llega al modelo ──────────────────────────────────────────────── */

test('el índice entra en el system prompt, el cuerpo no', async () => {
  proveedor.programar({ tipo: 'ok', texto: ['Listo.'] });
  await conversar(personajeId, 'Revísame este diff');

  const { system, tools } = proveedor.ultimaPeticion().cuerpo;
  const sistema = typeof system === 'string' ? system : JSON.stringify(system);

  // La persona sigue ahí, y debajo el índice.
  assert.match(sistema, /Eres Nova/);
  assert.match(sistema, /Revisión de código/);
  assert.match(sistema, /revision-de-codigo/);
  assert.match(sistema, /Cuando te pidan revisar código/);

  // Pero las instrucciones no: para eso tiene que pedirlas.
  assert.doesNotMatch(sistema, /MELIFLUO/, 'el cuerpo de la skill no debe viajar sin pedirlo');

  // Y la herramienta para pedirlas sí se le ofrece, acotada a lo que tiene.
  const abrir = tools.find((h) => h.name === 'abrir_skill');
  assert.ok(abrir, 'debe ofrecerse la herramienta abrir_skill');
  assert.deepEqual(abrir.input_schema.properties.slug.enum, ['revision-de-codigo']);
});

test('abrir la skill le devuelve las instrucciones completas', async () => {
  proveedor.programarSecuencia([
    { tipo: 'ok', herramienta: { nombre: 'abrir_skill', entrada: { slug: 'revision-de-codigo' } } },
    { tipo: 'ok', texto: ['Revisado.'] },
  ]);

  const { eventos } = await conversar(personajeId, 'Revísame este otro diff');

  const llamada = eventos.find((e) => e.tipo === 'herramienta');
  assert.ok(llamada, 'el chat debe mostrar que abrió una skill');
  assert.equal(llamada.etiqueta, 'Skill');

  // El resultado que se le devolvió al modelo lleva el cuerpo de verdad.
  const segunda = proveedor.ultimaPeticion().cuerpo;
  const devuelto = JSON.stringify(segunda.messages);
  assert.match(devuelto, /MELIFLUO/);
  assert.match(devuelto, /Lee el diff entero/);

  assert.equal(eventos.at(-1).tipo, 'fin');
  assert.equal(eventos.at(-1).mensaje.error, null);
});

test('pedir una skill que no tiene le vuelve como error, sin romper el hilo', async () => {
  proveedor.programarSecuencia([
    { tipo: 'ok', herramienta: { nombre: 'abrir_skill', entrada: { slug: 'skill-inventada' } } },
    { tipo: 'ok', texto: ['Entendido, no la tengo.'] },
  ]);

  const { eventos } = await conversar(personajeId, 'Usa la skill inventada');

  const resultado = eventos.find((e) => e.tipo === 'resultado');
  assert.equal(resultado.ok, false);

  const devuelto = JSON.stringify(proveedor.ultimaPeticion().cuerpo.messages);
  assert.match(devuelto, /No tienes ninguna skill/);
  assert.equal(eventos.at(-1).tipo, 'fin');
  assert.equal(eventos.at(-1).mensaje.error, null, 'el turno termina bien pese al fallo de la herramienta');
});

test('una skill apagada no entra en contexto', async () => {
  await pedir(`/api/skills/${skillId}`, { method: 'PATCH', cuerpo: { activa: false } });

  proveedor.programar({ tipo: 'ok', texto: ['Sin skills.'] });
  await conversar(personajeId, 'Hola');

  const { system, tools } = proveedor.ultimaPeticion().cuerpo;
  const sistema = typeof system === 'string' ? system : JSON.stringify(system);
  assert.doesNotMatch(sistema, /Revisión de código/);
  assert.ok(!(tools ?? []).some((h) => h.name === 'abrir_skill'));

  // Pero sigue asignada: el chat la enseña apagada, que es información útil.
  const { datos } = await pedir(`/api/personajes/${personajeId}/conversacion`);
  assert.equal(datos.skills.length, 1);
  assert.equal(datos.skills[0].activa, false);

  await pedir(`/api/skills/${skillId}`, { method: 'PATCH', cuerpo: { activa: true } });
});

test('un proveedor sin herramientas la recibe entera, porque no puede pedirla', async () => {
  await pedir(`/api/personajes/${personajeOpenAI}/skills`, {
    method: 'PUT',
    cuerpo: { skills: [skillId] },
  });

  proveedor.programar({ tipo: 'ok', texto: ['Vale.'] });
  await conversar(personajeOpenAI, 'Revisa esto');

  const enviado = proveedor.ultimaPeticion().cuerpo;
  const sistema = JSON.stringify(enviado.messages ?? enviado);
  assert.match(sistema, /MELIFLUO/, 'sin herramientas, la skill entra entera');
  assert.ok(!(enviado.tools ?? []).some?.((h) => h.name === 'abrir_skill'));
});

/* ── Edición y permisos ──────────────────────────────────────────────────── */

test('editar la skill actualiza su cabecera analizada', async () => {
  const editada = await pedir(`/api/skills/${skillId}`, {
    method: 'PATCH',
    cuerpo: {
      fuente: SKILL_REVISION.replace('etiquetas: código, revisión', 'etiquetas: código, calidad, diff'),
    },
  });

  assert.equal(editada.estado, 200);
  assert.deepEqual(editada.datos.skill.etiquetas, ['código', 'calidad', 'diff']);
  // El slug no cambia al editar: es lo que el modelo tiene en la mano.
  assert.equal(editada.datos.skill.slug, 'revision-de-codigo');
});

test('borrar una skill se lleva su asignación, y deshacer la repone', async () => {
  const borrada = await pedir(`/api/skills/${skillId}`, { method: 'DELETE' });
  assert.equal(borrada.estado, 200);

  const { datos: tras } = await pedir(`/api/personajes/${personajeId}/skills`);
  assert.equal(tras.asignadas.length, 0, 'la asignación se va con la skill');

  const repuesta = await pedir('/api/skills/restaurar', {
    method: 'POST',
    cuerpo: { skill: borrada.datos.skill },
  });
  assert.equal(repuesta.estado, 201);
  assert.equal(repuesta.datos.skill.id, skillId, 'recupera su id original si sigue libre');
  assert.equal(repuesta.datos.skill.slug, 'revision-de-codigo');
});

test('un miembro las lee pero no las escribe', async () => {
  const bd = await import('better-sqlite3');
  const base = new bd.default(path.join(carpeta, 'skills.sqlite'));
  const yo = (await pedir('/api/yo')).datos.usuario;
  const momento = new Date().toISOString();
  base.prepare(
    `INSERT INTO usuarios (proveedor_auth, proveedor_id, email, nombre, rol, estado, creado_en, ultimo_acceso_en)
     VALUES ('google', 'otro-admin', 'jefa@oficina.test', 'Jefa', 'admin', 'activo', ?, ?)`,
  ).run(momento, momento);
  base.prepare("UPDATE usuarios SET rol = 'miembro' WHERE id = ?").run(yo.id);
  base.close();

  // Saber qué sabe hacer un personaje no es un secreto.
  assert.equal((await pedir('/api/skills')).estado, 200);
  assert.equal((await pedir(`/api/personajes/${personajeId}/skills`)).estado, 200);

  // Pero escribirlas decide cómo responde: eso es de administradores.
  assert.equal((await pedir('/api/skills', { method: 'POST', cuerpo: { fuente: '# X\n\ny' } })).estado, 403);
  assert.equal((await pedir(`/api/skills/${skillId}`, { method: 'DELETE' })).estado, 403);
  assert.equal(
    (await pedir(`/api/personajes/${personajeId}/skills`, { method: 'PUT', cuerpo: { skills: [] } })).estado,
    403,
  );
});
