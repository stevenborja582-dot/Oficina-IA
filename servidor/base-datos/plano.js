/**
 * Geometría del plano de la oficina.
 *
 * El plano es una rejilla de 3 columnas. La fila 0 y la fila 1 están separadas por
 * un pasillo central; las filas siguientes (salas que crees más adelante) se apilan
 * debajo con una separación normal. El lienzo crece en alto solo si hace falta.
 */

export const PLANO = {
  anchoLienzo: 1200,
  margen: 40,
  columnas: 3,
  anchoSala: 354,
  altoSala: 216,
  separacionColumna: 29,
  separacionFila: 30,
  altoPasillo: 84,
};

/** Coordenada X de una columna (0, 1, 2). */
export function xDeColumna(columna) {
  return PLANO.margen + columna * (PLANO.anchoSala + PLANO.separacionColumna);
}

/** Coordenada Y de una fila. La fila 0 y la 1 quedan separadas por el pasillo. */
export function yDeFila(fila) {
  const base = PLANO.margen + fila * (PLANO.altoSala + PLANO.separacionFila);
  return fila === 0 ? base : base + (PLANO.altoPasillo - PLANO.separacionFila);
}

/** Geometría completa de la casilla `indice` (0, 1, 2, 3…) recorriendo por filas. */
export function casilla(indice) {
  const fila = Math.floor(indice / PLANO.columnas);
  const columna = indice % PLANO.columnas;
  return {
    plano_x: xDeColumna(columna),
    plano_y: yDeFila(fila),
    plano_ancho: PLANO.anchoSala,
    plano_alto: PLANO.altoSala,
  };
}

/** Rectángulo del pasillo central, para dibujarlo en el SVG. */
export function pasillo() {
  return {
    x: PLANO.margen,
    y: yDeFila(0) + PLANO.altoSala,
    ancho: PLANO.anchoLienzo - PLANO.margen * 2,
    alto: PLANO.altoPasillo,
  };
}

/**
 * Primera casilla libre dada la lista de salas existentes. Así una sala nueva
 * aterriza en un hueco del plano en vez de encima de otra.
 */
export function primeraCasillaLibre(salas) {
  const ocupadas = new Set(salas.map((sala) => `${sala.plano_x}:${sala.plano_y}`));
  for (let indice = 0; indice < 300; indice += 1) {
    const hueco = casilla(indice);
    if (!ocupadas.has(`${hueco.plano_x}:${hueco.plano_y}`)) return hueco;
  }
  return casilla(salas.length);
}

/** Alto del lienzo necesario para que quepan todas las salas. */
export function altoLienzo(salas) {
  const maximo = salas.reduce((tope, sala) => Math.max(tope, sala.plano_y + sala.plano_alto), 0);
  const minimo = yDeFila(1) + PLANO.altoSala;
  return Math.max(minimo, maximo) + PLANO.margen;
}
