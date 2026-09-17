# Oficina Black Hole v2 — Prompt maestro

> Este archivo es el contexto permanente del proyecto. Claude Code lo lee al abrir
> cada sesión, así que no hace falta volver a explicar el proyecto desde cero.

---

## Estado actual del repositorio

| Fase | Alcance | Estado |
| --- | --- | --- |
| **Fase 1** | Cimientos + oficina visual (login Google, SQLite, plano SVG, CRUD de salas y personajes) | ✅ **Implementada** |
| **Fase 2** | Personajes con vida (chat real en streaming, historial, un adaptador por proveedor) | ✅ **Implementada** |
| **Fase 3** | Skills (Markdown + frontmatter, asignación por personaje, revelación progresiva en contexto) | ✅ **Implementada** |
| **Fase 4** | Conectores MCP (cliente en el backend, asignación y lista blanca por personaje) | ✅ **Implementada** |
| **Fase 5** | Multiusuario y despliegue (roles, invitaciones, login con GitHub, configuración de hosting) | ✅ **Implementada** |
| **Fase 6** | La oficina viva (salas animadas, especialidad y app por personaje, misiones en equipo) | ✅ **Implementada** |

> La hoja de ruta original (1–5) está completa. La Fase 6 es lo que vino después:
> la oficina deja de ser un panel y pasa a ser un sitio donde ves trabajar a tu equipo.

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

- `conectores`: id, slug, nombre, descripcion, transporte (`stdio`|`http`), comando,
  argumentos, url, variables, cabeceras, herramientas, estado, ultimo_error,
  probado_en, creado_en, actualizado_en
- `personaje_conectores`: personaje_id, conector_id, herramientas (lista blanca; vacía
  = todas las que publique el conector)
- `usuarios.estado` (`activo` | `suspendido`) — suspender cierra la puerta sin borrar
  el historial
- `invitaciones`: id, email, rol, creada_por, creada_en, usada_en

- `skills`: id, slug, nombre, descripcion, cuando_usarla, etiquetas, **fuente** (el
  archivo entero con su frontmatter, que es lo que se edita), **cuerpo** (solo las
  instrucciones, que es lo que se le da al modelo), activa, creado_en, actualizado_en
- `personaje_skills`: personaje_id, skill_id

- `personajes.especialidad` (en qué es bueno), `personajes.app` (con qué trabaja) y
  `personajes.rango` (`secretario` | `manager` | `especialista`) — los tres campos que
  mira el coordinador al repartir una misión
- `misiones`: id, usuario_id, sala_id, coordinador_id, orden, titulo, estado
  (`repartiendo` | `trabajando` | `resumiendo` | `lista` | `error` | `detenida`),
  resultado, error, creado_en, actualizado_en
- `mision_pasos`: id, mision_id, personaje_id, orden, encargo, estado, resultado,
  error, modelo, tokens_entrada, tokens_salida, creado_en, terminado_en

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

- Login con Google (`passport-google-oauth20`) y GitHub (`passport-github2`) vía
  Passport.js. Sesión persistente (cookie + almacenamiento de sesión en la misma base
  SQLite). Los dos desembocan en `admitir()` → `registrarAcceso()`: añadir Microsoft o
  email/contraseña es un `perfilXAUsuario`, una estrategia y un par de rutas.
- Roles `admin` / `miembro` en vigor. **El primero que entra siempre es admin** — si
  no, la oficina nacería sin nadie que pudiera invitar.
- Tres puertas de acceso, y basta con una: `CORREOS_PERMITIDOS` (correos o dominios),
  una invitación creada en la pantalla Equipo, o que no haya restricción configurada.
- **La oficina nunca se queda sin ningún administrador activo.** Ni degradando, ni
  suspendiendo, ni borrando al último: las tres se cierran en el repositorio, no solo
  en la interfaz. Y nadie se cambia a sí mismo.

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
- **Fase 3 — Skills** *(hecha)*: formato de archivo (Markdown + frontmatter) con
  analizador propio; pantalla para escribir, buscar, apagar y borrar skills;
  asignación por personaje desde su ficha; y revelación progresiva en el contexto —
  índice siempre, instrucciones a petición.
- **Fase 4 — Conectores (MCP)** *(hecha)*: cliente MCP en el backend con pool de
  conexiones y alarmas; conectores por proceso (stdio) o remotos (HTTP); pantalla de
  alta y prueba contra el servidor real; asignación por personaje con lista blanca de
  herramientas; bucle agéntico en el adaptador de Anthropic.
- **Fase 5 — Multiusuario y despliegue** *(hecha)*: roles admin/miembro en vigor;
  pantalla de Equipo con invitaciones, suspensión y baja; login con GitHub;
  limitador de peticiones; apagado ordenado; configuración de Render y Fly.io con
  disco persistente. **Turso se evaluó y se descartó por ahora** — ver el porqué en
  `README.md`, §Sobre Turso.

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

## Cómo están montadas las skills (Fase 3)

- Una skill es **Markdown con frontmatter**, como un `SKILL.md`. El archivo entero se
  guarda en `fuente` —es lo que se edita— y la cabecera analizada va en columnas
  sueltas para poder listar y buscar sin releer el Markdown en cada petición.
- El analizador (`servidor/utilidades/frontmatter.js`) es un **subconjunto de YAML**
  escrito a mano: pares de una línea, listas con comas o con guiones, y bloques con
  `|`. Traer un YAML entero para esto serían cien kilobytes y una superficie de
  ataque que no hace falta. Las claves se normalizan: `cuando-usarla`,
  `cuando_usarla` y `Cuando Usarla` son la misma.
- **Revelación progresiva, no volcado.** En el system prompt va siempre el *índice*
  —nombre, para qué sirve, cuándo sacarla—, y las instrucciones se piden con la
  herramienta `abrir_skill`. Meterlas enteras funciona con dos skills; con diez se
  come el contexto y el modelo pierde de vista lo que importa.
- Con un proveedor que **no sabe usar herramientas** (OpenAI y Google aquí) el modelo
  no puede pedir nada: ahí entran enteras hasta un techo de caracteres, y lo que no
  cabe se le dice por su nombre. Peor, pero honesto.
- El `slug` **no cambia al editar**: es lo que el modelo tiene en la mano dentro de
  una conversación en vuelo, igual que con los conectores.
- Una skill **apagada** sigue asignada pero no entra en contexto. El chat la enseña en
  gris: es la explicación de por qué el personaje no hace lo que se espera de él.
- Leerlas puede cualquiera; escribirlas es de administradores. Una skill entra en el
  system prompt de quien la lleve, así que quien la edita decide cómo responde.

## Cómo están montados los conectores (Fase 4)

- Un conector es un **servidor MCP**. `servidor/mcp/cliente.js` mantiene un pool de
  conexiones vivas por conector, con alarma de tiempo, cierre por inactividad y
  recorte del resultado antes de que entre en el contexto del modelo.
- Los nombres de herramienta que ve el modelo son `slug__herramienta`. El slug **no
  cambia al renombrar** el conector: una conversación en vuelo no se puede romper a
  mitad porque alguien edite un nombre.
- Los secretos (`variables`, `cabeceras`) **no viajan al navegador**: solo los nombres
  de las claves. Al editar, un campo vacío significa "deja los de antes".
- Un conector de tipo proceso **ejecuta código**. Por eso su alta es solo de
  administradores y en producción viene apagado (`MCP_PERMITIR_STDIO`). El entorno del
  proceso se acota a `PATH` más las variables del propio conector.
- Solo Anthropic sabe usar herramientas hoy (`admiteHerramientas: true`); el bucle
  agéntico vive en su adaptador. Los demás proveedores conversan y ya está.
- Una herramienta que falla vuelve al modelo como `is_error`, nunca como excepción: el
  hilo no se rompe y el chat lo enseña como un paso plegable.

## Cómo está montado el equipo (Fase 5)

- `servidor/rutas/equipo.js` es todo de administradores. Dos reglas que hace cumplir
  el repositorio, no la interfaz: **la oficina nunca se queda sin ningún
  administrador activo**, y **nadie se cambia a sí mismo** (para eso está otro admin).
- **Suspender no es borrar.** Suspender cierra la puerta y conserva el historial; al
  rechazar al usuario, `deserializeUser` vacía su sesión, así que la cookie que ya
  tenía deja de valer en la siguiente petición. Borrar se lleva también sus
  conversaciones: son suyas, no del personaje.
- El limitador de peticiones (`middlewares/limite-peticiones.js`) es una ventana
  deslizante **en memoria**, apagada en desarrollo. Con varias instancias cada una
  contaría por su cuenta; para eso haría falta Redis, y esto no lo justifica.
- El despliegue asume **una sola instancia** con disco persistente. SQLite es un
  archivo: dos máquinas escribiendo el mismo volumen se corrompen entre sí.

## Cómo está montada la oficina viva (Fase 6)

- **La sala se dibuja con DOM y transformaciones CSS, no con canvas.** Tres razones
  concretas: cada personaje es un `<button>` de verdad —se alcanza con el tabulador
  y se pulsa—, los nombres son texto que un lector de pantalla sabe leer, y los
  colores salen de las mismas variables, así que el tema oscuro sale gratis.
- Las coordenadas viven en un **lienzo lógico de 1000 × 620** escalado con
  `container-type`. El JS nunca toca píxeles reales: una sala se ve igual en un
  portátil y en un móvil.
- Cada personaje tiene su escritorio. Cuando no hay nada que hacer pasea; si se
  cruza con otro, a veces se dicen algo. **Volver al escritorio estando ya en él no
  cuenta como destino**: sería quedarse un ciclo entero quieto y la sala parecería
  congelada.
- Con `prefers-reduced-motion` no hay bucle de animación: cada uno se coloca donde
  le toca y se queda ahí. La información es la misma; el movimiento no.
- **Una misión mueve a la gente de verdad.** Mientras se reparte, los implicados se
  juntan en la mesa; cuando empiezan, cada uno vuelve a su escritorio con la
  insignia de su app; al terminar, se sueltan. Lo que se anima es el estado real de
  cada paso, no una coreografía guionizada.
- Las iniciales van en blanco sobre la cabeza, así que **la cabeza se oscurece con
  `tintaLegible(color, { fondo: '#ffffff' })`** hasta que el blanco llega a 4.5:1.
  Con el verde de Asistencia o el ámbar de Automatización en crudo se quedaban en
  3:1. Lo mismo con el rótulo de la pizarra, que se calcula contra el fondo teñido
  de la pizarra y no contra el lienzo.

## Cómo funciona una misión (Fase 6)

- Una misión es una orden tuya ejecutada por varios personajes. Tres tiempos, los
  tres con llamadas reales al modelo: **reparto**, **trabajo** y **síntesis**.
- Coordina el **secretario**; si no hay, el **manager**; si tampoco, el primer
  especialista que pueda hablar. Alguien tiene que repartir, y es mejor eso que
  negarse.
- El coordinador ve la plantilla con nombre, especialidad, app y sala, y devuelve
  JSON con quién hace qué. **Un plan que nombre a alguien que no existe se corrige
  ahí**, no se le pasa al paso siguiente.
- Los pasos van **en paralelo**: son independientes, y en serie una misión de cinco
  tardaría cinco veces más sin ganar nada.
- Un paso que falla **se cuenta, no rompe la misión**: la síntesis lo ve y lo dice.
- **Cerrar la pestaña no aborta la misión.** El trabajo ya está pagado y en marcha;
  tirarlo porque el navegador se fue sería desperdiciarlo. Se recoge al volver. Lo
  que sí la corta es el botón de detener.
- Una misión a medias no sobrevive a un reinicio: `cerrarHuerfanas()` la marca al
  arrancar para que la interfaz no la enseñe girando para siempre.
- Al cruzar la frontera con los adaptadores hay que hablar en `{ role, content }`,
  como la API. El resto del backend usa español; ese punto no.

## Accesibilidad y rendimiento: lo que hay que respetar

- `tintaLegible()` acepta el fondo contra el que se va a leer. Un chip o un avatar
  tiñen su propio fondo con el color de la sala (10 % y 16 %), así que se les pasa
  `variablesSala(color, { tinte })`. Calcularlo contra el lienzo deja los textos en
  4.1–4.5:1 — por debajo de AA, y sin que se note a ojo.
- **44 px de objetivo táctil en móvil**, incluidos los que pierden su etiqueta al
  encogerse: un botón con solo icono sigue necesitando sus 44 de ancho.
- La jerarquía de encabezados no salta niveles. Entre el `h1` de la pantalla y el `h3`
  de una tarjeta va un `h2` del grupo: visible si aporta, `.solo-lectores` si sería ruido.
- Ningún control se queda sin nombre accesible. Un `placeholder` no lo es: desaparece
  al escribir.
- **El chat no se comprime.** El filtro de `compression` deja fuera `text/event-stream`
  a propósito; comprimirlo haría que la respuesta llegue a golpes en vez de palabra a
  palabra. Hay una prueba que lo vigila.
- El `modulepreload` de `index.html` y `entrar.html` se calcula a partir del grafo de
  imports: si añades un módulo al arranque, añade también su enlace.

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
