/**
 * Fase 5 de extremo a extremo: la oficina deja de ser de una sola persona.
 *
 * Lo que se comprueba aquí no es la interfaz sino las reglas que la sostienen:
 * quién puede entrar, quién manda, y las dos formas de dejar la oficina sin
 * dueño — degradar o suspender al último administrador — que el servidor tiene
 * que impedir aunque la petición venga bien formada.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const carpeta = mkdtempSync(path.join(tmpdir(), 'oficina-equipo-'));
const RUTA_BD = path.join(carpeta, 'equipo.sqlite');
const RAIZ_PROYECTO = process.cwd();
const PUERTO = 4100 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PUERTO}`;

let servidor;
let galleta = '';
let segundaAdmin;

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

/**
 * Da de alta a alguien directamente en SQLite. En la vida real entra por OAuth;
 * aquí interesa lo que pasa después del login, no el login en sí.
 */
function sembrarUsuario({ email, rol = 'miembro', estado = 'activo' }) {
  const bd = new Database(RUTA_BD);
  const momento = new Date().toISOString();
  const { lastInsertRowid } = bd
    .prepare(
      `INSERT INTO usuarios (proveedor_auth, proveedor_id, email, nombre, rol, estado, creado_en, ultimo_acceso_en)
       VALUES ('google', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(`ext-${email}`, email, email.split('@')[0], rol, estado, momento, momento);
  bd.close();
  return Number(lastInsertRowid);
}

/** Cambia rol o estado saltándose la API: sirve para montar escenarios, no para probarlos. */
function retocar(id, columna, valor) {
  const bd = new Database(RUTA_BD);
  bd.prepare(`UPDATE usuarios SET ${columna} = ? WHERE id = ?`).run(valor, id);
  bd.close();
}

before(async () => {
  servidor = spawn(process.execPath, ['servidor/index.js'], {
    env: {
      ...process.env,
      PUERTO: String(PUERTO),
      URL_BASE: BASE,
      NODE_ENV: 'development',
      RUTA_BD,
      SECRETO_SESION: 'secreto-de-prueba-del-equipo-0123456789',
      AUTH_PERMITIR_DEMO: 'true',
      ADMINS: 'jefa@oficina.test',
      CORREOS_PERMITIDOS: '@oficina.test',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GITHUB_CLIENT_ID: '',
      GITHUB_CLIENT_SECRET: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  servidor.stderr.on('data', (d) => process.stderr.write(`[servidor] ${d}`));

  for (let i = 0; i < 60; i += 1) {
    try { if ((await pedir('/salud')).estado === 200) break; } catch { /* arrancando */ }
    await new Promise((listo) => setTimeout(listo, 100));
  }
  // El primer usuario de la oficina siempre es admin: es quien podrá invitar.
  // El login de demo usa ADMINS[0], así que ese soy yo en todas las pruebas.
  await pedir('/auth/demo', { method: 'POST' });
  // Una segunda administradora, para que la oficina nunca quede huérfana
  // mientras una prueba juega con los permisos de la primera.
  segundaAdmin = sembrarUsuario({ email: 'segunda@oficina.test', rol: 'admin' });
});

after(() => {
  servidor?.kill();
  rmSync(carpeta, { recursive: true, force: true });
});

test('el primer usuario manda y la pantalla de equipo es suya', async () => {
  const { datos: yo } = await pedir('/api/yo');
  assert.equal(yo.usuario.rol, 'admin');
  assert.equal(yo.usuario.estado, 'activo');
  assert.equal(yo.permisos.administrarEquipo, true);

  const { estado, datos } = await pedir('/api/equipo');
  assert.equal(estado, 200);
  assert.equal(datos.equipo.length, 2, 'yo y la segunda administradora sembrada');
  assert.deepEqual(datos.roles, ['admin', 'miembro']);
});

test('invitar guarda el correo y la invitación abre la puerta', async () => {
  const creada = await pedir('/api/equipo/invitaciones', {
    method: 'POST',
    cuerpo: { email: 'Berto@Otra-Empresa.com', rol: 'miembro' },
  });

  assert.equal(creada.estado, 201);
  // El correo se guarda normalizado: quien invita no tiene por qué cuidar mayúsculas.
  assert.equal(creada.datos.invitacion.email, 'berto@otra-empresa.com');

  const { datos } = await pedir('/api/equipo');
  assert.equal(datos.invitaciones.length, 1);
  assert.equal(datos.invitaciones[0].usada_en, null);
});

test('un correo mal escrito no se guarda', async () => {
  const { estado, datos } = await pedir('/api/equipo/invitaciones', {
    method: 'POST',
    cuerpo: { email: 'esto no es un correo' },
  });
  assert.equal(estado, 400);
  assert.equal(datos.detalles.campo, 'email');
});


test('un miembro ve la oficina pero no manda en ella', async () => {
  const yo = (await pedir('/api/yo')).datos.usuario;
  retocar(yo.id, 'rol', 'miembro');

  const { datos: ahora } = await pedir('/api/yo');
  assert.equal(ahora.usuario.rol, 'miembro');
  assert.equal(ahora.permisos.administrarEquipo, false);
  assert.equal(ahora.permisos.administrarSalas, false);

  assert.equal((await pedir('/api/equipo')).estado, 403);
  assert.equal((await pedir('/api/conectores', { method: 'POST', cuerpo: { nombre: 'x' } })).estado, 403);
  assert.equal((await pedir('/api/salas', { method: 'POST', cuerpo: { nombre: 'Sala pirata' } })).estado, 403);

  // Lo suyo sí lo puede hacer: ver la oficina y leer los conectores que le tocan.
  assert.equal((await pedir('/api/oficina')).estado, 200);
  assert.equal((await pedir('/api/conectores')).estado, 200);

  retocar(yo.id, 'rol', 'admin');
});

test('un administrador no se cambia a sí mismo: para eso está otro', async () => {
  const yo = (await pedir('/api/yo')).datos.usuario;

  const propio = await pedir(`/api/equipo/${yo.id}`, { method: 'PATCH', cuerpo: { rol: 'miembro' } });
  assert.equal(propio.estado, 400);
  assert.match(propio.datos.error, /tu propia cuenta/i);

  const borrado = await pedir(`/api/equipo/${yo.id}`, { method: 'DELETE' });
  assert.equal(borrado.estado, 400);
  assert.match(borrado.datos.error, /tu propia cuenta/i);
});

test('con otro administrador al mando, degradar y ascender funcionan', async () => {
  const yo = (await pedir('/api/yo')).datos.usuario;
  const otro = { id: segundaAdmin };
  assert.notEqual(otro.id, yo.id);

  const degradado = await pedir(`/api/equipo/${otro.id}`, { method: 'PATCH', cuerpo: { rol: 'miembro' } });
  assert.equal(degradado.estado, 200);
  assert.equal(degradado.datos.usuario.rol, 'miembro');

  const ascendido = await pedir(`/api/equipo/${otro.id}`, { method: 'PATCH', cuerpo: { rol: 'admin' } });
  assert.equal(ascendido.datos.usuario.rol, 'admin');

  const raro = await pedir(`/api/equipo/${otro.id}`, { method: 'PATCH', cuerpo: { rol: 'emperador' } });
  assert.equal(raro.estado, 400);
  assert.equal(raro.datos.detalles.campo, 'rol');

  const vacio = await pedir(`/api/equipo/${otro.id}`, { method: 'PATCH', cuerpo: {} });
  assert.equal(vacio.estado, 400);
});

test('suspender corta la sesión que ya estaba abierta', async () => {
  const yo = (await pedir('/api/yo')).datos.usuario;
  assert.equal((await pedir('/api/oficina')).estado, 200, 'la sesión vale antes');

  // La suspensión entra por la base de datos porque por la API nadie puede
  // suspenderse a sí mismo. Lo que se prueba es lo de después: que la cookie
  // que ya tenía en la mano deja de abrir la puerta.
  retocar(yo.id, 'estado', 'suspendido');
  const despues = await pedir('/api/oficina');
  assert.equal(despues.estado, 401);

  // Y volver a entrar tampoco: el proveedor dirá que sí, la oficina que no.
  const galletaSuspendida = galleta;
  galleta = '';
  const reintento = await pedir('/auth/demo', { method: 'POST' });
  assert.equal(reintento.estado, 403);
  assert.match(reintento.datos.error, /suspendido/i);

  // Reactivar devuelve el acceso, pero hay que volver a entrar: al rechazar al
  // usuario, Passport vació la sesión antigua, y eso es lo que queremos —
  // levantar la suspensión no debe resucitar una cookie que ya estaba muerta.
  retocar(yo.id, 'estado', 'activo');
  galleta = galletaSuspendida;
  assert.equal((await pedir('/api/oficina')).estado, 401, 'la cookie vieja no revive');

  galleta = '';
  assert.equal((await pedir('/auth/demo', { method: 'POST' })).estado, 200);
  assert.equal((await pedir('/api/oficina')).estado, 200);
});

test('borrar a alguien se lleva sus conversaciones, no las de los demás', async () => {
  const yo = (await pedir('/api/yo')).datos.usuario;
  const victima = sembrarUsuario({ email: 'pepita@oficina.test' });

  const { datos: oficina } = await pedir('/api/oficina');
  const creado = await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: { sala_id: oficina.salas[0].id, nombre: 'Testigo', proveedor_ia: 'anthropic' },
  });
  const personajeId = creado.datos.personaje.id;

  const bd = new Database(RUTA_BD);
  const momento = new Date().toISOString();
  const insertar = bd.prepare(
    `INSERT INTO conversaciones (personaje_id, usuario_id, titulo, archivada, creado_en, actualizado_en)
     VALUES (?, ?, ?, 0, ?, ?)`,
  );
  insertar.run(personajeId, victima, 'Hilo de Pepita', momento, momento);
  const mio = insertar.run(personajeId, yo.id, 'Hilo mío', momento, momento);
  bd.close();

  const borrado = await pedir(`/api/equipo/${victima}`, { method: 'DELETE' });
  assert.equal(borrado.estado, 200);
  assert.equal(borrado.datos.usuario.email, 'pepita@oficina.test');

  const bd2 = new Database(RUTA_BD);
  const quedan = bd2.prepare('SELECT id FROM conversaciones').all();
  bd2.close();
  assert.equal(quedan.length, 1, 'solo sobrevive el hilo del que no se borró');
  assert.equal(quedan[0].id, Number(mio.lastInsertRowid));

  const { datos: despues } = await pedir('/api/equipo');
  assert.ok(!despues.equipo.some((u) => u.email === 'pepita@oficina.test'));
  assert.equal((await pedir(`/api/equipo/${victima}`, { method: 'DELETE' })).estado, 404);
});

test('revocar una invitación la borra de la lista', async () => {
  const { datos } = await pedir('/api/equipo');
  const invitacion = datos.invitaciones[0];

  assert.equal((await pedir(`/api/equipo/invitaciones/${invitacion.id}`, { method: 'DELETE' })).estado, 200);
  assert.equal((await pedir(`/api/equipo/invitaciones/${invitacion.id}`, { method: 'DELETE' })).estado, 404);

  const { datos: despues } = await pedir('/api/equipo');
  assert.equal(despues.invitaciones.length, 0);
});

test('no se invita a quien ya está dentro', async () => {
  const yo = (await pedir('/api/yo')).datos.usuario;
  const repetido = await pedir('/api/equipo/invitaciones', { method: 'POST', cuerpo: { email: yo.email } });
  assert.equal(repetido.estado, 409);
  assert.equal(repetido.datos.detalles.campo, 'email');
});

test('la pantalla de entrada anuncia los proveedores que hay', async () => {
  const { datos } = await pedir('/auth/estado');
  assert.deepEqual(Object.keys(datos.proveedores).sort(), ['demo', 'github', 'google']);
  assert.equal(datos.proveedores.github, false, 'sin GITHUB_CLIENT_ID no se ofrece');
  assert.equal(datos.proveedores.demo, true);
});

/**
 * La regla del último administrador no se puede provocar por HTTP: antes salta
 * la que impide tocar tu propia cuenta. Pero es la que sostiene todo lo demás,
 * así que se ejercita donde vive — en el repositorio, con su propia base.
 */
test('el repositorio se niega a dejar la oficina sin administrador', async () => {
  const guion = `
    import * as usuarios from '${path.join(RAIZ_PROYECTO, 'servidor/repositorios/usuarios.js')}';

    const jefa = usuarios.registrarAcceso({
      proveedorAuth: 'google', proveedorId: '1', email: 'jefa@sola.test', nombre: 'Jefa',
    });
    const peon = usuarios.registrarAcceso({
      proveedorAuth: 'google', proveedorId: '2', email: 'peon@sola.test', nombre: 'Peón',
    });

    const intento = (accion) => { try { accion(); return null; } catch (error) { return error.estado; } };

    console.log(JSON.stringify({
      rolJefa: jefa.rol,
      rolPeon: peon.rol,
      degradar: intento(() => usuarios.actualizarUsuario(jefa.id, { rol: 'miembro' })),
      suspender: intento(() => usuarios.actualizarUsuario(jefa.id, { estado: 'suspendido' })),
      borrar: intento(() => usuarios.eliminarUsuario(jefa.id)),
      // Con un segundo admin, lo que antes era imposible pasa a ser legítimo.
      trasAscender: intento(() => {
        usuarios.actualizarUsuario(peon.id, { rol: 'admin' });
        usuarios.actualizarUsuario(jefa.id, { rol: 'miembro' });
      }),
    }));
  `;

  const salida = await new Promise((listo, fallo) => {
    const hijo = spawn(process.execPath, ['--input-type=module', '-e', guion], {
      env: {
        ...process.env,
        RUTA_BD: path.join(carpeta, 'invariante.sqlite'),
        NODE_ENV: 'development',
        ADMINS: '',
        CORREOS_PERMITIDOS: '',
        SECRETO_SESION: 'secreto-de-prueba-del-invariante-0123456789',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let texto = '';
    let error = '';
    hijo.stdout.on('data', (d) => { texto += d; });
    hijo.stderr.on('data', (d) => { error += d; });
    hijo.on('close', (codigo) => (codigo === 0 ? listo(texto) : fallo(new Error(error))));
  });

  const resultado = JSON.parse(salida);
  assert.equal(resultado.rolJefa, 'admin', 'la primera en entrar manda');
  assert.equal(resultado.rolPeon, 'miembro');
  assert.equal(resultado.degradar, 409, 'degradar al único admin se rechaza');
  assert.equal(resultado.suspender, 409, 'suspenderlo, también');
  assert.equal(resultado.borrar, 409, 'y borrarlo');
  assert.equal(resultado.trasAscender, null, 'con dos admins ya se puede');
});
