// Router por hash. Cada vista recibe el contenedor y los parámetros de la ruta.
import { S, cargarBase, cargarSesion, tiempoReal, toast, errMsg, inicioRol, sb } from './core.js';
import { vistaPublica, vistaTV } from './publico.js';
import { vistaLogin } from './login.js';
import { vistaJugador } from './jugador.js';
import { vistaArbitro } from './arbitro.js';
import { vistaAdmin } from './admin.js';
import { vistaEquipos, vistaEquipo } from './equipos.js';
import { vistaCancha, vistaPlanilla } from './planilla.js';

const app = document.getElementById('app');

// Rutas: [patrón, vista, roles permitidos (vacío = pública)]
const RUTAS = [
  [/^#\/?$/, vistaPublica, []],
  [/^#\/tv$/, vistaTV, []],
  [/^#\/login$/, vistaLogin, []],
  [/^#\/yo$/, vistaJugador, []],
  [/^#\/arbitro\/([\w-]+)$/, vistaArbitro, []],
  [/^#\/admin(?:\/(\w+))?$/, vistaAdmin, ['admin']],
  [/^#\/equipos$/, vistaEquipos, ['admin', 'sindical', 'dt']],
  [/^#\/equipo\/([\w-]+)$/, vistaEquipo, ['admin', 'sindical', 'dt']],
  [/^#\/cancha$/, vistaCancha, ['admin', 'resp_cancha']],
  [/^#\/planilla\/([\w-]+)$/, vistaPlanilla, ['admin', 'resp_cancha']],
];

let vistaActual = null;
async function navegar() {
  const h = location.hash || '#/';
  const r = RUTAS.find(([re]) => re.test(h));
  if (!r) { location.hash = '#/'; return; }
  const [re, vista, roles] = r;
  if (roles.length) {
    if (!S.perfil) { location.hash = '#/login'; return; }
    if (!roles.includes(S.perfil.rol)) { location.hash = inicioRol(S.perfil.rol); return; }
  }
  const params = h.match(re).slice(1);
  vistaActual = () => vista(app, ...params);
  window.scrollTo(0, 0);
  try { await vistaActual(); }
  catch (e) { app.innerHTML = `<div class="wrap"><div class="card"><h3>No se pudo cargar</h3><p>${errMsg(e)}</p><a class="btn" href="#/">Volver</a></div></div>`; }
}

/** Redibuja la vista actual sin perder la posición (cambios en tiempo real). */
export function refrescar() {
  if (document.querySelector('.modal-bg')) return; // no interrumpir un formulario abierto
  const y = window.scrollY;
  if (vistaActual) Promise.resolve(vistaActual()).then(() => window.scrollTo(0, y)).catch(() => {});
}
window.__refrescar = refrescar;

async function iniciar() {
  try {
    await Promise.all([cargarBase(), cargarSesion()]);
  } catch (e) {
    toast(errMsg(e), 'error');
  }
  sb.auth.onAuthStateChange(async (ev) => {
    if (ev === 'SIGNED_OUT' || ev === 'SIGNED_IN') await cargarSesion();
  });
  tiempoReal(refrescar);
  window.addEventListener('hashchange', navegar);
  window.addEventListener('online', () => toast('Volvió la conexión', 'ok'));
  await navegar();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
iniciar();
