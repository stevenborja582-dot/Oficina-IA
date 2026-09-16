/**
 * Prueba de extremo a extremo de la Fase 1.
 * Levanta el servidor real contra una base SQLite temporal y recorre el flujo
 * completo: entrar, leer la oficina, crear, editar, borrar y deshacer.
 *
 *   npm run verificar
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const carpeta = mkdtempSync(path.join(tmpdir(), 'oficina-prueba-'));
const PUERTO = 3400 + Math.floor(Math.random() * 400);
const BASE = `http://localhost:${PUERTO}`;

let servidor;
let galleta = '';

/** fetch que arrastra la cookie de sesión, como haría el navegador. */
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
  if (recibida.length > 0) galleta = recibida.map((entrada) => entrada.split(';')[0]).join('; ');

  const tipo = respuesta.headers.get('content-type') ?? '';
  const datos = tipo.includes('application/json') ? await respuesta.json() : await respuesta.text();
  return { estado: respuesta.status, datos, cabeceras: respuesta.headers };
}

before(async () => {
  servidor = spawn(process.execPath, ['servidor/index.js'], {
    env: {
      ...process.env,
      PUERTO: String(PUERTO),
      URL_BASE: BASE,
      NODE_ENV: 'development',
      RUTA_BD: path.join(carpeta, 'prueba.sqlite'),
      SECRETO_SESION: 'secreto-solo-para-la-prueba-automatica-0123456789',
      AUTH_PERMITIR_DEMO: 'true',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      ADMINS: 'prueba@oficina.local',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  servidor.stderr.on('data', (dato) => process.stderr.write(`[servidor] ${dato}`));

  // Esperar a que responda /salud.
  for (let intento = 0; intento < 60; intento += 1) {
    try {
      const { estado } = await pedir('/salud');
      if (estado === 200) return;
    } catch {
      /* todavía arrancando */
    }
    await new Promise((listo) => setTimeout(listo, 100));
  }
  throw new Error('El servidor de pruebas no arrancó.');
});

after(() => {
  servidor?.kill();
  rmSync(carpeta, { recursive: true, force: true });
});

test('la API rechaza a quien no ha entrado', async () => {
  const { estado } = await pedir('/api/oficina');
  assert.equal(estado, 401);
});

test('la raíz redirige a la pantalla de entrada', async () => {
  const { estado, cabeceras } = await pedir('/');
  assert.equal(estado, 302);
  assert.equal(cabeceras.get('location'), '/entrar');
});

test('el modo demo abre sesión y el primer usuario es admin', async () => {
  const { estado, datos } = await pedir('/auth/demo', { method: 'POST' });
  assert.equal(estado, 200);
  assert.equal(datos.usuario.rol, 'admin');
});

test('la oficina llega sembrada con las seis salas de la v1', async () => {
  const { estado, datos } = await pedir('/api/oficina');
  assert.equal(estado, 200);
  assert.equal(datos.salas.length, 6);
  assert.deepEqual(
    datos.salas.map((sala) => sala.slug),
    ['desarrollo', 'diseno', 'asistencia', 'contenido', 'automatizacion', 'general'],
  );
  // Ninguna sala se pisa con otra en el plano.
  const posiciones = new Set(datos.salas.map((sala) => `${sala.plano_x}:${sala.plano_y}`));
  assert.equal(posiciones.size, 6);
  assert.ok(datos.plano.alto >= 596, `alto inesperado: ${datos.plano.alto}`);
});

test('crear, editar, borrar y deshacer un personaje', async () => {
  const { datos: oficina } = await pedir('/api/oficina');
  const sala = oficina.salas.find((entrada) => entrada.slug === 'desarrollo');

  const creado = await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: { sala_id: sala.id, nombre: 'Nova', rol_titulo: 'Arquitecta', proveedor_ia: 'anthropic' },
  });
  assert.equal(creado.estado, 201);
  const id = creado.datos.personaje.id;

  const editado = await pedir(`/api/personajes/${id}`, {
    method: 'PATCH',
    cuerpo: { rol_titulo: 'Arquitecta jefa' },
  });
  assert.equal(editado.datos.personaje.rol_titulo, 'Arquitecta jefa');
  assert.equal(editado.datos.personaje.nombre, 'Nova', 'los campos no enviados se conservan');

  const borrado = await pedir(`/api/personajes/${id}`, { method: 'DELETE' });
  assert.equal(borrado.estado, 200);

  const tras = await pedir(`/api/personajes/${id}`);
  assert.equal(tras.estado, 404);

  const restaurado = await pedir('/api/personajes/restaurar', {
    method: 'POST',
    cuerpo: { personaje: borrado.datos.personaje },
  });
  assert.equal(restaurado.estado, 201);
  assert.equal(restaurado.datos.personaje.id, id, 'deshacer recupera el id original');
  assert.equal(restaurado.datos.personaje.nombre, 'Nova');
});

test('la validación protege la base de datos', async () => {
  const { datos: oficina } = await pedir('/api/oficina');
  const sala = oficina.salas[0];

  const sinNombre = await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: { sala_id: sala.id, nombre: '   ' },
  });
  assert.equal(sinNombre.estado, 400);
  assert.equal(sinNombre.datos.detalles.campo, 'nombre');

  const externoSinEnlace = await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: { sala_id: sala.id, nombre: 'Jarvis', proveedor_ia: 'externo' },
  });
  assert.equal(externoSinEnlace.estado, 400);
  assert.equal(externoSinEnlace.datos.detalles.campo, 'enlace_externo');

  const enlaceMalicioso = await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: { sala_id: sala.id, nombre: 'Malo', enlace_externo: 'javascript:alert(1)' },
  });
  assert.equal(enlaceMalicioso.estado, 400);

  const proveedorInventado = await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: { sala_id: sala.id, nombre: 'Raro', proveedor_ia: 'skynet' },
  });
  assert.equal(proveedorInventado.estado, 400);
});

test('una sala nueva aterriza en un hueco libre y no se borra con gente dentro', async () => {
  const creada = await pedir('/api/salas', {
    method: 'POST',
    cuerpo: { nombre: 'Investigación & Datos', color_acento: '#0EA5E9', icono: 'grafico' },
  });
  assert.equal(creada.estado, 201);
  const sala = creada.datos.sala;
  assert.equal(sala.slug, 'investigacion-datos');
  assert.equal(sala.plano_y, 586, 'la séptima sala abre una fila nueva del plano');

  const inquilino = await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: { sala_id: sala.id, nombre: 'Axiom' },
  });
  assert.equal(inquilino.estado, 201);

  const borradoBloqueado = await pedir(`/api/salas/${sala.id}`, { method: 'DELETE' });
  assert.equal(borradoBloqueado.estado, 409);

  await pedir(`/api/personajes/${inquilino.datos.personaje.id}`, { method: 'DELETE' });
  const borrada = await pedir(`/api/salas/${sala.id}`, { method: 'DELETE' });
  assert.equal(borrada.estado, 200);
});

test('las cabeceras de seguridad viajan en cada respuesta', async () => {
  const { cabeceras } = await pedir('/salud');
  assert.match(cabeceras.get('content-security-policy'), /default-src 'self'/);
  assert.equal(cabeceras.get('x-content-type-options'), 'nosniff');
  assert.equal(cabeceras.get('x-frame-options'), 'DENY');
});

test('se rechaza una mutación llegada de otro origen', async () => {
  const { estado } = await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: { nombre: 'Intruso' },
    headers: { Origin: 'https://sitio-ajeno.example' },
  });
  assert.equal(estado, 403);
});

test('cerrar sesión invalida la cookie', async () => {
  const salida = await pedir('/auth/salir', { method: 'POST' });
  assert.equal(salida.estado, 200);
  const despues = await pedir('/api/oficina');
  assert.equal(despues.estado, 401);
});

test('un archivo estático que no existe da 404, no el shell', async () => {
  const { estado } = await pedir('/css/no-existe.css');
  assert.equal(estado, 404);
});
