/**
 * Cómo entran las skills en la cabeza de un personaje.
 *
 * El criterio es el de un `SKILL.md`: **revelación progresiva**. Meter cada
 * skill entera en el system prompt funciona con dos, y con diez se come el
 * contexto y el modelo pierde el hilo de lo que de verdad importa. Así que:
 *
 * - En el system prompt va siempre el **índice**: nombre, para qué sirve y
 *   cuándo sacarla. Son tres líneas por skill y es lo que permite al modelo
 *   saber lo que tiene a mano.
 * - Las instrucciones completas se piden con la herramienta `abrir_skill`, y
 *   solo cuando hacen falta.
 *
 * Con los proveedores que todavía no saben usar herramientas (OpenAI y Google en
 * esta casa) el modelo no puede pedir nada: ahí se inyectan enteras, hasta un
 * techo de caracteres, y el índice avisa de lo que se quedó fuera. Es peor, pero
 * es honesto: mejor decir "esta skill no cabe" que fingir que está.
 */
import * as skills from '../repositorios/skills.js';

export const HERRAMIENTA_ABRIR = 'abrir_skill';

/** Techo de lo que se inyecta entero cuando el modelo no puede pedirlo. */
const PRESUPUESTO_SIN_HERRAMIENTAS = 12000;

function lineaDeIndice(skill) {
  const partes = [`- **${skill.nombre}** (\`${skill.slug}\`)`];
  if (skill.descripcion) partes.push(`: ${skill.descripcion}`);
  if (skill.cuando_usarla) partes.push(` · Cuándo: ${skill.cuando_usarla}`);
  return partes.join('');
}

/** Bloque de una skill entera, con su nombre de cabecera. */
const bloqueCompleto = (skill) => `### ${skill.nombre} (\`${skill.slug}\`)\n\n${skill.cuerpo}`;

/**
 * Arma el system prompt del personaje y la herramienta para abrir skills.
 *
 * @param {object} personaje
 * @param {boolean} admiteHerramientas  si el proveedor sabe pedirlas por su cuenta
 * @returns {{sistema: string|null, definicion: object|null, abrir: Function|null, usadas: Array}}
 */
export function prepararSkills(personaje, { admiteHerramientas }) {
  const persona = personaje.persona_prompt?.trim() || '';
  const activas = skills.activasDe(personaje.id);

  if (activas.length === 0) {
    return { sistema: persona || null, definicion: null, abrir: null, indice: [] };
  }

  const partes = persona ? [persona] : [];

  if (admiteHerramientas) {
    partes.push(
      '## Tus skills\n\n' +
        'Tienes estas skills a mano. Cada una es un procedimiento ya escrito para un tipo de\n' +
        `trabajo concreto. Aquí solo ves el índice: cuando una encaje con lo que te piden, ábrela\n` +
        `con la herramienta \`${HERRAMIENTA_ABRIR}\` y **sigue lo que diga** antes de responder.\n` +
        'No te la inventes de memoria, y no la abras si no viene a cuento.\n\n' +
        activas.map(lineaDeIndice).join('\n'),
    );

    const porSlug = new Map(activas.map((skill) => [skill.slug, skill]));

    return {
      sistema: partes.join('\n\n'),
      indice: activas.map(skills.resumen),
      definicion: {
        name: HERRAMIENTA_ABRIR,
        description:
          'Abre una de tus skills y devuelve sus instrucciones completas. ' +
          'Úsala cuando el índice de skills indique que una encaja con lo que te han pedido.',
        input_schema: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'El identificador de la skill, entre paréntesis en el índice.',
              enum: activas.map((skill) => skill.slug),
            },
          },
          required: ['slug'],
        },
      },
      abrir: (argumentos) => {
        const skill = porSlug.get(String(argumentos?.slug ?? '').trim());
        if (!skill) {
          return {
            texto: `No tienes ninguna skill con el identificador "${argumentos?.slug}". ` +
              `Las tuyas son: ${activas.map((s) => s.slug).join(', ')}.`,
            esError: true,
          };
        }
        return { texto: bloqueCompleto(skill), esError: false };
      },
    };
  }

  // Sin herramientas: entran enteras mientras quepan.
  const dentro = [];
  const fuera = [];
  let gastado = 0;

  for (const skill of activas) {
    const bloque = bloqueCompleto(skill);
    if (gastado + bloque.length <= PRESUPUESTO_SIN_HERRAMIENTAS) {
      dentro.push(bloque);
      gastado += bloque.length;
    } else {
      fuera.push(skill);
    }
  }

  if (dentro.length > 0) {
    partes.push(
      '## Tus skills\n\n' +
        'Son procedimientos ya escritos. Si una encaja con lo que te piden, síguela.\n\n' +
        dentro.join('\n\n'),
    );
  }
  if (fuera.length > 0) {
    partes.push(
      '> Estas skills tuyas no caben en este contexto y no puedes consultarlas: ' +
        fuera.map((skill) => skill.nombre).join(', ') + '. ' +
        'Si el trabajo las necesita, dilo en vez de improvisar.',
    );
  }

  return { sistema: partes.join('\n\n') || null, indice: activas.map(skills.resumen), definicion: null, abrir: null };
}
