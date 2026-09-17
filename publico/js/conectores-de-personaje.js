/**
 * Bloque de conectores dentro del modal de personaje (Fase 4).
 *
 * Asignar un conector es dar permiso: este personaje podrá llamar a las
 * herramientas de ese servidor MCP. Por eso, además de marcarlo, se puede
 * acotar qué herramientas concretas quedan a su alcance — sin marcar ninguna
 * significa "todas las que publique".
 */
import { elemento, reemplazar } from './dom.js';
import { icono } from './iconos.js';
import { api } from './api.js';

/** Proveedores que saben usar herramientas. El resto solo conversa. */
const CON_HERRAMIENTAS = new Set(['anthropic']);

/**
 * @param {object} opciones.personaje  personaje ya existente (los nuevos no tienen id)
 * @param {boolean} opciones.puedeEditar  solo un admin reparte permisos
 * @param {Function} opciones.proveedorActual  lee el proveedor elegido en el formulario
 * @returns {{bloque: HTMLElement, guardar: Function}}
 */
export function bloqueConectores({ personaje, puedeEditar, proveedorActual }) {
  const lista = elemento('div.asignacion');
  const nota = elemento('p.campo__pista');
  const bloque = elemento('section.campo.asignacion__bloque', {}, [
    elemento('span.campo__etiqueta', { texto: 'Conectores' }),
    nota,
    lista,
  ]);

  // conector.id → { marcado, herramientas: Set<string> }
  const seleccion = new Map();
  let cargado = false;

  function pintarNota() {
    const admite = CON_HERRAMIENTAS.has(proveedorActual());
    nota.textContent = admite
      ? 'Lo que marques aquí queda a mano de este personaje mientras conversa.'
      : 'Este proveedor todavía no sabe usar herramientas: lo que marques se guarda, pero no se usará hasta que lo cambies a Claude.';
    bloque.classList.toggle('asignacion__bloque--inerte', !admite);
  }

  function filaConector(conector) {
    const estado = seleccion.get(conector.id);
    const herramientas = conector.herramientas ?? [];

    const casilla = elemento('input', {
      type: 'checkbox',
      checked: estado.marcado,
      disabled: !puedeEditar,
      id: `conector-${conector.id}`,
      alChange: (evento) => {
        estado.marcado = evento.currentTarget.checked;
        detalle.hidden = !estado.marcado || herramientas.length === 0;
        fila.classList.toggle('asignacion__fila--viva', estado.marcado);
      },
    });

    const detalle = elemento('div.asignacion__herramientas', {}, herramientas.map((herramienta) => {
      const marcada = estado.herramientas.has(herramienta.nombre);
      return elemento('label.asignacion__herramienta', { title: herramienta.descripcion || '' }, [
        elemento('input', {
          type: 'checkbox',
          checked: marcada,
          disabled: !puedeEditar,
          alChange: (evento) => {
            if (evento.currentTarget.checked) estado.herramientas.add(herramienta.nombre);
            else estado.herramientas.delete(herramienta.nombre);
          },
        }),
        elemento('span.mono', { texto: herramienta.nombre }),
      ]);
    }));
    detalle.hidden = !estado.marcado || herramientas.length === 0;

    const fila = elemento('div.asignacion__fila', {}, [
      elemento('label.asignacion__cabeza', { for: `conector-${conector.id}` }, [
        casilla,
        elemento('span.asignacion__icono', { 'aria-hidden': 'true' }, [icono('enchufe')]),
        elemento('span.asignacion__texto', {}, [
          elemento('strong', { texto: conector.nombre }),
          elemento('span.campo__pista', {
            texto: herramientas.length > 0
              ? `${herramientas.length} herramienta${herramientas.length === 1 ? '' : 's'}`
              : 'Sin probar: pruébalo en Conectores para ver qué publica.',
          }),
        ]),
      ]),
      detalle,
    ]);
    if (estado.marcado) fila.classList.add('asignacion__fila--viva');
    return fila;
  }

  async function cargar() {
    reemplazar(lista, elemento('div.esqueleto.cargando__fila'));
    try {
      const { asignados, disponibles } = await api.conectoresDe(personaje.id);
      const porId = new Map(asignados.map((c) => [c.id, c]));

      disponibles.forEach((conector) => {
        const asignado = porId.get(conector.id);
        seleccion.set(conector.id, {
          marcado: Boolean(asignado),
          herramientas: new Set(asignado?.herramientas_permitidas ?? []),
        });
      });
      cargado = true;

      if (disponibles.length === 0) {
        reemplazar(lista, elemento('p.campo__pista', {
          texto: 'Todavía no hay conectores dados de alta. Se crean en la pestaña Conectores.',
        }));
        return;
      }
      reemplazar(lista, ...disponibles.map(filaConector));
    } catch (error) {
      reemplazar(lista, elemento('p.conector__error', { texto: error.message }));
    }
  }

  pintarNota();
  cargar();

  return {
    bloque,
    actualizarNota: pintarNota,
    /** Se llama después de guardar el personaje: si no llegó a cargar, no toca nada. */
    async guardar(personajeId) {
      if (!cargado || !puedeEditar) return;
      const asignaciones = [...seleccion.entries()]
        .filter(([, estado]) => estado.marcado)
        .map(([id, estado]) => ({ conector_id: id, herramientas: [...estado.herramientas] }));
      await api.asignarConectores(personajeId, asignaciones);
    },
  };
}
