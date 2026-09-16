/**
 * Vista de chat: la conversación con un personaje.
 *
 * La respuesta se pinta según llega, no al final. El Markdown se vuelve a
 * componer con cada fotograma en vez de con cada trozo, que llegan mucho más
 * rápido de lo que la pantalla puede dibujar.
 */
import { elemento, reemplazar } from './dom.js';
import { icono } from './iconos.js';
import { variablesSala } from './color.js';
import { avatar, chip, ETIQUETA_PROVEEDOR } from './piezas.js';
import { renderizarMarkdown } from './markdown.js';
import { api, flujoMensaje } from './api.js';
import { avisar, avisarError } from './notificaciones.js';
import { abrirModal } from './modal.js';

const MARGEN_AUTOSCROLL = 160;

const horaDe = (iso) =>
  new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

const fechaDe = (iso) =>
  new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });

/* ── Turnos ──────────────────────────────────────────────────────────────── */

function turnoUsuario(mensaje) {
  return elemento('article.turno.turno--usuario', {}, [
    elemento('div.burbuja', {}, [
      elemento('div.burbuja__texto', { texto: mensaje.contenido }),
    ]),
    elemento('time.turno__hora', { datetime: mensaje.creado_en, texto: horaDe(mensaje.creado_en) }),
  ]);
}

/**
 * Turno del personaje. Devuelve también los mandos para irlo rellenando mientras
 * llega la respuesta: el mismo componente sirve para el historial y para lo que
 * se está escribiendo ahora mismo.
 */
function turnoAsistente(personaje, sala, mensaje = null) {
  const contenido = elemento('div.turno__contenido.md');
  const razonamientoTexto = elemento('div.razonamiento__texto');
  const razonamiento = elemento('details.razonamiento', { hidden: true }, [
    elemento('summary.razonamiento__resumen', {}, [
      icono('chispa', { clase: 'razonamiento__icono' }),
      elemento('span', { texto: 'Cómo lo pensó' }),
    ]),
    razonamientoTexto,
  ]);
  const pie = elemento('div.turno__pie', { hidden: true });
  const aviso = elemento('div.turno__aviso', { hidden: true, role: 'status' });

  const nodo = elemento('article.turno.turno--asistente', {}, [
    avatar(personaje, sala.color_acento, { tamano: 30, redondo: true }),
    elemento('div.turno__columna', {}, [razonamiento, contenido, aviso, pie]),
  ]);

  let textoAcumulado = mensaje?.contenido ?? '';
  let pensamiento = mensaje?.razonamiento ?? '';
  let repintadoPedido = false;

  function repintarContenido() {
    reemplazar(contenido, renderizarMarkdown(textoAcumulado));
  }

  /** Un repintado por fotograma: los trozos llegan más rápido que la pantalla. */
  function pedirRepintado() {
    if (repintadoPedido) return;
    repintadoPedido = true;
    requestAnimationFrame(() => {
      repintadoPedido = false;
      repintarContenido();
      contenido.classList.add('turno__contenido--escribiendo');
    });
  }

  if (textoAcumulado) repintarContenido();
  if (pensamiento) {
    razonamiento.hidden = false;
    razonamientoTexto.textContent = pensamiento;
  }

  function ponerPie(datos) {
    if (!datos?.modelo && !datos?.tokens_salida) return;
    reemplazar(
      pie,
      datos.modelo && elemento('span.mono', { texto: datos.modelo }),
      datos.tokens_salida &&
        elemento('span.mono', { texto: `${datos.tokens_salida} tokens` }),
      datos.creado_en && elemento('time', { datetime: datos.creado_en, texto: horaDe(datos.creado_en) }),
    );
    pie.hidden = false;
  }

  function ponerAviso(texto) {
    if (!texto) {
      aviso.hidden = true;
      return;
    }
    reemplazar(aviso, icono('escudo', { clase: 'turno__aviso-icono' }), elemento('span', { texto }));
    aviso.hidden = false;
  }

  if (mensaje) {
    ponerPie(mensaje);
    ponerAviso(mensaje.error);
    if (!mensaje.contenido && mensaje.error) contenido.hidden = true;
  }

  return {
    nodo,
    agregarTexto(trozo) {
      textoAcumulado += trozo;
      contenido.hidden = false;
      pedirRepintado();
    },
    agregarRazonamiento(trozo) {
      pensamiento += trozo;
      razonamiento.hidden = false;
      razonamientoTexto.textContent = pensamiento;
    },
    finalizar(datos) {
      contenido.classList.remove('turno__contenido--escribiendo');
      textoAcumulado = datos?.contenido ?? textoAcumulado;
      repintarContenido();
      if (!textoAcumulado) contenido.hidden = true;
      ponerPie(datos);
      ponerAviso(datos?.error);
    },
    marcarPensando(activo) {
      nodo.classList.toggle('turno--pensando', activo);
    },
  };
}

/* ── Vista ───────────────────────────────────────────────────────────────── */

export function vistaChat(estado, personaje, acciones) {
  const sala = estado.salas.find((entrada) => entrada.id === personaje.sala_id) ?? estado.salas[0];
  const variables = variablesSala(sala.color_acento);

  const hilo = elemento('div.hilo', { role: 'log', 'aria-live': 'polite', 'aria-label': `Conversación con ${personaje.nombre}` });
  const campo = elemento('textarea.compositor__campo', {
    rows: 1,
    placeholder: `Escribe a ${personaje.nombre}…`,
    'aria-label': `Mensaje para ${personaje.nombre}`,
    enterkeyhint: 'send',
  });

  const botonEnviar = elemento('button.boton.boton--primario.compositor__enviar', {
    type: 'submit',
    'aria-label': 'Enviar mensaje',
  }, [icono('enviar', { clase: 'boton__icono' })]);

  const botonDetener = elemento('button.boton.compositor__enviar', {
    type: 'button',
    hidden: true,
    'aria-label': 'Detener la respuesta',
  }, [icono('detener', { clase: 'boton__icono' }), 'Detener']);

  const compositor = elemento('form.compositor', { novalidate: true }, [
    elemento('div.compositor__caja', {}, [campo, botonEnviar, botonDetener]),
    elemento('p.compositor__pista', {
      texto: 'Enter envía · Mayús+Enter salta de línea',
    }),
  ]);

  const avisoNoDisponible = elemento('div.chat-aviso', { hidden: true, role: 'status' });
  const bannerArchivado = elemento('div.chat-archivado', { hidden: true, role: 'status' });

  let conversacionId = null;
  let enCurso = null;
  let soloLectura = false;
  let historico = [];

  /* — Cabecera — */

  const botonHistorial = elemento('button.boton', {
    type: 'button',
    title: 'Conversaciones anteriores',
    'aria-label': 'Ver conversaciones anteriores',
    alClick: () => abrirHistorial(),
  }, [icono('historial', { clase: 'boton__icono' }), elemento('span.boton__texto', { texto: 'Anteriores' })]);

  const encabezado = elemento('header.encabezado.chat-cabecera', {}, [
    elemento('div.encabezado__texto', {}, [
      elemento('nav.migas', { 'aria-label': 'Ruta' }, [
        elemento('a', { href: '#/', texto: 'Plano' }),
        icono('flechaDerecha'),
        elemento('a', { href: `#/sala/${sala.slug}`, texto: sala.nombre }),
        icono('flechaDerecha'),
        elemento('span', { texto: personaje.nombre }),
      ]),
      elemento('div.sala-cabecera', {}, [
        avatar(personaje, sala.color_acento, { tamano: 52 }),
        elemento('div', {}, [
          elemento('h1.encabezado__titulo', { texto: personaje.nombre }),
          elemento('p.encabezado__sub', { texto: personaje.rol_titulo || 'Sin rol asignado' }),
          elemento('div.personaje__chips', {}, [
            chip(ETIQUETA_PROVEEDOR[personaje.proveedor_ia] ?? personaje.proveedor_ia, {
              color: sala.color_acento,
              punto: true,
            }),
            personaje.modelo && elemento('span.chip.chip--neutro.mono', { texto: personaje.modelo }),
          ]),
        ]),
      ]),
    ]),
    elemento('div.encabezado__acciones', {}, [
      botonHistorial,
      elemento('button.boton', {
        type: 'button',
        title: 'Editar el personaje',
        'aria-label': `Editar ${personaje.nombre}`,
        alClick: () => acciones.editarPersonaje(personaje),
      }, [icono('lapiz', { clase: 'boton__icono' }), elemento('span.boton__texto', { texto: 'Editar' })]),
      elemento('button.boton.boton--acento', {
        type: 'button',
        alClick: () => empezarDeCero(),
      }, [icono('mas', { clase: 'boton__icono' }), elemento('span.boton__texto', { texto: 'Nueva conversación' })]),
    ]),
  ]);

  const seccion = elemento('section.chat', { variables }, [
    encabezado,
    avisoNoDisponible,
    bannerArchivado,
    hilo,
    compositor,
  ]);

  /* — Desplazamiento — */

  const cercaDelFinal = () =>
    window.innerHeight + window.scrollY >= document.body.scrollHeight - MARGEN_AUTOSCROLL;

  function bajarSiProcede(forzar = false) {
    if (!forzar && !cercaDelFinal()) return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: forzar ? 'auto' : 'smooth' });
    });
  }

  /* — Pintado del hilo — */

  function pintarMensajes(mensajes) {
    if (mensajes.length === 0) {
      reemplazar(hilo, estadoVacio());
      return;
    }
    reemplazar(
      hilo,
      ...mensajes.map((mensaje) =>
        mensaje.rol === 'user' ? turnoUsuario(mensaje) : turnoAsistente(personaje, sala, mensaje).nodo,
      ),
    );
  }

  function estadoVacio() {
    return elemento('div.chat-vacio', {}, [
      avatar(personaje, sala.color_acento, { tamano: 56 }),
      elemento('h2', { texto: personaje.nombre }),
      elemento('p', {
        texto: personaje.persona_prompt
          ? personaje.persona_prompt
          : 'Este personaje aún no tiene persona definida. Puedes dársela desde "Editar".',
      }),
    ]);
  }

  /* — Envío — */

  function ponerEnvioActivo(activo) {
    botonEnviar.hidden = activo;
    botonDetener.hidden = !activo;
    campo.disabled = false;
  }

  async function enviar(texto) {
    if (!texto.trim() || enCurso || soloLectura) return;

    if (hilo.querySelector('.chat-vacio')) reemplazar(hilo);

    campo.value = '';
    ajustarAlto();

    const controlador = new AbortController();
    enCurso = controlador;
    ponerEnvioActivo(true);

    const turno = turnoAsistente(personaje, sala);
    turno.marcarPensando(true);
    let recibioFin = false;

    try {
      for await (const evento of flujoMensaje(personaje.id, texto, controlador.signal)) {
        if (evento.tipo === 'inicio') {
          hilo.append(turnoUsuario(evento.mensaje), turno.nodo);
          bajarSiProcede(true);
        } else if (evento.tipo === 'razonamiento') {
          turno.agregarRazonamiento(evento.texto);
          bajarSiProcede();
        } else if (evento.tipo === 'texto') {
          turno.marcarPensando(false);
          turno.agregarTexto(evento.texto);
          bajarSiProcede();
        } else if (evento.tipo === 'fin') {
          recibioFin = true;
          turno.marcarPensando(false);
          turno.finalizar(evento.mensaje);
          bajarSiProcede();
        }
      }
    } catch (error) {
      turno.marcarPensando(false);
      if (!turno.nodo.isConnected) hilo.append(turno.nodo);
      turno.finalizar({ error: error.message });
      avisarError(error);
    } finally {
      const cortado = controlador.signal.aborted && !recibioFin;
      enCurso = null;
      ponerEnvioActivo(false);
      turno.marcarPensando(false);
      // Al detener, la conexión se corta antes del evento de cierre: el servidor
      // sí guarda lo que llegó, así que se relee el hilo en vez de inventárselo.
      if (cortado) await sincronizar();
      campo.focus();
    }
  }

  /**
   * Vuelve a leer el hilo del servidor. Se usa tras detener una respuesta: el
   * turno se guarda justo después de cerrarse la conexión, así que puede hacer
   * falta más de un intento para verlo.
   */
  async function sincronizar(intentos = 4) {
    for (let intento = 0; intento < intentos; intento += 1) {
      await new Promise((listo) => setTimeout(listo, 120 * (intento + 1)));
      try {
        const datos = await api.conversacion(personaje.id);
        const ultimo = datos.mensajes.at(-1);
        if (ultimo?.rol === 'assistant' || intento === intentos - 1) {
          conversacionId = datos.conversacion.id;
          historico = datos.historico;
          pintarMensajes(datos.mensajes);
          bajarSiProcede(true);
          return;
        }
      } catch {
        return; // Si no se puede releer, el hilo se queda como está en pantalla.
      }
    }
  }

  compositor.addEventListener('submit', (evento) => {
    evento.preventDefault();
    enviar(campo.value);
  });

  botonDetener.addEventListener('click', () => {
    enCurso?.abort();
  });

  campo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' && !evento.shiftKey && !evento.isComposing) {
      evento.preventDefault();
      enviar(campo.value);
    }
  });

  /** El campo crece con el texto hasta un tope, y luego hace scroll. */
  function ajustarAlto() {
    campo.style.setProperty('height', 'auto');
    campo.style.setProperty('height', `${Math.min(campo.scrollHeight, 220)}px`);
  }
  campo.addEventListener('input', ajustarAlto);

  /* — Acciones — */

  async function empezarDeCero() {
    if (enCurso) enCurso.abort();
    try {
      const datos = await api.nuevaConversacion(personaje.id);
      conversacionId = datos.conversacion.id;
      historico = datos.historico;
      soloLectura = false;
      bannerArchivado.hidden = true;
      pintarMensajes([]);
      campo.focus();
      avisar('Conversación nueva. La anterior queda en "Anteriores".');
    } catch (error) {
      avisarError(error);
    }
  }

  function volverALaActual() {
    soloLectura = false;
    bannerArchivado.hidden = true;
    cargar();
  }

  async function abrirHistorial() {
    if (historico.length === 0) {
      avisar('Todavía no hay conversaciones anteriores con este personaje.');
      return;
    }

    const lista = elemento('div.historial');
    const { cerrar } = abrirModal({
      titulo: 'Conversaciones anteriores',
      subtitulo: `Tus hilos con ${personaje.nombre}.`,
      contenido: lista,
      acciones: (cerrarModal) => [
        elemento('button.boton.a-la-derecha', { type: 'button', texto: 'Cerrar', alClick: cerrarModal }),
      ],
    });

    historico.forEach((entrada) => {
      const esActual = entrada.id === conversacionId;
      lista.append(
        elemento('button.historial__fila', {
          type: 'button',
          alClick: async () => {
            cerrar();
            if (esActual) {
              volverALaActual();
              return;
            }
            await abrirArchivada(entrada.id);
          },
        }, [
          elemento('span.historial__texto', {}, [
            elemento('span.historial__titulo', { texto: entrada.titulo || 'Sin título' }),
            elemento('span.historial__meta', {
              texto: `${fechaDe(entrada.actualizado_en)} · ${entrada.total_mensajes} mensaje${entrada.total_mensajes === 1 ? '' : 's'}`,
            }),
          ]),
          esActual ? chip('En curso', { color: sala.color_acento, punto: true }) : icono('flechaDerecha'),
        ]),
      );
    });
  }

  async function abrirArchivada(id) {
    try {
      const datos = await api.conversacionArchivada(personaje.id, id);
      soloLectura = true;
      pintarMensajes(datos.mensajes);
      reemplazar(
        bannerArchivado,
        elemento('span', { texto: `Estás leyendo un hilo archivado del ${fechaDe(datos.conversacion.actualizado_en)}.` }),
        elemento('button.boton.boton--pequeno', {
          type: 'button',
          texto: 'Volver a la conversación actual',
          alClick: volverALaActual,
        }),
      );
      bannerArchivado.hidden = false;
      compositor.hidden = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      avisarError(error);
    }
  }

  /* — Carga inicial — */

  async function cargar() {
    reemplazar(hilo, elemento('div.esqueleto.cargando__fila'), elemento('div.esqueleto.cargando__fila'));

    try {
      const datos = await api.conversacion(personaje.id);
      conversacionId = datos.conversacion.id;
      historico = datos.historico;
      compositor.hidden = false;
      pintarMensajes(datos.mensajes);

      if (datos.chat.disponible) {
        avisoNoDisponible.hidden = true;
        campo.disabled = false;
        botonEnviar.disabled = false;
        campo.focus();
      } else {
        reemplazar(
          avisoNoDisponible,
          icono('escudo', { clase: 'chat-aviso__icono' }),
          elemento('div', {}, [
            elemento('strong', { texto: 'Este personaje todavía no puede responder' }),
            elemento('p', { texto: datos.chat.motivo }),
          ]),
        );
        avisoNoDisponible.hidden = false;
        campo.disabled = true;
        botonEnviar.disabled = true;
        campo.placeholder = 'Chat no disponible';
      }

      bajarSiProcede(true);
    } catch (error) {
      reemplazar(
        hilo,
        elemento('div.error-vista', {}, [
          elemento('h2', { texto: 'No se pudo abrir la conversación' }),
          elemento('p', { texto: error.message }),
        ]),
      );
    }
  }

  cargar();

  // Si se sale de la vista con una respuesta a medias, se corta la petición.
  seccion.addEventListener('oficina:salir', () => enCurso?.abort());

  return seccion;
}
