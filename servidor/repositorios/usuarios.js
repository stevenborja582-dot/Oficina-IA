/** Acceso a la tabla `usuarios`. Independiente del proveedor de login. */
import { bd, ahora } from '../base-datos/conexion.js';
import { configuracion } from '../configuracion.js';
import { errorConflicto, errorNoEncontrado, errorPeticion } from '../utilidades/errores.js';

export const ROLES = ['admin', 'miembro'];
export const ESTADOS_USUARIO = ['activo', 'suspendido'];

export function contarUsuarios() {
  return bd().prepare('SELECT COUNT(*) AS total FROM usuarios').get().total;
}

export function obtenerPorId(id) {
  return bd().prepare('SELECT * FROM usuarios WHERE id = ?').get(id) ?? null;
}

export function obtenerPorProveedor(proveedorAuth, proveedorId) {
  return (
    bd()
      .prepare('SELECT * FROM usuarios WHERE proveedor_auth = ? AND proveedor_id = ?')
      .get(proveedorAuth, String(proveedorId)) ?? null
  );
}

export function obtenerPorEmail(email) {
  return bd().prepare('SELECT * FROM usuarios WHERE email = ?').get(String(email).toLowerCase()) ?? null;
}

export function invitacionDe(email) {
  return bd().prepare('SELECT * FROM invitaciones WHERE email = ?').get(String(email).toLowerCase()) ?? null;
}

/**
 * ¿Este correo puede entrar?
 *
 * Tres puertas, y basta con una: la lista del `.env` (correos sueltos o dominios
 * enteros con "@empresa.com"), una invitación creada desde la pantalla de Equipo,
 * o que no haya ninguna restricción configurada. La primera persona que entra
 * nunca se queda fuera: sin ella no habría nadie que pudiera invitar.
 */
export function correoPermitido(email) {
  const normalizado = String(email).toLowerCase();
  const lista = configuracion.correosPermitidos;

  if (invitacionDe(normalizado)) return true;
  if (lista.length === 0) return true;
  if (contarUsuarios() === 0) return true;

  return lista.some((entrada) =>
    entrada.startsWith('@') ? normalizado.endsWith(entrada) : normalizado === entrada,
  );
}

/**
 * El primer usuario del sistema siempre es admin — si no, la oficina nacería sin
 * nadie que pudiera administrarla. Después mandan la invitación y la lista ADMINS.
 */
function resolverRol(email) {
  if (contarUsuarios() === 0) return 'admin';
  const normalizado = String(email).toLowerCase();
  if (configuracion.admins.includes(normalizado)) return 'admin';
  return invitacionDe(normalizado)?.rol === 'admin' ? 'admin' : 'miembro';
}

/**
 * Alta o actualización del usuario tras un login correcto.
 * Se vincula por (proveedor, id externo); el correo se refresca por si cambió.
 */
export function registrarAcceso({ proveedorAuth, proveedorId, email, nombre, avatarUrl }) {
  const baseDatos = bd();
  const correo = String(email).toLowerCase();
  const momento = ahora();

  const existente =
    obtenerPorProveedor(proveedorAuth, proveedorId) ?? obtenerPorEmail(correo);

  if (existente) {
    // Quien está suspendido no vuelve a entrar por mucho que el proveedor diga que sí.
    if (existente.estado === 'suspendido') return { suspendido: true, usuario: existente };
    baseDatos
      .prepare(
        `UPDATE usuarios
            SET proveedor_auth = ?, proveedor_id = ?, email = ?, nombre = ?, avatar_url = ?,
                ultimo_acceso_en = ?
          WHERE id = ?`,
      )
      .run(proveedorAuth, String(proveedorId), correo, nombre ?? existente.nombre, avatarUrl ?? null, momento, existente.id);
    marcarInvitacionUsada(correo, momento);
    return obtenerPorId(existente.id);
  }

  const rol = resolverRol(correo);
  const resultado = baseDatos
    .prepare(
      `INSERT INTO usuarios (proveedor_auth, proveedor_id, email, nombre, avatar_url, rol, creado_en, ultimo_acceso_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(proveedorAuth, String(proveedorId), correo, nombre ?? '', avatarUrl ?? null, rol, momento, momento);

  marcarInvitacionUsada(correo, momento);
  return obtenerPorId(resultado.lastInsertRowid);
}

function marcarInvitacionUsada(email, momento) {
  bd()
    .prepare('UPDATE invitaciones SET usada_en = ? WHERE email = ? AND usada_en IS NULL')
    .run(momento, String(email).toLowerCase());
}

/** Vista del usuario que sí puede viajar al navegador. */
export function usuarioPublico(usuario) {
  if (!usuario) return null;
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    avatar_url: usuario.avatar_url,
    rol: usuario.rol,
    estado: usuario.estado ?? 'activo',
    proveedor_auth: usuario.proveedor_auth,
  };
}

/* ── Equipo (Fase 5) ─────────────────────────────────────────────────────── */

/** Vista completa para la pantalla de Equipo: solo la ve un administrador. */
export function listarEquipo() {
  return bd()
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM conversaciones c WHERE c.usuario_id = u.id) AS conversaciones
         FROM usuarios u
        ORDER BY CASE u.rol WHEN 'admin' THEN 0 ELSE 1 END, u.nombre COLLATE NOCASE`,
    )
    .all()
    .map((usuario) => ({
      ...usuarioPublico(usuario),
      conversaciones: usuario.conversaciones,
      creado_en: usuario.creado_en,
      ultimo_acceso_en: usuario.ultimo_acceso_en,
    }));
}

export function listarInvitaciones() {
  return bd()
    .prepare(
      `SELECT i.*, u.nombre AS invitador
         FROM invitaciones i
         LEFT JOIN usuarios u ON u.id = i.creada_por
        ORDER BY i.creada_en DESC`,
    )
    .all();
}

function contarAdminsActivos(exceptoId = null) {
  return bd()
    .prepare(
      `SELECT COUNT(*) AS total FROM usuarios
        WHERE rol = 'admin' AND estado = 'activo' AND id IS NOT ?`,
    )
    .get(exceptoId).total;
}

export function exigirPorId(id) {
  const usuario = obtenerPorId(Number(id));
  if (!usuario) throw errorNoEncontrado('Ese usuario no existe.');
  return usuario;
}

/**
 * Cambia rol o estado. La regla que nunca se salta: la oficina no puede quedarse
 * sin ningún administrador activo — ni por degradación, ni por suspensión.
 */
export function actualizarUsuario(id, cambios) {
  const usuario = exigirPorId(id);
  const rol = cambios.rol ?? usuario.rol;
  const estado = cambios.estado ?? usuario.estado ?? 'activo';

  if (!ROLES.includes(rol)) throw errorPeticion('Rol desconocido.', { campo: 'rol' });
  if (!ESTADOS_USUARIO.includes(estado)) throw errorPeticion('Estado desconocido.', { campo: 'estado' });

  const dejaDeMandar = usuario.rol === 'admin' && usuario.estado !== 'suspendido' &&
    (rol !== 'admin' || estado === 'suspendido');
  if (dejaDeMandar && contarAdminsActivos(usuario.id) === 0) {
    throw errorConflicto('Es el único administrador activo: nombra a otro antes de cambiarlo.');
  }

  bd().prepare('UPDATE usuarios SET rol = ?, estado = ? WHERE id = ?').run(rol, estado, usuario.id);
  return obtenerPorId(usuario.id);
}

/**
 * Da de baja a alguien. Sus conversaciones se van con él — son suyas, no del
 * personaje. Si lo que quieres es conservar el historial, suspéndelo en vez de borrarlo.
 */
export function eliminarUsuario(id) {
  const usuario = exigirPorId(id);
  if (usuario.rol === 'admin' && usuario.estado === 'activo' && contarAdminsActivos(usuario.id) === 0) {
    throw errorConflicto('Es el único administrador activo: nombra a otro antes de borrarlo.');
  }

  const baseDatos = bd();
  const transaccion = baseDatos.transaction(() => {
    baseDatos.prepare('DELETE FROM conversaciones WHERE usuario_id = ?').run(usuario.id);
    baseDatos.prepare('DELETE FROM usuarios WHERE id = ?').run(usuario.id);
  });
  transaccion();
  return usuarioPublico(usuario);
}

export function invitar({ email, rol = 'miembro' }, creadaPor) {
  const correo = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw errorPeticion('Escribe un correo válido.', { campo: 'email' });
  }
  if (!ROLES.includes(rol)) throw errorPeticion('Rol desconocido.', { campo: 'rol' });
  if (obtenerPorEmail(correo)) throw errorConflicto('Esa persona ya está en la oficina.', { campo: 'email' });

  bd()
    .prepare(
      `INSERT INTO invitaciones (email, rol, creada_por, creada_en) VALUES (?, ?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET rol = excluded.rol, creada_por = excluded.creada_por,
                                         creada_en = excluded.creada_en, usada_en = NULL`,
    )
    .run(correo, rol, creadaPor ?? null, ahora());

  return invitacionDe(correo);
}

export function revocarInvitacion(id) {
  const resultado = bd().prepare('DELETE FROM invitaciones WHERE id = ?').run(Number(id));
  if (resultado.changes === 0) throw errorNoEncontrado('Esa invitación ya no existe.');
}
