/**
 * Fase 6 de extremo a extremo: misiones.
 *
 * Una misión es una orden repartida entre varios personajes. Lo que se comprueba
 * aquí es el recorrido completo contra el proveedor falso: que el coordinador
 * reparte, que cada especialista recibe **su** encargo y no el de otro, que los
 * pasos van en paralelo, que un paso que falla no tumba la misión, y que la
 * síntesis ve lo que trajo cada uno.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crearProveedorFalso } from './proveedor-falso.js';

const carpeta = mkdtempSync(path.join(tmpdir(), 'oficina-misiones-'));
const PUERTO = 4500 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PUERTO}`;

const proveedor = crearProveedorFalso();
let servidor;
let galleta = '';
let equipo = {};

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

/** Lanza una misión y devuelve todos los eventos del stream. */
async function misionar(cuerpo) {
  const respuesta = await fetch(`${BASE}/api/misiones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Peticion-Oficina': '1', Cookie: galleta },
    body: JSON.stringify(cuerpo),
  });
  if (!respuesta.ok) {
    return { estado: respuesta.status, datos: await respuesta.json().catch(() => ({})), eventos: [] };
  }

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

/** Guioniza el reparto: el JSON que devuelve el coordinador. */
const plan = (titulo, pasos) => ({
  tipo: 'ok',
  texto: [JSON.stringify({ titulo, pasos })],
});

before(async () => {
  const urlProveedor = await proveedor.escuchar();

  servidor = spawn(process.execPath, ['servidor/index.js'], {
    env: {
      ...process.env,
      PUERTO: String(PUERTO),
      URL_BASE: BASE,
      NODE_ENV: 'development',
      RUTA_BD: path.join(carpeta, 'misiones.sqlite'),
      SECRETO_SESION: 'secreto-de-prueba-de-misiones-0123456789',
      AUTH_PERMITIR_DEMO: 'true',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      ANTHROPIC_API_KEY: 'clave-de-prueba',
      ANTHROPIC_URL_BASE: urlProveedor,
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
  const sala = (slug) => oficina.salas.find((s) => s.slug === slug).id;

  const alta = async (datos) => (await pedir('/api/personajes', { method: 'POST', cuerpo: datos })).datos.personaje;

  equipo.pepita = await alta({
    sala_id: sala('recepcion'), nombre: 'Pepita', rango: 'secretario',
    especialidad: 'Repartir encargos', app: 'Claude', proveedor_ia: 'anthropic', modelo: 'claude-opus-5',
  });
  equipo.berto = await alta({
    sala_id: sala('desarrollo'), nombre: 'Berto', rango: 'especialista',
    especialidad: 'Escribir código', app: 'Claude Code', proveedor_ia: 'anthropic', modelo: 'claude-opus-5',
  });
  equipo.mimo = await alta({
    sala_id: sala('diseno'), nombre: 'Mimo', rango: 'especialista',
    especialidad: 'Interfaces', app: 'Figma', proveedor_ia: 'anthropic', modelo: 'claude-opus-5',
  });
  equipo.jarvis = await alta({
    sala_id: sala('asistencia'), nombre: 'Jarvis', proveedor_ia: 'externo',
    enlace_externo: 'https://example.com/jarvis',
  });
});

after(async () => {
  servidor?.kill();
  await proveedor.cerrar();
  rmSync(carpeta, { recursive: true, force: true });
});

/* ── Quién puede trabajar ────────────────────────────────────────────────── */

test('el equipo disponible deja fuera a quien no puede responder', async () => {
  const { datos } = await pedir('/api/misiones/equipo');

  const nombres = datos.equipo.map((p) => p.nombre).sort();
  assert.deepEqual(nombres, ['Berto', 'Mimo', 'Pepita']);

  // Jarvis es una app externa: no tiene chat propio, así que no puede ejecutar.
  assert.deepEqual(datos.fuera.map((p) => p.nombre), ['Jarvis']);
  assert.match(datos.fuera[0].chat_motivo, /aplicación externa/i);

  // Y coordina la secretaria, que es lo que manda su rango.
  assert.equal(datos.coordinador.nombre, 'Pepita');
});

test('el rango decide quién coordina, no el orden de alta', async () => {
  // Pepita se apaga: debería tomar el mando un manager, y si no hay, un especialista.
  await pedir(`/api/personajes/${equipo.pepita.id}`, { method: 'PATCH', cuerpo: { estado: 'pausado' } });
  const sinSecretaria = (await pedir('/api/misiones/equipo')).datos;
  assert.ok(['Berto', 'Mimo'].includes(sinSecretaria.coordinador.nombre));

  await pedir(`/api/personajes/${equipo.mimo.id}`, { method: 'PATCH', cuerpo: { rango: 'manager' } });
  assert.equal((await pedir('/api/misiones/equipo')).datos.coordinador.nombre, 'Mimo');

  // Se deja como estaba para las pruebas siguientes.
  await pedir(`/api/personajes/${equipo.mimo.id}`, { method: 'PATCH', cuerpo: { rango: 'especialista' } });
  await pedir(`/api/personajes/${equipo.pepita.id}`, { method: 'PATCH', cuerpo: { estado: 'activo' } });
});

/* ── El recorrido completo ───────────────────────────────────────────────── */

test('una orden se reparte, se trabaja en paralelo y se cierra con un resultado', async () => {
  proveedor.programarSecuencia([
    plan('Landing de la oficina', [
      { personaje_id: equipo.berto.id, encargo: 'Monta el HTML y el CSS' },
      { personaje_id: equipo.mimo.id, encargo: 'Define la jerarquía visual' },
    ]),
    { tipo: 'ok', texto: ['Trabajo entregado.'] },
  ]);

  const { eventos } = await misionar({ orden: 'Haz la landing de la oficina' });

  const inicio = eventos[0];
  assert.equal(inicio.tipo, 'inicio');
  assert.equal(inicio.coordinador.nombre, 'Pepita');

  const reparto = eventos.find((e) => e.tipo === 'reparto');
  assert.equal(reparto.titulo, 'Landing de la oficina');
  assert.equal(reparto.pasos.length, 2);
  assert.deepEqual(reparto.pasos.map((p) => p.personaje_nombre).sort(), ['Berto', 'Mimo']);
  // La sala viaja con el paso: es lo que la oficina necesita para animar a quién camina.
  assert.ok(reparto.pasos.every((p) => Number.isInteger(p.personaje_sala_id)));

  // Cada paso pasa por trabajando y termina.
  const trabajando = eventos.filter((e) => e.tipo === 'paso' && e.estado === 'trabajando');
  const listos = eventos.filter((e) => e.tipo === 'paso' && e.estado === 'lista');
  assert.equal(trabajando.length, 2);
  assert.equal(listos.length, 2);

  const fin = eventos.at(-1);
  assert.equal(fin.tipo, 'fin');
  assert.equal(fin.estado, 'lista');
  assert.ok(fin.resultado.length > 0);

  // Y queda guardada, consultable después.
  const { datos } = await pedir('/api/misiones');
  assert.equal(datos.misiones[0].estado, 'lista');
  assert.equal(datos.misiones[0].titulo, 'Landing de la oficina');
  assert.equal(datos.misiones[0].total_pasos, 2);
});

test('cada especialista recibe su encargo, no el del otro', async () => {
  proveedor.programarSecuencia([
    plan('Dos encargos distintos', [
      { personaje_id: equipo.berto.id, encargo: 'ENCARGO-DE-BERTO' },
      { personaje_id: equipo.mimo.id, encargo: 'ENCARGO-DE-MIMO' },
    ]),
    { tipo: 'ok', texto: ['Hecho.'] },
  ]);

  await misionar({ orden: 'Reparte esto' });

  // Se miran todas las peticiones del turno: una por paso, más reparto y síntesis.
  const cuerpos = proveedor.peticiones.map((p) => JSON.stringify(p.cuerpo));
  const deBerto = cuerpos.filter((c) => c.includes('ENCARGO-DE-BERTO'));
  const deMimo = cuerpos.filter((c) => c.includes('ENCARGO-DE-MIMO'));

  assert.ok(deBerto.length > 0 && deMimo.length > 0, 'cada encargo tiene que llegar a alguien');
  // Ningún paso ve los dos encargos: solo la síntesis, que sí los junta.
  const conLosDos = cuerpos.filter((c) => c.includes('ENCARGO-DE-BERTO') && c.includes('ENCARGO-DE-MIMO'));
  assert.equal(conLosDos.length, 1, 'solo la síntesis debe ver los dos encargos');
});

test('un paso que falla no tumba la misión, y la síntesis lo sabe', async () => {
  proveedor.programarSecuencia([
    plan('Con un tropiezo', [
      { personaje_id: equipo.berto.id, encargo: 'Esto sale bien' },
      { personaje_id: equipo.mimo.id, encargo: 'Esto revienta' },
    ]),
    // La secuencia repite su último paso, así que solo el primer especialista en
    // llegar se encuentra el fallo; el otro y la síntesis salen bien.
    // 400 y no 500 a propósito: el SDK reintenta los 5xx, y el reintento se
    // encontraría ya el paso siguiente de la secuencia y saldría bien.
    { tipo: 'error', estado: 400, mensaje: 'El proveedor rechazó la petición' },
    { tipo: 'ok', texto: ['Lo mío sí salió.'] },
  ]);

  const { eventos } = await misionar({ orden: 'Algo va a fallar' });

  const fallidos = eventos.filter((e) => e.tipo === 'paso' && e.estado === 'error');
  assert.ok(fallidos.length >= 1, 'el paso fallido se cuenta');
  assert.ok(fallidos[0].error);

  const fin = eventos.at(-1);
  assert.equal(fin.tipo, 'fin');
  assert.notEqual(fin.estado, 'error', 'la misión sigue aunque un paso se caiga');

  // Y el fallo queda escrito en el paso, no solo en el aire.
  const { datos } = await pedir('/api/misiones');
  const { datos: detalle } = await pedir(`/api/misiones/${datos.misiones[0].id}`);
  assert.ok(detalle.mision.pasos.some((paso) => paso.estado === 'error' && paso.error));
});

test('un reparto que no asigna a nadie del equipo se rechaza con su motivo', async () => {
  proveedor.programarSecuencia([
    plan('Inventado', [{ personaje_id: 9999, encargo: 'Para alguien que no existe' }]),
  ]);

  const { eventos } = await misionar({ orden: 'Asigna a un fantasma' });
  const fin = eventos.at(-1);
  assert.equal(fin.estado, 'error');
  assert.match(fin.error, /ningún paso/i);
});

test('una orden vacía no llega a abrir el streaming', async () => {
  const { estado, datos } = await misionar({ orden: '   ' });
  assert.equal(estado, 400);
  assert.equal(datos.detalles.campo, 'orden');
});

test('una misión acotada a una sala solo usa a los de esa sala', async () => {
  const { datos: oficina } = await pedir('/api/oficina');
  const desarrollo = oficina.salas.find((s) => s.slug === 'desarrollo');

  const { datos } = await pedir(`/api/misiones/equipo?sala=${desarrollo.id}`);
  assert.deepEqual(datos.equipo.map((p) => p.nombre), ['Berto']);
  assert.equal(datos.coordinador.nombre, 'Berto', 'sin secretario, coordina el especialista');

  proveedor.programarSecuencia([
    plan('Solo Berto', [{ personaje_id: equipo.berto.id, encargo: 'Hazlo tú' }]),
    { tipo: 'ok', texto: ['Listo.'] },
  ]);

  const { eventos } = await misionar({ orden: 'Algo de código', sala_id: desarrollo.id });
  const reparto = eventos.find((e) => e.tipo === 'reparto');
  assert.deepEqual(reparto.pasos.map((p) => p.personaje_nombre), ['Berto']);
});

test('una sala sin nadie que pueda trabajar lo dice antes de cobrar nada', async () => {
  const { datos: oficina } = await pedir('/api/oficina');
  const vacia = oficina.salas.find((s) => s.slug === 'operaciones');

  const { estado, datos } = await misionar({ orden: 'Haz algo', sala_id: vacia.id });
  assert.equal(estado, 400);
  assert.match(datos.error, /Operaciones/);
});

test('una misión de otro no se ve ni se abre', async () => {
  // El login de demo siempre devuelve la misma persona, así que la misión ajena
  // se siembra directamente: lo que se prueba es el filtro por dueño, no el login.
  const bd = await import('better-sqlite3');
  const base = new bd.default(path.join(carpeta, 'misiones.sqlite'));
  const momento = new Date().toISOString();
  const otro = base.prepare(
    `INSERT INTO usuarios (proveedor_auth, proveedor_id, email, nombre, rol, estado, creado_en, ultimo_acceso_en)
     VALUES ('google', 'otro', 'otra@oficina.test', 'Otra', 'miembro', 'activo', ?, ?)`,
  ).run(momento, momento).lastInsertRowid;
  const ajena = base.prepare(
    `INSERT INTO misiones (usuario_id, orden, titulo, estado, creado_en, actualizado_en)
     VALUES (?, 'Encargo de otra persona', 'Ajena', 'lista', ?, ?)`,
  ).run(otro, momento, momento).lastInsertRowid;
  base.close();

  const mias = (await pedir('/api/misiones')).datos.misiones;
  assert.ok(!mias.some((m) => m.id === Number(ajena)), 'la misión ajena no aparece en mi lista');
  assert.equal((await pedir(`/api/misiones/${ajena}`)).estado, 404);
  assert.equal((await pedir(`/api/misiones/${ajena}`, { method: 'DELETE' })).estado, 404);
});
