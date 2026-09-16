# Oficina Black Hole v2 — Prompt maestro

> Este archivo es el contexto permanente del proyecto. Claude Code lo lee al abrir
> cada sesión, así que no hace falta volver a explicar el proyecto desde cero.

---

## Estado actual del repositorio

| Fase | Alcance | Estado |
| --- | --- | --- |
| **Fase 1** | Cimientos + oficina visual (login Google, SQLite, plano SVG, CRUD de salas y personajes) | ✅ **Implementada** |
| **Fase 2** | Personajes con vida (chat real en streaming, historial, un adaptador por proveedor) | ✅ **Implementada** |
| Fase 3 | Skills (Markdown + frontmatter, asignación por personaje, inyección en contexto) | ⬜ Pendiente |
| Fase 4 | Conectores (cliente MCP en el backend, permisos por personaje) | ⬜ Pendiente |
| Fase 5 | Multiusuario, pulido y despliegue (roles, más proveedores de login, Turso) | ⬜ Pendiente |

Arranque rápido, variables de entorno y mapa de archivos: ver [`README.md`](./README.md).

---

## Resumen ejecutivo

Oficina Black Hole es la evolución del panel que ya se construyó (la "Oficina" con
tarjetas de IA, roles y departamentos). La versión 2 la convierte en una aplicación
real: entras con tu cuenta de Google, ves un plano interactivo con varias salas (una
por departamento), cada sala tiene personajes con identidad propia — uno por cada IA
que uses — y con el tiempo cada personaje podrá chatear de verdad, usar habilidades
reutilizables y conectarse a servicios externos (Drive, Gmail, etc.) mediante
conectores.

## Lo que ya existe (contexto, no lo repitas desde cero)

- Ya hay una **v1 publicada**: un dashboard de una sola página con tarjetas de IA
  (nombre, rol editable, departamento con color, enlace), buscador, filtros por
  departamento, modal accesible de alta/edición, y borrado con "Deshacer". Estética
  minimalista tipo Apple/Stripe/Linear: fondo casi blanco cálido, texto casi negro,
  un solo acento ámbar/óxido, tipografía Geist + Geist Mono, departamentos con color
  semántico propio (Desarrollo = azul, Diseño = violeta, Asistencia = verde,
  Contenido = teal, Automatización = ámbar).
- Los departamentos ya definidos son: Desarrollo & Código, Diseño Visual, Asistencia
  Personal, Redacción & Contenido, Automatización, General. En la v2 esos
  departamentos se convierten en las **salas**.
- La lista de IAs **no es fija** — la decides tú y la vas ampliando. No asumas
  nombres fijos más allá de los que tú registres.
- Reutiliza la identidad visual de esa v1 (paleta, tipografía, tono de las tarjetas)
  como sistema de diseño base de la v2, en vez de inventar una nueva. Es un proyecto
  que continúa, no uno nuevo.

## Principios de ingeniería

- Frontend en **JavaScript vanilla / módulos ES**, sin frameworks pesados salvo que
  una fase concreta lo justifique de verdad. Es el mismo criterio de Astra Nova.
- Backend mínimo, solo para lo que el navegador no puede hacer solo: login, secretos
  de API, base de datos, ejecución de conectores. **Node.js + Express** es
  suficiente; no se necesita Next.js ni similares.
- Todo el "cerebro" vive en la nube (APIs de Anthropic / OpenAI / Google) — nunca
  modelos corriendo en local.
- Base de datos ligera: el equipo principal tiene 8 GB de RAM, así que nada de Docker
  ni servidores de base de datos pesados en local. **SQLite** corre sin servidor
  propio; si más adelante hace falta acceso multi-dispositivo, se migra a SQLite
  alojada (**Turso**) sin cambiar de motor ni de consultas.
- Arquitectura **"archivos reyes"**: un `index.html`, un CSS principal y un JS
  principal por vista, con módulos subordinados de nombre descriptivo **en español**.
- Cada fase debe dejar la app **funcionando de punta a punta** — puede faltarle
  alcance, pero no debe quedar a medio romper.

## Arquitectura general

- **Frontend**: HTML/CSS/JS vanilla, módulos ES. Un "shell" con el plano de salas y,
  dentro de cada sala, la vista de personajes (tarjetas, similar a la v1).
- **Backend**: Node.js + Express. Rutas para auth, CRUD de salas/personajes, chat,
  skills y conectores.
- **Autenticación**: Passport.js, estrategia de Google como la primera; arquitectura
  lista para sumar más proveedores (GitHub, Microsoft, email) sin reescribir nada.
- **Base de datos**: SQLite (`better-sqlite3`) en desarrollo; opción de Turso para
  producción/multi-dispositivo.
- **IA**: SDK oficial de Anthropic (`@anthropic-ai/sdk`) como proveedor por defecto;
  adaptadores opcionales para OpenAI y Google si un personaje concreto debe hablar
  con ese modelo.
- **Skills**: archivos Markdown con frontmatter, mismo espíritu que un `SKILL.md`.
- **Conectores**: Model Context Protocol (MCP), con SDK oficial de Node
  (`@modelcontextprotocol/sdk`). Prioriza reutilizar servidores MCP existentes
  (Google Drive, Gmail, etc.) antes de construir uno propio.

## Modelo de datos

Tablas implementadas (esquema real en `servidor/base-datos/migraciones.js`):

- `usuarios`: id, email, nombre, avatar_url, proveedor_auth, proveedor_id, rol,
  creado_en, ultimo_acceso_en
- `salas`: id, slug, nombre, descripcion, color_acento, icono, orden **+ geometría
  del plano** (`plano_x`, `plano_y`, `plano_ancho`, `plano_alto`)
- `personajes`: id, sala_id, nombre, rol_titulo, avatar_url, persona_prompt,
  proveedor_ia (`anthropic` | `openai` | `google` | `externo`), modelo,
  enlace_externo, estado, orden
- `sesiones`: almacén de sesión de Express sobre la misma base SQLite
- `conversaciones`: id, personaje_id, usuario_id, titulo, archivada, creado_en, actualizado_en
- `mensajes`: id, conversacion_id, rol (`user`|`assistant`|`system`), contenido,
  razonamiento, modelo, proveedor_ia, tokens_entrada, tokens_salida, error, creado_en

Tablas previstas para fases siguientes (todavía **no** creadas):

- `skills`: id, slug, nombre, descripcion, contenido_markdown, etiquetas
- `personaje_skills`: personaje_id, skill_id
- `conectores`: id, nombre, tipo (`mcp_server`), config_json, alcance (`global`|`por_personaje`)
- `personaje_conectores`: personaje_id, conector_id

## Sistema de salas

Cada sala es un departamento (los mismos de la v1). En vez de una simple grilla, la
sala vive dentro de un **plano interactivo tipo mapa** (SVG, zonas clicables). Al
hacer clic en una sala se abre su vista interior: la grilla de tarjetas de personajes
heredada de la v1 (avatar, nombre, rol, chip de departamento, acción de abrir/chatear).

## Sistema de personajes

Cada IA es un personaje con:

- **Identidad**: nombre, rol/título, sala/departamento.
- **Persona**: un `persona_prompt` — el system prompt que define su tono y forma de
  responder cuando ya tenga chat real (Fase 2).
- **Proveedor**: qué modelo lo mueve por debajo (Claude, GPT, Gemini) o si es una app
  externa sin API propia (como Jarvis), en cuyo caso solo se muestra como tarjeta con
  enlace.
- **Avatar**: por defecto, iniciales sobre color de departamento. Como mejora opcional
  y no bloqueante, existe un lenguaje gráfico propio de personajes originales (la
  serie de llaveros: Pingüino, Nova, Mimo, Axiom — gradientes radiales, luces
  especulares, biseles) que encajaría como dirección de arte para retratos
  vectoriales más adelante. El sistema solo necesita aceptar una imagen o SVG por
  personaje, con el fallback de iniciales.

## Autenticación

- Login con Google vía Passport.js (`passport-google-oauth20`). Sesión persistente
  (cookie + almacenamiento de sesión en la misma base SQLite).
- Arquitectura de proveedores desacoplada para poder añadir después GitHub, Microsoft
  o email/contraseña sin tocar el resto de la app.
- La v1 de este sistema asume un solo usuario; el modelo de datos ya está listo para
  roles (`admin` / `miembro`).

## Habilidades, skills y conectores

- **Habilidades** (capacidades base de un personaje): chat de texto, memoria de
  conversación persistente, y opcionalmente voz (TTS/STT) y visión, activables por
  personaje.
- **Skills** (comportamientos empaquetados y reutilizables): archivos Markdown con
  frontmatter (nombre, descripción, cuándo usarla) más instrucciones. Se guardan en el
  backend, se listan en una pantalla simple, y se asignan a uno o varios personajes;
  el backend inyecta las skills activas de un personaje en su contexto antes de
  responder.
- **Conectores** (acceso a servicios externos): cada conector es un servidor MCP. El
  backend actúa como cliente MCP y expone al personaje las herramientas de ese
  conector, con sus propios permisos OAuth.

## Requisitos previos (los hace el humano, no Claude Code)

1. Crear un proyecto en Google Cloud Console → pantalla de consentimiento OAuth →
   credenciales OAuth 2.0 tipo "Aplicación web" con su URI de redirección
   (`http://localhost:3000/auth/google/callback` en desarrollo).
2. Tener una API key de Anthropic (console.anthropic.com) para los personajes que usen
   Claude. *(Fase 2)*
3. API keys de OpenAI y/o Google AI si quieres personajes con otros modelos. *(Fase 2)*
4. Decidir dónde vive esto a mediano plazo (solo el PC vs. hosting ligero tipo
   Railway/Render) — afecta las URIs de redirección de Google.
5. Credenciales de cada servicio que quieras conectar como conector. *(Fase 4)*

## Hoja de ruta por fases

- **Fase 1 — Cimientos + oficina visual** *(hecha)*: scaffold (Express + frontend
  vanilla, estructura de carpetas, `.env.example`); login con Google y sesión
  persistente; SQLite con el esquema de usuarios/salas/personajes; plano interactivo
  de salas (SVG clicable) que lleva a la vista interior con las tarjetas de
  personajes; CRUD de salas y personajes desde la propia interfaz. Sin chat real
  todavía.
- **Fase 2 — Personajes con vida** *(hecha)*: integración con la API de Anthropic
  (SDK oficial, streaming) como proveedor por defecto y adaptadores por HTTP directo
  para OpenAI y Google; `persona_prompt` como system prompt; historial persistente por
  usuario y personaje, con hilos anteriores consultables; interfaz de chat con
  Markdown, razonamiento resumido y botón de detener.
- **Fase 3 — Skills**: formato de archivo (Markdown + frontmatter); pantalla para
  subir/editar skills; asignación a personajes; inyección en el contexto.
- **Fase 4 — Conectores (MCP)**: cliente MCP en el backend; reutilización de servidores
  MCP existentes; panel para conectar/desconectar conectores por personaje.
- **Fase 5 — Multiusuario, pulido y despliegue**: roles admin/miembro; proveedores de
  login adicionales; despliegue en hosting ligero + SQLite alojada (Turso); revisión
  de accesibilidad y rendimiento con el mismo estándar que la v1.

## Cómo está montado el chat (Fase 2)

- `servidor/ia/` tiene **un archivo por proveedor**, todos con la misma forma: un
  generador `conversar()` que va soltando `{tipo: 'texto'|'razonamiento'|'fin'}`. El
  resto del backend no sabe con quién habla. Añadir un proveedor es un archivo nuevo y
  una línea en `proveedores.js`.
- Anthropic usa el **SDK oficial** (`@anthropic-ai/sdk`) con `messages.stream()`,
  pensamiento adaptativo en modo resumido y `cache_control` sobre el prefijo de la
  conversación. OpenAI y Google van por HTTP directo contra su SSE: son cuarenta
  líneas cada uno y evitan sumar dos dependencias más.
- La respuesta viaja al navegador como **SSE** desde `POST /api/personajes/:id/mensajes`.
  El turno se guarda siempre: si el proveedor falla, si el modelo declina o si quien
  pregunta pulsa "Detener", queda registrado con su motivo en la columna `error`.
- Un turno con error **no se reenvía** como contexto en el turno siguiente.
- El Markdown de las respuestas se compone en `publico/js/markdown.js` a mano, con
  nodos del DOM. Es texto que no controlamos: nunca pasa por `innerHTML` y los
  enlaces se limitan a `http`/`https`.

## Convenciones de código

- Nombres de archivos, carpetas, funciones, variables, tablas y columnas **en
  español**. Los nombres de librerías externas se quedan como están.
- Sin frameworks de frontend. Sin build step: lo que está en `publico/` es lo que
  llega al navegador.
- Nada de `innerHTML` con datos del usuario. Todo se pinta con `textContent` o con el
  helper `elemento()` de `publico/js/dom.js`.
- Tokens de diseño en `publico/css/base.css`. No escribas colores en crudo dentro de
  los componentes: usa las variables CSS.
- Accesibilidad WCAG AA como mínimo en cada pantalla nueva: contraste, foco visible,
  navegación por teclado, `aria-*` donde haga falta, objetivos táctiles ≥ 44 px.
