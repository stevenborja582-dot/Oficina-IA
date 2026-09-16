/** Acceso a la tabla `salas` (los departamentos, convertidos en espacios del plano). */
import { bd, ahora } from '../base-datos/conexion.js';
import { primeraCasillaLibre } from '../base-datos/plano.js';
import { errorConflicto, errorNoEncontrado } from '../utilidades/errores.js';
import {
  ICONOS,
  colorHex,
  generarSlug,
  opcionDeLista,
  slugUnico,
  textoObligatorio,
  textoOpcional,
  LIMITES,
} from '../utilidades/validacion.js';

const SELECCION = `
  SELECT s.*,
         (SELECT COUNT(*) FROM personajes p WHERE p.sala_id = s.id) AS total_personajes
    FROM salas s
`;

export function listar() {
  return bd().prepare(`${SELECCION} ORDER BY s.orden, s.id`).all();
}

export function obtenerPorId(id) {
  return bd().prepare(`${SELECCION} WHERE s.id = ?`).get(id) ?? null;
}

export function obtenerPorSlug(slug) {
  return bd().prepare(`${SELECCION} WHERE s.slug = ?`).get(String(slug)) ?? null;
}

export function exigirPorSlug(slug) {
  const sala = obtenerPorSlug(slug);
  if (!sala) throw errorNoEncontrado('Esa sala no existe en el plano.');
  return sala;
}

export function exigirPorId(id) {
  const sala = obtenerPorId(id);
  if (!sala) throw errorNoEncontrado('Esa sala no existe en el plano.');
  return sala;
}

const existeSlug = (slug) => Boolean(bd().prepare('SELECT 1 FROM salas WHERE slug = ?').get(slug));

/** Normaliza el cuerpo que llega del formulario. */
function camposDesde(cuerpo, { porDefecto = {} } = {}) {
  return {
    nombre: textoObligatorio(cuerpo.nombre ?? porDefecto.nombre, 'nombre', LIMITES.nombre),
    descripcion: textoOpcional(cuerpo.descripcion ?? porDefecto.descripcion, 'descripcion'),
    color_acento: colorHex(cuerpo.color_acento ?? porDefecto.color_acento, 'color_acento', porDefecto.color_acento ?? '#57534E'),
    icono: opcionDeLista(cuerpo.icono ?? porDefecto.icono, 'icono', ICONOS, porDefecto.icono ?? 'oficina'),
  };
}

export function crear(cuerpo) {
  const campos = camposDesde(cuerpo);
  const salas = listar();
  const hueco = primeraCasillaLibre(salas);
  const slug = slugUnico(generarSlug(cuerpo.slug || campos.nombre), existeSlug);
  const orden = salas.reduce((maximo, sala) => Math.max(maximo, sala.orden), -1) + 1;
  const momento = ahora();

  const resultado = bd()
    .prepare(
      `INSERT INTO salas (slug, nombre, descripcion, color_acento, icono, orden,
                          plano_x, plano_y, plano_ancho, plano_alto, creado_en, actualizado_en)
       VALUES (@slug, @nombre, @descripcion, @color_acento, @icono, @orden,
               @plano_x, @plano_y, @plano_ancho, @plano_alto, @momento, @momento)`,
    )
    .run({ ...campos, ...hueco, slug, orden, momento });

  return obtenerPorId(resultado.lastInsertRowid);
}

export function actualizar(id, cuerpo) {
  const actual = exigirPorId(id);
  const campos = camposDesde(cuerpo, { porDefecto: actual });

  bd()
    .prepare(
      `UPDATE salas
          SET nombre = @nombre, descripcion = @descripcion, color_acento = @color_acento,
              icono = @icono, actualizado_en = @momento
        WHERE id = @id`,
    )
    .run({ ...campos, id, momento: ahora() });

  return obtenerPorId(id);
}

/** Solo se puede borrar una sala vacía: nunca arrastramos personajes sin avisar. */
export function eliminar(id) {
  const sala = exigirPorId(id);
  if (sala.total_personajes > 0) {
    throw errorConflicto(
      `"${sala.nombre}" todavía tiene ${sala.total_personajes} personaje(s). Muévelos o bórralos antes de eliminar la sala.`,
      { campo: 'sala' },
    );
  }
  bd().prepare('DELETE FROM salas WHERE id = ?').run(id);
  return sala;
}
