/**
 * Oficina Black Hole v2 — servidor.
 *
 * Express hace lo mínimo imprescindible: servir los archivos estáticos de `publico/`,
 * gestionar la sesión y exponer la API sobre SQLite. Ninguna lógica de interfaz
 * vive aquí.
 */
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import compression from 'compression';

import { configuracion, validarConfiguracion } from './configuracion.js';
import { bd } from './base-datos/conexion.js';
import { sembrarSalasSiVacio } from './base-datos/sembrar.js';
import { AlmacenSqlite } from './autenticacion/almacen-sesiones.js';
import { configurarPassport, passport } from './autenticacion/passport.js';
import { cabecerasSeguridad, verificarOrigen } from './middlewares/seguridad.js';
import { manejadorErrores, rutaNoEncontrada } from './middlewares/manejo-errores.js';
import { rutasAutenticacion } from './rutas/autenticacion.js';
import { rutasApi } from './rutas/api.js';
import { cerrarBd } from './base-datos/conexion.js';
import { cerrarTodas } from './mcp/cliente.js';
import { cerrarHuerfanas } from './repositorios/misiones.js';

const VERSION = '2.0.0';

const avisos = validarConfiguracion();

bd();
const siembra = sembrarSalasSiVacio();
// Una misión a medias no sobrevive a un reinicio: se cierra para que la interfaz
// no la enseñe girando para siempre.
const huerfanas = cerrarHuerfanas();

const app = express();
app.disable('x-powered-by');
if (configuracion.esProduccion) app.set('trust proxy', 1);

/**
 * Comprimir el texto que sale: 128 KB de módulos ES se quedan en unos 35.
 *
 * El chat queda fuera a propósito. Un stream SSE comprimido se acumula en el
 * búfer del compresor y llega a golpes en vez de palabra a palabra, que es justo
 * lo que hace que la respuesta se lea mientras se escribe.
 */
app.use(
  compression({
    filter: (peticion, respuesta) => {
      if (respuesta.getHeader('Content-Type')?.toString().includes('text/event-stream')) return false;
      return compression.filter(peticion, respuesta);
    },
  }),
);

app.use(cabecerasSeguridad);
app.use(express.json({ limit: '128kb' }));

app.use(
  session({
    name: 'oficina.sid',
    secret: configuracion.secretoSesion,
    store: new AlmacenSqlite(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: configuracion.esProduccion,
      maxAge: configuracion.diasSesion * 24 * 60 * 60 * 1000,
    },
  }),
);

configurarPassport();
app.use(passport.initialize());
app.use(passport.session());
app.use(verificarOrigen);

/**
 * Sonda de salud para el hosting. Contesta antes que la sesión y sin tocar
 * Passport: si la base de datos responde, la instancia está viva.
 */
app.get('/salud', (_peticion, respuesta) => {
  try {
    bd().prepare('SELECT 1').get();
    respuesta.json({ ok: true, entorno: configuracion.entorno, version: VERSION });
  } catch (error) {
    respuesta.status(503).json({ ok: false, error: error.message });
  }
});

app.use('/auth', rutasAutenticacion);
app.use('/api', rutasApi);

/** La pantalla de entrada es pública; el resto de la app, no. */
app.get(['/entrar', '/entrar.html'], (peticion, respuesta) => {
  if (peticion.user) return respuesta.redirect('/');
  return respuesta.sendFile(path.join(configuracion.rutaPublico, 'entrar.html'));
});

app.get('/', (peticion, respuesta) => {
  if (!peticion.user) {
    if (peticion.session) peticion.session.destinoTrasLogin = peticion.originalUrl;
    return respuesta.redirect('/entrar');
  }
  return respuesta.sendFile(path.join(configuracion.rutaPublico, 'index.html'));
});

app.use(
  express.static(configuracion.rutaPublico, {
    index: false,
    etag: true,
    maxAge: configuracion.esProduccion ? '7d' : 0,
  }),
);

/** Rutas profundas del cliente (#/sala/...) y refrescos: siempre devuelven el shell. */
app.get('*', (peticion, respuesta, siguiente) => {
  if (peticion.path.startsWith('/api/') || peticion.path.startsWith('/auth/')) return siguiente();
  // Un archivo que no existe debe dar 404, no el shell de la aplicación disfrazado.
  if (/\.[a-z0-9]{2,5}$/i.test(peticion.path)) return siguiente();
  if (!peticion.user) {
    if (peticion.session) peticion.session.destinoTrasLogin = peticion.originalUrl;
    return respuesta.redirect('/entrar');
  }
  return respuesta.sendFile(path.join(configuracion.rutaPublico, 'index.html'));
});

app.use(rutaNoEncontrada);
app.use(manejadorErrores);

const servidor = app.listen(configuracion.puerto, () => {
  console.log('');
  console.log(`  ▄ Oficina Black Hole v${VERSION}`);
  console.log(`  ↳ ${configuracion.urlBase}`);
  console.log(`  ↳ base de datos: ${configuracion.rutaBd}`);
  if (siembra.creadas > 0) console.log(`  ↳ salas sembradas: ${siembra.creadas}`);
  if (huerfanas > 0) console.log(`  ↳ misiones cerradas por el reinicio: ${huerfanas}`);
  avisos.forEach((aviso) => console.log(`  ! ${aviso}`));
  console.log('');
});

/**
 * Apagado ordenado. El hosting manda SIGTERM en cada despliegue, así que esto se
 * ejecuta a diario: primero se deja de aceptar conexiones, después se cierran los
 * servidores MCP —son procesos hijos, y sin esto quedarían huérfanos— y por último
 * se cierra SQLite para que el WAL quede consolidado en disco.
 */
let apagando = false;
const apagar = async (senal) => {
  if (apagando) return;
  apagando = true;
  console.log(`\nCerrando (${senal})…`);

  // Si algo se atasca, el hosting nos mataría igual: mejor salir a tiempo.
  const rendicion = setTimeout(() => process.exit(0), 10_000);
  rendicion.unref();

  servidor.close();
  try {
    await cerrarTodas();
  } catch {
    // Un conector que no cierra limpio no debe impedir el apagado.
  }
  cerrarBd();
  process.exit(0);
};
process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));

export { app };
