/**
 * Color accesible.
 *
 * Cada sala tiene su propio acento y el usuario puede elegir cualquiera. En vez de
 * confiar en que acierte, aquí se calcula el tono de texto: se oscurece (o se aclara,
 * en modo oscuro) hasta que el contraste llega a 4.5:1 contra el fondo real.
 * Así una sala rosa chicle sigue cumpliendo WCAG AA.
 */

const FONDO_CLARO = '#faf9f7';
const FONDO_OSCURO = '#100f0e';
// La superficie de las tarjetas, que es donde de verdad aterrizan chips y avatares.
const SUPERFICIE_CLARA = '#ffffff';
const SUPERFICIE_OSCURA = '#191816';

function aRgb(hex) {
  const limpio = String(hex).replace('#', '').trim();
  const completo = limpio.length === 3 ? limpio.split('').map((c) => c + c).join('') : limpio;
  const numero = Number.parseInt(completo, 16);
  if (!Number.isFinite(numero) || completo.length !== 6) return { r: 87, g: 83, b: 78 };
  return { r: (numero >> 16) & 255, g: (numero >> 8) & 255, b: numero & 255 };
}

const aHex = ({ r, g, b }) =>
  `#${[r, g, b].map((canal) => Math.round(Math.min(255, Math.max(0, canal))).toString(16).padStart(2, '0')).join('')}`;

/** Luminancia relativa según WCAG 2.x. */
function luminancia({ r, g, b }) {
  const canal = (valor) => {
    const proporcion = valor / 255;
    return proporcion <= 0.04045 ? proporcion / 12.92 : ((proporcion + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

export function contraste(colorA, colorB) {
  const a = luminancia(aRgb(colorA));
  const b = luminancia(aRgb(colorB));
  const claro = Math.max(a, b);
  const oscuro = Math.min(a, b);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Mezcla lineal entre dos colores (0 = origen, 1 = destino). */
function mezclar(origen, destino, proporcion) {
  const a = aRgb(origen);
  const b = aRgb(destino);
  return aHex({
    r: a.r + (b.r - a.r) * proporcion,
    g: a.g + (b.g - a.g) * proporcion,
    b: a.b + (b.b - a.b) * proporcion,
  });
}

/**
 * Devuelve una variante del color con contraste suficiente sobre el fondo indicado.
 * Si el color ya cumple, se devuelve intacto.
 */
export function tintaLegible(color, { oscuro = false, objetivo = 4.5, fondo = null } = {}) {
  const contra = fondo ?? (oscuro ? FONDO_OSCURO : FONDO_CLARO);
  const extremo = oscuro ? '#ffffff' : '#000000';

  if (contraste(color, contra) >= objetivo) return color;

  // 40 pasos y no 20: con un fondo teñido el margen es estrecho y conviene no
  // pasarse de oscuro más de lo necesario.
  for (let paso = 1; paso <= 40; paso += 1) {
    const candidato = mezclar(color, extremo, paso / 40);
    if (contraste(candidato, contra) >= objetivo) return candidato;
  }
  return extremo;
}

/** ¿El tema efectivo es oscuro ahora mismo? */
export function temaOscuro() {
  const tema = document.documentElement.dataset.tema;
  if (tema === 'oscuro') return true;
  if (tema === 'claro') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Pareja de variables CSS que consumen las vistas de sala.
 *
 * `tinte` es la proporción del color que lleva el fondo sobre el que se va a
 * escribir: un chip la tiñe al 10 %, un avatar al 16 %. Sin tenerlo en cuenta, la
 * tinta se calculaba contra el lienzo y aterrizaba sobre algo un punto más oscuro:
 * suficiente para quedarse en 4.1–4.4:1, justo por debajo de AA.
 */
export function variablesSala(color, { tinte = 0 } = {}) {
  const oscuro = temaOscuro();
  const superficie = oscuro ? SUPERFICIE_OSCURA : SUPERFICIE_CLARA;
  const fondo = tinte > 0 ? mezclar(superficie, color, tinte) : null;

  return {
    '--sala-color': color,
    '--sala-tinta': tintaLegible(color, { oscuro, fondo }),
  };
}
