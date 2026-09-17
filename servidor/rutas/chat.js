/**
 * Chat de un personaje.
 *
 * La respuesta viaja en streaming (SSE) por dos razones: se lee mientras se
 * escribe, y una respuesta larga no se come el tiempo de espera del HTTP.
 * El mensaje se guarda pase lo que pase — también si falla a medio camino o si
 * quien pregunta cierra la pestaña.
 */
import { Router } from 'express';
import { configuracion } from '../configuracion.js';
import * as personajes from '../repositorios/personajes.js';
import * as conversaciones from '../repositorios/conversaciones.js';
import { motivoSinChat, resolverProveedor } from '../ia/proveedores.js';
import * as conectores from '../repositorios/conectores.js';
import { describir, ejecutar, herramientasDe } from '../mcp/herramientas.js';
import { ErrorHttp, errorPeticion } from '../utilidades/errores.js';
import { LIMITES, textoObligatorio } from '../utilidades/validacion.js';
import { limitar } from '../middlewares/limite-peticiones.js';

export const rutasChat = Router({ mergeParams: true });

const LIMITE_MENSAJE = 24000;

/** Estado del chat de un personaje: si se puede hablar y con qué. */
function estadoChat(personaje) {
  const motivo = motivoSinChat(personaje);
  if (motivo) return { disponible: false, motivo, modelo: null };

  const { modelo } = resolverProveedor(personaje);
  return { disponible: true, motivo: null, modelo };
}

/** Lo que se manda al navegador: sin el prompt de sistema ni nada del servidor. */
const mensajePublico = (mensaje) => ({
  herramientas: mensaje.herramientas ? JSON.parse(mensaje.herramientas) : null,
  id: mensaje.id,
  rol: mensaje.rol,
  contenido: mensaje.contenido,
  razonamiento: mensaje.razonamiento,
  modelo: mensaje.modelo,
  proveedor_ia: mensaje.proveedor_ia,
  tokens_entrada: mensaje.tokens_entrada,
  tokens_salida: mensaje.tokens_salida,
  error: mensaje.error,
  creado_en: mensaje.creado_en,
});

/* ── Leer el hilo ────────────────────────────────────────────────────────── */

rutasChat.get('/:id/conversacion', (peticion, respuesta, siguiente) => {
  try {
    const personaje = personajes.exigirPorId(Number(peticion.params.id));
    const conversacion = conversaciones.abiertaDe(personaje.id, peticion.user.id);

    respuesta.json({
      personaje,
      conversacion,
      mensajes: conversaciones.mensajesDe(conversacion.id).map(mensajePublico),
      historico: conversaciones.historicoDe(personaje.id, peticion.user.id),
      chat: estadoChat(personaje),
      // Qué conectores lleva puestos, para que el chat lo diga antes de escribir.
      conectores: conectores.dePersonaje(personaje.id).map((c) => ({
        id: c.id, nombre: c.nombre, estado: c.estado, ultimo_error: c.ultimo_error,
      })),
    });
  } catch (error) {
    siguiente(error);
  }
});

/** Abre un hilo anterior en modo lectura. El usuario solo ve los suyos. */
rutasChat.get('/:id/conversacion/:conversacionId', (peticion, respuesta, siguiente) => {
  try {
    const personaje = personajes.exigirPorId(Number(peticion.params.id));
    const conversacion = conversaciones.exigirPropia(Number(peticion.params.conversacionId), peticion.user.id);

    if (conversacion.personaje_id !== personaje.id) {
      throw errorPeticion('Esa conversación es de otro personaje.');
    }

    respuesta.json({
      conversacion,
      mensajes: conversaciones.mensajesDe(conversacion.id).map(mensajePublico),
    });
  } catch (error) {
    siguiente(error);
  }
});

/** Cierra el hilo actual y abre uno limpio. */
rutasChat.post('/:id/conversacion/nueva', (peticion, respuesta, siguiente) => {
  try {
    const personaje = personajes.exigirPorId(Number(peticion.params.id));
    const actual = conversaciones.abiertaDe(personaje.id, peticion.user.id);

    // Si el hilo está vacío, ya es nuevo: no tiene sentido archivarlo.
    if (conversaciones.mensajesDe(actual.id).length > 0) conversaciones.archivar(actual.id);

    const conversacion = conversaciones.abiertaDe(personaje.id, peticion.user.id);
    respuesta.json({
      conversacion,
      mensajes: [],
      historico: conversaciones.historicoDe(personaje.id, peticion.user.id),
    });
  } catch (error) {
    siguiente(error);
  }
});

/* ── Hablar ──────────────────────────────────────────────────────────────── */

// Cada mensaje abre una petición de pago al proveedor: el techo protege la
// factura tanto como al servidor.
rutasChat.post('/:id/mensajes', limitar('chat', 30, 60_000), async (peticion, respuesta, siguiente) => {
  let personaje;
  let conversacion;
  let adaptador;
  let modelo;
  let texto;

  // Todo lo que puede fallar antes de abrir el streaming se comprueba aquí,
  // para poder devolver un error HTTP normal en vez de un evento a medias.
  try {
    personaje = personajes.exigirPorId(Number(peticion.params.id));
    texto = textoObligatorio(peticion.body?.texto, 'texto', LIMITE_MENSAJE);
    ({ adaptador, modelo } = resolverProveedor(personaje));
    conversacion = conversaciones.abiertaDe(personaje.id, peticion.user.id);
  } catch (error) {
    return siguiente(error);
  }

  const mensajeUsuario = conversaciones.anadirMensaje({
    conversacionId: conversacion.id,
    rol: 'user',
    contenido: texto,
  });
  conversaciones.ponerTituloSiFalta(conversacion.id, texto);

  respuesta.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Evita que un proxy por delante acumule la respuesta y la suelte de golpe.
    'X-Accel-Buffering': 'no',
  });
  respuesta.flushHeaders?.();

  const enviar = (dato) => {
    if (!respuesta.writableEnded) respuesta.write(`data: ${JSON.stringify(dato)}\n\n`);
  };

  enviar({ tipo: 'inicio', mensaje: mensajePublico(mensajeUsuario) });

  const controlador = new AbortController();
  let cerradoPorElCliente = false;
  // Va en la respuesta, no en la petición: `peticion` emite 'close' en cuanto
  // termina de llegar el cuerpo, que es siempre y no significa nada.
  respuesta.on('close', () => {
    if (!respuesta.writableEnded) {
      cerradoPorElCliente = true;
      controlador.abort();
    }
  });

  let contenido = '';
  let razonamiento = '';
  let uso = { entrada: null, salida: null, cache: null };
  let motivoParada = null;
  let fallo = null;
  let usadas = [];

  // Las herramientas de sus conectores, si es que tiene. Un conector caído se
  // anuncia en el hilo y el personaje sigue con los que sí responden.
  let puente = { definiciones: [], indice: new Map(), fallos: [] };
  if (adaptador.admiteHerramientas) {
    try {
      puente = await herramientasDe(personaje.id);
    } catch (error) {
      puente.fallos.push({ conector: 'conectores', error: error.message });
    }
  }
  for (const caido of puente.fallos) {
    enviar({ tipo: 'aviso', texto: `El conector "${caido.conector}" no responde: ${caido.error}` });
  }

  try {
    const flujo = adaptador.conversar({
      sistema: personaje.persona_prompt?.trim() || null,
      mensajes: conversaciones.historialParaModelo(conversacion.id, configuracion.ia.mensajesDeContexto),
      modelo,
      senal: controlador.signal,
      herramientas: puente.definiciones,
      ejecutar: (nombre, argumentos) => ejecutar(puente.indice, nombre, argumentos),
      describir: (nombre) => describir(puente.indice, nombre),
    });

    for await (const trozo of flujo) {
      if (trozo.tipo === 'texto') {
        contenido += trozo.texto;
        enviar({ tipo: 'texto', texto: trozo.texto });
      } else if (trozo.tipo === 'razonamiento') {
        razonamiento += trozo.texto;
        enviar({ tipo: 'razonamiento', texto: trozo.texto });
      } else if (trozo.tipo === 'herramienta') {
        enviar({ tipo: 'herramienta', id: trozo.id, etiqueta: trozo.etiqueta, entrada: trozo.entrada });
      } else if (trozo.tipo === 'resultado') {
        enviar({ tipo: 'resultado', id: trozo.id, etiqueta: trozo.etiqueta, ok: trozo.ok, resumen: trozo.resumen });
      } else if (trozo.tipo === 'fin') {
        uso = trozo.uso ?? uso;
        motivoParada = trozo.motivo ?? null;
        usadas = trozo.usadas ?? [];
        if (trozo.modelo) modelo = trozo.modelo;
      }
    }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      fallo = error instanceof ErrorHttp ? error.message : 'La respuesta se cortó por un error inesperado.';
      if (!(error instanceof ErrorHttp)) console.error('[oficina] fallo del proveedor de IA:', error);
    }
  }

  if (cerradoPorElCliente && !contenido) {
    // Nadie escuchaba y no llegó a decir nada: no se guarda un turno en blanco.
    respuesta.end();
    return undefined;
  }

  // El modelo puede declinar responder: eso no es un error del servidor, pero el
  // hilo tiene que contarlo tal cual.
  if (!fallo && motivoParada === 'refusal') {
    fallo = 'El modelo declinó responder a esto.';
  } else if (!fallo && cerradoPorElCliente) {
    fallo = 'Respuesta detenida.';
  } else if (!fallo && motivoParada === 'max_tokens') {
    fallo = 'La respuesta llegó al techo de tokens y quedó a medias.';
  } else if (!fallo && motivoParada === 'max_vueltas') {
    fallo = 'Se quedó dando vueltas con las herramientas y hubo que pararlo.';
  }

  const mensajeAsistente = conversaciones.anadirMensaje({
    conversacionId: conversacion.id,
    rol: 'assistant',
    contenido,
    razonamiento: razonamiento.trim() || null,
    modelo,
    proveedorIa: personaje.proveedor_ia,
    tokensEntrada: uso.entrada,
    tokensSalida: uso.salida,
    error: fallo,
    herramientas: usadas,
  });

  enviar({ tipo: 'fin', mensaje: mensajePublico(mensajeAsistente) });
  respuesta.end();
  return undefined;
});

/** Borra un turno concreto (por ejemplo, uno que falló) sin tocar el resto. */
rutasChat.delete('/:id/mensajes/:mensajeId', (peticion, respuesta, siguiente) => {
  try {
    const personaje = personajes.exigirPorId(Number(peticion.params.id));
    const conversacion = conversaciones.abiertaDe(personaje.id, peticion.user.id);
    const mensaje = conversaciones
      .mensajesDe(conversacion.id)
      .find((entrada) => entrada.id === Number(peticion.params.mensajeId));

    if (!mensaje) throw errorPeticion('Ese mensaje no está en la conversación abierta.');

    conversaciones.eliminarMensaje(mensaje.id);
    respuesta.json({ ok: true });
  } catch (error) {
    siguiente(error);
  }
});
