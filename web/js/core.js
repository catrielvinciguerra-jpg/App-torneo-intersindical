// Núcleo: cliente Supabase, estado compartido, utilidades de interfaz y router.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

/** Estado del torneo activo. Se recarga entero ante cualquier cambio (tamaño chico: un torneo de un día). */
export const S = {
  torneo: null, torneos: [], categorias: [], canchas: [], sindicatos: [], equipos: [], zonas: [], partidos: [],
  user: null, perfil: null,
};

export const ROLES = { admin: 'Organización', resp_cancha: 'Responsable de cancha', sindical: 'Responsable sindical', dt: 'DT' };
export const ESTADO_LISTA = {
  borrador: ['Borrador', 'b-gris'], enviada: ['Enviada', 'b-info'], observada: ['Observada', 'b-warn'], validada: ['Validada', 'b-ok'],
};
export const FASES = { zona: 'Zona', octavos: 'Octavos', cuartos: 'Cuartos', semi: 'Semifinal', tercero: '3er puesto', final: 'Final' };

// ───────── utilidades ─────────
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const uuid = () => crypto.randomUUID();
export function errMsg(e) {
  const m = e?.message || e?.error_description || e?.error || String(e);
  if (/JWT|session/i.test(m)) return 'Tu sesión venció. Volvé a ingresar.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexión. Probá de nuevo cuando vuelva la señal.';
  if (/duplicate key.*equipos_torneo_id_nombre/i.test(m)) return 'Ya existe un equipo con ese nombre.';
  if (/duplicate key.*sindicatos_nombre/i.test(m)) return 'Ya existe ese sindicato.';
  if (/violates foreign key/i.test(m)) return 'No se puede: hay datos que dependen de este registro.';
  return m;
}
/** Ejecuta una consulta Supabase y lanza error legible. */
export async function q(p) {
  const { data, error } = await p;
  if (error) throw new Error(errMsg(error));
  return data;
}

export function toast(msg, tipo = '') {
  let box = $('#toast');
  if (!box) { box = document.createElement('div'); box.id = 'toast'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), tipo === 'error' ? 5000 : 2600);
}

/** Modal simple. Devuelve { el, close }. */
export function modal(html, { onClose } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog"><button class="x" aria-label="Cerrar">×</button>${html}</div>`;
  document.body.append(bg);
  document.body.style.overflow = 'hidden';
  const close = () => { bg.remove(); document.body.style.overflow = ''; onClose && onClose(); };
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  $('.x', bg).onclick = close;
  return { el: $('.modal', bg), close };
}
export function confirmar(msg, ok = 'Confirmar', tipo = '') {
  return new Promise(res => {
    const m = modal(`<h3>${esc(msg)}</h3><div class="row" style="margin-top:16px;justify-content:flex-end">
      <button class="btn sec" data-r="0">Cancelar</button><button class="btn ${tipo}" data-r="1">${esc(ok)}</button></div>`,
      { onClose: () => res(false) });
    $$('[data-r]', m.el).forEach(b => b.onclick = () => { res(b.dataset.r === '1'); m.close(); });
  });
}
/** Botón con estado "cargando" mientras corre la acción. */
export async function conBoton(btn, fn) {
  if (btn.disabled) return;
  // Solo los botones muestran "…": en selects e inputs se perdería el valor elegido.
  const esBoton = btn.tagName === 'BUTTON' || btn.tagName === 'A';
  const txt = btn.innerHTML;
  btn.disabled = true; if (esBoton) btn.innerHTML = '…';
  try { return await fn(); }
  catch (e) { toast(errMsg(e), 'error'); }
  finally { btn.disabled = false; if (esBoton) btn.innerHTML = txt; }
}
/** Lee un formulario como objeto. Checkbox → boolean. */
export function formData(form) {
  const o = {};
  $$('input,select,textarea', form).forEach(i => {
    if (!i.name) return;
    o[i.name] = i.type === 'checkbox' ? i.checked : i.value.trim();
  });
  return o;
}

// ───────── fechas ─────────
const TZ = 'America/Argentina/Buenos_Aires';
export function fmtHora(ts) { return ts ? new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }) : '--:--'; }
export function fmtFecha(d) {
  if (!d) return 'Fecha a definir';
  const x = typeof d === 'string' && d.length === 10 ? new Date(d + 'T12:00:00') : new Date(d);
  return x.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
}
/** Fecha base del torneo (YYYY-MM-DD). Sin fecha cargada: hoy. */
export function fechaTorneo() {
  return S.torneo?.fecha || new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
}
/** "HH:MM" del día del torneo → Date (hora argentina, UTC-3 sin horario de verano). */
export function aFecha(hhmm) { return new Date(`${fechaTorneo()}T${hhmm.slice(0, 5)}:00-03:00`); }
export function hhmm(date) { return fmtHora(date); }
export function edad(nac, ref) {
  if (!nac) return null;
  const n = new Date(nac + 'T12:00:00'), r = new Date((ref || fechaTorneo()) + 'T12:00:00');
  let e = r.getFullYear() - n.getFullYear();
  if (r.getMonth() < n.getMonth() || (r.getMonth() === n.getMonth() && r.getDate() < n.getDate())) e--;
  return e;
}

// ───────── reglas de negocio ─────────
/** Estado del apto médico respecto del día del torneo. */
export function apto(d) {
  if (!d || (!d.apto_presentado && !d.apto_vence)) return { k: 'falta', txt: 'Falta apto', cls: 'error' };
  if (d.apto_vence && d.apto_vence < fechaTorneo()) return { k: 'vencido', txt: 'Apto vencido', cls: 'error' };
  if (!d.apto_vence) return { k: 'vigente', txt: 'Apto presentado', cls: 'ok' };
  const dias = (new Date(d.apto_vence) - new Date(fechaTorneo())) / 864e5;
  return dias < 30 ? { k: 'vigente', txt: 'Vence pronto', cls: 'warn' } : { k: 'vigente', txt: 'Apto vigente', cls: 'ok' };
}
/** ¿El jugador cumple la edad de la categoría? null si falta fecha de nacimiento. */
export function edadOk(d, cat) {
  const e = edad(d?.fecha_nac);
  if (e == null) return null;
  if (cat?.edad_min && e < cat.edad_min) return false;
  if (cat?.edad_max && e > cat.edad_max) return false;
  return true;
}
export const eq = id => S.equipos.find(e => e.id === id);
export const cancha = id => S.canchas.find(c => c.id === id);
export const sindicato = id => S.sindicatos.find(s => s.id === id);
export const categoria = id => S.categorias.find(c => c.id === id);
export const zona = id => S.zonas.find(z => z.id === id);

/** Etiqueta de un lado del partido: nombre del equipo o su origen en la llave. */
export function lado(p, l) {
  const id = l === 'l' ? p.local_id : p.visitante_id;
  if (id) return eq(id)?.nombre || '—';
  const ref = l === 'l' ? p.ref_l : p.ref_v;
  if (!ref) return 'A definir';
  const [t, a, b] = ref.split(':');
  if (t === 'Z') return `${b}° ${zona(a)?.nombre || 'Zona'}`;
  const o = S.partidos.find(x => x.id === a);
  const n = o ? (FASES[o.fase] + (o.orden_llave ? ' ' + o.orden_llave : '')) : 'llave';
  return (t === 'G' ? 'Ganador ' : 'Perdedor ') + n;
}
export function resultado(p) {
  if (p.estado === 'programado' || p.goles_l == null) return fmtHora(p.inicio);
  let r = `${p.goles_l} - ${p.goles_v}`;
  if (p.penales_l != null) r += ` <small>(${p.penales_l}-${p.penales_v})</small>`;
  return r;
}

/** Tabla de posiciones calculada desde v_tabla con las reglas del torneo. */
export function ordenarTabla(filas) {
  const t = S.torneo || {};
  return filas.map(f => ({
    ...f,
    pts: f.pg * (t.pts_ganado ?? 3) + f.pe * (t.pts_empate ?? 1),
    dif: f.gf - f.gc,
    fp: f.amarillas * (t.fp_amarilla ?? 1) + f.rojas * (t.fp_roja ?? 3),
  })).sort((a, b) => b.pts - a.pts || b.dif - a.dif || b.gf - a.gf || a.fp - b.fp || a.nombre.localeCompare(b.nombre));
}

// ───────── contacto ─────────
/** Normaliza un celular argentino a formato internacional para wa.me. */
export function telWa(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) { d = d.slice(2); if (d.startsWith('9')) d = d.slice(1); }
  if (d.startsWith('0')) d = d.slice(1);
  d = d.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2'); // 011 15 xxxx → 11 xxxx
  return '549' + d;
}
export function waLink(tel, texto) {
  const t = telWa(tel);
  return t ? `https://wa.me/${t}?text=${encodeURIComponent(texto || '')}` : '';
}
export function waBtn(tel, texto, label = 'WhatsApp') {
  const l = waLink(tel, texto);
  return l ? `<a class="btn wa sm" target="_blank" rel="noopener" href="${esc(l)}">${label}</a>` : '';
}
export function mailBtn(mail, asunto = '', cuerpo = '') {
  return mail ? `<a class="btn sec sm" href="mailto:${esc(mail)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}">Mail</a>` : '';
}

/** Archivo .ics con alarma: recordatorio nativo del celular sin depender de notificaciones push. */
export function descargarIcs(eventos, nombre = 'partidos') {
  const f = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dur = (S.torneo?.duracion_min || 20) * 60000;
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Torneo CGT//ES'];
  eventos.filter(e => e.inicio).forEach(e => {
    lineas.push('BEGIN:VEVENT', `UID:${e.id}@torneo-cgt`, `DTSTAMP:${f(Date.now())}`, `DTSTART:${f(e.inicio)}`,
      `DTEND:${f(new Date(e.inicio).getTime() + dur)}`, `SUMMARY:${e.titulo}`, `LOCATION:${e.lugar || ''}`,
      'BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', `DESCRIPTION:${e.titulo}`, 'END:VALARM', 'END:VEVENT');
  });
  lineas.push('END:VCALENDAR');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lineas.join('\r\n')], { type: 'text/calendar' }));
  a.download = nombre + '.ics';
  a.click();
}

// ───────── librerías bajo demanda ─────────
const cargadas = {};
export function script(src) {
  return cargadas[src] ||= new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar una librería. Revisá la conexión.'));
    document.head.append(s);
  });
}
/** Exporta un bloque de la pantalla como imagen PNG para compartir. */
export async function exportarImagen(el, nombre) {
  await script('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  const ocultos = $$('.no-export', el); ocultos.forEach(x => x.style.visibility = 'hidden');
  const canvas = await window.html2canvas(el, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
  ocultos.forEach(x => x.style.visibility = '');
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = (nombre || 'torneo-cgt') + '.png';
  a.click();
}
export async function qrSvg(texto) {
  await script('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js');
  const qr = window.qrcode(0, 'M');
  qr.addData(texto); qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

// ───────── datos ─────────
export async function cargarBase() {
  const torneos = await q(sb.from('torneos').select('*').order('created_at'));
  S.torneos = torneos;
  S.torneo = torneos.find(t => t.activo) || torneos[torneos.length - 1] || null;
  if (!S.torneo) return;
  const tid = S.torneo.id;
  const [cat, can, sin, eqs, zon, par] = await Promise.all([
    q(sb.from('categorias').select('*').eq('torneo_id', tid).order('orden')),
    q(sb.from('canchas').select('*').eq('torneo_id', tid).order('orden')),
    q(sb.from('sindicatos').select('*').order('nombre')),
    q(sb.from('equipos').select('*').eq('torneo_id', tid).order('nombre')),
    q(sb.from('zonas').select('*').eq('torneo_id', tid).order('orden')),
    q(sb.from('partidos').select('*').eq('torneo_id', tid).order('inicio', { nullsFirst: false })),
  ]);
  Object.assign(S, { categorias: cat, canchas: can, sindicatos: sin, equipos: eqs, zonas: zon, partidos: par });
}

/** Tiempo real: ante cambios en partidos/eventos/equipos, recarga y vuelve a dibujar la vista actual. */
let canal, tRecarga;
export function tiempoReal(alCambiar) {
  if (canal) return;
  canal = sb.channel('torneo')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'partidos' }, () => programar())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos' }, () => programar())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'equipos' }, () => programar())
    .subscribe();
  function programar() {
    clearTimeout(tRecarga);
    tRecarga = setTimeout(async () => { try { await cargarBase(); alCambiar(); } catch { /* sin señal: se reintenta en el próximo cambio */ } }, 600);
  }
}

export async function cargarSesion() {
  const { data } = await sb.auth.getSession();
  S.user = data.session?.user || null;
  S.perfil = null;
  if (S.user) {
    const { data: p } = await sb.from('perfiles').select('*').eq('id', S.user.id).maybeSingle();
    S.perfil = p && p.activo ? p : null;
  }
  return S.perfil;
}
export async function salir() {
  await sb.auth.signOut();
  S.user = S.perfil = null;
  location.hash = '#/';
}
export function inicioRol(rol) {
  return { admin: '#/admin', resp_cancha: '#/cancha', sindical: '#/equipos', dt: '#/equipos' }[rol] || '#/';
}

// ───────── interfaz común ─────────
export const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="#0b3a82"/><circle cx="32" cy="32" r="20" fill="#fff"/>
<path d="M32 16l5 9h-10zM20 34l9-3-1 10zM44 34l-9-3 1 10zM26 46l6-6 6 6z" fill="#4fa8e0"/><circle cx="32" cy="33" r="5" fill="#f2b705"/></svg>`;

export function cabecera(sub = '', acciones = '') {
  return `<header class="top"><a class="logo" href="#/" aria-label="Inicio">${LOGO}</a>
    <div class="tit"><b>${esc(S.torneo?.nombre || 'Torneo Relámpago Intersindical CGT')}</b><span>${esc(sub)}</span></div>${acciones}</header>
    <div class="franja"></div>`;
}
export function accionesSesion() {
  if (S.perfil) return `<button id="btnSalir" title="Salir">Salir</button>`;
  return `<a href="#/login" style="color:#fff;text-decoration:none"><button>Ingresar</button></a>`;
}
export function bindSesion(root) {
  const b = $('#btnSalir', root);
  if (b) b.onclick = salir;
}
export function badgeLista(estado) {
  const [t, c] = ESTADO_LISTA[estado] || [estado, 'b-gris'];
  return `<span class="badge ${c}">${t}</span>`;
}
export function tarjetaPartido(p, { click = false, extra = '' } = {}) {
  const vivo = p.estado === 'en_juego';
  const meta = [
    vivo ? '<span class="vivo">En juego</span>' : p.estado === 'confirmado' ? '<span class="badge b-ok">Final</span>' : '',
    `<span>🕑 ${fmtHora(p.inicio)}</span>`,
    p.cancha_id ? `<span>📍 ${esc(cancha(p.cancha_id)?.nombre || '')}</span>` : '<span class="badge b-warn">Sin cancha</span>',
    `<span>${esc(p.fase === 'zona' ? (zona(p.zona_id)?.nombre || 'Zona') : FASES[p.fase] + (p.orden_llave ? ' ' + p.orden_llave : ''))}</span>`,
  ].filter(Boolean).join('');
  const gana = (l) => p.estado === 'confirmado' && ((l === 'l' && (p.goles_l > p.goles_v || p.penales_l > p.penales_v)) || (l === 'v' && (p.goles_v > p.goles_l || p.penales_v > p.penales_l)));
  return `<div class="match ${vivo ? 'vivo-on' : ''} ${click ? 'click' : ''}" ${click ? `data-partido="${p.id}" style="cursor:pointer"` : ''}>
    <div class="eq l" style="${gana('l') ? 'color:var(--ok)' : ''}">${esc(lado(p, 'l'))}</div>
    <div class="res">${p.estado === 'programado' ? '<small style="font-size:14px">vs</small>' : resultado(p)}</div>
    <div class="eq" style="${gana('v') ? 'color:var(--ok)' : ''}">${esc(lado(p, 'v'))}</div>
    <div class="meta">${meta}${extra}</div></div>`;
}
