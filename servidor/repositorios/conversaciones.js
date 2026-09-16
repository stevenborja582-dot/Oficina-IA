/** Acceso a `conversaciones` y `mensajes`. Cada usuario tiene su propio hilo con cada personaje. */
import { bd, ahora } from '../base-datos/conexion.js';
import { errorNoEncontrado } from '../utilidades/errores.js';

/** El hilo abierto de este usuario con este personaje. Se crea si aún no existe. */
export function abiertaDe(personajeId, usuarioId) {
  const baseDatos = bd();
  const existente = baseDatos
    .prepare(
      `SELECT * FROM conversaciones
        WHERE personaje_id = ? AND usuario_id = ? AND archivada = 0
        ORDER BY id DESC LIMIT 1`,
    )
    .get(personajeId, usuarioId);

  if (existente) return existente;

  const momento = ahora();
  const resultado = baseDatos
    .prepare(
      `INSERT INTO conversaciones (personaje_id, usuario_id, titulo, archivada, creado_en, actualizado_en)
       VALUES (?, ?, '', 0, ?, ?)`,
    )
    .run(personajeId, usuarioId, momento, momento);

  return obtenerPorId(resultado.lastInsertRowid);
}

export function obtenerPorId(id) {
  return bd().prepare('SELECT * FROM conversaciones WHERE id = ?').get(id) ?? null;
}

export function exigirPropia(id, usuarioId) {
  const conversacion = obtenerPorId(id);
  if (!conversacion || conversacion.usuario_id !== usuarioId) {
    throw errorNoEncontrado('Esa conversación no existe.');
  }
  return conversacion;
}

export function mensajesDe(conversacionId) {
  return bd()
    .prepare('SELECT * FROM mensajes WHERE conversacion_id = ? ORDER BY id')
    .all(conversacionId);
}

export function anadirMensaje({
  conversacionId,
  rol,
  contenido = '',
  razonamiento = null,
  modelo = null,
  proveedorIa = null,
  tokensEntrada = null,
  tokensSalida = null,
  error = null,
}) {
  const momento = ahora();
  const resultado = bd()
    .prepare(
      `INSERT INTO mensajes (conversacion_id, rol, contenido, razonamiento, modelo, proveedor_ia,
                             tokens_entrada, tokens_salida, error, creado_en)
       VALUES (@conversacionId, @rol, @contenido, @razonamiento, @modelo, @proveedorIa,
               @tokensEntrada, @tokensSalida, @error, @momento)`,
    )
    .run({
      conversacionId,
      rol,
      contenido,
      razonamiento,
      modelo,
      proveedorIa,
      tokensEntrada,
      tokensSalida,
      error,
      momento,
    });

  bd()
    .prepare('UPDATE conversaciones SET actualizado_en = ? WHERE id = ?')
    .run(momento, conversacionId);

  return bd().prepare('SELECT * FROM mensajes WHERE id = ?').get(resultado.lastInsertRowid);
}

/** El título es la primera frase que escribió el usuario, recortada. */
export function ponerTituloSiFalta(conversacionId, texto) {
  const conversacion = obtenerPorId(conversacionId);
  if (!conversacion || conversacion.titulo) return conversacion;

  const titulo = String(texto).replace(/\s+/g, ' ').trim().slice(0, 70);
  bd().prepare('UPDATE conversaciones SET titulo = ? WHERE id = ?').run(titulo, conversacionId);
  return obtenerPorId(conversacionId);
}

/** Cierra el hilo actual. El siguiente mensaje abrirá uno nuevo y vacío. */
export function archivar(conversacionId) {
  bd()
    .prepare('UPDATE conversaciones SET archivada = 1, actualizado_en = ? WHERE id = ?')
    .run(ahora(), conversacionId);
}

export function eliminarMensaje(id) {
  bd().prepare('DELETE FROM mensajes WHERE id = ?').run(id);
}

/**
 * El historial tal y como lo espera un modelo.
 *
 * Tres reglas que no son opcionales: los turnos fallidos no se reenvían (pedirle
 * al modelo que continúe desde un error no lleva a ninguna parte), el historial
 * no puede empezar por el asistente, y dos turnos seguidos del mismo rol se
 * funden en uno — Anthropic lo tolera, Gemini no.
 */
export function historialParaModelo(conversacionId, limite) {
  const filas = mensajesDe(conversacionId)
    .filter((mensaje) => mensaje.rol !== 'system')
    .filter((mensaje) => !mensaje.error && mensaje.contenido.trim().length > 0);

  const recientes = limite > 0 ? filas.slice(-limite) : filas;

  const historial = [];
  for (const mensaje of recientes) {
    if (historial.length === 0 && mensaje.rol !== 'user') continue;

    const ultimo = historial[historial.length - 1];
    if (ultimo && ultimo.role === mensaje.rol) {
      ultimo.content += `\n\n${mensaje.contenido}`;
    } else {
      historial.push({ role: mensaje.rol, content: mensaje.contenido });
    }
  }

  return historial;
}

/** Resumen ligero para pintar la lista de hilos anteriores. */
export function historicoDe(personajeId, usuarioId, limite = 20) {
  return bd()
    .prepare(
      `SELECT c.id, c.titulo, c.archivada, c.creado_en, c.actualizado_en,
              (SELECT COUNT(*) FROM mensajes m WHERE m.conversacion_id = c.id) AS total_mensajes
         FROM conversaciones c
        WHERE c.personaje_id = ? AND c.usuario_id = ?
        ORDER BY c.id DESC
        LIMIT ?`,
    )
    .all(personajeId, usuarioId, limite)
    .filter((conversacion) => conversacion.total_mensajes > 0);
}
