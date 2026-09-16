/**
 * Configuración de Passport.
 *
 * La app habla con "proveedores" abstractos: hoy Google y, en desarrollo, un login
 * de demo. Añadir GitHub o Microsoft en la Fase 5 es registrar otra estrategia aquí
 * y otra ruta en `rutas/autenticacion.js`; nada más de la app se entera.
 */
import passport from 'passport';
import { Strategy as EstrategiaGoogle } from 'passport-google-oauth20';
import { configuracion } from '../configuracion.js';
import { correoPermitido, obtenerPorId, registrarAcceso, usuarioPublico } from '../repositorios/usuarios.js';

/** En la cookie viaja solo el id: los datos del usuario se releen de SQLite. */
passport.serializeUser((usuario, hecho) => hecho(null, usuario.id));

passport.deserializeUser((id, hecho) => {
  try {
    hecho(null, obtenerPorId(id));
  } catch (error) {
    hecho(error);
  }
});

function perfilGoogleAUsuario(perfil) {
  const email = perfil.emails?.[0]?.value ?? '';
  return {
    proveedorAuth: 'google',
    proveedorId: perfil.id,
    email,
    nombre: perfil.displayName || email.split('@')[0] || 'Sin nombre',
    avatarUrl: perfil.photos?.[0]?.value ?? null,
  };
}

export function configurarPassport() {
  if (!configuracion.google.configurado) return passport;

  passport.use(
    new EstrategiaGoogle(
      {
        clientID: configuracion.google.clientId,
        clientSecret: configuracion.google.clientSecret,
        callbackURL: configuracion.google.callbackUrl,
        scope: ['profile', 'email'],
      },
      (_accessToken, _refreshToken, perfil, hecho) => {
        try {
          const datos = perfilGoogleAUsuario(perfil);
          if (!datos.email) {
            return hecho(null, false, { message: 'Tu cuenta de Google no expone un correo.' });
          }
          if (!correoPermitido(datos.email)) {
            return hecho(null, false, { message: 'Esa cuenta no está en la lista de acceso.' });
          }
          return hecho(null, registrarAcceso(datos));
        } catch (error) {
          return hecho(error);
        }
      },
    ),
  );

  return passport;
}

/** Login de desarrollo, sin Google. Solo se expone si AUTH_PERMITIR_DEMO=true. */
export function usuarioDemo() {
  return registrarAcceso({
    proveedorAuth: 'demo',
    proveedorId: 'demo-local',
    email: configuracion.admins[0] || 'demo@oficina.local',
    nombre: 'Usuario de demo',
    avatarUrl: null,
  });
}

export { passport, usuarioPublico };
