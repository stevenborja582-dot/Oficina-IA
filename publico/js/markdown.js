/**
 * Markdown mínimo, construido con nodos del DOM.
 *
 * No hay librería y no hay `innerHTML`: lo que devuelve un modelo es texto que no
 * controlamos, así que cada elemento se crea a mano y cada enlace se comprueba.
 * Cubre lo que de verdad aparece en una respuesta: títulos, listas, citas, código
 * en bloque y en línea, negrita, cursiva, tachado y enlaces.
 */
import { elemento } from './dom.js';
import { icono } from './iconos.js';

/* ── Nivel de línea ──────────────────────────────────────────────────────── */

export function renderizarMarkdown(texto) {
  const fragmento = document.createDocumentFragment();
  const lineas = String(texto ?? '').replace(/\r\n/g, '\n').split('\n');

  let indice = 0;
  while (indice < lineas.length) {
    const linea = lineas[indice];

    // Bloque de código cercado.
    const cerca = /^\s*```(\w*)\s*$/.exec(linea);
    if (cerca) {
      const cuerpo = [];
      indice += 1;
      while (indice < lineas.length && !/^\s*```\s*$/.test(lineas[indice])) {
        cuerpo.push(lineas[indice]);
        indice += 1;
      }
      indice += 1;
      fragmento.append(bloqueCodigo(cuerpo.join('\n'), cerca[1]));
      continue;
    }

    if (/^\s*$/.test(linea)) {
      indice += 1;
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(linea)) {
      fragmento.append(elemento('hr.md__regla'));
      indice += 1;
      continue;
    }

    const titulo = /^(#{1,4})\s+(.*)$/.exec(linea);
    if (titulo) {
      const nivel = Math.min(titulo[1].length + 2, 6);
      fragmento.append(elemento(`h${nivel}.md__titulo`, {}, renderizarEnLinea(titulo[2])));
      indice += 1;
      continue;
    }

    if (/^\s*>\s?/.test(linea)) {
      const cuerpo = [];
      while (indice < lineas.length && /^\s*>\s?/.test(lineas[indice])) {
        cuerpo.push(lineas[indice].replace(/^\s*>\s?/, ''));
        indice += 1;
      }
      fragmento.append(elemento('blockquote.md__cita', {}, renderizarMarkdown(cuerpo.join('\n'))));
      continue;
    }

    const vinetas = /^\s*([-*+])\s+/.test(linea);
    const numerada = /^\s*\d+[.)]\s+/.test(linea);
    if (vinetas || numerada) {
      const puntos = [];
      const patron = vinetas ? /^\s*([-*+])\s+/ : /^\s*\d+[.)]\s+/;
      while (indice < lineas.length && patron.test(lineas[indice])) {
        let punto = lineas[indice].replace(patron, '');
        indice += 1;
        // Las líneas sangradas que siguen pertenecen al mismo punto.
        while (indice < lineas.length && /^\s{2,}\S/.test(lineas[indice]) && !patron.test(lineas[indice])) {
          punto += `\n${lineas[indice].trim()}`;
          indice += 1;
        }
        puntos.push(punto);
      }
      const lista = elemento(vinetas ? 'ul.md__lista' : 'ol.md__lista');
      puntos.forEach((punto) => lista.append(elemento('li', {}, renderizarEnLinea(punto))));
      fragmento.append(lista);
      continue;
    }

    // Párrafo: se traga las líneas seguidas hasta el próximo bloque.
    const parrafo = [];
    while (
      indice < lineas.length &&
      !/^\s*$/.test(lineas[indice]) &&
      !/^\s*```/.test(lineas[indice]) &&
      !/^(#{1,4})\s+/.test(lineas[indice]) &&
      !/^\s*>\s?/.test(lineas[indice]) &&
      !/^\s*([-*+])\s+/.test(lineas[indice]) &&
      !/^\s*\d+[.)]\s+/.test(lineas[indice])
    ) {
      parrafo.push(lineas[indice]);
      indice += 1;
    }
    fragmento.append(elemento('p.md__parrafo', {}, renderizarEnLinea(parrafo.join('\n'))));
  }

  return fragmento;
}

/* ── Nivel de línea interior ─────────────────────────────────────────────── */

// El orden importa: el código en línea va primero para que nada de dentro se interprete.
const PATRON = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+)/g;

function renderizarEnLinea(texto) {
  const nodos = [];
  let ultimo = 0;

  for (const coincidencia of String(texto).matchAll(PATRON)) {
    const trozo = coincidencia[0];
    if (coincidencia.index > ultimo) {
      nodos.push(document.createTextNode(texto.slice(ultimo, coincidencia.index)));
    }
    nodos.push(nodoDeCoincidencia(trozo));
    ultimo = coincidencia.index + trozo.length;
  }

  if (ultimo < texto.length) nodos.push(document.createTextNode(texto.slice(ultimo)));
  return nodos;
}

function nodoDeCoincidencia(trozo) {
  if (trozo.startsWith('`')) {
    return elemento('code.md__codigo', { texto: trozo.slice(1, -1) });
  }
  if (trozo.startsWith('**') || trozo.startsWith('__')) {
    return elemento('strong', {}, renderizarEnLinea(trozo.slice(2, -2)));
  }
  if (trozo.startsWith('~~')) {
    return elemento('del', {}, renderizarEnLinea(trozo.slice(2, -2)));
  }
  if (trozo.startsWith('*') || trozo.startsWith('_')) {
    return elemento('em', {}, renderizarEnLinea(trozo.slice(1, -1)));
  }
  if (trozo.startsWith('[')) {
    const partes = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(trozo);
    return partes ? enlace(partes[2], partes[1]) : document.createTextNode(trozo);
  }
  return enlace(trozo, trozo);
}

/** Solo http y https. Cualquier otra cosa se queda en texto plano. */
function enlace(destino, etiqueta) {
  let url;
  try {
    url = new URL(destino);
  } catch {
    return document.createTextNode(etiqueta);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return document.createTextNode(etiqueta);
  }
  return elemento('a.md__enlace', {
    href: url.toString(),
    target: '_blank',
    rel: 'noopener noreferrer nofollow',
    texto: etiqueta,
  });
}

/* ── Bloque de código ────────────────────────────────────────────────────── */

function bloqueCodigo(codigo, lenguaje) {
  const boton = elemento('button.md__copiar', {
    type: 'button',
    'aria-label': 'Copiar el código',
    title: 'Copiar',
  }, [icono('copiar')]);

  boton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      boton.classList.add('md__copiar--hecho');
      boton.setAttribute('aria-label', 'Código copiado');
      setTimeout(() => {
        boton.classList.remove('md__copiar--hecho');
        boton.setAttribute('aria-label', 'Copiar el código');
      }, 1600);
    } catch {
      // Sin permiso de portapapeles no hay nada que hacer; el código sigue a la vista.
    }
  });

  return elemento('figure.md__bloque', {}, [
    elemento('figcaption.md__bloque-cabecera', {}, [
      elemento('span.mono', { texto: lenguaje || 'texto' }),
      boton,
    ]),
    elemento('pre.md__pre', {}, [elemento('code', { texto: codigo })]),
  ]);
}
