/**
 * Vista de skills (Fase 3).
 *
 * Una skill es un archivo Markdown con frontmatter. Aquí se escriben, se activan
 * y se borran; asignarlas a un personaje se hace desde su ficha, que es donde se
 * decide qué sabe hacer cada uno.
 */
import { elemento, normalizar, reemplazar } from './dom.js';
import { icono } from './iconos.js';
import { api } from './api.js';
import { avisar, avisarError } from './notificaciones.js';
import { abrirModal, areaTexto, campo, entrada, mostrarErrorDeCampo } from './modal.js';

/** El archivo que se ofrece al crear una skill nueva: enseña el formato escribiéndolo. */
const PLANTILLA = `---
nombre: 
descripcion: En una línea, para qué sirve
cuando-usarla: La señal que hace que el personaje la saque
etiquetas: 
---

# Cómo hacerlo

1. 
2. 
`;

function tarjetaSkill(skill, acciones, puedeEditar) {
  const usos = skill.usos ?? 0;

  return elemento(`article.tarjeta.skill${skill.activa ? '' : '.skill--apagada'}`, {}, [
    elemento('div.skill__alto', {}, [
      elemento('span.skill__icono', { 'aria-hidden': 'true' }, [icono('manual')]),
      elemento('div.skill__id', {}, [
        elemento('h3.personaje__nombre', { texto: skill.nombre }),
        elemento('p.personaje__rol', { texto: skill.descripcion || 'Sin descripción' }),
      ]),
      !skill.activa && elemento('span.chip.chip--neutro', { texto: 'Apagada' }),
    ]),

    skill.cuando_usarla &&
      elemento('p.skill__cuando', {}, [
        elemento('span.skill__cuando-etiqueta', { texto: 'Cuándo' }),
        skill.cuando_usarla,
      ]),

    elemento('div.skill__pie', {}, [
      elemento('div.skill__etiquetas', {}, [
        elemento('span.chip.chip--neutro.mono', { texto: skill.slug }),
        ...skill.etiquetas.map((etiqueta) => elemento('span.chip.chip--neutro', { texto: etiqueta })),
      ]),
      elemento('p.skill__medidas', {
        texto: `${usos === 0 ? 'Sin asignar' : `${usos} personaje${usos === 1 ? '' : 's'}`} · ` +
          `${Math.round(skill.caracteres / 100) / 10} k caracteres`,
      }),
    ]),

    elemento('div.personaje__acciones', {}, [
      elemento('button.boton.boton--pequeno', {
        type: 'button',
        texto: puedeEditar ? 'Editar' : 'Ver',
        alClick: () => acciones.abrir(skill),
      }),
      puedeEditar && elemento('button.boton.boton--pequeno', {
        type: 'button',
        texto: skill.activa ? 'Apagar' : 'Encender',
        title: skill.activa
          ? 'Deja de entrar en el contexto de quien la lleve, sin perder la asignación'
          : 'Vuelve a entrar en el contexto de quien la lleve',
        alClick: (evento) => acciones.conmutar(skill, evento.currentTarget),
      }),
      puedeEditar && elemento('button.boton-icono.a-la-derecha', {
        type: 'button',
        title: 'Eliminar',
        'aria-label': `Eliminar la skill ${skill.nombre}`,
        alClick: () => acciones.eliminar(skill),
      }, [icono('papelera')]),
    ]),
  ]);
}

/* ── Alta y edición ──────────────────────────────────────────────────────── */

export function modalSkill({ skill = null, soloLectura = false, alGuardar }) {
  const esNueva = !skill;

  const cFuente = areaTexto({
    name: 'fuente',
    rows: 18,
    spellcheck: 'false',
    readOnly: soloLectura,
    'aria-label': 'Contenido de la skill, en Markdown con frontmatter',
  });
  cFuente.classList.add('mono', 'campo--codigo');
  cFuente.value = skill?.fuente ?? PLANTILLA;

  const formulario = elemento('form.rejilla-campos', { id: 'form-skill', novalidate: true }, [
    campo({
      etiqueta: 'La skill',
      pista: 'Markdown. El bloque entre --- de arriba es la cabecera: de ahí salen el nombre, ' +
        'la descripción y el "cuándo usarla" que ve el personaje.',
      control: cFuente,
      obligatorio: !soloLectura,
    }),
  ]);

  const { dialogo, cerrar } = abrirModal({
    titulo: esNueva ? 'Nueva skill' : skill.nombre,
    subtitulo: soloLectura
      ? 'Solo los administradores pueden editar skills.'
      : 'El personaje ve primero el índice —nombre, para qué sirve, cuándo— y abre las ' +
        'instrucciones solo cuando le hacen falta.',
    contenido: formulario,
    acciones: (cerrarModal) => [
      elemento('button.boton', { type: 'button', texto: soloLectura ? 'Cerrar' : 'Cancelar', alClick: cerrarModal }),
      !soloLectura && elemento('button.boton.boton--primario.a-la-derecha', {
        type: 'submit',
        form: 'form-skill',
        texto: esNueva ? 'Crear skill' : 'Guardar cambios',
      }),
    ],
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = dialogo.querySelector('button[type=submit]');
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    try {
      const cuerpo = { fuente: cFuente.value };
      const respuesta = esNueva ? await api.crearSkill(cuerpo) : await api.actualizarSkill(skill.id, cuerpo);
      cerrar();
      avisar(
        esNueva
          ? `Skill "${respuesta.skill.nombre}" creada. Asígnasela a un personaje desde su ficha.`
          : 'Skill actualizada.',
        { tipo: 'exito' },
      );
      await alGuardar(respuesta.skill);
    } catch (error) {
      boton.disabled = false;
      boton.textContent = esNueva ? 'Crear skill' : 'Guardar cambios';
      if (!mostrarErrorDeCampo(dialogo, error.detalles, error.message)) avisarError(error);
    }
  });
}

/* ── Vista ───────────────────────────────────────────────────────────────── */

export function vistaSkills(estado) {
  const puedeEditar = Boolean(estado.permisos.administrarSalas);
  const rejilla = elemento('div.skills');
  const conteo = elemento('p.barra-herramientas__conteo#ayuda-buscar-skills', { role: 'status' });
  let todas = [];
  let consulta = '';

  const acciones = {
    abrir: async (skill) => {
      try {
        // La lista no trae el archivo entero: se pide al abrirlo.
        const { skill: completa } = await api.skill(skill.id);
        modalSkill({ skill: completa, soloLectura: !puedeEditar, alGuardar: cargar });
      } catch (error) {
        avisarError(error);
      }
    },

    conmutar: async (skill, boton) => {
      boton.disabled = true;
      try {
        await api.actualizarSkill(skill.id, { activa: !skill.activa });
        avisar(
          skill.activa
            ? `"${skill.nombre}" ya no entra en el contexto de nadie.`
            : `"${skill.nombre}" vuelve a estar en juego.`,
        );
      } catch (error) {
        avisarError(error);
      }
      await cargar();
    },

    /** Mismo gesto que con los personajes: se borra de verdad, pero con red. */
    eliminar: async (skill) => {
      try {
        const { skill: eliminada } = await api.eliminarSkill(skill.id);
        await cargar();
        avisar(
          (eliminada.usos ?? skill.usos) > 0
            ? `"${eliminada.nombre}" eliminada, y quitada de ${skill.usos} personaje(s).`
            : `"${eliminada.nombre}" eliminada.`,
          {
            accion: {
              texto: 'Deshacer',
              alPulsar: async () => {
                try {
                  await api.restaurarSkill(eliminada);
                  await cargar();
                  avisar(`"${eliminada.nombre}" está de vuelta.`, { tipo: 'exito' });
                } catch (error) {
                  avisarError(error);
                }
              },
            },
          },
        );
      } catch (error) {
        avisarError(error);
      }
    },
  };

  function pintar() {
    const visibles = consulta
      ? todas.filter((skill) =>
        [skill.nombre, skill.descripcion, skill.cuando_usarla, ...skill.etiquetas]
          .some((campoTexto) => normalizar(campoTexto).includes(consulta)))
      : todas;

    conteo.textContent = consulta
      ? `${visibles.length} de ${todas.length}`
      : `${todas.length} skill${todas.length === 1 ? '' : 's'}`;

    if (visibles.length === 0) {
      rejilla.classList.remove('skills');
      reemplazar(rejilla, todas.length === 0 ? vacio() : sinResultados());
      return;
    }

    rejilla.classList.add('skills');
    reemplazar(rejilla, ...visibles.map((skill) => tarjetaSkill(skill, acciones, puedeEditar)));
  }

  const vacio = () =>
    elemento('div.vacio', {}, [
      elemento('span.vacio__icono', { 'aria-hidden': 'true' }, [icono('manual')]),
      elemento('h2', { texto: 'Todavía no hay skills' }),
      elemento('p', {
        texto: 'Una skill es un procedimiento que escribes una vez —cómo revisar código, cómo ' +
          'redactar un correo, cómo cerrar un ticket— y le prestas a los personajes que lo necesiten.',
      }),
      puedeEditar && elemento('button.boton.boton--primario', {
        type: 'button',
        alClick: () => modalSkill({ alGuardar: cargar }),
      }, [icono('mas', { clase: 'boton__icono' }), 'Escribir la primera']),
    ]);

  const sinResultados = () =>
    elemento('div.vacio', {}, [
      elemento('span.vacio__icono', { 'aria-hidden': 'true' }, [icono('buscar')]),
      elemento('h2', { texto: 'Ninguna skill coincide' }),
      elemento('p', { texto: 'Prueba con otra palabra, o con una de sus etiquetas.' }),
    ]);

  async function cargar() {
    try {
      const datos = await api.skills();
      todas = datos.skills;
      pintar();
    } catch (error) {
      rejilla.classList.remove('skills');
      reemplazar(rejilla, elemento('div.error-vista', {}, [
        elemento('h2', { texto: 'No se pudieron leer las skills' }),
        elemento('p', { texto: error.message }),
      ]));
    }
  }

  const buscador = elemento('input.control', {
    type: 'search',
    id: 'buscar-skills',
    'aria-label': 'Buscar una skill',
    placeholder: 'Buscar por nombre o etiqueta…',
    autocomplete: 'off',
    'aria-describedby': 'ayuda-buscar-skills',
    alInput: (evento) => {
      consulta = normalizar(evento.target.value);
      pintar();
    },
  });

  reemplazar(rejilla, elemento('div.esqueleto.cargando__fila'), elemento('div.esqueleto.cargando__fila'));

  const seccion = elemento('section', {}, [
    elemento('header.encabezado', {}, [
      elemento('div.encabezado__texto', {}, [
        elemento('p.etiqueta-seccion', { texto: 'Fase 3 · Skills' }),
        elemento('h1.encabezado__titulo', { texto: 'Skills' }),
        elemento('p.encabezado__sub', {
          texto: 'Procedimientos escritos una vez y prestados a quien los necesite. El personaje ve ' +
            'el índice de las suyas y abre las instrucciones solo cuando vienen a cuento.',
        }),
      ]),
      elemento('div.encabezado__acciones', {}, [
        puedeEditar && elemento('button.boton.boton--primario', {
          type: 'button',
          alClick: () => modalSkill({ alGuardar: cargar }),
        }, [icono('mas', { clase: 'boton__icono' }), 'Nueva skill']),
      ]),
    ]),
    elemento('div.barra-herramientas', {}, [
      elemento('div.buscador', {}, [icono('buscar', { clase: 'buscador__icono' }), buscador]),
      conteo,
    ]),
    elemento('h2.solo-lectores', { texto: 'Skills escritas' }),
    rejilla,
  ]);

  cargar();
  return seccion;
}
