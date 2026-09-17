/**
 * Lanzar una misión y verla pasar (Fase 6).
 *
 * El panel es el mismo tanto si la orden va a toda la oficina como si va a una
 * sala: cambia a quién se le pide, no cómo se enseña. La escena de la sala se
 * suscribe a `alCambiar` y mueve a la gente según el estado real de cada paso.
 */
import { elemento, reemplazar } from './dom.js';
import { icono } from './iconos.js';
import { api } from './api.js';
import { renderizarMarkdown } from './markdown.js';
import { avisar, avisarError } from './notificaciones.js';

const ETIQUETA_ESTADO = {
  repartiendo: 'Repartiendo el encargo',
  trabajando: 'El equipo está trabajando',
  resumiendo: 'Juntando lo que ha traído cada uno',
  lista: 'Lista',
  error: 'Se quedó a medias',
  detenida: 'Detenida',
};

const ETIQUETA_PASO = {
  pendiente: 'Esperando',
  trabajando: 'Trabajando',
  lista: 'Entregado',
  error: 'No pudo',
};

/**
 * @param {object} opciones.sala       sala a la que se acota, o null para toda la oficina
 * @param {Function} opciones.alCambiar  se llama con el estado en cada evento
 */
export function panelMision({ sala = null, alCambiar = () => {} } = {}) {
  let estado = null;
  let corte = null;

  const campo = elemento('textarea.control.compositor__campo', {
    name: 'orden',
    rows: 2,
    maxLength: 4000,
    placeholder: sala
      ? `Dale una orden al equipo de ${sala.nombre}…`
      : 'Dale una orden a la oficina. Ej: "Prepárame el lanzamiento de la beta".',
    'aria-label': sala ? `Orden para el equipo de ${sala.nombre}` : 'Orden para la oficina',
  });

  const botonLanzar = elemento('button.boton.boton--primario', {
    type: 'submit',
  }, [icono('enviar', { clase: 'boton__icono' }), elemento('span.boton__texto', { texto: 'Poner a trabajar' })]);

  const botonDetener = elemento('button.boton', {
    type: 'button',
    hidden: true,
    alClick: () => {
      corte?.abort();
      if (estado?.id) api.detenerMision(estado.id).catch(() => {});
    },
  }, [icono('detener', { clase: 'boton__icono' }), elemento('span.boton__texto', { texto: 'Detener' })]);

  const cabeceraEstado = elemento('div.mision__estado', { role: 'status' });
  const listaPasos = elemento('ol.mision__pasos');
  const resultado = elemento('div.mision__resultado.prosa');
  const cuerpo = elemento('div.mision__cuerpo', { hidden: true }, [cabeceraEstado, listaPasos, resultado]);

  /* — Pintado — */

  function pintarEstado() {
    if (!estado) {
      cuerpo.hidden = true;
      return;
    }
    cuerpo.hidden = false;

    const enMarcha = ['repartiendo', 'trabajando', 'resumiendo'].includes(estado.estado);
    botonDetener.hidden = !enMarcha;
    botonLanzar.disabled = enMarcha;

    reemplazar(
      cabeceraEstado,
      elemento(`span.mision__pulso${enMarcha ? '.mision__pulso--vivo' : ''}`, {
        'aria-hidden': 'true',
        datos: { estado: estado.estado },
      }),
      elemento('div', {}, [
        elemento('strong', { texto: estado.titulo || ETIQUETA_ESTADO[estado.estado] || estado.estado }),
        elemento('p.campo__pista', {
          texto: estado.titulo ? (ETIQUETA_ESTADO[estado.estado] ?? estado.estado) : estado.orden,
        }),
      ]),
      estado.coordinador &&
        elemento('span.chip.chip--neutro', { texto: `Coordina ${estado.coordinador.nombre}` }),
    );

    reemplazar(listaPasos, ...(estado.pasos ?? []).map((paso) =>
      elemento(`li.paso-mision.paso-mision--${paso.estado}`, {}, [
        elemento('div.paso-mision__quien', {}, [
          elemento('strong', { texto: paso.personaje_nombre ?? 'Alguien' }),
          paso.personaje_app && elemento('span.chip.chip--neutro.mono', { texto: paso.personaje_app }),
          elemento('span.paso-mision__marca', { texto: ETIQUETA_PASO[paso.estado] ?? paso.estado }),
        ]),
        elemento('p.paso-mision__encargo', { texto: paso.encargo }),
        paso.error && elemento('p.conector__error', { texto: paso.error }),
        paso.resultado &&
          elemento('details.paso-mision__detalle', {}, [
            elemento('summary', { texto: 'Lo que entregó' }),
            renderizarMarkdown(paso.resultado),
          ]),
      ])));

    if (estado.resultado) {
      reemplazar(
        resultado,
        elemento('h3.mision__titulo-resultado', { texto: 'Resultado' }),
        renderizarMarkdown(estado.resultado),
      );
      resultado.hidden = false;
    } else if (estado.error) {
      reemplazar(resultado, elemento('p.conector__error', { texto: estado.error }));
      resultado.hidden = false;
    } else {
      resultado.hidden = true;
    }

    alCambiar(estado);
  }

  /* — Lanzar — */

  async function lanzar(orden) {
    corte = new AbortController();
    estado = { estado: 'repartiendo', orden, pasos: [], titulo: '', resultado: '', error: null };
    pintarEstado();

    let respuesta;
    try {
      respuesta = await fetch('/api/misiones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Peticion-Oficina': '1' },
        body: JSON.stringify({ orden, sala_id: sala?.id ?? null }),
        signal: corte.signal,
      });
    } catch (error) {
      estado = null;
      pintarEstado();
      if (error.name !== 'AbortError') avisarError(error);
      return;
    }

    if (!respuesta.ok) {
      const datos = await respuesta.json().catch(() => ({}));
      estado = null;
      pintarEstado();
      avisarError(new Error(datos.error ?? 'No se pudo lanzar la misión.'));
      return;
    }

    const lector = respuesta.body.getReader();
    const decodificador = new TextDecoder();
    let pendiente = '';

    try {
      while (true) {
        const { done, value } = await lector.read();
        if (done) break;
        pendiente += decodificador.decode(value, { stream: true });
        const bloques = pendiente.split('\n\n');
        pendiente = bloques.pop() ?? '';
        for (const bloque of bloques) {
          const linea = bloque.split('\n').find((entrada) => entrada.startsWith('data: '));
          if (linea) aplicar(JSON.parse(linea.slice(6)));
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        estado = { ...estado, estado: 'error', error: error.message };
        pintarEstado();
      }
    } finally {
      corte = null;
      botonLanzar.disabled = false;
      botonDetener.hidden = true;
    }
  }

  function aplicar(evento) {
    if (evento.tipo === 'inicio') {
      estado = {
        ...estado,
        id: evento.mision.id,
        coordinador: evento.coordinador,
        coordinador_id: evento.coordinador?.id,
        equipo: evento.equipo,
      };
    } else if (evento.tipo === 'reparto') {
      estado = {
        ...estado,
        estado: 'trabajando',
        titulo: evento.titulo,
        pasos: evento.pasos.map((paso) => ({ ...paso, estado: 'pendiente', resultado: '', error: null })),
      };
    } else if (evento.tipo === 'paso') {
      estado = {
        ...estado,
        pasos: estado.pasos.map((paso) =>
          (paso.id === evento.id
            ? { ...paso, estado: evento.estado, resultado: evento.resultado ?? paso.resultado, error: evento.error ?? null }
            : paso)),
      };
    } else if (evento.tipo === 'estado') {
      estado = { ...estado, estado: evento.estado };
    } else if (evento.tipo === 'fin') {
      estado = {
        ...estado,
        estado: evento.estado,
        resultado: evento.resultado ?? '',
        error: evento.error ?? null,
      };
      if (evento.estado === 'lista') avisar('La oficina terminó tu encargo.', { tipo: 'exito' });
    }
    pintarEstado();
  }

  const formulario = elemento('form.mision__barra', { novalidate: true }, [
    elemento('div.compositor__caja', {}, [campo]),
    elemento('div.mision__acciones', {}, [botonDetener, botonLanzar]),
  ]);

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const orden = campo.value.trim();
    if (!orden) {
      campo.focus();
      return;
    }
    campo.value = '';
    lanzar(orden);
  });

  // Enter manda, Mayús+Enter salta de línea: el mismo gesto que el chat.
  campo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      formulario.requestSubmit();
    }
  });

  const nodo = elemento('section.mision', {}, [
    elemento('div.mision__cabecera', {}, [
      elemento('span.mision__icono', { 'aria-hidden': 'true' }, [icono('chispa')]),
      elemento('div', {}, [
        elemento('h2.mision__titulo', { texto: sala ? `Poner a trabajar a ${sala.nombre}` : 'Poner a trabajar a la oficina' }),
        elemento('p.campo__pista', {
          texto: sala
            ? 'Solo trabajarán los de esta sala. El encargo se reparte según su especialidad.'
            : 'El encargo se reparte entre quien pueda hacerlo, según su especialidad y su app.',
        }),
      ]),
    ]),
    formulario,
    cuerpo,
  ]);

  return {
    nodo,
    detener: () => corte?.abort(),
    /** Vuelve a pintar una misión guardada, para reabrirla desde el histórico. */
    mostrar: (mision) => {
      estado = { ...mision, coordinador: null };
      pintarEstado();
    },
  };
}
