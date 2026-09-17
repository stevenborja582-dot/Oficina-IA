/** API de la oficina. Todo lo que cuelga de aquí exige sesión iniciada. */
import { Router } from 'express';
import { requiereSesion } from '../autenticacion/guardias.js';
import { usuarioPublico } from '../repositorios/usuarios.js';
import * as salas from '../repositorios/salas.js';
import * as personajes from '../repositorios/personajes.js';
import { PLANO, altoLienzo, pasillo } from '../base-datos/plano.js';
import { ESTADOS_PERSONAJE, ICONOS, PROVEEDORES_IA, LIMITES } from '../utilidades/validacion.js';
import { conEstadoChat, estadoProveedores } from '../ia/proveedores.js';
import { rutasSalas } from './salas.js';
import { rutasPersonajes } from './personajes.js';
import { rutasChat } from './chat.js';
import { rutasConectores, rutasConectoresDePersonaje } from './conectores.js';

export const rutasApi = Router();

rutasApi.use(requiereSesion);

/** Quién soy y qué puedo hacer. */
rutasApi.get('/yo', (peticion, respuesta) => {
  respuesta.json({
    usuario: usuarioPublico(peticion.user),
    permisos: { administrarSalas: peticion.user.rol === 'admin' },
  });
});

/**
 * Carga completa de la oficina en una sola petición: el plano se pinta de golpe,
 * sin cascada de llamadas ni saltos de layout.
 */
rutasApi.get('/oficina', (peticion, respuesta) => {
  const listaSalas = salas.listar();
  respuesta.json({
    usuario: usuarioPublico(peticion.user),
    permisos: { administrarSalas: peticion.user.rol === 'admin' },
    salas: listaSalas,
    personajes: personajes.listar().map(conEstadoChat),
    plano: {
      ancho: PLANO.anchoLienzo,
      alto: altoLienzo(listaSalas),
      margen: PLANO.margen,
      pasillo: pasillo(),
    },
    // Qué proveedores tienen clave: la interfaz avisa antes de que alguien escriba.
    proveedores: estadoProveedores(),
    catalogos: {
      proveedores: PROVEEDORES_IA,
      estados: ESTADOS_PERSONAJE,
      iconos: ICONOS,
      limites: LIMITES,
    },
  });
});

rutasApi.use('/salas', rutasSalas);
rutasApi.use('/personajes', rutasPersonajes);
rutasApi.use('/personajes', rutasChat);
rutasApi.use('/personajes', rutasConectoresDePersonaje);
rutasApi.use('/conectores', rutasConectores);
