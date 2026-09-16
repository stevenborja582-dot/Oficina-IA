/**
 * Helpers de DOM. Todo se construye con `createElement` y `textContent`:
 * ningún dato del usuario pasa jamás por `innerHTML`.
 */

const ESPACIO_SVG = 'http://www.w3.org/2000/svg';

/**
 * elemento('div.tarjeta#id', { atributos }, [hijos])
 * Las clases y el id se escriben en el selector; el resto, en los atributos.
 */
export function elemento(selector, atributos = {}, hijos = []) {
  const { etiqueta, id, clases } = analizarSelector(selector);
  const nodo = document.createElement(etiqueta);

  if (id) nodo.id = id;
  clases.forEach((clase) => nodo.classList.add(clase));

  aplicarAtributos(nodo, atributos);
  añadirHijos(nodo, hijos);
  return nodo;
}

/** 'button.boton.boton--primario#guardar' → etiqueta, id y clases, en cualquier orden. */
function analizarSelector(selector) {
  const texto = String(selector);
  return {
    etiqueta: texto.match(/^[a-zA-Z][a-zA-Z0-9-]*/)?.[0] ?? 'div',
    id: texto.match(/#([^.#]+)/)?.[1] ?? null,
    clases: [...texto.matchAll(/\.([^.#]+)/g)].map((coincidencia) => coincidencia[1]),
  };
}

/** Igual que `elemento`, pero en el espacio de nombres SVG. */
export function elementoSvg(etiqueta, atributos = {}, hijos = []) {
  const nodo = document.createElementNS(ESPACIO_SVG, etiqueta);
  aplicarAtributos(nodo, atributos, true);
  añadirHijos(nodo, hijos);
  return nodo;
}

function aplicarAtributos(nodo, atributos, esSvg = false) {
  Object.entries(atributos ?? {}).forEach(([clave, valor]) => {
    if (valor === null || valor === undefined || valor === false) return;

    if (clave === 'texto') {
      nodo.textContent = String(valor);
    } else if (clave === 'clase') {
      String(valor).split(/\s+/).filter(Boolean).forEach((c) => nodo.classList.add(c));
    } else if (clave === 'datos') {
      Object.entries(valor).forEach(([dato, contenido]) => {
        nodo.dataset[dato] = String(contenido);
      });
    } else if (clave === 'variables') {
      // Propiedades personalizadas vía CSSOM: no son atributos `style`, así que
      // no chocan con la Content-Security-Policy.
      Object.entries(valor).forEach(([variable, contenido]) => {
        nodo.style.setProperty(variable, String(contenido));
      });
    } else if (/^al[A-Z]/.test(clave)) {
      // alClick → 'click'. El patrón exige mayúscula para no confundir `alt` con un evento.
      nodo.addEventListener(clave.slice(2).toLowerCase(), valor);
    } else if (!esSvg && clave in nodo && clave !== 'list' && typeof valor !== 'object') {
      try {
        nodo[clave] = valor;
      } catch {
        // Propiedades de solo lectura (button.form, input.list…): van como atributo.
        nodo.setAttribute(clave, String(valor));
      }
    } else {
      nodo.setAttribute(clave, String(valor));
    }
  });
}

function añadirHijos(nodo, hijos) {
  const lista = Array.isArray(hijos) ? hijos : [hijos];
  lista.flat().forEach((hijo) => {
    if (hijo === null || hijo === undefined || hijo === false) return;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  });
}

/** Sustituye el contenido de un contenedor de una sola vez. */
export function reemplazar(contenedor, ...hijos) {
  contenedor.replaceChildren();
  añadirHijos(contenedor, hijos);
  return contenedor;
}

export const buscar = (selector, raiz = document) => raiz.querySelector(selector);
export const buscarTodos = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

/** Normaliza para buscar sin acentos ni mayúsculas. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
