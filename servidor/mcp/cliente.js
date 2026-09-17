/**
 * Cliente MCP.
 *
 * Cada conector es un servidor MCP y este módulo es el único sitio del backend
 * que habla con ellos. Mantiene una conexión viva por conector —abrir un proceso
 * en cada mensaje sería lentísimo— y la cierra cuando lleva rato sin usarse.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { configuracion } from '../configuracion.js';
import { ErrorHttp } from '../utilidades/errores.js';

const IDENTIDAD = { name: 'oficina-black-hole', version: '2.0.0' };
const MINUTO = 60 * 1000;

/** conector.id → { cliente, transporte, usadoEn } */
const vivas = new Map();

function crearTransporte(conector) {
  if (conector.transporte === 'http') {
    const cabeceras = { ...conector.cabeceras };
    return new StreamableHTTPClientTransport(new URL(conector.url), {
      requestInit: { headers: cabeceras },
    });
  }

  if (!configuracion.mcp.permitirStdio) {
    throw new ErrorHttp(
      403,
      'Los conectores que lanzan un proceso están desactivados en este servidor. ' +
        'Actívalos con MCP_PERMITIR_STDIO=true solo si confías en quien administra la oficina.',
    );
  }

  return new StdioClientTransport({
    command: conector.comando,
    args: conector.argumentos,
    // El proceso hereda solo lo que necesita: PATH y lo que declare el conector.
    env: { PATH: process.env.PATH ?? '', ...conector.variables },
    stderr: 'pipe',
  });
}

/** Abre —o reutiliza— la conexión con un conector. */
export async function conectar(conector) {
  const viva = vivas.get(conector.id);
  if (viva) {
    viva.usadoEn = Date.now();
    return viva.cliente;
  }

  const cliente = new Client(IDENTIDAD, { capabilities: {} });
  const transporte = crearTransporte(conector);

  try {
    await conAlarma(
      cliente.connect(transporte),
      configuracion.mcp.esperaConexion,
      `El conector "${conector.nombre}" no respondió al conectarse.`,
    );
  } catch (error) {
    await transporte.close?.().catch(() => {});
    throw traducir(error, conector);
  }

  vivas.set(conector.id, { cliente, transporte, usadoEn: Date.now() });
  return cliente;
}

export async function listarHerramientas(conector) {
  const cliente = await conectar(conector);
  const respuesta = await conAlarma(
    cliente.listTools(),
    configuracion.mcp.esperaConexion,
    `El conector "${conector.nombre}" tardó demasiado en listar sus herramientas.`,
  );

  return (respuesta.tools ?? []).map((herramienta) => ({
    nombre: herramienta.name,
    descripcion: herramienta.description ?? '',
    esquema: herramienta.inputSchema ?? { type: 'object', properties: {} },
  }));
}

/** Ejecuta una herramienta y devuelve su resultado como texto plano. */
export async function llamar(conector, nombre, argumentos) {
  const cliente = await conectar(conector);
  const respuesta = await conAlarma(
    cliente.callTool({ name: nombre, arguments: argumentos ?? {} }),
    configuracion.mcp.esperaLlamada,
    `La herramienta "${nombre}" tardó demasiado en responder.`,
  );

  const partes = (respuesta.content ?? []).map((bloque) => {
    if (bloque.type === 'text') return bloque.text;
    if (bloque.type === 'resource' && bloque.resource?.text) return bloque.resource.text;
    // Imágenes y binarios no entran en el contexto: se anuncian y ya.
    return `[${bloque.type} omitido]`;
  });

  const texto = partes.join('\n').trim() || '(sin contenido)';
  return { texto: recortar(texto), esError: Boolean(respuesta.isError) };
}

export async function cerrar(id) {
  const viva = vivas.get(id);
  if (!viva) return;
  vivas.delete(id);
  await viva.cliente.close().catch(() => {});
}

export async function cerrarTodas() {
  await Promise.all([...vivas.keys()].map((id) => cerrar(id)));
}

/** Cierra las conexiones que llevan rato sin usarse. */
function recogerInactivas() {
  const limite = Date.now() - configuracion.mcp.minutosInactividad * MINUTO;
  for (const [id, viva] of vivas) {
    if (viva.usadoEn < limite) cerrar(id);
  }
}
const barrido = setInterval(recogerInactivas, 5 * MINUTO);
if (typeof barrido.unref === 'function') barrido.unref();

/* ── Utilidades ──────────────────────────────────────────────────────────── */

/** Una promesa con fecha de caducidad: un servidor MCP colgado no cuelga el chat. */
function conAlarma(promesa, milisegundos, mensaje) {
  return new Promise((resolver, rechazar) => {
    const alarma = setTimeout(() => rechazar(new ErrorHttp(504, mensaje)), milisegundos);
    promesa.then(
      (valor) => { clearTimeout(alarma); resolver(valor); },
      (error) => { clearTimeout(alarma); rechazar(error); },
    );
  });
}

/** El resultado de una herramienta va al contexto del modelo: no puede ser infinito. */
function recortar(texto) {
  const tope = configuracion.mcp.maximoCaracteres;
  if (texto.length <= tope) return texto;
  return texto.slice(0, tope) + `\n\n[…recortado: ${texto.length - tope} caracteres más]`;
}

function traducir(error, conector) {
  if (error instanceof ErrorHttp) return error;
  const detalle = error?.message ?? String(error);
  if (/ENOENT/.test(detalle)) {
    return new ErrorHttp(502, `No se encontró la orden "${conector.comando}". ¿Está instalada y en el PATH?`);
  }
  return new ErrorHttp(502, `No se pudo conectar con "${conector.nombre}": ${detalle}`);
}
