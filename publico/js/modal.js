/**
 * Modal sobre el elemento <dialog> nativo: la trampa de foco, el Escape y el velo
 * los pone el navegador, así que no hay que reimplementarlos (ni equivocarse).
 */
import { elemento } from './dom.js';
import { icono } from './iconos.js';

/**
 * abrirModal({ titulo, subtitulo, contenido, acciones })
 * `acciones` recibe la función `cerrar` y devuelve los botones del pie.
 */
export function abrirModal({ titulo, subtitulo = '', contenido, acciones = () => [], alCerrar = null }) {
  const dialogo = elemento('dialog.modal', {
    'aria-labelledby': 'modal-titulo',
  });

  function cerrar() {
    if (!dialogo.open) return;
    dialogo.close();
  }

  dialogo.addEventListener('close', () => {
    dialogo.remove();
    if (alCerrar) alCerrar();
  });

  // Clic fuera del panel (sobre el velo) también cierra.
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) cerrar();
  });

  const cabecera = elemento('header.modal__cabecera', {}, [
    elemento('div', {}, [
      elemento('h2.modal__titulo#modal-titulo', { texto: titulo }),
      subtitulo && elemento('p.modal__sub', { texto: subtitulo }),
    ]),
    elemento('button.boton-icono.modal__cerrar', {
      type: 'button',
      'aria-label': 'Cerrar',
      alClick: cerrar,
    }, [icono('cerrar')]),
  ]);

  const cuerpo = elemento('div.modal__cuerpo');
  cuerpo.append(contenido);

  const pie = elemento('footer.modal__pie', {}, acciones(cerrar));

  dialogo.append(cabecera, cuerpo, pie);
  document.body.append(dialogo);
  dialogo.showModal();

  // El primer campo útil recibe el foco; si no hay ninguno, lo recibe el diálogo.
  const primero = dialogo.querySelector('input:not([type=hidden]), textarea, select');
  if (primero) primero.focus({ preventScroll: true });

  return { dialogo, cuerpo, pie, cerrar };
}

/* ── Campos de formulario ────────────────────────────────────────────────── */

let contadorCampos = 0;

/** Campo genérico con etiqueta, pista y hueco para el mensaje de error. */
export function campo({ etiqueta, pista = '', control, id = null, obligatorio = false }) {
  contadorCampos += 1;
  const identificador = id ?? `campo-${contadorCampos}`;
  const idPista = `${identificador}-pista`;

  control.id = identificador;
  control.classList.add('control');
  if (obligatorio) control.required = true;
  if (pista) control.setAttribute('aria-describedby', idPista);

  return elemento('div.campo', {}, [
    elemento('label.campo__etiqueta', {
      for: identificador,
      texto: obligatorio ? `${etiqueta} *` : etiqueta,
    }),
    control,
    pista && elemento('p.campo__pista', { id: idPista, texto: pista }),
    elemento('p.campo__error', { 'data-error-de': identificador, hidden: true }),
  ]);
}

export const entrada = (atributos = {}) => elemento('input', { type: 'text', ...atributos });
export const areaTexto = (atributos = {}) => elemento('textarea', atributos);

export function seleccion(opciones, { valor, ...atributos } = {}) {
  return elemento('select', atributos, opciones.map(([clave, texto]) =>
    elemento('option', { value: clave, texto, selected: clave === valor }),
  ));
}

/** Pinta el error devuelto por el servidor junto al campo que lo provocó. */
export function mostrarErrorDeCampo(dialogo, detalles, mensaje) {
  dialogo.querySelectorAll('.campo__error').forEach((nodo) => {
    nodo.hidden = true;
    nodo.textContent = '';
  });
  dialogo.querySelectorAll('[aria-invalid]').forEach((nodo) => nodo.removeAttribute('aria-invalid'));

  const nombreCampo = detalles?.campo;
  const control = nombreCampo ? dialogo.querySelector(`[name="${CSS.escape(nombreCampo)}"]`) : null;

  if (!control) return false;

  const hueco = dialogo.querySelector(`[data-error-de="${CSS.escape(control.id)}"]`);
  control.setAttribute('aria-invalid', 'true');
  if (hueco) {
    hueco.textContent = mensaje;
    hueco.hidden = false;
  }
  control.focus();
  return true;
}
