/** Guardias de acceso reutilizables para las rutas de la API. */
import { errorNoAutenticado, errorProhibido } from '../utilidades/errores.js';

export function requiereSesion(peticion, _respuesta, siguiente) {
  if (!peticion.isAuthenticated?.() || !peticion.user) return siguiente(errorNoAutenticado());
  // Cinturón y tirantes: `deserializeUser` ya corta la sesión de un suspendido,
  // pero esto vale también para cualquier otra forma de poblar `req.user`.
  if (peticion.user.estado === 'suspendido') {
    return siguiente(errorProhibido('Tu acceso a esta oficina está suspendido.'));
  }
  return siguiente();
}

export function requiereAdmin(peticion, _respuesta, siguiente) {
  if (peticion.user?.rol === 'admin') return siguiente();
  return siguiente(errorProhibido('Esta acción es solo para administradores.'));
}
