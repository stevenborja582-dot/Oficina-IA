/**
 * Archivo rey del cliente: carga el estado de la oficina, arma la cabecera,
 * enruta entre el plano y las salas, y concentra las acciones que mutan datos.
 * Las vistas solo saben pintar; nunca llaman a la API por su cuenta.
 */
import { buscar, elemento, reemplazar } from './dom.js';
import { icono } from './iconos.js';
import { api } from './api.js';
import { aplicarTemaInicial, alCambiarTema, conectarBotonTema } from './tema.js';
import { avisar, avisarError } from './notificaciones.js';
import { vistaPlano } from './vista-plano.js';
import { vistaSala } from './vista-sala.js';
import { vistaChat } from './vista-chat.js';
import { vistaConectores } from './vista-conectores.js';
import { vistaEquipo } from './vista-equipo.js';
import { vistaSkills } from './vista-skills.js';
import { modalPersonaje } from './modal-personaje.js';
import { modalSala } from './modal-sala.js';
import { avatar } from './piezas.js';

aplicarTemaInicial();

let estado = null;
const contenido = buscar('#lienzo-vista');
const zonaCabecera = buscar('#acciones-cabecera');
const zonaNavegacion = buscar('#nav-principal');

/* ── Acciones ────────────────────────────────────────────────────────────── */

const acciones = {
  nuevaSala: () =>
    modalSala({
      catalogos: estado.catalogos,
      alGuardar: async (sala) => {
        await recargar();
        window.location.hash = `#/sala/${sala.slug}`;
      },
      alEliminar: recargar,
    }),

  editarSala: (sala) =>
    modalSala({
      sala,
      catalogos: estado.catalogos,
      alGuardar: recargar,
      alEliminar: async () => {
        await recargar();
        window.location.hash = '#/';
      },
    }),

  nuevoPersonaje: (sala) =>
    modalPersonaje({
      sala,
      salas: estado.salas,
      catalogos: estado.catalogos,
      permisos: estado.permisos,
      alGuardar: recargar,
    }),

  editarPersonaje: (personaje) =>
    modalPersonaje({
      personaje,
      sala: estado.salas.find((sala) => sala.id === personaje.sala_id),
      salas: estado.salas,
      catalogos: estado.catalogos,
      permisos: estado.permisos,
      alGuardar: recargar,
    }),

  /**
   * Borrado con red de seguridad: se elimina de verdad, pero el aviso guarda el
   * personaje entero y puede devolverlo a su sitio — con su id original si sigue libre.
   */
  eliminarPersonaje: async (personaje) => {
    try {
      const { personaje: eliminado } = await api.eliminarPersonaje(personaje.id);
      await recargar();
      avisar(`"${eliminado.nombre}" salió de la oficina.`, {
        accion: {
          texto: 'Deshacer',
          alPulsar: async () => {
            try {
              await api.restaurarPersonaje(eliminado);
              await recargar();
              avisar(`"${eliminado.nombre}" volvió a su escritorio.`, { tipo: 'exito' });
            } catch (error) {
              avisarError(error);
            }
          },
        },
      });
    } catch (error) {
      avisarError(error);
    }
  },
};

/* ── Cabecera ────────────────────────────────────────────────────────────── */

const NAVEGACION = [
  { vista: 'plano', hash: '#/', texto: 'Plano', icono: 'oficina' },
  { vista: 'skills', hash: '#/skills', texto: 'Skills', icono: 'manual' },
  { vista: 'conectores', hash: '#/conectores', texto: 'Conectores', icono: 'enchufe' },
  { vista: 'equipo', hash: '#/equipo', texto: 'Equipo', icono: 'usuarios', soloAdmin: true },
];

/** La navegación se repinta en cada cambio de ruta para marcar la pestaña viva. */
function pintarNavegacion() {
  const { vista } = rutaActual();
  // Las rutas de dentro de una sala o de un chat siguen colgando del plano.
  const activa = ['skills', 'conectores', 'equipo'].includes(vista) ? vista : 'plano';

  reemplazar(
    zonaNavegacion,
    ...NAVEGACION.filter((entrada) => !entrada.soloAdmin || estado.permisos.administrarEquipo).map((entrada) =>
      elemento('a.nav-principal__enlace', {
        href: entrada.hash,
        'aria-current': entrada.vista === activa ? 'page' : null,
      }, [
        icono(entrada.icono, { clase: 'nav-principal__icono' }),
        elemento('span.nav-principal__texto', { texto: entrada.texto }),
      ]),
    ),
  );
}

function pintarCabecera() {
  const usuario = estado.usuario;

  const botonTema = elemento('button.boton-icono', { type: 'button' });

  reemplazar(
    zonaCabecera,
    botonTema,
    elemento('div.usuario', {}, [
      avatar({ nombre: usuario.nombre || usuario.email, avatar_url: usuario.avatar_url }, '#57534E', {
        tamano: 26,
        redondo: true,
      }),
      elemento('span.usuario__nombre', { texto: usuario.nombre || usuario.email }),
    ]),
    elemento('button.boton-icono', {
      type: 'button',
      'aria-label': 'Cerrar sesión',
      title: 'Cerrar sesión',
      alClick: async () => {
        try {
          await api.salir();
        } finally {
          window.location.assign('/entrar');
        }
      },
    }, [icono('salir')]),
  );

  conectarBotonTema(botonTema);
}

/* ── Enrutado por hash ───────────────────────────────────────────────────── */

function rutaActual() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [vista, parametro] = hash.split('/');
  return { vista: vista || 'plano', parametro };
}

const sinPermiso = (texto) =>
  elemento('div.error-vista', {}, [
    elemento('h1', { texto: 'Esta parte no es tuya' }),
    elemento('p', { texto }),
    elemento('a.boton', { href: '#/', texto: 'Volver al plano' }),
  ]);

/** Avisa a la vista saliente para que corte lo que tenga en vuelo (una respuesta a medias). */
function despedirVista() {
  contenido.firstElementChild?.dispatchEvent(new CustomEvent('oficina:salir'));
}

function pintarVista() {
  if (!estado) return;
  despedirVista();
  pintarNavegacion();
  const { vista, parametro } = rutaActual();

  if (vista === 'chat' && parametro) {
    const personaje = estado.personajes.find((entrada) => entrada.id === Number(parametro));
    if (!personaje) {
      reemplazar(
        contenido,
        elemento('div.error-vista', {}, [
          elemento('h1', { texto: 'Ese personaje ya no está' }),
          elemento('p', { texto: 'Puede que lo hayas eliminado desde otra pestaña.' }),
          elemento('a.boton', { href: '#/', texto: 'Volver al plano' }),
        ]),
      );
      document.title = 'Personaje no encontrado · Oficina Black Hole';
      return;
    }
    reemplazar(contenido, vistaChat(estado, personaje, acciones));
    document.title = `${personaje.nombre} · Oficina Black Hole`;
    return;
  }

  if (vista === 'skills') {
    reemplazar(contenido, vistaSkills(estado));
    document.title = 'Skills · Oficina Black Hole';
    return;
  }

  if (vista === 'conectores') {
    reemplazar(contenido, vistaConectores(estado, recargar));
    document.title = 'Conectores · Oficina Black Hole';
    return;
  }

  if (vista === 'equipo') {
    if (!estado.permisos.administrarEquipo) {
      reemplazar(contenido, sinPermiso('El equipo lo gestionan los administradores.'));
      document.title = 'Sin permiso · Oficina Black Hole';
      return;
    }
    reemplazar(contenido, vistaEquipo(estado));
    document.title = 'Equipo · Oficina Black Hole';
    return;
  }

  if (vista === 'sala' && parametro) {
    const sala = estado.salas.find((entrada) => entrada.slug === parametro);
    if (!sala) {
      reemplazar(
        contenido,
        elemento('div.error-vista', {}, [
          elemento('h1', { texto: 'Esa sala no existe' }),
          elemento('p', { texto: 'Puede que la hayas eliminado o que el enlace esté mal escrito.' }),
          elemento('a.boton', { href: '#/', texto: 'Volver al plano' }),
        ]),
      );
      document.title = 'Sala no encontrada · Oficina Black Hole';
      return;
    }
    reemplazar(contenido, vistaSala(estado, sala, acciones));
    document.title = `${sala.nombre} · Oficina Black Hole`;
    return;
  }

  reemplazar(contenido, vistaPlano(estado, acciones));
  document.title = 'La oficina · Oficina Black Hole';
}

/* ── Carga ───────────────────────────────────────────────────────────────── */

function pintarCargando() {
  reemplazar(
    contenido,
    elemento('div.cargando', { 'aria-busy': 'true', 'aria-label': 'Cargando la oficina' }, [
      elemento('div.esqueleto.cargando__fila'),
      elemento('div.esqueleto.cargando__plano'),
    ]),
  );
}

async function recargar() {
  estado = await api.oficina();
  pintarVista();
}

/**
 * La portada se va cuando la oficina ya está pintada, no cuando el JS arranca:
 * si se retirase antes, se vería el esqueleto un instante y el efecto sería peor
 * que no tener portada.
 */
function retirarPortada() {
  const portada = buscar('#portada');
  if (!portada || portada.hidden) return;
  portada.hidden = true;
  // Se saca del árbol al terminar la transición para que no capture el foco.
  setTimeout(() => portada.remove(), 400);
}

async function iniciar() {
  pintarCargando();
  try {
    estado = await api.oficina();
  } catch (error) {
    reemplazar(
      contenido,
      elemento('div.error-vista', {}, [
        elemento('h1', { texto: 'No se pudo abrir la oficina' }),
        elemento('p', { texto: error.message }),
        elemento('button.boton.boton--primario', {
          type: 'button',
          texto: 'Reintentar',
          alClick: () => window.location.reload(),
        }),
      ]),
    );
    retirarPortada();
    return;
  }

  pintarCabecera();
  pintarVista();
  retirarPortada();

  window.addEventListener('hashchange', pintarVista);
  // El color del texto de cada sala se recalcula contra el fondo del tema activo.
  alCambiarTema(() => pintarVista());
}

iniciar();
