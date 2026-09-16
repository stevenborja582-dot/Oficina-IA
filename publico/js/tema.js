/** Conmutador de tema. Respeta el sistema hasta que el usuario decide otra cosa. */
import { icono } from './iconos.js';
import { reemplazar } from './dom.js';

const CLAVE = 'oficina.tema';
const oyentes = new Set();

export function temaGuardado() {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function aplicarTemaInicial() {
  const guardado = temaGuardado();
  if (guardado === 'claro' || guardado === 'oscuro') {
    document.documentElement.dataset.tema = guardado;
  } else {
    delete document.documentElement.dataset.tema;
  }
}

function esOscuroAhora() {
  const tema = document.documentElement.dataset.tema;
  if (tema) return tema === 'oscuro';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function alCambiarTema(oyente) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/** Conecta un botón ya existente al conmutador. */
export function conectarBotonTema(boton) {
  const pintar = () => {
    const oscuro = esOscuroAhora();
    reemplazar(boton, icono(oscuro ? 'sol' : 'luna'));
    boton.setAttribute('aria-label', oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    boton.setAttribute('title', oscuro ? 'Tema claro' : 'Tema oscuro');
  };

  boton.addEventListener('click', () => {
    const siguiente = esOscuroAhora() ? 'claro' : 'oscuro';
    document.documentElement.dataset.tema = siguiente;
    try {
      localStorage.setItem(CLAVE, siguiente);
    } catch {
      // Navegación privada: el tema durará solo esta sesión.
    }
    pintar();
    oyentes.forEach((oyente) => oyente(siguiente));
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!document.documentElement.dataset.tema) {
      pintar();
      oyentes.forEach((oyente) => oyente('auto'));
    }
  });

  pintar();
}
