/**
 * Adaptador de Google AI (Gemini), también por HTTP directo.
 * La clave viaja en la cabecera x-goog-api-key, no en la URL: así no acaba
 * escrita en los registros de ningún proxy por el medio.
 */
import { configuracion } from '../configuracion.js';
import { ErrorHttp } from '../utilidades/errores.js';
import { leerEventos, mensajeDeError } from './sse.js';

export const proveedorGoogle = {
  nombre: 'google',
  etiqueta: 'Gemini',
  configurado: () => Boolean(configuracion.ia.google.clave),
  modeloPorDefecto: () => configuracion.ia.google.modeloPorDefecto,
  variableClave: 'GOOGLE_AI_API_KEY',

  async *conversar({ sistema, mensajes, modelo, senal }) {
    const { clave, urlBase } = configuracion.ia.google;
    const url = `${urlBase}/models/${encodeURIComponent(modelo)}:streamGenerateContent?alt=sse`;

    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      signal: senal,
      body: JSON.stringify({
        ...(sistema ? { systemInstruction: { parts: [{ text: sistema }] } } : {}),
        contents: mensajes.map((mensaje) => ({
          // Gemini llama "model" a lo que el resto del mundo llama "assistant".
          role: mensaje.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: mensaje.content }],
        })),
        generationConfig: { maxOutputTokens: configuracion.ia.maximoTokens },
      }),
    }).catch((error) => {
      if (error?.name === 'AbortError') throw error;
      throw new ErrorHttp(502, 'No se pudo conectar con Google AI.');
    });

    if (!respuesta.ok) {
      const detalle = await mensajeDeError(respuesta);
      if (respuesta.status === 400 && /API key/i.test(detalle)) {
        throw new ErrorHttp(502, 'Google rechazó la clave. Revisa GOOGLE_AI_API_KEY en tu .env.');
      }
      if (respuesta.status === 429) {
        throw new ErrorHttp(429, 'Google está limitando las peticiones. Espera unos segundos.');
      }
      throw new ErrorHttp(502, `Google devolvió un error ${respuesta.status}: ${detalle}`);
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

      const candidato = dato.candidates?.[0];
      for (const parte of candidato?.content?.parts ?? []) {
        if (parte.text) yield { tipo: 'texto', texto: parte.text };
      }
      if (candidato?.finishReason) motivo = candidato.finishReason;

      if (dato.usageMetadata) {
        uso = {
          entrada: dato.usageMetadata.promptTokenCount ?? null,
          salida: dato.usageMetadata.candidatesTokenCount ?? null,
          cache: dato.usageMetadata.cachedContentTokenCount ?? null,
        };
      }
    }

    yield { tipo: 'fin', modelo, motivo, detalleParada: null, uso };
  },
};
