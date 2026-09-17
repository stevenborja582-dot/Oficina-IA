/**
 * Conectores MCP: alta, prueba y asignación a personajes.
 *
 * Crear y editar conectores es cosa de administradores: un conector de tipo
 * proceso lanza una orden del sistema. Y los secretos (variables de entorno,
 * cabeceras) no vuelven nunca al navegador — solo sus nombres.
 */
import { Router } from 'express';
import * as conectores from '../repositorios/conectores.js';
import * as personajes from '../repositorios/personajes.js';
import { requiereAdmin } from '../autenticacion/guardias.js';
import { configuracion } from '../configuracion.js';
import { listarHerramientas } from '../mcp/cliente.js';
import { errorPeticion } from '../utilidades/errores.js';

export const rutasConectores = Router();

/** Vista pública: la configuración sí, los secretos no. */
function publico(conector) {
  const { variables, cabeceras, ...resto } = conector;
  return {
    ...resto,
    variables_claves: Object.keys(variables ?? {}),
    cabeceras_claves: Object.keys(cabeceras ?? {}),
  };
}

/**
 * Los campos de secretos solo viajan cuando la persona escribe algo: un campo
 * vacío significa "deja los de antes", no "bórralos".
 */
function sinSecretosVacios(cuerpo) {
  const copia = { ...cuerpo };
  for (const campo of ['variables', 'cabeceras']) {
    if (typeof copia[campo] === 'string' && copia[campo].trim() === '') delete copia[campo];
  }
  return copia;
}

rutasConectores.get('/', (_peticion, respuesta) => {
  respuesta.json({
    conectores: conectores.listar().map(publico),
    // Sin esto la interfaz no puede explicar por qué un conector de proceso falla.
    permiteProcesos: configuracion.mcp.permitirStdio,
  });
});

rutasConectores.post('/', requiereAdmin, (peticion, respuesta, siguiente) => {
  try {
    respuesta.status(201).json({ conector: publico(conectores.crear(peticion.body ?? {})) });
  } catch (error) {
    siguiente(error);
  }
});

rutasConectores.patch('/:id', requiereAdmin, (peticion, respuesta, siguiente) => {
  try {
    const actualizado = conectores.actualizar(Number(peticion.params.id), sinSecretosVacios(peticion.body ?? {}));
    respuesta.json({ conector: publico(actualizado) });
  } catch (error) {
    siguiente(error);
  }
});

rutasConectores.delete('/:id', requiereAdmin, (peticion, respuesta, siguiente) => {
  try {
    respuesta.json({ conector: publico(conectores.eliminar(Number(peticion.params.id))) });
  } catch (error) {
    siguiente(error);
  }
});

/** Abre el conector y pregunta qué sabe hacer. Es la única forma honesta de decir "listo". */
rutasConectores.post('/:id/probar', requiereAdmin, async (peticion, respuesta, siguiente) => {
  try {
    const conector = conectores.exigirPorId(Number(peticion.params.id));
    try {
      const herramientas = await listarHerramientas(conector);
      respuesta.json({ conector: publico(conectores.anotarPrueba(conector.id, { herramientas, error: null })) });
    } catch (error) {
      const anotado = conectores.anotarPrueba(conector.id, { error: error.message });
      respuesta.status(200).json({ conector: publico(anotado), error: error.message });
    }
  } catch (error) {
    siguiente(error);
  }
});

/* ── Asignación a un personaje ───────────────────────────────────────────── */

export const rutasConectoresDePersonaje = Router({ mergeParams: true });

rutasConectoresDePersonaje.get('/:id/conectores', (peticion, respuesta, siguiente) => {
  try {
    const personaje = personajes.exigirPorId(Number(peticion.params.id));
    respuesta.json({
      asignados: conectores.dePersonaje(personaje.id).map((c) => ({
        ...publico(c),
        herramientas_permitidas: c.herramientas_permitidas,
      })),
      disponibles: conectores.listar().map(publico),
    });
  } catch (error) {
    siguiente(error);
  }
});

rutasConectoresDePersonaje.put('/:id/conectores', requiereAdmin, (peticion, respuesta, siguiente) => {
  try {
    const personaje = personajes.exigirPorId(Number(peticion.params.id));
    const asignaciones = peticion.body?.conectores;
    if (!Array.isArray(asignaciones)) {
      throw errorPeticion('Se esperaba una lista de conectores.', { campo: 'conectores' });
    }
    respuesta.json({
      asignados: conectores.asignar(personaje.id, asignaciones).map((c) => ({
        ...publico(c),
        herramientas_permitidas: c.herramientas_permitidas,
      })),
    });
  } catch (error) {
    siguiente(error);
  }
});
