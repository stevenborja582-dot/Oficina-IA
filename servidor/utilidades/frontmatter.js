/**
 * Frontmatter de las skills, analizado a mano.
 *
 * El formato es el de un `SKILL.md`: un bloque entre `---` con la cabecera, y
 * debajo las instrucciones en Markdown.
 *
 *     ---
 *     nombre: Revisión de código
 *     descripcion: Busca errores reales en un diff, no estilo
 *     cuando-usarla: Cuando pidan revisar código o un pull request
 *     etiquetas: código, revisión
 *     ---
 *
 *     # Cómo revisar
 *     …
 *
 * Es un subconjunto de YAML, no YAML: pares `clave: valor` de una línea, listas
 * separadas por comas o con guiones, comillas opcionales, y valores en varias
 * líneas con `|`. Nada más. Traer un analizador de YAML entero para esto serían
 * cien kilobytes de dependencia y una superficie de ataque que no necesitamos —
 * el mismo criterio que con el resto del backend.
 */

const SEPARADOR = /^---[ \t]*$/;

/** Quita las comillas envolventes si las hay, y deshace los escapes básicos. */
function desentrecomillar(valor) {
  const limpio = valor.trim();
  if (limpio.length < 2) return limpio;
  const primera = limpio[0];
  if ((primera === '"' || primera === "'") && limpio.endsWith(primera)) {
    const dentro = limpio.slice(1, -1);
    return primera === '"' ? dentro.replace(/\\n/g, '\n').replace(/\\"/g, '"') : dentro;
  }
  return limpio;
}

/**
 * Analiza el texto completo de una skill.
 * @returns {{cabecera: object, cuerpo: string, tieneFrontmatter: boolean}}
 */
export function analizar(texto) {
  const normalizado = String(texto ?? '').replace(/\r\n/g, '\n').replace(/^﻿/, '');
  const lineas = normalizado.split('\n');

  // El frontmatter solo cuenta si abre en la primera línea con contenido.
  let inicio = 0;
  while (inicio < lineas.length && lineas[inicio].trim() === '') inicio += 1;
  if (inicio >= lineas.length || !SEPARADOR.test(lineas[inicio])) {
    return { cabecera: {}, cuerpo: normalizado.trim(), tieneFrontmatter: false };
  }

  const cierre = lineas.findIndex((linea, indice) => indice > inicio && SEPARADOR.test(linea));
  if (cierre === -1) {
    // Un frontmatter abierto y sin cerrar: se trata todo como cuerpo, que es
    // menos sorprendente que tragarse el archivo entero como cabecera.
    return { cabecera: {}, cuerpo: normalizado.trim(), tieneFrontmatter: false };
  }

  return {
    cabecera: analizarCabecera(lineas.slice(inicio + 1, cierre)),
    cuerpo: lineas.slice(cierre + 1).join('\n').trim(),
    tieneFrontmatter: true,
  };
}

function analizarCabecera(lineas) {
  const cabecera = {};
  let indice = 0;

  while (indice < lineas.length) {
    const linea = lineas[indice];
    indice += 1;

    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;

    const corte = limpia.indexOf(':');
    if (corte < 1) continue;

    // La clave se normaliza: "cuando-usarla", "cuando_usarla" y "Cuando Usarla"
    // son la misma. Quien escribe la skill no debería tener que acertar el guion.
    const clave = limpia.slice(0, corte).trim().toLowerCase().replace(/[\s-]+/g, '_');
    const crudo = limpia.slice(corte + 1).trim();

    // Valor en varias líneas: `descripcion: |`
    if (crudo === '|' || crudo === '>' || crudo === '|-' || crudo === '>-') {
      const bloque = [];
      while (indice < lineas.length && (lineas[indice].trim() === '' || /^\s/.test(lineas[indice]))) {
        bloque.push(lineas[indice].replace(/^ {1,4}/, ''));
        indice += 1;
      }
      const junto = bloque.join(crudo.startsWith('>') ? ' ' : '\n').trim();
      cabecera[clave] = junto;
      continue;
    }

    // Lista con guiones debajo de la clave.
    if (crudo === '') {
      const lista = [];
      while (indice < lineas.length && /^\s*-\s+/.test(lineas[indice])) {
        lista.push(desentrecomillar(lineas[indice].replace(/^\s*-\s+/, '')));
        indice += 1;
      }
      cabecera[clave] = lista.length > 0 ? lista : '';
      continue;
    }

    // Lista en línea: [a, b] o a, b
    if (crudo.startsWith('[') && crudo.endsWith(']')) {
      cabecera[clave] = crudo.slice(1, -1).split(',').map(desentrecomillar).filter(Boolean);
      continue;
    }

    cabecera[clave] = desentrecomillar(crudo);
  }

  return cabecera;
}

/** Vuelve a componer el archivo a partir de su cabecera y su cuerpo. */
export function componer(cabecera, cuerpo) {
  const lineas = ['---'];

  for (const [clave, valor] of Object.entries(cabecera)) {
    if (valor === null || valor === undefined || valor === '') continue;
    if (Array.isArray(valor)) {
      if (valor.length > 0) lineas.push(`${clave}: ${valor.join(', ')}`);
    } else if (String(valor).includes('\n')) {
      lineas.push(`${clave}: |`);
      String(valor).split('\n').forEach((linea) => lineas.push(`  ${linea}`));
    } else {
      lineas.push(`${clave}: ${valor}`);
    }
  }

  lineas.push('---', '', String(cuerpo ?? '').trim(), '');
  return lineas.join('\n');
}
