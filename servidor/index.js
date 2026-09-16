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

import { configuracion, validarConfiguracion } from './configuracion.js';
import { bd } from './base-datos/conexion.js';
import { sembrarSalasSiVacio } from './base-datos/sembrar.js';
import { AlmacenSqlite } from './autenticacion/almacen-sesiones.js';
import { configurarPassport, passport } from './autenticacion/passport.js';
import { cabecerasSeguridad, verificarOrigen } from './middlewares/seguridad.js';
import { manejadorErrores, rutaNoEncontrada } from './middlewares/manejo-errores.js';
import { rutasAutenticacion } from './rutas/autenticacion.js';
import { rutasApi } from './rutas/api.js';

const avisos = validarConfiguracion();

bd();
const siembra = sembrarSalasSiVacio();

const app = express();
app.disable('x-powered-by');
if (configuracion.esProduccion) app.set('trust proxy', 1);

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

app.get('/salud', (_peticion, respuesta) => {
  respuesta.json({ ok: true, entorno: configuracion.entorno, version: '2.0.0-fase1' });
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
  console.log('  ▄ Oficina Black Hole v2 — Fase 1');
  console.log(`  ↳ ${configuracion.urlBase}`);
  console.log(`  ↳ base de datos: ${configuracion.rutaBd}`);
  if (siembra.creadas > 0) console.log(`  ↳ salas sembradas: ${siembra.creadas}`);
  avisos.forEach((aviso) => console.log(`  ! ${aviso}`));
  console.log('');
});

const apagar = (senal) => {
  console.log(`\nCerrando (${senal})…`);
  servidor.close(() => process.exit(0));
};
process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));

export { app };
