/**
 * Migraciones incrementales versionadas con `PRAGMA user_version`.
 * Para añadir una migración: empuja una función nueva al final del array.
 * Nunca edites una migración ya publicada — añade otra.
 */

const migraciones = [
  // 1 — Fase 1: usuarios, salas, personajes y almacén de sesiones.
  (db) => {
    db.exec(`
      CREATE TABLE usuarios (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        proveedor_auth  TEXT    NOT NULL,
        proveedor_id    TEXT    NOT NULL,
        email           TEXT    NOT NULL,
        nombre          TEXT    NOT NULL DEFAULT '',
        avatar_url      TEXT,
        rol             TEXT    NOT NULL DEFAULT 'miembro' CHECK (rol IN ('admin', 'miembro')),
        creado_en       TEXT    NOT NULL,
        ultimo_acceso_en TEXT,
        UNIQUE (proveedor_auth, proveedor_id)
      );

      CREATE UNIQUE INDEX idx_usuarios_email ON usuarios (email);

      CREATE TABLE salas (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        slug          TEXT    NOT NULL UNIQUE,
        nombre        TEXT    NOT NULL,
        descripcion   TEXT    NOT NULL DEFAULT '',
        color_acento  TEXT    NOT NULL DEFAULT '#57534E',
        icono         TEXT    NOT NULL DEFAULT 'oficina',
        orden         INTEGER NOT NULL DEFAULT 0,
        -- Geometría de la sala dentro del plano SVG (unidades del viewBox).
        plano_x       INTEGER NOT NULL DEFAULT 40,
        plano_y       INTEGER NOT NULL DEFAULT 40,
        plano_ancho   INTEGER NOT NULL DEFAULT 354,
        plano_alto    INTEGER NOT NULL DEFAULT 216,
        creado_en     TEXT    NOT NULL,
        actualizado_en TEXT   NOT NULL
      );

      CREATE TABLE personajes (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        sala_id        INTEGER NOT NULL REFERENCES salas (id) ON DELETE CASCADE,
        nombre         TEXT    NOT NULL,
        rol_titulo     TEXT    NOT NULL DEFAULT '',
        avatar_url     TEXT,
        persona_prompt TEXT    NOT NULL DEFAULT '',
        proveedor_ia   TEXT    NOT NULL DEFAULT 'anthropic'
                       CHECK (proveedor_ia IN ('anthropic', 'openai', 'google', 'externo')),
        modelo         TEXT    NOT NULL DEFAULT '',
        enlace_externo TEXT,
        estado         TEXT    NOT NULL DEFAULT 'activo'
                       CHECK (estado IN ('activo', 'borrador', 'pausado')),
        orden          INTEGER NOT NULL DEFAULT 0,
        creado_en      TEXT    NOT NULL,
        actualizado_en TEXT    NOT NULL
      );

      CREATE INDEX idx_personajes_sala ON personajes (sala_id, orden);

      CREATE TABLE sesiones (
        sid     TEXT    PRIMARY KEY,
        expira  INTEGER NOT NULL,
        datos   TEXT    NOT NULL
      );

      CREATE INDEX idx_sesiones_expira ON sesiones (expira);
    `);
  },

  // 2 — Fase 2: conversaciones y mensajes de cada personaje.
  (db) => {
    db.exec(`
      CREATE TABLE conversaciones (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        personaje_id   INTEGER NOT NULL REFERENCES personajes (id) ON DELETE CASCADE,
        usuario_id     INTEGER NOT NULL REFERENCES usuarios (id)   ON DELETE CASCADE,
        titulo         TEXT    NOT NULL DEFAULT '',
        archivada      INTEGER NOT NULL DEFAULT 0,
        creado_en      TEXT    NOT NULL,
        actualizado_en TEXT    NOT NULL
      );

      -- Una conversación abierta por personaje y usuario: es la que se muestra al entrar.
      CREATE INDEX idx_conversaciones_abiertas
        ON conversaciones (personaje_id, usuario_id, archivada, id DESC);

      CREATE TABLE mensajes (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        conversacion_id INTEGER NOT NULL REFERENCES conversaciones (id) ON DELETE CASCADE,
        rol             TEXT    NOT NULL CHECK (rol IN ('user', 'assistant', 'system')),
        contenido       TEXT    NOT NULL DEFAULT '',
        -- Resumen del razonamiento, cuando el modelo lo devuelve. Nunca es el
        -- razonamiento en crudo: la API no lo expone.
        razonamiento    TEXT,
        modelo          TEXT,
        proveedor_ia    TEXT,
        tokens_entrada  INTEGER,
        tokens_salida   INTEGER,
        -- Si la respuesta se cortó o falló, el motivo queda aquí y la fila se
        -- guarda igual: el hilo no puede mentir sobre lo que pasó.
        error           TEXT,
        creado_en       TEXT    NOT NULL
      );

      CREATE INDEX idx_mensajes_conversacion ON mensajes (conversacion_id, id);
    `);
  },
];

export function aplicarMigraciones(db) {
  const versionActual = db.pragma('user_version', { simple: true });

  for (let version = versionActual; version < migraciones.length; version += 1) {
    const migrar = migraciones[version];
    const aplicar = db.transaction(() => {
      migrar(db);
      db.pragma(`user_version = ${version + 1}`);
    });
    aplicar();
  }

  return { desde: versionActual, hasta: migraciones.length };
}

export const versionEsquema = migraciones.length;
