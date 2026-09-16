/**
 * Conexión única a SQLite. `better-sqlite3` es síncrono: no hay servidor de base
 * de datos, ni pool, ni Docker — solo un archivo en disco.
 */
import Database from 'better-sqlite3';
import { configuracion } from '../configuracion.js';
import { aplicarMigraciones } from './migraciones.js';

let instancia = null;

export function bd() {
  if (instancia) return instancia;

  instancia = new Database(configuracion.rutaBd);
  // WAL: lecturas y escrituras simultáneas sin bloqueos, imprescindible para un
  // servidor web aunque sea de un solo usuario.
  instancia.pragma('journal_mode = WAL');
  instancia.pragma('foreign_keys = ON');
  instancia.pragma('busy_timeout = 5000');

  aplicarMigraciones(instancia);
  return instancia;
}

export function cerrarBd() {
  if (instancia) {
    instancia.close();
    instancia = null;
  }
}

/** Marca de tiempo ISO en UTC, el formato que guardamos en todas las columnas `*_en`. */
export const ahora = () => new Date().toISOString();
