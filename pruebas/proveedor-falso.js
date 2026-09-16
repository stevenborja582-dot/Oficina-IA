/**
 * Servidor que imita a los proveedores de IA, para las pruebas.
 *
 * Habla el mismo SSE que la API real (formato Anthropic en /v1/messages y formato
 * OpenAI en /v1/chat/completions), así que el adaptador que se prueba es el mismo
 * código que corre en producción — no un simulacro.
 */
import http from 'node:http';

export function crearProveedorFalso() {
  const peticiones = [];
  let guion = { tipo: 'ok', razonamiento: 'Lo pienso un momento.', texto: ['Hola, ', 'soy ', 'tu personaje.'] };

  const servidor = http.createServer(async (peticion, respuesta) => {
    const cuerpo = await new Promise((listo) => {
      let crudo = '';
      peticion.on('data', (trozo) => (crudo += trozo));
      peticion.on('end', () => listo(crudo));
    });

    peticiones.push({
      ruta: peticion.url,
      cabeceras: peticion.headers,
      cuerpo: cuerpo ? JSON.parse(cuerpo) : null,
    });

    if (guion.tipo === 'error') {
      respuesta.writeHead(guion.estado ?? 500, { 'Content-Type': 'application/json' });
      respuesta.end(JSON.stringify({ error: { message: guion.mensaje ?? 'fallo del proveedor' } }));
      return;
    }

    respuesta.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' });

    const evento = (tipo, dato) => respuesta.write(`event: ${tipo}\ndata: ${JSON.stringify(dato)}\n\n`);
    const esOpenai = peticion.url.includes('chat/completions');

    if (esOpenai) {
      for (const trozo of guion.texto) {
        respuesta.write(`data: ${JSON.stringify({ choices: [{ delta: { content: trozo } }] })}\n\n`);
      }
      respuesta.write(
        `data: ${JSON.stringify({
          choices: [{ delta: {}, finish_reason: guion.motivo ?? 'stop' }],
          usage: { prompt_tokens: 11, completion_tokens: 5 },
        })}\n\n`,
      );
      respuesta.write('data: [DONE]\n\n');
      respuesta.end();
      return;
    }

    // Formato Anthropic.
    evento('message_start', {
      type: 'message_start',
      message: {
        id: 'msg_prueba',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 11, output_tokens: 0 },
      },
    });

    if (guion.razonamiento) {
      evento('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } });
      evento('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: guion.razonamiento } });
      evento('content_block_stop', { type: 'content_block_stop', index: 0 });
    }

    const indice = guion.razonamiento ? 1 : 0;
    evento('content_block_start', { type: 'content_block_start', index: indice, content_block: { type: 'text', text: '' } });
    for (const trozo of guion.texto) {
      evento('content_block_delta', { type: 'content_block_delta', index: indice, delta: { type: 'text_delta', text: trozo } });
      // Una pausa entre fragmentos para que el cliente reciba varios, no uno solo.
      await new Promise((listo) => setTimeout(listo, guion.pausaMs ?? 5));
    }
    evento('content_block_stop', { type: 'content_block_stop', index: indice });

    evento('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: guion.motivo ?? 'end_turn', stop_sequence: null },
      usage: { output_tokens: 9 },
    });
    evento('message_stop', { type: 'message_stop' });
    respuesta.end();
  });

  return {
    servidor,
    peticiones,
    ultimaPeticion: () => peticiones[peticiones.length - 1],
    programar: (nuevo) => {
      guion = nuevo;
    },
    escuchar: () =>
      new Promise((listo) => {
        servidor.listen(0, '127.0.0.1', () => listo(`http://127.0.0.1:${servidor.address().port}`));
      }),
    cerrar: () => new Promise((listo) => servidor.close(listo)),
  };
}
