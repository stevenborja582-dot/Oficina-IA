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
import { modalPersonaje } from './modal-personaje.js';
import { modalSala } from './modal-sala.js';
import { avatar } from './piezas.js';

aplicarTemaInicial();

let estado = null;
const contenido = buscar('#lienzo-vista');
const zonaCabecera = buscar('#acciones-cabecera');

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
      alGuardar: recargar,
    }),

  editarPersonaje: (personaje) =>
    modalPersonaje({
      personaje,
      sala: estado.salas.find((sala) => sala.id === personaje.sala_id),
      salas: estado.salas,
      catalogos: estado.catalogos,
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

/** Avisa a la vista saliente para que corte lo que tenga en vuelo (una respuesta a medias). */
function despedirVista() {
  contenido.firstElementChild?.dispatchEvent(new CustomEvent('oficina:salir'));
}

function pintarVista() {
  if (!estado) return;
  despedirVista();
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
    return;
  }

  pintarCabecera();
  pintarVista();

  window.addEventListener('hashchange', pintarVista);
  // El color del texto de cada sala se recalcula contra el fondo del tema activo.
  alCambiarTema(() => pintarVista());
}

iniciar();
