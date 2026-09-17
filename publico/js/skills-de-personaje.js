/**
 * Bloque de skills dentro del modal de personaje (Fase 3).
 *
 * Asignar una skill es decidir cómo trabaja este personaje: lo que marques aquí
 * entra en su system prompt como índice, y él abre las instrucciones cuando le
 * hacen falta. Una skill apagada se enseña igual, en gris, porque explica por qué
 * el personaje no está haciendo lo que se espera de él.
 */
import { elemento, reemplazar } from './dom.js';
import { icono } from './iconos.js';
import { api } from './api.js';

export function bloqueSkills({ personaje, puedeEditar }) {
  const lista = elemento('div.asignacion');
  const nota = elemento('p.campo__pista', {
    texto: 'Entran en su contexto como índice; abre las instrucciones solo cuando vienen a cuento.',
  });
  const bloque = elemento('section.campo.asignacion__bloque', {}, [
    elemento('span.campo__etiqueta', { texto: 'Skills' }),
    nota,
    lista,
  ]);

  const marcadas = new Set();
  let cargado = false;

  function fila(skill) {
    const casilla = elemento('input', {
      type: 'checkbox',
      checked: marcadas.has(skill.id),
      disabled: !puedeEditar,
      id: `skill-${skill.id}`,
      alChange: (evento) => {
        if (evento.currentTarget.checked) marcadas.add(skill.id);
        else marcadas.delete(skill.id);
        caja.classList.toggle('asignacion__fila--viva', evento.currentTarget.checked);
      },
    });

    const caja = elemento('div.asignacion__fila', {}, [
      elemento('label.asignacion__cabeza', { for: `skill-${skill.id}` }, [
        casilla,
        elemento('span.asignacion__icono', { 'aria-hidden': 'true' }, [icono('manual')]),
        elemento('span.asignacion__texto', {}, [
          elemento('strong', {}, [
            skill.nombre,
            !skill.activa && elemento('span.chip.chip--neutro', { texto: 'Apagada' }),
          ]),
          elemento('span.campo__pista', {
            texto: skill.cuando_usarla || skill.descripcion || 'Sin descripción',
          }),
        ]),
      ]),
    ]);
    if (marcadas.has(skill.id)) caja.classList.add('asignacion__fila--viva');
    return caja;
  }

  async function cargar() {
    reemplazar(lista, elemento('div.esqueleto.cargando__fila'));
    try {
      const { asignadas, disponibles } = await api.skillsDe(personaje.id);
      asignadas.forEach((skill) => marcadas.add(skill.id));
      cargado = true;

      if (disponibles.length === 0) {
        reemplazar(lista, elemento('p.campo__pista', {
          texto: 'Todavía no hay skills escritas. Se crean en la pestaña Skills.',
        }));
        return;
      }
      reemplazar(lista, ...disponibles.map(fila));
    } catch (error) {
      reemplazar(lista, elemento('p.conector__error', { texto: error.message }));
    }
  }

  cargar();

  return {
    bloque,
    /** Se llama después de guardar el personaje: si no llegó a cargar, no toca nada. */
    async guardar(personajeId) {
      if (!cargado || !puedeEditar) return;
      await api.asignarSkills(personajeId, [...marcadas]);
    },
  };
}
