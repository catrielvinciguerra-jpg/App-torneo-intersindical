// Portal público (formato JUBU): logo + evento, y pestañas Inscripción · Fixture y resultados · Reglamento. Modo TV aparte.
import { S, sb, q, $, $$, esc, tarjetaPartido, fmtFecha, fmtHora, ordenarTabla, exportarImagen, cancha, sindicato, FASES, conBoton, inicioRol, LOGO } from './core.js';
import { panelInscripcion } from './inscripcion.js';

const ICON = {
  fecha: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  hora: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  sede: '<svg viewBox="0 0 24 24"><path d="M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
};
const guardado = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
let tab = guardado('pub_tab', 'insc');
let sub = guardado('pub_sub', 'hoy');
let filtro = { modo: 'hora', valor: '' };

export async function vistaPublica(root, tabInicial) {
  if (tabInicial) tab = tabInicial;
  const t = S.torneo || {};
  root.innerHTML = `<div class="wrap">
    <header class="hero">${LOGO.replace('<img', '<img width="150" height="150"')}
      <div class="tit"><small>Confederación General del Trabajo</small><b>Torneo Relámpago Intersindical</b><span>Fútbol · ${esc(S.categorias.map(c => c.nombre).join(' · ') || 'Master +40')}</span></div>
    </header>
    <section class="panel" aria-label="Datos del torneo">
      <h1>${esc(t.nombre === 'Torneo Relámpago Intersindical CGT' ? 'Información del torneo' : t.nombre || '')}</h1>
      <div class="dato">${ICON.fecha}<div><b>${esc(t.fecha ? fmtFecha(t.fecha).replace(/^./, c => c.toUpperCase()) : 'Fecha a confirmar')}</b></div></div>
      <div class="dato">${ICON.hora}<div><b>${esc((t.hora_inicio || '09:00').slice(0, 5))} hs</b><span>Presentarse 15 minutos antes en la mesa de cada cancha</span></div></div>
      <div class="dato">${ICON.sede}<div><b>${esc(t.sede && t.sede !== 'A definir' ? t.sede : 'Sede a confirmar')}</b>${t.direccion ? `<span>${esc(t.direccion)}</span>` : ''}</div></div>
      <p class="org">Organiza: ${esc(t.organiza || 'Confederación General del Trabajo de la República Argentina')}.${t.inscripcion_abierta === false ? ' <b>Inscripción cerrada.</b>' : t.cierre_inscripcion ? ` Inscripción abierta hasta el ${esc(fmtFecha(t.cierre_inscripcion))}.` : ''}</p>
    </section>
    <div class="franja"></div>
    <nav class="tabs" role="tablist">
      ${[['insc', 'Inscripción'], ['fix', 'Fixture y resultados'], ['reg', 'Reglamento']].map(([k, n]) =>
        `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${n}</button>`).join('')}
    </nav>
    <section id="pub" style="display:flex;flex-direction:column;gap:14px"></section>
    <nav class="pie-portal"><a href="#/tv">Pantalla para TV</a><a href="${S.perfil ? inicioRol(S.perfil.rol) : '#/login'}">${S.perfil ? 'Mi panel' : 'Acceso organización'}</a></nav>
  </div>`;
  $$('[data-tab]', root).forEach(b => b.onclick = () => { tab = b.dataset.tab; guardar('pub_tab', tab); vistaPublica(root); });
  const box = $('#pub', root);
  if (!S.torneo) { box.innerHTML = '<div class="vacio">Todavía no hay torneo cargado.</div>'; return; }
  if (tab === 'insc') return panelInscripcion(box);
  if (tab === 'reg') return reglamento(box);
  return fixtureTab(box);
}

// ───────── Reglamento / circulares ─────────
function reglamento(box) {
  const t = S.torneo;
  box.innerHTML = `<div class="card"><h2>Reglamento y circulares</h2>
    <details class="doc" open><summary><div><b>Circular 1</b><small>${esc(t.nombre)}</small></div><span class="pill b-ok">Publicada</span></summary>
      <div class="body">${esc(t.reglamento || 'El reglamento se publicará en esta sección.')}</div></details>
    <details class="doc"><summary><div><b>Categorías</b><small>Edades al día del torneo</small></div></summary>
      <div class="body"><ul class="chips">${S.categorias.map(c => `<li>${esc(c.nombre)}${c.edad_min ? ' · desde ' + c.edad_min + ' años' : ''}</li>`).join('')}</ul></div></details>
    <details class="doc"><summary><div><b>Listas de buena fe</b><small>Mínimo y máximo por equipo</small></div></summary>
      <div class="body">Cada lista debe tener entre ${t.min_jugadores} y ${t.max_jugadores} jugadores, con DNI, fecha de nacimiento y apto médico.</div></details>
  </div>`;
}

// ───────── Fixture y resultados ─────────
async function fixtureTab(box) {
  const t = S.torneo;
  const visible = t.publicado || S.perfil?.rol === 'admin';
  box.innerHTML = `<div class="card"><h2>Fixture y resultados</h2>
    ${!t.publicado && visible ? '<span class="pill b-warn" style="align-self:flex-start">Vista previa: todavía no está publicado</span>' : ''}
    <div class="sub" role="group">${[['hoy', 'En vivo'], ['fixture', 'Cronograma'], ['tabla', 'Posiciones'], ['llaves', 'Llaves'], ['medallero', 'Goleadores y premios']]
      .map(([k, n]) => `<button type="button" data-sub="${k}" aria-pressed="${k === sub}">${n}</button>`).join('')}</div>
    <div id="fxpub" style="display:flex;flex-direction:column;gap:12px"></div></div>`;
  $$('[data-sub]', box).forEach(b => b.onclick = () => { sub = b.dataset.sub; guardar('pub_sub', sub); fixtureTab(box); });
  const fx = $('#fxpub', box);
  if (!visible && !['tabla', 'medallero'].includes(sub)) {
    fx.innerHTML = '<div class="vacio"><b>Fixture en preparación</b><br>La organización lo publica antes del torneo.</div>';
    return;
  }
  await ({ hoy, fixture, tabla, llaves, medallero }[sub])(fx);
}

function bloqueExport(id, titulo, html) {
  return `<div class="card flat" id="${id}"><div class="row between"><h3>${esc(titulo)}</h3>
    <button class="btn ghost sm no-export" data-export="${id}">⬇ Imagen</button></div>${html}</div>`;
}
function bindExport(box) {
  $$('[data-export]', box).forEach(b => b.onclick = () => conBoton(b, () => exportarImagen(document.getElementById(b.dataset.export), b.dataset.export)));
}

async function hoy(box) {
  const ps = S.partidos.filter(p => p.inicio).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  const vivo = ps.filter(p => p.estado === 'en_juego');
  const ahora = Date.now();
  const proximos = ps.filter(p => p.estado === 'programado' && new Date(p.inicio).getTime() > ahora - 30 * 60000).slice(0, 8);
  const ultimos = ps.filter(p => p.estado === 'confirmado').slice(-6).reverse();
  box.innerHTML = `
    ${vivo.length ? `<h3><span class="vivo">En juego ahora</span></h3><div class="list">${vivo.map(p => tarjetaPartido(p)).join('')}</div>` : ''}
    <h3>Próximos partidos</h3>
    <div class="list">${proximos.map(p => tarjetaPartido(p)).join('') || '<div class="vacio">No hay partidos pendientes.</div>'}</div>
    ${ultimos.length ? `<h3>Últimos resultados</h3><div class="list">${ultimos.map(p => tarjetaPartido(p)).join('')}</div>` : ''}`;
}

async function fixture(box) {
  const opciones = filtro.modo === 'cancha' ? S.canchas.filter(c => c.activa).map(c => [c.id, c.nombre])
    : filtro.modo === 'equipo' ? S.equipos.map(e => [e.id, e.nombre]) : [];
  let ps = [...S.partidos].sort((a, b) => (new Date(a.inicio || 8.64e15)) - (new Date(b.inicio || 8.64e15)));
  if (filtro.modo === 'cancha' && filtro.valor) ps = ps.filter(p => p.cancha_id === filtro.valor);
  if (filtro.modo === 'equipo' && filtro.valor) ps = ps.filter(p => p.local_id === filtro.valor || p.visitante_id === filtro.valor);
  const grupos = {};
  ps.forEach(p => {
    const k = filtro.modo === 'cancha' && !filtro.valor ? (cancha(p.cancha_id)?.nombre || 'Sin cancha') : (p.inicio ? fmtHora(p.inicio) : 'Sin horario');
    (grupos[k] ||= []).push(p);
  });
  const html = Object.entries(grupos).map(([k, l]) => `<div class="franja-hora">${esc(k)}</div><div class="list">${l.map(p => tarjetaPartido(p)).join('')}</div>`).join('')
    || '<div class="vacio">Sin partidos todavía.</div>';
  box.innerHTML = `
    <div class="grid2">
      <div class="f">Ver por<select id="fModo">
        <option value="hora" ${filtro.modo === 'hora' ? 'selected' : ''}>Horario</option>
        <option value="cancha" ${filtro.modo === 'cancha' ? 'selected' : ''}>Cancha</option>
        <option value="equipo" ${filtro.modo === 'equipo' ? 'selected' : ''}>Equipo</option></select></div>
      ${opciones.length ? `<div class="f">${filtro.modo === 'cancha' ? 'Cancha' : 'Equipo'}<select id="fValor"><option value="">Todos</option>
        ${opciones.map(([v, n]) => `<option value="${v}" ${v === filtro.valor ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>` : '<div></div>'}
    </div>
    ${bloqueExport('exp-fixture', 'Cronograma · ' + fmtFecha(S.torneo.fecha), html)}`;
  $('#fModo', box).onchange = e => { filtro = { modo: e.target.value, valor: '' }; fixture(box); };
  const v = $('#fValor', box); if (v) v.onchange = e => { filtro.valor = e.target.value; fixture(box); };
  bindExport(box);
}

export async function datosTabla() {
  return q(sb.from('v_tabla').select('*').eq('torneo_id', S.torneo.id));
}
export function htmlTablaZona(filas, clasifican = 0) {
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="l">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DIF</th><th>PTS</th><th title="Fair play: menos es mejor">FP</th></tr></thead><tbody>
    ${filas.map((f, i) => `<tr class="${i < clasifican ? 'clasif' : ''}"><td>${i + 1}</td><td class="l"><b>${esc(f.nombre)}</b><br><small class="muted">${esc(sindicato(f.sindicato_id)?.sigla || sindicato(f.sindicato_id)?.nombre || '')}</small></td>
    <td>${f.pj}</td><td>${f.pg}</td><td>${f.pe}</td><td>${f.pp}</td><td>${f.gf}</td><td>${f.gc}</td><td>${f.dif > 0 ? '+' : ''}${f.dif}</td><td><b>${f.pts}</b></td><td>${f.fp}</td></tr>`).join('')}
  </tbody></table></div>`;
}
async function tabla(box) {
  const filas = await datosTabla();
  let html = '';
  for (const c of S.categorias) {
    const zs = S.zonas.filter(z => z.categoria_id === c.id);
    if (!zs.length) { html += `<div class="vacio">${esc(c.nombre)}: las zonas todavía no están armadas.</div>`; continue; }
    zs.forEach(z => { html += bloqueExport('exp-zona-' + z.id, `${c.nombre} · ${z.nombre}`, htmlTablaZona(ordenarTabla(filas.filter(x => x.zona_id === z.id)))); });
  }
  box.innerHTML = html + '<p class="small">Desempate: puntos, diferencia de gol, goles a favor y fair play (cada tarjeta suma; menos es mejor).</p>';
  bindExport(box);
}

async function llaves(box) {
  const ps = S.partidos.filter(p => p.fase !== 'zona');
  if (!ps.length) { box.innerHTML = '<div class="vacio">Las llaves se arman al terminar la fase de zonas.</div>'; return; }
  let html = '';
  ['octavos', 'cuartos', 'semi', 'tercero', 'final'].forEach(f => {
    const l = ps.filter(p => p.fase === f).sort((a, b) => (a.orden_llave || 0) - (b.orden_llave || 0));
    if (l.length) html += `<div class="franja-hora">${FASES[f]}</div><div class="list">${l.map(p => tarjetaPartido(p)).join('')}</div>`;
  });
  box.innerHTML = bloqueExport('exp-llaves', 'Llaves', html);
  bindExport(box);
}

async function medallero(box) {
  const [stats, filas] = await Promise.all([
    q(sb.from('v_stats_jugador').select('*').eq('torneo_id', S.torneo.id).gt('goles', 0).order('goles', { ascending: false }).limit(15)),
    datosTabla(),
  ]);
  const t = ordenarTabla(filas).filter(f => f.pj > 0);
  const valla = [...t].sort((a, b) => a.gc / a.pj - b.gc / b.pj || b.pj - a.pj).slice(0, 5);
  const fair = [...t].sort((a, b) => a.fp - b.fp || b.pj - a.pj).slice(0, 5);
  const med = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
  box.innerHTML =
    bloqueExport('exp-goleadores', '⚽ Goleadores', stats.length ? `<div class="list">${stats.map((s, i) => `<div class="item"><b style="width:30px">${med(i)}</b>
      <div class="grow"><div class="t">${esc(s.nombre)} ${esc(s.apellido)}</div><div class="small">${esc(s.equipo)}</div></div><b style="font:800 22px var(--f-display);color:var(--azul)">${s.goles}</b></div>`).join('')}</div>`
      : '<div class="vacio">Todavía no hay goles confirmados.</div>') +
    bloqueExport('exp-valla', '🧤 Valla menos vencida', valla.length ? `<div class="list">${valla.map((f, i) => `<div class="item"><b style="width:30px">${med(i)}</b>
      <div class="grow t">${esc(f.nombre)}</div><span class="small">${f.gc} GC en ${f.pj} PJ</span></div>`).join('')}</div>` : '<div class="vacio">Sin partidos jugados.</div>') +
    bloqueExport('exp-fair', '🤝 Fair play', fair.length ? `<div class="list">${fair.map((f, i) => `<div class="item"><b style="width:30px">${med(i)}</b>
      <div class="grow t">${esc(f.nombre)}</div><span class="small">🟨 ${f.amarillas} · 🟥 ${f.rojas} · <b>${f.fp} pts</b></span></div>`).join('')}</div>` : '<div class="vacio">Sin partidos jugados.</div>');
  bindExport(box);
}

// ───────── Modo TV: rota en vivo, posiciones y goleadores ─────────
let tvTimer;
export async function vistaTV(root) {
  clearInterval(tvTimer);
  let i = 0;
  const pantallas = ['vivo', 'tabla', 'goles'];
  async function dibujar() {
    if (!location.hash.startsWith('#/tv')) { clearInterval(tvTimer); return; }
    const p = pantallas[i % pantallas.length];
    let html = '';
    if (p === 'vivo') {
      const ps = S.partidos.filter(x => x.inicio).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
      const vivo = ps.filter(x => x.estado === 'en_juego');
      const prox = ps.filter(x => x.estado === 'programado').slice(0, 6);
      html = `<h1>En juego</h1><div class="list" style="margin-bottom:3vh">${vivo.map(x => tarjetaPartido(x)).join('') || '<p>Sin partidos en juego.</p>'}</div>
        <h1>Próximos</h1><div class="list">${prox.map(x => tarjetaPartido(x)).join('')}</div>`;
    } else if (p === 'tabla') {
      const filas = await datosTabla();
      html = S.zonas.map(z => `<h1>${esc(z.nombre)}</h1>${htmlTablaZona(ordenarTabla(filas.filter(f => f.zona_id === z.id)))}`).join('') || '<h1>Posiciones</h1><p>Zonas sin armar.</p>';
    } else {
      const st = await q(sb.from('v_stats_jugador').select('*').eq('torneo_id', S.torneo.id).gt('goles', 0).order('goles', { ascending: false }).limit(10));
      html = `<h1>Goleadores</h1><table class="tbl">${st.map((s, k) => `<tr><td>${k + 1}</td><td class="l">${esc(s.nombre)} ${esc(s.apellido)}</td><td class="l">${esc(s.equipo)}</td><td><b>${s.goles}</b></td></tr>`).join('')}</table>`;
    }
    root.innerHTML = `<div class="tv"><header>${LOGO}<b>${esc(S.torneo?.nombre || '')}</b><a href="#/" style="margin-left:auto;color:#bfe2f8">Salir</a></header><main>${html}</main></div>`;
  }
  await dibujar();
  tvTimer = setInterval(() => { i++; dibujar(); }, 15000);
}
