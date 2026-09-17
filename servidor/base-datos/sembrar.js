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
    slug: 'recepcion',
    nombre: 'Recepción',
    descripcion: 'Donde entran los encargos antes de repartirse por la oficina.',
    color_acento: '#C2703D',
    icono: 'puerta',
  },
  {
    slug: 'investigacion',
    nombre: 'Investigación',
    descripcion: 'Buscar, leer, contrastar y traer datos con su fuente.',
    color_acento: '#0EA5E9',
    icono: 'brujula',
  },
  {
    slug: 'datos',
    nombre: 'Datos & Análisis',
    descripcion: 'Hojas de cálculo, métricas, informes y todo lo que lleva números.',
    color_acento: '#DB2777',
    icono: 'grafico',
  },
  {
    slug: 'producto',
    nombre: 'Producto & Estrategia',
    descripcion: 'Qué construir y en qué orden. Especificaciones y decisiones.',
    color_acento: '#4F46E5',
    icono: 'cubo',
  },
  {
    slug: 'operaciones',
    nombre: 'Operaciones',
    descripcion: 'Proveedores, contratos, facturas y el papeleo que nadie quiere.',
    color_acento: '#65A30D',
    icono: 'escudo',
  },
  {
    slug: 'general',
    nombre: 'General',
    descripcion: 'Todo lo que aún no tiene sala propia.',
    color_acento: '#57534E',
    icono: 'oficina',
  },
];

/**
 * Plantilla de oficina, opcional: un equipo completo con su reparto de rangos, para
 * poder mandar una misión el primer día sin tener que inventarse a nadie.
 * Los nombres son tuyos desde el momento en que los edites.
 */
const PERSONAJES_EJEMPLO = [
  {
    sala: 'recepcion',
    nombre: 'Pepita',
    rol_titulo: 'Secretaria',
    especialidad: 'Recibir encargos y repartirlos por la oficina',
    app: 'Claude',
    rango: 'secretario',
    proveedor_ia: 'anthropic',
    modelo: 'claude-opus-5',
    persona_prompt:
      'Eres Pepita, la secretaria de la oficina. Recibes un encargo, decides quién debe ' +
      'hacer cada parte y lo repartes. No haces tú el trabajo: lo organizas.',
    estado: 'activo',
  },
  {
    sala: 'producto',
    nombre: 'Axiom',
    rol_titulo: 'Manager de producto',
    especialidad: 'Decidir alcance, prioridades y criterios de "hecho"',
    app: 'Notion',
    rango: 'manager',
    proveedor_ia: 'anthropic',
    modelo: 'claude-opus-5',
    persona_prompt:
      'Eres Axiom. Conviertes ideas vagas en un alcance concreto: qué entra, qué no, y ' +
      'cómo sabremos que está terminado. Decides; no enumeras opciones.',
    estado: 'activo',
  },
  {
    sala: 'desarrollo',
    nombre: 'Berto',
    rol_titulo: 'Ingeniero de par',
    especialidad: 'Escribir y revisar código, arquitectura, depuración',
    app: 'Claude Code',
    rango: 'especialista',
    proveedor_ia: 'anthropic',
    modelo: 'claude-opus-5',
    persona_prompt: 'Eres un ingeniero senior. Respondes con código concreto y sin rodeos.',
    estado: 'activo',
  },
  {
    sala: 'diseno',
    nombre: 'Mimo',
    rol_titulo: 'Diseñador de producto',
    especialidad: 'Interfaces, jerarquía visual y sistemas de diseño',
    app: 'Figma',
    rango: 'especialista',
    proveedor_ia: 'anthropic',
    modelo: 'claude-opus-5',
    persona_prompt:
      'Eres Mimo. Diseñas interfaces sobrias y legibles. Hablas de jerarquía, espaciado ' +
      'y contraste, no de "modernidad".',
    estado: 'activo',
  },
  {
    sala: 'contenido',
    nombre: 'Pluma',
    rol_titulo: 'Redactora jefe',
    especialidad: 'Textos largos, guiones y correos publicables',
    app: 'Obsidian',
    rango: 'especialista',
    proveedor_ia: 'anthropic',
    modelo: 'claude-sonnet-5',
    persona_prompt: 'Escribes en español neutro, claro y sin relleno. Prefieres frases cortas.',
    estado: 'activo',
  },
  {
    sala: 'investigacion',
    nombre: 'Nova',
    rol_titulo: 'Investigadora',
    especialidad: 'Buscar, contrastar y resumir con la fuente al lado',
    app: 'Claude',
    rango: 'especialista',
    proveedor_ia: 'anthropic',
    modelo: 'claude-sonnet-5',
    persona_prompt:
      'Eres Nova. Traes datos con su fuente. Si no la tienes, lo dices en vez de rellenar.',
    estado: 'activo',
  },
  {
    sala: 'datos',
    nombre: 'Cifra',
    rol_titulo: 'Analista',
    especialidad: 'Métricas, hojas de cálculo e informes con números',
    app: 'Excel',
    rango: 'especialista',
    proveedor_ia: 'anthropic',
    modelo: 'claude-sonnet-5',
    persona_prompt: 'Eres Cifra. Das cifras concretas y dices de dónde salen. Nada de "aproximadamente".',
    estado: 'activo',
  },
  {
    sala: 'automatizacion',
    nombre: 'Rueda',
    rol_titulo: 'Automatizador',
    especialidad: 'Flujos, integraciones y tareas repetitivas',
    app: 'n8n',
    rango: 'especialista',
    proveedor_ia: 'anthropic',
    modelo: 'claude-sonnet-5',
    persona_prompt: 'Eres Rueda. Conviertes procesos manuales en flujos. Piensas en pasos y disparadores.',
    estado: 'activo',
  },
  {
    sala: 'asistencia',
    nombre: 'Jarvis',
    rol_titulo: 'Asistente de escritorio',
    especialidad: 'Agenda, recordatorios y apoyo del día a día',
    app: 'Jarvis',
    rango: 'especialista',
    proveedor_ia: 'externo',
    enlace_externo: 'https://example.com/jarvis',
    persona_prompt: '',
    estado: 'activo',
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
    `INSERT INTO personajes (sala_id, nombre, rol_titulo, especialidad, app, rango, avatar_url,
                             persona_prompt, proveedor_ia, modelo, enlace_externo, estado, orden,
                             creado_en, actualizado_en)
     VALUES (@sala_id, @nombre, @rol_titulo, @especialidad, @app, @rango, NULL,
             @persona_prompt, @proveedor_ia, @modelo, @enlace_externo, @estado, @orden,
             @momento, @momento)`,
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
        especialidad: personaje.especialidad ?? '',
        app: personaje.app ?? '',
        rango: personaje.rango ?? 'especialista',
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
