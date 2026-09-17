/**
 * Acceso a la tabla `conectores` y a su asignación por personaje.
 *
 * Un conector es un servidor MCP. Los campos que guardan estructuras (argumentos,
 * variables, cabeceras, herramientas) viven como JSON en texto: SQLite no tiene
 * tipo lista y no hace falta consultarlos por dentro.
 */
import { bd, ahora } from '../base-datos/conexion.js';
import { errorConflicto, errorNoEncontrado, errorPeticion } from '../utilidades/errores.js';
import {
  LIMITES,
  generarSlug,
  opcionDeLista,
  slugUnico,
  textoObligatorio,
  textoOpcional,
  urlOpcional,
} from '../utilidades/validacion.js';

export const TRANSPORTES = ['stdio', 'http'];

const analizar = (crudo, porDefecto) => {
  try {
    const valor = JSON.parse(crudo);
    return valor ?? porDefecto;
  } catch {
    return porDefecto;
  }
};

/** Fila cruda → objeto con sus estructuras ya analizadas. */
function hidratar(fila) {
  if (!fila) return null;
  return {
    ...fila,
    argumentos: analizar(fila.argumentos, []),
    variables: analizar(fila.variables, {}),
    cabeceras: analizar(fila.cabeceras, {}),
    herramientas: analizar(fila.herramientas, []),
  };
}

export function listar() {
  return bd().prepare('SELECT * FROM conectores ORDER BY nombre').all().map(hidratar);
}

export function obtenerPorId(id) {
  return hidratar(bd().prepare('SELECT * FROM conectores WHERE id = ?').get(id));
}

export function exigirPorId(id) {
  const conector = obtenerPorId(id);
  if (!conector) throw errorNoEncontrado('Ese conector no existe.');
  return conector;
}

const existeSlug = (slug) => Boolean(bd().prepare('SELECT 1 FROM conectores WHERE slug = ?').get(slug));

/** Lista de cadenas: los argumentos de la línea de órdenes. */
function listaDeTexto(valor, campo) {
  if (valor === undefined || valor === null || valor === '') return [];
  const lista = Array.isArray(valor)
    ? valor
    : String(valor).split('\n').map((linea) => linea.trim()).filter(Boolean);
  if (lista.length > 40) throw errorPeticion(`"${campo}" tiene demasiadas entradas.`, { campo });
  return lista.map((entrada) => {
    const limpio = String(entrada).trim();
    if (limpio.length > 400) throw errorPeticion(`Una entrada de "${campo}" es demasiado larga.`, { campo });
    return limpio;
  });
}

/** Diccionario clave=valor, una por línea. Se usa para variables y cabeceras. */
function diccionario(valor, campo) {
  if (valor === undefined || valor === null || valor === '') return {};
  if (typeof valor === 'object' && !Array.isArray(valor)) return valor;

  const salida = {};
  for (const linea of String(valor).split('\n')) {
    const limpia = linea.trim();
    if (!limpia) continue;
    const corte = limpia.indexOf('=');
    if (corte < 1) throw errorPeticion(`"${campo}" se escribe una por línea, con el formato CLAVE=valor.`, { campo });
    salida[limpia.slice(0, corte).trim()] = limpia.slice(corte + 1).trim();
  }
  return salida;
}

function camposDesde(cuerpo, { porDefecto = {} } = {}) {
  const transporte = opcionDeLista(
    cuerpo.transporte ?? porDefecto.transporte,
    'transporte',
    TRANSPORTES,
    porDefecto.transporte ?? 'stdio',
  );

  const comando = textoOpcional(cuerpo.comando ?? porDefecto.comando, 'comando', 200);
  const url = transporte === 'http'
    ? urlOpcional(cuerpo.url === undefined ? porDefecto.url : cuerpo.url, 'url')
    : '';

  if (transporte === 'stdio' && !comando) {
    throw errorPeticion('Un conector por proceso necesita la orden que lo lanza (por ejemplo, npx).', { campo: 'comando' });
  }
  if (transporte === 'http' && !url) {
    throw errorPeticion('Un conector remoto necesita su dirección.', { campo: 'url' });
  }

  return {
    nombre: textoObligatorio(cuerpo.nombre ?? porDefecto.nombre, 'nombre', LIMITES.nombre),
    descripcion: textoOpcional(cuerpo.descripcion ?? porDefecto.descripcion, 'descripcion'),
    transporte,
    comando: transporte === 'stdio' ? comando : '',
    argumentos: JSON.stringify(transporte === 'stdio'
      ? listaDeTexto(cuerpo.argumentos ?? porDefecto.argumentos, 'argumentos')
      : []),
    variables: JSON.stringify(diccionario(cuerpo.variables ?? porDefecto.variables, 'variables')),
    url: url || '',
    cabeceras: JSON.stringify(transporte === 'http'
      ? diccionario(cuerpo.cabeceras ?? porDefecto.cabeceras, 'cabeceras')
      : {}),
  };
}

export function crear(cuerpo) {
  const campos = camposDesde(cuerpo);
  const slug = slugUnico(generarSlug(cuerpo.slug || campos.nombre), existeSlug);
  const momento = ahora();

  const resultado = bd()
    .prepare(
      `INSERT INTO conectores (slug, nombre, descripcion, transporte, comando, argumentos, variables,
                               url, cabeceras, herramientas, estado, creado_en, actualizado_en)
       VALUES (@slug, @nombre, @descripcion, @transporte, @comando, @argumentos, @variables,
               @url, @cabeceras, '[]', 'sin_probar', @momento, @momento)`,
    )
    .run({ ...campos, slug, momento });

  return obtenerPorId(resultado.lastInsertRowid);
}

export function actualizar(id, cuerpo) {
  const actual = exigirPorId(id);
  const campos = camposDesde(cuerpo, { porDefecto: actual });

  bd()
    .prepare(
      `UPDATE conectores
          SET nombre = @nombre, descripcion = @descripcion, transporte = @transporte,
              comando = @comando, argumentos = @argumentos, variables = @variables,
              url = @url, cabeceras = @cabeceras, actualizado_en = @momento
        WHERE id = @id`,
    )
    .run({ ...campos, id, momento: ahora() });

  return obtenerPorId(id);
}

/** Guarda el resultado de una prueba de conexión. */
export function anotarPrueba(id, { herramientas = null, error = null }) {
  bd()
    .prepare(
      `UPDATE conectores
          SET herramientas = COALESCE(@herramientas, herramientas),
              estado = @estado, ultimo_error = @error, probado_en = @momento, actualizado_en = @momento
        WHERE id = @id`,
    )
    .run({
      id,
      herramientas: herramientas ? JSON.stringify(herramientas) : null,
      estado: error ? 'error' : 'listo',
      error,
      momento: ahora(),
    });

  return obtenerPorId(id);
}

export function eliminar(id) {
  const conector = exigirPorId(id);
  const usos = bd()
    .prepare('SELECT COUNT(*) AS total FROM personaje_conectores WHERE conector_id = ?')
    .get(id).total;

  if (usos > 0) {
    throw errorConflicto(
      `"${conector.nombre}" sigue asignado a ${usos} personaje(s). Quítaselo antes de borrarlo.`,
      { campo: 'conector' },
    );
  }

  bd().prepare('DELETE FROM conectores WHERE id = ?').run(id);
  return conector;
}

/* ── Asignación por personaje ────────────────────────────────────────────── */

export function dePersonaje(personajeId) {
  return bd()
    .prepare(
      `SELECT c.*, pc.herramientas AS herramientas_permitidas
         FROM personaje_conectores pc
         JOIN conectores c ON c.id = pc.conector_id
        WHERE pc.personaje_id = ?
        ORDER BY c.nombre`,
    )
    .all(personajeId)
    .map((fila) => ({
      ...hidratar(fila),
      herramientas_permitidas: analizar(fila.herramientas_permitidas, []),
    }));
}

/** Reemplaza de una vez los conectores de un personaje. */
export function asignar(personajeId, asignaciones) {
  const baseDatos = bd();
  const momento = ahora();

  const transaccion = baseDatos.transaction(() => {
    baseDatos.prepare('DELETE FROM personaje_conectores WHERE personaje_id = ?').run(personajeId);
    const insertar = baseDatos.prepare(
      `INSERT INTO personaje_conectores (personaje_id, conector_id, herramientas, creado_en)
       VALUES (?, ?, ?, ?)`,
    );
    for (const asignacion of asignaciones) {
      const conector = exigirPorId(Number(asignacion.conector_id));
      const permitidas = Array.isArray(asignacion.herramientas) ? asignacion.herramientas.map(String) : [];
      insertar.run(personajeId, conector.id, JSON.stringify(permitidas), momento);
    }
  });
  transaccion();

  return dePersonaje(personajeId);
}
