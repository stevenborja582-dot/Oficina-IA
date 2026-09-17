/** Pantalla de entrada: decide qué botones tienen sentido según el backend. */
import { aplicarTemaInicial } from './tema.js';
import { elemento, reemplazar } from './dom.js';

aplicarTemaInicial();

const MENSAJES_ERROR = {
  google: 'Google rechazó el acceso o la cuenta no está autorizada.',
  github: 'GitHub rechazó el acceso o la cuenta no está autorizada.',
  sesion: 'Tu sesión caducó. Vuelve a entrar.',
};

const aviso = document.getElementById('aviso');
const botonGoogle = document.getElementById('entrar-google');
const botonGitHub = document.getElementById('entrar-github');
const botonDemo = document.getElementById('entrar-demo');
const separador = document.getElementById('separador-demo');

function mostrarAviso(contenido, { error = false } = {}) {
  aviso.classList.toggle('acceso__aviso--error', error);
  reemplazar(aviso, contenido);
  aviso.hidden = false;
}

async function iniciar() {
  // El código de error viaja en la URL, pero el texto sale de este diccionario:
  // nunca se pinta en pantalla lo que venga escrito en la barra de direcciones.
  const codigo = new URLSearchParams(window.location.search).get('error');
  if (codigo && MENSAJES_ERROR[codigo]) {
    mostrarAviso(MENSAJES_ERROR[codigo], { error: true });
    // El servidor sabe por qué falló —suspendido, fuera de la lista— y lo dice
    // mejor que un mensaje genérico. Es texto nuestro, no de la barra de direcciones.
    try {
      const { motivo } = await (await fetch('/auth/motivo', { headers: { Accept: 'application/json' } })).json();
      if (motivo) mostrarAviso(motivo, { error: true });
    } catch {
      // Sin motivo concreto nos quedamos con el mensaje del diccionario.
    }
  }

  let estado;
  try {
    estado = await (await fetch('/auth/estado', { headers: { Accept: 'application/json' } })).json();
  } catch {
    mostrarAviso('No se pudo hablar con el servidor. ¿Está arrancado con npm run dev?', { error: true });
    return;
  }

  if (estado.autenticado) {
    window.location.assign('/');
    return;
  }

  const conProveedor = estado.proveedores.google || estado.proveedores.github;
  botonGoogle.hidden = !estado.proveedores.google;
  botonGitHub.hidden = !estado.proveedores.github;
  botonDemo.hidden = !estado.proveedores.demo;
  separador.hidden = !(conProveedor && estado.proveedores.demo);

  if (!conProveedor && !codigo) {
    mostrarAviso(
      elemento('span', {}, [
        'Todavía no hay ningún proveedor de acceso configurado. Rellena ',
        elemento('code', { texto: 'GOOGLE_CLIENT_ID' }),
        '/',
        elemento('code', { texto: 'GOOGLE_CLIENT_SECRET' }),
        ' o ',
        elemento('code', { texto: 'GITHUB_CLIENT_ID' }),
        '/',
        elemento('code', { texto: 'GITHUB_CLIENT_SECRET' }),
        ' en tu archivo .env y reinicia el servidor.',
      ]),
    );
  } else if (!codigo) {
    aviso.hidden = true;
  }

  botonDemo.addEventListener('click', async () => {
    botonDemo.disabled = true;
    botonDemo.textContent = 'Entrando…';
    try {
      const respuesta = await fetch('/auth/demo', {
        method: 'POST',
        headers: { Accept: 'application/json', 'X-Peticion-Oficina': '1' },
      });
      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => ({}));
        throw new Error(datos.error || 'El modo demo está desactivado en el servidor.');
      }
      window.location.assign('/');
    } catch (error) {
      botonDemo.disabled = false;
      botonDemo.textContent = 'Entrar en modo demo';
      mostrarAviso(error.message, { error: true });
    }
  });
}

iniciar();
