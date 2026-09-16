/** Error con código HTTP, para que las rutas no tengan que armar respuestas a mano. */
export class ErrorHttp extends Error {
  constructor(estado, mensaje, detalles) {
    super(mensaje);
    this.name = 'ErrorHttp';
    this.estado = estado;
    if (detalles) this.detalles = detalles;
  }
}

export const errorPeticion = (mensaje, detalles) => new ErrorHttp(400, mensaje, detalles);
export const errorNoAutenticado = (mensaje = 'Necesitas iniciar sesión.') => new ErrorHttp(401, mensaje);
export const errorProhibido = (mensaje = 'No tienes permiso para hacer esto.') => new ErrorHttp(403, mensaje);
export const errorNoEncontrado = (mensaje = 'No existe.') => new ErrorHttp(404, mensaje);
export const errorConflicto = (mensaje, detalles) => new ErrorHttp(409, mensaje, detalles);
