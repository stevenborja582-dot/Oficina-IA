/** Respuestas de error homogéneas en JSON y para páginas. */
import { ErrorHttp } from '../utilidades/errores.js';
import { configuracion } from '../configuracion.js';

export function rutaNoEncontrada(peticion, respuesta) {
  if (peticion.path.startsWith('/api/') || peticion.accepts(['html', 'json']) === 'json') {
    return respuesta.status(404).json({ error: 'Ese recurso no existe.' });
  }
  return respuesta.status(404).type('text/plain; charset=utf-8').send('No existe.');
}

// Express identifica el manejador de errores por su aridad: los cuatro argumentos
// son obligatorios aunque no se usen todos.
// eslint-disable-next-line no-unused-vars
export function manejadorErrores(error, peticion, respuesta, _siguiente) {
  const estado = error instanceof ErrorHttp ? error.estado : 500;

  if (estado >= 500) {
    console.error('[oficina] error no controlado:', error);
  }

  const cuerpo = {
    error: estado >= 500 && configuracion.esProduccion ? 'Algo se rompió por dentro.' : error.message,
  };
  if (error.detalles) cuerpo.detalles = error.detalles;

  if (peticion.path.startsWith('/api/') || peticion.accepts(['html', 'json']) === 'json') {
    return respuesta.status(estado).json(cuerpo);
  }
  return respuesta.status(estado).type('text/plain; charset=utf-8').send(cuerpo.error);
}
