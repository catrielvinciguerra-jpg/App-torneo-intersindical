// Planilla de partido con modo offline: cada acción se guarda en el celular y se sincroniza cuando vuelve la señal.
// Los eventos llevan client_uuid: reenviar un evento ya sincronizado no lo duplica.
import { S, sb, q, $, $$, esc, cabecera, accionesSesion, bindSesion, toast, modal, confirmar, conBoton, uuid, errMsg,
  fmtHora, cancha, lado, tarjetaPartido, apto, script, cargarBase, FASES, zona } from './core.js';

// ───────── Responsable de cancha: sus partidos ─────────
export async function vistaCancha(root) {
  const mias = S.perfil.rol === 'admin' ? S.canchas : S.canchas.filter(c => c.responsable_id === S.perfil.id);
  const ids = mias.map(c => c.id);
  const ps = S.partidos.filter(p => ids.includes(p.cancha_id)).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  const pend = colaTotal();
  root.innerHTML = cabecera('Responsable de cancha · ' + S.perfil.nombre, accionesSesion()) + `
    <main class="wrap">
      <h2>${mias.length ? esc(mias.map(c => c.nombre).join(' · ')) : 'Sin cancha asignada'}</h2>
      ${!mias.length ? '<div class="vacio" style="margin-top:10px">La organización todavía no te asignó una cancha.</div>' : ''}
      ${pend ? `<div class="badge b-warn" style="margin:8px 0">${pend} cambio(s) sin sincronizar. Abrí la planilla con señal.</div>` : ''}
      <p class="small muted">Tocá un partido para abrir la planilla. Funciona sin señal: los datos se guardan en el celular y se suben solos.</p>
      <div class="list" style="margin-top:8px">${ps.map(p => tarjetaPartido(p, { click: true })).join('') || '<div class="vacio">Sin partidos en tu cancha.</div>'}</div>
    </main>`;
  bindSesion(root);
  $$('[data-partido]', root).forEach(el => el.onclick = () => location.hash = '#/planilla/' + el.dataset.partido);
}

// ───────── Almacenamiento local ─────────
const K = id => 'planilla:' + id;
function leer(id) { try { return JSON.parse(localStorage.getItem(K(id)) || 'null'); } catch { return null; } }
function guardar(id, st) { try { localStorage.setItem(K(id), JSON.stringify(st)); } catch {} }
function colaTotal() {
  let n = 0;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('planilla:')) n += (JSON.parse(localStorage.getItem(k))?.cola || []).length; } } catch {}
  return n;
}

/** Descarga todo lo necesario para planillar este partido y lo guarda para uso sin señal. */
async function descargar(id) {
  const p = await q(sb.from('partidos').select('*').eq('id', id).single());
  const eqIds = [p.local_id, p.visitante_id].filter(Boolean);
  const pl = await q(sb.from('plantel').select('equipo_id, jugador_id, dorsal, observaciones, jugadores(nombre, apellido)').in('equipo_id', eqIds));
  const datos = pl.length ? await q(sb.from('jugadores_datos').select('jugador_id, dni, qr, apto_vence, apto_presentado').in('jugador_id', pl.map(x => x.jugador_id))) : [];
  const ev = await q(sb.from('eventos').select('*').eq('partido_id', id));
  const D = Object.fromEntries(datos.map(d => [d.jugador_id, d]));
  return {
    partido: p,
    nombres: { l: lado(p, 'l'), v: lado(p, 'v') },
    jugadores: pl.map(x => ({ equipo_id: x.equipo_id, id: x.jugador_id, dorsal: x.dorsal, obs: x.observaciones, nombre: x.jugadores.nombre, apellido: x.jugadores.apellido, ...(D[x.jugador_id] || {}) })),
    eventos: ev,
  };
}

// ───────── Sincronización ─────────
let sincronizando = false;
async function sincronizar(id, st) {
  if (sincronizando || !st.cola.length || !navigator.onLine) return;
  sincronizando = true;
  try {
    while (st.cola.length) {
      const op = st.cola[0];
      if (op.op === 'ins') {
        const { error } = await sb.from('eventos').upsert(op.ev, { onConflict: 'client_uuid', ignoreDuplicates: true });
        if (error && !/duplicate/i.test(error.message)) throw error;
      } else if (op.op === 'del') {
        const { error } = await sb.from('eventos').delete().eq('client_uuid', op.client_uuid);
        if (error) throw error;
      } else if (op.op === 'iniciar') {
        const { error } = await sb.rpc('iniciar_partido', { p_partido: id });
        if (error) throw error;
      } else if (op.op === 'confirmar') {
        const { error } = await sb.rpc('confirmar_partido', { p_partido: id, p_pen_l: op.pen_l, p_pen_v: op.pen_v });
        if (error) throw error;
      }
      st.cola.shift();
      guardar(id, st);
    }
  } catch (e) {
    const m = errMsg(e);
    if (!/conexión/i.test(m)) {
      // Error de datos (no de red): se descarta la operación para no trabar la cola, y se avisa.
      toast('No se pudo sincronizar: ' + m, 'error');
      st.cola.shift(); guardar(id, st);
    }
  } finally { sincronizando = false; }
}

// ───────── Vista planilla ─────────
let estado = null, partidoId = null, lado_ = 'l', scanner = null;

export async function vistaPlanilla(root, id) {
  if (partidoId !== id) { lado_ = 'l'; partidoId = id; }
  let st = leer(id);
  if (navigator.onLine) {
    try {
      const fresco = await descargar(id);
      const cola = st?.cola || [];
      // Eventos del servidor + los locales todavía no sincronizados.
      const pendientes = cola.filter(o => o.op === 'ins').map(o => o.ev);
      const borrados = new Set(cola.filter(o => o.op === 'del').map(o => o.client_uuid));
      const ev = fresco.eventos.filter(e => !borrados.has(e.client_uuid));
      pendientes.forEach(e => { if (!ev.some(x => x.client_uuid === e.client_uuid)) ev.push(e); });
      st = { ...fresco, eventos: ev, cola };
      if (cola.some(o => o.op === 'confirmar')) st.partido.estado = 'confirmado';
      else if (cola.some(o => o.op === 'iniciar') && st.partido.estado === 'programado') st.partido.estado = 'en_juego';
      guardar(id, st);
    } catch (e) {
      if (!st) throw e;
      toast('Sin señal: usando la planilla guardada');
    }
  }
  if (!st) throw new Error('No hay datos de esta planilla guardados en el celular. Abrila una vez con señal.');
  estado = st;
  dibujar(root, id);
  sincronizar(id, st).then(() => { if (location.hash.endsWith(id)) dibujarBarra(); });
}

function cuenta(eqId, tipo, jugId) {
  return estado.eventos.filter(e => e.equipo_id === eqId && e.tipo === tipo && (jugId === undefined || e.jugador_id === jugId)).length;
}

function dibujar(root, id) {
  const p = estado.partido;
  const eqL = p.local_id, eqV = p.visitante_id;
  const gl = cuenta(eqL, 'gol'), gv = cuenta(eqV, 'gol');
  const cerrado = p.estado === 'confirmado';
  const eqAct = lado_ === 'l' ? eqL : eqV;
  const js = estado.jugadores.filter(j => j.equipo_id === eqAct).sort((a, b) => (a.dorsal ?? 999) - (b.dorsal ?? 999) || a.apellido.localeCompare(b.apellido));
  const presentes = eqId => estado.eventos.filter(e => e.equipo_id === eqId && e.tipo === 'presente').length;
  const admin = S.perfil.rol === 'admin';
  const etapa = p.fase === 'zona' ? (zona(p.zona_id)?.nombre || 'Zona') : FASES[p.fase];

  root.innerHTML = cabecera('Planilla · ' + (cancha(p.cancha_id)?.nombre || ''), accionesSesion()) + `
  <main class="wrap" style="max-width:640px;padding-bottom:110px">
    <p><a href="${admin ? '#/admin/partidos' : '#/cancha'}">← Partidos</a></p>
    <div class="score">
      <div class="e l">${esc(estado.nombres.l)}</div><div class="n">${gl} - ${gv}</div><div class="e">${esc(estado.nombres.v)}</div>
      <div style="grid-column:1/-1;text-align:center;font-size:13px;opacity:.85">${fmtHora(p.inicio)} · ${esc(etapa)} ·
        ${p.estado === 'en_juego' ? '<b style="color:#ffd0cb">EN JUEGO</b>' : cerrado ? '<b>CONFIRMADO</b>' : 'Programado'}</div>
    </div>
    ${!eqL || !eqV ? '<div class="vacio" style="margin-top:12px">Este cruce todavía no tiene los dos equipos definidos.</div>' : `
    <div class="row" style="margin:12px 0">
      ${p.estado === 'programado' ? '<button class="btn ok" id="iniciar">▶ Iniciar partido</button>' : ''}
      ${!cerrado ? '<button class="btn sec" id="scan">📷 Escanear QR</button>' : ''}
      ${!cerrado ? '<button class="btn" id="confirmar">✔ Confirmar planilla</button>' : ''}
      ${cerrado && admin ? '<button class="btn warn" id="reabrir">Reabrir para corregir</button>' : ''}
    </div>
    <div class="tabs">
      <button class="tab ${lado_ === 'l' ? 'on' : ''}" data-lado="l">${esc(estado.nombres.l)} · ${presentes(eqL)} pres.</button>
      <button class="tab ${lado_ === 'v' ? 'on' : ''}" data-lado="v">${esc(estado.nombres.v)} · ${presentes(eqV)} pres.</button>
    </div>
    <div class="card" style="padding:0">
      <div class="small muted" style="padding:8px 10px;border-bottom:1px solid var(--linea)">P = presente · ⚽ suma gol (mantener apretado para restar) · 🟨 / 🟥 tarjetas</div>
      ${js.map(j => {
        const pres = estado.eventos.some(e => e.jugador_id === j.id && e.tipo === 'presente');
        const g = cuenta(eqAct, 'gol', j.id), am = cuenta(eqAct, 'amarilla', j.id), ro = cuenta(eqAct, 'roja', j.id);
        const a = apto(j);
        return `<div class="jug ${pres ? '' : 'ausente'}" data-jug="${j.id}">
          <div class="dor">${j.dorsal ?? '–'}</div>
          <div class="nom">${esc(j.apellido)}, ${esc(j.nombre)}<small><span class="dot d-${a.cls}"></span> ${a.txt} · DNI ${esc(j.dni || '')}${j.obs ? ' · ' + esc(j.obs) : ''}</small></div>
          <div class="acc">
            <button class="tg pres ${pres ? 'on' : ''}" data-a="presente" ${cerrado ? 'disabled' : ''}>P</button>
            <button class="tg gol ${g ? 'on' : ''}" data-a="gol" ${cerrado ? 'disabled' : ''}>⚽${g ? `<span class="c">${g}</span>` : ''}</button>
            <button class="tg am ${am ? 'on' : ''}" data-a="amarilla" ${cerrado ? 'disabled' : ''}>🟨${am > 1 ? `<span class="c">${am}</span>` : ''}</button>
            <button class="tg ro ${ro ? 'on' : ''}" data-a="roja" ${cerrado ? 'disabled' : ''}>🟥</button>
          </div></div>`;
      }).join('') || '<div class="vacio" style="margin:10px">Este equipo no tiene lista cargada.</div>'}
      ${!cerrado ? `<div style="padding:10px"><button class="btn ghost sm" id="golSin">+ Gol sin jugador (en contra / sin identificar)</button>
        ${cuenta(eqAct, 'gol', null) ? `<button class="btn ghost sm" id="golSinMenos">− quitar uno (${cuenta(eqAct, 'gol', null)})</button>` : ''}</div>` : ''}
    </div>`}
  </main><div id="syncBar"></div>`;
  bindSesion(root);
  dibujarBarra();

  const re = () => dibujar(root, id);
  $$('[data-lado]', root).forEach(b => b.onclick = () => { lado_ = b.dataset.lado; re(); });
  $$('.jug', root).forEach(fila => {
    const jid = fila.dataset.jug;
    $$('[data-a]', fila).forEach(b => {
      let presion;
      b.onpointerdown = () => { presion = setTimeout(() => { presion = null; quitar(id, eqAct, jid, b.dataset.a); re(); }, 600); };
      b.onpointerup = b.onpointerleave = () => clearTimeout(presion);
      b.onclick = () => { if (presion === null) { presion = undefined; return; } accion(id, eqAct, jid, b.dataset.a); re(); };
    });
  });
  const on = (s, fn) => { const b = $(s, root); if (b) b.onclick = () => fn(b); };
  on('#golSin', () => { agregar(id, { equipo_id: eqAct, jugador_id: null, tipo: 'gol' }); re(); });
  on('#golSinMenos', () => { quitar(id, eqAct, null, 'gol'); re(); });
  on('#iniciar', () => { encolar(id, { op: 'iniciar' }); estado.partido.estado = 'en_juego'; guardar(id, estado); re(); });
  on('#scan', () => escanear(root, id));
  on('#confirmar', () => confirmarPlanilla(root, id));
  on('#reabrir', b => conBoton(b, async () => {
    if (!await confirmar('¿Reabrir la planilla? El resultado deja de contar hasta que se vuelva a confirmar.', 'Reabrir', 'warn')) return;
    const { error } = await sb.rpc('reabrir_partido', { p_partido: id });
    if (error) throw new Error(errMsg(error));
    await cargarBase(); vistaPlanilla(root, id);
  }));
}

function dibujarBarra() {
  const bar = $('#syncBar'); if (!bar || !estado) return;
  const n = estado.cola.length;
  bar.className = 'sync ' + (n ? 'pend' : 'ok');
  bar.textContent = n ? (navigator.onLine ? `Sincronizando ${n} cambio(s)…` : `Sin señal · ${n} cambio(s) guardados en el celular`) : '✔ Planilla sincronizada';
}

function encolar(id, op) {
  estado.cola.push(op);
  guardar(id, estado);
  sincronizar(id, estado).then(dibujarBarra);
}
function agregar(id, ev) {
  const e = { ...ev, partido_id: id, client_uuid: uuid() };
  estado.eventos.push(e);
  encolar(id, { op: 'ins', ev: e });
}
function quitar(id, eqId, jid, tipo) {
  const lista = estado.eventos.filter(e => e.equipo_id === eqId && e.tipo === tipo && e.jugador_id === jid);
  const ult = lista[lista.length - 1];
  if (!ult) return;
  estado.eventos = estado.eventos.filter(e => e !== ult);
  // Si todavía no subió, se cancela en la cola; si ya subió, se borra en el servidor.
  const i = estado.cola.findIndex(o => o.op === 'ins' && o.ev.client_uuid === ult.client_uuid);
  if (i >= 0) { estado.cola.splice(i, 1); guardar(id, estado); dibujarBarra(); }
  else encolar(id, { op: 'del', client_uuid: ult.client_uuid });
}
function accion(id, eqId, jid, tipo) {
  const ya = estado.eventos.some(e => e.jugador_id === jid && e.tipo === tipo);
  const j = estado.jugadores.find(x => x.id === jid);
  if (tipo === 'presente') {
    if (ya) return quitar(id, eqId, jid, 'presente');
    if (apto(j).cls === 'error') toast(`${j.apellido}: ${apto(j).txt}`, 'error');
    return agregar(id, { equipo_id: eqId, jugador_id: jid, tipo });
  }
  if (tipo === 'roja' && ya) return quitar(id, eqId, jid, 'roja');
  if (tipo === 'amarilla' && cuenta(eqId, 'amarilla', jid) >= 2) return quitar(id, eqId, jid, 'amarilla');
  // Gol o tarjeta implica que jugó: se marca presente automáticamente.
  if (!estado.eventos.some(e => e.jugador_id === jid && e.tipo === 'presente')) agregar(id, { equipo_id: eqId, jugador_id: jid, tipo: 'presente' });
  agregar(id, { equipo_id: eqId, jugador_id: jid, tipo });
  if (tipo === 'amarilla' && cuenta(eqId, 'amarilla', jid) === 2) toast('Segunda amarilla: corresponde roja', 'error');
}

async function confirmarPlanilla(root, id) {
  const p = estado.partido;
  const gl = cuenta(p.local_id, 'gol'), gv = cuenta(p.visitante_id, 'gol');
  const pres = eqId => estado.eventos.filter(e => e.equipo_id === eqId && e.tipo === 'presente').length;
  const penales = p.fase !== 'zona' && gl === gv;
  const m = modal(`<h2>Confirmar planilla</h2>
    <div class="score" style="margin:12px 0"><div class="e l">${esc(estado.nombres.l)}</div><div class="n">${gl} - ${gv}</div><div class="e">${esc(estado.nombres.v)}</div></div>
    <p class="small">Presentes: ${esc(estado.nombres.l)} ${pres(p.local_id)} · ${esc(estado.nombres.v)} ${pres(p.visitante_id)}</p>
    ${penales ? `<div class="card flat" style="background:var(--warn-bg)"><b>Empate en eliminación: penales</b><div class="grid2" style="margin-top:8px">
      <label class="f">${esc(estado.nombres.l)}<input id="penL" type="number" min="0" max="30" required></label>
      <label class="f">${esc(estado.nombres.v)}<input id="penV" type="number" min="0" max="30" required></label></div></div>` : ''}
    <p class="small muted">Al confirmar se actualizan la tabla, goleadores y estadísticas de cada jugador. Después solo la organización puede corregir.</p>
    <button class="btn ok block" id="ok">Confirmar resultado</button>`);
  $('#ok', m.el).onclick = () => {
    let pen_l = null, pen_v = null;
    if (penales) {
      pen_l = parseInt($('#penL', m.el).value, 10); pen_v = parseInt($('#penV', m.el).value, 10);
      if (isNaN(pen_l) || isNaN(pen_v) || pen_l === pen_v) { toast('Cargá los penales (no pueden quedar iguales)', 'error'); return; }
    }
    if (p.estado === 'programado') encolar(id, { op: 'iniciar' });
    encolar(id, { op: 'confirmar', pen_l, pen_v });
    estado.partido.estado = 'confirmado';
    guardar(id, estado);
    m.close();
    toast(navigator.onLine ? 'Planilla confirmada' : 'Confirmada en el celular: se sube al volver la señal', 'ok');
    dibujar(root, id);
  };
}

// ───────── Escáner QR de acreditación ─────────
async function escanear(root, id) {
  const m = modal(`<h3>Escanear acreditación</h3><div id="lector" style="width:100%;margin-top:10px"></div>
    <p class="small muted">Apuntá al QR del jugador. Se marca presente en su equipo.</p>`, { onClose: () => { scanner?.stop().catch(() => {}); scanner = null; dibujar(root, id); } });
  try {
    await script('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js');
    scanner = new window.Html5Qrcode('lector');
    let ultimo = '';
    await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 230 }, txt => {
      if (txt === ultimo) return;
      ultimo = txt; setTimeout(() => ultimo = '', 2500);
      const code = txt.replace(/^TRIC:/, '');
      const j = estado.jugadores.find(x => x.qr === code);
      if (!j) { toast('Este QR no pertenece a ningún jugador de este partido', 'error'); return; }
      if (estado.eventos.some(e => e.jugador_id === j.id && e.tipo === 'presente')) { toast(`${j.apellido} ya estaba presente`); return; }
      agregar(id, { equipo_id: j.equipo_id, jugador_id: j.id, tipo: 'presente' });
      const a = apto(j);
      toast(`✔ ${j.apellido}, ${j.nombre} presente${a.cls === 'error' ? ' · ' + a.txt : ''}`, a.cls === 'error' ? 'error' : 'ok');
      if (navigator.vibrate) navigator.vibrate(120);
    });
  } catch (e) {
    $('#lector', m.el).innerHTML = `<div class="vacio">No se pudo abrir la cámara: ${esc(errMsg(e))}</div>`;
  }
}

window.addEventListener('online', () => { if (estado && partidoId) sincronizar(partidoId, estado).then(dibujarBarra); });
window.addEventListener('offline', dibujarBarra);
