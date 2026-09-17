/**
 * Fase 2 de extremo a extremo: el chat.
 * Levanta el servidor real contra un proveedor de mentira que habla el SSE de
 * verdad, así que se prueba el adaptador que se usa en producción.
 *
 *   npm run verificar
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crearProveedorFalso } from './proveedor-falso.js';

const carpeta = mkdtempSync(path.join(tmpdir(), 'oficina-chat-'));
const PUERTO = 3500 + Math.floor(Math.random() * 300);
const BASE = `http://localhost:${PUERTO}`;

const proveedor = crearProveedorFalso();
let servidor;
let galleta = '';
let personajeId;
let personajeExternoId;

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
  return {
    estado: respuesta.status,
    datos: tipo.includes('application/json') ? await respuesta.json() : await respuesta.text(),
    respuesta,
  };
}

/** Manda un mensaje y devuelve todos los eventos del streaming. */
async function conversar(id, texto, { abortarTras = null } = {}) {
  const controlador = new AbortController();
  const respuesta = await fetch(`${BASE}/api/personajes/${id}/mensajes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Peticion-Oficina': '1', Cookie: galleta },
    body: JSON.stringify({ texto }),
    signal: controlador.signal,
  });

  if (!respuesta.ok) {
    return { estado: respuesta.status, eventos: [], error: await respuesta.json().catch(() => ({})) };
  }

  const eventos = [];
  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  let pendiente = '';

  try {
    while (true) {
      const { done, value } = await lector.read();
      if (done) break;
      pendiente += decodificador.decode(value, { stream: true });
      const bloques = pendiente.split('\n\n');
      pendiente = bloques.pop() ?? '';
      for (const bloque of bloques) {
        const linea = bloque.split('\n').find((entrada) => entrada.startsWith('data: '));
        if (linea) eventos.push(JSON.parse(linea.slice(6)));
      }
      if (abortarTras && eventos.filter((e) => e.tipo === 'texto').length >= abortarTras) {
        controlador.abort();
        break;
      }
    }
  } catch (error) {
    if (error?.name !== 'AbortError') throw error;
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
      RUTA_BD: path.join(carpeta, 'chat.sqlite'),
      SECRETO_SESION: 'secreto-de-prueba-del-chat-0123456789abcdef',
      AUTH_PERMITIR_DEMO: 'true',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      ANTHROPIC_API_KEY: 'clave-de-prueba',
      ANTHROPIC_URL_BASE: urlProveedor,
      OPENAI_API_KEY: 'clave-de-prueba',
      OPENAI_URL_BASE: `${urlProveedor}/v1`,
      MODELO_OPENAI: 'modelo-de-prueba',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  servidor.stderr.on('data', (dato) => process.stderr.write(`[servidor] ${dato}`));

  for (let intento = 0; intento < 60; intento += 1) {
    try {
      const { estado } = await pedir('/salud');
      if (estado === 200) break;
    } catch {
      /* arrancando */
    }
    await new Promise((listo) => setTimeout(listo, 100));
  }

  await pedir('/auth/demo', { method: 'POST' });
  const { datos: oficina } = await pedir('/api/oficina');
  const sala = oficina.salas[0];

  const creado = await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: {
      sala_id: sala.id,
      nombre: 'Nova',
      rol_titulo: 'Arquitecta',
      proveedor_ia: 'anthropic',
      persona_prompt: 'Eres Nova. Respondes en español, sin rodeos.',
    },
  });
  personajeId = creado.datos.personaje.id;

  const externo = await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: {
      sala_id: sala.id,
      nombre: 'App externa',
      proveedor_ia: 'externo',
      enlace_externo: 'https://example.com/app',
    },
  });
  personajeExternoId = externo.datos.personaje.id;
});

after(async () => {
  servidor?.kill();
  await proveedor.cerrar();
  rmSync(carpeta, { recursive: true, force: true });
});

test('la oficina publica qué proveedores tienen clave', async () => {
  const { datos } = await pedir('/api/oficina');
  assert.equal(datos.proveedores.anthropic.configurado, true);
  assert.equal(datos.proveedores.google.configurado, false);

  const nova = datos.personajes.find((personaje) => personaje.id === personajeId);
  assert.equal(nova.chat_disponible, true);
  const externo = datos.personajes.find((personaje) => personaje.id === personajeExternoId);
  assert.equal(externo.chat_disponible, false);
  assert.match(externo.chat_motivo, /aplicación externa/);
});

test('el hilo empieza vacío y disponible', async () => {
  const { estado, datos } = await pedir(`/api/personajes/${personajeId}/conversacion`);
  assert.equal(estado, 200);
  assert.deepEqual(datos.mensajes, []);
  assert.equal(datos.chat.disponible, true);
  assert.equal(datos.chat.modelo, 'claude-opus-5');
});

test('una respuesta llega en trozos, con razonamiento, y se guarda', async () => {
  proveedor.programar({ tipo: 'ok', razonamiento: 'Lo pienso.', texto: ['Hola, ', 'soy ', 'Nova.'] });

  const { eventos } = await conversar(personajeId, '¿Quién eres?');

  assert.equal(eventos[0].tipo, 'inicio');
  assert.equal(eventos[0].mensaje.contenido, '¿Quién eres?');

  const trozos = eventos.filter((evento) => evento.tipo === 'texto');
  assert.ok(trozos.length >= 2, 'la respuesta tiene que llegar en varios trozos, no de golpe');
  assert.equal(trozos.map((evento) => evento.texto).join(''), 'Hola, soy Nova.');

  const pensado = eventos.filter((evento) => evento.tipo === 'razonamiento');
  assert.equal(pensado.map((evento) => evento.texto).join(''), 'Lo pienso.');

  const fin = eventos.at(-1);
  assert.equal(fin.tipo, 'fin');
  assert.equal(fin.mensaje.contenido, 'Hola, soy Nova.');
  assert.equal(fin.mensaje.error, null);
  assert.equal(fin.mensaje.modelo, 'claude-opus-5');
  assert.equal(fin.mensaje.tokens_entrada, 11);

  const { datos } = await pedir(`/api/personajes/${personajeId}/conversacion`);
  assert.equal(datos.mensajes.length, 2);
  assert.equal(datos.mensajes[1].razonamiento, 'Lo pienso.');
});

test('la persona viaja como system prompt, no como un mensaje más', async () => {
  const enviado = proveedor.ultimaPeticion().cuerpo;
  assert.equal(enviado.system, 'Eres Nova. Respondes en español, sin rodeos.');
  assert.equal(enviado.messages[0].role, 'user');
  assert.ok(enviado.messages.every((mensaje) => mensaje.role !== 'system'));
  assert.deepEqual(enviado.thinking, { type: 'adaptive', display: 'summarized' });
});

test('el segundo turno reenvía el historial', async () => {
  proveedor.programar({ tipo: 'ok', razonamiento: '', texto: ['Claro.'] });
  await conversar(personajeId, 'Repítelo.');

  const enviado = proveedor.ultimaPeticion().cuerpo;
  assert.equal(enviado.messages.length, 3, 'user, assistant, user');
  assert.deepEqual(
    enviado.messages.map((mensaje) => mensaje.role),
    ['user', 'assistant', 'user'],
  );
  assert.equal(enviado.messages[1].content, 'Hola, soy Nova.');
});

test('un fallo del proveedor se cuenta en el hilo, no se traga', async () => {
  proveedor.programar({ tipo: 'error', estado: 401, mensaje: 'clave inválida' });

  const { eventos } = await conversar(personajeId, '¿Sigues ahí?');
  const fin = eventos.at(-1);
  assert.equal(fin.tipo, 'fin');
  assert.match(fin.mensaje.error, /clave/i);

  const { datos } = await pedir(`/api/personajes/${personajeId}/conversacion`);
  const ultimo = datos.mensajes.at(-1);
  assert.equal(ultimo.rol, 'assistant');
  assert.ok(ultimo.error, 'el turno fallido queda registrado');
});

test('un turno fallido no se reenvía como contexto', async () => {
  proveedor.programar({ tipo: 'ok', razonamiento: '', texto: ['Aquí estoy.'] });
  await conversar(personajeId, 'Otra vez.');

  const enviado = proveedor.ultimaPeticion().cuerpo;
  const contenidos = enviado.messages.map((mensaje) => mensaje.content);
  assert.ok(!contenidos.some((texto) => /clave inválida/i.test(texto)));
  // "¿Sigues ahí?" y "Otra vez." son dos turnos de usuario seguidos: se funden.
  assert.ok(
    enviado.messages.every((mensaje, indice) => indice === 0 || mensaje.role !== enviado.messages[indice - 1].role),
    'no puede haber dos turnos seguidos del mismo rol',
  );
});

test('el modelo puede declinar y el hilo lo dice', async () => {
  proveedor.programar({ tipo: 'ok', razonamiento: '', texto: [''], motivo: 'refusal' });
  const { eventos } = await conversar(personajeId, 'Algo que no procede.');
  assert.match(eventos.at(-1).mensaje.error, /declinó/i);
});

test('un personaje de otro proveedor usa su propio adaptador', async () => {
  const { datos: oficina } = await pedir('/api/oficina');
  const creado = await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: {
      sala_id: oficina.salas[0].id,
      nombre: 'Codex',
      proveedor_ia: 'openai',
      persona_prompt: 'Eres Codex. Revisas código.',
    },
  });

  proveedor.programar({ tipo: 'ok', razonamiento: '', texto: ['Respondo ', 'como GPT.'] });
  const { eventos } = await conversar(creado.datos.personaje.id, 'Hola');

  assert.equal(eventos.at(-1).mensaje.contenido, 'Respondo como GPT.');
  assert.equal(eventos.at(-1).mensaje.proveedor_ia, 'openai');
  const enviado = proveedor.ultimaPeticion();
  assert.match(enviado.ruta, /chat\/completions/);
  assert.equal(enviado.cuerpo.messages[0].role, 'system');
  assert.equal(enviado.cuerpo.messages[0].content, 'Eres Codex. Revisas código.');
  assert.equal(enviado.cuerpo.model, 'modelo-de-prueba', 'usa el modelo por defecto de OpenAI');
});

test('un personaje externo no tiene chat', async () => {
  const { datos } = await pedir(`/api/personajes/${personajeExternoId}/conversacion`);
  assert.equal(datos.chat.disponible, false);

  const intento = await conversar(personajeExternoId, 'Hola');
  assert.equal(intento.estado, 400);
});

test('sin clave del proveedor, el chat lo dice antes de escribir', async () => {
  const { datos: oficina } = await pedir('/api/oficina');
  const creado = await pedir('/api/personajes', {
    method: 'POST',
    cuerpo: { sala_id: oficina.salas[0].id, nombre: 'Gemini', proveedor_ia: 'google', modelo: 'lo-que-sea' },
  });

  const { datos } = await pedir(`/api/personajes/${creado.datos.personaje.id}/conversacion`);
  assert.equal(datos.chat.disponible, false);
  assert.match(datos.chat.motivo, /GOOGLE_AI_API_KEY/);
});

test('detener a media respuesta guarda lo que sí llegó', async () => {
  proveedor.programar({
    tipo: 'ok',
    razonamiento: '',
    texto: ['Primero. ', 'Segundo. ', 'Tercero. ', 'Cuarto.'],
  });

  await conversar(personajeId, 'Cuenta hasta cuatro.', { abortarTras: 1 });

  // El servidor guarda después de que se corte la conexión: hay que esperarlo.
  let ultimo = null;
  for (let intento = 0; intento < 30; intento += 1) {
    const { datos } = await pedir(`/api/personajes/${personajeId}/conversacion`);
    ultimo = datos.mensajes.at(-1);
    if (ultimo?.rol === 'assistant' && ultimo.error) break;
    await new Promise((listo) => setTimeout(listo, 50));
  }

  assert.equal(ultimo.rol, 'assistant');
  assert.match(ultimo.error, /detenida/i);
  assert.ok(ultimo.contenido.length > 0, 'lo que alcanzó a decir no se tira');
  assert.ok(ultimo.contenido.startsWith('Primero.'));
});

test('empezar de cero archiva el hilo y lo deja en el histórico', async () => {
  const antes = await pedir(`/api/personajes/${personajeId}/conversacion`);
  assert.ok(antes.datos.mensajes.length > 0);

  const nueva = await pedir(`/api/personajes/${personajeId}/conversacion/nueva`, { method: 'POST' });
  assert.equal(nueva.estado, 200);
  assert.deepEqual(nueva.datos.mensajes, []);
  assert.notEqual(nueva.datos.conversacion.id, antes.datos.conversacion.id);
  assert.ok(nueva.datos.historico.length >= 1, 'el hilo anterior sigue accesible');
});

test('un hilo archivado se puede volver a leer, pero solo el propio', async () => {
  const { datos } = await pedir(`/api/personajes/${personajeId}/conversacion`);
  const anterior = datos.historico.find((hilo) => hilo.archivada === 1);
  assert.ok(anterior, 'tiene que haber al menos un hilo archivado');

  const leido = await pedir(`/api/personajes/${personajeId}/conversacion/${anterior.id}`);
  assert.equal(leido.estado, 200);
  assert.ok(leido.datos.mensajes.length > 0);

  const ajena = await pedir(`/api/personajes/${personajeId}/conversacion/999999`);
  assert.equal(ajena.estado, 404);
});

test('un mensaje vacío no abre una petición al proveedor', async () => {
  const antes = proveedor.peticiones.length;
  const intento = await conversar(personajeId, '   ');
  assert.equal(intento.estado, 400);
  assert.equal(proveedor.peticiones.length, antes);
});

test('cada usuario tiene su propio hilo con el mismo personaje', async () => {
  const mio = await pedir(`/api/personajes/${personajeId}/conversacion`);
  assert.equal(mio.datos.conversacion.usuario_id, 1);
  // Nadie puede pedir la conversación de otro: el usuario sale de la sesión,
  // nunca de la URL.
  assert.equal(mio.datos.conversacion.personaje_id, personajeId);
});

/**
 * La compresión y el streaming se llevan mal: gzip acumula en su búfer y la
 * respuesta llegaría a golpes en vez de palabra a palabra. El middleware deja
 * fuera `text/event-stream` a propósito, y esto lo vigila.
 */
test('la respuesta del chat no viaja comprimida', async () => {
  proveedor.programar({ tipo: 'ok', texto: ['Uno ', 'dos ', 'tres.'] });

  const respuesta = await fetch(`${BASE}/api/personajes/${personajeId}/mensajes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Peticion-Oficina': '1',
      // Pidiendo gzip explícitamente: sin el filtro, el servidor lo concedería.
      'Accept-Encoding': 'gzip, deflate',
      Cookie: galleta,
    },
    body: JSON.stringify({ texto: 'Cuenta hasta tres' }),
  });

  assert.equal(respuesta.headers.get('content-encoding'), null);
  assert.match(respuesta.headers.get('content-type'), /text\/event-stream/);

  // Y los assets sí se comprimen: es lo que hace que valga la pena tenerlo.
  await respuesta.text();
  const modulo = await fetch(`${BASE}/js/principal.js`, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(modulo.headers.get('content-encoding'), 'gzip');
});
