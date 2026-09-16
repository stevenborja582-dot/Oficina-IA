/** Piezas visuales compartidas: avatar, chips y etiquetas legibles. */
import { elemento } from './dom.js';
import { variablesSala } from './color.js';

export const ETIQUETA_PROVEEDOR = {
  anthropic: 'Claude',
  openai: 'GPT',
  google: 'Gemini',
  externo: 'App externa',
};

export const ETIQUETA_ESTADO = {
  activo: 'Activo',
  borrador: 'Borrador',
  pausado: 'En pausa',
};

/** Iniciales: una o dos letras, como en la v1. */
export function iniciales(nombre) {
  const palabras = String(nombre ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (palabras.length === 0) return '??';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

/**
 * Avatar del personaje: imagen si la hay, iniciales sobre el color de su sala si no.
 * Es el hueco por el que entrarán los retratos vectoriales más adelante.
 */
export function avatar(personaje, color, { tamano = 44, redondo = false } = {}) {
  const { '--sala-color': salaColor, '--sala-tinta': salaTinta } = variablesSala(color);

  const nodo = elemento(`div.avatar${redondo ? '.avatar--redondo' : ''}`, {
    variables: {
      '--avatar-tamano': `${tamano}px`,
      '--avatar-color': salaColor,
      '--avatar-tinta': salaTinta,
    },
    'aria-hidden': 'true',
  });

  if (personaje.avatar_url) {
    nodo.append(
      elemento('img', {
        src: personaje.avatar_url,
        alt: '',
        loading: 'lazy',
        decoding: 'async',
        width: tamano,
        height: tamano,
        // Si la imagen falla, las iniciales siguen ahí debajo.
        alError: (evento) => evento.target.remove(),
      }),
    );
    nodo.prepend(elemento('span', { texto: iniciales(personaje.nombre) }));
    return nodo;
  }

  nodo.append(elemento('span', { texto: iniciales(personaje.nombre) }));
  return nodo;
}

export function chip(texto, { color = null, punto = false, neutro = false } = {}) {
  const variables = color ? variablesSala(color) : null;
  return elemento(`span.chip${neutro ? '.chip--neutro' : ''}`, {
    variables: variables
      ? { '--chip-color': variables['--sala-color'], '--chip-tinta': variables['--sala-tinta'] }
      : undefined,
  }, [punto && elemento('span.chip__punto', { 'aria-hidden': 'true' }), texto]);
}

export const chipProveedor = (personaje) =>
  chip(ETIQUETA_PROVEEDOR[personaje.proveedor_ia] ?? personaje.proveedor_ia, { neutro: true });

export const chipEstado = (personaje) =>
  personaje.estado === 'activo'
    ? null
    : chip(ETIQUETA_ESTADO[personaje.estado] ?? personaje.estado, { neutro: true });
