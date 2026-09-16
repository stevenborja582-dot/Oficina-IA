/** Alta y edición de salas: nombre, descripción, color de departamento e icono. */
import { elemento } from './dom.js';
import { abrirModal, areaTexto, campo, entrada, mostrarErrorDeCampo } from './modal.js';
import { icono } from './iconos.js';
import { api } from './api.js';
import { avisar, avisarError } from './notificaciones.js';

/** Los cinco colores de departamento de la v1, más gris piedra para "General". */
const PALETA = [
  ['#2563EB', 'Azul — Desarrollo'],
  ['#7C3AED', 'Violeta — Diseño'],
  ['#059669', 'Verde — Asistencia'],
  ['#0D9488', 'Teal — Contenido'],
  ['#D97706', 'Ámbar — Automatización'],
  ['#57534E', 'Piedra — General'],
  ['#B42318', 'Rojo'],
  ['#0EA5E9', 'Cian'],
];

export function modalSala({ sala = null, catalogos, alGuardar, alEliminar }) {
  const esNueva = !sala;
  let color = sala?.color_acento ?? PALETA[0][0];
  let iconoElegido = sala?.icono ?? 'oficina';

  const formulario = elemento('form.rejilla-campos', { id: 'form-sala', novalidate: true });

  const campoNombre = entrada({ name: 'nombre', value: sala?.nombre ?? '', maxLength: 60, autocomplete: 'off' });
  const campoDescripcion = areaTexto({
    name: 'descripcion',
    value: sala?.descripcion ?? '',
    rows: 3,
    maxLength: 280,
    placeholder: 'De qué se ocupa este departamento.',
  });
  const campoColor = elemento('input', { type: 'hidden', name: 'color_acento', value: color });
  const campoIcono = elemento('input', { type: 'hidden', name: 'icono', value: iconoElegido });

  const paleta = elemento('div.paleta', { role: 'group', 'aria-label': 'Color de la sala' });
  PALETA.forEach(([valor, nombre]) => {
    const boton = elemento('button.paleta__opcion', {
      type: 'button',
      title: nombre,
      'aria-label': nombre,
      'aria-pressed': String(valor === color),
      variables: { '--muestra': valor },
      alClick: () => {
        color = valor;
        campoColor.value = valor;
        [...paleta.children].forEach((otro) =>
          otro.setAttribute('aria-pressed', String(otro.getAttribute('aria-label') === nombre)),
        );
      },
    });
    paleta.append(boton);
  });

  const rejillaIconos = elemento('div.iconos-rejilla', { role: 'group', 'aria-label': 'Icono de la sala' });
  (catalogos.iconos ?? []).forEach((nombre) => {
    const boton = elemento('button.iconos-rejilla__opcion', {
      type: 'button',
      title: nombre,
      'aria-label': `Icono ${nombre}`,
      'aria-pressed': String(nombre === iconoElegido),
      datos: { icono: nombre },
      alClick: () => {
        iconoElegido = nombre;
        campoIcono.value = nombre;
        [...rejillaIconos.children].forEach((otro) =>
          otro.setAttribute('aria-pressed', String(otro.dataset.icono === nombre)),
        );
      },
    }, [icono(nombre)]);
    rejillaIconos.append(boton);
  });

  formulario.append(
    campo({ etiqueta: 'Nombre', control: campoNombre, obligatorio: true }),
    campo({ etiqueta: 'Descripción', control: campoDescripcion }),
    elemento('div.campo', {}, [
      elemento('span.campo__etiqueta', { texto: 'Color' }),
      paleta,
      elemento('p.campo__pista', {
        texto: 'El texto sobre este color se ajusta solo para mantener el contraste mínimo AA.',
      }),
    ]),
    elemento('div.campo', {}, [
      elemento('span.campo__etiqueta', { texto: 'Icono' }),
      rejillaIconos,
    ]),
    campoColor,
    campoIcono,
  );

  const { dialogo, cerrar } = abrirModal({
    titulo: esNueva ? 'Nueva sala' : `Editar ${sala.nombre}`,
    subtitulo: esNueva
      ? 'Se colocará sola en el primer hueco libre del plano.'
      : 'El slug de la sala no cambia, así los enlaces guardados siguen funcionando.',
    contenido: formulario,
    acciones: (cerrarModal) => [
      !esNueva &&
        elemento('button.boton.boton--peligro', {
          type: 'button',
          texto: 'Eliminar sala',
          alClick: async () => {
            if (sala.total_personajes > 0) {
              avisar(`Primero mueve o elimina los ${sala.total_personajes} personajes de esta sala.`, {
                tipo: 'error',
              });
              return;
            }
            try {
              await api.eliminarSala(sala.id);
              cerrarModal();
              avisar(`Sala "${sala.nombre}" eliminada.`);
              await alEliminar();
            } catch (error) {
              avisarError(error);
            }
          },
        }),
      elemento('button.boton.a-la-derecha', { type: 'button', texto: 'Cancelar', alClick: cerrarModal }),
      elemento('button.boton.boton--primario', {
        type: 'submit',
        form: 'form-sala',
        texto: esNueva ? 'Crear sala' : 'Guardar cambios',
      }),
    ],
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = dialogo.querySelector('button[type=submit]');
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    const cuerpo = Object.fromEntries(new FormData(formulario).entries());

    try {
      const respuesta = esNueva ? await api.crearSala(cuerpo) : await api.actualizarSala(sala.id, cuerpo);
      cerrar();
      avisar(esNueva ? `Sala "${respuesta.sala.nombre}" abierta.` : 'Sala actualizada.', { tipo: 'exito' });
      await alGuardar(respuesta.sala);
    } catch (error) {
      boton.disabled = false;
      boton.textContent = esNueva ? 'Crear sala' : 'Guardar cambios';
      if (!mostrarErrorDeCampo(dialogo, error.detalles, error.message)) avisarError(error);
    }
  });
}
