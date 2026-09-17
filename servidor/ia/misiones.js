/**
 * Orquestación de una misión (Fase 6).
 *
 * Una misión es una orden tuya ejecutada por varios personajes a la vez. El
 * recorrido tiene tres tiempos, y los tres son llamadas reales al modelo:
 *
 *   1. **Reparto.** El coordinador —el secretario si lo hay, si no el manager—
 *      recibe la orden y la plantilla del equipo (nombre, especialidad, app) y
 *      devuelve un plan: quién hace qué. No hace el trabajo; lo reparte.
 *   2. **Trabajo.** Cada especialista ejecuta su encargo con su propio proveedor,
 *      su persona y sus skills. Van **en paralelo**: son independientes, y en
 *      serie una misión de cinco pasos tardaría cinco veces más sin ganar nada.
 *   3. **Síntesis.** El coordinador recibe lo que trajo cada uno y escribe el
 *      resultado final. Si un paso falló, lo dice en vez de disimularlo.
 *
 * Todo el recorrido se emite como eventos para que la oficina lo enseñe en vivo:
 * cada personaje camina, se sienta y trabaja cuando le toca de verdad.
 */
import { configuracion } from '../configuracion.js';
import { motivoSinChat, resolverProveedor } from './proveedores.js';
import { prepararSkills, HERRAMIENTA_ABRIR } from './skills-en-contexto.js';
import { describir, ejecutar, herramientasDe } from '../mcp/herramientas.js';

/** Techo de pasos por misión: más que esto deja de ser una orden y es un proyecto. */
export const MAXIMO_PASOS = 6;

/** Lo que se le deja ver a un especialista del trabajo de los demás. */
const RECORTE_CONTEXTO = 2000;

const recortar = (texto, tope) =>
  (texto.length <= tope ? texto : `${texto.slice(0, tope)}\n\n[…recortado]`);

/* ── Quién coordina ──────────────────────────────────────────────────────── */

/**
 * El secretario manda sobre el manager, y el manager sobre el resto. Si no hay
 * ninguno de los dos, coordina el primer especialista que pueda hablar: alguien
 * tiene que repartir, y es mejor eso que negarse.
 */
export function elegirCoordinador(candidatos) {
  const utiles = candidatos.filter((personaje) => !motivoSinChat(personaje));
  return (
    utiles.find((personaje) => personaje.rango === 'secretario') ??
    utiles.find((personaje) => personaje.rango === 'manager') ??
    utiles[0] ??
    null
  );
}

/** Personajes que pueden ejecutar un encargo: los que de verdad responden. */
export const equipoDisponible = (personajes) =>
  personajes.filter((personaje) => personaje.estado === 'activo' && !motivoSinChat(personaje));

/* ── Texto que ve el modelo ──────────────────────────────────────────────── */

function fichaDe(personaje) {
  const partes = [`- ${personaje.nombre} (id ${personaje.id})`];
  if (personaje.rol_titulo) partes.push(` · ${personaje.rol_titulo}`);
  if (personaje.especialidad) partes.push(`\n    Especialidad: ${personaje.especialidad}`);
  if (personaje.app) partes.push(`\n    Trabaja con: ${personaje.app}`);
  if (personaje.sala_nombre) partes.push(`\n    Sala: ${personaje.sala_nombre}`);
  return partes.join('');
}

const PROMPT_REPARTO = `Eres quien reparte el trabajo en esta oficina.

Recibes un encargo y la plantilla del equipo. Tu tarea es **repartirlo**, no hacerlo.

Reglas:
- Un paso por persona, como mucho %MAX% pasos en total. Si el encargo lo resuelve
  una sola persona, un solo paso — no inventes trabajo para repartir.
- Elige a cada uno por su especialidad y su app, no por turno.
- El encargo de cada paso tiene que ser autosuficiente: esa persona no ve esta
  conversación, solo lee su encargo.
- No asignes a nadie que no esté en la plantilla.

Responde **solo** con un objeto JSON, sin texto alrededor y sin vallas de código:

{"titulo": "Cuatro o cinco palabras", "pasos": [{"personaje_id": 3, "encargo": "Qué tiene que entregar, concreto"}]}`;

const PROMPT_SINTESIS = `Eres quien cierra el trabajo de la oficina.

Tienes el encargo original y lo que ha traído cada persona. Escribe el resultado
final para quien lo pidió:

- Empieza por la respuesta, no por el resumen del proceso.
- Integra lo que trajeron; no pegues sus textos uno detrás de otro.
- Si un paso falló o quedó incompleto, **dilo** y explica qué falta.
- En Markdown, sin encabezado de nivel 1.`;

/* ── Una llamada suelta al modelo ────────────────────────────────────────── */

/**
 * Habla una vez con un personaje y devuelve el texto entero. Es el chat de la
 * Fase 2 sin streaming al navegador: aquí lo que se emite es el paso, no la letra.
 */
async function hablar(personaje, { sistema, mensaje, senal, conHerramientas = true }) {
  const { adaptador, modelo } = resolverProveedor(personaje);

  let puente = { definiciones: [], indice: new Map(), fallos: [] };
  if (conHerramientas && adaptador.admiteHerramientas) {
    try {
      puente = await herramientasDe(personaje.id);
    } catch {
      // Un conector caído no tumba la misión: el paso sale sin sus herramientas.
    }
  }

  const contexto = prepararSkills(
    { ...personaje, persona_prompt: sistema },
    { admiteHerramientas: Boolean(adaptador.admiteHerramientas) },
  );
  const herramientas = contexto.definicion
    ? [contexto.definicion, ...puente.definiciones]
    : puente.definiciones;

  let texto = '';
  let uso = { entrada: null, salida: null };
  let motivo = null;

  const flujo = adaptador.conversar({
    sistema: contexto.sistema,
    // Los adaptadores hablan en `{ role, content }`, como la API. El resto del
    // backend usa español, pero aquí se cruza la frontera.
    mensajes: [{ role: 'user', content: mensaje }],
    modelo,
    senal,
    herramientas,
    ejecutar: (nombre, argumentos) =>
      (nombre === HERRAMIENTA_ABRIR && contexto.abrir
        ? contexto.abrir(argumentos)
        : ejecutar(puente.indice, nombre, argumentos)),
    describir: (nombre) => (nombre === HERRAMIENTA_ABRIR ? 'Skill' : describir(puente.indice, nombre)),
  });

  for await (const trozo of flujo) {
    if (trozo.tipo === 'texto') texto += trozo.texto;
    else if (trozo.tipo === 'fin') {
      uso = trozo.uso ?? uso;
      motivo = trozo.motivo ?? null;
    }
  }

  if (!texto.trim() && motivo === 'refusal') {
    throw new Error('El modelo declinó este encargo.');
  }
  return { texto: texto.trim(), modelo, uso };
}

/* ── Reparto ─────────────────────────────────────────────────────────────── */

/** El modelo devuelve JSON, a veces envuelto en vallas. Se rescata lo que hay dentro. */
function rescatarJson(texto) {
  const sinVallas = texto.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const inicio = sinVallas.indexOf('{');
  const fin = sinVallas.lastIndexOf('}');
  if (inicio === -1 || fin <= inicio) throw new Error('El reparto no vino en el formato pedido.');
  return JSON.parse(sinVallas.slice(inicio, fin + 1));
}

/**
 * Pide el plan al coordinador y lo valida contra la plantilla real. Un plan que
 * nombre a alguien que no existe se corrige aquí, no se le pasa al siguiente paso.
 */
export async function repartir({ coordinador, equipo, orden, senal }) {
  const plantilla = equipo.map(fichaDe).join('\n');
  const sistema = PROMPT_REPARTO.replace('%MAX%', String(MAXIMO_PASOS));

  const { texto, modelo, uso } = await hablar(coordinador, {
    sistema,
    mensaje: `## Encargo\n\n${orden}\n\n## Plantilla disponible\n\n${plantilla}`,
    senal,
    // El reparto es una decisión, no un trabajo: no necesita conectores.
    conHerramientas: false,
  });

  const plan = rescatarJson(texto);
  const porId = new Map(equipo.map((personaje) => [personaje.id, personaje]));

  const pasos = (Array.isArray(plan.pasos) ? plan.pasos : [])
    .slice(0, MAXIMO_PASOS)
    .map((paso) => ({ personaje: porId.get(Number(paso.personaje_id)), encargo: String(paso.encargo ?? '').trim() }))
    .filter((paso) => paso.personaje && paso.encargo);

  if (pasos.length === 0) {
    throw new Error('El reparto no asignó ningún paso a nadie del equipo.');
  }

  return {
    titulo: String(plan.titulo ?? '').trim().slice(0, 80) || orden.slice(0, 60),
    pasos,
    modelo,
    uso,
  };
}

/* ── Trabajo y síntesis ──────────────────────────────────────────────────── */

const PERSONA_POR_DEFECTO = (personaje) =>
  `Eres ${personaje.nombre}${personaje.rol_titulo ? `, ${personaje.rol_titulo}` : ''} en esta oficina.` +
  (personaje.especialidad ? ` Tu especialidad: ${personaje.especialidad}.` : '');

/** Ejecuta un encargo. Nunca lanza: un paso que falla se cuenta, no rompe la misión. */
export async function trabajar({ personaje, encargo, orden, senal }) {
  const sistema =
    (personaje.persona_prompt?.trim() || PERSONA_POR_DEFECTO(personaje)) +
    '\n\nTrabajas en equipo: alguien juntará tu parte con la de los demás. Entrega solo ' +
    'lo tuyo, terminado y sin preámbulos. Si te falta un dato para hacerlo bien, dilo ' +
    'explícitamente en vez de inventarlo.';

  try {
    const { texto, modelo, uso } = await hablar(personaje, {
      sistema,
      mensaje: `## Encargo general de la oficina\n\n${orden}\n\n## Tu parte\n\n${encargo}`,
      senal,
    });
    return { ok: true, texto, modelo, uso };
  } catch (error) {
    return { ok: false, error: error?.message ?? 'Falló sin decir por qué.', modelo: null, uso: {} };
  }
}

export async function sintetizar({ coordinador, orden, pasos, senal }) {
  const partes = pasos
    .map((paso) => {
      const quien = `### ${paso.personaje?.nombre ?? 'Alguien'}${paso.personaje?.app ? ` (${paso.personaje.app})` : ''}`;
      const cuerpo = paso.estado === 'lista'
        ? recortar(paso.resultado, RECORTE_CONTEXTO)
        : `[No lo entregó: ${paso.error ?? 'sin motivo'}]`;
      return `${quien}\nEncargo: ${paso.encargo}\n\n${cuerpo}`;
    })
    .join('\n\n---\n\n');

  const { texto, modelo, uso } = await hablar(coordinador, {
    sistema: PROMPT_SINTESIS,
    mensaje: `## Encargo original\n\n${orden}\n\n## Lo que ha traído cada uno\n\n${partes}`,
    senal,
    conHerramientas: false,
  });

  return { texto, modelo, uso };
}

export const limiteContexto = () => configuracion.ia.mensajesDeContexto;
