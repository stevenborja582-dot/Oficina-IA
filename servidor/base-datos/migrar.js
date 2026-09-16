/** Aplica las migraciones pendientes y sale. `npm run bd:migrar` */
import { bd, cerrarBd } from './conexion.js';
import { versionEsquema } from './migraciones.js';
import { configuracion } from '../configuracion.js';

const baseDatos = bd();
console.log(`Base de datos: ${configuracion.rutaBd}`);
console.log(`Versión del esquema: ${baseDatos.pragma('user_version', { simple: true })} de ${versionEsquema}`);
cerrarBd();
