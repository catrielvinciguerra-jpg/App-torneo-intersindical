// Pantalla pública sin login: hoy/en vivo, fixture, posiciones, llaves y medallero. También modo TV para proyectar.
import { S, sb, q, $, $$, esc, cabecera, accionesSesion, bindSesion, tarjetaPartido, fmtFecha, fmtHora, ordenarTabla,
  exportarImagen, cancha, sindicato, FASES, conBoton, inicioRol } from './core.js';

const TABS = [['hoy', 'Hoy'], ['fixture', 'Fixture'], ['tabla', 'Posiciones'], ['llaves', 'Llaves'], ['medallero', 'Medallero']];
let tab = (() => { try { return localStorage.getItem('pub_tab') || 'hoy'; } catch { return 'hoy'; } })();
let filtro = { modo: 'hora', valor: '' };

export async function vistaPublica(root) {
  const t = S.torneo;
  const ingreso = S.perfil ? `<a class="btn sm warn" href="${inicioRol(S.perfil.rol)}">Mi panel</a>` : '';
  root.innerHTML = cabecera(t ? `${fmtFecha(t.fecha)} · ${t.sede || ''}` : '', accionesSesion()) + `
    <main class="wrap">
      <div class="row between" style="margin-bottom:8px">
        <div class="tabs grow">${TABS.map(([k, n]) => `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
      </div>
      <div class="row" style="margin-bottom:10px">${ingreso}<a class="btn sm sec" href="#/login">Soy jugador/a</a><a class="btn sm ghost" href="#/tv">Modo pantalla</a></div>
      <section id="pub"></section>
    </main>`;
  bindSesion(root);
  $$('[data-tab]', root).forEach(b => b.onclick = () => {
    tab = b.dataset.tab; try { localStorage.setItem('pub_tab', tab); } catch {}
    vistaPublica(root);
  });
  const box = $('#pub', root);
  if (!t) { box.innerHTML = '<div class="vacio">Todavía no hay torneo cargado.</div>'; return; }
  const visible = t.publicado || S.perfil?.rol === 'admin';
  if (!visible && tab !== 'tabla' && tab !== 'medallero') {
    box.innerHTML = `<div class="vacio"><h3>Fixture en preparación</h3><p>La organización lo va a publicar antes del torneo.</p></div>`;
    return;
  }
  if (!t.publicado) box.insertAdjacentHTML('beforebegin', '<div class="badge b-warn" style="margin-bottom:8px">Vista previa: el fixture todavía no está publicado</div>');
  await ({ hoy, fixture, tabla, llaves, medallero }[tab])(box);
}

function bloqueExport(id, titulo, html) {
  return `<div class="card" id="${id}" style="margin-bottom:12px"><div class="row between"><h3>${esc(titulo)}</h3>
    <button class="btn ghost sm no-export" data-export="${id}">⬇ Imagen</button></div>${html}</div>`;
}
function bindExport(box) {
  $$('[data-export]', box).forEach(b => b.onclick = () => conBoton(b, () => exportarImagen(document.getElementById(b.dataset.export), b.dataset.export)));
}

// ───────── Hoy / en vivo ─────────
async function hoy(box) {
  const ps = S.partidos.filter(p => p.inicio).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  const vivo = ps.filter(p => p.estado === 'en_juego');
  const ahora = Date.now();
  const proximos = ps.filter(p => p.estado === 'programado' && new Date(p.inicio).getTime() > ahora - 30 * 60000).slice(0, 8);
  const ultimos = ps.filter(p => p.estado === 'confirmado').slice(-6).reverse();
  box.innerHTML = `
    ${vivo.length ? `<h2 style="margin:6px 0 8px"><span class="vivo">En juego ahora</span></h2><div class="list">${vivo.map(p => tarjetaPartido(p)).join('')}</div>` : ''}
    <h2 style="margin:16px 0 8px">Próximos</h2>
    <div class="list">${proximos.map(p => tarjetaPartido(p)).join('') || '<div class="vacio">No hay partidos pendientes.</div>'}</div>
    ${ultimos.length ? `<h2 style="margin:16px 0 8px">Últimos resultados</h2><div class="list">${ultimos.map(p => tarjetaPartido(p)).join('')}</div>` : ''}`;
}

// ───────── Fixture (por hora, cancha o equipo) ─────────
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
    || '<div class="vacio">Sin partidos.</div>';
  box.innerHTML = `
    <div class="card" style="margin-bottom:12px"><div class="grid2">
      <label class="f">Ver por<select id="fModo">
        <option value="hora" ${filtro.modo === 'hora' ? 'selected' : ''}>Horario</option>
        <option value="cancha" ${filtro.modo === 'cancha' ? 'selected' : ''}>Cancha</option>
        <option value="equipo" ${filtro.modo === 'equipo' ? 'selected' : ''}>Equipo</option></select></label>
      ${opciones.length ? `<label class="f">${filtro.modo === 'cancha' ? 'Cancha' : 'Equipo'}<select id="fValor"><option value="">Todos</option>
        ${opciones.map(([v, n]) => `<option value="${v}" ${v === filtro.valor ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : '<div></div>'}
    </div></div>
    ${bloqueExport('exp-fixture', 'Fixture · ' + fmtFecha(S.torneo.fecha), html)}`;
  $('#fModo', box).onchange = e => { filtro = { modo: e.target.value, valor: '' }; fixture(box); };
  const v = $('#fValor', box); if (v) v.onchange = e => { filtro.valor = e.target.value; fixture(box); };
  bindExport(box);
}

// ───────── Posiciones ─────────
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
    if (!zs.length) { html += `<h2 style="margin:8px 0">${esc(c.nombre)}</h2><div class="vacio">Las zonas todavía no están armadas.</div>`; continue; }
    html += `<h2 style="margin:8px 0">${esc(c.nombre)}</h2>`;
    zs.forEach(z => {
      const f = ordenarTabla(filas.filter(x => x.zona_id === z.id));
      html += bloqueExport('exp-zona-' + z.id, z.nombre, htmlTablaZona(f));
    });
  }
  box.innerHTML = html + '<p class="small muted">Desempate: puntos, diferencia de gol, goles a favor, fair play (amarilla y roja suman; menos es mejor).</p>';
  bindExport(box);
}

// ───────── Llaves ─────────
async function llaves(box) {
  const ps = S.partidos.filter(p => p.fase !== 'zona');
  if (!ps.length) { box.innerHTML = '<div class="vacio">Las llaves se arman al terminar la fase de zonas.</div>'; return; }
  const orden = ['octavos', 'cuartos', 'semi', 'tercero', 'final'];
  let html = '';
  orden.forEach(f => {
    const l = ps.filter(p => p.fase === f).sort((a, b) => (a.orden_llave || 0) - (b.orden_llave || 0));
    if (l.length) html += `<div class="franja-hora">${FASES[f]}</div><div class="list">${l.map(p => tarjetaPartido(p)).join('')}</div>`;
  });
  box.innerHTML = bloqueExport('exp-llaves', 'Llaves', html);
  bindExport(box);
}

// ───────── Medallero ─────────
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
      <div class="grow"><div class="t">${esc(s.nombre)} ${esc(s.apellido)}</div><div class="small muted">${esc(s.equipo)}</div></div><b style="font:600 24px var(--f-cond)">${s.goles}</b></div>`).join('')}</div>`
      : '<div class="vacio">Todavía no hay goles confirmados.</div>') +
    bloqueExport('exp-valla', '🧤 Valla menos vencida', valla.length ? `<div class="list">${valla.map((f, i) => `<div class="item"><b style="width:30px">${med(i)}</b>
      <div class="grow t">${esc(f.nombre)}</div><span class="muted small">${f.gc} GC en ${f.pj} PJ</span></div>`).join('')}</div>` : '<div class="vacio">Sin partidos jugados.</div>') +
    bloqueExport('exp-fair', '🤝 Fair play', fair.length ? `<div class="list">${fair.map((f, i) => `<div class="item"><b style="width:30px">${med(i)}</b>
      <div class="grow t">${esc(f.nombre)}</div><span class="small">🟨 ${f.amarillas} · 🟥 ${f.rojas} · <b>${f.fp} pts</b></span></div>`).join('')}</div>` : '<div class="vacio">Sin partidos jugados.</div>');
  bindExport(box);
}

// ───────── Modo TV: rota en vivo, próximos y tablas ─────────
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
      html = `<h1>En juego</h1><div class="list" style="margin:2vh 0">${vivo.map(x => tarjetaPartido(x)).join('') || '<p>Sin partidos en juego.</p>'}</div>
        <h1>Próximos</h1><div class="list" style="margin-top:2vh">${prox.map(x => tarjetaPartido(x)).join('')}</div>`;
    } else if (p === 'tabla') {
      const filas = await datosTabla();
      html = S.zonas.map(z => `<h1>${esc(z.nombre)}</h1>${htmlTablaZona(ordenarTabla(filas.filter(f => f.zona_id === z.id)))}`).join('') || '<h1>Posiciones</h1><p>Zonas sin armar.</p>';
    } else {
      const st = await q(sb.from('v_stats_jugador').select('*').eq('torneo_id', S.torneo.id).gt('goles', 0).order('goles', { ascending: false }).limit(10));
      html = `<h1>Goleadores</h1><table class="tbl" style="font-size:2.4vh;margin-top:2vh">${st.map((s, k) => `<tr><td>${k + 1}</td><td class="l">${esc(s.nombre)} ${esc(s.apellido)}</td><td class="l">${esc(s.equipo)}</td><td><b>${s.goles}</b></td></tr>`).join('')}</table>`;
    }
    root.innerHTML = `<div class="tv"><div class="row between"><b style="font:600 3vh var(--f-cond)">${esc(S.torneo?.nombre || '')}</b>
      <a href="#/" style="color:#cfe2f7">Salir</a></div><div style="margin-top:2vh">${html}</div></div>`;
  }
  await dibujar();
  tvTimer = setInterval(() => { i++; dibujar(); }, 15000);
}
