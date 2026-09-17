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

  // — Conectores MCP (Fase 4) ————————————————————————————————————
  conectores: () => pedir('/api/conectores'),
  crearConector: (datos) => pedir('/api/conectores', { metodo: 'POST', cuerpo: datos }),
  actualizarConector: (id, datos) => pedir(`/api/conectores/${id}`, { metodo: 'PATCH', cuerpo: datos }),
  eliminarConector: (id) => pedir(`/api/conectores/${id}`, { metodo: 'DELETE' }),
  probarConector: (id) => pedir(`/api/conectores/${id}/probar`, { metodo: 'POST' }),
  conectoresDe: (personajeId) => pedir(`/api/personajes/${personajeId}/conectores`),
  asignarConectores: (personajeId, lista) =>
    pedir(`/api/personajes/${personajeId}/conectores`, { metodo: 'PUT', cuerpo: { conectores: lista } }),

  // — Skills (Fase 3) ————————————————————————————————————————————
  skills: () => pedir('/api/skills'),
  skill: (id) => pedir(`/api/skills/${id}`),
  crearSkill: (datos) => pedir('/api/skills', { metodo: 'POST', cuerpo: datos }),
  actualizarSkill: (id, datos) => pedir(`/api/skills/${id}`, { metodo: 'PATCH', cuerpo: datos }),
  eliminarSkill: (id) => pedir(`/api/skills/${id}`, { metodo: 'DELETE' }),
  restaurarSkill: (skill) => pedir('/api/skills/restaurar', { metodo: 'POST', cuerpo: { skill } }),
  skillsDe: (personajeId) => pedir(`/api/personajes/${personajeId}/skills`),
  asignarSkills: (personajeId, ids) =>
    pedir(`/api/personajes/${personajeId}/skills`, { metodo: 'PUT', cuerpo: { skills: ids } }),

  // — Equipo (Fase 5) ————————————————————————————————————————————
  equipo: () => pedir('/api/equipo'),
  cambiarUsuario: (id, cambios) => pedir(`/api/equipo/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
  eliminarUsuario: (id) => pedir(`/api/equipo/${id}`, { metodo: 'DELETE' }),
  invitar: (datos) => pedir('/api/equipo/invitaciones', { metodo: 'POST', cuerpo: datos }),
  revocarInvitacion: (id) => pedir(`/api/equipo/invitaciones/${id}`, { metodo: 'DELETE' }),

  // — Chat (Fase 2) ——————————————————————————————————————————————
  conversacion: (personajeId) => pedir(`/api/personajes/${personajeId}/conversacion`),
  conversacionArchivada: (personajeId, conversacionId) =>
    pedir(`/api/personajes/${personajeId}/conversacion/${conversacionId}`),
  nuevaConversacion: (personajeId) =>
    pedir(`/api/personajes/${personajeId}/conversacion/nueva`, { metodo: 'POST' }),
  borrarMensaje: (personajeId, mensajeId) =>
    pedir(`/api/personajes/${personajeId}/mensajes/${mensajeId}`, { metodo: 'DELETE' }),
};

/**
 * Manda un mensaje y va devolviendo la respuesta a trozos, según llega.
 * Es un generador para que quien lo use escriba un `for await` normal en vez de
 * enredarse con callbacks.
 */
export async function* flujoMensaje(personajeId, texto, senal) {
  let respuesta;
  try {
    respuesta = await fetch(`/api/personajes/${personajeId}/mensajes`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        'X-Peticion-Oficina': '1',
      },
      body: JSON.stringify({ texto }),
      credentials: 'same-origin',
      signal: senal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') return;
    throw new ErrorApi('No hay conexión con el servidor de la oficina.', 0);
  }

  if (respuesta.status === 401) {
    window.location.assign('/entrar');
    throw new ErrorApi('Sesión caducada.', 401);
  }

  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => ({}));
    throw new ErrorApi(datos.error || 'No se pudo enviar el mensaje.', respuesta.status, datos.detalles);
  }

  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  let pendiente = '';

  try {
    while (true) {
      const { done, value } = await lector.read();
      if (done) break;

      pendiente += decodificador.decode(value, { stream: true });
      const bloques = pendiente.split('\n\n');
      // El último trozo puede estar cortado por la mitad: espera a la vuelta siguiente.
      pendiente = bloques.pop() ?? '';

      for (const bloque of bloques) {
        const linea = bloque.split('\n').find((entrada) => entrada.startsWith('data: '));
        if (!linea) continue;
        try {
          yield JSON.parse(linea.slice(6));
        } catch {
          // Un evento ilegible no debe tumbar el hilo entero.
        }
      }
    }
  } catch (error) {
    if (error?.name !== 'AbortError') throw error;
  } finally {
    lector.releaseLock();
  }
}
