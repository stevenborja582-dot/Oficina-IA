/** CRUD de personajes, con borrado reversible ("Deshacer") desde la interfaz. */
import { Router } from 'express';
import * as personajes from '../repositorios/personajes.js';

export const rutasPersonajes = Router();

rutasPersonajes.get('/', (_peticion, respuesta) => {
  respuesta.json({ personajes: personajes.listar() });
});

rutasPersonajes.get('/:id', (peticion, respuesta, siguiente) => {
  try {
    respuesta.json({ personaje: personajes.exigirPorId(Number(peticion.params.id)) });
  } catch (error) {
    siguiente(error);
  }
});

rutasPersonajes.post('/', (peticion, respuesta, siguiente) => {
  try {
    respuesta.status(201).json({ personaje: personajes.crear(peticion.body ?? {}) });
  } catch (error) {
    siguiente(error);
  }
});

/** Deshacer un borrado: devuelve el personaje a su sala con su id original si sigue libre. */
rutasPersonajes.post('/restaurar', (peticion, respuesta, siguiente) => {
  try {
    respuesta.status(201).json({ personaje: personajes.restaurar(peticion.body?.personaje ?? {}) });
  } catch (error) {
    siguiente(error);
  }
});

rutasPersonajes.patch('/:id', (peticion, respuesta, siguiente) => {
  try {
    respuesta.json({ personaje: personajes.actualizar(Number(peticion.params.id), peticion.body ?? {}) });
  } catch (error) {
    siguiente(error);
  }
});

rutasPersonajes.delete('/:id', (peticion, respuesta, siguiente) => {
  try {
    respuesta.json({ personaje: personajes.eliminar(Number(peticion.params.id)) });
  } catch (error) {
    siguiente(error);
  }
});
