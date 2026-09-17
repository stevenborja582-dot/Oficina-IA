/**
 * Rutas de sesión. Un proveedor = un par de rutas; el resto de la app solo conoce
 * `req.user`, así que sumar GitHub o Microsoft más adelante no toca nada más.
 */
import { Router } from 'express';
import { configuracion } from '../configuracion.js';
import { passport, usuarioDemo } from '../autenticacion/passport.js';
import { usuarioPublico } from '../repositorios/usuarios.js';
import { errorProhibido } from '../utilidades/errores.js';
import { limitar } from '../middlewares/limite-peticiones.js';

export const rutasAutenticacion = Router();

// Contra la fuerza bruta y contra el ruido: entrar es barato, intentarlo mil
// veces por minuto no debería serlo.
rutasAutenticacion.use(limitar('auth', 40, 60_000));

/** Estado de la sesión y proveedores disponibles: lo consulta la pantalla de entrada. */
rutasAutenticacion.get('/estado', (peticion, respuesta) => {
  respuesta.json({
    autenticado: Boolean(peticion.user),
    usuario: usuarioPublico(peticion.user),
    proveedores: {
      google: configuracion.google.configurado,
      github: configuracion.github.configurado,
      demo: configuracion.permitirDemo,
    },
  });
});

/**
 * Tras un login rechazado, Passport deja el motivo en la sesión. Lo devolvemos
 * para que la pantalla de entrada diga "estás suspendido" en vez de un genérico
 * "algo falló" — y lo consumimos, para que no reaparezca en el siguiente intento.
 */
rutasAutenticacion.get('/motivo', (peticion, respuesta) => {
  const mensajes = peticion.session?.messages ?? [];
  if (peticion.session) peticion.session.messages = [];
  respuesta.json({ motivo: mensajes[mensajes.length - 1] ?? null });
});

/** Adónde volver tras entrar: solo rutas internas, nunca una URL de fuera. */
function tras(peticion, respuesta) {
  const destino = peticion.session?.destinoTrasLogin;
  if (peticion.session) delete peticion.session.destinoTrasLogin;
  respuesta.redirect(destino && destino.startsWith('/') && !destino.startsWith('//') ? destino : '/');
}

if (configuracion.google.configurado) {
  rutasAutenticacion.get(
    '/google',
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      // `state` firmado en la sesión: evita que alguien te empuje un callback ajeno.
      state: true,
      prompt: 'select_account',
    }),
  );

  rutasAutenticacion.get(
    '/google/callback',
    passport.authenticate('google', {
      failureRedirect: '/entrar?error=google',
      failureMessage: true,
    }),
    tras,
  );
}

if (configuracion.github.configurado) {
  rutasAutenticacion.get(
    '/github',
    passport.authenticate('github', { scope: ['read:user', 'user:email'], state: true }),
  );

  rutasAutenticacion.get(
    '/github/callback',
    passport.authenticate('github', {
      failureRedirect: '/entrar?error=github',
      failureMessage: true,
    }),
    tras,
  );
}

if (configuracion.permitirDemo) {
  rutasAutenticacion.post('/demo', (peticion, respuesta, siguiente) => {
    try {
      const usuario = usuarioDemo();
      if (!usuario) return siguiente(errorProhibido('Tu acceso a esta oficina está suspendido.'));
      peticion.logIn(usuario, (error) => {
        if (error) return siguiente(error);
        return respuesta.json({ ok: true, usuario: usuarioPublico(usuario) });
      });
    } catch (error) {
      siguiente(error);
    }
  });
}

rutasAutenticacion.post('/salir', (peticion, respuesta, siguiente) => {
  peticion.logout((error) => {
    if (error) return siguiente(error);
    return peticion.session.destroy((fallo) => {
      if (fallo) return siguiente(fallo);
      respuesta.clearCookie('oficina.sid');
      return respuesta.json({ ok: true });
    });
  });
});
