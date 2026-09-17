/**
 * Adaptador de Anthropic — el proveedor por defecto de la oficina.
 * Usa el SDK oficial (`@anthropic-ai/sdk`) y responde siempre en streaming, que es
 * lo que hace que el chat se sienta vivo y evita los tiempos de espera del HTTP.
 */
import Anthropic from '@anthropic-ai/sdk';
import { configuracion } from '../configuracion.js';
import { ErrorHttp } from '../utilidades/errores.js';

let cliente = null;

function obtenerCliente() {
  if (!cliente) {
    const { clave, urlBase } = configuracion.ia.anthropic;
    cliente = new Anthropic({ apiKey: clave, ...(urlBase ? { baseURL: urlBase } : {}) });
  }
  return cliente;
}

/**
 * ¿Esto es una cancelación nuestra? El SDK no lanza un AbortError pelado: envuelve
 * el corte en su propio APIUserAbortError, y confundirlo con un fallo del proveedor
 * hace que "Detener" se registre en el hilo como si algo se hubiera roto.
 */
function esAborto(error) {
  return error instanceof Anthropic.APIUserAbortError || error?.name === 'AbortError';
}

/** Convierte un fallo del SDK en algo que se pueda leer en pantalla. */
function traducirError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return new ErrorHttp(502, 'Anthropic rechazó la clave. Revisa ANTHROPIC_API_KEY en tu .env.');
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new ErrorHttp(400, 'Ese modelo no existe o tu cuenta no tiene acceso. Revisa el campo "Modelo" del personaje.');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ErrorHttp(429, 'Anthropic está limitando las peticiones. Espera unos segundos y vuelve a intentarlo.');
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new ErrorHttp(400, `Anthropic rechazó la petición: ${error.message}`);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ErrorHttp(502, 'No se pudo conectar con Anthropic. ¿Hay internet?');
  }
  if (error instanceof Anthropic.APIError) {
    return new ErrorHttp(502, `Anthropic devolvió un error ${error.status ?? 'sin código'}: ${error.message}`);
  }
  return error;
}

export const proveedorAnthropic = {
  nombre: 'anthropic',
  etiqueta: 'Claude',
  configurado: () => Boolean(configuracion.ia.anthropic.clave),
  modeloPorDefecto: () => configuracion.ia.anthropic.modeloPorDefecto,
  variableClave: 'ANTHROPIC_API_KEY',
  // De momento el bucle de herramientas solo está escrito para Anthropic.
  admiteHerramientas: true,

  async *conversar({ sistema, mensajes, modelo, senal, herramientas = [], ejecutar = null, describir = null }) {
    const cliente = obtenerCliente();
    const turnos = mensajes.map((mensaje) => ({ role: mensaje.role, content: mensaje.content }));
    const uso = { entrada: 0, salida: 0, cache: 0 };
    const usadas = [];

    try {
      for (let vuelta = 0; vuelta < configuracion.mcp.maximoVueltas; vuelta += 1) {
        const flujo = cliente.messages.stream(
          {
            model: modelo,
            max_tokens: configuracion.ia.maximoTokens,
            // La persona del personaje es el system prompt. Va aparte de los mensajes
            // para que el modelo no la confunda con algo que dijo el usuario.
            ...(sistema ? { system: sistema } : {}),
            messages: turnos,
            ...(herramientas.length > 0 ? { tools: herramientas } : {}),
            // El razonamiento se pide resumido a propósito: sin esto el chat se queda
            // callado mientras el modelo piensa y parece colgado.
            thinking: { type: 'adaptive', display: 'summarized' },
            // Cachea el prefijo de la conversación: en un hilo largo, cada turno
            // reenvía todo el historial y esto es lo que evita pagarlo entero.
            cache_control: { type: 'ephemeral' },
          },
          { signal: senal },
        );

        for await (const evento of flujo) {
          if (evento.type !== 'content_block_delta') continue;
          if (evento.delta.type === 'text_delta') {
            yield { tipo: 'texto', texto: evento.delta.text };
          } else if (evento.delta.type === 'thinking_delta') {
            yield { tipo: 'razonamiento', texto: evento.delta.thinking };
          }
        }

        const final = await flujo.finalMessage();
        uso.entrada += final.usage?.input_tokens ?? 0;
        uso.salida += final.usage?.output_tokens ?? 0;
        uso.cache += final.usage?.cache_read_input_tokens ?? 0;

        // Una herramienta del servidor se quedó a medias: se reenvía el turno tal cual.
        if (final.stop_reason === 'pause_turn') {
          turnos.push({ role: 'assistant', content: final.content });
          continue;
        }

        if (final.stop_reason !== 'tool_use') {
          yield {
            tipo: 'fin',
            modelo: final.model,
            motivo: final.stop_reason,
            detalleParada: final.stop_reason === 'refusal' ? (final.stop_details ?? null) : null,
            uso,
            usadas,
          };
          return;
        }

        // El turno del asistente vuelve entero, con sus bloques de pensamiento:
        // recortarlo rompe la continuidad del razonamiento del modelo.
        turnos.push({ role: 'assistant', content: final.content });

        const llamadas = final.content.filter((bloque) => bloque.type === 'tool_use');
        const resultados = [];

        for (const llamada of llamadas) {
          const etiqueta = describir ? describir(llamada.name) : llamada.name;
          yield { tipo: 'herramienta', id: llamada.id, nombre: llamada.name, etiqueta, entrada: llamada.input };

          const resultado = ejecutar
            ? await ejecutar(llamada.name, llamada.input)
            : { texto: 'Este personaje no tiene conectores activos.', esError: true };

          usadas.push({ nombre: llamada.name, etiqueta, ok: !resultado.esError });
          yield { tipo: 'resultado', id: llamada.id, etiqueta, ok: !resultado.esError, resumen: resumir(resultado.texto) };

          resultados.push({
            type: 'tool_result',
            tool_use_id: llamada.id,
            content: resultado.texto,
            ...(resultado.esError ? { is_error: true } : {}),
          });
        }

        // Todos los resultados en un solo turno de usuario: repartirlos en varios
        // le enseña al modelo a dejar de pedir herramientas en paralelo.
        turnos.push({ role: 'user', content: resultados });
      }

      yield {
        tipo: 'fin',
        modelo,
        motivo: 'max_vueltas',
        detalleParada: null,
        uso,
        usadas,
      };
    } catch (error) {
      if (esAborto(error)) return;
      throw traducirError(error);
    }
  },
};

/** Una línea del resultado, para enseñarla en el hilo sin volcarlo entero. */
function resumir(texto) {
  const limpio = String(texto ?? '').replace(/\s+/g, ' ').trim();
  return limpio.length > 140 ? limpio.slice(0, 139) + '…' : limpio;
}
