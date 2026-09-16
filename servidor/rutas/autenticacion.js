/**
 * Rutas de sesión. Un proveedor = un par de rutas; el resto de la app solo conoce
 * `req.user`, así que sumar GitHub o Microsoft más adelante no toca nada más.
 */
import { Router } from 'express';
import { configuracion } from '../configuracion.js';
import { passport, usuarioDemo } from '../autenticacion/passport.js';
import { usuarioPublico } from '../repositorios/usuarios.js';

export const rutasAutenticacion = Router();

/** Estado de la sesión y proveedores disponibles: lo consulta la pantalla de entrada. */
rutasAutenticacion.get('/estado', (peticion, respuesta) => {
  respuesta.json({
    autenticado: Boolean(peticion.user),
    usuario: usuarioPublico(peticion.user),
    proveedores: {
      google: configuracion.google.configurado,
      demo: configuracion.permitirDemo,
    },
  });
});

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
    (peticion, respuesta) => {
      const destino = peticion.session?.destinoTrasLogin;
      if (peticion.session) delete peticion.session.destinoTrasLogin;
      respuesta.redirect(destino && destino.startsWith('/') ? destino : '/');
    },
  );
}

if (configuracion.permitirDemo) {
  rutasAutenticacion.post('/demo', (peticion, respuesta, siguiente) => {
    try {
      const usuario = usuarioDemo();
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
