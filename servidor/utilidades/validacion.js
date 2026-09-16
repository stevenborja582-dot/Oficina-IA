/**
 * Validación y saneado de la entrada del usuario.
 * Todo lo que llega del navegador pasa por aquí antes de tocar la base de datos.
 */
import { errorPeticion } from './errores.js';

export const PROVEEDORES_IA = ['anthropic', 'openai', 'google', 'externo'];
export const ESTADOS_PERSONAJE = ['activo', 'borrador', 'pausado'];
export const ICONOS = [
  'codigo',
  'paleta',
  'chispa',
  'pluma',
  'rayo',
  'oficina',
  'brujula',
  'cubo',
  'grafico',
  'escudo',
];

/**
 * Nombre técnico del campo → etiqueta que ve la persona. El código siempre habla
 * con el nombre técnico (el mismo `name` del formulario) para que el frontend pueda
 * marcar el campo exacto que falló; el mensaje usa la etiqueta.
 */
export const ETIQUETAS_CAMPO = {
  nombre: 'nombre',
  slug: 'identificador',
  descripcion: 'descripción',
  color_acento: 'color',
  icono: 'icono',
  sala_id: 'sala',
  rol_titulo: 'rol',
  avatar_url: 'avatar',
  persona_prompt: 'persona',
  proveedor_ia: 'proveedor',
  modelo: 'modelo',
  enlace_externo: 'enlace externo',
  estado: 'estado',
};

export const etiquetaDe = (campo) => ETIQUETAS_CAMPO[campo] ?? campo;

const LIMITES = {
  nombre: 60,
  slug: 48,
  rol_titulo: 80,
  descripcion: 280,
  persona_prompt: 8000,
  modelo: 80,
  url: 2048,
};

/** Recorta espacios y normaliza saltos de línea. `null`/`undefined` → ''. */
function limpiar(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\r\n/g, '\n').trim();
}

export function textoObligatorio(valor, campo, maximo = LIMITES.nombre) {
  const limpio = limpiar(valor);
  if (!limpio) throw errorPeticion(`El campo "${etiquetaDe(campo)}" no puede quedar vacío.`, { campo });
  if (limpio.length > maximo) {
    throw errorPeticion(`El campo "${etiquetaDe(campo)}" no puede superar ${maximo} caracteres.`, { campo });
  }
  return limpio;
}

export function textoOpcional(valor, campo, maximo = LIMITES.descripcion) {
  const limpio = limpiar(valor);
  if (limpio.length > maximo) {
    throw errorPeticion(`El campo "${etiquetaDe(campo)}" no puede superar ${maximo} caracteres.`, { campo });
  }
  return limpio;
}

export function opcionDeLista(valor, campo, opciones, porDefecto) {
  const limpio = limpiar(valor).toLowerCase();
  if (!limpio && porDefecto !== undefined) return porDefecto;
  if (!opciones.includes(limpio)) {
    throw errorPeticion(`"${etiquetaDe(campo)}" debe ser uno de: ${opciones.join(', ')}.`, { campo });
  }
  return limpio;
}

/** Solo http(s). Bloquea `javascript:`, `data:` y demás esquemas peligrosos. */
export function urlOpcional(valor, campo) {
  const limpio = limpiar(valor);
  if (!limpio) return null;
  if (limpio.length > LIMITES.url) {
    throw errorPeticion(`La URL de "${etiquetaDe(campo)}" es demasiado larga.`, { campo });
  }
  let analizada;
  try {
    analizada = new URL(limpio);
  } catch {
    throw errorPeticion(`"${etiquetaDe(campo)}" tiene que ser una URL válida (empieza por https://).`, { campo });
  }
  if (analizada.protocol !== 'http:' && analizada.protocol !== 'https:') {
    throw errorPeticion(`"${etiquetaDe(campo)}" solo admite direcciones http:// o https://.`, { campo });
  }
  return analizada.toString();
}

export function colorHex(valor, campo, porDefecto = '#57534E') {
  const limpio = limpiar(valor);
  if (!limpio) return porDefecto;
  const corto = /^#([0-9a-f]{3})$/i.exec(limpio);
  if (corto) {
    const [r, g, b] = corto[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (!/^#[0-9a-f]{6}$/i.test(limpio)) {
    throw errorPeticion(`"${etiquetaDe(campo)}" debe ser un color hexadecimal, por ejemplo #2563EB.`, { campo });
  }
  return limpio.toUpperCase();
}

export function enteroOpcional(valor, campo, { minimo = 0, maximo = 100000, porDefecto = 0 } = {}) {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    throw errorPeticion(`"${etiquetaDe(campo)}" debe ser un número entero entre ${minimo} y ${maximo}.`, { campo });
  }
  return numero;
}

/** Convierte "Redacción & Contenido" en "redaccion-contenido". */
export function generarSlug(texto) {
  const base = limpiar(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITES.slug);
  return base || 'sala';
}

/** Añade sufijos -2, -3… hasta encontrar un slug que no exista. */
export function slugUnico(base, existe) {
  let candidato = base;
  let contador = 2;
  while (existe(candidato)) {
    candidato = `${base}-${contador}`.slice(0, LIMITES.slug + 3);
    contador += 1;
  }
  return candidato;
}

export { LIMITES };
