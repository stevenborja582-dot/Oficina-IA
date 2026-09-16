/**
 * Vista "plano": el mapa de la oficina.
 *
 * En pantallas de 780 px o más se dibuja el plano SVG con las salas como zonas
 * clicables. Por debajo no se encoge el plano — se sustituye por una lista de salas
 * pensada para el pulgar. Las dos listas salen de los mismos datos.
 */
import { elemento, elementoSvg, normalizar, reemplazar } from './dom.js';
import { icono, trazosDe } from './iconos.js';
import { variablesSala } from './color.js';
import { avatar, chip } from './piezas.js';

const RELLENO = 20;
// La sala tiene sitio para dos filas de cuatro escritorios. A partir de ahí, el
// octavo hueco pasa a ser el contador "+N más" y el plano no se deforma.
const COLUMNAS_ESCRITORIO = 4;
const FILAS_ESCRITORIO = 2;
const HUECOS_ESCRITORIO = COLUMNAS_ESCRITORIO * FILAS_ESCRITORIO;
const PRIMER_ESCRITORIO_Y = 110;
const PASO_ESCRITORIO = 40;

/** Recorta un texto a lo que cabe de verdad en el plano. */
function recortar(texto, maximo) {
  const limpio = String(texto ?? '').trim();
  return limpio.length > maximo ? `${limpio.slice(0, maximo - 1).trimEnd()}…` : limpio;
}

function contarPersonajes(total) {
  if (total === 0) return 'Sala vacía';
  return total === 1 ? '1 personaje' : `${total} personajes`;
}

/* ── Sala dentro del plano SVG ───────────────────────────────────────────── */

function salaEnPlano(sala, personajes, { esFilaSuperior }) {
  const { plano_x: x, plano_y: y, plano_ancho: ancho, plano_alto: alto } = sala;
  const variables = variablesSala(sala.color_acento);

  const grupo = elementoSvg('g', { class: 'sala-plano__grupo' });

  grupo.append(
    elementoSvg('rect', { class: 'sala-plano__sombra', x: x + 6, y: y + 10, width: ancho - 12, height: alto, rx: 16 }),
    elementoSvg('rect', { class: 'sala-plano__fondo', x, y, width: ancho, height: alto, rx: 14 }),
    elementoSvg('rect', { class: 'sala-plano__foco', x: x - 4, y: y - 4, width: ancho + 8, height: alto + 8, rx: 18 }),
  );

  // Insignia con el icono de la sala.
  grupo.append(
    elementoSvg('rect', { class: 'sala-plano__insignia', x: x + RELLENO, y: y + RELLENO, width: 38, height: 38, rx: 11 }),
  );
  const iconoSala = elementoSvg('g', {
    class: 'sala-plano__icono',
    transform: `translate(${x + RELLENO + 8}, ${y + RELLENO + 8}) scale(0.92)`,
  });
  trazosDe(sala.icono).forEach((d) => iconoSala.append(elementoSvg('path', { d })));
  grupo.append(iconoSala);

  // Título, conteo y descripción.
  grupo.append(
    elementoSvg('text', {
      class: 'sala-plano__nombre',
      x: x + RELLENO + 52,
      y: y + RELLENO + 19,
      texto: recortar(sala.nombre, 24),
    }),
    elementoSvg('text', {
      class: 'sala-plano__conteo',
      x: x + RELLENO + 52,
      y: y + RELLENO + 36,
      texto: contarPersonajes(personajes.length),
    }),
    elementoSvg('text', {
      class: 'sala-plano__descripcion',
      x: x + RELLENO,
      y: y + RELLENO + 74,
      texto: recortar(sala.descripcion, 46),
    }),
  );

  // Un escritorio por personaje: la sala se ve llena o vacía de un vistazo.
  const posicion = (indice) => ({
    ex: x + RELLENO + (indice % COLUMNAS_ESCRITORIO) * 81,
    ey: y + PRIMER_ESCRITORIO_Y + Math.floor(indice / COLUMNAS_ESCRITORIO) * PASO_ESCRITORIO,
  });

  const hayDesborde = personajes.length > HUECOS_ESCRITORIO;
  const dibujados = hayDesborde ? HUECOS_ESCRITORIO - 1 : personajes.length;

  personajes.slice(0, dibujados).forEach((personaje, indice) => {
    const { ex, ey } = posicion(indice);
    grupo.append(
      elementoSvg('rect', {
        class: `sala-plano__escritorio${personaje.estado === 'borrador' ? ' sala-plano__escritorio--borrador' : ''}`,
        x: ex,
        y: ey,
        width: 69,
        height: 22,
        rx: 6,
      }),
      elementoSvg('circle', { class: 'sala-plano__silla', cx: ex + 34.5, cy: ey + 32, r: 6 }),
    );
  });

  if (hayDesborde) {
    const { ex, ey } = posicion(dibujados);
    grupo.append(
      elementoSvg('text', {
        class: 'sala-plano__mas',
        x: ex,
        y: ey + 16,
        texto: `+${personajes.length - dibujados} más`,
      }),
    );
  }

  // Sala vacía: un escritorio fantasma dice "aquí cabe alguien" sin ocupar sitio.
  if (personajes.length === 0) {
    const { ex, ey } = posicion(0);
    grupo.append(
      elementoSvg('rect', {
        class: 'sala-plano__escritorio sala-plano__escritorio--borrador',
        x: ex,
        y: ey,
        width: 69,
        height: 22,
        rx: 6,
        opacity: 0.6,
      }),
    );
  }

  // Puerta: un hueco en el muro que da al pasillo.
  const centro = x + ancho / 2;
  const yPuerta = esFilaSuperior ? y + alto : y;
  grupo.append(
    elementoSvg('line', {
      class: 'sala-plano__puerta',
      x1: centro - 26,
      y1: yPuerta,
      x2: centro + 26,
      y2: yPuerta,
    }),
  );

  const enlace = elementoSvg('a', {
    class: 'sala-plano',
    href: `#/sala/${sala.slug}`,
    'aria-label': `${sala.nombre}. ${contarPersonajes(personajes.length)}.`,
    'data-slug': sala.slug,
  });
  enlace.style.setProperty('--sala-color', variables['--sala-color']);
  enlace.style.setProperty('--sala-tinta', variables['--sala-tinta']);
  grupo.setAttribute('aria-hidden', 'true');
  enlace.append(grupo);
  return enlace;
}

function lienzoPlano(estado) {
  const { plano } = estado;
  const svg = elementoSvg('svg', {
    class: 'plano__lienzo',
    viewBox: `0 0 ${plano.ancho} ${plano.alto}`,
    role: 'group',
    'aria-label': 'Plano de la oficina',
    preserveAspectRatio: 'xMidYMid meet',
  });

  // Suelo con una rejilla técnica muy tenue.
  const defs = elementoSvg('defs');
  const patron = elementoSvg('pattern', {
    id: 'rejilla-suelo',
    width: 24,
    height: 24,
    patternUnits: 'userSpaceOnUse',
  });
  patron.append(elementoSvg('path', { class: 'plano__rejilla', d: 'M24 0H0V24', fill: 'none' }));
  defs.append(patron);
  svg.append(defs);

  svg.append(
    elementoSvg('rect', { class: 'plano__suelo', x: 0, y: 0, width: plano.ancho, height: plano.alto }),
    elementoSvg('rect', { x: 0, y: 0, width: plano.ancho, height: plano.alto, fill: 'url(#rejilla-suelo)' }),
  );

  // Pasillo central.
  const { pasillo } = plano;
  svg.append(
    elementoSvg('rect', {
      class: 'plano__pasillo-fondo',
      x: pasillo.x,
      y: pasillo.y,
      width: pasillo.ancho,
      height: pasillo.alto,
      rx: 12,
    }),
    elementoSvg('line', {
      class: 'plano__pasillo-linea',
      x1: pasillo.x + 24,
      y1: pasillo.y + pasillo.alto / 2,
      x2: pasillo.x + pasillo.ancho - 24,
      y2: pasillo.y + pasillo.alto / 2,
    }),
    elementoSvg('text', {
      class: 'plano__pasillo-texto',
      x: plano.ancho / 2,
      y: pasillo.y + pasillo.alto / 2 - 14,
      'text-anchor': 'middle',
      texto: 'Pasillo',
    }),
  );

  estado.salas.forEach((sala) => {
    const personajes = estado.personajes.filter((personaje) => personaje.sala_id === sala.id);
    svg.append(salaEnPlano(sala, personajes, { esFilaSuperior: sala.plano_y < pasillo.y }));
  });

  return svg;
}

/* ── Lista de salas (móvil) ──────────────────────────────────────────────── */

function filaSala(sala, total) {
  const enlace = elemento('a.sala-fila', {
    href: `#/sala/${sala.slug}`,
    variables: variablesSala(sala.color_acento),
    'data-slug': sala.slug,
  }, [
    elemento('span.sala-fila__insignia', { 'aria-hidden': 'true' }, [icono(sala.icono)]),
    elemento('span.sala-fila__texto', {}, [
      elemento('span.sala-fila__nombre', { texto: sala.nombre }),
      elemento('span.sala-fila__descripcion', { texto: sala.descripcion || 'Sin descripción' }),
      // El conteo va debajo, no al lado: así el nombre de la sala nunca se parte
      // en dos líneas para dejarle sitio a un chip.
      elemento('span.sala-fila__conteo', {}, [
        chip(contarPersonajes(total), { color: sala.color_acento, punto: true }),
      ]),
    ]),
    elemento('span.sala-fila__flecha', { 'aria-hidden': 'true' }, [icono('flechaDerecha', { clase: 'boton__icono' })]),
  ]);
  return enlace;
}

/* ── Resultados de búsqueda ──────────────────────────────────────────────── */

function resultadoPersonaje(personaje, sala) {
  return elemento('a.resultado', { href: `#/sala/${sala.slug}` }, [
    avatar(personaje, sala.color_acento, { tamano: 32 }),
    elemento('span.resultado__texto', {}, [
      elemento('span.resultado__nombre', { texto: personaje.nombre }),
      elemento('span.resultado__rol', { texto: personaje.rol_titulo || 'Sin rol asignado' }),
    ]),
    elemento('span.resultado__sala', {}, [chip(sala.nombre, { color: sala.color_acento, punto: true })]),
  ]);
}

/* ── Vista completa ──────────────────────────────────────────────────────── */

export function vistaPlano(estado, acciones) {
  const seccion = elemento('section');
  let consulta = '';

  const zonaPlano = elemento('div.plano.solo-plano');
  const zonaLista = elemento('div.salas-lista.solo-lista');
  const zonaResultados = elemento('section.resultados', { hidden: true });

  const campo = elemento('input.control', {
    type: 'search',
    id: 'buscar-oficina',
    placeholder: 'Buscar un personaje o una sala…',
    autocomplete: 'off',
    'aria-describedby': 'ayuda-buscar',
    alInput: (evento) => {
      consulta = normalizar(evento.target.value);
      pintar();
    },
  });

  const encabezado = elemento('header.encabezado', {}, [
    elemento('div.encabezado__texto', {}, [
      elemento('p.etiqueta-seccion', { texto: 'Planta principal' }),
      elemento('h1.encabezado__titulo', { texto: 'La oficina' }),
      elemento('p.encabezado__sub', {
        texto: 'Cada sala es un departamento. Entra en una para ver y editar sus personajes.',
      }),
    ]),
    elemento('div.encabezado__acciones', {}, [
      estado.permisos.administrarSalas &&
        elemento('button.boton', {
          type: 'button',
          alClick: () => acciones.nuevaSala(),
        }, [icono('mas', { clase: 'boton__icono' }), 'Nueva sala']),
    ]),
  ]);

  const barra = elemento('div.barra-herramientas', {}, [
    elemento('div.buscador', {}, [
      icono('buscar', { clase: 'buscador__icono' }),
      campo,
    ]),
    elemento('p.barra-herramientas__conteo#ayuda-buscar', { role: 'status' }),
  ]);

  function pintar() {
    const conteo = barra.querySelector('#ayuda-buscar');

    const salasConDatos = estado.salas.map((sala) => {
      const personajes = estado.personajes.filter((personaje) => personaje.sala_id === sala.id);
      const coincideSala = !consulta || normalizar(`${sala.nombre} ${sala.descripcion}`).includes(consulta);
      const personajesCoinciden = personajes.filter((personaje) =>
        normalizar(`${personaje.nombre} ${personaje.rol_titulo} ${personaje.modelo}`).includes(consulta),
      );
      return {
        sala,
        personajes,
        coincide: coincideSala || personajesCoinciden.length > 0,
        personajesCoinciden: consulta ? personajesCoinciden : [],
      };
    });

    reemplazar(zonaPlano, lienzoPlano(estado));
    reemplazar(zonaLista, ...salasConDatos.map(({ sala, personajes }) => filaSala(sala, personajes.length)));

    // Atenuar lo que no encaja, en vez de hacerlo desaparecer: el plano no se mueve.
    salasConDatos.forEach(({ sala, coincide }) => {
      const apagada = Boolean(consulta) && !coincide;
      [zonaPlano, zonaLista].forEach((zona) => {
        const nodo = zona.querySelector(`[data-slug="${CSS.escape(sala.slug)}"]`);
        if (!nodo) return;
        nodo.classList.toggle('sala-plano--apagada', apagada && zona === zonaPlano);
        nodo.style.setProperty('opacity', apagada && zona === zonaLista ? '0.35' : '');
        if (apagada) nodo.setAttribute('tabindex', '-1');
      });
    });

    const encontrados = salasConDatos.flatMap(({ sala, personajesCoinciden }) =>
      personajesCoinciden.map((personaje) => ({ personaje, sala })),
    );

    if (consulta) {
      const salasVisibles = salasConDatos.filter((entrada) => entrada.coincide).length;
      conteo.textContent = `${salasVisibles} sala(s) y ${encontrados.length} personaje(s) coinciden con «${campo.value.trim()}».`;
    } else {
      const totalPersonajes = estado.personajes.length;
      conteo.textContent = `${estado.salas.length} salas · ${totalPersonajes} personaje${totalPersonajes === 1 ? '' : 's'}`;
    }

    zonaResultados.hidden = encontrados.length === 0;
    if (encontrados.length > 0) {
      reemplazar(
        zonaResultados,
        elemento('p.etiqueta-seccion', { texto: 'Personajes encontrados' }),
        elemento('div.resultados__lista', {}, encontrados.map(({ personaje, sala }) => resultadoPersonaje(personaje, sala))),
      );
    }
  }

  seccion.append(encabezado, barra, zonaPlano, zonaLista, zonaResultados);
  pintar();
  return seccion;
}
