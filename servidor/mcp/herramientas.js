/**
 * Puente entre los conectores MCP y el modelo.
 *
 * Traduce las herramientas que publica cada servidor MCP al formato que espera
 * la API, y ejecuta las llamadas que pida el modelo. El personaje decide qué
 * conectores usa y, dentro de cada uno, qué herramientas: lo que no esté en la
 * lista blanca no se le llega ni a ofrecer.
 */
import * as conectores from '../repositorios/conectores.js';
import { listarHerramientas, llamar } from './cliente.js';

/** La API solo admite [a-zA-Z0-9_-] y 64 caracteres en el nombre de una herramienta. */
const sanear = (texto) => String(texto).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);

const nombrePublico = (conector, herramienta) => `${sanear(conector.slug)}__${sanear(herramienta)}`;

/**
 * Herramientas disponibles para un personaje, ya en formato de la API.
 * Devuelve también el índice para poder resolver una llamada al conector real.
 */
export async function herramientasDe(personajeId) {
  const asignados = conectores.dePersonaje(personajeId);
  if (asignados.length === 0) return { definiciones: [], indice: new Map(), fallos: [] };

  const definiciones = [];
  const indice = new Map();
  const fallos = [];

  for (const conector of asignados) {
    let publicadas;
    try {
      publicadas = await listarHerramientas(conector);
      conectores.anotarPrueba(conector.id, { herramientas: publicadas, error: null });
    } catch (error) {
      // Un conector caído no puede tumbar la conversación entera: se anota,
      // se avisa y el personaje sigue con lo que sí tenga.
      conectores.anotarPrueba(conector.id, { error: error.message });
      fallos.push({ conector: conector.nombre, error: error.message });
      continue;
    }

    const permitidas = conector.herramientas_permitidas;
    for (const herramienta of publicadas) {
      if (permitidas.length > 0 && !permitidas.includes(herramienta.nombre)) continue;

      const nombre = nombrePublico(conector, herramienta.nombre);
      if (indice.has(nombre)) continue;

      indice.set(nombre, { conector, herramienta: herramienta.nombre });
      definiciones.push({
        name: nombre,
        description: `[${conector.nombre}] ${herramienta.descripcion}`.trim(),
        input_schema: herramienta.esquema,
      });
    }
  }

  return { definiciones, indice, fallos };
}

/**
 * Ejecuta una llamada del modelo. Nunca lanza: un fallo de la herramienta se le
 * devuelve al modelo como resultado de error para que decida qué hacer.
 */
export async function ejecutar(indice, nombre, argumentos) {
  const destino = indice.get(nombre);
  if (!destino) {
    return { texto: `No existe ninguna herramienta llamada "${nombre}".`, esError: true };
  }

  try {
    return await llamar(destino.conector, destino.herramienta, argumentos);
  } catch (error) {
    return { texto: error?.message ?? 'La herramienta falló sin decir por qué.', esError: true };
  }
}

/** Nombre legible para la interfaz: "conector · herramienta". */
export function describir(indice, nombre) {
  const destino = indice.get(nombre);
  if (!destino) return nombre;
  return `${destino.conector.nombre} · ${destino.herramienta}`;
}
