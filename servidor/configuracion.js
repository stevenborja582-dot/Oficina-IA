/**
 * Carga y valida la configuración de entorno.
 * Un único punto de verdad: ningún otro archivo lee `process.env` directamente.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import 'dotenv/config';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const texto = (clave, porDefecto = '') => {
  const valor = process.env[clave];
  return valor === undefined || valor === null ? porDefecto : String(valor).trim();
};

const numero = (clave, porDefecto) => {
  const valor = Number.parseInt(texto(clave), 10);
  return Number.isFinite(valor) ? valor : porDefecto;
};

const booleano = (clave, porDefecto = false) => {
  const valor = texto(clave).toLowerCase();
  if (valor === '') return porDefecto;
  return valor === 'true' || valor === '1' || valor === 'si' || valor === 'sí';
};

const lista = (clave) =>
  texto(clave)
    .split(',')
    .map((entrada) => entrada.trim().toLowerCase())
    .filter(Boolean);

const entorno = texto('NODE_ENV', 'development');
const esProduccion = entorno === 'production';

const urlBase = texto('URL_BASE', `http://localhost:${numero('PUERTO', 3000)}`).replace(/\/+$/, '');

const rutaBdCruda = texto('RUTA_BD', './datos/oficina.sqlite');
const rutaBd = path.isAbsolute(rutaBdCruda) ? rutaBdCruda : path.join(RAIZ, rutaBdCruda);

const googleClientId = texto('GOOGLE_CLIENT_ID');
const googleClientSecret = texto('GOOGLE_CLIENT_SECRET');
const permitirDemo = booleano('AUTH_PERMITIR_DEMO', !esProduccion);

/** Secreto de sesión: obligatorio y largo en producción, tolerante en desarrollo. */
function resolverSecretoSesion() {
  const secreto = texto('SECRETO_SESION');
  if (esProduccion) {
    if (!secreto || secreto.length < 32 || secreto.startsWith('cambia-esto')) {
      throw new Error(
        'SECRETO_SESION es obligatorio en producción y debe tener al menos 32 caracteres aleatorios.\n' +
          'Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
      );
    }
    return secreto;
  }
  return secreto || 'secreto-de-desarrollo-no-usar-en-produccion';
}

export const configuracion = {
  entorno,
  esProduccion,
  puerto: numero('PUERTO', 3000),
  urlBase,
  rutaBd,
  secretoSesion: resolverSecretoSesion(),
  diasSesion: Math.max(1, numero('DIAS_SESION', 30)),
  google: {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    callbackUrl: `${urlBase}/auth/google/callback`,
    configurado: Boolean(googleClientId && googleClientSecret),
  },
  admins: lista('ADMINS'),
  correosPermitidos: lista('CORREOS_PERMITIDOS'),
  permitirDemo,
  rutaPublico: path.join(RAIZ, 'publico'),

  /**
   * Claves de los proveedores de IA. Viven solo aquí, en el servidor: el navegador
   * nunca las ve. Cada personaje elige su proveedor; si falta la clave, la interfaz
   * lo dice en vez de fallar a medio chat.
   */
  ia: {
    anthropic: {
      clave: texto('ANTHROPIC_API_KEY'),
      // Modelo por defecto cuando el personaje no especifica uno.
      modeloPorDefecto: texto('MODELO_ANTHROPIC', 'claude-opus-5'),
      // Solo se toca para apuntar a una pasarela propia o a un servidor de pruebas.
      urlBase: texto('ANTHROPIC_URL_BASE'),
    },
    openai: {
      clave: texto('OPENAI_API_KEY'),
      modeloPorDefecto: texto('MODELO_OPENAI'),
      urlBase: texto('OPENAI_URL_BASE', 'https://api.openai.com/v1'),
    },
    google: {
      clave: texto('GOOGLE_AI_API_KEY'),
      modeloPorDefecto: texto('MODELO_GOOGLE'),
      urlBase: texto('GOOGLE_AI_URL_BASE', 'https://generativelanguage.googleapis.com/v1beta'),
    },
    // Techo de tokens de salida por respuesta. Es un límite, no un objetivo:
    // solo se paga lo que se genera.
    maximoTokens: Math.max(256, numero('IA_MAXIMO_TOKENS', 32000)),
    // Cuántos mensajes previos se reenvían como contexto.
    mensajesDeContexto: Math.max(2, numero('IA_MENSAJES_CONTEXTO', 40)),
  },
};

/** Comprobaciones que deben hacer fallar el arranque antes de escuchar en el puerto. */
export function validarConfiguracion() {
  const avisos = [];

  if (configuracion.esProduccion && configuracion.permitirDemo) {
    throw new Error(
      'AUTH_PERMITIR_DEMO=true con NODE_ENV=production. El login de demo es una puerta abierta: ' +
        'ponlo en false antes de desplegar.',
    );
  }

  if (configuracion.esProduccion && !configuracion.urlBase.startsWith('https://')) {
    throw new Error('En producción URL_BASE debe usar https:// (la cookie de sesión viaja como Secure).');
  }

  if (!configuracion.google.configurado) {
    if (configuracion.esProduccion) {
      throw new Error('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET: sin ellos no hay forma de entrar.');
    }
    avisos.push(
      'Google OAuth sin configurar (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET vacíos).' +
        (configuracion.permitirDemo
          ? ' Puedes entrar con el botón "Entrar en modo demo".'
          : ' Nadie podrá iniciar sesión hasta que los rellenes.'),
    );
  }

  const carpetaBd = path.dirname(configuracion.rutaBd);
  if (!fs.existsSync(carpetaBd)) fs.mkdirSync(carpetaBd, { recursive: true });

  return avisos;
}
