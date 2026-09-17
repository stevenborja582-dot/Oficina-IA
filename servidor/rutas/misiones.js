/**
 * Misiones (Fase 6): una orden tuya, repartida entre varios personajes.
 *
 * La respuesta va por SSE porque la gracia está en verlo pasar: quién recibe el
 * encargo, quién se pone a trabajar, quién termina. La oficina anima eso en vivo.
 *
 * Si cierras la pestaña, la misión **sigue**: el trabajo ya está pagado y en
 * marcha, y tirarlo porque el navegador se fue sería desperdiciarlo. Al volver,
 * `GET /api/misiones/:id` la enseña en el punto en que esté.
 */
import { Router } from 'express';
import * as misiones from '../repositorios/misiones.js';
import * as personajes from '../repositorios/personajes.js';
import * as salas from '../repositorios/salas.js';
import { conEstadoChat } from '../ia/proveedores.js';
import { elegirCoordinador, equipoDisponible, repartir, sintetizar, trabajar } from '../ia/misiones.js';
import { limitar } from '../middlewares/limite-peticiones.js';
import { ErrorHttp, errorPeticion } from '../utilidades/errores.js';
import { LIMITES, textoObligatorio } from '../utilidades/validacion.js';

export const rutasMisiones = Router();

const LIMITE_ORDEN = 4000;

/** Misiones en vuelo, para poder detenerlas y para que dos pestañas vean la misma. */
const enMarcha = new Map();

/* ── Lectura ─────────────────────────────────────────────────────────────── */

rutasMisiones.get('/', (peticion, respuesta) => {
  respuesta.json({ misiones: misiones.historicoDe(peticion.user.id) });
});

/** Quién hay disponible para trabajar, y quién coordinaría. */
rutasMisiones.get('/equipo', (peticion, respuesta) => {
  const salaId = peticion.query.sala ? Number(peticion.query.sala) : null;
  const todos = personajes.listar();
  const candidatos = salaId ? todos.filter((p) => p.sala_id === salaId) : todos;
  const equipo = equipoDisponible(candidatos);
  const coordinador = elegirCoordinador(equipo);

  respuesta.json({
    equipo: equipo.map(conEstadoChat),
    coordinador: coordinador ? conEstadoChat(coordinador) : null,
    // Los que no pueden trabajar y por qué: es lo primero que se pregunta uno.
    fuera: candidatos
      .filter((p) => !equipo.some((disponible) => disponible.id === p.id))
      .map(conEstadoChat),
  });
});

rutasMisiones.get('/:id', (peticion, respuesta, siguiente) => {
  try {
    const mision = misiones.exigirPropia(peticion.params.id, peticion.user.id);
    respuesta.json({ mision: misiones.completa(mision) });
  } catch (error) {
    siguiente(error);
  }
});

rutasMisiones.delete('/:id', (peticion, respuesta, siguiente) => {
  try {
    const mision = misiones.exigirPropia(peticion.params.id, peticion.user.id);
    enMarcha.get(mision.id)?.abort();
    respuesta.json({ mision: misiones.eliminar(mision.id, peticion.user.id) });
  } catch (error) {
    siguiente(error);
  }
});

/** Detener una misión en vuelo. Lo ya entregado se conserva. */
rutasMisiones.post('/:id/detener', (peticion, respuesta, siguiente) => {
  try {
    const mision = misiones.exigirPropia(peticion.params.id, peticion.user.id);
    enMarcha.get(mision.id)?.abort();
    respuesta.json({ ok: true });
  } catch (error) {
    siguiente(error);
  }
});

/* ── Lanzar una misión ───────────────────────────────────────────────────── */

rutasMisiones.post('/', limitar('misiones', 10, 60_000), async (peticion, respuesta, siguiente) => {
  let orden;
  let sala = null;
  let equipo;
  let coordinador;

  // Todo lo que puede fallar antes de abrir el streaming se comprueba aquí, para
  // devolver un error HTTP normal en vez de un evento a medias.
  try {
    orden = textoObligatorio(peticion.body?.orden, 'orden', LIMITE_ORDEN);

    if (peticion.body?.sala_id) {
      sala = salas.exigirPorId(Number(peticion.body.sala_id));
    }

    const todos = personajes.listar();
    const candidatos = sala ? todos.filter((p) => p.sala_id === sala.id) : todos;
    equipo = equipoDisponible(candidatos);

    if (equipo.length === 0) {
      throw errorPeticion(
        sala
          ? `Nadie en "${sala.nombre}" puede trabajar ahora mismo. Revisa su proveedor y su modelo.`
          : 'No hay ningún personaje que pueda trabajar. Revisa que tengan proveedor, modelo y clave.',
      );
    }

    coordinador = elegirCoordinador(equipo);
    if (!coordinador) throw errorPeticion('No hay nadie que pueda coordinar el encargo.');
  } catch (error) {
    return siguiente(error);
  }

  const mision = misiones.crear({ usuarioId: peticion.user.id, salaId: sala?.id ?? null, orden });
  misiones.actualizar(mision.id, { coordinador_id: coordinador.id });

  respuesta.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  respuesta.flushHeaders?.();

  const enviar = (dato) => {
    if (!respuesta.writableEnded) respuesta.write(`data: ${JSON.stringify(dato)}\n\n`);
  };

  const controlador = new AbortController();
  enMarcha.set(mision.id, controlador);
  // Ojo: cerrar la pestaña NO aborta. El trabajo sigue y se recoge al volver.
  respuesta.on('close', () => { /* el stream se va, la misión no */ });

  enviar({
    tipo: 'inicio',
    mision: { ...mision, coordinador_id: coordinador.id },
    coordinador: { id: coordinador.id, nombre: coordinador.nombre, sala_id: coordinador.sala_id },
    equipo: equipo.map((p) => ({ id: p.id, nombre: p.nombre, sala_id: p.sala_id, app: p.app })),
  });

  try {
    /* 1. Reparto */
    const plan = await repartir({ coordinador, equipo, orden, senal: controlador.signal });
    misiones.actualizar(mision.id, { titulo: plan.titulo, estado: 'trabajando' });

    const pasos = plan.pasos.map((paso, indice) => ({
      id: misiones.anadirPaso({
        misionId: mision.id,
        personajeId: paso.personaje.id,
        orden: indice,
        encargo: paso.encargo,
      }),
      personaje: paso.personaje,
      encargo: paso.encargo,
      estado: 'pendiente',
      resultado: '',
      error: null,
    }));

    enviar({
      tipo: 'reparto',
      titulo: plan.titulo,
      pasos: pasos.map((paso) => ({
        id: paso.id,
        encargo: paso.encargo,
        personaje_id: paso.personaje.id,
        personaje_nombre: paso.personaje.nombre,
        personaje_app: paso.personaje.app,
        personaje_sala_id: paso.personaje.sala_id,
      })),
    });

    /* 2. Trabajo, en paralelo */
    await Promise.all(pasos.map(async (paso) => {
      misiones.actualizarPaso(paso.id, { estado: 'trabajando' });
      enviar({ tipo: 'paso', id: paso.id, estado: 'trabajando', personaje_id: paso.personaje.id });

      const salida = await trabajar({
        personaje: paso.personaje,
        encargo: paso.encargo,
        orden,
        senal: controlador.signal,
      });

      paso.estado = salida.ok ? 'lista' : 'error';
      paso.resultado = salida.texto ?? '';
      paso.error = salida.ok ? null : salida.error;

      misiones.actualizarPaso(paso.id, {
        estado: paso.estado,
        resultado: paso.resultado,
        error: paso.error,
        modelo: salida.modelo,
        tokens_entrada: salida.uso?.entrada ?? null,
        tokens_salida: salida.uso?.salida ?? null,
        terminado_en: new Date().toISOString(),
      });

      enviar({
        tipo: 'paso',
        id: paso.id,
        estado: paso.estado,
        personaje_id: paso.personaje.id,
        resultado: paso.resultado,
        error: paso.error,
      });
    }));

    if (controlador.signal.aborted) throw new ErrorHttp(499, 'Misión detenida.');

    /* 3. Síntesis */
    misiones.actualizar(mision.id, { estado: 'resumiendo' });
    enviar({ tipo: 'estado', estado: 'resumiendo' });

    const cierre = await sintetizar({ coordinador, orden, pasos, senal: controlador.signal });
    misiones.actualizar(mision.id, { estado: 'lista', resultado: cierre.texto });

    enviar({ tipo: 'fin', estado: 'lista', resultado: cierre.texto });
  } catch (error) {
    const detenida = controlador.signal.aborted;
    const motivo = detenida ? 'La detuviste a mitad.' : (error?.message ?? 'Falló sin decir por qué.');
    misiones.actualizar(mision.id, { estado: detenida ? 'detenida' : 'error', error: motivo });
    enviar({ tipo: 'fin', estado: detenida ? 'detenida' : 'error', error: motivo });
  } finally {
    enMarcha.delete(mision.id);
    if (!respuesta.writableEnded) respuesta.end();
  }
});
