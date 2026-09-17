/**
 * Equipo (Fase 5): quién puede entrar en la oficina y con qué permisos.
 *
 * Todo lo que hay aquí es de administradores. Dos reglas que el repositorio
 * hace cumplir y que conviene tener presentes al leer las rutas: la oficina
 * nunca se queda sin ningún administrador activo, y nadie puede degradarse,
 * suspenderse ni borrarse a sí mismo — para eso está otro admin.
 */
import { Router } from 'express';
import * as usuarios from '../repositorios/usuarios.js';
import { requiereAdmin } from '../autenticacion/guardias.js';
import { errorPeticion } from '../utilidades/errores.js';

export const rutasEquipo = Router();

rutasEquipo.use(requiereAdmin);

rutasEquipo.get('/', (_peticion, respuesta) => {
  respuesta.json({
    equipo: usuarios.listarEquipo(),
    invitaciones: usuarios.listarInvitaciones(),
    roles: usuarios.ROLES,
    estados: usuarios.ESTADOS_USUARIO,
  });
});

/** Un tropiezo con tu propia cuenta te dejaría fuera de tu propia oficina. */
function noSobreMi(peticion, accion) {
  if (Number(peticion.params.id) === peticion.user.id) {
    throw errorPeticion(`No puedes ${accion} tu propia cuenta. Pídeselo a otro administrador.`);
  }
}

rutasEquipo.patch('/:id', (peticion, respuesta, siguiente) => {
  try {
    noSobreMi(peticion, 'cambiar');
    const { rol, estado } = peticion.body ?? {};
    if (rol === undefined && estado === undefined) {
      throw errorPeticion('No has pedido ningún cambio.');
    }
    respuesta.json({
      usuario: usuarios.usuarioPublico(usuarios.actualizarUsuario(peticion.params.id, { rol, estado })),
    });
  } catch (error) {
    siguiente(error);
  }
});

rutasEquipo.delete('/:id', (peticion, respuesta, siguiente) => {
  try {
    noSobreMi(peticion, 'borrar');
    respuesta.json({ usuario: usuarios.eliminarUsuario(peticion.params.id) });
  } catch (error) {
    siguiente(error);
  }
});

rutasEquipo.post('/invitaciones', (peticion, respuesta, siguiente) => {
  try {
    const { email, rol } = peticion.body ?? {};
    respuesta.status(201).json({ invitacion: usuarios.invitar({ email, rol }, peticion.user.id) });
  } catch (error) {
    siguiente(error);
  }
});

rutasEquipo.delete('/invitaciones/:id', (peticion, respuesta, siguiente) => {
  try {
    usuarios.revocarInvitacion(peticion.params.id);
    respuesta.json({ ok: true });
  } catch (error) {
    siguiente(error);
  }
});
