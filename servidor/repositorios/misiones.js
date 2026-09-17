/** Acceso a `misiones` y `mision_pasos`. Una misión es una orden ya repartida. */
import { bd, ahora } from '../base-datos/conexion.js';
import { errorNoEncontrado } from '../utilidades/errores.js';

export const ESTADOS = ['repartiendo', 'trabajando', 'resumiendo', 'lista', 'error', 'detenida'];

/** Estados en los que una misión ya no va a moverse sola. */
export const terminada = (estado) => ['lista', 'error', 'detenida'].includes(estado);

export function crear({ usuarioId, salaId = null, orden }) {
  const momento = ahora();
  const { lastInsertRowid } = bd()
    .prepare(
      `INSERT INTO misiones (usuario_id, sala_id, orden, estado, creado_en, actualizado_en)
       VALUES (?, ?, ?, 'repartiendo', ?, ?)`,
    )
    .run(usuarioId, salaId, orden, momento, momento);
  return obtenerPorId(Number(lastInsertRowid));
}

export function obtenerPorId(id) {
  return bd().prepare('SELECT * FROM misiones WHERE id = ?').get(Number(id)) ?? null;
}

/** Una misión solo la ve quien la mandó: es su encargo, no el de la oficina. */
export function exigirPropia(id, usuarioId) {
  const mision = obtenerPorId(id);
  if (!mision || mision.usuario_id !== usuarioId) throw errorNoEncontrado('Esa misión no existe.');
  return mision;
}

export function actualizar(id, cambios) {
  const campos = [];
  const valores = {};
  for (const [clave, valor] of Object.entries(cambios)) {
    campos.push(`${clave} = @${clave}`);
    valores[clave] = valor;
  }
  if (campos.length === 0) return obtenerPorId(id);

  bd()
    .prepare(`UPDATE misiones SET ${campos.join(', ')}, actualizado_en = @momento WHERE id = @id`)
    .run({ ...valores, id: Number(id), momento: ahora() });
  return obtenerPorId(id);
}

export function anadirPaso({ misionId, personajeId, orden, encargo }) {
  const { lastInsertRowid } = bd()
    .prepare(
      `INSERT INTO mision_pasos (mision_id, personaje_id, orden, encargo, estado, creado_en)
       VALUES (?, ?, ?, ?, 'pendiente', ?)`,
    )
    .run(Number(misionId), personajeId, orden, encargo, ahora());
  return Number(lastInsertRowid);
}

export function actualizarPaso(id, cambios) {
  const campos = Object.keys(cambios).map((clave) => `${clave} = @${clave}`);
  if (campos.length === 0) return;
  bd()
    .prepare(`UPDATE mision_pasos SET ${campos.join(', ')} WHERE id = @id`)
    .run({ ...cambios, id: Number(id) });
}

export function pasosDe(misionId) {
  return bd()
    .prepare(
      `SELECT mp.*, p.nombre AS personaje_nombre, p.app AS personaje_app,
              p.especialidad AS personaje_especialidad, p.sala_id AS personaje_sala_id
         FROM mision_pasos mp
         LEFT JOIN personajes p ON p.id = mp.personaje_id
        WHERE mp.mision_id = ?
        ORDER BY mp.orden, mp.id`,
    )
    .all(Number(misionId));
}

/** Misión + pasos, ya en la forma que consume la interfaz. */
export function completa(mision) {
  return { ...mision, pasos: pasosDe(mision.id) };
}

export function historicoDe(usuarioId, limite = 20) {
  return bd()
    .prepare(
      `SELECT m.*, (SELECT COUNT(*) FROM mision_pasos mp WHERE mp.mision_id = m.id) AS total_pasos
         FROM misiones m
        WHERE m.usuario_id = ?
        ORDER BY m.creado_en DESC
        LIMIT ?`,
    )
    .all(usuarioId, limite);
}

export function eliminar(id, usuarioId) {
  const mision = exigirPropia(id, usuarioId);
  bd().prepare('DELETE FROM misiones WHERE id = ?').run(mision.id);
  return mision;
}

/**
 * Una misión que se quedó a medias porque el servidor se reinició no puede
 * seguir: se marca al arrancar para que la interfaz no la enseñe girando para siempre.
 */
export function cerrarHuerfanas() {
  const resultado = bd()
    .prepare(
      `UPDATE misiones SET estado = 'error', error = 'El servidor se reinició a mitad de la misión.',
                           actualizado_en = ?
        WHERE estado IN ('repartiendo', 'trabajando', 'resumiendo')`,
    )
    .run(ahora());
  return resultado.changes;
}
