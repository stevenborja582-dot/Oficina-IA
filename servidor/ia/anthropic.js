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

  async *conversar({ sistema, mensajes, modelo, senal }) {
    let flujo;
    try {
      flujo = obtenerCliente().messages.stream(
        {
          model: modelo,
          max_tokens: configuracion.ia.maximoTokens,
          // La persona del personaje es el system prompt. Va aparte de los mensajes
          // para que el modelo no la confunda con algo que dijo el usuario.
          ...(sistema ? { system: sistema } : {}),
          messages: mensajes,
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
      yield {
        tipo: 'fin',
        modelo: final.model,
        motivo: final.stop_reason,
        // `stop_details` solo viene cuando el modelo declina responder.
        detalleParada: final.stop_reason === 'refusal' ? (final.stop_details ?? null) : null,
        uso: {
          entrada: final.usage?.input_tokens ?? null,
          salida: final.usage?.output_tokens ?? null,
          cache: final.usage?.cache_read_input_tokens ?? null,
        },
      };
    } catch (error) {
      if (esAborto(error)) return;
      throw traducirError(error);
    }
  },
};
