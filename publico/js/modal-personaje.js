/**
 * Alta y edición de personajes. Mismo modal accesible de la v1, ahora con
 * proveedor, modelo y persona.
 */
import { elemento } from './dom.js';
import { abrirModal, areaTexto, campo, entrada, mostrarErrorDeCampo, seleccion } from './modal.js';
import { api } from './api.js';
import { avisar, avisarError } from './notificaciones.js';
import { ETIQUETA_ESTADO, ETIQUETA_PROVEEDOR } from './piezas.js';
import { bloqueConectores } from './conectores-de-personaje.js';
import { bloqueSkills } from './skills-de-personaje.js';

const VACIO = {
  nombre: '',
  rol_titulo: '',
  avatar_url: '',
  persona_prompt: '',
  proveedor_ia: 'anthropic',
  modelo: '',
  enlace_externo: '',
  estado: 'activo',
};

/**
 * @param {object} opciones.personaje  personaje a editar, o null para uno nuevo
 * @param {object} opciones.sala       sala de destino por defecto
 * @param {Array}  opciones.salas      todas las salas, para poder mudarlo
 * @param {object} opciones.permisos   qué puede tocar quien tiene el modal abierto
 * @param {Function} opciones.alGuardar  callback tras guardar
 */
export function modalPersonaje({ personaje = null, sala, salas, catalogos, permisos = {}, alGuardar }) {
  const esNuevo = !personaje;
  const datos = { ...VACIO, ...(personaje ?? {}) };
  const salaActual = personaje ? salas.find((s) => s.id === personaje.sala_id) ?? sala : sala;

  const formulario = elemento('form.rejilla-campos', { id: 'form-personaje', novalidate: true });

  const campoNombre = entrada({ name: 'nombre', value: datos.nombre, maxLength: 60, autocomplete: 'off' });
  const campoRol = entrada({ name: 'rol_titulo', value: datos.rol_titulo, maxLength: 80, autocomplete: 'off' });
  const campoSala = seleccion(salas.map((s) => [String(s.id), s.nombre]), {
    name: 'sala_id',
    valor: String(salaActual?.id ?? salas[0]?.id ?? ''),
  });
  const campoProveedor = seleccion(
    catalogos.proveedores.map((clave) => [clave, ETIQUETA_PROVEEDOR[clave] ?? clave]),
    { name: 'proveedor_ia', valor: datos.proveedor_ia },
  );
  const campoModelo = entrada({
    name: 'modelo',
    value: datos.modelo,
    maxLength: 80,
    autocomplete: 'off',
    placeholder: 'claude-opus-5',
  });
  const campoEnlace = entrada({
    name: 'enlace_externo',
    type: 'url',
    value: datos.enlace_externo ?? '',
    placeholder: 'https://…',
    autocomplete: 'off',
  });
  const campoAvatar = entrada({
    name: 'avatar_url',
    type: 'url',
    value: datos.avatar_url ?? '',
    placeholder: 'https://… (opcional)',
    autocomplete: 'off',
  });
  const campoEstado = seleccion(
    catalogos.estados.map((clave) => [clave, ETIQUETA_ESTADO[clave] ?? clave]),
    { name: 'estado', valor: datos.estado },
  );
  const campoPersona = areaTexto({
    name: 'persona_prompt',
    value: datos.persona_prompt,
    rows: 5,
    maxLength: catalogos.limites?.persona_prompt ?? 8000,
    placeholder: 'Eres un ingeniero senior. Respondes con código concreto y sin rodeos…',
  });
  campoPersona.classList.add('mono');

  const bloqueEnlace = campo({
    etiqueta: 'Enlace externo',
    pista: 'Para IAs sin API propia: la tarjeta abrirá esta dirección.',
    control: campoEnlace,
  });
  const bloquePersona = campo({
    etiqueta: 'Persona (system prompt)',
    pista: 'Define su tono y su forma de responder. Se usará cuando el chat esté vivo, en la Fase 2.',
    control: campoPersona,
  });
  const bloqueModelo = campo({
    etiqueta: 'Modelo',
    pista: 'El identificador exacto que usa la API del proveedor.',
    control: campoModelo,
  });

  /** Un personaje externo no tiene modelo ni persona: tiene una puerta. */
  function ajustarAProveedor() {
    const esExterno = campoProveedor.value === 'externo';
    bloqueModelo.hidden = esExterno;
    bloquePersona.hidden = esExterno;
    campoEnlace.required = esExterno;
    bloqueEnlace.querySelector('.campo__etiqueta').textContent = esExterno
      ? 'Enlace externo *'
      : 'Enlace externo';
  }
  campoProveedor.addEventListener('change', ajustarAProveedor);

  /**
   * Los conectores se reparten sobre un personaje que ya existe: hace falta su
   * id para guardar la asignación. En uno nuevo, se asignan al volver a abrirlo.
   */
  const conectores = esNuevo
    ? null
    : bloqueConectores({
        personaje,
        puedeEditar: Boolean(permisos.administrarSalas),
        proveedorActual: () => campoProveedor.value,
      });
  if (conectores) campoProveedor.addEventListener('change', conectores.actualizarNota);

  // Las skills también necesitan un personaje que ya exista para guardarse.
  const skills = esNuevo
    ? null
    : bloqueSkills({ personaje, puedeEditar: Boolean(permisos.administrarSalas) });

  formulario.append(
    campo({ etiqueta: 'Nombre', control: campoNombre, obligatorio: true }),
    campo({ etiqueta: 'Rol', pista: 'Cómo lo llamas dentro del equipo.', control: campoRol }),
    elemento('div.rejilla-campos.rejilla-campos--dos', {}, [
      campo({ etiqueta: 'Sala', control: campoSala }),
      campo({ etiqueta: 'Estado', control: campoEstado }),
    ]),
    elemento('div.rejilla-campos.rejilla-campos--dos', {}, [
      campo({ etiqueta: 'Proveedor', control: campoProveedor }),
      bloqueModelo,
    ]),
    bloqueEnlace,
    campo({ etiqueta: 'Avatar', pista: 'Si lo dejas vacío se usan sus iniciales sobre el color de la sala.', control: campoAvatar }),
    bloquePersona,
    skills?.bloque,
    conectores?.bloque,
  );

  ajustarAProveedor();

  const { dialogo, cerrar } = abrirModal({
    titulo: esNuevo ? 'Nuevo personaje' : `Editar ${datos.nombre}`,
    subtitulo: esNuevo
      ? 'Registra una IA y ocupará un escritorio en el plano.'
      : 'Los cambios se ven al instante en la sala y en el plano.',
    contenido: formulario,
    acciones: (cerrarModal) => [
      elemento('button.boton', { type: 'button', texto: 'Cancelar', alClick: cerrarModal }),
      elemento('button.boton.boton--primario.a-la-derecha', {
        type: 'submit',
        form: 'form-personaje',
        texto: esNuevo ? 'Crear personaje' : 'Guardar cambios',
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
        ? await api.crearPersonaje(cuerpo)
        : await api.actualizarPersonaje(personaje.id, cuerpo);
      if (skills) await skills.guardar(respuesta.personaje.id);
      if (conectores) await conectores.guardar(respuesta.personaje.id);
      cerrar();
      avisar(esNuevo ? `${respuesta.personaje.nombre} ya tiene escritorio.` : 'Cambios guardados.', {
        tipo: 'exito',
      });
      await alGuardar(respuesta.personaje);
    } catch (error) {
      boton.disabled = false;
      boton.textContent = esNuevo ? 'Crear personaje' : 'Guardar cambios';
      if (!mostrarErrorDeCampo(dialogo, error.detalles, error.message)) avisarError(error);
    }
  });
}
