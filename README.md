# Oficina Black Hole v2 — Fases 1 y 2

Plano interactivo de una oficina donde cada **sala** es un departamento y cada
**personaje** es una de tus IAs. Entras con Google, ves el plano, entras en una sala,
das de alta a tus personajes **y hablas con ellos de verdad**: cada uno con su
persona, su modelo y su historial.

```
┌─ Plano (SVG clicable) ─────────────────┐   ┌─ Sala ──────────┐   ┌─ Chat ─────────────┐
│  Desarrollo │ Diseño │ Asistencia      │ → │ [NO] Nova       │ → │  ¿Por dónde empiezo?│
│ ─────────── PASILLO ───────────────    │   │ Arquitecta      │   │  ▸ Cómo lo pensó    │
│  Contenido  │ Automat. │ General       │   │ Claude · opus-5 │   │  Tres pasos: …      │
└────────────────────────────────────────┘   └─────────────────┘   └─────────────────────┘
```

---

## 0. Verla sin instalar nada

`demo/oficina.html` es la oficina entera en un solo archivo: ábrelo con doble clic y
ahí está la **oficina isométrica en 3D** —salas con muros, ventanas y un personaje
de pie en cada puesto—, además del plano 2D, la lista, las fichas y el chat. No
necesita servidor, ni `npm install`, ni `.env`, ni credenciales de Google.

El 3D va en CSS puro, sin librería: cada sala y cada personaje siguen siendo botones
de verdad, así que se recorren con el tabulador y los lee un lector de pantalla.

Es una **versión autónoma**, no la app: guarda en el navegador (o en el almacén del
artefacto, si la abres publicada) en vez de en SQLite, y para que los personajes
respondan usa la capacidad de preguntar a Claude de la propia página, no tu clave de
API. Sirve para enseñar la oficina y para montar tu plantilla; lo de abajo es el
producto de verdad.

---

## 1. Arrancarlo en local (5 minutos)

Necesitas **Node.js 20.11 o superior**. Nada más: no hay Docker, ni servidor de base
de datos, ni paso de compilación.

```bash
# 1. Instalar dependencias
npm install

# 2. Crear tu archivo de entorno a partir del ejemplo
cp .env.example .env

# 3. Generar un secreto de sesión y pegarlo en SECRETO_SESION
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. Arrancar
npm run dev
```

Abre **http://localhost:3000**.

Sin credenciales de Google todavía, entra con el botón **“Entrar en modo demo”**: crea
un usuario local y te deja usar toda la aplicación. El primer usuario que entra queda
como administrador.

Para que los personajes respondan necesitas además una clave de IA — basta con
`ANTHROPIC_API_KEY`. Sin ella la oficina funciona igual, pero el botón “Chatear”
aparece apagado y explica qué falta.

### Órdenes disponibles

| Orden | Qué hace |
| --- | --- |
| `npm run dev` | Arranca con recarga automática al guardar (`node --watch`). |
| `npm start` | Arranca sin recarga (lo que usarías en producción). |
| `npm run bd:migrar` | Aplica migraciones pendientes y muestra la versión del esquema. |
| `npm run bd:sembrar` | Siembra las seis salas. Con `-- --ejemplos` añade tres personajes de muestra. |
| `npm run bd:reiniciar -- --si-estoy-seguro` | Borra la base local y la deja recién sembrada. |
| `npm run verificar` | Prueba de extremo a extremo de la API (levanta el servidor real contra una base temporal). |

---

## 2. Variables de entorno

Todas viven en `.env` (copiado de `.env.example`). Este archivo **nunca** se sube al
repositorio.

### Obligatorias

| Variable | Para qué sirve |
| --- | --- |
| `SECRETO_SESION` | Firma la cookie de sesión. Cadena aleatoria larga; genérala con la orden del paso 3. **Obligatoria en producción** (mínimo 32 caracteres). |

### Con valor por defecto razonable

| Variable | Por defecto | Para qué sirve |
| --- | --- | --- |
| `PUERTO` | `3000` | Puerto del servidor. |
| `URL_BASE` | `http://localhost:3000` | URL pública. De aquí se construye la URI de redirección de Google. |
| `NODE_ENV` | `development` | `production` activa cookies `Secure`, HSTS y validaciones estrictas. |
| `RUTA_BD` | `./datos/oficina.sqlite` | Archivo SQLite. La carpeta se crea sola. |
| `DIAS_SESION` | `30` | Cuánto dura la sesión antes de volver a pedir login. |

### Google OAuth

| Variable | Para qué sirve |
| --- | --- |
| `GOOGLE_CLIENT_ID` | ID de cliente OAuth 2.0 de Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | Secreto de ese mismo cliente. |
| `ADMINS` | Correos (separados por comas) que entran como administradores. El primer usuario registrado siempre es admin. |
| `CORREOS_PERMITIDOS` | Si está vacío, entra cualquier cuenta de Google. Si pones correos o dominios (`@midominio.com`), solo esos. |

### Proveedores de IA (Fase 2)

Solo hace falta la clave del proveedor que uses. Cada personaje elige el suyo en su
ficha; si falta la clave, la interfaz lo dice **antes** de que escribas nada.

| Variable | Para qué sirve |
| --- | --- |
| `ANTHROPIC_API_KEY` | Clave de <https://console.anthropic.com>. Es el proveedor por defecto. |
| `MODELO_ANTHROPIC` | Modelo para los personajes de Anthropic que no indiquen uno. Por defecto `claude-opus-5`. |
| `OPENAI_API_KEY` | Opcional, de <https://platform.openai.com/api-keys>. |
| `MODELO_OPENAI` | Si lo dejas vacío, cada personaje de OpenAI tiene que indicar su modelo en su ficha. |
| `GOOGLE_AI_API_KEY` | Opcional, de <https://aistudio.google.com/apikey>. |
| `MODELO_GOOGLE` | Igual que el anterior, para Gemini. |
| `IA_MAXIMO_TOKENS` | Techo de tokens por respuesta (por defecto `32000`). Es un límite, no un objetivo: solo se paga lo generado. |
| `IA_MENSAJES_CONTEXTO` | Cuántos mensajes previos se reenvían como contexto (por defecto `40`). |
| `ANTHROPIC_URL_BASE` | Solo si hablas con Anthropic a través de una pasarela propia. Vacío = API oficial. |

### Solo desarrollo

| Variable | Para qué sirve |
| --- | --- |
| `AUTH_PERMITIR_DEMO` | `true` habilita el botón “Entrar en modo demo”, un login local sin Google. **El servidor se niega a arrancar si esto está en `true` con `NODE_ENV=production`.** |

---

## 3. Configurar el login con Google

Esto lo tienes que hacer tú en Google Cloud Console; el código ya está listo
esperando las credenciales.

1. Entra en <https://console.cloud.google.com> y crea un proyecto (o usa uno que ya
   tengas).
2. **APIs y servicios → Pantalla de consentimiento de OAuth**
   - Tipo de usuario: **Externo** (salvo que uses Google Workspace).
   - Rellena nombre de la app, correo de asistencia y correo del desarrollador.
   - En “Usuarios de prueba” añade tu propia cuenta de Gmail mientras la app esté en
     modo de prueba.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**
   - Tipo de aplicación: **Aplicación web**.
   - **Orígenes autorizados de JavaScript**: `http://localhost:3000`
   - **URIs de redirección autorizados**: `http://localhost:3000/auth/google/callback`
4. Copia el **ID de cliente** y el **Secreto de cliente** en tu `.env`:
   ```
   GOOGLE_CLIENT_ID=123456789-xxxxxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
   ADMINS=tucorreo@gmail.com
   ```
5. Reinicia el servidor. El botón “Continuar con Google” aparece solo cuando detecta
   ambas variables.

> **Cuando lo despliegues**, la URI de redirección cambia al dominio real
> (`https://tu-dominio.com/auth/google/callback`). Hay que añadirla en Google Cloud
> Console **y** actualizar `URL_BASE` en el entorno del servidor: la URI de retorno se
> construye a partir de esa variable.

---

## 4. Mapa del repositorio

```
Oficina-IA/
├── CLAUDE.md                  Contexto permanente del proyecto (lo lee Claude Code)
├── README.md                  Este archivo
├── .env.example               Plantilla de variables de entorno
│
├── servidor/                  Backend — Node + Express
│   ├── index.js               ← archivo rey: monta la app y escucha
│   ├── configuracion.js       Carga y valida .env (único sitio que lee process.env)
│   ├── base-datos/
│   │   ├── conexion.js        Conexión SQLite (better-sqlite3, modo WAL)
│   │   ├── migraciones.js     Esquema versionado con PRAGMA user_version
│   │   ├── plano.js           Geometría de la rejilla del plano
│   │   ├── sembrar.js         Las seis salas de la v1
│   │   ├── migrar.js          CLI: aplicar migraciones
│   │   └── reiniciar.js       CLI: borrar y resembrar
│   ├── autenticacion/
│   │   ├── passport.js        Estrategia de Google + login de demo
│   │   ├── almacen-sesiones.js Sesiones de Express dentro de la misma SQLite
│   │   └── guardias.js        requiereSesion / requiereAdmin
│   ├── middlewares/
│   │   ├── seguridad.js       CSP y demás cabeceras + comprobación de origen
│   │   └── manejo-errores.js  Respuestas de error homogéneas
│   ├── ia/                    Un archivo por proveedor, todos con la misma forma
│   │   ├── proveedores.js     Registro: qué proveedor mueve a cada personaje
│   │   ├── anthropic.js       SDK oficial, streaming, pensamiento resumido
│   │   ├── openai.js          HTTP directo contra su SSE
│   │   ├── google.js          Ídem para Gemini
│   │   └── sse.js             Lector de Server-Sent Events compartido
│   ├── repositorios/          Todo el SQL vive aquí (usuarios, salas, personajes, conversaciones)
│   ├── rutas/                 autenticacion · api · salas · personajes · chat
│   └── utilidades/            validacion.js · errores.js
│
├── publico/                   Frontend — HTML/CSS/JS vanilla, sin compilar
│   ├── index.html             Shell de la aplicación
│   ├── entrar.html            Pantalla de acceso
│   ├── css/
│   │   ├── base.css           ← tokens del sistema de diseño (colores, tipografía, escala)
│   │   ├── componentes.css    Botones, campos, chips, avatar, modal, avisos
│   │   ├── oficina.css        Plano y sala por dentro
│   │   └── entrar.css         Pantalla de acceso
│   └── js/
│       ├── principal.js       ← archivo rey del cliente: estado, rutas y acciones
│       ├── vista-plano.js     Plano SVG + lista de salas para móvil
│       ├── vista-sala.js      Grilla de tarjetas de personaje
│       ├── vista-chat.js      Conversación en streaming
│       ├── markdown.js        Markdown a nodos del DOM, sin innerHTML
│       ├── modal-personaje.js · modal-sala.js · modal.js
│       ├── api.js · dom.js · color.js · iconos.js · piezas.js
│       └── tema.js · notificaciones.js
│
├── demo/oficina.html          La oficina en un archivo, sin servidor (ver §0)
├── pruebas/
│   ├── oficina.prueba.js      Extremo a extremo de la Fase 1
│   ├── chat.prueba.js         Extremo a extremo del chat
│   └── proveedor-falso.js     Servidor que imita el SSE de los proveedores
└── datos/                     Base SQLite local (ignorada por git)
```

---

## 5. La API

Todo lo que cuelga de `/api` exige sesión iniciada y responde JSON.

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/api/yo` | Usuario en sesión y sus permisos. |
| `GET` | `/api/oficina` | Carga completa: salas, personajes, geometría del plano y catálogos. Una sola petición pinta todo. |
| `GET` | `/api/salas` · `/api/salas/:slug` | Listado / una sala con sus personajes. |
| `POST` `PATCH` `DELETE` | `/api/salas` · `/api/salas/:id` | CRUD de salas (**solo admin**). Una sala con personajes dentro no se puede borrar. |
| `GET` `POST` `PATCH` `DELETE` | `/api/personajes` · `/api/personajes/:id` | CRUD de personajes. |
| `POST` | `/api/personajes/restaurar` | Deshacer un borrado: devuelve el personaje con su id original si sigue libre. |
| `GET` | `/api/personajes/:id/conversacion` | El hilo abierto con ese personaje, más el histórico y si el chat está disponible. |
| `POST` | `/api/personajes/:id/mensajes` | Manda un mensaje. Responde en **streaming (SSE)** con eventos `inicio`, `razonamiento`, `texto` y `fin`. |
| `POST` | `/api/personajes/:id/conversacion/nueva` | Archiva el hilo actual y abre uno limpio. |
| `GET` | `/api/personajes/:id/conversacion/:idHilo` | Relee un hilo archivado (solo los tuyos). |
| `DELETE` | `/api/personajes/:id/mensajes/:idMensaje` | Borra un turno suelto del hilo abierto. |
| `GET` | `/auth/estado` | Público. Qué proveedores de login hay disponibles. |
| `GET` | `/auth/google` · `/auth/google/callback` | Flujo de OAuth. |
| `POST` | `/auth/demo` | Login local (solo si `AUTH_PERMITIR_DEMO=true`). |
| `POST` | `/auth/salir` | Cierra la sesión y borra la cookie. |
| `GET` | `/salud` | Público. Comprobación de vida. |

---

## 6. Decisiones de diseño

**El plano no es una decoración.** Las coordenadas de cada sala (`plano_x`,
`plano_y`, `plano_ancho`, `plano_alto`) están en la base de datos, no en el CSS. Una
sala nueva se coloca sola en el primer hueco libre de una rejilla de tres columnas y,
si hace falta, el lienzo crece hacia abajo. Dentro de cada sala se dibuja un
escritorio por personaje: se ve llena o vacía de un vistazo.

**Móvil de verdad, no un plano encogido.** Por debajo de 780 px el SVG se sustituye
por una lista de salas navegable con el pulgar. Son los mismos datos, dos formas de
leerlos.

**El contraste no se confía al ojo.** Cada sala tiene su color y tú puedes elegir
cualquiera. `publico/js/color.js` calcula la luminancia relativa del color y lo
oscurece —o lo aclara, en tema oscuro— hasta llegar a **4.5:1** contra el fondo real.
Los colores de departamento de la v1 (verde `#059669`, teal `#0D9488`, ámbar
`#D97706`) se quedan en 3.0–3.6:1 como texto: el ajuste automático es lo que los
mantiene en WCAG AA sin cambiar la paleta.

**Borrar no es perder.** Al eliminar un personaje el aviso ofrece “Deshacer” durante
siete segundos, y la restauración recupera su id original si sigue libre, así que los
enlaces guardados siguen valiendo.

**Seguridad sin dependencias extra.** Cabeceras CSP escritas a mano, cookie
`HttpOnly` + `SameSite=Lax`, comprobación de origen en toda mutación, `state` firmado
en el flujo de OAuth, y validación de servidor en cada campo (los enlaces solo
admiten `http://` y `https://`, nunca `javascript:`). Nada del usuario pasa por
`innerHTML`.

---

## 7. El chat, por dentro

**Un archivo por proveedor, una sola forma.** Cada adaptador de `servidor/ia/` expone
un generador `conversar()` que va soltando `{tipo: 'texto' | 'razonamiento' | 'fin'}`.
El resto del backend no sabe con quién habla. Anthropic va por su SDK oficial; OpenAI
y Google, por HTTP directo contra su SSE, que son cuarenta líneas cada uno y ahorran
dos dependencias.

**Streaming de punta a punta.** La respuesta sale del proveedor en trozos, cruza el
backend como SSE y se pinta en el navegador según llega. El Markdown se vuelve a
componer una vez por fotograma, no una vez por trozo: los fragmentos llegan mucho más
rápido de lo que la pantalla puede dibujar.

**El pensamiento, resumido y plegado.** A Claude se le pide razonamiento en modo
`summarized`. Sin eso, el chat se queda callado mientras el modelo piensa y parece
colgado; con eso, aparece un bloque "Cómo lo pensó" que puedes desplegar. El
razonamiento en crudo no lo expone ninguna API, y aquí tampoco se inventa.

**El hilo no miente.** Si el proveedor falla, si el modelo declina responder o si
pulsas "Detener", el turno se guarda igual con su motivo. Lo que sí llegó se conserva;
lo que falló no se reenvía como contexto en el turno siguiente.

**El Markdown no ejecuta nada.** `publico/js/markdown.js` compone la respuesta con
nodos del DOM, nunca con `innerHTML`, y solo acepta enlaces `http`/`https`. Una
respuesta con `<script>` dentro se ve como texto — hay una prueba de navegador que lo
comprueba.

**Cada quien con su hilo.** Las conversaciones se guardan por usuario y personaje, así
que el día que compartas la oficina nadie lee el hilo de nadie. Los hilos anteriores
quedan accesibles desde "Anteriores".

---

## 8. Qué falta (fases siguientes)

- **Fase 3** — Skills en Markdown con frontmatter, asignables a cada personaje.
- **Fase 4** — Conectores vía MCP (Drive, Gmail…), con permisos por personaje.
- **Fase 5** — Roles admin/miembro, más proveedores de login y despliegue con
  SQLite alojada (Turso).

El detalle de cada fase está en [`CLAUDE.md`](./CLAUDE.md).
