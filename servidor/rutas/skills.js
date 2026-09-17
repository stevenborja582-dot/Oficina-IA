/**
 * Skills (Fase 3): comportamientos empaquetados que se prestan a los personajes.
 *
 * Leerlas puede cualquiera que haya entrado —saber qué sabe hacer un personaje no
 * es un secreto—, pero escribirlas es de administradores: una skill entra en el
 * system prompt de quien la lleve, así que quien la edita decide cómo responde.
 */
import { Router } from 'express';
import * as skills from '../repositorios/skills.js';
import * as personajes from '../repositorios/personajes.js';
import { requiereAdmin } from '../autenticacion/guardias.js';
import { errorPeticion } from '../utilidades/errores.js';

export const rutasSkills = Router();

/** Vista de lista: sin el cuerpo, que puede ser largo y aquí no se lee. */
const enLista = (skill, usos) => ({
  id: skill.id,
  slug: skill.slug,
  nombre: skill.nombre,
  descripcion: skill.descripcion,
  cuando_usarla: skill.cuando_usarla,
  etiquetas: skill.etiquetas,
  activa: skill.activa,
  caracteres: skill.fuente.length,
  usos: usos ?? 0,
  actualizado_en: skill.actualizado_en,
});

rutasSkills.get('/', (_peticion, respuesta) => {
  const usos = skills.conteoDeUsos();
  respuesta.json({
    skills: skills.listar().map((skill) => enLista(skill, usos.get(skill.id))),
    limites: { fuente: skills.LIMITE_FUENTE, etiquetas: skills.MAXIMO_ETIQUETAS },
  });
});

/** Una skill entera, con su archivo tal cual se guardó. */
rutasSkills.get('/:id', (peticion, respuesta, siguiente) => {
  try {
    const skill = skills.exigirPorId(peticion.params.id);
    respuesta.json({ skill: { ...enLista(skill, skills.usosDe(skill.id)), fuente: skill.fuente } });
  } catch (error) {
    siguiente(error);
  }
});

rutasSkills.post('/', requiereAdmin, (peticion, respuesta, siguiente) => {
  try {
    const skill = skills.crear(peticion.body ?? {});
    respuesta.status(201).json({ skill: { ...enLista(skill, 0), fuente: skill.fuente } });
  } catch (error) {
    siguiente(error);
  }
});

rutasSkills.patch('/:id', requiereAdmin, (peticion, respuesta, siguiente) => {
  try {
    const skill = skills.actualizar(peticion.params.id, peticion.body ?? {});
    respuesta.json({ skill: { ...enLista(skill, skills.usosDe(skill.id)), fuente: skill.fuente } });
  } catch (error) {
    siguiente(error);
  }
});

rutasSkills.delete('/:id', requiereAdmin, (peticion, respuesta, siguiente) => {
  try {
    const skill = skills.eliminar(peticion.params.id);
    // Se devuelve entera para que "Deshacer" pueda reponerla sin volver a pedirla.
    respuesta.json({ skill });
  } catch (error) {
    siguiente(error);
  }
});

/** Deshacer un borrado. Recupera su id original si sigue libre. */
rutasSkills.post('/restaurar', requiereAdmin, (peticion, respuesta, siguiente) => {
  try {
    const skill = peticion.body?.skill;
    if (!skill?.fuente) throw errorPeticion('No hay ninguna skill que restaurar.', { campo: 'skill' });
    respuesta.status(201).json({ skill: enLista(skills.restaurar(skill), 0) });
  } catch (error) {
    siguiente(error);
  }
});

/* ── Asignación por personaje ────────────────────────────────────────────── */

export const rutasSkillsDePersonaje = Router({ mergeParams: true });

rutasSkillsDePersonaje.get('/:id/skills', (peticion, respuesta, siguiente) => {
  try {
    const personaje = personajes.exigirPorId(Number(peticion.params.id));
    const usos = skills.conteoDeUsos();
    respuesta.json({
      asignadas: skills.dePersonaje(personaje.id).map((skill) => enLista(skill, usos.get(skill.id))),
      disponibles: skills.listar().map((skill) => enLista(skill, usos.get(skill.id))),
    });
  } catch (error) {
    siguiente(error);
  }
});

rutasSkillsDePersonaje.put('/:id/skills', requiereAdmin, (peticion, respuesta, siguiente) => {
  try {
    const personaje = personajes.exigirPorId(Number(peticion.params.id));
    const lista = peticion.body?.skills;
    if (!Array.isArray(lista)) {
      throw errorPeticion('Se esperaba una lista de skills.', { campo: 'skills' });
    }
    const usos = skills.conteoDeUsos();
    respuesta.json({
      asignadas: skills.asignar(personaje.id, lista.map(Number)).map((skill) => enLista(skill, usos.get(skill.id))),
    });
  } catch (error) {
    siguiente(error);
  }
});
