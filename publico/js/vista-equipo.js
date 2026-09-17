/**
 * Vista de equipo (Fase 5).
 *
 * Aquí se reparte quién entra y quién manda. Todo lo que hay en esta pantalla
 * es de administradores, y el servidor lo vuelve a comprobar: lo de aquí es
 * para que la interfaz no ofrezca lo que va a ser rechazado.
 */
import { elemento, reemplazar } from './dom.js';
import { icono } from './iconos.js';
import { api } from './api.js';
import { avatar } from './piezas.js';
import { avisar, avisarError } from './notificaciones.js';
import { abrirModal, campo, entrada, mostrarErrorDeCampo, seleccion } from './modal.js';

const ETIQUETA_ROL = { admin: 'Administrador', miembro: 'Miembro' };
const ETIQUETA_PROVEEDOR_AUTH = { google: 'Google', github: 'GitHub', demo: 'Demo' };

/** "hace 3 días" dice más que una fecha ISO cuando lo que importa es si sigue viniendo. */
function desde(fechaIso) {
  if (!fechaIso) return 'Nunca';
  const dias = Math.floor((Date.now() - new Date(fechaIso).getTime()) / 86_400_000);
  if (dias < 1) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 30) return `Hace ${dias} días`;
  if (dias < 365) return `Hace ${Math.floor(dias / 30)} meses`;
  return `Hace ${Math.floor(dias / 365)} años`;
}

function filaPersona(persona, yo, acciones) {
  const esYo = persona.id === yo.id;
  const suspendido = persona.estado === 'suspendido';

  const selectorRol = seleccion(
    Object.entries(ETIQUETA_ROL),
    { valor: persona.rol, 'aria-label': `Rol de ${persona.nombre}`, disabled: esYo },
  );
  selectorRol.classList.add('equipo__rol');
  selectorRol.addEventListener('change', () => acciones.cambiar(persona, { rol: selectorRol.value }, selectorRol));

  return elemento(`article.tarjeta.equipo__persona${suspendido ? '.equipo__persona--suspendida' : ''}`, {}, [
    avatar(
      { nombre: persona.nombre || persona.email, avatar_url: persona.avatar_url },
      suspendido ? '#8A8178' : '#C2703D',
      { tamano: 44, redondo: true },
    ),

    elemento('div.equipo__quien', {}, [
      elemento('h3.equipo__nombre', {}, [
        persona.nombre || persona.email,
        esYo && elemento('span.chip.chip--neutro', { texto: 'Tú' }),
      ]),
      elemento('p.equipo__correo.mono', { texto: persona.email }),
      elemento('div.equipo__meta', {}, [
        elemento('span', { texto: ETIQUETA_PROVEEDOR_AUTH[persona.proveedor_auth] ?? persona.proveedor_auth }),
        elemento('span', { texto: '·' }),
        elemento('span', { title: persona.ultimo_acceso_en ?? '', texto: `Última visita: ${desde(persona.ultimo_acceso_en)}` }),
        persona.conversaciones > 0 && elemento('span', { texto: '·' }),
        persona.conversaciones > 0 &&
          elemento('span', { texto: `${persona.conversaciones} conversación${persona.conversaciones === 1 ? '' : 'es'}` }),
      ]),
    ]),

    elemento('div.equipo__mandos', {}, [
      suspendido && elemento('span.chip.chip--error', { texto: 'Suspendido' }),
      selectorRol,
      !esYo && elemento('button.boton.boton--pequeno', {
        type: 'button',
        texto: suspendido ? 'Reactivar' : 'Suspender',
        title: suspendido
          ? 'Vuelve a poder entrar'
          : 'Deja de poder entrar, pero conserva su historial',
        alClick: (evento) =>
          acciones.cambiar(persona, { estado: suspendido ? 'activo' : 'suspendido' }, evento.currentTarget),
      }),
      !esYo && elemento('button.boton-icono', {
        type: 'button',
        title: 'Dar de baja',
        'aria-label': `Dar de baja a ${persona.nombre || persona.email}`,
        alClick: () => acciones.eliminar(persona),
      }, [icono('papelera')]),
    ]),
  ]);
}

function filaInvitacion(invitacion, acciones) {
  return elemento('article.tarjeta.equipo__invitacion', {}, [
    elemento('span.equipo__sobre', { 'aria-hidden': 'true' }, [icono('puerta')]),
    elemento('div.equipo__quien', {}, [
      elemento('p.equipo__correo.mono', { texto: invitacion.email }),
      elemento('div.equipo__meta', {}, [
        elemento('span', { texto: ETIQUETA_ROL[invitacion.rol] ?? invitacion.rol }),
        elemento('span', { texto: '·' }),
        elemento('span', {
          texto: invitacion.usada_en ? `Aceptada ${desde(invitacion.usada_en).toLowerCase()}` : 'Sin usar',
        }),
        invitacion.invitador && elemento('span', { texto: '·' }),
        invitacion.invitador && elemento('span', { texto: `Invitó ${invitacion.invitador}` }),
      ]),
    ]),
    elemento('button.boton-icono.a-la-derecha', {
      type: 'button',
      title: 'Revocar invitación',
      'aria-label': `Revocar la invitación de ${invitacion.email}`,
      alClick: () => acciones.revocar(invitacion),
    }, [icono('cerrar')]),
  ]);
}

/* ── Invitar ─────────────────────────────────────────────────────────────── */

function modalInvitar({ alGuardar }) {
  const cEmail = entrada({ name: 'email', type: 'email', autocomplete: 'off', placeholder: 'nombre@empresa.com', required: true });
  const cRol = seleccion(Object.entries(ETIQUETA_ROL), { name: 'rol', valor: 'miembro' });

  const formulario = elemento('form.rejilla-campos', { id: 'form-invitar', novalidate: true }, [
    campo({ etiqueta: 'Correo', pista: 'El mismo con el que entrará por Google o GitHub.', control: cEmail, obligatorio: true }),
    campo({ etiqueta: 'Rol', pista: 'Un administrador reparte salas, conectores y accesos.', control: cRol }),
  ]);

  const { dialogo, cerrar } = abrirModal({
    titulo: 'Invitar a la oficina',
    subtitulo: 'La invitación abre la puerta a ese correo. No se envía ningún email: pásale tú el enlace de la oficina.',
    contenido: formulario,
    acciones: (cerrarModal) => [
      elemento('button.boton', { type: 'button', texto: 'Cancelar', alClick: cerrarModal }),
      elemento('button.boton.boton--primario.a-la-derecha', { type: 'submit', form: 'form-invitar', texto: 'Invitar' }),
    ],
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = dialogo.querySelector('button[type=submit]');
    boton.disabled = true;
    boton.textContent = 'Invitando…';
    try {
      const { invitacion } = await api.invitar(Object.fromEntries(new FormData(formulario).entries()));
      cerrar();
      avisar(`${invitacion.email} ya puede entrar.`, { tipo: 'exito' });
      await alGuardar();
    } catch (error) {
      boton.disabled = false;
      boton.textContent = 'Invitar';
      if (!mostrarErrorDeCampo(dialogo, error.detalles, error.message)) avisarError(error);
    }
  });
}

/* ── Vista ───────────────────────────────────────────────────────────────── */

export function vistaEquipo(estado) {
  const lista = elemento('div.equipo');
  const invitaciones = elemento('div.equipo');
  const bloqueInvitaciones = elemento('section.equipo__seccion', {}, [
    elemento('h2.equipo__titulo-seccion', { texto: 'Invitaciones' }),
    invitaciones,
  ]);
  bloqueInvitaciones.hidden = true;

  const acciones = {
    cambiar: async (persona, cambios, control) => {
      control.disabled = true;
      try {
        await api.cambiarUsuario(persona.id, cambios);
        avisar(`${persona.nombre || persona.email}: cambio guardado.`, { tipo: 'exito' });
      } catch (error) {
        avisarError(error);
      } finally {
        await cargar();
      }
    },

    eliminar: async (persona) => {
      const confirmado = await confirmar({
        titulo: `¿Dar de baja a ${persona.nombre || persona.email}?`,
        cuerpo:
          'Se borrarán también sus conversaciones con los personajes — son suyas, no del personaje. ' +
          'Si solo quieres cerrarle la puerta y conservar el historial, suspéndelo en vez de darlo de baja.',
        confirmar: 'Dar de baja',
      });
      if (!confirmado) return;
      try {
        await api.eliminarUsuario(persona.id);
        avisar(`${persona.nombre || persona.email} ya no está en la oficina.`);
      } catch (error) {
        avisarError(error);
      }
      await cargar();
    },

    revocar: async (invitacion) => {
      try {
        await api.revocarInvitacion(invitacion.id);
        avisar(`Invitación de ${invitacion.email} revocada.`);
      } catch (error) {
        avisarError(error);
      }
      await cargar();
    },
  };

  async function cargar() {
    try {
      const datos = await api.equipo();

      reemplazar(lista, ...datos.equipo.map((persona) => filaPersona(persona, estado.usuario, acciones)));

      bloqueInvitaciones.hidden = datos.invitaciones.length === 0;
      reemplazar(invitaciones, ...datos.invitaciones.map((i) => filaInvitacion(i, acciones)));
    } catch (error) {
      reemplazar(lista, elemento('div.error-vista', {}, [
        elemento('h2', { texto: 'No se pudo leer el equipo' }),
        elemento('p', { texto: error.message }),
      ]));
    }
  }

  reemplazar(lista, elemento('div.esqueleto.cargando__fila'), elemento('div.esqueleto.cargando__fila'));

  const seccion = elemento('section', {}, [
    elemento('header.encabezado', {}, [
      elemento('div.encabezado__texto', {}, [
        elemento('p.etiqueta-seccion', { texto: 'Fase 5 · Multiusuario' }),
        elemento('h1.encabezado__titulo', { texto: 'Equipo' }),
        elemento('p.encabezado__sub', {
          texto: 'Quién entra en la oficina y quién manda en ella. Cada persona tiene sus propias ' +
            'conversaciones con los personajes: nadie lee las de nadie.',
        }),
      ]),
      elemento('div.encabezado__acciones', {}, [
        elemento('button.boton.boton--primario', {
          type: 'button', alClick: () => modalInvitar({ alGuardar: cargar }),
        }, [icono('mas', { clase: 'boton__icono' }), 'Invitar']),
      ]),
    ]),
    elemento('h2.equipo__titulo-seccion', { texto: 'Personas' }),
    lista,
    bloqueInvitaciones,
  ]);

  cargar();
  return seccion;
}

/** Confirmación sobria: el mismo modal accesible, con dos botones y nada más. */
function confirmar({ titulo, cuerpo, confirmar: textoConfirmar }) {
  return new Promise((resolver) => {
    let decidido = false;
    const { cerrar } = abrirModal({
      titulo,
      contenido: elemento('p', { texto: cuerpo }),
      alCerrar: () => { if (!decidido) resolver(false); },
      acciones: (cerrarModal) => [
        elemento('button.boton', { type: 'button', texto: 'Cancelar', alClick: cerrarModal }),
        elemento('button.boton.boton--peligro.a-la-derecha', {
          type: 'button',
          texto: textoConfirmar,
          alClick: () => { decidido = true; cerrar(); resolver(true); },
        }),
      ],
    });
  });
}
