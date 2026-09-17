/** API de la oficina. Todo lo que cuelga de aquí exige sesión iniciada. */
import { Router } from 'express';
import { requiereSesion } from '../autenticacion/guardias.js';
import { usuarioPublico } from '../repositorios/usuarios.js';
import * as salas from '../repositorios/salas.js';
import * as personajes from '../repositorios/personajes.js';
import { PLANO, altoLienzo, pasillo } from '../base-datos/plano.js';
import { APPS_SUGERIDAS, ESTADOS_PERSONAJE, ICONOS, PROVEEDORES_IA, RANGOS, LIMITES } from '../utilidades/validacion.js';
import { conEstadoChat, estadoProveedores } from '../ia/proveedores.js';
import { rutasSalas } from './salas.js';
import { rutasPersonajes } from './personajes.js';
import { rutasChat } from './chat.js';
import { rutasConectores, rutasConectoresDePersonaje } from './conectores.js';
import { rutasEquipo } from './equipo.js';
import { rutasSkills, rutasSkillsDePersonaje } from './skills.js';
import { rutasMisiones } from './misiones.js';

export const rutasApi = Router();

rutasApi.use(requiereSesion);

/**
 * Qué puede tocar quien pregunta. Hoy las dos salen del mismo rol, pero son
 * permisos distintos: repartir escritorios no es lo mismo que repartir llaves.
 */
const permisosDe = (usuario) => ({
  administrarSalas: usuario.rol === 'admin',
  administrarEquipo: usuario.rol === 'admin',
});

/** Quién soy y qué puedo hacer. */
rutasApi.get('/yo', (peticion, respuesta) => {
  respuesta.json({
    usuario: usuarioPublico(peticion.user),
    permisos: permisosDe(peticion.user),
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
    permisos: permisosDe(peticion.user),
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
      rangos: RANGOS,
      apps: APPS_SUGERIDAS,
      limites: LIMITES,
    },
  });
});

rutasApi.use('/salas', rutasSalas);
rutasApi.use('/personajes', rutasPersonajes);
rutasApi.use('/personajes', rutasChat);
rutasApi.use('/personajes', rutasConectoresDePersonaje);
rutasApi.use('/personajes', rutasSkillsDePersonaje);
rutasApi.use('/conectores', rutasConectores);
rutasApi.use('/skills', rutasSkills);
rutasApi.use('/misiones', rutasMisiones);
rutasApi.use('/equipo', rutasEquipo);
