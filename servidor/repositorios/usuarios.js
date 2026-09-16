/** Acceso a la tabla `usuarios`. Independiente del proveedor de login. */
import { bd, ahora } from '../base-datos/conexion.js';
import { configuracion } from '../configuracion.js';

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

/**
 * ¿Este correo puede entrar? Si CORREOS_PERMITIDOS está vacío, entra cualquiera.
 * Acepta correos sueltos ("yo@gmail.com") y dominios enteros ("@miempresa.com").
 */
export function correoPermitido(email) {
  const lista = configuracion.correosPermitidos;
  if (lista.length === 0) return true;
  const normalizado = String(email).toLowerCase();
  return lista.some((entrada) =>
    entrada.startsWith('@') ? normalizado.endsWith(entrada) : normalizado === entrada,
  );
}

/** El primer usuario del sistema siempre es admin; después manda la lista ADMINS. */
function resolverRol(email) {
  if (contarUsuarios() === 0) return 'admin';
  return configuracion.admins.includes(String(email).toLowerCase()) ? 'admin' : 'miembro';
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
    baseDatos
      .prepare(
        `UPDATE usuarios
            SET proveedor_auth = ?, proveedor_id = ?, email = ?, nombre = ?, avatar_url = ?,
                ultimo_acceso_en = ?
          WHERE id = ?`,
      )
      .run(proveedorAuth, String(proveedorId), correo, nombre ?? existente.nombre, avatarUrl ?? null, momento, existente.id);
    return obtenerPorId(existente.id);
  }

  const rol = resolverRol(correo);
  const resultado = baseDatos
    .prepare(
      `INSERT INTO usuarios (proveedor_auth, proveedor_id, email, nombre, avatar_url, rol, creado_en, ultimo_acceso_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(proveedorAuth, String(proveedorId), correo, nombre ?? '', avatarUrl ?? null, rol, momento, momento);

  return obtenerPorId(resultado.lastInsertRowid);
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
    proveedor_auth: usuario.proveedor_auth,
  };
}
