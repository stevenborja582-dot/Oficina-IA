/**
 * Avisos flotantes. El borrado nunca es definitivo de golpe: siempre hay una
 * ventana de "Deshacer", igual que en la v1.
 */
import { elemento, reemplazar } from './dom.js';
import { icono } from './iconos.js';

const DURACION = 7000;

function contenedor() {
  let zona = document.getElementById('avisos');
  if (!zona) {
    zona = elemento('div.avisos#avisos', { role: 'status', 'aria-live': 'polite' });
    document.body.append(zona);
  }
  return zona;
}

/**
 * avisar('Texto') · avisar('Texto', { tipo: 'error' })
 * avisar('Borrado', { accion: { texto: 'Deshacer', alPulsar: fn } })
 */
export function avisar(texto, { tipo = 'info', accion = null, duracion = DURACION } = {}) {
  const zona = contenedor();

  const boton =
    accion &&
    elemento('button.boton.boton--pequeno.aviso__accion', {
      type: 'button',
      texto: accion.texto,
      alClick: () => {
        cerrar();
        accion.alPulsar();
      },
    });

  const tarjeta = elemento(`div.aviso.aviso--${tipo}`, {}, [
    elemento('span.aviso__punto', { 'aria-hidden': 'true' }),
    elemento('span.aviso__texto', { texto }),
    boton,
    elemento('button.boton-icono', {
      type: 'button',
      'aria-label': 'Cerrar aviso',
      alClick: () => cerrar(),
    }, [icono('cerrar')]),
  ]);

  let temporizador = null;
  function cerrar() {
    clearTimeout(temporizador);
    tarjeta.remove();
  }

  zona.append(tarjeta);
  temporizador = setTimeout(cerrar, duracion);

  // Si el ratón se queda encima, el aviso espera: nadie pierde un "Deshacer".
  tarjeta.addEventListener('mouseenter', () => clearTimeout(temporizador));
  tarjeta.addEventListener('mouseleave', () => {
    temporizador = setTimeout(cerrar, 2500);
  });

  return cerrar;
}

export const avisarError = (error) =>
  avisar(error?.message ?? String(error), { tipo: 'error', duracion: 9000 });

export const limpiarAvisos = () => reemplazar(contenedor());
