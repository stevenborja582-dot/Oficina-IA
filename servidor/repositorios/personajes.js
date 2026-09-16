/** Acceso a la tabla `personajes` (cada IA registrada en la oficina). */
import { bd, ahora } from '../base-datos/conexion.js';
import { errorNoEncontrado, errorPeticion } from '../utilidades/errores.js';
import { exigirPorId as exigirSala } from './salas.js';
import {
  ESTADOS_PERSONAJE,
  LIMITES,
  PROVEEDORES_IA,
  opcionDeLista,
  textoObligatorio,
  textoOpcional,
  urlOpcional,
} from '../utilidades/validacion.js';

export function listar() {
  return bd()
    .prepare(
      `SELECT p.*, s.slug AS sala_slug, s.nombre AS sala_nombre, s.color_acento AS sala_color
         FROM personajes p
         JOIN salas s ON s.id = p.sala_id
        ORDER BY s.orden, p.orden, p.id`,
    )
    .all();
}

export function listarPorSala(salaId) {
  return bd()
    .prepare('SELECT * FROM personajes WHERE sala_id = ? ORDER BY orden, id')
    .all(salaId);
}

export function obtenerPorId(id) {
  return bd().prepare('SELECT * FROM personajes WHERE id = ?').get(id) ?? null;
}

export function exigirPorId(id) {
  const personaje = obtenerPorId(id);
  if (!personaje) throw errorNoEncontrado('Ese personaje ya no está en la oficina.');
  return personaje;
}

function camposDesde(cuerpo, { porDefecto = {} } = {}) {
  const proveedor = opcionDeLista(
    cuerpo.proveedor_ia ?? porDefecto.proveedor_ia,
    'proveedor_ia',
    PROVEEDORES_IA,
    porDefecto.proveedor_ia ?? 'anthropic',
  );
  const enlace = urlOpcional(
    cuerpo.enlace_externo === undefined ? porDefecto.enlace_externo : cuerpo.enlace_externo,
    'enlace_externo',
  );

  // Un personaje "externo" (una app sin API propia, tipo Jarvis) solo se sostiene
  // como tarjeta si tiene a dónde llevar.
  if (proveedor === 'externo' && !enlace) {
    throw errorPeticion('Un personaje externo necesita un enlace para poder abrirlo.', {
      campo: 'enlace_externo',
    });
  }

  return {
    nombre: textoObligatorio(cuerpo.nombre ?? porDefecto.nombre, 'nombre', LIMITES.nombre),
    rol_titulo: textoOpcional(cuerpo.rol_titulo ?? porDefecto.rol_titulo, 'rol_titulo', LIMITES.rol_titulo),
    avatar_url: urlOpcional(
      cuerpo.avatar_url === undefined ? porDefecto.avatar_url : cuerpo.avatar_url,
      'avatar_url',
    ),
    persona_prompt: textoOpcional(
      cuerpo.persona_prompt ?? porDefecto.persona_prompt,
      'persona_prompt',
      LIMITES.persona_prompt,
    ),
    proveedor_ia: proveedor,
    modelo: textoOpcional(cuerpo.modelo ?? porDefecto.modelo, 'modelo', LIMITES.modelo),
    enlace_externo: enlace,
    estado: opcionDeLista(
      cuerpo.estado ?? porDefecto.estado,
      'estado',
      ESTADOS_PERSONAJE,
      porDefecto.estado ?? 'activo',
    ),
  };
}

function siguienteOrden(salaId) {
  const fila = bd()
    .prepare('SELECT COALESCE(MAX(orden), -1) AS maximo FROM personajes WHERE sala_id = ?')
    .get(salaId);
  return fila.maximo + 1;
}

export function crear(cuerpo) {
  const sala = exigirSala(Number(cuerpo.sala_id));
  const campos = camposDesde(cuerpo);
  const momento = ahora();

  const resultado = bd()
    .prepare(
      `INSERT INTO personajes (sala_id, nombre, rol_titulo, avatar_url, persona_prompt,
                               proveedor_ia, modelo, enlace_externo, estado, orden, creado_en, actualizado_en)
       VALUES (@sala_id, @nombre, @rol_titulo, @avatar_url, @persona_prompt,
               @proveedor_ia, @modelo, @enlace_externo, @estado, @orden, @momento, @momento)`,
    )
    .run({ ...campos, sala_id: sala.id, orden: siguienteOrden(sala.id), momento });

  return obtenerPorId(resultado.lastInsertRowid);
}

export function actualizar(id, cuerpo) {
  const actual = exigirPorId(id);
  const salaId = cuerpo.sala_id === undefined ? actual.sala_id : exigirSala(Number(cuerpo.sala_id)).id;
  const campos = camposDesde(cuerpo, { porDefecto: actual });
  const orden = salaId === actual.sala_id ? actual.orden : siguienteOrden(salaId);

  bd()
    .prepare(
      `UPDATE personajes
          SET sala_id = @sala_id, nombre = @nombre, rol_titulo = @rol_titulo, avatar_url = @avatar_url,
              persona_prompt = @persona_prompt, proveedor_ia = @proveedor_ia, modelo = @modelo,
              enlace_externo = @enlace_externo, estado = @estado, orden = @orden, actualizado_en = @momento
        WHERE id = @id`,
    )
    .run({ ...campos, sala_id: salaId, orden, id, momento: ahora() });

  return obtenerPorId(id);
}

export function eliminar(id) {
  const personaje = exigirPorId(id);
  bd().prepare('DELETE FROM personajes WHERE id = ?').run(id);
  return personaje;
}

/**
 * Deshacer un borrado. Reutiliza el id original si sigue libre, para que la tarjeta
 * vuelva tal cual estaba (mismo enlace, mismo sitio en la sala).
 */
export function restaurar(personaje) {
  const sala = exigirSala(Number(personaje.sala_id));
  const campos = camposDesde(personaje, { porDefecto: personaje });
  const momento = ahora();
  const idLibre = personaje.id && !obtenerPorId(personaje.id) ? Number(personaje.id) : null;

  const resultado = bd()
    .prepare(
      `INSERT INTO personajes (id, sala_id, nombre, rol_titulo, avatar_url, persona_prompt,
                               proveedor_ia, modelo, enlace_externo, estado, orden, creado_en, actualizado_en)
       VALUES (@id, @sala_id, @nombre, @rol_titulo, @avatar_url, @persona_prompt,
               @proveedor_ia, @modelo, @enlace_externo, @estado, @orden, @creado_en, @momento)`,
    )
    .run({
      ...campos,
      id: idLibre,
      sala_id: sala.id,
      orden: Number.isInteger(personaje.orden) ? personaje.orden : siguienteOrden(sala.id),
      creado_en: personaje.creado_en ?? momento,
      momento,
    });

  return obtenerPorId(idLibre ?? resultado.lastInsertRowid);
}
