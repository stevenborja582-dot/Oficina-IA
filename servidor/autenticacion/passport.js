/**
 * Configuración de Passport.
 *
 * La app habla con "proveedores" abstractos: Google, GitHub y, en desarrollo, un
 * login de demo. Los tres desembocan en la misma función —`registrarAcceso`— y el
 * resto de la app solo conoce `req.user`. Sumar Microsoft o email/contraseña es
 * escribir `perfilXAUsuario`, registrar la estrategia aquí y añadir el par de rutas
 * en `rutas/autenticacion.js`; nada más se entera.
 */
import passport from 'passport';
import { Strategy as EstrategiaGoogle } from 'passport-google-oauth20';
import { Strategy as EstrategiaGitHub } from 'passport-github2';
import { configuracion } from '../configuracion.js';
import { correoPermitido, obtenerPorId, registrarAcceso, usuarioPublico } from '../repositorios/usuarios.js';

/** En la cookie viaja solo el id: los datos del usuario se releen de SQLite. */
passport.serializeUser((usuario, hecho) => hecho(null, usuario.id));

passport.deserializeUser((id, hecho) => {
  try {
    const usuario = obtenerPorId(id);
    // Suspender a alguien tiene efecto ya: su sesión abierta deja de valer en la
    // siguiente petición, sin esperar a que caduque la cookie.
    if (usuario?.estado === 'suspendido') return hecho(null, false);
    hecho(null, usuario);
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

/**
 * GitHub solo entrega el correo si se pide el scope `user:email`, y aun así el
 * público puede estar vacío: hay que quedarse con el verificado principal.
 */
function perfilGitHubAUsuario(perfil) {
  const correos = perfil.emails ?? [];
  const email = (correos.find((c) => c.primary && c.verified) ?? correos.find((c) => c.verified) ?? correos[0])?.value ?? '';
  return {
    proveedorAuth: 'github',
    proveedorId: perfil.id,
    email,
    nombre: perfil.displayName || perfil.username || email.split('@')[0] || 'Sin nombre',
    avatarUrl: perfil.photos?.[0]?.value ?? null,
  };
}

/**
 * El mismo portero para todos los proveedores: sin correo no hay usuario, fuera
 * de la lista de acceso no se entra, y quien está suspendido no vuelve.
 */
function admitir(datos, hecho) {
  try {
    if (!datos.email) {
      return hecho(null, false, { message: 'Ese proveedor no nos dio ningún correo verificado.' });
    }
    if (!correoPermitido(datos.email)) {
      return hecho(null, false, { message: 'Esa cuenta no está en la lista de acceso.' });
    }

    const resultado = registrarAcceso(datos);
    if (resultado?.suspendido) {
      return hecho(null, false, { message: 'Tu acceso a esta oficina está suspendido.' });
    }
    return hecho(null, resultado);
  } catch (error) {
    return hecho(error);
  }
}

export function configurarPassport() {
  if (configuracion.google.configurado) {
    passport.use(
      new EstrategiaGoogle(
        {
          clientID: configuracion.google.clientId,
          clientSecret: configuracion.google.clientSecret,
          callbackURL: configuracion.google.callbackUrl,
          scope: ['profile', 'email'],
        },
        (_accessToken, _refreshToken, perfil, hecho) => admitir(perfilGoogleAUsuario(perfil), hecho),
      ),
    );
  }

  if (configuracion.github.configurado) {
    passport.use(
      new EstrategiaGitHub(
        {
          clientID: configuracion.github.clientId,
          clientSecret: configuracion.github.clientSecret,
          callbackURL: configuracion.github.callbackUrl,
          scope: ['read:user', 'user:email'],
        },
        (_accessToken, _refreshToken, perfil, hecho) => admitir(perfilGitHubAUsuario(perfil), hecho),
      ),
    );
  }

  return passport;
}

/** Login de desarrollo, sin proveedor externo. Solo se expone si AUTH_PERMITIR_DEMO=true. */
export function usuarioDemo() {
  const resultado = registrarAcceso({
    proveedorAuth: 'demo',
    proveedorId: 'demo-local',
    email: configuracion.admins[0] || 'demo@oficina.local',
    nombre: 'Usuario de demo',
    avatarUrl: null,
  });
  return resultado?.suspendido ? null : resultado;
}

export { passport, usuarioPublico };
