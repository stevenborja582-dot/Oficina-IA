/**
 * Vista de conectores (Fase 4).
 *
 * Un conector es un servidor MCP. Aquí se dan de alta, se prueban —abriéndolos
 * de verdad para ver qué saben hacer— y se borran. Los secretos nunca vuelven
 * del servidor: solo sus nombres.
 */
import { elemento, reemplazar } from './dom.js';
import { icono } from './iconos.js';
import { api } from './api.js';
import { avisar, avisarError } from './notificaciones.js';
import { abrirModal, areaTexto, campo, entrada, mostrarErrorDeCampo, seleccion } from './modal.js';

const ETIQUETA_ESTADO = { sin_probar: 'Sin probar', listo: 'Listo', error: 'No responde' };

function chipEstado(conector) {
  const clase = conector.estado === 'listo' ? 'exito' : conector.estado === 'error' ? 'error' : 'neutro';
  return elemento(`span.chip.chip--${clase === 'neutro' ? 'neutro' : clase}`, {
    texto: ETIQUETA_ESTADO[conector.estado] ?? conector.estado,
  });
}

function tarjetaConector(conector, acciones, permisos) {
  const herramientas = conector.herramientas ?? [];

  return elemento('article.tarjeta.conector', {}, [
    elemento('div.conector__alto', {}, [
      elemento('span.conector__icono', { 'aria-hidden': 'true' }, [icono('enchufe')]),
      elemento('div.conector__id', {}, [
        elemento('h3.personaje__nombre', { texto: conector.nombre }),
        elemento('p.personaje__rol', { texto: conector.descripcion || 'Sin descripción' }),
        elemento('div.personaje__chips', {}, [
          chipEstado(conector),
          elemento('span.chip.chip--neutro', {
            texto: conector.transporte === 'stdio' ? 'Proceso' : 'Remoto',
          }),
          herramientas.length > 0 &&
            elemento('span.chip.chip--neutro', {
              texto: `${herramientas.length} herramienta${herramientas.length === 1 ? '' : 's'}`,
            }),
        ]),
      ]),
    ]),

    elemento('p.conector__orden.mono', {
      texto: conector.transporte === 'stdio'
        ? [conector.comando, ...(conector.argumentos ?? [])].join(' ')
        : conector.url,
      title: conector.transporte === 'stdio' ? 'Orden que lanza el servidor' : 'Dirección del servidor',
    }),

    conector.variables_claves?.length > 0 &&
      elemento('p.campo__pista', {
        texto: 'Secretos guardados: ' + conector.variables_claves.join(', '),
      }),

    herramientas.length > 0 &&
      elemento('div.conector__herramientas', {}, herramientas.map((h) =>
        elemento('span.chip.chip--neutro.mono', { texto: h.nombre, title: h.descripcion || '' }))),

    conector.estado === 'error' && conector.ultimo_error &&
      elemento('p.conector__error', { texto: conector.ultimo_error }),

    elemento('div.personaje__acciones', {}, [
      permisos.administrarSalas && elemento('button.boton.boton--pequeno', {
        type: 'button',
        alClick: (evento) => acciones.probar(conector, evento.currentTarget),
      }, [icono('chispa', { clase: 'boton__icono' }), 'Probar']),
      permisos.administrarSalas && elemento('button.boton-icono.a-la-derecha', {
        type: 'button', title: 'Editar', 'aria-label': `Editar ${conector.nombre}`,
        alClick: () => acciones.editar(conector),
      }, [icono('lapiz')]),
      permisos.administrarSalas && elemento('button.boton-icono', {
        type: 'button', title: 'Eliminar', 'aria-label': `Eliminar ${conector.nombre}`,
        alClick: () => acciones.eliminar(conector),
      }, [icono('papelera')]),
    ]),
  ]);
}

/* ── Alta y edición ──────────────────────────────────────────────────────── */

export function modalConector({ conector = null, alGuardar }) {
  const esNuevo = !conector;
  const base = conector ?? { nombre: '', descripcion: '', transporte: 'stdio', comando: '', argumentos: [], url: '' };

  const cNombre = entrada({ name: 'nombre', value: base.nombre, maxLength: 60, autocomplete: 'off' });
  const cDescripcion = entrada({ name: 'descripcion', value: base.descripcion, maxLength: 280, autocomplete: 'off' });
  const cTransporte = seleccion([['stdio', 'Proceso en esta máquina'], ['http', 'Servidor remoto']], {
    name: 'transporte', valor: base.transporte,
  });
  const cComando = entrada({ name: 'comando', value: base.comando, autocomplete: 'off', placeholder: 'npx' });
  const cArgumentos = areaTexto({ name: 'argumentos', rows: 3, placeholder: '-y\n@modelcontextprotocol/server-filesystem\n/ruta/a/tus/notas' });
  cArgumentos.value = (base.argumentos ?? []).join('\n');
  const cUrl = entrada({ name: 'url', type: 'url', value: base.url ?? '', placeholder: 'https://…', autocomplete: 'off' });
  const cVariables = areaTexto({ name: 'variables', rows: 3, placeholder: 'TOKEN=…\nOTRA=…' });
  const cCabeceras = areaTexto({ name: 'cabeceras', rows: 2, placeholder: 'Authorization=Bearer …' });

  const bloqueComando = campo({ etiqueta: 'Orden', pista: 'Lo que lanzarías en la terminal.', control: cComando, obligatorio: true });
  const bloqueArgumentos = campo({ etiqueta: 'Argumentos', pista: 'Uno por línea.', control: cArgumentos });
  const bloqueUrl = campo({ etiqueta: 'Dirección', control: cUrl, obligatorio: true });
  const bloqueCabeceras = campo({ etiqueta: 'Cabeceras', pista: 'Una por línea, CLAVE=valor.', control: cCabeceras });

  const pistaSecretos = esNuevo
    ? 'Una por línea, CLAVE=valor. Se guardan en el servidor y no vuelven al navegador.'
    : 'Déjalo vacío para conservar los secretos guardados' +
      (base.variables_claves?.length ? ` (${base.variables_claves.join(', ')}).` : '.');
  const bloqueVariables = campo({ etiqueta: 'Variables de entorno', pista: pistaSecretos, control: cVariables });

  function ajustarTransporte() {
    const esProceso = cTransporte.value === 'stdio';
    bloqueComando.hidden = !esProceso;
    bloqueArgumentos.hidden = !esProceso;
    bloqueUrl.hidden = esProceso;
    bloqueCabeceras.hidden = esProceso;
    bloqueVariables.hidden = !esProceso;
  }
  cTransporte.addEventListener('change', ajustarTransporte);

  const formulario = elemento('form.rejilla-campos', { id: 'form-conector', novalidate: true }, [
    campo({ etiqueta: 'Nombre', control: cNombre, obligatorio: true }),
    campo({ etiqueta: 'Descripción', control: cDescripcion }),
    campo({ etiqueta: 'Tipo', control: cTransporte }),
    bloqueComando,
    bloqueArgumentos,
    bloqueUrl,
    bloqueCabeceras,
    bloqueVariables,
  ]);
  ajustarTransporte();

  const { dialogo, cerrar } = abrirModal({
    titulo: esNuevo ? 'Nuevo conector' : `Editar ${base.nombre}`,
    subtitulo: 'Un conector es un servidor MCP. Los personajes que lo tengan asignado podrán usar sus herramientas.',
    contenido: formulario,
    acciones: (cerrarModal) => [
      elemento('button.boton', { type: 'button', texto: 'Cancelar', alClick: cerrarModal }),
      elemento('button.boton.boton--primario.a-la-derecha', {
        type: 'submit', form: 'form-conector', texto: esNuevo ? 'Crear conector' : 'Guardar cambios',
      }),
    ],
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = dialogo.querySelector('button[type=submit]');
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    const cuerpo = Object.fromEntries(new FormData(formulario).entries());
    try {
      const respuesta = esNuevo
        ? await api.crearConector(cuerpo)
        : await api.actualizarConector(conector.id, cuerpo);
      cerrar();
      avisar(esNuevo ? `Conector "${respuesta.conector.nombre}" dado de alta. Pruébalo para ver qué sabe hacer.` : 'Conector actualizado.', { tipo: 'exito' });
      await alGuardar(respuesta.conector);
    } catch (error) {
      boton.disabled = false;
      boton.textContent = esNuevo ? 'Crear conector' : 'Guardar cambios';
      if (!mostrarErrorDeCampo(dialogo, error.detalles, error.message)) avisarError(error);
    }
  });
}

/* ── Vista ───────────────────────────────────────────────────────────────── */

export function vistaConectores(estado, recargarVista) {
  const rejilla = elemento('div.conectores');
  const seccion = elemento('section');

  const acciones = {
    editar: (conector) => modalConector({ conector, alGuardar: cargar }),
    probar: async (conector, boton) => {
      boton.disabled = true;
      boton.textContent = 'Probando…';
      try {
        const respuesta = await api.probarConector(conector.id);
        if (respuesta.error) avisar(`"${conector.nombre}" no responde: ${respuesta.error}`, { tipo: 'error' });
        else {
          const total = respuesta.conector.herramientas.length;
          avisar(`"${conector.nombre}" respondió con ${total} herramienta${total === 1 ? '' : 's'}.`, { tipo: 'exito' });
        }
        await cargar();
      } catch (error) {
        avisarError(error);
        boton.disabled = false;
        boton.textContent = 'Probar';
      }
    },
    eliminar: async (conector) => {
      try {
        await api.eliminarConector(conector.id);
        avisar(`Conector "${conector.nombre}" eliminado.`);
        await cargar();
      } catch (error) {
        avisarError(error);
      }
    },
  };

  async function cargar() {
    reemplazar(rejilla, elemento('div.esqueleto.cargando__fila'), elemento('div.esqueleto.cargando__fila'));
    try {
      const datos = await api.conectores();

      if (datos.conectores.length === 0) {
        reemplazar(rejilla, elemento('div.vacio', {}, [
          elemento('span.vacio__icono', { 'aria-hidden': 'true' }, [icono('enchufe')]),
          elemento('h2', { texto: 'Sin conectores todavía' }),
          elemento('p', {
            texto: 'Un conector es un servidor MCP: Drive, Gmail, tus notas, una base de datos. ' +
              'Da de alta uno y asígnaselo a los personajes que deban usarlo.',
          }),
          estado.permisos.administrarSalas && elemento('button.boton.boton--primario', {
            type: 'button', alClick: () => modalConector({ alGuardar: cargar }),
          }, [icono('mas', { clase: 'boton__icono' }), 'Conectar el primero']),
        ]));
        rejilla.classList.remove('conectores');
        return;
      }

      rejilla.classList.add('conectores');
      reemplazar(rejilla, ...datos.conectores.map((c) => tarjetaConector(c, acciones, estado.permisos)));

      if (!datos.permiteProcesos) {
        rejilla.prepend(elemento('div.aviso-chat', {}, [
          icono('escudo'),
          elemento('div', {}, [
            elemento('strong', { texto: 'Los conectores de proceso están apagados en este servidor' }),
            elemento('p', {
              texto: 'Lanzar una orden del sistema es ejecución de código: en un servidor compartido viene desactivado. ' +
                'Se activa con MCP_PERMITIR_STDIO=true.',
            }),
          ]),
        ]));
      }
    } catch (error) {
      reemplazar(rejilla, elemento('div.error-vista', {}, [
        elemento('h2', { texto: 'No se pudieron leer los conectores' }),
        elemento('p', { texto: error.message }),
      ]));
    }
  }

  seccion.append(
    elemento('header.encabezado', {}, [
      elemento('div.encabezado__texto', {}, [
        elemento('p.etiqueta-seccion', { texto: 'Fase 4 · Conectores' }),
        elemento('h1.encabezado__titulo', { texto: 'Conectores' }),
        elemento('p.encabezado__sub', {
          texto: 'Cada conector es un servidor MCP. Lo que publique —buscar en Drive, leer tus notas, ' +
            'consultar una base— queda a mano de los personajes a los que se lo asignes.',
        }),
      ]),
      elemento('div.encabezado__acciones', {}, [
        estado.permisos.administrarSalas && elemento('button.boton.boton--primario', {
          type: 'button', alClick: () => modalConector({ alGuardar: cargar }),
        }, [icono('mas', { clase: 'boton__icono' }), 'Nuevo conector']),
      ]),
    ]),
    rejilla,
  );

  cargar();
  return seccion;
}
