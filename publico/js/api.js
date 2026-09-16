/** Cliente de la API. Un solo sitio donde se decide qué es un error y qué no. */

export class ErrorApi extends Error {
  constructor(mensaje, estado, detalles) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.detalles = detalles;
  }
}

async function pedir(ruta, { metodo = 'GET', cuerpo } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
        // Marca de origen propio: el backend la exige cuando no hay cabecera Origin.
        'X-Peticion-Oficina': '1',
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ErrorApi('No hay conexión con el servidor de la oficina.', 0);
  }

  if (respuesta.status === 401) {
    window.location.assign('/entrar');
    throw new ErrorApi('Sesión caducada.', 401);
  }

  const esJson = respuesta.headers.get('content-type')?.includes('application/json');
  const datos = esJson ? await respuesta.json().catch(() => ({})) : {};

  if (!respuesta.ok) {
    throw new ErrorApi(datos.error || 'La petición no salió bien.', respuesta.status, datos.detalles);
  }
  return datos;
}

export const api = {
  oficina: () => pedir('/api/oficina'),
  yo: () => pedir('/api/yo'),

  sala: (slug) => pedir(`/api/salas/${encodeURIComponent(slug)}`),
  crearSala: (datos) => pedir('/api/salas', { metodo: 'POST', cuerpo: datos }),
  actualizarSala: (id, datos) => pedir(`/api/salas/${id}`, { metodo: 'PATCH', cuerpo: datos }),
  eliminarSala: (id) => pedir(`/api/salas/${id}`, { metodo: 'DELETE' }),

  crearPersonaje: (datos) => pedir('/api/personajes', { metodo: 'POST', cuerpo: datos }),
  actualizarPersonaje: (id, datos) => pedir(`/api/personajes/${id}`, { metodo: 'PATCH', cuerpo: datos }),
  eliminarPersonaje: (id) => pedir(`/api/personajes/${id}`, { metodo: 'DELETE' }),
  restaurarPersonaje: (personaje) => pedir('/api/personajes/restaurar', { metodo: 'POST', cuerpo: { personaje } }),

  salir: () => pedir('/auth/salir', { metodo: 'POST' }),
};
