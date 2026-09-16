/**
 * Borra el archivo SQLite y lo vuelve a crear vacío con las salas sembradas.
 * Destructivo a propósito: pide confirmación con --si-estoy-seguro.
 */
import fs from 'node:fs';
import { configuracion } from '../configuracion.js';
import { bd, cerrarBd } from './conexion.js';
import { sembrarSalasSiVacio } from './sembrar.js';

if (!process.argv.includes('--si-estoy-seguro')) {
  console.error(
    'Esto borra TODA la base de datos local:\n' +
      `  ${configuracion.rutaBd}\n\n` +
      'Si es lo que quieres:  npm run bd:reiniciar -- --si-estoy-seguro',
  );
  process.exit(1);
}

for (const sufijo of ['', '-wal', '-shm']) {
  const ruta = `${configuracion.rutaBd}${sufijo}`;
  if (fs.existsSync(ruta)) fs.rmSync(ruta);
}

bd();
const resultado = sembrarSalasSiVacio();
cerrarBd();
console.log(`Base de datos reiniciada. Salas sembradas: ${resultado.creadas}`);
