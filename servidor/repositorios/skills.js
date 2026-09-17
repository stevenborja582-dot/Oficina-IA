/**
 * Acceso a la tabla `skills` y a su asignación por personaje.
 *
 * Una skill es un comportamiento empaquetado: se escribe una vez y se le presta
 * a los personajes que lo necesiten. El archivo se guarda entero en `fuente`,
 * con su frontmatter, porque es lo que se edita y lo que se descarga; los campos
 * sueltos son esa cabecera ya analizada, para listar y buscar sin releer el
 * Markdown en cada petición.
 */
import { bd, ahora } from '../base-datos/conexion.js';
import { errorPeticion } from '../utilidades/errores.js';
import { analizar, componer } from '../utilidades/frontmatter.js';
import {
  LIMITES,
  generarSlug,
  slugUnico,
  textoObligatorio,
  textoOpcional,
} from '../utilidades/validacion.js';

export const LIMITE_FUENTE = 40000;
export const MAXIMO_ETIQUETAS = 8;

const analizarJson = (crudo, porDefecto) => {
  try {
    return JSON.parse(crudo) ?? porDefecto;
  } catch {
    return porDefecto;
  }
};

function hidratar(fila) {
  if (!fila) return null;
  return {
    ...fila,
    etiquetas: analizarJson(fila.etiquetas, []),
    activa: Boolean(fila.activa),
  };
}

/**
 * Lo que se le ofrece al modelo como índice: quién es la skill y cuándo sacarla.
 * El cuerpo no entra aquí — para eso está `abrir`.
 */
export const resumen = (skill) => ({
  slug: skill.slug,
  nombre: skill.nombre,
  descripcion: skill.descripcion,
  cuando_usarla: skill.cuando_usarla,
  etiquetas: skill.etiquetas,
});

/* ── Lectura ─────────────────────────────────────────────────────────────── */

export function listar() {
  return bd().prepare('SELECT * FROM skills ORDER BY nombre COLLATE NOCASE').all().map(hidratar);
}

export function obtenerPorId(id) {
  return hidratar(bd().prepare('SELECT * FROM skills WHERE id = ?').get(Number(id)));
}

export function obtenerPorSlug(slug) {
  return hidratar(bd().prepare('SELECT * FROM skills WHERE slug = ?').get(String(slug)));
}

export function exigirPorId(id) {
  const skill = obtenerPorId(id);
  if (!skill) {
    throw errorPeticion('Esa skill no existe.', { campo: 'skill' });
  }
  return skill;
}

/** Cuántos personajes la llevan puesta: la interfaz lo dice antes de borrar. */
export function usosDe(skillId) {
  return bd()
    .prepare('SELECT COUNT(*) AS total FROM personaje_skills WHERE skill_id = ?')
    .get(Number(skillId)).total;
}

/* ── Escritura ───────────────────────────────────────────────────────────── */

const existeSlug = (slug, exceptoId = null) =>
  Boolean(bd().prepare('SELECT 1 FROM skills WHERE slug = ? AND id IS NOT ?').get(slug, exceptoId));

/**
 * Las etiquetas llegan de tres formas —lista, "a, b" o una sola— y salen siempre
 * como lista normalizada. Que quien escribe la skill no tenga que acertar la sintaxis.
 */
function normalizarEtiquetas(valor) {
  const lista = Array.isArray(valor) ? valor : String(valor ?? '').split(',');
  const limpias = [...new Set(
    lista.map((entrada) => String(entrada).trim().toLowerCase()).filter(Boolean),
  )];

  if (limpias.length > MAXIMO_ETIQUETAS) {
    throw errorPeticion(`Una skill no puede llevar más de ${MAXIMO_ETIQUETAS} etiquetas.`, { campo: 'fuente' });
  }
  for (const etiqueta of limpias) {
    if (etiqueta.length > 30) {
      throw errorPeticion(`La etiqueta "${etiqueta.slice(0, 20)}…" es demasiado larga.`, { campo: 'fuente' });
    }
  }
  return limpias;
}

/**
 * Texto de la skill → campos listos para guardar.
 *
 * El nombre puede venir del frontmatter o del formulario; si no viene de
 * ninguno, se rescata del primer encabezado del cuerpo antes de darse por vencido.
 */
export function camposDesde(fuenteCruda, { nombreDeRespaldo = '' } = {}) {
  const fuente = String(fuenteCruda ?? '').replace(/\r\n/g, '\n');

  if (!fuente.trim()) {
    throw errorPeticion('La skill está vacía: escribe al menos sus instrucciones.', { campo: 'fuente' });
  }
  if (fuente.length > LIMITE_FUENTE) {
    throw errorPeticion(
      `La skill no puede superar ${LIMITE_FUENTE.toLocaleString('es')} caracteres. ` +
        'Si es más larga, pártela en varias.',
      { campo: 'fuente' },
    );
  }

  const { cabecera, cuerpo } = analizar(fuente);
  const primerTitulo = /^#{1,3}\s+(.+)$/m.exec(cuerpo)?.[1]?.trim() ?? '';
  const nombre = textoObligatorio(
    cabecera.nombre || nombreDeRespaldo || primerTitulo,
    'nombre',
    LIMITES.nombre,
  );

  if (!cuerpo.trim()) {
    throw errorPeticion('La skill no tiene instrucciones debajo del frontmatter.', { campo: 'fuente' });
  }

  return {
    nombre,
    descripcion: textoOpcional(cabecera.descripcion, 'descripcion', LIMITES.descripcion),
    cuando_usarla: textoOpcional(cabecera.cuando_usarla || cabecera.cuando, 'cuando_usarla', LIMITES.descripcion),
    etiquetas: JSON.stringify(normalizarEtiquetas(cabecera.etiquetas)),
    // Se guarda normalizada: con su cabecera al día aunque el nombre viniera del
    // formulario, para que lo que se descarga sea lo que de verdad hay guardado.
    fuente: componer(
      {
        nombre,
        descripcion: cabecera.descripcion ?? '',
        'cuando-usarla': cabecera.cuando_usarla ?? cabecera.cuando ?? '',
        etiquetas: normalizarEtiquetas(cabecera.etiquetas),
      },
      cuerpo,
    ),
    cuerpo,
  };
}

export function crear(cuerpoPeticion) {
  const campos = camposDesde(cuerpoPeticion.fuente, { nombreDeRespaldo: cuerpoPeticion.nombre });
  const slug = slugUnico(generarSlug(cuerpoPeticion.slug || campos.nombre), (candidato) => existeSlug(candidato));
  const momento = ahora();

  const resultado = bd()
    .prepare(
      `INSERT INTO skills (slug, nombre, descripcion, cuando_usarla, etiquetas, fuente, cuerpo,
                           activa, creado_en, actualizado_en)
       VALUES (@slug, @nombre, @descripcion, @cuando_usarla, @etiquetas, @fuente, @cuerpo,
               @activa, @momento, @momento)`,
    )
    .run({ ...campos, slug, momento, activa: cuerpoPeticion.activa === false ? 0 : 1 });

  return obtenerPorId(resultado.lastInsertRowid);
}

export function actualizar(id, cuerpoPeticion) {
  const actual = exigirPorId(id);

  // Cambiar solo el interruptor de activa no debería obligar a reenviar el archivo.
  if (cuerpoPeticion.fuente === undefined && cuerpoPeticion.activa !== undefined) {
    bd()
      .prepare('UPDATE skills SET activa = ?, actualizado_en = ? WHERE id = ?')
      .run(cuerpoPeticion.activa ? 1 : 0, ahora(), actual.id);
    return obtenerPorId(actual.id);
  }

  const campos = camposDesde(cuerpoPeticion.fuente ?? actual.fuente, { nombreDeRespaldo: actual.nombre });

  bd()
    .prepare(
      `UPDATE skills
          SET nombre = @nombre, descripcion = @descripcion, cuando_usarla = @cuando_usarla,
              etiquetas = @etiquetas, fuente = @fuente, cuerpo = @cuerpo, activa = @activa,
              actualizado_en = @momento
        WHERE id = @id`,
    )
    .run({
      ...campos,
      id: actual.id,
      momento: ahora(),
      activa: cuerpoPeticion.activa === undefined ? (actual.activa ? 1 : 0) : (cuerpoPeticion.activa ? 1 : 0),
    });

  return obtenerPorId(actual.id);
}

/**
 * Borrar una skill se lleva sus asignaciones por `ON DELETE CASCADE`. A
 * diferencia de un conector, aquí no se niega: una skill es texto, no una
 * conexión viva, y quien la borra ya ve en la tarjeta a cuántos afecta.
 */
export function eliminar(id) {
  const skill = exigirPorId(id);
  bd().prepare('DELETE FROM skills WHERE id = ?').run(skill.id);
  return skill;
}

/** Vuelve a meter una skill borrada con su id original, si sigue libre. */
export function restaurar(skill) {
  const campos = camposDesde(skill.fuente, { nombreDeRespaldo: skill.nombre });
  const libre = !obtenerPorId(skill.id);
  const slug = existeSlug(skill.slug) ? slugUnico(`${skill.slug}-2`, (c) => existeSlug(c)) : skill.slug;
  const momento = ahora();

  const resultado = bd()
    .prepare(
      `INSERT INTO skills (id, slug, nombre, descripcion, cuando_usarla, etiquetas, fuente, cuerpo,
                           activa, creado_en, actualizado_en)
       VALUES (@id, @slug, @nombre, @descripcion, @cuando_usarla, @etiquetas, @fuente, @cuerpo,
               @activa, @creado_en, @momento)`,
    )
    .run({
      ...campos,
      id: libre ? skill.id : null,
      slug,
      activa: skill.activa === false ? 0 : 1,
      creado_en: skill.creado_en ?? momento,
      momento,
    });

  return obtenerPorId(libre ? skill.id : resultado.lastInsertRowid);
}

/* ── Asignación por personaje ────────────────────────────────────────────── */

export function dePersonaje(personajeId) {
  return bd()
    .prepare(
      `SELECT s.*
         FROM personaje_skills ps
         JOIN skills s ON s.id = ps.skill_id
        WHERE ps.personaje_id = ?
        ORDER BY s.nombre COLLATE NOCASE`,
    )
    .all(Number(personajeId))
    .map(hidratar);
}

/** Solo las que de verdad van a entrar en contexto: las asignadas y activas. */
export const activasDe = (personajeId) => dePersonaje(personajeId).filter((skill) => skill.activa);

/** Reemplaza de una vez las skills de un personaje. */
export function asignar(personajeId, ids) {
  const baseDatos = bd();
  const momento = ahora();

  const transaccion = baseDatos.transaction(() => {
    baseDatos.prepare('DELETE FROM personaje_skills WHERE personaje_id = ?').run(personajeId);
    const insertar = baseDatos.prepare(
      'INSERT INTO personaje_skills (personaje_id, skill_id, creado_en) VALUES (?, ?, ?)',
    );
    for (const id of ids) insertar.run(personajeId, exigirPorId(id).id, momento);
  });
  transaccion();

  return dePersonaje(personajeId);
}

/** A cuántos personajes afecta cada skill, para pintarlo en la lista. */
export function conteoDeUsos() {
  return new Map(
    bd()
      .prepare('SELECT skill_id, COUNT(*) AS total FROM personaje_skills GROUP BY skill_id')
      .all()
      .map((fila) => [fila.skill_id, fila.total]),
  );
}
