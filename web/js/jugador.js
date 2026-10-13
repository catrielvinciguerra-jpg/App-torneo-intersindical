// Deportista: convocatoria, acreditación con QR y registro personal. Funciona sin cuenta: token propio.
import { sb, $, esc, cabecera, fmtHora, fmtFecha, qrSvg, apto, toast, errMsg, descargarIcs, FASES, LOGO } from './core.js';

export async function vistaJugador(root) {
  let token = null; try { token = localStorage.getItem('jug_token'); } catch {}
  if (!token) { location.hash = '#/inscripcion'; return; }
  const salir = `<button id="jSalir">Salir</button>`;
  root.innerHTML = cabecera('Mi convocatoria', salir) + '<main class="wrap" style="max-width:560px"><div class="vacio">Cargando…</div></main>';
  $('#jSalir', root).onclick = () => { try { localStorage.removeItem('jug_token'); localStorage.removeItem('jug_cache'); } catch {} location.hash = '#/inscripcion'; };

  let f;
  const { data, error } = await sb.rpc('mi_ficha', { p_token: token });
  if (error) {
    // Sin señal: mostrar la última ficha guardada (la acreditación tiene que verse igual en la cancha).
    try { f = JSON.parse(localStorage.getItem('jug_cache') || 'null'); } catch {}
    if (!f || !/conexión|fetch/i.test(errMsg(error))) {
      if (/vencida/i.test(error.message)) { try { localStorage.removeItem('jug_token'); } catch {} location.hash = '#/inscripcion'; return; }
      throw new Error(errMsg(error));
    }
    toast('Sin conexión: mostrando tu última información guardada');
  } else {
    f = data;
    try { localStorage.setItem('jug_cache', JSON.stringify(f)); } catch {}
  }

  const j = f.jugador;
  const ap = apto(j);
  const eqs = f.equipos || [];
  const main = $('main', root);
  if (!eqs.length) {
    main.innerHTML = `<div class="card"><h2>Hola ${esc(j.nombre)}</h2><p>No figurás en ninguna lista de buena fe del torneo activo. Consultá a tu DT.</p></div>`;
    return;
  }
  const e = eqs[0];
  const ps = e.partidos || [];
  const prox = ps.find(p => p.estado !== 'confirmado');
  const rival = p => p.es_local ? p.visitante : p.local;
  const qr = await qrSvg('TRIC:' + j.qr);
  const st = e.stats || { pj: 0, goles: 0, amarillas: 0, rojas: 0 };

  main.innerHTML = `
    ${prox ? `<div class="card prox" style="margin-bottom:12px">
      <div class="small muted">${prox.estado === 'en_juego' ? '<span class="vivo">Jugando ahora</span>' : 'Tu próximo partido'}</div>
      <h2 style="margin:6px 0">vs ${esc(rival(prox) || 'A definir')}</h2>
      <div class="grid3">
        <div class="stat"><b>${fmtHora(prox.inicio)}</b><span>Hora</span></div>
        <div class="stat"><b style="font-size:20px">${esc(prox.cancha || '—')}</b><span>Cancha</span></div>
        <div class="stat"><b style="font-size:20px">${esc(FASES[prox.fase] || '')}</b><span>Fase</span></div>
      </div>
      <p class="small" style="margin:10px 0 0">📅 ${esc(fmtFecha(e.torneo_fecha))} · 📍 ${esc(e.sede || '')} ${e.direccion ? '· ' + esc(e.direccion) : ''}</p>
      ${e.estado_lista !== 'validada' ? '<p class="badge b-warn" style="margin-top:8px">Tu lista todavía no fue validada por la organización</p>' : ''}
    </div>` : '<div class="card" style="margin-bottom:12px"><b>No tenés partidos pendientes.</b></div>'}

    <div class="acred" style="margin-bottom:12px">
      <div class="cab">${LOGO}<div><small>Acreditación · ${esc(e.torneo)}</small></div></div>
      <div class="nombre">${esc(j.nombre)} ${esc(j.apellido)}</div>
      <div class="small" style="color:#d6ecfa;position:relative;z-index:1">${esc(e.equipo)}${e.dorsal != null ? ' · #' + e.dorsal : ''} · ${esc(e.sindicato)} · DNI ${esc(j.dni)}</div>
      <div class="qr">${qr}</div>
      <div class="pie"><span>${esc(e.categoria)}</span><span class="badge b-${ap.cls}">${ap.txt}</span></div>
    </div>
    <p class="small center" style="margin:-4px 0 12px">Mostrá este QR en la mesa de tu cancha.</p>

    <div class="card" style="margin-bottom:12px"><h3>Mi registro</h3>
      <div class="grid2" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat"><b>${st.pj}</b><span>Partidos</span></div>
        <div class="stat"><b>${st.goles}</b><span>Goles</span></div>
        <div class="stat"><b>${st.amarillas}</b><span>🟨</span></div>
        <div class="stat"><b>${st.rojas}</b><span>🟥</span></div>
      </div></div>

    <div class="card"><div class="row between"><h3>Partidos de ${esc(e.equipo)}</h3>
      ${ps.some(p => p.inicio && p.estado !== 'confirmado') ? '<button class="btn sm sec" id="ics">🔔 Recordatorios</button>' : ''}</div>
      <div class="list" style="margin-top:8px">${ps.map(p => `<div class="item"><div style="width:52px" class="center"><b>${fmtHora(p.inicio)}</b></div>
        <div class="grow"><div class="t">vs ${esc(rival(p) || 'A definir')}</div><div class="small muted">${esc(p.cancha || 'Sin cancha')} · ${esc(FASES[p.fase])}</div></div>
        ${p.estado === 'confirmado' ? `<b>${p.es_local ? p.goles_l + '-' + p.goles_v : p.goles_v + '-' + p.goles_l}</b>` : p.estado === 'en_juego' ? '<span class="vivo">vivo</span>' : ''}</div>`).join('')
        || '<div class="vacio">El fixture todavía no está armado.</div>'}</div>
      <p class="small muted">"Recordatorios" agrega tus partidos al calendario del celular con aviso 1 hora antes.</p>
    </div>`;
  const ics = $('#ics', root);
  if (ics) ics.onclick = () => descargarIcs(ps.filter(p => p.estado !== 'confirmado').map(p => ({
    id: p.id, inicio: p.inicio, titulo: `${e.equipo} vs ${rival(p) || 'A definir'} (${p.cancha || ''})`, lugar: `${e.sede || ''} ${e.direccion || ''}`,
  })), 'mis-partidos');
}
