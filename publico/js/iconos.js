/**
 * Catálogo de iconos. Trazo de 1.75 px sobre una rejilla de 24, el mismo peso
 * visual que el texto: así nada grita más fuerte de la cuenta.
 *
 * Son datos fijos definidos aquí, nunca marcado que venga del usuario.
 */
import { elementoSvg } from './dom.js';

const TRAZOS = {
  // — Salas ---------------------------------------------------------------
  codigo:   ['m8 6-6 6 6 6', 'm16 6 6 6-6 6', 'm13.5 4-3 16'],
  paleta:   ['M12 3a9 9 0 1 0 0 18 2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2h1.6A4.2 4.2 0 0 0 21 10.4C21 6.3 16.9 3 12 3Z',
             'M7.5 11.5h.01', 'M10.5 7.5h.01', 'M15.5 7.5h.01'],
  chispa:   ['M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z', 'M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z'],
  pluma:    ['M19 3c-3 0-6 1-8.5 3.5C8 9 7 12 7 15l-3 3', 'M12 11c-2 2-3 4.5-3 7 2.5 0 5-1 7-3 2.5-2.5 3.5-5.5 3.5-8.5'],
  rayo:     ['M13 2 4 14h7l-1 8 9-12h-7z'],
  oficina:  ['M3 21h18', 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16', 'M15 21V9h4a2 2 0 0 1 2 2v10',
             'M9 7h2', 'M9 11h2', 'M9 15h2'],
  brujula:  ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'm14.9 9.1-1.8 5-5 1.8 1.8-5z'],
  cubo:     ['M21 8.5v7l-9 5-9-5v-7l9-5z', 'm3 8.5 9 5 9-5', 'M12 13.5v7'],
  grafico:  ['M3 3v18h18', 'm7 14 3.5-4 3 3L19 7'],
  escudo:   ['M12 3l8 3v5.5c0 4.6-3.2 8.6-8 9.5-4.8-.9-8-4.9-8-9.5V6z', 'm9 12 2 2 4-4'],

  // — Interfaz ------------------------------------------------------------
  buscar:   ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.3-4.3'],
  mas:      ['M12 5v14', 'M5 12h14'],
  lapiz:    ['M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16z', 'm13.5 6.5 4 4'],
  papelera: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  flechaIzquierda: ['M19 12H5', 'm11 18-6-6 6-6'],
  flechaDerecha:   ['M5 12h14', 'm13 6 6 6-6 6'],
  enlace:   ['M14 4h6v6', 'M10 14 20 4', 'M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5'],
  mensaje:  ['M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z'],
  sol:      ['M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z', 'M12 2v2', 'M12 20v2', 'M2 12h2', 'M20 12h2',
             'm4.9 4.9 1.4 1.4', 'm17.7 17.7 1.4 1.4', 'm19.1 4.9-1.4 1.4', 'm6.3 17.7-1.4 1.4'],
  luna:     ['M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z'],
  salir:    ['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'm10 16-4-4 4-4', 'M6 12h11'],
  cerrar:   ['m6 6 12 12', 'm18 6-12 12'],
  ajustes:  ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
             'M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.9 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14V14a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3Z'],
  usuarios: ['M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
             'M22 20v-2a4 4 0 0 0-3-3.9', 'M16 2.1a4 4 0 0 1 0 7.8'],
  copiar:   ['M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Z',
             'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
  comprobado: ['m5 13 4 4 10-10'],
  enviar:   ['M4 12h15', 'm13 6 6 6-6 6'],
  detener:  ['M7 7h10v10H7z'],
  historial: ['M12 21a9 9 0 1 0-8.5-12', 'M3 4v5h5', 'M12 8v4.5l3 2'],
  puerta:   ['M4 21h16', 'M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17', 'M14 12h.01'],
};

export const ICONOS_SALA = ['codigo', 'paleta', 'chispa', 'pluma', 'rayo', 'oficina', 'brujula', 'cubo', 'grafico', 'escudo'];

/** Crea un <svg> del catálogo. Si el nombre no existe, cae en "oficina". */
export function icono(nombre, { clase = '', titulo = '' } = {}) {
  const trazos = TRAZOS[nombre] ?? TRAZOS.oficina;
  const svg = elementoSvg('svg', {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.75',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': titulo ? null : 'true',
    role: titulo ? 'img' : null,
    class: clase || null,
  });

  if (titulo) svg.append(elementoSvg('title', { texto: titulo }));
  trazos.forEach((d) => svg.append(elementoSvg('path', { d })));
  return svg;
}

/** Devuelve solo los trazos, para dibujar el icono dentro del plano SVG. */
export function trazosDe(nombre) {
  return TRAZOS[nombre] ?? TRAZOS.oficina;
}
