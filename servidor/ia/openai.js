/**
 * Adaptador de OpenAI.
 * Va por HTTP directo contra /chat/completions en vez de sumar otro SDK: son
 * cuarenta líneas y el backend se mantiene ligero, que es el criterio del proyecto.
 */
import { configuracion } from '../configuracion.js';
import { ErrorHttp } from '../utilidades/errores.js';
import { leerEventos, mensajeDeError } from './sse.js';

export const proveedorOpenai = {
  nombre: 'openai',
  etiqueta: 'GPT',
  configurado: () => Boolean(configuracion.ia.openai.clave),
  modeloPorDefecto: () => configuracion.ia.openai.modeloPorDefecto,
  variableClave: 'OPENAI_API_KEY',

  async *conversar({ sistema, mensajes, modelo, senal }) {
    const { clave, urlBase } = configuracion.ia.openai;

    const respuesta = await fetch(`${urlBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
      signal: senal,
      body: JSON.stringify({
        model: modelo,
        stream: true,
        // Sin esto el último fragmento no trae el recuento de tokens.
        stream_options: { include_usage: true },
        messages: [
          ...(sistema ? [{ role: 'system', content: sistema }] : []),
          ...mensajes.map((mensaje) => ({ role: mensaje.role, content: mensaje.content })),
        ],
      }),
    }).catch((error) => {
      if (error?.name === 'AbortError') throw error;
      throw new ErrorHttp(502, 'No se pudo conectar con OpenAI.');
    });

    if (!respuesta.ok) {
      const detalle = await mensajeDeError(respuesta);
      if (respuesta.status === 401) {
        throw new ErrorHttp(502, 'OpenAI rechazó la clave. Revisa OPENAI_API_KEY en tu .env.');
      }
      if (respuesta.status === 429) {
        throw new ErrorHttp(429, 'OpenAI está limitando las peticiones. Espera unos segundos.');
      }
      throw new ErrorHttp(502, `OpenAI devolvió un error ${respuesta.status}: ${detalle}`);
    }

    let uso = { entrada: null, salida: null, cache: null };
    let motivo = null;

    for await (const crudo of leerEventos(respuesta)) {
      let dato;
      try {
        dato = JSON.parse(crudo);
      } catch {
        continue;
      }

      const eleccion = dato.choices?.[0];
      const trozo = eleccion?.delta?.content;
      if (trozo) yield { tipo: 'texto', texto: trozo };
      if (eleccion?.finish_reason) motivo = eleccion.finish_reason;

      if (dato.usage) {
        uso = {
          entrada: dato.usage.prompt_tokens ?? null,
          salida: dato.usage.completion_tokens ?? null,
          cache: dato.usage.prompt_tokens_details?.cached_tokens ?? null,
        };
      }
    }

    yield { tipo: 'fin', modelo, motivo, detalleParada: null, uso };
  },
};
