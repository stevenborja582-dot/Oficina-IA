/**
 * Lector de Server-Sent Events sobre una respuesta de `fetch`.
 * Lo usan los adaptadores que hablan con la API del proveedor por HTTP directo
 * (OpenAI y Google); el de Anthropic no lo necesita porque su SDK ya lo resuelve.
 */

/**
 * Recorre el cuerpo de una respuesta SSE y va soltando el texto de cada `data:`.
 * No interpreta el JSON: eso es cosa de cada adaptador, que sabe su formato.
 */
export async function* leerEventos(respuesta) {
  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  let pendiente = '';

  try {
    while (true) {
      const { done, value } = await lector.read();
      if (done) break;

      pendiente += decodificador.decode(value, { stream: true });

      // Los eventos se separan por una línea en blanco; el resto queda para la
      // siguiente vuelta porque un chunk puede cortar un evento por la mitad.
      const bloques = pendiente.split(/\r?\n\r?\n/);
      pendiente = bloques.pop() ?? '';

      for (const bloque of bloques) {
        const datos = bloque
          .split(/\r?\n/)
          .filter((linea) => linea.startsWith('data:'))
          .map((linea) => linea.slice(5).trim())
          .join('\n');

        if (datos && datos !== '[DONE]') yield datos;
      }
    }
  } finally {
    lector.releaseLock();
  }
}

/** Lee el cuerpo de una respuesta de error y saca el mensaje más útil que encuentre. */
export async function mensajeDeError(respuesta) {
  const crudo = await respuesta.text().catch(() => '');
  try {
    const datos = JSON.parse(crudo);
    return datos?.error?.message ?? datos?.message ?? crudo.slice(0, 300);
  } catch {
    return crudo.slice(0, 300) || `Error HTTP ${respuesta.status}`;
  }
}
