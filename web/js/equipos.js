// Equipos y lista de buena fe. Compartido por admin, responsable sindical y DT (los permisos reales los aplica RLS).
import { S, sb, q, $, $$, esc, cabecera, accionesSesion, bindSesion, toast, modal, confirmar, conBoton, formData,
  badgeLista, sindicato, categoria, apto, edad, edadOk, waBtn, cargarBase, exportarImagen, ROLES } from './core.js';

const APP_URL = () => location.origin + location.pathname;

export async function vistaEquipos(root) {
  await cargarBase();
  root.innerHTML = cabecera(ROLES[S.perfil.rol] + ' · ' + S.perfil.nombre, accionesSesion()) + '<main class="wrap"><section id="eqBox"></section></main>';
  bindSesion(root);
  await panelEquipos($('#eqBox', root));
}

/** Lista de equipos según el rol. Se usa también dentro del panel admin. */
export async function panelEquipos(box) {
  const rol = S.perfil.rol;
  let eqs = S.equipos;
  if (rol === 'sindical') eqs = eqs.filter(e => e.sindicato_id === S.perfil.sindicato_id);
  if (rol === 'dt') eqs = eqs.filter(e => e.dt_id === S.perfil.id);
  const conteo = {};
  if (eqs.length) {
    const pl = await q(sb.from('plantel').select('equipo_id').in('equipo_id', eqs.map(e => e.id)));
    pl.forEach(p => conteo[p.equipo_id] = (conteo[p.equipo_id] || 0) + 1);
  }
  const filtro = box.dataset.filtro || '';
  const lista = filtro ? eqs.filter(e => e.estado_lista === filtro) : eqs;
  const titulo = rol === 'sindical' ? `Equipos de ${sindicato(S.perfil.sindicato_id)?.nombre || 'tu sindicato'}` : rol === 'dt' ? 'Mis equipos' : 'Equipos';
  box.innerHTML = `
    <div class="row between" style="margin-bottom:10px"><h2>${esc(titulo)}</h2><button class="btn" id="nuevoEq">+ Nuevo equipo</button></div>
    ${rol === 'admin' ? `<div class="tabs">${[['', 'Todos'], ['enviada', 'Para validar'], ['observada', 'Observadas'], ['validada', 'Validadas'], ['borrador', 'Borrador']]
      .map(([k, n]) => `<button class="tab ${k === filtro ? 'on' : ''}" data-f="${k}">${n}${k === 'enviada' && eqs.filter(e => e.estado_lista === 'enviada').length ? `<span class="n">${eqs.filter(e => e.estado_lista === 'enviada').length}</span>` : ''}</button>`).join('')}</div>` : ''}
    <div class="list">${lista.map(e => `<a class="item click" href="#/equipo/${e.id}" style="text-decoration:none;color:inherit">
      <div class="grow"><div class="t">${esc(e.nombre)}</div><div class="small muted">${esc(sindicato(e.sindicato_id)?.nombre || '')} · ${esc(categoria(e.categoria_id)?.nombre || '')} · ${conteo[e.id] || 0} jugadores</div></div>
      ${badgeLista(e.estado_lista)}</a>`).join('') || '<div class="vacio">No hay equipos cargados.</div>'}</div>`;
  $$('[data-f]', box).forEach(b => b.onclick = () => { box.dataset.filtro = b.dataset.f; panelEquipos(box); });
  $('#nuevoEq', box).onclick = () => formEquipo(null, () => panelEquipos(box));
}

function formEquipo(e, alGuardar) {
  const rol = S.perfil.rol;
  const sinFijo = rol === 'sindical';
  const m = modal(`<h2>${e ? 'Editar equipo' : 'Nuevo equipo'}</h2>
    <form class="stack" style="margin-top:12px">
      <label class="f">Nombre del equipo<input name="nombre" required maxlength="60" value="${esc(e?.nombre || '')}"></label>
      <label class="f">Sindicato ${sinFijo ? '' : '(obligatorio)'}<select name="sindicato_id" required ${sinFijo || (e && rol !== 'admin') ? 'disabled' : ''}>
        <option value="">Elegí el sindicato…</option>
        ${S.sindicatos.map(s => `<option value="${s.id}" ${(e?.sindicato_id || (sinFijo ? S.perfil.sindicato_id : '')) === s.id ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select></label>
      ${!S.sindicatos.length ? '<p class="badge b-warn">No hay sindicatos cargados. La organización tiene que darlos de alta.</p>' : ''}
      <label class="f">Categoría<select name="categoria_id" required>
        ${S.categorias.map(c => `<option value="${c.id}" ${e?.categoria_id === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>
      <div class="grid2">
        <label class="f">DT (nombre)<input name="dt_nombre" maxlength="80" value="${esc(e?.dt_nombre || (rol === 'dt' ? S.perfil.nombre : ''))}"></label>
        <label class="f">WhatsApp del DT<input name="dt_tel" inputmode="tel" maxlength="30" value="${esc(e?.dt_tel || (rol === 'dt' ? S.perfil.tel || '' : ''))}"></label>
      </div>
      <button class="btn block">Guardar</button>
    </form>`);
  const f = $('form', m.el);
  f.onsubmit = ev => {
    ev.preventDefault();
    conBoton($('button', f), async () => {
      const d = formData(f);
      const fila = { nombre: d.nombre, categoria_id: d.categoria_id, dt_nombre: d.dt_nombre || null, dt_tel: d.dt_tel || null };
      if (sinFijo) fila.sindicato_id = S.perfil.sindicato_id;
      else if (!e || rol === 'admin') fila.sindicato_id = d.sindicato_id;
      if (!fila.sindicato_id && !e) throw new Error('Elegí el sindicato.');
      if (e) await q(sb.from('equipos').update(fila).eq('id', e.id));
      else {
        fila.torneo_id = S.torneo.id;
        if (rol === 'dt') fila.dt_id = S.perfil.id;
        const nuevo = await q(sb.from('equipos').insert(fila).select().single());
        e = nuevo;
      }
      await cargarBase();
      m.close();
      toast('Equipo guardado', 'ok');
      if (alGuardar) alGuardar(e);
    });
  };
}

// ───────── Detalle: lista de buena fe ─────────
export async function vistaEquipo(root, id) {
  root.innerHTML = cabecera(ROLES[S.perfil.rol], accionesSesion()) + '<main class="wrap"><section id="detBox"></section></main>';
  bindSesion(root);
  await detalleEquipo($('#detBox', root), id);
}

async function detalleEquipo(box, id) {
  const e = await q(sb.from('equipos').select('*').eq('id', id).single());
  const cat = categoria(e.categoria_id);
  const pl = await q(sb.from('plantel').select('id, dorsal, observaciones, jugador_id, jugadores(nombre, apellido)').eq('equipo_id', id));
  const datos = pl.length ? await q(sb.from('jugadores_datos').select('*').in('jugador_id', pl.map(p => p.jugador_id))) : [];
  const D = Object.fromEntries(datos.map(d => [d.jugador_id, d]));
  const jug = pl.map(p => ({ ...p, ...p.jugadores, d: D[p.jugador_id] || {} }))
    .sort((a, b) => (a.dorsal ?? 999) - (b.dorsal ?? 999) || a.apellido.localeCompare(b.apellido));
  const admin = S.perfil.rol === 'admin';
  const editable = admin || ['borrador', 'observada'].includes(e.estado_lista);
  const [dele, corr] = admin ? await Promise.all([
    e.delegado_id ? q(sb.from('delegados').select('*').eq('id', e.delegado_id).maybeSingle()) : null,
    q(sb.from('correcciones').select('*').eq('equipo_id', id).order('created_at', { ascending: false })),
  ]) : [null, []];

  const sinApto = jug.filter(j => apto(j.d).cls === 'error').length;
  const fueraEdad = jug.filter(j => edadOk(j.d, cat) === false).length;
  const sinNac = jug.filter(j => !j.d.fecha_nac).length;
  const volver = admin ? '#/admin/equipos' : '#/equipos';

  box.innerHTML = `
    <p><a href="${volver}">← Equipos</a></p>
    <div class="card" style="margin-bottom:12px">
      <div class="row between"><div><h2>${esc(e.nombre)}</h2>
        <div class="small muted">${esc(sindicato(e.sindicato_id)?.nombre || '')} · ${esc(cat?.nombre || '')}${e.dt_nombre ? ' · DT ' + esc(e.dt_nombre) : ''}</div></div>
        ${badgeLista(e.estado_lista)}</div>
      ${e.estado_lista === 'observada' && e.obs_mesa ? `<div class="badge b-warn" style="margin-top:10px;white-space:normal;display:block;padding:8px 12px">Observación de la mesa: ${esc(e.obs_mesa)}</div>` : ''}
      <div class="kpis" style="margin-top:12px">
        <div class="kpi ${jug.length ? 'ok' : 'warn'}"><b>${jug.length}</b><span>Jugadores</span></div>
        <div class="kpi ${sinApto ? 'error' : 'ok'}"><b>${sinApto}</b><span>Sin apto vigente</span></div>
        <div class="kpi ${fueraEdad ? 'error' : 'ok'}"><b>${fueraEdad}</b><span>Fuera de categoría</span></div>
        <div class="kpi ${sinNac ? 'warn' : 'ok'}"><b>${sinNac}</b><span>Sin fecha de nac.</span></div>
      </div>
      <div class="row" style="margin-top:12px">
        ${editable ? '<button class="btn" id="addJug">+ Agregar jugador</button>' : ''}
        ${!admin && ['borrador', 'observada'].includes(e.estado_lista) && jug.length ? '<button class="btn ok" id="enviar">Enviar lista a validación</button>' : ''}
        ${admin && e.estado_lista !== 'validada' ? '<button class="btn ok" id="validar">✔ Validar lista</button>' : ''}
        ${admin && e.estado_lista !== 'observada' ? '<button class="btn warn" id="observar">Observar</button>' : ''}
        ${admin && e.estado_lista === 'validada' ? '<button class="btn sec" id="reabrir">Reabrir lista</button>' : ''}
        ${(admin || e.estado_lista !== 'validada') ? '<button class="btn sec" id="editEq">Editar equipo</button>' : ''}
        ${e.dt_tel ? waBtn(e.dt_tel, `Hola ${e.dt_nombre || ''}, te escribimos de la organización del ${S.torneo.nombre} por el equipo ${e.nombre}.`, 'WhatsApp DT') : ''}
      </div>
      ${!editable ? '<p class="small muted">La lista está ' + (e.estado_lista === 'enviada' ? 'en revisión' : 'validada') + '. Para cambios, contactá a la organización.</p>' : ''}
    </div>
    ${dele ? `<div class="card flat" style="margin-bottom:12px"><h3>DT (jefe de delegación)</h3>
      <div class="row between"><div><b>${esc(dele.nombre)} ${esc(dele.apellido)}</b><div class="small">DNI ${esc(dele.dni)}${dele.cargo ? ' · ' + esc(dele.cargo) : ''} · ${esc(dele.mail)} · código ${esc(e.codigo)}</div></div>
      <div class="row">${waBtn(dele.tel, `Hola ${dele.nombre}, te escribimos de la organización del ${S.torneo.nombre} por el equipo ${e.nombre}.`, 'WhatsApp')}<a class="btn ghost sm" href="mailto:${esc(dele.mail)}">Mail</a></div></div></div>` : ''}
    ${corr.length ? `<div class="card flat" style="margin-bottom:12px"><h3>Pedidos de corrección del DT</h3><div class="list">${corr.map(c => `<div class="item">
      <span class="badge ${c.resuelta ? 'b-ok' : 'b-warn'}">${c.resuelta ? 'Resuelto' : 'Pendiente'}</span><div class="grow">${esc(c.texto)}<div class="small">${new Date(c.created_at).toLocaleString('es-AR')}</div></div>
      ${c.resuelta ? '' : `<button class="btn sm ok" data-res="${c.id}">Resuelto</button>`}</div>`).join('')}</div></div>` : ''}
    <div class="card" id="lbf">
      <div class="row between"><h3>Lista de buena fe</h3><button class="btn ghost sm no-export" id="expLbf">⬇ Imagen</button></div>
      <div class="list" style="margin-top:8px">${jug.map(j => {
        const a = apto(j.d), ed = edad(j.d.fecha_nac), ok = edadOk(j.d, cat);
        return `<div class="item ${editable ? 'click' : ''}" data-j="${j.jugador_id}">
          <b style="width:32px;font:600 20px var(--f-cond);color:var(--azul);text-align:center">${j.dorsal ?? '–'}</b>
          <div class="grow"><div class="t">${esc(j.apellido)}, ${esc(j.nombre)}</div>
            <div class="small muted">DNI ${esc(j.d.dni || '')}${ed != null ? ' · ' + ed + ' años' : ''}${j.observaciones ? ' · ' + esc(j.observaciones) : ''}</div>
            <div class="row" style="margin-top:4px;gap:4px"><span class="badge b-${a.cls}">${a.txt}</span>
              ${ok === false ? `<span class="badge b-error">No cumple ${esc(cat?.nombre || 'categoría')}</span>` : ok == null ? '<span class="badge b-warn">Sin fecha de nac.</span>' : ''}</div></div>
          <div class="no-export">${j.d.tel ? waBtn(j.d.tel, `Hola ${j.nombre}, ya estás en la lista de ${e.nombre} para el ${S.torneo.nombre}. Mirá tu convocatoria y tu acreditación QR en ${APP_URL()}#/login (usuario: este WhatsApp, clave: tu DNI).`, 'WA') : ''}</div>
        </div>`;
      }).join('') || '<div class="vacio">Todavía no hay jugadores. Tocá "Agregar jugador".</div>'}</div>
    </div>
    ${admin || e.estado_lista === 'borrador' ? '<p style="margin-top:16px"><button class="btn ghost" id="borrarEq" style="color:var(--error)">Eliminar equipo</button></p>' : ''}`;

  const re = () => detalleEquipo(box, id);
  const on = (sel, fn) => { const b = $(sel, box); if (b) b.onclick = () => fn(b); };
  on('#addJug', () => formJugador(e, null, re));
  $$('[data-j]', box).forEach(it => { if (editable) it.onclick = ev => { if (ev.target.closest('a')) return; formJugador(e, jug.find(j => j.jugador_id === it.dataset.j), re); }; });
  $$('[data-res]', box).forEach(b => b.onclick = () => conBoton(b, async () => { await q(sb.from('correcciones').update({ resuelta: true }).eq('id', b.dataset.res)); re(); }));
  on('#expLbf', b => conBoton(b, () => exportarImagen($('#lbf', box), 'lista-' + e.nombre)));
  on('#editEq', () => formEquipo(e, re));
  on('#enviar', b => conBoton(b, async () => {
    if (sinApto || fueraEdad) {
      if (!await confirmar(`Hay ${sinApto} jugador(es) sin apto vigente y ${fueraEdad} fuera de categoría. ¿Enviar igual?`, 'Enviar igual', 'warn')) return;
    }
    await q(sb.from('equipos').update({ estado_lista: 'enviada' }).eq('id', id));
    await cargarBase(); toast('Lista enviada a la organización', 'ok'); re();
  }));
  on('#validar', b => conBoton(b, async () => {
    if ((sinApto || fueraEdad) && !await confirmar(`Atención: ${sinApto} sin apto vigente y ${fueraEdad} fuera de categoría. ¿Validar igual?`, 'Validar', 'ok')) return;
    await q(sb.from('equipos').update({ estado_lista: 'validada', obs_mesa: null }).eq('id', id));
    await cargarBase(); toast('Lista validada', 'ok'); re();
  }));
  on('#reabrir', b => conBoton(b, async () => {
    await q(sb.from('equipos').update({ estado_lista: 'borrador' }).eq('id', id));
    await cargarBase(); re();
  }));
  on('#observar', () => {
    const m = modal(`<h3>Observar lista</h3><p class="small muted">El DT y el sindicato ven este texto y pueden corregir y reenviar.</p>
      <form class="stack"><textarea name="obs" required maxlength="500" placeholder="Ej: falta apto de 2 jugadores, corregir DNI de Pérez">${esc(e.obs_mesa || '')}</textarea>
      <button class="btn warn block">Enviar observación</button></form>`);
    const f = $('form', m.el);
    f.onsubmit = ev => { ev.preventDefault(); conBoton($('button', f), async () => {
      await q(sb.from('equipos').update({ estado_lista: 'observada', obs_mesa: f.obs.value.trim() }).eq('id', id));
      await cargarBase(); m.close(); toast('Observación enviada', 'ok'); re();
    }); };
  });
  on('#borrarEq', b => conBoton(b, async () => {
    if (!await confirmar(`¿Eliminar ${e.nombre}? Se borran su lista y sus partidos.`, 'Eliminar', 'danger')) return;
    await q(sb.from('equipos').delete().eq('id', id));
    await cargarBase(); toast('Equipo eliminado'); location.hash = volver;
  }));
}

function formJugador(e, j, alGuardar) {
  const d = j?.d || {};
  const m = modal(`<h2>${j ? 'Editar jugador' : 'Agregar jugador'}</h2>
    <form class="stack" style="margin-top:12px">
      <div class="grid2"><label class="f">Nombre<input name="nombre" required maxlength="60" value="${esc(j?.nombre || '')}"></label>
        <label class="f">Apellido<input name="apellido" required maxlength="60" value="${esc(j?.apellido || '')}"></label></div>
      <div class="grid2"><label class="f">DNI<input name="dni" required inputmode="numeric" maxlength="12" value="${esc(d.dni || '')}"></label>
        <label class="f">Dorsal<input name="dorsal" type="number" min="0" max="99" value="${j?.dorsal ?? ''}"></label></div>
      <label class="f">Fecha de nacimiento<input name="fecha_nac" type="date" value="${esc(d.fecha_nac || '')}"></label>
      <div class="grid2"><label class="f">WhatsApp<input name="tel" inputmode="tel" maxlength="30" value="${esc(d.tel || '')}"></label>
        <label class="f">Mail<input name="mail" type="email" maxlength="120" value="${esc(d.mail || '')}"></label></div>
      <p class="small muted" style="margin:-4px 0 0">Con WhatsApp o mail + DNI el jugador entra a ver su convocatoria y su QR.</p>
      <div class="card flat" style="background:var(--campo)"><b>Apto médico</b>
        <label class="check" style="margin-top:8px"><input type="checkbox" name="apto_presentado" ${d.apto_presentado ? 'checked' : ''}> Presentó apto médico</label>
        <label class="f" style="margin-top:8px">Vence el<input name="apto_vence" type="date" value="${esc(d.apto_vence || '')}"></label>
        <p class="small muted" style="margin:6px 0 0">No se guarda el certificado: solo el estado y la fecha.</p></div>
      <label class="f">Observaciones<input name="observaciones" maxlength="300" value="${esc(j?.observaciones || '')}"></label>
      ${!j ? `<label class="check"><input type="checkbox" name="consentimiento" required>
        <span>El/la jugador/a fue informado/a y presta su consentimiento para que la organización del torneo guarde estos datos con el único fin de gestionar su inscripción y participación. Puede pedir la baja a la organización en cualquier momento (Ley 25.326).</span></label>` : ''}
      <button class="btn block">Guardar</button>
      ${j ? '<button type="button" class="btn ghost block" id="quitar" style="color:var(--error)">Quitar de la lista</button>' : ''}
      ${j && S.perfil.rol === 'admin' ? '<button type="button" class="btn ghost block" id="baja" style="color:var(--error)">Borrar todos sus datos (pedido de baja)</button>' : ''}
    </form>`);
  const f = $('form', m.el);
  f.onsubmit = ev => {
    ev.preventDefault();
    conBoton($('button', f), async () => {
      const x = formData(f);
      const { error } = await sb.rpc('guardar_jugador', { p_equipo: e.id, p: x, p_jugador: j?.jugador_id || null });
      if (error) throw new Error(error.message);
      m.close(); toast('Jugador guardado', 'ok'); alGuardar();
    });
  };
  const qb = $('#quitar', m.el);
  if (qb) qb.onclick = () => conBoton(qb, async () => {
    if (!await confirmar(`¿Quitar a ${j.nombre} ${j.apellido} de la lista?`, 'Quitar', 'danger')) return;
    await q(sb.from('plantel').delete().eq('id', j.id));
    m.close(); toast('Jugador quitado'); alGuardar();
  });
  const bj = $('#baja', m.el);
  if (bj) bj.onclick = () => conBoton(bj, async () => {
    if (!await confirmar(`¿Borrar definitivamente a ${j.nombre} ${j.apellido}? Se eliminan sus datos personales, su lista y sus estadísticas.`, 'Borrar', 'danger')) return;
    await q(sb.from('jugadores').delete().eq('id', j.jugador_id));
    m.close(); toast('Datos del jugador eliminados'); alGuardar();
  });
}
