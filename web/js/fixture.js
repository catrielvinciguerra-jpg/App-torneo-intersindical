// Organización deportiva: zonas, generación de partidos, grilla cancha × horario, árbitros y llaves.
// Todo se puede rehacer a medida que se suman equipos o canchas: lo jugado queda fijo, lo pendiente se reacomoda.
import { S, sb, q, $, $$, esc, toast, modal, confirmar, conBoton, formData, cargarBase, aFecha, fmtHora, hhmm,
  cancha, eq, zona, categoria, sindicato, lado, FASES, ordenarTabla, exportarImagen } from './core.js';

const RANGO_FASE = { zona: 0, octavos: 1, cuartos: 2, semi: 3, tercero: 4, final: 5 };
const T = () => S.torneo;
const DUR = () => T().duracion_min * 60000;
const PASO = () => (T().duracion_min + T().intervalo_min) * 60000;
const DESC = () => T().descanso_min * 60000;
const ms = p => p.inicio ? new Date(p.inicio).getTime() : null;

// ───────── Algoritmos puros ─────────
/** Todos contra todos (método del círculo). Devuelve [local, visitante, ronda]. */
export function todosContraTodos(ids) {
  const t = [...ids]; if (t.length % 2) t.push(null);
  const n = t.length, res = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = t[i], b = t[n - 1 - i];
      if (a && b) res.push(r % 2 ? [b, a, r + 1] : [a, b, r + 1]);
    }
    t.splice(1, 0, t.pop());
  }
  return res;
}

/** Reparte equipos en zonas parejas evitando, si se puede, dos equipos del mismo sindicato en la misma zona. */
export function repartirZonas(equipos, nZonas) {
  const grupos = {};
  equipos.forEach(e => (grupos[e.sindicato_id] ||= []).push(e));
  const orden = Object.values(grupos).sort((a, b) => b.length - a.length).flat();
  const zonas = Array.from({ length: nZonas }, () => []);
  orden.forEach(e => {
    const min = Math.min(...zonas.map(z => z.length));
    const cand = zonas.map((z, i) => i).filter(i => zonas[i].length === min);
    const sinRepetir = cand.find(i => !zonas[i].some(x => x.sindicato_id === e.sindicato_id));
    zonas[sinRepetir ?? cand[0]].push(e);
  });
  return zonas;
}

/** Dependencias de un partido de llave: no puede empezar antes de que terminen. */
function dependencias(p, todos) {
  const deps = [];
  [p.ref_l, p.ref_v].filter(Boolean).forEach(r => {
    const [t, a] = r.split(':');
    if (t === 'Z') todos.filter(x => x.zona_id === a && x.fase === 'zona').forEach(x => deps.push(x));
    else { const x = todos.find(y => y.id === a); if (x) deps.push(x); }
  });
  return deps;
}

/**
 * Asigna cancha y horario. Respeta: cancha activa y su franja horaria, una partido por cancha a la vez,
 * descanso mínimo de cada equipo, y que las llaves vayan después de lo que las define.
 * todos=false: solo ubica los que no tienen lugar. todos=true: reacomoda todo lo pendiente.
 */
export function programar(partidos, { todos = false } = {}) {
  const canchas = S.canchas.filter(c => c.activa).sort((a, b) => a.orden - b.orden);
  if (!canchas.length) throw new Error('No hay canchas activas.');
  const base = aFecha(T().hora_inicio).getTime();
  const valido = p => p.inicio && p.cancha_id && cancha(p.cancha_id)?.activa;
  const fijos = partidos.filter(p => p.estado !== 'programado' || (!todos && valido(p)));
  const mover = partidos.filter(p => !fijos.includes(p)).sort((a, b) =>
    RANGO_FASE[a.fase] - RANGO_FASE[b.fase] || a.ronda - b.ronda || (zona(a.zona_id)?.orden ?? 0) - (zona(b.zona_id)?.orden ?? 0) || (a.orden_llave || 0) - (b.orden_llave || 0));
  const ubicados = fijos.map(p => ({ ...p }));
  const cambios = [];
  for (const p of mover) {
    const deps = dependencias(p, [...ubicados, ...mover]);
    let minT = base;
    for (const d of deps) {
      const u = ubicados.find(x => x.id === d.id);
      if (u?.inicio) minT = Math.max(minT, ms(u) + DUR() + DESC());
    }
    const equipos = [p.local_id, p.visitante_id].filter(Boolean);
    const z = zona(p.zona_id);
    // Zona con cancha base activa: juega solo ahí (equipos divididos por cancha). Sin base: cualquier cancha.
    const base_ = z?.cancha_base_id && canchas.find(c => c.id === z.cancha_base_id);
    const prefer = base_ ? [base_] : canchas;
    let puesto = null;
    for (let s = 0; s < 400 && !puesto; s++) {
      const t = base + s * PASO();
      if (t < minT) continue;
      for (const c of prefer) {
        if (c.hora_desde && t < aFecha(c.hora_desde).getTime()) continue;
        if (c.hora_hasta && t + DUR() > aFecha(c.hora_hasta).getTime()) continue;
        if (ubicados.some(x => x.cancha_id === c.id && x.inicio && Math.abs(ms(x) - t) < PASO())) continue;
        if (equipos.some(e => ubicados.some(x => (x.local_id === e || x.visitante_id === e) && x.inicio && Math.abs(ms(x) - t) < DUR() + DESC()))) continue;
        puesto = { cancha_id: c.id, inicio: new Date(t).toISOString() };
        break;
      }
    }
    if (!puesto) throw new Error('No entra todo en las canchas y horarios disponibles. Sumá canchas o ampliá el horario.');
    ubicados.push({ ...p, ...puesto });
    cambios.push({ ...p, ...puesto });
  }
  return cambios;
}

/** Reparte árbitros parejo, respetando disponibilidad y sin superponer partidos. */
export function asignarArbitros(partidos, { todos = false } = {}) {
  const arbs = (S.staff || []).filter(s => s.activo && s.funcion === 'arbitro');
  if (!arbs.length) throw new Error('No hay árbitros cargados.');
  const carga = Object.fromEntries(arbs.map(a => [a.id, 0]));
  const asign = partidos.map(p => ({ ...p }));
  const editables = asign.filter(p => p.estado === 'programado' && p.inicio && (todos || !p.arbitro_id));
  if (todos) editables.forEach(p => p.arbitro_id = null);
  asign.forEach(p => { if (p.arbitro_id && carga[p.arbitro_id] != null) carga[p.arbitro_id]++; });
  const cambios = [];
  editables.sort((a, b) => ms(a) - ms(b)).forEach(p => {
    const t = ms(p);
    const libres = arbs.filter(a =>
      (!a.disponible_desde || t >= aFecha(a.disponible_desde).getTime()) &&
      (!a.disponible_hasta || t + DUR() <= aFecha(a.disponible_hasta).getTime()) &&
      !asign.some(x => x !== p && x.arbitro_id === a.id && x.inicio && Math.abs(ms(x) - t) < PASO()));
    if (!libres.length) return;
    libres.sort((a, b) => carga[a.id] - carga[b.id] || a.nombre.localeCompare(b.nombre));
    p.arbitro_id = libres[0].id; carga[p.arbitro_id]++;
    cambios.push(p);
  });
  return cambios;
}

/** Motivos por los que un partido está mal ubicado. Vacío = OK. */
export function conflictos(p, todos = S.partidos) {
  const r = [];
  if (p.estado === 'confirmado') return r;
  if (!p.inicio || !p.cancha_id) { r.push('Sin cancha u horario'); return r; }
  const c = cancha(p.cancha_id), t = ms(p);
  if (!c?.activa) r.push('Cancha desactivada');
  if (c?.hora_desde && t < aFecha(c.hora_desde).getTime()) r.push('Antes del horario de la cancha');
  if (c?.hora_hasta && t + DUR() > aFecha(c.hora_hasta).getTime()) r.push('Después del horario de la cancha');
  todos.forEach(x => {
    if (x.id === p.id || !x.inicio) return;
    const d = Math.abs(ms(x) - t);
    if (x.cancha_id === p.cancha_id && d < PASO()) r.push('Dos partidos en la misma cancha');
    [p.local_id, p.visitante_id].filter(Boolean).forEach(e => {
      if ((x.local_id === e || x.visitante_id === e) && d < DUR() + DESC()) r.push(`${eq(e)?.nombre} sin descanso suficiente`);
    });
    if (p.arbitro_id && x.arbitro_id === p.arbitro_id && d < PASO()) r.push('Árbitro en dos partidos a la vez');
  });
  const a = (S.staff || []).find(s => s.id === p.arbitro_id);
  if (a && ((a.disponible_desde && t < aFecha(a.disponible_desde).getTime()) || (a.disponible_hasta && t + DUR() > aFecha(a.disponible_hasta).getTime()))) r.push('Árbitro fuera de su horario');
  return [...new Set(r)];
}

async function guardarPartidos(filas) {
  if (!filas.length) return;
  // Solo campos de organización: nunca estado ni goles (los maneja la planilla y no se pisan con datos viejos).
  const limpias = filas.map(({ id, torneo_id, categoria_id, fase, local_id, visitante_id, cancha_id, inicio, arbitro_id }) =>
    ({ id, torneo_id, categoria_id, fase, local_id, visitante_id, cancha_id, inicio, arbitro_id }));
  await q(sb.from('partidos').upsert(limpias));
}

// ───────── Llaves: resolver equipos a medida que hay resultados ─────────
export async function resolverLlaves() {
  const pend = S.partidos.filter(p => p.estado === 'programado' && (p.ref_l || p.ref_v));
  if (!pend.length) return 0;
  const filas = await q(sb.from('v_tabla').select('*').eq('torneo_id', S.torneo.id));
  const ganador = (p, gana) => {
    if (p?.estado !== 'confirmado') return null;
    const l = p.goles_l > p.goles_v || (p.goles_l === p.goles_v && p.penales_l > p.penales_v);
    return gana === l ? p.local_id : p.visitante_id;
  };
  const resolver = ref => {
    if (!ref) return undefined;
    const [t, a, b] = ref.split(':');
    if (t === 'Z') {
      const pz = S.partidos.filter(x => x.zona_id === a && x.fase === 'zona');
      if (!pz.length || pz.some(x => x.estado !== 'confirmado')) return null;
      return ordenarTabla(filas.filter(f => f.zona_id === a))[Number(b) - 1]?.equipo_id || null;
    }
    return ganador(S.partidos.find(x => x.id === a), t === 'G');
  };
  const cambios = [];
  pend.forEach(p => {
    const l = resolver(p.ref_l), v = resolver(p.ref_v);
    const n = { ...p };
    if (l !== undefined) n.local_id = l;
    if (v !== undefined) n.visitante_id = v;
    if (n.local_id !== p.local_id || n.visitante_id !== p.visitante_id) cambios.push(n);
  });
  await guardarPartidos(cambios);
  if (cambios.length) await cargarBase();
  return cambios.length;
}

// ───────── Panel ─────────
let sub = 'zonas', seleccion = null;

export async function panelFixture(box) {
  box.innerHTML = `<div class="tabs">${[['zonas', 'Zonas y partidos'], ['grilla', 'Grilla cancha × horario'], ['llaves', 'Llaves']]
    .map(([k, n]) => `<button class="tab ${k === sub ? 'on' : ''}" data-sub="${k}">${n}</button>`).join('')}</div><div id="fxBox"></div>`;
  $$('[data-sub]', box).forEach(b => b.onclick = () => { sub = b.dataset.sub; panelFixture(box); });
  const fx = $('#fxBox', box);
  const re = () => panelFixture(box);
  if (sub === 'zonas') zonasUI(fx, re);
  else if (sub === 'grilla') grillaUI(fx, re);
  else llavesUI(fx, re);
}

// ───────── Zonas ─────────
function zonasUI(box, re) {
  if (!S.equipos.length) { box.innerHTML = '<div class="vacio">Todavía no hay equipos inscriptos.</div>'; return; }
  box.innerHTML = S.categorias.map(c => {
    const eqs = S.equipos.filter(e => e.categoria_id === c.id);
    const zs = S.zonas.filter(z => z.categoria_id === c.id);
    const sinZona = eqs.filter(e => !e.zona_id || !zs.some(z => z.id === e.zona_id));
    const sugerido = Math.max(1, Math.round(eqs.length / 4));
    const pz = S.partidos.filter(p => p.categoria_id === c.id && p.fase === 'zona');
    const selZona = e => `<select data-mover="${e.id}" style="min-height:34px;padding:4px 8px;width:auto;font-size:14px"><option value="">Sin zona</option>
      ${zs.map(z => `<option value="${z.id}" ${e.zona_id === z.id ? 'selected' : ''}>${esc(z.nombre)}</option>`).join('')}</select>`;
    return `<div class="card" style="margin-bottom:12px">
      <div class="row between"><h2>${esc(c.nombre)}</h2><span class="muted small">${eqs.length} equipos · ${pz.length} partidos de zona</span></div>
      <div class="row" style="margin:10px 0">
        <label class="f" style="width:130px">Cantidad de zonas<input type="number" min="1" max="16" value="${zs.length || sugerido}" data-nz="${c.id}"></label>
        <button class="btn sec" data-armar="${c.id}">${zs.length ? 'Rearmar zonas' : 'Armar zonas automáticamente'}</button>
        ${zs.length ? `<button class="btn" data-gen="${c.id}">Generar / actualizar partidos</button>` : ''}
      </div>
      <p class="small muted" style="margin-top:0">El reparto es parejo y evita que dos equipos del mismo sindicato caigan en la misma zona. Podés mover equipos a mano. Si se suman equipos, ubicalos y tocá "Generar / actualizar": se agregan los partidos que faltan y se acomodan en la grilla.</p>
      ${zs.map(z => {
        const ez = eqs.filter(e => e.zona_id === z.id);
        return `<div class="card flat" style="margin-top:10px;background:var(--campo)">
          <div class="row between"><input data-zn="${z.id}" value="${esc(z.nombre)}" style="max-width:180px;font-weight:700">
            <label class="row small" style="gap:6px">Cancha base <select data-zc="${z.id}" style="width:auto;min-height:34px;padding:4px 8px;font-size:14px"><option value="">Cualquiera</option>
              ${S.canchas.filter(x => x.activa).map(x => `<option value="${x.id}" ${z.cancha_base_id === x.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label></div>
          <div class="list" style="margin-top:8px">${ez.map(e => `<div class="item"><div class="grow"><b>${esc(e.nombre)}</b> <span class="small muted">${esc(sindicato(e.sindicato_id)?.sigla || sindicato(e.sindicato_id)?.nombre || '')}</span></div>${selZona(e)}</div>`).join('') || '<div class="small muted">Sin equipos</div>'}</div></div>`;
      }).join('')}
      ${sinZona.length && zs.length ? `<div class="card flat" style="margin-top:10px;border-color:var(--sol)"><b>Sin zona (${sinZona.length})</b>
        <div class="list" style="margin-top:8px">${sinZona.map(e => `<div class="item"><div class="grow"><b>${esc(e.nombre)}</b></div>${selZona(e)}</div>`).join('')}</div></div>` : ''}
    </div>`;
  }).join('');

  $$('[data-armar]', box).forEach(b => b.onclick = () => conBoton(b, async () => {
    const cid = b.dataset.armar;
    const n = parseInt($(`[data-nz="${cid}"]`, box).value, 10) || 1;
    const zs = S.zonas.filter(z => z.categoria_id === cid);
    const pz = S.partidos.filter(p => p.categoria_id === cid && p.fase === 'zona');
    if (pz.some(p => p.estado !== 'programado')) throw new Error('Ya hay partidos de zona jugados: mové equipos a mano en lugar de rearmar.');
    if (zs.length && !await confirmar(`¿Rearmar en ${n} zona(s)? Se borran los ${pz.length} partidos de zona pendientes y se vuelven a generar.`, 'Rearmar', 'warn')) return;
    if (pz.length) await q(sb.from('partidos').delete().in('id', pz.map(p => p.id)));
    if (zs.length) await q(sb.from('zonas').delete().in('id', zs.map(z => z.id)));
    const activas = S.canchas.filter(c => c.activa);
    const nuevas = await q(sb.from('zonas').insert(Array.from({ length: n }, (_, i) => ({
      torneo_id: S.torneo.id, categoria_id: cid, nombre: 'Zona ' + String.fromCharCode(65 + i), orden: i + 1,
      cancha_base_id: activas.length ? activas[i % activas.length].id : null,
    }))).select());
    const reparto = repartirZonas(S.equipos.filter(e => e.categoria_id === cid), n);
    for (let i = 0; i < n; i++) {
      if (reparto[i].length) await q(sb.from('equipos').update({ zona_id: nuevas[i].id }).in('id', reparto[i].map(e => e.id)));
    }
    await cargarBase();
    await generarZona(cid);
    toast('Zonas armadas y partidos generados', 'ok'); re();
  }));
  $$('[data-gen]', box).forEach(b => b.onclick = () => conBoton(b, async () => { const r = await generarZona(b.dataset.gen); toast(r, 'ok'); re(); }));
  $$('[data-mover]', box).forEach(s => s.onchange = () => conBoton(s, async () => {
    await q(sb.from('equipos').update({ zona_id: s.value || null }).eq('id', s.dataset.mover));
    await cargarBase(); toast('Equipo movido. Tocá "Generar / actualizar partidos" para rehacer los cruces.'); re();
  }));
  $$('[data-zn]', box).forEach(i => i.onchange = () => conBoton(i, async () => { await q(sb.from('zonas').update({ nombre: i.value.trim() || 'Zona' }).eq('id', i.dataset.zn)); await cargarBase(); }));
  $$('[data-zc]', box).forEach(s => s.onchange = () => conBoton(s, async () => { await q(sb.from('zonas').update({ cancha_base_id: s.value || null }).eq('id', s.dataset.zc)); await cargarBase(); toast('Cancha base actualizada'); }));
}

/** Crea los cruces que faltan, borra los pendientes que ya no corresponden y ubica los nuevos en la grilla. */
async function generarZona(cid) {
  const zs = S.zonas.filter(z => z.categoria_id === cid);
  const nuevos = [], borrar = [];
  for (const z of zs) {
    const ids = S.equipos.filter(e => e.zona_id === z.id).map(e => e.id);
    const cruces = todosContraTodos(ids);
    const exist = S.partidos.filter(p => p.zona_id === z.id && p.fase === 'zona');
    const clave = (a, b) => [a, b].sort().join('|');
    const validas = new Set(cruces.map(([a, b]) => clave(a, b)));
    exist.forEach(p => { if (!validas.has(clave(p.local_id, p.visitante_id)) && p.estado === 'programado') borrar.push(p.id); });
    cruces.forEach(([a, b, r]) => {
      if (!exist.some(p => clave(p.local_id, p.visitante_id) === clave(a, b)))
        nuevos.push({ torneo_id: S.torneo.id, categoria_id: cid, zona_id: z.id, fase: 'zona', ronda: r, local_id: a, visitante_id: b });
    });
  }
  // Partidos de zona huérfanos (equipo sin zona)
  S.partidos.filter(p => p.categoria_id === cid && p.fase === 'zona' && p.estado === 'programado' && !zs.some(z => z.id === p.zona_id)).forEach(p => borrar.push(p.id));
  if (borrar.length) await q(sb.from('partidos').delete().in('id', borrar));
  if (nuevos.length) await q(sb.from('partidos').insert(nuevos));
  await cargarBase();
  const ub = programar(S.partidos);
  await guardarPartidos(ub);
  await cargarBase();
  return `${nuevos.length} partido(s) nuevo(s), ${borrar.length} quitado(s), ${ub.length} ubicado(s) en la grilla`;
}

// ───────── Grilla ─────────
function grillaUI(box, re) {
  const canchas = S.canchas.filter(c => c.activa || S.partidos.some(p => p.cancha_id === c.id && p.estado !== 'confirmado'))
    .sort((a, b) => a.orden - b.orden);
  const ps = S.partidos;
  const base = aFecha(T().hora_inicio).getTime();
  const ultimo = Math.max(base, ...ps.filter(p => p.inicio).map(ms));
  const nFilas = Math.max(6, Math.floor((ultimo - base) / PASO()) + 3);
  const conf = Object.fromEntries(ps.map(p => [p.id, conflictos(p)]));
  const nConf = Object.values(conf).filter(c => c.length).length;
  const sinUbicar = ps.filter(p => p.estado === 'programado' && (!p.inicio || !p.cancha_id));
  const arb = id => (S.staff || []).find(s => s.id === id)?.nombre;
  const filaDe = p => Math.floor((ms(p) - base) / PASO());
  const celda = (c, i) => ps.filter(p => p.cancha_id === c.id && p.inicio && filaDe(p) === i);

  box.innerHTML = `
    <div class="card" style="margin-bottom:10px">
      <div class="row">
        <button class="btn" id="ubicar">Ubicar sin horario (${sinUbicar.length})</button>
        <button class="btn sec" id="reordenar">Reordenar todo lo pendiente</button>
        <button class="btn sec" id="arbitros">Asignar árbitros</button>
        <button class="btn ${S.torneo.publicado ? 'warn' : 'ok'}" id="publicar">${S.torneo.publicado ? 'Ocultar fixture' : 'Publicar fixture'}</button>
        <button class="btn ghost" id="expGrilla">⬇ Imagen</button>
      </div>
      <p class="small muted" style="margin:8px 0 0">Tocá un partido para seleccionarlo y después una celda para moverlo (si está ocupada, se intercambian). Tocá dos veces para editarlo.
      Turnos de ${T().duracion_min}' + ${T().intervalo_min}' de recambio · descanso mínimo por equipo ${T().descanso_min}'.</p>
      ${nConf ? `<p class="badge b-error" style="margin-top:8px">${nConf} partido(s) con conflicto (en rojo)</p>` : ps.length ? '<p class="badge b-ok" style="margin-top:8px">Sin conflictos</p>' : ''}
    </div>
    ${!canchas.length ? '<div class="vacio">No hay canchas activas.</div>' : `
    <div class="grilla" id="grilla"><table>
      <thead><tr><th class="h">Hora</th>${canchas.map(c => `<th>${esc(c.nombre)}${!c.activa ? ' (inactiva)' : ''}<br><small style="font-weight:400">${esc(c.tipo || '')}</small></th>`).join('')}</tr></thead>
      <tbody>${Array.from({ length: nFilas }, (_, i) => {
        const t = base + i * PASO();
        return `<tr><td class="h">${hhmm(new Date(t))}</td>${canchas.map(c => {
          const fuera = !c.activa || (c.hora_desde && t < aFecha(c.hora_desde).getTime()) || (c.hora_hasta && t + DUR() > aFecha(c.hora_hasta).getTime());
          return `<td class="${fuera ? 'off' : ''} ${seleccion ? 'destino' : ''}" data-c="${c.id}" data-t="${t}">${celda(c, i).map(p =>
            `<div class="gc ${conf[p.id].length ? 'conf' : ''} ${p.estado === 'confirmado' ? 'jugado' : p.estado === 'en_juego' ? 'envivo' : ''} ${seleccion === p.id ? 'sel' : ''}" data-p="${p.id}" title="${esc(conf[p.id].join(' · '))}">
              <b>${esc(lado(p, 'l'))}</b><b>${esc(lado(p, 'v'))}</b>
              <span class="muted">${esc(p.fase === 'zona' ? zona(p.zona_id)?.nombre || '' : FASES[p.fase])}${ms(p) !== t ? ' · ' + fmtHora(p.inicio) : ''}</span>
              ${p.arbitro_id ? `<br><span class="muted">🧑‍⚖️ ${esc(arb(p.arbitro_id) || '')}</span>` : ''}
              ${conf[p.id].length ? `<br><span style="color:var(--error)">⚠ ${esc(conf[p.id][0])}</span>` : ''}</div>`).join('')}</td>`;
        }).join('')}</tr>`;
      }).join('')}</tbody></table></div>`}
    ${sinUbicar.length ? `<h3 style="margin-top:14px">Sin ubicar</h3><div class="list">${sinUbicar.map(p => `<div class="item click" data-edit="${p.id}"><b>${esc(lado(p, 'l'))} vs ${esc(lado(p, 'v'))}</b><span class="muted small">${esc(FASES[p.fase])}</span></div>`).join('')}</div>` : ''}`;

  const on = (s, fn) => { const b = $(s, box); if (b) b.onclick = () => conBoton(b, fn); };
  on('#ubicar', async () => { const c = programar(S.partidos); await guardarPartidos(c); await cargarBase(); toast(`${c.length} partido(s) ubicados`, 'ok'); re(); });
  on('#reordenar', async () => {
    if (!await confirmar('¿Reordenar todos los partidos pendientes? Se recalculan canchas y horarios (lo jugado o en juego no se toca).', 'Reordenar', 'warn')) return;
    const c = programar(S.partidos, { todos: true }); await guardarPartidos(c); await cargarBase(); toast(`${c.length} partido(s) reordenados`, 'ok'); re();
  });
  on('#arbitros', async () => {
    const todos = S.partidos.some(p => p.arbitro_id && p.estado === 'programado') && await confirmar('¿Redistribuir también los árbitros ya asignados?', 'Redistribuir todo');
    const c = asignarArbitros(S.partidos, { todos }); await guardarPartidos(c); await cargarBase();
    const sin = S.partidos.filter(p => p.estado === 'programado' && p.inicio && !p.arbitro_id).length;
    toast(`${c.length} asignación(es)${sin ? ` · ${sin} sin árbitro disponible` : ''}`, sin ? 'error' : 'ok'); re();
  });
  on('#publicar', async () => {
    if (!S.torneo.publicado && nConf && !await confirmar(`Hay ${nConf} conflicto(s). ¿Publicar igual?`, 'Publicar', 'warn')) return;
    await q(sb.from('torneos').update({ publicado: !S.torneo.publicado }).eq('id', S.torneo.id)); await cargarBase(); re();
  });
  on('#expGrilla', () => exportarImagen($('#grilla', box), 'grilla'));
  $$('[data-edit]', box).forEach(el => el.onclick = () => editarPartido(el.dataset.edit, re));

  $$('.gc', box).forEach(el => el.onclick = ev => {
    ev.stopPropagation();
    const id = el.dataset.p;
    if (seleccion === id) { seleccion = null; editarPartido(id, re); return; }
    if (seleccion) return moverA(el.closest('td'));
    seleccion = id; grillaUI(box, re);
  });
  $$('td[data-c]', box).forEach(td => td.onclick = () => { if (seleccion) moverA(td); });

  async function moverA(td) {
    const p = S.partidos.find(x => x.id === seleccion);
    seleccion = null;
    if (!p || p.estado === 'confirmado') { grillaUI(box, re); return; }
    const destino = { cancha_id: td.dataset.c, inicio: new Date(Number(td.dataset.t)).toISOString() };
    const otro = S.partidos.find(x => x.id !== p.id && x.cancha_id === destino.cancha_id && x.inicio && Math.abs(ms(x) - Number(td.dataset.t)) < PASO());
    const cambios = [{ ...p, ...destino }];
    if (otro) {
      if (otro.estado !== 'programado') { toast('Ese turno ya tiene un partido jugado', 'error'); grillaUI(box, re); return; }
      cambios.push({ ...otro, cancha_id: p.cancha_id, inicio: p.inicio });
    }
    try { await guardarPartidos(cambios); await cargarBase(); } catch (e) { toast(e.message, 'error'); }
    re();
  }
}

export function editarPartido(id, alGuardar) {
  const p = S.partidos.find(x => x.id === id);
  if (!p) return;
  const eqs = S.equipos.filter(e => e.categoria_id === p.categoria_id);
  const arbs = (S.staff || []).filter(s => s.activo && s.funcion === 'arbitro');
  const opt = (lista, sel, vacio) => `<option value="">${vacio}</option>` + lista.map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  const m = modal(`<h2>${esc(lado(p, 'l'))} vs ${esc(lado(p, 'v'))}</h2>
    <p class="small muted">${esc(FASES[p.fase])}${p.zona_id ? ' · ' + esc(zona(p.zona_id)?.nombre || '') : ''} · ${esc(categoria(p.categoria_id)?.nombre || '')} · ${p.estado}</p>
    <form class="stack">
      <div class="grid2"><label class="f">Local<select name="local_id">${opt(eqs, p.local_id, p.ref_l ? lado({ ...p, local_id: null }, 'l') : 'A definir')}</select></label>
        <label class="f">Visitante<select name="visitante_id">${opt(eqs, p.visitante_id, p.ref_v ? lado({ ...p, visitante_id: null }, 'v') : 'A definir')}</select></label></div>
      <div class="grid2"><label class="f">Cancha<select name="cancha_id">${opt(S.canchas, p.cancha_id, 'Sin cancha')}</select></label>
        <label class="f">Hora<input name="hora" type="time" value="${p.inicio ? fmtHora(p.inicio) : ''}"></label></div>
      <label class="f">Árbitro<select name="arbitro_id">${opt(arbs, p.arbitro_id, 'Sin árbitro')}</select></label>
      ${conflictos(p).length ? `<div class="badge b-error" style="white-space:normal">⚠ ${esc(conflictos(p).join(' · '))}</div>` : ''}
      <button class="btn block">Guardar</button>
      <div class="row"><a class="btn sec grow" href="#/planilla/${p.id}">Abrir planilla</a>
        ${p.estado === 'programado' ? '<button type="button" class="btn ghost" id="borrarP" style="color:var(--error)">Eliminar partido</button>' : ''}</div>
    </form>`);
  const f = $('form', m.el);
  f.onsubmit = ev => {
    ev.preventDefault();
    conBoton($('button', f), async () => {
      const d = formData(f);
      if (d.local_id && d.local_id === d.visitante_id) throw new Error('Local y visitante no pueden ser el mismo equipo.');
      await q(sb.from('partidos').update({
        local_id: d.local_id || null, visitante_id: d.visitante_id || null, cancha_id: d.cancha_id || null,
        inicio: d.hora ? aFecha(d.hora).toISOString() : null, arbitro_id: d.arbitro_id || null,
      }).eq('id', p.id));
      await cargarBase(); m.close(); toast('Partido actualizado', 'ok'); alGuardar && alGuardar();
    });
  };
  const b = $('#borrarP', m.el);
  if (b) b.onclick = () => conBoton(b, async () => {
    if (!await confirmar('¿Eliminar este partido?', 'Eliminar', 'danger')) return;
    await q(sb.from('partidos').delete().eq('id', p.id)); await cargarBase(); m.close(); alGuardar && alGuardar();
  });
}

// ───────── Llaves ─────────
function llavesUI(box, re) {
  box.innerHTML = S.categorias.map(c => {
    const zs = S.zonas.filter(z => z.categoria_id === c.id);
    const ll = S.partidos.filter(p => p.categoria_id === c.id && p.fase !== 'zona').sort((a, b) => RANGO_FASE[a.fase] - RANGO_FASE[b.fase] || a.orden_llave - b.orden_llave);
    return `<div class="card" style="margin-bottom:12px"><h2>${esc(c.nombre)}</h2>
      ${!zs.length ? '<div class="vacio" style="margin-top:8px">Primero armá las zonas.</div>' : `
      <form class="row" data-ll="${c.id}" style="margin:10px 0;align-items:flex-end">
        <label class="f" style="width:150px">Clasifican por zona<input name="k" type="number" min="1" max="8" value="${zs.length === 1 ? 4 : 2}"></label>
        <label class="check" style="margin-bottom:10px"><input type="checkbox" name="tercero"> 3er puesto</label>
        <button class="btn">${ll.length ? 'Regenerar llaves' : 'Generar llaves'}</button>
      </form>
      <p class="small muted">${zs.length} zona(s). Los cruces se arman ahora con los lugares ("1° Zona A") y se completan solos cuando terminan las zonas. Tienen que quedar 2, 4, 8 o 16 equipos.</p>`}
      ${ll.length ? `<div class="list">${ll.map(p => `<div class="item click" data-edit="${p.id}"><span class="badge b-info">${FASES[p.fase]} ${p.orden_llave || ''}</span>
        <div class="grow"><b>${esc(lado(p, 'l'))}</b> vs <b>${esc(lado(p, 'v'))}</b></div><span class="small muted">${p.inicio ? fmtHora(p.inicio) + ' · ' + esc(cancha(p.cancha_id)?.nombre || '') : 'Sin horario'}</span></div>`).join('')}</div>
        <button class="btn sec" data-res="1" style="margin-top:10px">Actualizar cruces con resultados</button>` : ''}
    </div>`;
  }).join('');
  $$('[data-edit]', box).forEach(el => el.onclick = () => editarPartido(el.dataset.edit, re));
  $$('[data-res]', box).forEach(b => b.onclick = () => conBoton(b, async () => { const n = await resolverLlaves(); toast(n ? `${n} cruce(s) actualizados` : 'Nada para actualizar todavía'); re(); }));
  $$('[data-ll]', box).forEach(f => f.onsubmit = ev => {
    ev.preventDefault();
    conBoton($('button', f), async () => {
      const cid = f.dataset.ll, k = parseInt(f.k.value, 10), tercero = f.tercero.checked;
      const zs = S.zonas.filter(z => z.categoria_id === cid).sort((a, b) => a.orden - b.orden);
      const n = zs.length * k;
      if (![2, 4, 8, 16].includes(n)) throw new Error(`Con ${zs.length} zona(s) y ${k} clasificado(s) quedan ${n} equipos. Tiene que dar 2, 4, 8 o 16.`);
      const viejas = S.partidos.filter(p => p.categoria_id === cid && p.fase !== 'zona');
      if (viejas.some(p => p.estado !== 'programado')) throw new Error('Ya se jugaron partidos de llave: no se pueden regenerar.');
      if (viejas.length && !await confirmar(`¿Regenerar? Se borran ${viejas.length} cruce(s) pendientes.`, 'Regenerar', 'warn')) return;
      if (viejas.length) await q(sb.from('partidos').delete().in('id', viejas.map(p => p.id)));
      const seeds = [];
      for (let pos = 1; pos <= k; pos++) zs.forEach(z => seeds.push(`Z:${z.id}:${pos}`));
      const faseDe = m => ({ 8: 'octavos', 4: 'cuartos', 2: 'semi', 1: 'final' }[m]);
      const comun = { torneo_id: S.torneo.id, categoria_id: cid };
      let ronda = [];
      for (let i = 0; i < n / 2; i++) ronda.push({ ...comun, fase: faseDe(n / 2), ronda: 1, orden_llave: i + 1, ref_l: seeds[i], ref_v: seeds[n - 1 - i] });
      ronda = await q(sb.from('partidos').insert(ronda).select());
      let r = 2;
      while (ronda.length > 1) {
        ronda.sort((a, b) => a.orden_llave - b.orden_llave);
        const sig = [];
        for (let i = 0; i < ronda.length / 2; i++) sig.push({ ...comun, fase: faseDe(ronda.length / 2), ronda: r, orden_llave: i + 1, ref_l: 'G:' + ronda[i].id, ref_v: 'G:' + ronda[ronda.length - 1 - i].id });
        if (ronda.length === 2 && tercero) await q(sb.from('partidos').insert({ ...comun, fase: 'tercero', ronda: r, orden_llave: 1, ref_l: 'P:' + ronda[0].id, ref_v: 'P:' + ronda[1].id }));
        ronda = await q(sb.from('partidos').insert(sig).select());
        r++;
      }
      await cargarBase();
      const ub = programar(S.partidos); await guardarPartidos(ub); await cargarBase();
      await resolverLlaves();
      toast('Llaves generadas y ubicadas en la grilla', 'ok'); re();
    });
  });
}
