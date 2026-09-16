/** Guardias de acceso reutilizables para las rutas de la API. */
import { errorNoAutenticado, errorProhibido } from '../utilidades/errores.js';

export function requiereSesion(peticion, _respuesta, siguiente) {
  if (peticion.isAuthenticated?.() && peticion.user) return siguiente();
  return siguiente(errorNoAutenticado());
}

export function requiereAdmin(peticion, _respuesta, siguiente) {
  if (peticion.user?.rol === 'admin') return siguiente();
  return siguiente(errorProhibido('Esta acción es solo para administradores.'));
}
