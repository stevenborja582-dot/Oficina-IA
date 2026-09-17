/**
 * Limitador de peticiones, escrito a mano.
 *
 * Es una ventana deslizante en memoria: suficiente para una oficina pequeña y
 * coherente con el resto del backend, que no añade dependencias por comodidad.
 * Dos avisos honestos sobre sus límites:
 *
 * - Vive en el proceso. Con varias instancias detrás de un balanceador, cada una
 *   cuenta por su cuenta; para eso haría falta Redis, y esto no lo justifica.
 * - Cuenta por IP para quien no ha entrado y por usuario para quien sí. Así, una
 *   oficina entera detrás de un mismo router no se penaliza a sí misma.
 */
import { configuracion } from '../configuracion.js';
import { ErrorHttp } from '../utilidades/errores.js';

const registros = new Map();
let ultimaLimpieza = Date.now();

function limpiar(ahora) {
  if (ahora - ultimaLimpieza < 60_000) return;
  ultimaLimpieza = ahora;
  for (const [clave, marcas] of registros) {
    if (marcas.length === 0 || ahora - marcas[marcas.length - 1] > 600_000) registros.delete(clave);
  }
}

/**
 * @param {string} nombre     etiqueta del cubo, para que dos límites no se pisen
 * @param {number} maximo     peticiones permitidas dentro de la ventana
 * @param {number} ventanaMs  tamaño de la ventana
 */
export function limitar(nombre, maximo, ventanaMs) {
  return function limite(peticion, respuesta, siguiente) {
    // En desarrollo estorba más de lo que protege, y las pruebas hacen ráfagas.
    if (!configuracion.esProduccion) return siguiente();

    const ahora = Date.now();
    limpiar(ahora);

    const quien = peticion.user?.id ? `u${peticion.user.id}` : `ip${peticion.ip}`;
    const clave = `${nombre}:${quien}`;
    const marcas = (registros.get(clave) ?? []).filter((marca) => ahora - marca < ventanaMs);

    if (marcas.length >= maximo) {
      const esperaMs = ventanaMs - (ahora - marcas[0]);
      respuesta.setHeader('Retry-After', Math.ceil(esperaMs / 1000));
      return siguiente(
        new ErrorHttp(429, 'Demasiadas peticiones seguidas. Espera unos segundos y vuelve a intentarlo.'),
      );
    }

    marcas.push(ahora);
    registros.set(clave, marcas);
    return siguiente();
  };
}

/** Solo para las pruebas: deja los contadores a cero. */
export const reiniciarLimites = () => registros.clear();
