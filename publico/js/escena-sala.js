/**
 * La sala por dentro, viva (Fase 6).
 *
 * Es DOM y transformaciones CSS, no canvas, por tres razones concretas: cada
 * personaje es un `<button>` de verdad —se alcanza con el tabulador y se puede
 * pulsar—, los nombres son texto que el navegador sabe leer en voz alta, y los
 * colores salen de las mismas variables que el resto de la app, así que el tema
 * oscuro sale gratis.
 *
 * Las coordenadas viven en un lienzo lógico fijo (1000 × 620) que se escala al
 * ancho disponible. Así una sala se ve igual en un portátil y en un móvil, y la
 * lógica de movimiento no tiene que saber nada de píxeles reales.
 */
import { elemento, reemplazar } from './dom.js';
import { icono } from './iconos.js';
import { iniciales } from './piezas.js';
import { tintaLegible, variablesSala } from './color.js';

const LIENZO = { ancho: 1000, alto: 620 };

/** Zona por la que se puede caminar. Fuera de esto hay paredes y muebles. */
const SUELO = { x0: 90, x1: 910, y0: 210, y1: 560 };

const VELOCIDAD = 42;        // unidades lógicas por segundo
const PAUSA_MINIMA = 1200;   // lo que se queda quieto antes de buscar otro sitio
const PAUSA_MAXIMA = 4500;
const DISTANCIA_CHARLA = 110;

const azar = (minimo, maximo) => minimo + Math.random() * (maximo - minimo);
const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Frases de pasillo. No dicen nada del trabajo: es ruido de oficina, y se nota. */
const CHARLAS = [
  '¿Tienes un minuto?', 'Te paso lo mío en nada.', '¿Café?', 'Eso ya lo tengo.',
  'Lo miro y te digo.', '¿Lo viste?', 'Voy con ello.', 'Me falta un dato.',
  '¿Quién lleva esto?', 'Casi está.',
];

const quiereQuieto = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Muebles ─────────────────────────────────────────────────────────────── */

/**
 * Los escritorios se reparten en dos hileras. Cada personaje tiene el suyo: es
 * su sitio, al que vuelve cuando no está haciendo nada más.
 */
function escritorios(total) {
  const porFila = Math.max(2, Math.ceil(total / 2));
  const anchoUtil = SUELO.x1 - SUELO.x0 - 80;
  const paso = anchoUtil / Math.max(1, porFila - 1);

  return Array.from({ length: total }, (_, indice) => {
    const fila = Math.floor(indice / porFila);
    const columna = indice % porFila;
    const x = porFila === 1 ? (SUELO.x0 + SUELO.x1) / 2 : SUELO.x0 + 40 + columna * paso;
    const y = fila === 0 ? 300 : 470;
    return { x, y, silla: { x, y: y + 52 } };
  });
}

function pintarMuebles(capa, sala, listaEscritorios) {
  const piezas = [];

  // Pizarra al fondo, con el nombre de la sala escrito en ella. Su rótulo se
  // calcula contra el fondo real de la pizarra —la superficie teñida al 8 % con
  // el color de la sala—, no contra el lienzo: si no, en oscuro se queda en 4:1.
  const { '--sala-tinta': tintaRotulo } = variablesSala(sala.color_acento, { tinte: 0.08 });
  piezas.push(
    elemento('div.mueble.mueble--pizarra', {
      variables: { '--x': '500px', '--y': '150px', '--rotulo-tinta': tintaRotulo },
    }, [
      elemento('span.mueble__rotulo', { texto: sala.nombre }),
      elemento('span.mueble__trazo'),
      elemento('span.mueble__trazo.mueble__trazo--corto'),
    ]),
  );

  // Mesa de reuniones: es donde se juntan cuando hay una misión.
  piezas.push(
    elemento('div.mueble.mueble--mesa', { variables: { '--x': '500px', '--y': '388px' } }, [
      elemento('span.mueble__tablero'),
    ]),
  );

  listaEscritorios.forEach((sitio, indice) => {
    piezas.push(
      elemento('div.mueble.mueble--escritorio', {
        variables: { '--x': `${sitio.x}px`, '--y': `${sitio.y}px` },
        datos: { escritorio: String(indice) },
      }, [
        elemento('span.mueble__tablero'),
        elemento('span.mueble__pantalla'),
      ]),
    );
  });

  // Plantas y archivadores en las esquinas: dan escala y rompen la simetría.
  const decorado = [
    { clase: 'planta', x: 120, y: 250 },
    { clase: 'planta', x: 880, y: 540 },
    { clase: 'archivador', x: 880, y: 250 },
    { clase: 'fuente', x: 120, y: 540 },
  ];
  decorado.forEach((pieza) => {
    piezas.push(
      elemento(`div.mueble.mueble--${pieza.clase}`, {
        variables: { '--x': `${pieza.x}px`, '--y': `${pieza.y}px` },
      }),
    );
  });

  reemplazar(capa, ...piezas);
}

/* ── Personajes ──────────────────────────────────────────────────────────── */

function crearFigura(personaje, sala, alPulsar) {
  const { '--sala-color': color } = variablesSala(sala.color_acento);
  /*
   * Las iniciales van en blanco sobre la cabeza, así que la cabeza tiene que ser
   * lo bastante oscura para que se lean: con el verde de Asistencia o el azul de
   * Desarrollo en crudo se quedaban en 3:1. `tintaLegible` contra blanco oscurece
   * el acento justo lo necesario para llegar a 4.5:1 — y de paso las figuras
   * quedan más sólidas.
   */
  const cabeza = tintaLegible(color, { fondo: '#ffffff' });

  const globo = elemento('span.figura__globo', { 'aria-hidden': 'true' });
  globo.hidden = true;

  const insignia = elemento('span.figura__app', { 'aria-hidden': 'true' });
  insignia.hidden = true;

  const nodo = elemento('button.figura', {
    type: 'button',
    variables: { '--figura-color': color, '--figura-cabeza': cabeza },
    datos: { personaje: String(personaje.id) },
    title: [personaje.nombre, personaje.rol_titulo, personaje.especialidad]
      .filter(Boolean).join(' · '),
    'aria-label': `${personaje.nombre}${personaje.rol_titulo ? `, ${personaje.rol_titulo}` : ''}`,
    alClick: () => alPulsar(personaje),
  }, [
    globo,
    elemento('span.figura__cuerpo', { 'aria-hidden': 'true' }, [
      elemento('span.figura__cabeza', {}, [elemento('span.figura__cara', { texto: iniciales(personaje.nombre) })]),
      elemento('span.figura__torso'),
      elemento('span.figura__pierna.figura__pierna--i'),
      elemento('span.figura__pierna.figura__pierna--d'),
    ]),
    elemento('span.figura__sombra', { 'aria-hidden': 'true' }),
    elemento('span.figura__nombre', { texto: personaje.nombre }),
    insignia,
  ]);

  return { nodo, globo, insignia };
}

/* ── La escena ───────────────────────────────────────────────────────────── */

/**
 * @param {object} sala
 * @param {Array}  personajes
 * @param {Function} alPulsarPersonaje
 * @returns {{nodo: HTMLElement, aplicarMision: Function, destruir: Function}}
 */
export function escenaSala(sala, personajes, { alPulsarPersonaje = () => {} } = {}) {
  const capaMuebles = elemento('div.escena__capa.escena__capa--muebles', { 'aria-hidden': 'true' });
  const capaFiguras = elemento('div.escena__capa.escena__capa--figuras');

  const lienzo = elemento('div.escena__lienzo', {
    variables: { '--ancho': `${LIENZO.ancho}`, '--alto': `${LIENZO.alto}` },
  }, [
    elemento('div.escena__pared', { 'aria-hidden': 'true' }),
    elemento('div.escena__suelo', { 'aria-hidden': 'true' }),
    capaMuebles,
    capaFiguras,
  ]);

  const nodo = elemento('div.escena', {
    variables: variablesSala(sala.color_acento),
  }, [lienzo]);

  const sitios = escritorios(Math.max(personajes.length, 2));
  pintarMuebles(capaMuebles, sala, sitios.slice(0, Math.max(personajes.length, 2)));

  /* — Estado de cada personaje — */
  const actores = personajes.map((personaje, indice) => {
    const sitio = sitios[indice % sitios.length];
    const { nodo: figura, globo, insignia } = crearFigura(personaje, sala, alPulsarPersonaje);
    capaFiguras.append(figura);

    return {
      personaje,
      figura,
      globo,
      insignia,
      casa: sitio.silla,
      x: sitio.silla.x,
      y: sitio.silla.y,
      destino: null,
      // Escalonado corto: con una espera larga, una sala de un solo personaje
      // parecería congelada justo cuando se abre, que es cuando más se mira.
      esperaHasta: performance.now() + indice * 220 + azar(0, 900),
      hablandoHasta: 0,
      tarea: null,          // 'reunion' | 'trabajando' | null
      mirando: 1,
    };
  });

  const puestos = () => actores.length > 0;

  /* — Movimiento — */

  function puntoLibre() {
    return {
      x: azar(SUELO.x0 + 30, SUELO.x1 - 30),
      y: azar(SUELO.y0 + 20, SUELO.y1 - 20),
    };
  }

  /** Sitio alrededor de la mesa de reuniones, repartido en círculo. */
  function sitioEnMesa(indice, total) {
    const angulo = (indice / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
    return {
      x: 500 + Math.cos(angulo) * 130,
      y: 388 + Math.sin(angulo) * 62,
    };
  }

  function decirAlgo(actor, texto, milisegundos = 2600) {
    actor.globo.textContent = texto;
    actor.globo.hidden = false;
    actor.hablandoHasta = performance.now() + milisegundos;
  }

  /** Dos que se cruzan y se dicen algo. Es lo que hace que la sala parezca viva. */
  function quizaCharlar(ahora) {
    for (let i = 0; i < actores.length; i += 1) {
      for (let j = i + 1; j < actores.length; j += 1) {
        const a = actores[i];
        const b = actores[j];
        if (a.hablandoHasta > ahora || b.hablandoHasta > ahora) continue;
        if (a.tarea === 'trabajando' || b.tarea === 'trabajando') continue;
        if (distancia(a, b) > DISTANCIA_CHARLA) continue;
        if (Math.random() > 0.006) continue;

        const frase = CHARLAS[Math.floor(Math.random() * CHARLAS.length)];
        decirAlgo(a, frase);
        decirAlgo(b, '…', 1800);
        return;
      }
    }
  }

  let anterior = performance.now();
  let bucle = null;

  function paso(ahora) {
    const delta = Math.min(0.05, (ahora - anterior) / 1000);
    anterior = ahora;

    for (const actor of actores) {
      if (actor.globo.hidden === false && actor.hablandoHasta <= ahora) actor.globo.hidden = true;

      if (!actor.destino) {
        // Quien está trabajando no se levanta; el resto pasea.
        if (actor.tarea === 'trabajando' || actor.tarea === 'reunion') continue;
        if (ahora >= actor.esperaHasta) {
          // Volver al escritorio estando ya en él no es un destino: sería quedarse
          // otro ciclo entero quieto, y la sala parecería congelada.
          const enCasa = distancia(actor, actor.casa) < 8;
          actor.destino = (!enCasa && Math.random() < 0.4) ? { ...actor.casa } : puntoLibre();
        }
        continue;
      }

      const dx = actor.destino.x - actor.x;
      const dy = actor.destino.y - actor.y;
      const resto = Math.hypot(dx, dy);

      if (resto < 2) {
        actor.x = actor.destino.x;
        actor.y = actor.destino.y;
        actor.destino = null;
        actor.esperaHasta = ahora + azar(PAUSA_MINIMA, PAUSA_MAXIMA);
        actor.figura.classList.remove('figura--andando');
      } else {
        const avance = Math.min(resto, VELOCIDAD * delta);
        actor.x += (dx / resto) * avance;
        actor.y += (dy / resto) * avance;
        if (Math.abs(dx) > 1) actor.mirando = dx > 0 ? 1 : -1;
        actor.figura.classList.add('figura--andando');
      }

      colocar(actor);
    }

    quizaCharlar(ahora);
    bucle = requestAnimationFrame(paso);
  }

  function colocar(actor) {
    actor.figura.style.setProperty('--x', `${actor.x}px`);
    actor.figura.style.setProperty('--y', `${actor.y}px`);
    actor.figura.style.setProperty('--mirando', String(actor.mirando));
    // Quien está más abajo tapa a quien está más arriba: profundidad sin 3D.
    actor.figura.style.setProperty('--capa', String(Math.round(actor.y)));
  }

  actores.forEach(colocar);

  if (puestos() && !quiereQuieto()) {
    bucle = requestAnimationFrame(paso);
  }

  /* — Reaccionar a una misión — */

  /**
   * El estado de la misión mueve a la gente de verdad: los que tienen encargo se
   * juntan en la mesa mientras se reparte, luego cada uno vuelve a su escritorio
   * a trabajar, y al terminar se sueltan otra vez.
   */
  function aplicarMision(estado) {
    const implicados = new Set((estado?.pasos ?? []).map((paso) => paso.personaje_id));
    const porPersonaje = new Map((estado?.pasos ?? []).map((paso) => [paso.personaje_id, paso]));

    let enMesa = 0;
    const totalMesa = [...implicados].length || 1;

    actores.forEach((actor) => {
      const paso = porPersonaje.get(actor.personaje.id);
      const esCoordinador = estado?.coordinador_id === actor.personaje.id;

      actor.figura.classList.toggle('figura--implicada', Boolean(paso) || esCoordinador);
      actor.figura.classList.toggle('figura--trabajando', paso?.estado === 'trabajando');
      actor.figura.classList.toggle('figura--lista', paso?.estado === 'lista');
      actor.figura.classList.toggle('figura--fallida', paso?.estado === 'error');

      if (paso?.estado === 'trabajando' && actor.personaje.app) {
        actor.insignia.textContent = actor.personaje.app;
        actor.insignia.hidden = false;
      } else {
        actor.insignia.hidden = true;
      }

      if (!estado || estado.estado === 'lista' || estado.estado === 'error' || estado.estado === 'detenida') {
        actor.tarea = null;
        if (paso?.estado === 'lista') decirAlgo(actor, 'Entregado.', 3200);
        if (paso?.estado === 'error') decirAlgo(actor, 'No pude.', 3200);
        return;
      }

      if (estado.estado === 'repartiendo' && (paso || esCoordinador)) {
        actor.tarea = 'reunion';
        actor.destino = sitioEnMesa(enMesa, totalMesa);
        enMesa += 1;
        if (esCoordinador) decirAlgo(actor, 'Repartiendo…', 4000);
        return;
      }

      if (paso?.estado === 'trabajando') {
        actor.tarea = 'trabajando';
        actor.destino = { ...actor.casa };
        return;
      }

      if (paso?.estado === 'lista') {
        actor.tarea = null;
        decirAlgo(actor, 'Listo.', 2600);
        return;
      }

      actor.tarea = paso ? 'reunion' : null;
    });

    // Con movimiento reducido no hay bucle: se coloca a cada uno donde le toca.
    if (quiereQuieto()) {
      actores.forEach((actor) => {
        if (actor.destino) {
          actor.x = actor.destino.x;
          actor.y = actor.destino.y;
          actor.destino = null;
        }
        colocar(actor);
      });
    }
  }

  return {
    nodo,
    aplicarMision,
    destruir: () => {
      if (bucle !== null) cancelAnimationFrame(bucle);
      bucle = null;
    },
  };
}
