/**
 * Cabeceras de seguridad y defensa contra peticiones cruzadas.
 * Escritas a mano (son cuatro líneas) para no sumar otra dependencia al backend.
 */
import { configuracion } from '../configuracion.js';
import { errorProhibido } from '../utilidades/errores.js';

const POLITICA_CONTENIDO = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // Los avatares pueden vivir en cualquier CDN (Google, Gravatar, el que sea).
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

export function cabecerasSeguridad(_peticion, respuesta, siguiente) {
  respuesta.setHeader('Content-Security-Policy', POLITICA_CONTENIDO);
  respuesta.setHeader('X-Content-Type-Options', 'nosniff');
  respuesta.setHeader('Referrer-Policy', 'same-origin');
  respuesta.setHeader('X-Frame-Options', 'DENY');
  respuesta.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (configuracion.esProduccion) {
    respuesta.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  siguiente();
}

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * La cookie ya es SameSite=Lax, lo que corta el CSRF clásico. Esto es la segunda
 * cerradura: toda mutación tiene que venir del propio origen.
 */
export function verificarOrigen(peticion, _respuesta, siguiente) {
  if (METODOS_SEGUROS.has(peticion.method)) return siguiente();

  const origen = peticion.get('origin');
  if (!origen) {
    // Sin `Origin` (algún cliente antiguo o una herramienta) exigimos la cabecera
    // propia que envía nuestro fetch: un formulario cruzado no puede ponerla.
    if (peticion.get('x-peticion-oficina') === '1') return siguiente();
    return siguiente(errorProhibido('Petición sin origen reconocible.'));
  }

  const permitidos = new Set([configuracion.urlBase, `${peticion.protocol}://${peticion.get('host')}`]);
  if (permitidos.has(origen.replace(/\/+$/, ''))) return siguiente();

  return siguiente(errorProhibido('Origen no permitido.'));
}
