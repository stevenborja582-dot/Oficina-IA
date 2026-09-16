/**
 * Almacén de sesiones de Express sobre la misma base SQLite.
 * Evita una dependencia extra y un segundo motor de base de datos: la sesión vive
 * en la tabla `sesiones`, al lado de todo lo demás, y sobrevive a los reinicios.
 */
import session from 'express-session';
import { bd } from '../base-datos/conexion.js';

const UN_MINUTO = 60 * 1000;

export class AlmacenSqlite extends session.Store {
  constructor({ intervaloLimpieza = 15 * UN_MINUTO } = {}) {
    super();
    this.limpiar();
    this.temporizador = setInterval(() => this.limpiar(), intervaloLimpieza);
    // No mantengas vivo el proceso solo por la limpieza.
    if (typeof this.temporizador.unref === 'function') this.temporizador.unref();
  }

  limpiar() {
    try {
      bd().prepare('DELETE FROM sesiones WHERE expira <= ?').run(Date.now());
    } catch {
      // Si la base aún no está lista, la próxima pasada lo resuelve.
    }
  }

  caducidad(sesion) {
    const maxAge = sesion?.cookie?.maxAge;
    if (Number.isFinite(maxAge)) return Date.now() + maxAge;
    const expires = sesion?.cookie?.expires;
    if (expires) return new Date(expires).getTime();
    return Date.now() + 24 * 60 * UN_MINUTO;
  }

  get(sid, callback) {
    try {
      const fila = bd().prepare('SELECT datos, expira FROM sesiones WHERE sid = ?').get(sid);
      if (!fila) return callback(null, null);
      if (fila.expira <= Date.now()) {
        this.destroy(sid, () => {});
        return callback(null, null);
      }
      return callback(null, JSON.parse(fila.datos));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sesion, callback = () => {}) {
    try {
      bd()
        .prepare(
          `INSERT INTO sesiones (sid, expira, datos) VALUES (?, ?, ?)
           ON CONFLICT (sid) DO UPDATE SET expira = excluded.expira, datos = excluded.datos`,
        )
        .run(sid, this.caducidad(sesion), JSON.stringify(sesion));
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  touch(sid, sesion, callback = () => {}) {
    try {
      bd().prepare('UPDATE sesiones SET expira = ? WHERE sid = ?').run(this.caducidad(sesion), sid);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      bd().prepare('DELETE FROM sesiones WHERE sid = ?').run(sid);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  length(callback) {
    try {
      const fila = bd().prepare('SELECT COUNT(*) AS total FROM sesiones').get();
      return callback(null, fila.total);
    } catch (error) {
      return callback(error);
    }
  }

  clear(callback = () => {}) {
    try {
      bd().prepare('DELETE FROM sesiones').run();
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }
}
