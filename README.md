# Oficina Black Hole v2

Plano interactivo de una oficina donde cada **sala** es un departamento y cada
**personaje** es una de tus IAs. Entras con Google o GitHub, ves el plano, entras en
una sala, das de alta a tus personajes **y hablas con ellos de verdad**: cada uno con su
persona, su modelo, su historial, los procedimientos que le enseñes y las
herramientas externas que le prestes.

**Las cinco fases están implementadas.** El detalle de cada una está en
[`CLAUDE.md`](./CLAUDE.md).

```
┌─ Plano (SVG clicable) ─────────────────┐   ┌─ Sala ──────────┐   ┌─ Chat ─────────────┐
│  Desarrollo │ Diseño │ Asistencia      │ → │ [NO] Nova       │ → │  Revísame este diff │
│ ─────────── PASILLO ───────────────    │   │ Arquitecta      │   │  ▸ Cómo lo pensó    │
│  Contenido  │ Automat. │ General       │   │ Claude · opus-5 │   │  ▸ Skill · Revisión │
└────────────────────────────────────────┘   │ 2 skills · 1 🔌 │   │  Tres cosas: …      │
                                             └─────────────────┘   └─────────────────────┘
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

### Acceso

Basta con **un** proveedor. En producción, con ninguno configurado, el servidor se
niega a arrancar: sin él nadie podría entrar nunca.

| Variable | Para qué sirve |
| --- | --- |
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` | Cliente OAuth 2.0 de Google Cloud Console. |
| `GITHUB_CLIENT_ID` · `GITHUB_CLIENT_SECRET` | OAuth App de GitHub (Settings → Developer settings). |
| `ADMINS` | Correos (separados por comas) que entran como administradores. El primer usuario registrado siempre es admin. |
| `CORREOS_PERMITIDOS` | Si está vacío, entra cualquiera con cuenta del proveedor. Si pones correos o dominios (`@midominio.com`), solo esos. Las invitaciones creadas en la pantalla **Equipo** valen aunque el correo no esté aquí. |

### Conectores MCP (Fase 4)

| Variable | Para qué sirve |
| --- | --- |
| `MCP_PERMITIR_STDIO` | Permite conectores que lanzan una orden del sistema. Es **ejecución de código**: por defecto sí en desarrollo, no en producción. |
| `MCP_ESPERA_CONEXION_MS` · `MCP_ESPERA_LLAMADA_MS` | Paciencia con un servidor MCP lento (20 s / 60 s). |
| `MCP_MINUTOS_INACTIVIDAD` | Cuándo se cierra una conexión MCP ociosa (15 min). |
| `MCP_MAXIMO_CARACTERES` | Techo del resultado de una herramienta antes de entrar en el contexto del modelo. |
| `MCP_MAXIMO_VUELTAS` | Cuántas veces seguidas puede un personaje llamar a herramientas antes de tener que responder. |

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

## 3. Configurar el login

Basta con uno de los dos. Esto lo tienes que hacer tú en el panel del proveedor; el
código ya está listo esperando las credenciales.

### Google

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

### GitHub

1. <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**.
2. *Homepage URL*: `http://localhost:3000`
   *Authorization callback URL*: `http://localhost:3000/auth/github/callback`
3. Genera un *client secret* y copia ambos valores en tu `.env`:
   ```
   GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
   GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

GitHub solo entrega el correo si se pide el scope `user:email`, y aun así el correo
público puede estar vacío: la app se queda con el **verificado principal**. Si tu
cuenta no tiene ninguno verificado, el acceso se rechaza con ese motivo en pantalla.

> **Cuando lo despliegues**, las URIs de redirección cambian al dominio real
> (`https://tu-dominio.com/auth/google/callback`). Hay que añadirlas en el panel del
> proveedor **y** actualizar `URL_BASE` en el entorno del servidor: la URI de retorno
> se construye a partir de esa variable.

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
│   │   ├── passport.js        Estrategias de Google y GitHub + login de demo
│   │   ├── almacen-sesiones.js Sesiones de Express dentro de la misma SQLite
│   │   └── guardias.js        requiereSesion / requiereAdmin
│   ├── middlewares/
│   │   ├── seguridad.js       CSP y demás cabeceras + comprobación de origen
│   │   ├── limite-peticiones.js Ventana deslizante en memoria (chat y login)
│   │   └── manejo-errores.js  Respuestas de error homogéneas
│   ├── mcp/
│   │   ├── cliente.js         Pool de conexiones a servidores MCP, con alarmas
│   │   └── herramientas.js    Lo que publica cada conector → herramientas del modelo
│   ├── ia/                    Un archivo por proveedor, todos con la misma forma
│   │   ├── proveedores.js     Registro: qué proveedor mueve a cada personaje
│   │   ├── skills-en-contexto.js  Índice en el system prompt + herramienta abrir_skill
│   │   ├── anthropic.js       SDK oficial, streaming, pensamiento resumido
│   │   ├── openai.js          HTTP directo contra su SSE
│   │   ├── google.js          Ídem para Gemini
│   │   └── sse.js             Lector de Server-Sent Events compartido
│   ├── repositorios/          Todo el SQL vive aquí (usuarios, salas, personajes,
│   │                          conversaciones, conectores)
│   ├── rutas/                 autenticacion · api · salas · personajes · chat ·
│   │                          conectores · equipo
│   └── utilidades/            validacion.js · errores.js · frontmatter.js
│
├── publico/                   Frontend — HTML/CSS/JS vanilla, sin compilar
│   ├── index.html             Shell de la aplicación
│   ├── entrar.html            Pantalla de acceso
│   ├── css/
│   │   ├── base.css           ← tokens del sistema de diseño (colores, tipografía, escala)
│   │   ├── componentes.css    Botones, campos, chips, avatar, modal, avisos
│   │   ├── oficina.css        Plano, sala, conectores y equipo
│   │   ├── chat.css           Conversación y pasos de herramienta
│   │   └── entrar.css         Pantalla de acceso
│   └── js/
│       ├── principal.js       ← archivo rey del cliente: estado, rutas y acciones
│       ├── vista-plano.js     Plano SVG + lista de salas para móvil
│       ├── vista-sala.js      Grilla de tarjetas de personaje
│       ├── vista-chat.js      Conversación en streaming
│       ├── vista-skills.js    Escribir, buscar, apagar y borrar skills
│       ├── skills-de-personaje.js     Asignación por personaje
│       ├── vista-conectores.js Alta, prueba y borrado de servidores MCP
│       ├── vista-equipo.js    Quién entra y quién manda
│       ├── conectores-de-personaje.js  Asignación y lista blanca por personaje
│       ├── markdown.js        Markdown a nodos del DOM, sin innerHTML
│       ├── modal-personaje.js · modal-sala.js · modal.js
│       ├── api.js · dom.js · color.js · iconos.js · piezas.js
│       └── tema.js · notificaciones.js
│
├── despliegue/
│   ├── render.yaml            Blueprint de Render (disco persistente, sin Docker)
│   └── fly.toml               Configuración de Fly.io
│
├── demo/oficina.html          La oficina en un archivo, sin servidor (ver §0)
├── pruebas/                   63 pruebas, `npm run verificar`
│   ├── oficina.prueba.js      Extremo a extremo de la Fase 1
│   ├── chat.prueba.js         Extremo a extremo del chat
│   ├── skills.prueba.js       Formato, asignación y qué llega de verdad al modelo
│   ├── conectores.prueba.js   MCP de verdad por stdio contra un servidor de prueba
│   ├── equipo.prueba.js       Roles, invitaciones y suspensión
│   ├── proveedor-falso.js     Servidor que imita el SSE de los proveedores
│   └── servidor-mcp-falso.js  Servidor MCP real, para no simular el protocolo
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
| `GET` | `/api/skills` · `/api/skills/:id` | Skills escritas. El detalle trae el archivo entero con su frontmatter. |
| `POST` `PATCH` `DELETE` | `/api/skills` · `/api/skills/:id` | CRUD de skills (**solo admin**). Leerlas puede cualquiera. |
| `POST` | `/api/skills/restaurar` | Deshacer un borrado, con su id original si sigue libre. |
| `GET` `PUT` | `/api/personajes/:id/skills` | Qué skills lleva un personaje. |
| `GET` | `/api/conectores` | Conectores MCP dados de alta. Sin secretos: solo los nombres de las claves. |
| `POST` `PATCH` `DELETE` | `/api/conectores` · `/api/conectores/:id` | CRUD de conectores (**solo admin**). Uno en uso no se puede borrar. |
| `POST` | `/api/conectores/:id/probar` | Abre el servidor MCP de verdad y guarda qué sabe hacer. |
| `GET` `PUT` | `/api/personajes/:id/conectores` | Qué conectores lleva un personaje y con qué lista blanca de herramientas. |
| `GET` | `/api/equipo` | Equipo e invitaciones (**solo admin**). |
| `PATCH` `DELETE` | `/api/equipo/:id` | Cambia rol o estado, o da de baja (**solo admin**). |
| `POST` `DELETE` | `/api/equipo/invitaciones` · `/api/equipo/invitaciones/:id` | Invitar y revocar (**solo admin**). |
| `GET` | `/auth/estado` | Público. Qué proveedores de login hay disponibles. |
| `GET` | `/auth/google` · `/auth/github` (+ `/callback`) | Flujos de OAuth. |
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

## 8. Skills, conectores y equipo, por dentro

### Skills: índice siempre, instrucciones a petición

Una skill es **Markdown con frontmatter**, con el espíritu de un `SKILL.md`:

```markdown
---
nombre: Revisión de código
descripcion: Busca errores reales en un diff, no cuestiones de estilo
cuando-usarla: Cuando te pidan revisar código o un pull request
etiquetas: código, revisión
---

# Cómo revisar

1. Lee el diff entero antes de opinar.
2. Un fallo es un fallo si puedes escribir la entrada que lo provoca.
```

**Lo que llega al modelo no es el archivo.** En el system prompt va solo el *índice*
de sus skills —nombre, para qué sirve, cuándo sacarla—, que son tres líneas por
skill. Las instrucciones completas se piden con la herramienta `abrir_skill`, y solo
cuando encajan con lo que se ha preguntado.

Volcar cada skill entera funciona con dos. Con diez se come el contexto, se paga en
cada turno aunque no venga a cuento, y el modelo pierde de vista lo que de verdad le
preguntaron. Hay una prueba que comprueba exactamente esto: que el índice está en el
system prompt y que el cuerpo **no**, hasta que lo pide.

Con un proveedor que todavía no sabe usar herramientas (OpenAI y Google aquí) el
modelo no puede pedir nada. Ahí las skills entran enteras hasta un techo de
caracteres, y lo que no cabe se le dice por su nombre — mejor que el personaje sepa
que le falta algo a que improvise creyendo que lo tiene.

**El analizador de frontmatter es propio**, un subconjunto de YAML de cien líneas:
pares de una línea, listas con comas o guiones, bloques con `|`. Las claves se
normalizan, así que `cuando-usarla`, `cuando_usarla` y `Cuando Usarla` son la misma —
quien escribe la skill no debería tener que acertar el guion. Un YAML completo serían
cien kilobytes de dependencia y una superficie de ataque que aquí no hace falta.

**Una skill apagada sigue asignada pero no entra en contexto**, y el chat la enseña en
gris. Es la respuesta a "¿por qué este personaje no está haciendo lo que le pedí?".

### Conectores y equipo

**Un conector es un servidor MCP.** El backend actúa de cliente: abre el servidor,
pregunta qué sabe hacer y le ofrece esas herramientas al personaje que lo tenga
asignado. Los nombres que ve el modelo salen del *slug* del conector, que no cambia
al renombrarlo — así una conversación en vuelo no se rompe a mitad.

**Los secretos no viajan.** Las variables de entorno y las cabeceras de un conector se
quedan en el servidor; al navegador solo llegan los **nombres** de las claves. Al
editar, un campo de secretos vacío significa “deja los de antes”, no “bórralos”.

**Un conector de proceso es ejecución de código.** Lanza `npx`, `uvx` o lo que le
pongas, con el entorno acotado a `PATH` más sus propias variables. En tu equipo es
justo lo que quieres; en un servidor compartido viene apagado
(`MCP_PERMITIR_STDIO=false`) y su alta es solo para administradores.

**Una herramienta que falla no rompe el hilo.** Vuelve al modelo marcada como error,
él decide qué hacer, y el chat lo enseña como un paso plegable. Un conector caído se
anuncia en la conversación y el personaje sigue con los que sí responden.

**La oficina nunca se queda sin dueño.** Ni degradando, ni suspendiendo, ni borrando
al último administrador activo: las tres puertas están cerradas en el repositorio, no
solo en la interfaz. Y nadie puede cambiarse a sí mismo — para eso está otro admin.

**Suspender no es borrar.** Suspender cierra la puerta y conserva el historial; la
sesión que ya estaba abierta deja de valer en la siguiente petición, sin esperar a
que caduque la cookie. Borrar se lleva también las conversaciones de esa persona: son
suyas, no del personaje.

---

## 9. Accesibilidad y rendimiento

Revisadas las seis pantallas (entrar, plano, sala, chat, conectores, equipo) en los
dos temas y a 1280 y 390 px, con una auditoría que mide sobre el DOM real: contraste
calculado componiendo los fondos translúcidos, objetivos táctiles, nombre accesible de
cada control, jerarquía de encabezados y desbordamiento horizontal.

**Lo que se corrigió en esa pasada:**

- **La tinta legible se calculaba contra el fondo equivocado.** `tintaLegible()`
  apuntaba al lienzo, pero chips y avatares escriben sobre un fondo **teñido** con su
  propio color (10 % y 16 %). Ese punto de diferencia dejaba los textos en 4.1–4.5:1,
  justo por debajo de AA. Ahora `variablesSala(color, { tinte })` compone el fondo real
  antes de buscar la tinta.
- **Había dos reglas para el alto de los filtros** y ganaba la de 40 px, por debajo del
  mínimo que el propio archivo anuncia. Una sola regla, y en 44.
- Objetivos táctiles por debajo de 44 px en móvil: la marca (al esconder su texto se
  quedaba en 28), el enlace de salto, las migas de ruta, el campo del compositor y los
  botones de la cabecera del chat sin su etiqueta.
- **Jerarquía de encabezados rota**: las tarjetas usaban `h3` colgando directamente del
  `h1` de la pantalla. Falta el escalón intermedio, visible donde aporta (Equipo →
  “Personas” / “Invitaciones”) y para lectores de pantalla donde sería ruido.
- El buscador del plano no tenía nombre accesible: solo `placeholder`, que desaparece
  al escribir.

**Rendimiento.** Dos cambios, ninguno con paso de compilación:

- **`modulepreload`.** El grafo de módulos tiene cinco niveles: sin él, el navegador
  los descubre de uno en uno y encadena cinco vueltas de red antes de poder arrancar.
- **gzip** sobre lo que sale (`vista-chat.js` pasa de 19,4 KB a 5,5 KB). El chat queda
  **fuera a propósito**: un stream SSE comprimido se acumula en el búfer y llegaría a
  golpes en vez de palabra a palabra. Hay una prueba que lo vigila.

En local, el plano pinta en ~320 ms con 300 nodos en el DOM y ~9 KB de tráfico; cambiar
de vista no pide un solo asset más.

---

## 10. Despliegue

La oficina guarda su estado en **un archivo SQLite**, así que lo único que de verdad
necesita del hosting es un **disco que sobreviva a los despliegues**. Hay dos
configuraciones listas en `despliegue/`:

| Archivo | Hosting | Cómo |
| --- | --- | --- |
| `despliegue/render.yaml` | [Render](https://render.com) | Blueprint, sin Docker. Volumen de 1 GB en `/var/datos`. |
| `despliegue/fly.toml` | [Fly.io](https://fly.io) | `fly launch --copy-config --config despliegue/fly.toml`. Volumen en `/datos`. |

Antes de desplegar, tres cosas:

1. **Una sola instancia.** SQLite es un archivo, no un servidor: dos máquinas
   escribiendo el mismo volumen se corrompen entre sí.
2. **Registra la URI de redirección real** en Google y/o GitHub
   (`https://tu-dominio/auth/google/callback`).
3. **Genera `SECRETO_SESION`.** En producción el servidor exige 32 caracteres
   aleatorios y se niega a arrancar con el valor de ejemplo.

El servidor no arranca en producción si `AUTH_PERMITIR_DEMO=true`, si `URL_BASE` no
es `https://` o si no hay ningún proveedor de login. Son tres formas distintas de
dejar la puerta abierta, y las tres son un fallo de arranque, no un aviso.

### Sobre Turso

El plan original de la Fase 5 era migrar a [Turso](https://turso.tech) (SQLite
alojada) para acceso multidispositivo. **No está hecho, y es deliberado.**

`better-sqlite3` es **síncrono**: `bd().prepare(...).get()` devuelve la fila, sin
promesa. El cliente de Turso (`@libsql/client`) es **asíncrono**. Cambiar de uno a
otro no es cambiar una línea de conexión: convierte en `async` cada función de
`servidor/repositorios/`, cada ruta que las llama y cada transacción — unos veinte
archivos, y con ellos la garantía de atomicidad que hoy dan las transacciones
síncronas de `better-sqlite3`.

A cambio, para una oficina en un solo servidor, no resuelve ningún problema que hoy
exista: un volumen persistente de 1 GB ya sobrevive a los despliegues y es varios
órdenes de magnitud más rápido que ir por red en cada consulta.

**Recomendación:** despliega con disco persistente. Turso merece la pena el día que
necesites de verdad varias instancias a la vez o réplicas en varias regiones — y ese
día, la migración es un trabajo con nombre y alcance claro, no un atajo.

---

## 11. Hasta aquí llega la hoja de ruta

Las cinco fases están construidas y funcionando de punta a punta. Lo que vendría
después ya no está planificado; estas son las tres ideas que el código deja más a
mano, por si algún día hacen falta:

- **Skills con archivos adjuntos.** Hoy una skill es un archivo. Un `SKILL.md` de
  verdad puede traer plantillas o scripts al lado; el hueco natural es una tabla
  `skill_archivos` y una segunda herramienta junto a `abrir_skill`.
- **Voz y visión por personaje.** El modelo de datos ya habla de "habilidades" como
  algo activable por personaje; hoy solo existe el chat de texto.
- **Turso**, el día que de verdad hagan falta varias instancias. Ver §10.

El detalle de cada fase está en [`CLAUDE.md`](./CLAUDE.md).
