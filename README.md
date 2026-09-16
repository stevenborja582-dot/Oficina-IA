# Oficina Black Hole v2 — Fase 1

Plano interactivo de una oficina donde cada **sala** es un departamento y cada
**personaje** es una de tus IAs. Esta fase deja la aplicación funcionando de punta a
punta: entras con Google, ves el plano, entras en una sala y das de alta, editas y
borras personajes. El chat real llega en la Fase 2.

```
┌─ Plano (SVG clicable) ─────────────────┐      ┌─ Sala por dentro ──────────┐
│  Desarrollo │ Diseño │ Asistencia      │  →   │  [avatar] Claude Code      │
│ ─────────── PASILLO ───────────────    │      │  Ingeniero de par          │
│  Contenido  │ Automat. │ General       │      │  Claude · claude-opus-5    │
└────────────────────────────────────────┘      └────────────────────────────┘
```

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
│   ├── repositorios/          Todo el SQL vive aquí (usuarios, salas, personajes)
│   ├── rutas/                 autenticacion · api · salas · personajes
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
│       ├── modal-personaje.js · modal-sala.js · modal.js
│       ├── api.js · dom.js · color.js · iconos.js · piezas.js
│       └── tema.js · notificaciones.js
│
├── pruebas/oficina.prueba.js  Prueba de extremo a extremo (npm run verificar)
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

## 7. Qué falta (fases siguientes)

- **Fase 2** — Chat real con la API de Anthropic, `persona_prompt` como system prompt,
  historial persistente y selector de proveedor por personaje.
- **Fase 3** — Skills en Markdown con frontmatter, asignables a cada personaje.
- **Fase 4** — Conectores vía MCP (Drive, Gmail…), con permisos por personaje.
- **Fase 5** — Roles admin/miembro, más proveedores de login y despliegue con
  SQLite alojada (Turso).

El detalle de cada fase está en [`CLAUDE.md`](./CLAUDE.md).
