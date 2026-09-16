/** CRUD de salas. Crear, renombrar y borrar salas es cosa de administradores. */
import { Router } from 'express';
import * as salas from '../repositorios/salas.js';
import * as personajes from '../repositorios/personajes.js';
import { requiereAdmin } from '../autenticacion/guardias.js';

export const rutasSalas = Router();

rutasSalas.get('/', (_peticion, respuesta) => {
  respuesta.json({ salas: salas.listar() });
});

rutasSalas.get('/:slug', (peticion, respuesta, siguiente) => {
  try {
    const sala = salas.exigirPorSlug(peticion.params.slug);
    respuesta.json({ sala, personajes: personajes.listarPorSala(sala.id) });
  } catch (error) {
    siguiente(error);
  }
});

rutasSalas.post('/', requiereAdmin, (peticion, respuesta, siguiente) => {
  try {
    respuesta.status(201).json({ sala: salas.crear(peticion.body ?? {}) });
  } catch (error) {
    siguiente(error);
  }
});

rutasSalas.patch('/:id', requiereAdmin, (peticion, respuesta, siguiente) => {
  try {
    respuesta.json({ sala: salas.actualizar(Number(peticion.params.id), peticion.body ?? {}) });
  } catch (error) {
    siguiente(error);
  }
});

rutasSalas.delete('/:id', requiereAdmin, (peticion, respuesta, siguiente) => {
  try {
    respuesta.json({ sala: salas.eliminar(Number(peticion.params.id)) });
  } catch (error) {
    siguiente(error);
  }
});
