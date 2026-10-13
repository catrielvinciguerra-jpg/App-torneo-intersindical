// Panel de la organización: semáforo general, torneo, canchas, equipos, fixture, partidos, staff, usuarios, sindicatos y mensajes.
import { S, sb, q, $, $$, esc, cabecera, accionesSesion, bindSesion, toast, modal, confirmar, conBoton, formData,
  cargarBase, apto, edadOk, categoria, cancha, sindicato, eq, lado, tarjetaPartido, fmtHora, waLink, waBtn, mailBtn,
  ROLES } from './core.js';
import { panelEquipos } from './equipos.js';
import { panelFixture, conflictos, resolverLlaves } from './fixture.js';

const TABS = [['panel', 'Panel'], ['torneo', 'Torneo'], ['canchas', 'Canchas'], ['equipos', 'Equipos'], ['fixture', 'Fixture'],
  ['partidos', 'Partidos'], ['staff', 'Árbitros'], ['usuarios', 'Usuarios'], ['sindicatos', 'Sindicatos'], ['mensajes', 'Mensajes']];
const APP_URL = () => location.origin + location.pathname;

async function cargarStaff() {
  S.staff = await q(sb.from('staff').select('*').eq('torneo_id', S.torneo.id).order('nombre'));
  S.perfiles = await q(sb.from('perfiles').select('*').order('nombre'));
}

export async function vistaAdmin(root, tab = 'panel') {
  if (!TABS.some(([k]) => k === tab)) tab = 'panel';
  await cargarStaff();
  try { await resolverLlaves(); } catch { /* sin datos suficientes todavía */ }
  const pendientes = S.equipos.filter(e => e.estado_lista === 'enviada').length;
  root.innerHTML = cabecera('Organización · ' + S.perfil.nombre, `<a href="#/" style="color:#fff"><button>Público</button></a>` + accionesSesion()) + `
    <main class="wrap">
      <nav class="tabs">${TABS.map(([k, n]) => `<a class="tab ${k === tab ? 'on' : ''}" href="#/admin/${k}" style="text-decoration:none;color:inherit">${n}${k === 'equipos' && pendientes ? `<span class="n">${pendientes}</span>` : ''}</a>`).join('')}</nav>
      <section id="adm"></section>
    </main>`;
  bindSesion(root);
  const box = $('#adm', root);
  const re = () => vistaAdmin(root, tab);
  await ({ panel, torneo, canchas, equipos: panelEquipos, fixture: panelFixture, partidos, staff, usuarios, sindicatos, mensajes }[tab])(box, re);
}

// ───────── Panel con semáforos ─────────
async function panel(box) {
  const ids = S.equipos.map(e => e.id);
  const pl = ids.length ? await q(sb.from('plantel').select('equipo_id, jugador_id').in('equipo_id', ids)) : [];
  const datos = pl.length ? await q(sb.from('jugadores_datos').select('jugador_id, fecha_nac, apto_vence, apto_presentado').in('jugador_id', pl.map(p => p.jugador_id))) : [];
  const D = Object.fromEntries(datos.map(d => [d.jugador_id, d]));
  const sinApto = pl.filter(p => apto(D[p.jugador_id]).cls === 'error').length;
  const fueraEdad = pl.filter(p => edadOk(D[p.jugador_id], categoria(eq(p.equipo_id)?.categoria_id)) === false).length;
  const cuenta = est => S.equipos.filter(e => e.estado_lista === est).length;
  const ps = S.partidos;
  const conConf = ps.filter(p => conflictos(p).length).length;
  const sinArb = ps.filter(p => p.estado === 'programado' && p.inicio && !p.arbitro_id).length;
  const canSinResp = S.canchas.filter(c => c.activa && !c.responsable_id).length;
  const vivo = ps.filter(p => p.estado === 'en_juego');
  const k = (n, txt, cls, href) => `<a class="kpi ${cls}" href="${href}" style="text-decoration:none;color:inherit"><b>${n}</b><span>${txt}</span></a>`;
  box.innerHTML = `
    <h2 style="margin-bottom:8px">Inscripción</h2>
    <div class="kpis">
      ${k(S.equipos.length, 'Equipos inscriptos', 'ok', '#/admin/equipos')}
      ${k(cuenta('enviada'), 'Listas para validar', cuenta('enviada') ? 'warn' : 'ok', '#/admin/equipos')}
      ${k(cuenta('observada'), 'Listas observadas', cuenta('observada') ? 'warn' : 'ok', '#/admin/equipos')}
      ${k(cuenta('validada'), 'Listas validadas', 'ok', '#/admin/equipos')}
      ${k(pl.length, 'Jugadores', 'ok', '#/admin/equipos')}
      ${k(sinApto, 'Sin apto vigente', sinApto ? 'error' : 'ok', '#/admin/equipos')}
      ${k(fueraEdad, 'Fuera de categoría', fueraEdad ? 'error' : 'ok', '#/admin/equipos')}
    </div>
    <h2 style="margin:16px 0 8px">Organización</h2>
    <div class="kpis">
      ${k(S.canchas.filter(c => c.activa).length, 'Canchas activas', 'ok', '#/admin/canchas')}
      ${k(canSinResp, 'Canchas sin responsable', canSinResp ? 'warn' : 'ok', '#/admin/canchas')}
      ${k((S.staff || []).filter(s => s.activo).length, 'Árbitros', (S.staff || []).length ? 'ok' : 'warn', '#/admin/staff')}
      ${k(ps.length, 'Partidos', 'ok', '#/admin/fixture')}
      ${k(conConf, 'Con conflicto', conConf ? 'error' : 'ok', '#/admin/fixture')}
      ${k(sinArb, 'Sin árbitro', sinArb ? 'warn' : 'ok', '#/admin/fixture')}
      ${k(ps.filter(p => p.estado === 'confirmado').length + '/' + ps.length, 'Planillas confirmadas', 'ok', '#/admin/partidos')}
      ${k(S.torneo.publicado ? 'Sí' : 'No', 'Fixture publicado', S.torneo.publicado ? 'ok' : 'warn', '#/admin/fixture')}
    </div>
    ${vivo.length ? `<h2 style="margin:16px 0 8px"><span class="vivo">En juego</span></h2><div class="list">${vivo.map(p => tarjetaPartido(p, { click: true })).join('')}</div>` : ''}`;
  $$('[data-partido]', box).forEach(el => el.onclick = () => location.hash = '#/planilla/' + el.dataset.partido);
}

// ───────── Torneo y categorías ─────────
async function torneo(box, re) {
  const t = S.torneo;
  box.innerHTML = `
    <form class="card stack" id="fT">
      <h2>Datos del torneo</h2>
      <label class="f">Nombre<input name="nombre" required value="${esc(t.nombre)}"></label>
      <div class="grid2"><label class="f">Fecha<input name="fecha" type="date" value="${esc(t.fecha || '')}"></label>
        <label class="f">Hora de inicio<input name="hora_inicio" type="time" value="${esc(t.hora_inicio.slice(0, 5))}"></label></div>
      <div class="grid2"><label class="f">Sede<input name="sede" value="${esc(t.sede || '')}"></label>
        <label class="f">Dirección<input name="direccion" value="${esc(t.direccion || '')}"></label></div>
      <div class="grid3"><label class="f">Duración (min)<input name="duracion_min" type="number" min="5" max="120" value="${t.duracion_min}"></label>
        <label class="f">Recambio (min)<input name="intervalo_min" type="number" min="0" max="60" value="${t.intervalo_min}"></label>
        <label class="f">Descanso mín. por equipo<input name="descanso_min" type="number" min="0" max="240" value="${t.descanso_min}"></label></div>
      <div class="grid2" style="grid-template-columns:repeat(4,1fr)"><label class="f">Pts ganado<input name="pts_ganado" type="number" min="0" value="${t.pts_ganado}"></label>
        <label class="f">Pts empate<input name="pts_empate" type="number" min="0" value="${t.pts_empate}"></label>
        <label class="f">FP 🟨<input name="fp_amarilla" type="number" min="0" value="${t.fp_amarilla}"></label>
        <label class="f">FP 🟥<input name="fp_roja" type="number" min="0" value="${t.fp_roja}"></label></div>
      <button class="btn">Guardar</button>
      <p class="small muted" style="margin:0">Si cambiás duración, recambio o descanso, después usá "Reordenar todo lo pendiente" en la grilla.</p>
    </form>
    <div class="card" style="margin-top:12px"><div class="row between"><h2>Categorías</h2><button class="btn sm" id="addCat">+ Categoría</button></div>
      <div class="list" style="margin-top:8px">${S.categorias.map(c => `<div class="item click" data-cat="${c.id}"><div class="grow"><b>${esc(c.nombre)}</b>
        <div class="small muted">${c.edad_min ? 'Desde ' + c.edad_min + ' años' : ''}${c.edad_max ? ' · hasta ' + c.edad_max : ''}${!c.edad_min && !c.edad_max ? 'Sin límite de edad' : ''}</div></div>
        <span class="small muted">${S.equipos.filter(e => e.categoria_id === c.id).length} equipos</span></div>`).join('')}</div>
      <p class="small muted">La edad se controla al día del torneo con la fecha de nacimiento de cada jugador.</p></div>
    <div class="card" style="margin-top:12px"><h2>Otras ediciones</h2>
      <div class="list" style="margin-top:8px">${S.torneos.map(x => `<div class="item"><div class="grow"><b>${esc(x.nombre)}</b><div class="small muted">${esc(x.fecha || 'sin fecha')}</div></div>
        ${x.activo ? '<span class="badge b-ok">Activo</span>' : `<button class="btn sm sec" data-act="${x.id}">Activar</button>`}</div>`).join('')}</div>
      <button class="btn sec" id="nuevoT" style="margin-top:10px">+ Nueva edición (copia categorías, canchas y árbitros)</button></div>`;
  const f = $('#fT', box);
  f.onsubmit = ev => { ev.preventDefault(); conBoton($('button', f), async () => {
    const d = formData(f);
    ['duracion_min', 'intervalo_min', 'descanso_min', 'pts_ganado', 'pts_empate', 'fp_amarilla', 'fp_roja'].forEach(k => d[k] = parseInt(d[k], 10) || 0);
    d.fecha = d.fecha || null;
    await q(sb.from('torneos').update(d).eq('id', t.id)); await cargarBase(); toast('Torneo guardado', 'ok'); re();
  }); };
  const formCat = c => {
    const m = modal(`<h2>${c ? 'Editar' : 'Nueva'} categoría</h2><form class="stack" style="margin-top:10px">
      <label class="f">Nombre<input name="nombre" required value="${esc(c?.nombre || '')}" placeholder="Ej: Masculino libre, Femenino, +40"></label>
      <div class="grid2"><label class="f">Edad mínima<input name="edad_min" type="number" min="0" value="${c?.edad_min ?? ''}"></label>
        <label class="f">Edad máxima<input name="edad_max" type="number" min="0" value="${c?.edad_max ?? ''}"></label></div>
      <button class="btn block">Guardar</button>${c ? '<button type="button" class="btn ghost block" id="delCat" style="color:var(--error)">Eliminar</button>' : ''}</form>`);
    const fc = $('form', m.el);
    fc.onsubmit = ev => { ev.preventDefault(); conBoton($('button', fc), async () => {
      const d = formData(fc);
      const fila = { nombre: d.nombre, edad_min: d.edad_min ? +d.edad_min : null, edad_max: d.edad_max ? +d.edad_max : null };
      if (c) await q(sb.from('categorias').update(fila).eq('id', c.id));
      else await q(sb.from('categorias').insert({ ...fila, torneo_id: t.id, orden: S.categorias.length + 1 }));
      await cargarBase(); m.close(); re();
    }); };
    const del = $('#delCat', m.el);
    if (del) del.onclick = () => conBoton(del, async () => {
      if (!await confirmar(`¿Eliminar la categoría ${c.nombre}?`, 'Eliminar', 'danger')) return;
      await q(sb.from('categorias').delete().eq('id', c.id)); await cargarBase(); m.close(); re();
    });
  };
  $('#addCat', box).onclick = () => formCat(null);
  $$('[data-cat]', box).forEach(el => el.onclick = () => formCat(S.categorias.find(c => c.id === el.dataset.cat)));
  $$('[data-act]', box).forEach(b => b.onclick = () => conBoton(b, async () => {
    if (!await confirmar('¿Activar esa edición? La pantalla pública pasa a mostrarla.', 'Activar')) return;
    await q(sb.from('torneos').update({ activo: false }).eq('id', t.id));
    await q(sb.from('torneos').update({ activo: true }).eq('id', b.dataset.act));
    await cargarBase(); re();
  }));
  $('#nuevoT', box).onclick = () => {
    const m = modal(`<h2>Nueva edición</h2><form class="stack" style="margin-top:10px">
      <label class="f">Nombre<input name="nombre" required value="${esc(t.nombre)}"></label>
      <label class="f">Fecha<input name="fecha" type="date"></label>
      <button class="btn block">Crear y activar</button></form>`);
    const fn = $('form', m.el);
    fn.onsubmit = ev => { ev.preventDefault(); conBoton($('button', fn), async () => {
      const d = formData(fn);
      const { id: _i, created_at: _c, publicado: _p, ...resto } = t;
      const nuevo = await q(sb.from('torneos').insert({ ...resto, nombre: d.nombre, fecha: d.fecha || null, activo: false, publicado: false }).select().single());
      if (S.categorias.length) await q(sb.from('categorias').insert(S.categorias.map(({ id, torneo_id, ...c }) => ({ ...c, torneo_id: nuevo.id }))));
      if (S.canchas.length) await q(sb.from('canchas').insert(S.canchas.map(({ id, torneo_id, ...c }) => ({ ...c, torneo_id: nuevo.id }))));
      if (S.staff.length) await q(sb.from('staff').insert(S.staff.map(({ id, torneo_id, token, ...s }) => ({ ...s, torneo_id: nuevo.id }))));
      await q(sb.from('torneos').update({ activo: false }).eq('id', t.id));
      await q(sb.from('torneos').update({ activo: true }).eq('id', nuevo.id));
      await cargarBase(); m.close(); toast('Nueva edición creada', 'ok'); re();
    }); };
  };
}

// ───────── Canchas ─────────
async function canchas(box, re) {
  const resp = (S.perfiles || []).filter(p => p.rol === 'resp_cancha' && p.activo);
  const pend = id => S.partidos.filter(p => p.cancha_id === id && p.estado === 'programado').length;
  box.innerHTML = `<div class="row between" style="margin-bottom:10px"><h2>Canchas</h2><button class="btn" id="addC">+ Cancha</button></div>
    ${!resp.length ? '<p class="badge b-warn" style="white-space:normal">No hay usuarios con rol "Responsable de cancha". Crealos en Usuarios para poder asignarlos.</p>' : ''}
    <div class="list">${S.canchas.map(c => {
      const r = (S.perfiles || []).find(p => p.id === c.responsable_id);
      return `<div class="item click" data-c="${c.id}" style="${c.activa ? '' : 'opacity:.6'}">
        <span class="dot d-${c.activa ? 'ok' : 'gris'}"></span>
        <div class="grow"><b>${esc(c.nombre)}</b> <span class="small muted">${esc(c.tipo)}</span>
          <div class="small muted">${r ? '👤 ' + esc(r.nombre) : '<span style="color:var(--warn)">Sin responsable</span>'}
          ${c.hora_desde || c.hora_hasta ? ` · 🕑 ${c.hora_desde?.slice(0, 5) || '…'}–${c.hora_hasta?.slice(0, 5) || '…'}` : ''} · ${pend(c.id)} partidos pendientes</div></div>
        ${r?.tel ? waBtn(r.tel, `Hola ${r.nombre}, sos responsable de ${c.nombre} en el ${S.torneo.nombre}. Tus partidos y planillas: ${APP_URL()}#/cancha`, 'WA') : ''}
      </div>`;
    }).join('') || '<div class="vacio">Sin canchas.</div>'}</div>
    <p class="small muted">Quitar una cancha la desactiva (no se pierde lo jugado). Si tiene partidos pendientes, se reubican en las demás.</p>`;
  const form = c => {
    const m = modal(`<h2>${c ? 'Editar' : 'Nueva'} cancha</h2><form class="stack" style="margin-top:10px">
      <div class="grid2"><label class="f">Nombre<input name="nombre" required value="${esc(c?.nombre || 'Cancha ' + (S.canchas.length + 1))}"></label>
        <label class="f">Tipo<select name="tipo">${['F5', 'F7', 'F8', 'F11'].map(x => `<option ${c?.tipo === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
      <label class="f">Responsable<select name="responsable_id"><option value="">Sin responsable</option>
        ${resp.map(p => `<option value="${p.id}" ${c?.responsable_id === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
      <div class="grid2"><label class="f">Disponible desde<input name="hora_desde" type="time" value="${esc(c?.hora_desde?.slice(0, 5) || '')}"></label>
        <label class="f">Hasta<input name="hora_hasta" type="time" value="${esc(c?.hora_hasta?.slice(0, 5) || '')}"></label></div>
      <label class="f">Orden en la grilla<input name="orden" type="number" value="${c?.orden ?? S.canchas.length + 1}"></label>
      <button class="btn block">Guardar</button>
      ${c ? `<button type="button" class="btn ${c.activa ? 'warn' : 'ok'} block" id="toggle">${c.activa ? 'Quitar cancha (desactivar)' : 'Reactivar cancha'}</button>` : ''}
    </form>`);
    const f = $('form', m.el);
    f.onsubmit = ev => { ev.preventDefault(); conBoton($('button', f), async () => {
      const d = formData(f);
      const fila = { nombre: d.nombre, tipo: d.tipo, responsable_id: d.responsable_id || null, hora_desde: d.hora_desde || null, hora_hasta: d.hora_hasta || null, orden: +d.orden || 0 };
      if (c) await q(sb.from('canchas').update(fila).eq('id', c.id));
      else await q(sb.from('canchas').insert({ ...fila, torneo_id: S.torneo.id }));
      await cargarBase(); m.close(); toast('Cancha guardada', 'ok'); re();
    }); };
    const tg = $('#toggle', m.el);
    if (tg) tg.onclick = () => conBoton(tg, async () => {
      if (c.activa) {
        const n = pend(c.id);
        if (!await confirmar(`¿Quitar ${c.nombre}?${n ? ` Sus ${n} partido(s) pendientes se reubican en las otras canchas.` : ''}`, 'Quitar', 'warn')) return;
        await q(sb.from('canchas').update({ activa: false }).eq('id', c.id));
        await cargarBase();
        if (n) {
          const { programar } = await import('./fixture.js');
          const sinLugar = S.partidos.map(p => p.cancha_id === c.id && p.estado === 'programado' ? { ...p, cancha_id: null, inicio: null } : p);
          const cambios = programar(sinLugar);
          await q(sb.from('partidos').upsert(cambios.map(({ id, torneo_id, categoria_id, fase, cancha_id, inicio }) => ({ id, torneo_id, categoria_id, fase, cancha_id, inicio }))));
          await cargarBase();
          toast(`${cambios.length} partido(s) reubicados`, 'ok');
        }
      } else {
        await q(sb.from('canchas').update({ activa: true }).eq('id', c.id)); await cargarBase();
      }
      m.close(); re();
    });
  };
  $('#addC', box).onclick = () => form(null);
  $$('[data-c]', box).forEach(el => el.onclick = ev => { if (ev.target.closest('a')) return; form(S.canchas.find(c => c.id === el.dataset.c)); });
}

// ───────── Partidos y planillas ─────────
let filtroCancha = '';
async function partidos(box, re) {
  const ps = S.partidos.filter(p => !filtroCancha || p.cancha_id === filtroCancha).sort((a, b) => new Date(a.inicio || 8.64e15) - new Date(b.inicio || 8.64e15));
  box.innerHTML = `<div class="row between" style="margin-bottom:10px"><h2>Partidos y planillas</h2>
    <select id="fc" style="width:auto"><option value="">Todas las canchas</option>${S.canchas.map(c => `<option value="${c.id}" ${c.id === filtroCancha ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>
    <div class="list">${ps.map(p => tarjetaPartido(p, { click: true })).join('') || '<div class="vacio">Sin partidos. Armalos en Fixture.</div>'}</div>`;
  $('#fc', box).onchange = e => { filtroCancha = e.target.value; partidos(box, re); };
  $$('[data-partido]', box).forEach(el => el.onclick = () => location.hash = '#/planilla/' + el.dataset.partido);
}

// ───────── Árbitros (sin usuario: link personal) ─────────
async function staff(box, re) {
  const carga = id => S.partidos.filter(p => p.arbitro_id === id).length;
  box.innerHTML = `<div class="row between" style="margin-bottom:10px"><h2>Árbitros</h2><button class="btn" id="addS">+ Árbitro</button></div>
    <p class="small muted">No necesitan usuario: cada uno recibe un link personal con sus partidos. Son de la organización.</p>
    <div class="list">${S.staff.map(s => {
      const link = `${APP_URL()}#/arbitro/${s.token}`;
      return `<div class="item click" data-s="${s.id}" style="${s.activo ? '' : 'opacity:.55'}"><div class="grow"><b>${esc(s.nombre)}</b>
        <div class="small muted">${carga(s.id)} partido(s)${s.disponible_desde || s.disponible_hasta ? ` · disponible ${s.disponible_desde?.slice(0, 5) || '…'}–${s.disponible_hasta?.slice(0, 5) || '…'}` : ''}${s.activo ? '' : ' · inactivo'}</div></div>
        ${s.tel ? waBtn(s.tel, `Hola ${s.nombre}, estos son tus partidos para el ${S.torneo.nombre}: ${link}`, 'Enviar link') : `<button class="btn sm sec" data-copy="${esc(link)}">Copiar link</button>`}</div>`;
    }).join('') || '<div class="vacio">Sin árbitros cargados.</div>'}</div>`;
  const form = s => {
    const m = modal(`<h2>${s ? 'Editar' : 'Nuevo'} árbitro</h2><form class="stack" style="margin-top:10px">
      <label class="f">Nombre y apellido<input name="nombre" required value="${esc(s?.nombre || '')}"></label>
      <div class="grid2"><label class="f">WhatsApp<input name="tel" inputmode="tel" value="${esc(s?.tel || '')}"></label>
        <label class="f">Mail<input name="mail" type="email" value="${esc(s?.mail || '')}"></label></div>
      <div class="grid2"><label class="f">Disponible desde<input name="disponible_desde" type="time" value="${esc(s?.disponible_desde?.slice(0, 5) || '')}"></label>
        <label class="f">Hasta<input name="disponible_hasta" type="time" value="${esc(s?.disponible_hasta?.slice(0, 5) || '')}"></label></div>
      <label class="check"><input type="checkbox" name="activo" ${s?.activo === false ? '' : 'checked'}> Activo</label>
      <button class="btn block">Guardar</button></form>`);
    const f = $('form', m.el);
    f.onsubmit = ev => { ev.preventDefault(); conBoton($('button', f), async () => {
      const d = formData(f);
      const fila = { nombre: d.nombre, tel: d.tel || null, mail: d.mail || null, disponible_desde: d.disponible_desde || null, disponible_hasta: d.disponible_hasta || null, activo: d.activo, funcion: 'arbitro' };
      if (s) await q(sb.from('staff').update(fila).eq('id', s.id));
      else await q(sb.from('staff').insert({ ...fila, torneo_id: S.torneo.id }));
      m.close(); re();
    }); };
  };
  $('#addS', box).onclick = () => form(null);
  $$('[data-s]', box).forEach(el => el.onclick = ev => { if (ev.target.closest('a,button')) return; form(S.staff.find(s => s.id === el.dataset.s)); });
  $$('[data-copy]', box).forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Link copiado', 'ok'); } catch { prompt('Copiá el link:', b.dataset.copy); } });
}

// ───────── Usuarios (función admin-usuarios en el servidor) ─────────
async function llamarUsuarios(body) {
  const { data, error } = await sb.functions.invoke('admin-usuarios', { body });
  if (error) {
    let m = error.message;
    try { m = (await error.context.json()).error || m; } catch {}
    throw new Error(m);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
function claveAleatoria() {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), n => a[n % a.length]).join('');
}
function mensajeCredenciales(nombre, email, clave, rol) {
  return `Hola ${nombre}. Tu acceso al ${S.torneo.nombre} (${ROLES[rol]}):\n${APP_URL()}#/login\nMail: ${email}\nClave: ${clave}\nTe recomendamos no compartirla.`;
}
async function usuarios(box, re) {
  const ps = S.perfiles || [];
  box.innerHTML = `<div class="row between" style="margin-bottom:10px"><h2>Usuarios</h2><button class="btn" id="addU">+ Usuario</button></div>
    <p class="small muted">Organización, responsables de cancha, responsables sindicales y DT ingresan con mail y la clave que les da la organización.</p>
    ${Object.entries(ROLES).map(([r, n]) => {
      const l = ps.filter(p => p.rol === r);
      return `<h3 style="margin:14px 0 6px">${n} (${l.length})</h3><div class="list">${l.map(p => `<div class="item click" data-u="${p.id}" style="${p.activo ? '' : 'opacity:.5'}">
        <div class="grow"><b>${esc(p.nombre)}</b><div class="small muted">${esc(p.mail || '')}${p.sindicato_id ? ' · ' + esc(sindicato(p.sindicato_id)?.nombre || '') : ''}${p.activo ? '' : ' · dado de baja'}</div></div>
        ${waBtn(p.tel, `Hola ${p.nombre}, te escribimos de la organización del ${S.torneo.nombre}.`, 'WA')}</div>`).join('') || '<div class="small muted">—</div>'}</div>`;
    }).join('')}`;
  const form = p => {
    const clave = claveAleatoria();
    const m = modal(`<h2>${p ? 'Editar usuario' : 'Nuevo usuario'}</h2><form class="stack" style="margin-top:10px">
      <label class="f">Nombre y apellido<input name="nombre" required value="${esc(p?.nombre || '')}"></label>
      ${p ? `<p class="small muted" style="margin:0">${esc(p.mail || '')}</p>` : '<label class="f">Mail<input name="email" type="email" required></label>'}
      <label class="f">Rol<select name="rol">${Object.entries(ROLES).map(([r, n]) => `<option value="${r}" ${p?.rol === r ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="f">Sindicato (obligatorio para responsable sindical)<select name="sindicato_id"><option value="">—</option>
        ${S.sindicatos.map(s => `<option value="${s.id}" ${p?.sindicato_id === s.id ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select></label>
      <label class="f">WhatsApp<input name="tel" inputmode="tel" value="${esc(p?.tel || '')}"></label>
      ${!p ? `<label class="f">Clave inicial<input name="password" required minlength="8" value="${clave}"></label>` : ''}
      <button class="btn block">${p ? 'Guardar' : 'Crear usuario'}</button>
      ${p ? `<button type="button" class="btn sec block" id="reset">Generar clave nueva</button>
        ${p.id !== S.perfil.id ? `<button type="button" class="btn ${p.activo ? 'danger' : 'ok'} block" id="baja">${p.activo ? 'Dar de baja' : 'Reactivar'}</button>` : ''}` : ''}
    </form>`);
    const f = $('form', m.el);
    f.onsubmit = ev => { ev.preventDefault(); conBoton($('button', f), async () => {
      const d = formData(f);
      if (p) {
        await llamarUsuarios({ accion: 'editar', id: p.id, nombre: d.nombre, rol: d.rol, sindicato_id: d.sindicato_id || null, tel: d.tel });
        m.close(); toast('Usuario actualizado', 'ok'); re(); return;
      }
      await llamarUsuarios({ accion: 'crear', ...d, sindicato_id: d.sindicato_id || null });
      m.close();
      compartir(d.nombre, d.email, d.password, d.rol, d.tel);
      await cargarStaff();
    }); };
    const rs = $('#reset', m.el);
    if (rs) rs.onclick = () => conBoton(rs, async () => {
      const nueva = claveAleatoria();
      await llamarUsuarios({ accion: 'clave', id: p.id, password: nueva });
      m.close(); compartir(p.nombre, p.mail, nueva, p.rol, p.tel);
    });
    const bj = $('#baja', m.el);
    if (bj) bj.onclick = () => conBoton(bj, async () => {
      if (p.activo && !await confirmar(`¿Dar de baja a ${p.nombre}? No va a poder ingresar.`, 'Dar de baja', 'danger')) return;
      await llamarUsuarios({ accion: 'editar', id: p.id, activo: !p.activo });
      m.close(); re();
    });
  };
  function compartir(nombre, email, clave, rol, tel) {
    const txt = mensajeCredenciales(nombre, email, clave, rol);
    const m = modal(`<h2>Acceso listo</h2><p>Enviale estos datos. La clave no se vuelve a mostrar.</p>
      <pre style="white-space:pre-wrap;background:var(--campo);padding:12px;border-radius:10px">${esc(txt)}</pre>
      <div class="row">${tel ? `<a class="btn wa" target="_blank" rel="noopener" href="${esc(waLink(tel, txt))}">Enviar por WhatsApp</a>` : ''}
      ${mailBtn(email, 'Acceso ' + S.torneo.nombre, txt)}<button class="btn sec" id="cp">Copiar</button></div>`, { onClose: re });
    $('#cp', m.el).onclick = async () => { try { await navigator.clipboard.writeText(txt); toast('Copiado', 'ok'); } catch { toast('No se pudo copiar', 'error'); } };
  }
  $('#addU', box).onclick = () => form(null);
  $$('[data-u]', box).forEach(el => el.onclick = ev => { if (ev.target.closest('a')) return; form(ps.find(p => p.id === el.dataset.u)); });
}

// ───────── Sindicatos ─────────
async function sindicatos(box, re) {
  box.innerHTML = `<div class="row between" style="margin-bottom:10px"><h2>Sindicatos</h2><button class="btn" id="addSin">+ Sindicato</button></div>
    <div class="list">${S.sindicatos.map(s => `<div class="item click" data-sin="${s.id}"><div class="grow"><b>${esc(s.nombre)}</b> ${s.sigla ? `<span class="badge b-info">${esc(s.sigla)}</span>` : ''}
      <div class="small muted">${S.equipos.filter(e => e.sindicato_id === s.id).length} equipos${s.contacto_nombre ? ' · ' + esc(s.contacto_nombre) : ''}</div></div>
      ${waBtn(s.contacto_tel, `Hola ${s.contacto_nombre || ''}, te escribimos de la organización del ${S.torneo.nombre}.`, 'WA')}${mailBtn(s.contacto_mail, S.torneo.nombre)}</div>`).join('') || '<div class="vacio">Sin sindicatos.</div>'}</div>`;
  const form = s => {
    const m = modal(`<h2>${s ? 'Editar' : 'Nuevo'} sindicato</h2><form class="stack" style="margin-top:10px">
      <div class="grid2"><label class="f">Nombre<input name="nombre" required value="${esc(s?.nombre || '')}"></label>
        <label class="f">Sigla<input name="sigla" maxlength="12" value="${esc(s?.sigla || '')}"></label></div>
      <label class="f">Contacto<input name="contacto_nombre" value="${esc(s?.contacto_nombre || '')}"></label>
      <div class="grid2"><label class="f">WhatsApp<input name="contacto_tel" inputmode="tel" value="${esc(s?.contacto_tel || '')}"></label>
        <label class="f">Mail<input name="contacto_mail" type="email" value="${esc(s?.contacto_mail || '')}"></label></div>
      <button class="btn block">Guardar</button>${s ? '<button type="button" class="btn ghost block" id="delS" style="color:var(--error)">Eliminar</button>' : ''}</form>`);
    const f = $('form', m.el);
    f.onsubmit = ev => { ev.preventDefault(); conBoton($('button', f), async () => {
      const d = formData(f); Object.keys(d).forEach(k => d[k] = d[k] || null);
      if (s) await q(sb.from('sindicatos').update(d).eq('id', s.id)); else await q(sb.from('sindicatos').insert(d));
      await cargarBase(); m.close(); re();
    }); };
    const del = $('#delS', m.el);
    if (del) del.onclick = () => conBoton(del, async () => {
      if (!await confirmar(`¿Eliminar ${s.nombre}?`, 'Eliminar', 'danger')) return;
      await q(sb.from('sindicatos').delete().eq('id', s.id)); await cargarBase(); m.close(); re();
    });
  };
  $('#addSin', box).onclick = () => form(null);
  $$('[data-sin]', box).forEach(el => el.onclick = ev => { if (ev.target.closest('a')) return; form(S.sindicatos.find(s => s.id === el.dataset.sin)); });
}

// ───────── Mensajes segmentados ─────────
// WhatsApp no permite envío masivo sin la API paga: se arma la lista con un botón por destinatario y un mail con copia oculta.
async function destinatarios(seg, ref) {
  const perf = (S.perfiles || []).filter(p => p.activo);
  const deEquipos = async eqs => {
    if (!eqs.length) return [];
    const pl = await q(sb.from('plantel').select('equipo_id, jugador_id, jugadores(nombre, apellido)').in('equipo_id', eqs.map(e => e.id)));
    const ds = pl.length ? await q(sb.from('jugadores_datos').select('jugador_id, tel, mail').in('jugador_id', pl.map(p => p.jugador_id))) : [];
    const D = Object.fromEntries(ds.map(d => [d.jugador_id, d]));
    return pl.map(p => ({ nombre: `${p.jugadores.nombre} ${p.jugadores.apellido}`, extra: eq(p.equipo_id)?.nombre, tel: D[p.jugador_id]?.tel, mail: D[p.jugador_id]?.mail }));
  };
  switch (seg) {
    case 'dt': return S.equipos.filter(e => !ref || e.sindicato_id === ref).map(e => {
      const u = perf.find(p => p.id === e.dt_id);
      return { nombre: e.dt_nombre || u?.nombre || 'DT', extra: e.nombre, tel: e.dt_tel || u?.tel, mail: u?.mail };
    });
    case 'sindical': return perf.filter(p => p.rol === 'sindical' && (!ref || p.sindicato_id === ref)).map(p => ({ nombre: p.nombre, extra: sindicato(p.sindicato_id)?.nombre, tel: p.tel, mail: p.mail }))
      .concat(S.sindicatos.filter(s => (!ref || s.id === ref) && s.contacto_tel).map(s => ({ nombre: s.contacto_nombre || s.nombre, extra: s.nombre, tel: s.contacto_tel, mail: s.contacto_mail })));
    case 'resp_cancha': return perf.filter(p => p.rol === 'resp_cancha').map(p => ({ nombre: p.nombre, extra: S.canchas.filter(c => c.responsable_id === p.id).map(c => c.nombre).join(', '), tel: p.tel, mail: p.mail }));
    case 'arbitros': return S.staff.filter(s => s.activo).map(s => ({ nombre: s.nombre, extra: 'Árbitro', tel: s.tel, mail: s.mail, link: `${APP_URL()}#/arbitro/${s.token}` }));
    case 'jug_equipo': return deEquipos(S.equipos.filter(e => e.id === ref));
    case 'jug_sindicato': return deEquipos(S.equipos.filter(e => e.sindicato_id === ref));
    case 'jug_todos': return deEquipos(S.equipos);
    case 'recordatorio': {
      // Un mensaje por DT con su próximo partido.
      const ahora = Date.now();
      return S.equipos.map(e => {
        const p = S.partidos.filter(x => (x.local_id === e.id || x.visitante_id === e.id) && x.estado === 'programado' && x.inicio && new Date(x.inicio) > ahora)
          .sort((a, b) => new Date(a.inicio) - new Date(b.inicio))[0];
        if (!p) return null;
        const rival = p.local_id === e.id ? lado(p, 'v') : lado(p, 'l');
        return { nombre: e.dt_nombre || 'DT', extra: e.nombre, tel: e.dt_tel, texto: `Recordatorio ${S.torneo.nombre}: ${e.nombre} juega a las ${fmtHora(p.inicio)} en ${cancha(p.cancha_id)?.nombre || 'cancha a confirmar'} vs ${rival}. Presentarse 15 minutos antes con DNI. Cada jugador tiene su acreditación QR en ${APP_URL()}#/login` };
      }).filter(Boolean);
    }
  }
  return [];
}

async function mensajes(box) {
  const SEG = [['dt', 'DT de los equipos', 'sindicato'], ['sindical', 'Responsables sindicales', 'sindicato'], ['resp_cancha', 'Responsables de cancha', ''],
    ['arbitros', 'Árbitros (con su link)', ''], ['jug_equipo', 'Jugadores de un equipo', 'equipo'], ['jug_sindicato', 'Jugadores de un sindicato', 'sindicato'],
    ['jug_todos', 'Todos los jugadores', ''], ['recordatorio', 'Recordatorio de próximo partido (a cada DT)', '']];
  box.innerHTML = `<div class="card stack"><h2>Mensajes</h2>
    <label class="f">Destinatarios<select id="seg">${SEG.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
    <label class="f hidden" id="refBox"><span id="refLbl"></span><select id="ref"></select></label>
    <label class="f" id="txtBox">Mensaje<textarea id="txt" maxlength="1000" placeholder="Escribí el mensaje…"></textarea></label>
    <button class="btn" id="armar">Armar envío</button></div><div id="envio" style="margin-top:12px"></div>`;
  const seg = $('#seg', box), ref = $('#ref', box);
  const actualizar = () => {
    const tipo = SEG.find(s => s[0] === seg.value)[2];
    $('#refBox', box).classList.toggle('hidden', !tipo);
    $('#txtBox', box).classList.toggle('hidden', seg.value === 'recordatorio');
    $('#refLbl', box).textContent = tipo === 'equipo' ? 'Equipo' : 'Sindicato';
    const lista = tipo === 'equipo' ? S.equipos : S.sindicatos;
    ref.innerHTML = (tipo === 'sindicato' && !['jug_sindicato'].includes(seg.value) ? '<option value="">Todos</option>' : '') + lista.map(x => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('');
  };
  seg.onchange = actualizar; actualizar();
  $('#armar', box).onclick = () => conBoton($('#armar', box), async () => {
    const texto = $('#txt', box).value.trim();
    if (seg.value !== 'recordatorio' && !texto) throw new Error('Escribí el mensaje.');
    const lista = await destinatarios(seg.value, ref.value);
    const conTel = lista.filter(d => d.tel), mails = [...new Set(lista.map(d => d.mail).filter(Boolean))];
    const cuerpo = d => d.texto || (d.link ? `${texto}\n${d.link}` : texto);
    await q(sb.from('mensajes').insert({ torneo_id: S.torneo.id, segmento: seg.value, destino: ref.value || null, texto: texto || 'recordatorio', canal: 'whatsapp/mail', cantidad: lista.length }));
    $('#envio', box).innerHTML = `<div class="card"><div class="row between"><h3>${lista.length} destinatario(s)</h3>
      ${mails.length && seg.value !== 'recordatorio' ? `<a class="btn sec sm" href="mailto:?bcc=${encodeURIComponent(mails.join(','))}&subject=${encodeURIComponent(S.torneo.nombre)}&body=${encodeURIComponent(texto)}">Mail a ${mails.length} (CCO)</a>` : ''}</div>
      <p class="small muted">Tocá cada botón de WhatsApp: se abre el chat con el mensaje listo. Los ya enviados quedan marcados.</p>
      <div class="list">${lista.map((d, i) => `<div class="item"><div class="grow"><b>${esc(d.nombre)}</b><div class="small muted">${esc(d.extra || '')}${d.tel ? '' : ' · sin WhatsApp'}</div></div>
        ${d.tel ? `<a class="btn wa sm" data-i="${i}" target="_blank" rel="noopener" href="${esc(waLink(d.tel, cuerpo(d)))}">WhatsApp</a>` : ''}</div>`).join('') || '<div class="vacio">No hay destinatarios con ese filtro.</div>'}</div>
      ${conTel.length < lista.length ? `<p class="badge b-warn" style="margin-top:8px">${lista.length - conTel.length} sin WhatsApp cargado</p>` : ''}</div>`;
    $$('[data-i]', box).forEach(a => a.addEventListener('click', () => { a.textContent = '✔ Enviado'; a.classList.replace('wa', 'sec'); }));
  });
}
