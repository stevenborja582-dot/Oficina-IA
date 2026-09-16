/**
 * Vista "sala por dentro": la grilla de tarjetas de personajes heredada de la v1,
 * ahora acotada a un departamento y con su color de acento.
 */
import { elemento, normalizar, reemplazar } from './dom.js';
import { icono } from './iconos.js';
import { variablesSala } from './color.js';
import { avatar, chipEstado, chipProveedor, ETIQUETA_PROVEEDOR } from './piezas.js';

/* ── Tarjeta de personaje ────────────────────────────────────────────────── */

function tarjetaPersonaje(personaje, sala, acciones) {
  const puedeChatear = personaje.proveedor_ia !== 'externo';

  const accionPrincipal = personaje.enlace_externo
    ? elemento('a.boton.boton--pequeno', {
        href: personaje.enlace_externo,
        target: '_blank',
        rel: 'noopener noreferrer',
      }, [icono('enlace', { clase: 'boton__icono' }), 'Abrir'])
    : elemento('button.boton.boton--pequeno', {
        type: 'button',
        disabled: true,
        title: 'El chat llega en la Fase 2',
        'aria-label': `Chatear con ${personaje.nombre} — disponible en la Fase 2`,
      }, [icono('mensaje', { clase: 'boton__icono' }), 'Chatear']);

  return elemento(`article.tarjeta.personaje.personaje--${personaje.estado}`, {
    variables: variablesSala(sala.color_acento),
  }, [
    elemento('div.personaje__superior', {}, [
      avatar(personaje, sala.color_acento, { tamano: 44 }),
      elemento('div.personaje__identidad', {}, [
        elemento('h3.personaje__nombre', { texto: personaje.nombre }),
        elemento('p.personaje__rol', { texto: personaje.rol_titulo || 'Sin rol asignado' }),
        elemento('div.personaje__chips', {}, [
          chipProveedor(personaje),
          personaje.modelo && elemento('span.chip.chip--neutro.mono', { texto: personaje.modelo }),
          chipEstado(personaje),
        ]),
      ]),
    ]),

    personaje.persona_prompt &&
      elemento('p.personaje__persona', { texto: personaje.persona_prompt, title: personaje.persona_prompt }),

    elemento('div.personaje__acciones', {}, [
      accionPrincipal,
      elemento('button.boton-icono.a-la-derecha', {
        type: 'button',
        'aria-label': `Editar ${personaje.nombre}`,
        title: 'Editar',
        alClick: () => acciones.editarPersonaje(personaje),
      }, [icono('lapiz')]),
      elemento('button.boton-icono', {
        type: 'button',
        'aria-label': `Eliminar ${personaje.nombre}`,
        title: 'Eliminar',
        alClick: () => acciones.eliminarPersonaje(personaje),
      }, [icono('papelera')]),
    ]),
  ]);
}

/* ── Vista completa ──────────────────────────────────────────────────────── */

export function vistaSala(estado, sala, acciones) {
  const personajesDeSala = estado.personajes.filter((personaje) => personaje.sala_id === sala.id);
  const variables = variablesSala(sala.color_acento);

  let consulta = '';
  let filtroProveedor = 'todos';

  const rejilla = elemento('div.personajes');
  const conteo = elemento('p.barra-herramientas__conteo', { role: 'status' });

  const seccion = elemento('section', { variables });

  const encabezado = elemento('header.encabezado', {}, [
    elemento('div.encabezado__texto', {}, [
      elemento('nav.migas', { 'aria-label': 'Ruta' }, [
        elemento('a', { href: '#/', texto: 'Plano' }),
        icono('flechaDerecha'),
        elemento('span', { texto: sala.nombre }),
      ]),
      elemento('div.sala-cabecera', {}, [
        elemento('span.sala-cabecera__insignia', { 'aria-hidden': 'true' }, [icono(sala.icono)]),
        elemento('div', {}, [
          elemento('h1.encabezado__titulo', { texto: sala.nombre }),
          elemento('p.encabezado__sub', { texto: sala.descripcion || 'Esta sala todavía no tiene descripción.' }),
        ]),
      ]),
    ]),
    elemento('div.encabezado__acciones', {}, [
      estado.permisos.administrarSalas &&
        elemento('button.boton', {
          type: 'button',
          alClick: () => acciones.editarSala(sala),
        }, [icono('ajustes', { clase: 'boton__icono' }), 'Editar sala']),
      elemento('button.boton.boton--primario', {
        type: 'button',
        alClick: () => acciones.nuevoPersonaje(sala),
      }, [icono('mas', { clase: 'boton__icono' }), 'Nuevo personaje']),
    ]),
  ]);

  const proveedoresPresentes = [...new Set(personajesDeSala.map((personaje) => personaje.proveedor_ia))];

  const filtros = elemento('div.barra-herramientas__filtros', { role: 'group', 'aria-label': 'Filtrar por proveedor' });

  // Los filtros se dibujan una sola vez: si se regeneraran en cada pintado, el
  // foco del teclado saltaría fuera del botón recién pulsado.
  function botonFiltro(valor, texto) {
    return elemento('button.filtro', {
      type: 'button',
      'aria-pressed': String(filtroProveedor === valor),
      'data-proveedor': valor,
      texto,
      alClick: () => {
        filtroProveedor = valor;
        [...filtros.children].forEach((boton) =>
          boton.setAttribute('aria-pressed', String(boton.dataset.proveedor === valor)),
        );
        pintar();
      },
    });
  }

  filtros.append(
    botonFiltro('todos', 'Todos'),
    ...proveedoresPresentes.map((proveedor) =>
      botonFiltro(proveedor, ETIQUETA_PROVEEDOR[proveedor] ?? proveedor),
    ),
  );

  const barra = elemento('div.barra-herramientas', {}, [
    elemento('div.buscador', {}, [
      icono('buscar', { clase: 'buscador__icono' }),
      elemento('input.control', {
        type: 'search',
        placeholder: `Buscar en ${sala.nombre}…`,
        'aria-label': `Buscar personajes en ${sala.nombre}`,
        autocomplete: 'off',
        alInput: (evento) => {
          consulta = normalizar(evento.target.value);
          pintar();
        },
      }),
    ]),
    filtros,
    conteo,
  ]);

  function pintar() {
    const visibles = personajesDeSala.filter((personaje) => {
      const coincideTexto =
        !consulta ||
        normalizar(`${personaje.nombre} ${personaje.rol_titulo} ${personaje.modelo} ${personaje.persona_prompt}`)
          .includes(consulta);
      const coincideProveedor = filtroProveedor === 'todos' || personaje.proveedor_ia === filtroProveedor;
      return coincideTexto && coincideProveedor;
    });

    conteo.textContent =
      personajesDeSala.length === 0
        ? ''
        : `${visibles.length} de ${personajesDeSala.length} personaje${personajesDeSala.length === 1 ? '' : 's'}`;

    if (personajesDeSala.length === 0) {
      reemplazar(
        rejilla,
        elemento('div.vacio', {}, [
          elemento('span.vacio__icono', { 'aria-hidden': 'true' }, [icono(sala.icono)]),
          elemento('h2', { texto: 'Sala vacía' }),
          elemento('p', {
            texto: 'Todavía no hay ninguna IA asignada a este departamento. Registra la primera y aparecerá también en el plano.',
          }),
          elemento('button.boton.boton--primario', {
            type: 'button',
            alClick: () => acciones.nuevoPersonaje(sala),
          }, [icono('mas', { clase: 'boton__icono' }), 'Añadir el primer personaje']),
        ]),
      );
      rejilla.classList.remove('personajes');
      return;
    }

    rejilla.classList.add('personajes');

    if (visibles.length === 0) {
      reemplazar(
        rejilla,
        elemento('div.vacio', {}, [
          elemento('span.vacio__icono', { 'aria-hidden': 'true' }, [icono('buscar')]),
          elemento('h2', { texto: 'Sin coincidencias' }),
          elemento('p', { texto: 'Ningún personaje de esta sala encaja con lo que buscas.' }),
        ]),
      );
      return;
    }

    reemplazar(
      rejilla,
      ...visibles.map((personaje) => tarjetaPersonaje(personaje, sala, acciones)),
      elemento('button.personaje-nuevo', {
        type: 'button',
        alClick: () => acciones.nuevoPersonaje(sala),
      }, [icono('mas'), 'Añadir personaje']),
    );
  }

  seccion.append(encabezado, barra, rejilla);
  pintar();
  return seccion;
}
