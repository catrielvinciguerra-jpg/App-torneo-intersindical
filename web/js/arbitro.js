// Árbitro: link personal sin usuario, con sus partidos asignados.
import { sb, $, esc, cabecera, fmtHora, errMsg, descargarIcs, FASES, S } from './core.js';

export async function vistaArbitro(root, token) {
  root.innerHTML = cabecera('Mis partidos') + '<main class="wrap" style="max-width:560px"><div class="vacio">Cargando…</div></main>';
  const { data, error } = await sb.rpc('partidos_arbitro', { p_token: token });
  if (error) throw new Error(errMsg(error));
  const ps = data.partidos || [];
  $('main', root).innerHTML = `<div class="card"><h2>Hola ${esc(data.nombre)}</h2>
    <p class="muted small">${ps.length} partido(s) asignado(s). Se actualiza si la organización cambia la grilla.</p>
    <div class="list">${ps.map(p => `<div class="item"><div style="width:52px" class="center"><b>${fmtHora(p.inicio)}</b></div>
      <div class="grow"><div class="t">${esc(p.local || 'A definir')} vs ${esc(p.visitante || 'A definir')}</div>
      <div class="small muted">${esc(p.cancha || 'Sin cancha')} · ${esc(FASES[p.fase])}</div></div>
      ${p.estado === 'confirmado' ? `<b>${p.goles_l}-${p.goles_v}</b>` : p.estado === 'en_juego' ? '<span class="vivo">vivo</span>' : ''}</div>`).join('')
      || '<div class="vacio">Todavía no tenés partidos asignados.</div>'}</div>
    ${ps.length ? '<button class="btn sec block" id="ics" style="margin-top:12px">🔔 Agregar al calendario (aviso 1 h antes)</button>' : ''}</div>`;
  const b = $('#ics', root);
  if (b) b.onclick = () => descargarIcs(ps.map(p => ({ id: p.id, inicio: p.inicio, titulo: `Arbitraje: ${p.local} vs ${p.visitante} (${p.cancha || ''})`, lugar: S.torneo?.sede })), 'arbitraje');
}
