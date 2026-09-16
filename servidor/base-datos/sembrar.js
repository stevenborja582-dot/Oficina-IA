/**
 * Siembra inicial: las seis salas nacen de los departamentos que ya existían en la v1.
 * Se ejecuta sola en el primer arranque, o a mano con `npm run bd:sembrar`.
 * Con `npm run bd:sembrar -- --ejemplos` añade además tres personajes de muestra.
 */
import { bd, ahora } from './conexion.js';
import { casilla } from './plano.js';

/** Departamentos de la v1 → salas de la v2. El color es el mismo de cada chip. */
export const SALAS_INICIALES = [
  {
    slug: 'desarrollo',
    nombre: 'Desarrollo & Código',
    descripcion: 'Programación, revisión de código, depuración y arquitectura.',
    color_acento: '#2563EB',
    icono: 'codigo',
  },
  {
    slug: 'diseno',
    nombre: 'Diseño Visual',
    descripcion: 'Interfaces, identidad visual, ilustración y prototipos.',
    color_acento: '#7C3AED',
    icono: 'paleta',
  },
  {
    slug: 'asistencia',
    nombre: 'Asistencia Personal',
    descripcion: 'Agenda, recordatorios, búsquedas y apoyo del día a día.',
    color_acento: '#059669',
    icono: 'chispa',
  },
  {
    slug: 'contenido',
    nombre: 'Redacción & Contenido',
    descripcion: 'Textos largos, guiones, correos y material publicable.',
    color_acento: '#0D9488',
    icono: 'pluma',
  },
  {
    slug: 'automatizacion',
    nombre: 'Automatización',
    descripcion: 'Flujos, tareas repetitivas e integraciones entre servicios.',
    color_acento: '#D97706',
    icono: 'rayo',
  },
  {
    slug: 'general',
    nombre: 'General',
    descripcion: 'Todo lo que aún no tiene sala propia.',
    color_acento: '#57534E',
    icono: 'oficina',
  },
];

/** Personajes de muestra, opcionales: sirven para ver el plano con vida el primer día. */
const PERSONAJES_EJEMPLO = [
  {
    sala: 'desarrollo',
    nombre: 'Claude Code',
    rol_titulo: 'Ingeniero de par',
    proveedor_ia: 'anthropic',
    modelo: 'claude-opus-5',
    persona_prompt: 'Eres un ingeniero senior. Respondes con código concreto y sin rodeos.',
    estado: 'activo',
  },
  {
    sala: 'asistencia',
    nombre: 'Jarvis',
    rol_titulo: 'Asistente de escritorio',
    proveedor_ia: 'externo',
    enlace_externo: 'https://example.com/jarvis',
    persona_prompt: '',
    estado: 'activo',
  },
  {
    sala: 'contenido',
    nombre: 'Pluma',
    rol_titulo: 'Redactora jefe',
    proveedor_ia: 'anthropic',
    modelo: 'claude-sonnet-5',
    persona_prompt: 'Escribes en español neutro, claro y sin relleno. Prefieres frases cortas.',
    estado: 'borrador',
  },
];

export function sembrarSalasSiVacio() {
  const baseDatos = bd();
  const total = baseDatos.prepare('SELECT COUNT(*) AS total FROM salas').get().total;
  if (total > 0) return { creadas: 0 };

  const momento = ahora();
  const insertar = baseDatos.prepare(
    `INSERT INTO salas (slug, nombre, descripcion, color_acento, icono, orden,
                        plano_x, plano_y, plano_ancho, plano_alto, creado_en, actualizado_en)
     VALUES (@slug, @nombre, @descripcion, @color_acento, @icono, @orden,
             @plano_x, @plano_y, @plano_ancho, @plano_alto, @momento, @momento)`,
  );

  const transaccion = baseDatos.transaction(() => {
    SALAS_INICIALES.forEach((sala, indice) => {
      insertar.run({ ...sala, ...casilla(indice), orden: indice, momento });
    });
  });
  transaccion();

  return { creadas: SALAS_INICIALES.length };
}

export function sembrarPersonajesEjemplo() {
  const baseDatos = bd();
  const total = baseDatos.prepare('SELECT COUNT(*) AS total FROM personajes').get().total;
  if (total > 0) return { creados: 0 };

  const momento = ahora();
  const insertar = baseDatos.prepare(
    `INSERT INTO personajes (sala_id, nombre, rol_titulo, avatar_url, persona_prompt, proveedor_ia,
                             modelo, enlace_externo, estado, orden, creado_en, actualizado_en)
     VALUES (@sala_id, @nombre, @rol_titulo, NULL, @persona_prompt, @proveedor_ia,
             @modelo, @enlace_externo, @estado, @orden, @momento, @momento)`,
  );

  let creados = 0;
  const transaccion = baseDatos.transaction(() => {
    PERSONAJES_EJEMPLO.forEach((personaje, indice) => {
      const sala = baseDatos.prepare('SELECT id FROM salas WHERE slug = ?').get(personaje.sala);
      if (!sala) return;
      insertar.run({
        sala_id: sala.id,
        nombre: personaje.nombre,
        rol_titulo: personaje.rol_titulo ?? '',
        persona_prompt: personaje.persona_prompt ?? '',
        proveedor_ia: personaje.proveedor_ia,
        modelo: personaje.modelo ?? '',
        enlace_externo: personaje.enlace_externo ?? null,
        estado: personaje.estado ?? 'activo',
        orden: indice,
        momento,
      });
      creados += 1;
    });
  });
  transaccion();

  return { creados };
}

// Ejecución directa: node servidor/base-datos/sembrar.js [--ejemplos]
if (import.meta.url === `file://${process.argv[1]}`) {
  const salas = sembrarSalasSiVacio();
  console.log(`Salas creadas: ${salas.creadas}`);
  if (process.argv.includes('--ejemplos')) {
    const personajes = sembrarPersonajesEjemplo();
    console.log(`Personajes de ejemplo creados: ${personajes.creados}`);
  }
}
