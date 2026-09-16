/**
 * Registro de proveedores de IA.
 *
 * Todos exponen la misma forma: un generador `conversar()` que va soltando trozos
 * de texto. El resto del backend no sabe —ni le importa— con quién está hablando.
 */
import { ErrorHttp, errorPeticion } from '../utilidades/errores.js';
import { proveedorAnthropic } from './anthropic.js';
import { proveedorOpenai } from './openai.js';
import { proveedorGoogle } from './google.js';

const PROVEEDORES = {
  anthropic: proveedorAnthropic,
  openai: proveedorOpenai,
  google: proveedorGoogle,
};

/** Lo que la interfaz necesita saber para avisar antes de que alguien escriba. */
export function estadoProveedores() {
  return Object.fromEntries(
    Object.entries(PROVEEDORES).map(([nombre, proveedor]) => [
      nombre,
      {
        etiqueta: proveedor.etiqueta,
        configurado: proveedor.configurado(),
        modeloPorDefecto: proveedor.modeloPorDefecto() || null,
        variableClave: proveedor.variableClave,
      },
    ]),
  );
}

/** ¿Este personaje puede mantener una conversación de verdad? */
export function motivoSinChat(personaje) {
  if (personaje.proveedor_ia === 'externo') {
    return 'Este personaje es una aplicación externa: se abre con su enlace, no tiene chat propio.';
  }

  const proveedor = PROVEEDORES[personaje.proveedor_ia];
  if (!proveedor) return `El proveedor "${personaje.proveedor_ia}" no está soportado.`;

  if (!proveedor.configurado()) {
    return `Falta ${proveedor.variableClave} en tu .env para que ${proveedor.etiqueta} pueda responder.`;
  }

  if (!personaje.modelo && !proveedor.modeloPorDefecto()) {
    return `Indica el modelo de ${proveedor.etiqueta} en la ficha de este personaje.`;
  }

  return null;
}

/** Añade a un personaje si puede chatear y, si no, por qué. Lo consume la interfaz. */
export function conEstadoChat(personaje) {
  const motivo = motivoSinChat(personaje);
  return { ...personaje, chat_disponible: !motivo, chat_motivo: motivo };
}

/** Devuelve el adaptador y el modelo con el que va a hablar este personaje. */
export function resolverProveedor(personaje) {
  const motivo = motivoSinChat(personaje);
  if (motivo) {
    // 400 si es cosa de la ficha, 503 si lo que falta es configuración del servidor.
    const esConfiguracion = motivo.startsWith('Falta ');
    throw esConfiguracion ? new ErrorHttp(503, motivo) : errorPeticion(motivo, { campo: 'proveedor_ia' });
  }

  const adaptador = PROVEEDORES[personaje.proveedor_ia];
  return {
    adaptador,
    modelo: personaje.modelo || adaptador.modeloPorDefecto(),
  };
}
