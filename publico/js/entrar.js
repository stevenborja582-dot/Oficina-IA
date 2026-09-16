/** Pantalla de entrada: decide qué botones tienen sentido según el backend. */
import { aplicarTemaInicial } from './tema.js';
import { elemento, reemplazar } from './dom.js';

aplicarTemaInicial();

const MENSAJES_ERROR = {
  google: 'Google rechazó el acceso o la cuenta no está autorizada. Revisa ADMINS y CORREOS_PERMITIDOS en tu .env.',
  sesion: 'Tu sesión caducó. Vuelve a entrar.',
};

const aviso = document.getElementById('aviso');
const botonGoogle = document.getElementById('entrar-google');
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

  botonGoogle.hidden = !estado.proveedores.google;
  botonDemo.hidden = !estado.proveedores.demo;
  separador.hidden = !(estado.proveedores.google && estado.proveedores.demo);

  if (!estado.proveedores.google && !codigo) {
    mostrarAviso(
      elemento('span', {}, [
        'Google OAuth todavía no está configurado. Rellena ',
        elemento('code', { texto: 'GOOGLE_CLIENT_ID' }),
        ' y ',
        elemento('code', { texto: 'GOOGLE_CLIENT_SECRET' }),
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
      if (!respuesta.ok) throw new Error('El modo demo está desactivado en el servidor.');
      window.location.assign('/');
    } catch (error) {
      botonDemo.disabled = false;
      botonDemo.textContent = 'Entrar en modo demo';
      mostrarAviso(error.message, { error: true });
    }
  });
}

iniciar();
