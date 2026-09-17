/**
 * Fase 4 de extremo a extremo: conectores MCP.
 * El servidor MCP de las pruebas habla el protocolo de verdad por stdio, así
 * que el cliente que se ejercita es el mismo que corre en producción.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crearProveedorFalso } from './proveedor-falso.js';

const carpeta = mkdtempSync(path.join(tmpdir(), 'oficina-mcp-'));
const PUERTO = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PUERTO}`;
const RAIZ = process.cwd();

const proveedor = crearProveedorFalso();
let servidor;
let galleta = '';
let personajeId;
let conectorId;

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
      RUTA_BD: path.join(carpeta, 'mcp.sqlite'),
      SECRETO_SESION: 'secreto-de-prueba-de-conectores-0123456789',
      AUTH_PERMITIR_DEMO: 'true',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      ANTHROPIC_API_KEY: 'clave-de-prueba',
      ANTHROPIC_URL_BASE: urlProveedor,
      MCP_PERMITIR_STDIO: 'true',
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
  const creado = await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: {
      sala_id: oficina.salas[0].id,
      nombre: 'Archivista',
      proveedor_ia: 'anthropic',
      persona_prompt: 'Eres Archivista. Consultas el archivador antes de responder.',
    },
  });
  personajeId = creado.datos.personaje.id;
});

after(async () => {
  servidor?.kill();
  await proveedor.cerrar();
  rmSync(carpeta, { recursive: true, force: true });
});

test('se da de alta un conector y su configuración vuelve sin secretos', async () => {
  const creado = await pedir('/api/conectores', {
    method: 'POST',
    cuerpo: {
      nombre: 'Archivador',
      descripcion: 'Notas del proyecto.',
      transporte: 'stdio',
      comando: process.execPath,
      argumentos: [path.join(RAIZ, 'pruebas/servidor-mcp-falso.js')],
      variables: 'TOKEN_SECRETO=no-debe-volver\nOTRA=x',
    },
  });

  assert.equal(creado.estado, 201);
  conectorId = creado.datos.conector.id;
  assert.equal(creado.datos.conector.estado, 'sin_probar');
  assert.deepEqual(creado.datos.conector.variables_claves, ['TOKEN_SECRETO', 'OTRA']);
  assert.equal(creado.datos.conector.variables, undefined, 'los valores de los secretos no viajan al navegador');
  assert.ok(!JSON.stringify(creado.datos).includes('no-debe-volver'));
});

test('probar el conector abre el servidor MCP de verdad y lista lo que sabe hacer', async () => {
  const probado = await pedir(`/api/conectores/${conectorId}/probar`, { method: 'POST' });
  assert.equal(probado.estado, 200);
  assert.equal(probado.datos.error, undefined);
  assert.equal(probado.datos.conector.estado, 'listo');
  assert.deepEqual(
    probado.datos.conector.herramientas.map((h) => h.nombre).sort(),
    ['buscar_nota', 'romper'],
  );
});

test('editar el conector no borra los secretos guardados', async () => {
  const editado = await pedir(`/api/conectores/${conectorId}`, {
    method: 'PATCH',
    cuerpo: { nombre: 'Archivador del proyecto', variables: '' },
  });
  assert.equal(editado.datos.conector.nombre, 'Archivador del proyecto');
  assert.deepEqual(editado.datos.conector.variables_claves, ['TOKEN_SECRETO', 'OTRA']);
});

test('el conector se asigna a un personaje', async () => {
  const asignado = await pedir(`/api/personajes/${personajeId}/conectores`, {
    method: 'PUT',
    cuerpo: { conectores: [{ conector_id: conectorId, herramientas: [] }] },
  });
  assert.equal(asignado.estado, 200);
  assert.equal(asignado.datos.asignados.length, 1);

  const { datos } = await pedir(`/api/personajes/${personajeId}/conversacion`);
  assert.equal(datos.conectores.length, 1);
  assert.equal(datos.conectores[0].nombre, 'Archivador del proyecto');
});

test('el personaje llama a la herramienta y responde con lo que le devuelve', async () => {
  proveedor.programarSecuencia([
    { tipo: 'ok', razonamiento: '', texto: [], herramienta: { nombre: 'archivador__buscar_nota', entrada: { titulo: 'Drive' } } },
    { tipo: 'ok', razonamiento: '', texto: ['Según el archivador, ', 'va en la Fase 4.'] },
  ]);

  const { eventos } = await conversar(personajeId, '¿Qué dice la nota de Drive?');

  const llamada = eventos.find((e) => e.tipo === 'herramienta');
  assert.ok(llamada, 'el hilo tiene que contar que se usó una herramienta');
  assert.match(llamada.etiqueta, /Archivador del proyecto · buscar_nota/);

  const resultado = eventos.find((e) => e.tipo === 'resultado');
  assert.equal(resultado.ok, true);
  assert.match(resultado.resumen, /Fase 4/);

  const fin = eventos.at(-1);
  assert.equal(fin.tipo, 'fin');
  assert.equal(fin.mensaje.contenido, 'Según el archivador, va en la Fase 4.');
  assert.equal(fin.mensaje.herramientas.length, 1);
  assert.equal(fin.mensaje.herramientas[0].ok, true);

  // Lo que se envió al modelo en la segunda vuelta lleva el resultado real.
  const segunda = proveedor.ultimaPeticion().cuerpo;
  const resultados = segunda.messages.at(-1).content;
  assert.equal(resultados[0].type, 'tool_result');
  assert.match(resultados[0].content, /el conector de Drive va en la Fase 4/);
});

test('las herramientas se le ofrecen al modelo con su esquema', async () => {
  const enviado = proveedor.peticiones.at(-2).cuerpo;
  assert.ok(Array.isArray(enviado.tools), 'la petición lleva herramientas');
  const nombres = enviado.tools.map((h) => h.name).sort();
  assert.deepEqual(nombres, ['archivador__buscar_nota', 'archivador__romper']);
  // El nombre sale del slug, que no cambia al renombrar: así una conversación en
  // curso no se queda hablando de una herramienta que ya no existe.
  const buscar = enviado.tools.find((h) => h.name.endsWith('buscar_nota'));
  assert.match(buscar.description, /Archivador del proyecto/);
  assert.equal(buscar.input_schema.type, 'object');
});

test('una herramienta que falla se le devuelve al modelo como error, no rompe el hilo', async () => {
  proveedor.programarSecuencia([
    { tipo: 'ok', razonamiento: '', texto: [], herramienta: { nombre: 'archivador__romper', entrada: {} } },
    { tipo: 'ok', razonamiento: '', texto: ['El archivador está cerrado ahora mismo.'] },
  ]);

  const { eventos } = await conversar(personajeId, 'Prueba la que falla.');
  const resultado = eventos.find((e) => e.tipo === 'resultado');
  assert.equal(resultado.ok, false);

  const fin = eventos.at(-1);
  assert.equal(fin.mensaje.error, null, 'el turno no es un fallo: el modelo respondió');
  assert.equal(fin.mensaje.herramientas[0].ok, false);

  const segunda = proveedor.ultimaPeticion().cuerpo;
  assert.equal(segunda.messages.at(-1).content[0].is_error, true);
});

test('la lista blanca limita qué herramientas ve el personaje', async () => {
  await pedir(`/api/personajes/${personajeId}/conectores`, {
    method: 'PUT',
    cuerpo: { conectores: [{ conector_id: conectorId, herramientas: ['buscar_nota'] }] },
  });

  proveedor.programar({ tipo: 'ok', razonamiento: '', texto: ['Listo.'] });
  await conversar(personajeId, 'Hola');

  const enviado = proveedor.ultimaPeticion().cuerpo;
  assert.deepEqual(enviado.tools.map((h) => h.name), ['archivador__buscar_nota']);
});

test('un personaje sin conectores no recibe herramientas', async () => {
  const { datos: oficina } = await pedir('/api/oficina');
  const otro = await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: { sala_id: oficina.salas[1].id, nombre: 'Suelto', proveedor_ia: 'anthropic' },
  });

  proveedor.programar({ tipo: 'ok', razonamiento: '', texto: ['Sin herramientas.'] });
  await conversar(otro.datos.personaje.id, 'Hola');

  assert.equal(proveedor.ultimaPeticion().cuerpo.tools, undefined);
});

test('un conector en uso no se puede borrar', async () => {
  const borrado = await pedir(`/api/conectores/${conectorId}`, { method: 'DELETE' });
  assert.equal(borrado.estado, 409);
  assert.match(borrado.datos.error, /sigue asignado/);
});
