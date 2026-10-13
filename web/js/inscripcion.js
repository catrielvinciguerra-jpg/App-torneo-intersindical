// Inscripción estilo JUBU. El DT es el jefe de delegación: se inscribe solo con sus datos, el equipo y la lista de buena fe,
// y vuelve a "Mi equipo" con su mail + DNI. El jugador ve su acreditación con DNI + mail o WhatsApp.
import { S, sb, sbDT, $, $$, esc, toast, modal, conBoton, errMsg, apto, edad, edadOk, fmtHora, fmtFecha, qrSvg,
  exportarImagen, waLink, nombrePropio, sugerirMail, LOGO, FASES } from './core.js';

const LS = { modo: 'insc_modo', dt: 'dt_token', borrador: 'insc_borrador' };
const leer = (k, d = null) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const escribir = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const APP_URL = () => location.origin + location.pathname;

let modo = leer(LS.modo, 'nueva');
let equipoSel = 0;

export async function panelInscripcion(box) {
  const token = leer(LS.dt);
  if (token && modo !== 'jugador') return miEquipo(box, token);
  box.innerHTML = `
    <div class="sub acc" role="group" aria-label="Acceso">
      <button type="button" data-m="nueva" aria-pressed="${modo === 'nueva'}">Nuevo equipo</button>
      <button type="button" data-m="volver" aria-pressed="${modo === 'volver'}">Ya inscribí mi equipo</button>
      <button type="button" data-m="jugador" aria-pressed="${modo === 'jugador'}">Soy jugador/a</button>
    </div><div id="inscBox" style="display:flex;flex-direction:column;gap:14px"></div>`;
  $$('[data-m]', box).forEach(b => b.onclick = () => { modo = b.dataset.m; escribir(LS.modo, modo); panelInscripcion(box); });
  const ib = $('#inscBox', box);
  if (modo === 'volver') return formVolver(ib, box);
  if (modo === 'jugador') return formJugador(ib);
  return formNueva(ib, box);
}

// ───────── Ya inscribí mi equipo ─────────
function formVolver(ib, box) {
  ib.innerHTML = `<form class="card" novalidate>
    <h2>Volver a mi equipo</h2>
    <p class="small">Ingresá con el mail y el DNI del DT con los que inscribiste el equipo.</p>
    <fieldset>
      <div class="f full"><label for="v-mail">Mail del DT</label><input id="v-mail" type="email" autocomplete="username" required></div>
      <div class="f full"><label for="v-dni">Contraseña <span class="tip" title="Es el DNI del DT, sin puntos">?</span></label><input id="v-dni" type="password" inputmode="numeric" autocomplete="current-password" required></div>
    </fieldset>
    <button class="btn">Ingresar</button></form>`;
  const f = $('form', ib);
  f.onsubmit = e => { e.preventDefault(); conBoton($('button', f), async () => {
    const { data, error } = await sb.rpc('dt_login', { p_mail: $('#v-mail', f).value, p_dni: $('#v-dni', f).value });
    if (error) throw new Error(errMsg(error));
    escribir(LS.dt, data.token); modo = 'nueva'; escribir(LS.modo, modo);
    toast(`Hola ${data.nombre}`, 'ok'); panelInscripcion(box);
  }); };
}

// ───────── Soy jugador/a ─────────
function formJugador(ib) {
  ib.innerHTML = `<form class="card" novalidate>
    <h2>Mi acreditación</h2>
    <p class="small">Ingresá tu DNI y el mail o WhatsApp que cargó tu DT. Ahí ves tu próximo partido, tu QR para la mesa y tus estadísticas.</p>
    <fieldset>
      <div class="f full"><label for="j-dni">DNI</label><input id="j-dni" inputmode="numeric" autocomplete="off" required></div>
      <div class="f full"><label for="j-id">Mail o WhatsApp</label><input id="j-id" autocomplete="username" required placeholder="nombre@mail.com o 11 2345 6789"></div>
    </fieldset>
    <button class="btn">Ver mi acreditación</button></form>`;
  const f = $('form', ib);
  f.onsubmit = e => { e.preventDefault(); conBoton($('button', f), async () => {
    const { data, error } = await sb.rpc('login_jugador', { p_ident: $('#j-id', f).value, p_dni: $('#j-dni', f).value });
    if (error) throw new Error(errMsg(error));
    escribir('jug_token', data.token);
    location.hash = '#/yo';
  }); };
}

// ───────── Nuevo equipo: DT + equipo + lista en un solo envío ─────────
const VACIO = () => ({ nombre: '', apellido: '', dni: '', fecha_nac: '', tel: '', mail: '', dorsal: '', apto: '', apto_vence: '' });
let F = null; // estado del formulario (se guarda como borrador)

function cargarBorrador() {
  try { return JSON.parse(leer(LS.borrador) || 'null'); } catch { return null; }
}
function guardarBorrador() { escribir(LS.borrador, JSON.stringify(F)); }

function formNueva(ib, box) {
  const t = S.torneo;
  const abierta = t.inscripcion_abierta && (!t.cierre_inscripcion || new Date() <= new Date(t.cierre_inscripcion));
  if (!abierta) { ib.innerHTML = '<div class="card"><h2>Inscripción cerrada</h2><p>Si ya inscribiste tu equipo, entrá por "Ya inscribí mi equipo" para ver tu lista y pedir correcciones.</p></div>'; return; }
  const borrador = cargarBorrador();
  if (!F) F = { dt: {}, equipo: { nombre: '', categoria_id: S.categorias[0]?.id || '' }, jugadores: [], acepto: false };
  ib.innerHTML = `<form class="card" novalidate id="fIns">
    <h2>Inscripción de equipos</h2>
    ${borrador && !F._recuperado && JSON.stringify(borrador) !== JSON.stringify(F) ? `<div class="aviso" role="status">Tenés una carga sin enviar guardada en este celular.
      <div class="row" style="margin-top:8px"><button class="btn sec sm" type="button" id="rec">Recuperar</button><button class="btn ghost sm" type="button" id="des">Descartar</button></div></div>` : ''}
    <div class="aviso info">La carga la hace el <b>DT del equipo</b>. Con tu mail y tu DNI volvés cuando quieras para sumar jugadores o inscribir otro equipo, hasta el cierre.</div>

    <div class="step"><i>1</i><h3>DT del equipo</h3></div>
    <fieldset>
      <div class="f full"><label for="d-sin">Sindicato</label><select id="d-sin" required>
        <option value="">Elegí tu sindicato…</option>${S.sindicatos.map(s => `<option value="${s.id}" ${F.dt.sindicato_id === s.id ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}
        <option value="otro" ${F.dt.sindicato_id === 'otro' ? 'selected' : ''}>Otro (no está en la lista)</option></select></div>
      <div class="f ${F.dt.sindicato_id === 'otro' ? '' : 'hidden'}" id="d-otro"><label for="d-sinn">Nombre del sindicato</label><input id="d-sinn" value="${esc(F.dt.sindicato_nuevo || '')}"></div>
      <div class="f ${F.dt.sindicato_id === 'otro' ? '' : 'hidden'}" id="d-otro2"><label for="d-sigla">Sigla</label><input id="d-sigla" maxlength="12" value="${esc(F.dt.sigla || '')}" placeholder="Ej.: UOM"></div>
      ${campo('d-nom', 'Nombre', F.dt.nombre)}${campo('d-ape', 'Apellido', F.dt.apellido)}
      ${campo('d-dni', 'DNI', F.dt.dni, 'inputmode="numeric"')}${campo('d-nac', 'Fecha de nacimiento', F.dt.fecha_nac, 'type="date"')}
      ${campo('d-cargo', 'Cargo en el sindicato', F.dt.cargo)}${campo('d-tel', 'Celular (WhatsApp)', F.dt.tel, 'type="tel"')}
      <div class="f full"><label for="d-mail">Mail (con este mail y tu DNI volvés a tu equipo)</label><input id="d-mail" type="email" value="${esc(F.dt.mail || '')}"><span class="err" id="d-mail-s"></span></div>
    </fieldset>

    <div class="step"><i>2</i><h3>Equipo y lista de buena fe</h3></div>
    <fieldset>
      ${campo('e-nom', 'Nombre del equipo', F.equipo.nombre, '', 'full')}
      ${S.categorias.length > 1 ? `<div class="f full"><label for="e-cat">Categoría</label><select id="e-cat">${S.categorias.map(c => `<option value="${c.id}" ${F.equipo.categoria_id === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>` : ''}
    </fieldset>
    <div id="listaBox"></div>

    <div class="step"><i>3</i><h3>Confirmación</h3></div>
    <label class="check"><input id="acepto" type="checkbox" ${F.acepto ? 'checked' : ''}> <span>Declaro que los jugadores cumplen los requisitos del reglamento (${esc(S.categorias.map(c => c.nombre).join(', '))}, apto médico) y que fueron informados y prestan su consentimiento para que la organización use sus datos solo para gestionar el torneo (Ley 25.326).</span></label>
    <input name="web" id="web" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
    <button class="btn" type="submit">Confirmar envío</button>
  </form>`;
  const f = $('#fIns', ib);
  const leerDT = () => {
    F.dt = { sindicato_id: $('#d-sin', f).value, sindicato_nuevo: $('#d-sinn', f).value, sigla: $('#d-sigla', f).value,
      nombre: $('#d-nom', f).value, apellido: $('#d-ape', f).value, dni: $('#d-dni', f).value, fecha_nac: $('#d-nac', f).value,
      cargo: $('#d-cargo', f).value, tel: $('#d-tel', f).value, mail: $('#d-mail', f).value };
    F.equipo.nombre = $('#e-nom', f).value;
    if ($('#e-cat', f)) F.equipo.categoria_id = $('#e-cat', f).value;
    F.acepto = $('#acepto', f).checked;
    guardarBorrador();
  };
  f.addEventListener('input', leerDT);
  f.addEventListener('change', leerDT);
  $('#d-sin', f).onchange = () => { leerDT(); ['#d-otro', '#d-otro2'].forEach(s => $(s, f).classList.toggle('hidden', F.dt.sindicato_id !== 'otro')); };
  ['#d-nom', '#d-ape'].forEach(s => $(s, f).addEventListener('blur', e => { e.target.value = nombrePropio(e.target.value); leerDT(); }));
  $('#d-mail', f).addEventListener('blur', e => {
    const sug = sugerirMail(e.target.value);
    $('#d-mail-s', f).innerHTML = sug ? `¿Quisiste decir <button type="button" class="btn link" id="sugm">${esc(sug)}</button>?` : '';
    const b = $('#sugm', f); if (b) b.onclick = () => { e.target.value = sug; $('#d-mail-s', f).innerHTML = ''; leerDT(); };
  });
  const rec = $('#rec', f), des = $('#des', f);
  if (rec) rec.onclick = () => { F = { ...borrador, _recuperado: true }; formNueva(ib, box); };
  if (des) des.onclick = () => { escribir(LS.borrador, null); F._recuperado = true; formNueva(ib, box); };
  listaEditor($('#listaBox', f), F, () => guardarBorrador());

  f.onsubmit = e => {
    e.preventDefault(); leerDT();
    const err = validarAlta(F);
    if (err.length) { toast(err[0], 'error'); return; }
    confirmarEnvio(F, async () => {
      const js = F.jugadores.map(normJugador);
      const p = { ...F.dt, sindicato_id: F.dt.sindicato_id === 'otro' ? '' : F.dt.sindicato_id, equipo: F.equipo.nombre, categoria_id: F.equipo.categoria_id,
        jugadores: js, acepto: F.acepto, web: $('#web', f).value };
      const { data, error } = await sb.rpc('dt_inscribir', { p });
      if (error) throw new Error(errMsg(error));
      escribir(LS.dt, data.token); escribir(LS.borrador, null); F = null;
      toast(`Equipo inscripto · código ${data.codigo}`, 'ok');
      panelInscripcion(box);
    });
  };
}

function campo(id, label, val = '', attrs = '', cls = '') {
  return `<div class="f ${cls}"><label for="${id}">${label}</label><input id="${id}" value="${esc(val || '')}" ${attrs}></div>`;
}
function normJugador(j) {
  return { nombre: nombrePropio(j.nombre), apellido: nombrePropio(j.apellido), dni: j.dni, fecha_nac: j.fecha_nac, tel: j.tel, mail: j.mail.trim().toLowerCase(),
    dorsal: j.dorsal, apto_presentado: j.apto === 'si', apto_vence: j.apto === 'si' ? j.apto_vence : '' };
}
function jugadorCompleto(j) {
  return j.nombre.trim().length > 1 && j.apellido.trim().length > 1 && /^[0-9A-Za-z.]{6,12}$/.test(j.dni.trim()) && j.fecha_nac && (j.tel.trim() || j.mail.trim());
}
function validarAlta(F) {
  const e = [], d = F.dt, t = S.torneo;
  if (!d.sindicato_id) e.push('Elegí el sindicato.');
  if (d.sindicato_id === 'otro' && (d.sindicato_nuevo || '').trim().length < 3) e.push('Escribí el nombre del sindicato.');
  if ((d.nombre || '').trim().length < 2 || (d.apellido || '').trim().length < 2) e.push('Completá nombre y apellido del DT.');
  if (!/^[0-9]{7,8}$/.test((d.dni || '').replace(/\D/g, ''))) e.push('DNI del DT inválido.');
  if ((d.tel || '').replace(/\D/g, '').length < 8) e.push('Celular del DT inválido.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.mail || '')) e.push('Mail del DT inválido.');
  if ((F.equipo.nombre || '').trim().length < 2) e.push('Falta el nombre del equipo.');
  const ok = F.jugadores.filter(jugadorCompleto).length;
  if (F.jugadores.length < t.min_jugadores) e.push(`La lista necesita al menos ${t.min_jugadores} jugadores.`);
  else if (ok < F.jugadores.length) e.push(`Hay ${F.jugadores.length - ok} ficha(s) incompleta(s): nombre, apellido, DNI, fecha de nacimiento y WhatsApp o mail.`);
  const dnis = F.jugadores.map(j => j.dni.replace(/\D/g, '')).filter(Boolean);
  if (new Set(dnis).size < dnis.length) e.push('Hay un DNI repetido en la lista.');
  if (!F.acepto) e.push('Falta tildar la declaración y el consentimiento.');
  return e;
}
function confirmarEnvio(F, enviar) {
  const cat = S.categorias.find(c => c.id === F.equipo.categoria_id) || S.categorias[0];
  const js = F.jugadores.map(normJugador);
  const sinApto = js.filter(j => !j.apto_presentado).length;
  const fuera = js.filter(j => edadOk(j, cat) === false).length;
  const m = modal(`<h2>¿Confirmás el envío?</h2>
    <p class="small">${esc(F.equipo.nombre)} · ${js.length} jugadores · DT ${esc(nombrePropio(F.dt.nombre))} ${esc(nombrePropio(F.dt.apellido))}</p>
    ${sinApto ? `<div class="aviso">${sinApto} jugador(es) sin apto médico. Podés enviarlo igual y completarlo antes del cierre.</div>` : ''}
    ${fuera ? `<div class="aviso error">${fuera} jugador(es) no cumplen la edad de ${esc(cat?.nombre || 'la categoría')}. La organización puede observar la lista.</div>` : ''}
    <p class="small">Revisá nombres, DNI y fechas: las acreditaciones salen con estos datos. Hasta el cierre podés sumar o corregir jugadores desde "Ya inscribí mi equipo".</p>
    <div class="row"><button class="btn ghost grow" id="no" type="button">Volver a revisar</button><button class="btn grow" id="si" type="button">Confirmar envío</button></div>`);
  $('#no', m.el).onclick = m.close;
  $('#si', m.el).onclick = () => conBoton($('#si', m.el), async () => { await enviar(); m.close(); });
}

/** Editor de la lista de buena fe (selector de cantidad + fichas), compartido por alta y "otro equipo". */
function listaEditor(cont, F, alCambiar) {
  const t = S.torneo;
  const cat = () => S.categorias.find(c => c.id === F.equipo.categoria_id) || S.categorias[0];
  const dibujar = () => {
    const n = F.jugadores.length;
    cont.innerHTML = `
      ${!n ? `<div class="cant"><p><b>¿Cuántos jugadores vas a cargar?</b> Entre ${t.min_jugadores} y ${t.max_jugadores}. Después podés sumar o quitar.</p>
        <div class="nums">${Array.from({ length: t.max_jugadores - t.min_jugadores + 1 }, (_, i) => t.min_jugadores + i).map(k => `<button type="button" data-n="${k}">${k}</button>`).join('')}</div></div>` : `
      <div class="ficha"><div class="ficha-h"><div><b>Lista de buena fe</b><small>${esc(cat()?.nombre || '')} · completá cada ficha</small></div>
        <span class="cnt ${F.jugadores.filter(jugadorCompleto).length === n && n >= t.min_jugadores ? 'full' : ''}">${F.jugadores.filter(jugadorCompleto).length}/${n}</span></div>
        <div class="ficha-b">${F.jugadores.map((j, i) => fichaJugador(j, i, cat())).join('')}
          ${n < t.max_jugadores ? '<button type="button" class="mini" id="masJ">+ Agregar jugador</button>' : ''}</div></div>`}`;
    $$('[data-n]', cont).forEach(b => b.onclick = () => { F.jugadores = Array.from({ length: +b.dataset.n }, VACIO); alCambiar(); dibujar(); });
    const mas = $('#masJ', cont); if (mas) mas.onclick = () => { F.jugadores.push(VACIO()); alCambiar(); dibujar(); };
    $$('[data-x]', cont).forEach(b => b.onclick = () => { F.jugadores.splice(+b.dataset.x, 1); alCambiar(); dibujar(); });
    $$('.dep', cont).forEach(d => {
      const i = +d.dataset.i;
      d.addEventListener('input', ev => {
        const k = ev.target.dataset.k; if (!k) return;
        F.jugadores[i][k] = ev.target.value; alCambiar();
        if (k === 'apto') $('[data-k="apto_vence"]', d).closest('.f').classList.toggle('hidden', ev.target.value !== 'si');
      });
      d.addEventListener('focusout', ev => {
        const k = ev.target.dataset.k;
        if (k === 'nombre' || k === 'apellido') { ev.target.value = nombrePropio(ev.target.value); F.jugadores[i][k] = ev.target.value; alCambiar(); }
        const j = F.jugadores[i], el = d.querySelector('.n span');
        d.classList.toggle('ok', !!jugadorCompleto(j));
        el.textContent = jugadorCompleto(j) ? '✓ completa' : 'Jugador ' + (i + 1);
        const aviso = d.querySelector('[data-aviso]');
        const e = edad(j.fecha_nac), ok = edadOk({ fecha_nac: j.fecha_nac }, cat());
        aviso.textContent = ok === false ? `⚠ ${e} años: no cumple ${cat()?.nombre}` : '';
        const cnt = cont.querySelector('.ficha-h .cnt'), comp = F.jugadores.filter(jugadorCompleto).length;
        if (cnt) { cnt.textContent = `${comp}/${F.jugadores.length}`; cnt.classList.toggle('full', comp === F.jugadores.length && comp >= t.min_jugadores); }
      });
    });
  };
  dibujar();
}
function fichaJugador(j, i, cat) {
  const e = edad(j.fecha_nac), ok = edadOk({ fecha_nac: j.fecha_nac }, cat);
  const inp = (k, ph, attrs = '') => `<div class="f"><label>${ph}</label><input data-k="${k}" value="${esc(j[k] || '')}" ${attrs}></div>`;
  return `<div class="dep ${jugadorCompleto(j) ? 'ok' : ''}" data-i="${i}">
    <div class="n"><span>${jugadorCompleto(j) ? '✓ completa' : 'Jugador ' + (i + 1)}</span><button type="button" class="x" data-x="${i}">Quitar</button></div>
    ${inp('nombre', 'Nombre')}${inp('apellido', 'Apellido')}
    ${inp('dni', 'DNI', 'inputmode="numeric"')}${inp('fecha_nac', 'Fecha de nacimiento', 'type="date"')}
    ${inp('tel', 'WhatsApp', 'type="tel"')}${inp('mail', 'Mail', 'type="email"')}
    ${inp('dorsal', 'Dorsal', 'type="number" min="0" max="99"')}
    <div class="f"><label>Apto médico</label><select data-k="apto"><option value="">Falta presentar</option><option value="si" ${j.apto === 'si' ? 'selected' : ''}>Presentado</option></select></div>
    <div class="f full ${j.apto === 'si' ? '' : 'hidden'}"><label>Vence el</label><input data-k="apto_vence" type="date" value="${esc(j.apto_vence || '')}"></div>
    <span class="err full" data-aviso>${ok === false ? `⚠ ${e} años: no cumple ${esc(cat?.nombre || '')}` : ''}</span>
  </div>`;
}

// ───────── Mi equipo (panel del DT) ─────────
async function miEquipo(box, token) {
  box.innerHTML = '<div class="card"><div class="vacio">Cargando tu equipo…</div></div>';
  const { data, error } = await sb.rpc('dt_panel', { p_token: token });
  if (error) {
    if (/vencida/i.test(error.message)) { escribir(LS.dt, null); return panelInscripcion(box); }
    box.innerHTML = `<div class="card"><p>${esc(errMsg(error))}</p></div>`; return;
  }
  const D = data, eqs = D.equipos;
  if (equipoSel < 0 || equipoSel >= eqs.length) equipoSel = equipoSel < 0 ? eqs.length - 1 : 0;
  const e = eqs[equipoSel];
  const salir = () => { escribir(LS.dt, null); modo = 'volver'; escribir(LS.modo, modo); panelInscripcion(box); };
  if (!e) {
    box.innerHTML = `<div class="card"><button class="back" id="salir">← Salir</button><h2>Hola ${esc(D.dt.nombre)}</h2><p>No tenés equipos en el torneo activo.</p>
      ${D.torneo.abierta ? '<button class="btn" id="otro">Inscribir un equipo</button>' : ''}</div>`;
    $('#salir', box).onclick = salir;
    const o = $('#otro', box); if (o) o.onclick = () => otroEquipo(box, token);
    return;
  }
  const cat = { edad_min: e.edad_min, edad_max: e.edad_max, nombre: e.categoria };
  const js = e.jugadores;
  const sinApto = js.filter(j => apto(j).cls === 'error').length;
  const fuera = js.filter(j => edadOk(j, cat) === false).length;
  const editable = e.estado !== 'validada' && (D.torneo.abierta || e.estado === 'observada');
  const prox = e.partidos.find(p => p.estado !== 'confirmado' && p.inicio);
  const paso = (txt, sub, cls) => `<li class="${cls}"><b>${txt}</b>${sub}</li>`;

  box.innerHTML = `<div class="card">
    <button class="back" id="salir">← Salir de mi equipo</button>
    <div class="ok-head"><div class="tick"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></div>
      <div><h2>Mi equipo</h2><span class="small">DT ${esc(D.dt.nombre)} ${esc(D.dt.apellido)} · ${esc(e.sindicato)}</span></div></div>
    ${eqs.length > 1 ? `<div class="sub">${eqs.map((x, i) => `<button type="button" data-eq="${i}" aria-pressed="${i === equipoSel}">${esc(x.nombre)}</button>`).join('')}</div>` : ''}
    <div class="codebox"><span>Código de equipo</span><b>${esc(e.codigo)}</b><small>${esc(e.nombre)} · ${esc(e.categoria)}. Con tu mail y DNI volvés a esta pantalla. Mostralo en la mesa si te lo piden.</small></div>
    <ul class="pasos">
      ${paso('Inscripción', 'Enviada', 'ok')}
      ${paso('Validación', e.estado === 'validada' ? 'Lista validada' : e.estado === 'observada' ? 'Con observaciones' : 'En revisión', e.estado === 'validada' ? 'ok' : e.estado === 'observada' ? 'obs act' : 'act')}
      ${paso('Fixture', e.partidos.length ? e.partidos.length + ' partidos' : 'Se publica antes del torneo', e.partidos.length ? 'ok' : '')}
      ${paso('Torneo', fmtFecha(D.torneo.fecha), e.partidos.some(p => p.estado === 'confirmado') ? 'ok' : '')}
    </ul>
    ${e.estado === 'observada' ? `<div class="aviso"><b>La organización observó tu lista:</b> ${esc(e.obs || '')}<br>Corregí lo que haga falta y tocá "Reenviar a revisión".
      <div class="row" style="margin-top:8px"><button class="btn sm" id="reenv" type="button">Reenviar a revisión</button></div></div>` : ''}
    <div class="res">
      <div><b>${js.length}</b><span>Jugadores (máx. ${D.torneo.max})</span></div>
      <div class="${sinApto ? 'mal' : ''}"><b>${sinApto}</b><span>Sin apto vigente</span></div>
      <div class="${fuera ? 'mal' : ''}"><b>${fuera}</b><span>Fuera de categoría</span></div>
      <div><b>${e.partidos.length}</b><span>Partidos</span></div>
    </div>
    ${prox ? `<div class="card flat prox"><span class="small">Próximo partido</span><h3>vs ${esc(prox.rival || 'A definir')}</h3>
      <div class="grid3"><div class="stat"><b>${fmtHora(prox.inicio)}</b><span>Hora</span></div><div class="stat"><b style="font-size:18px">${esc(prox.cancha || '—')}</b><span>Cancha</span></div>
      <div class="stat"><b style="font-size:18px">${esc(FASES[prox.fase])}</b><span>Fase</span></div></div></div>` : ''}

    <h3>Lista de buena fe</h3>
    <p class="small">${editable ? 'Tocá un jugador para corregirlo. Los cambios llegan a la organización al instante.' : e.estado === 'validada' ? 'Lista validada. Para cambios, pedí una corrección.' : 'La inscripción está cerrada. Para cambios, pedí una corrección.'}</p>
    <div class="list">${js.map(j => {
      const a = apto(j), ok = edadOk(j, cat), ed = edad(j.fecha_nac);
      return `<div class="item ${editable ? 'click' : ''}" data-j="${j.id}"><b style="width:30px;text-align:center;color:var(--azul)">${j.dorsal ?? '–'}</b>
        <div class="grow"><div class="t">${esc(j.apellido)}, ${esc(j.nombre)}</div><div class="small">DNI ${esc(j.dni)}${ed != null ? ' · ' + ed + ' años' : ''}</div>
        <div class="row" style="gap:4px;margin-top:4px"><span class="badge b-${a.cls}">${a.txt}</span>${ok === false ? `<span class="badge b-error">No cumple ${esc(e.categoria)}</span>` : ''}</div></div></div>`;
    }).join('')}</div>
    ${editable && js.length < D.torneo.max ? '<button class="mini" id="addJ" type="button">+ Agregar jugador</button>' : ''}

    <h3>Acreditaciones</h3>
    <p class="small">Cada jugador tiene su QR para la mesa de su cancha. Mandáselo por WhatsApp o descargalo. ${e.estado !== 'validada' ? '<b>Quedan habilitadas cuando la organización valida la lista.</b>' : ''}</p>
    <div class="thumbs" id="acreds"></div>

    <div class="card flat">
      <h3>¿Hay que corregir algo?</h3>
      ${e.correcciones.length ? `<div class="list">${e.correcciones.map(c => `<div class="item"><span class="badge ${c.resuelta ? 'b-ok' : 'b-warn'}">${c.resuelta ? 'Resuelto' : 'Pendiente'}</span><div class="grow small" style="color:var(--tinta)">${esc(c.texto)}</div></div>`).join('')}</div>` : ''}
      <div class="f"><label for="corr">Contale a la organización qué hay que cambiar</label><textarea id="corr" maxlength="1000" placeholder="Ej.: el DNI de Pérez es 23456789 (no 23456798)."></textarea></div>
      <button class="btn sec" id="corrB" type="button">Enviar pedido</button>
    </div>
    ${D.torneo.abierta && eqs.length < 6 ? '<button class="btn ghost" id="otro" type="button">+ Inscribir otro equipo</button>' : ''}
  </div>`;

  const re = () => miEquipo(box, token);
  $('#salir', box).onclick = salir;
  $$('[data-eq]', box).forEach(b => b.onclick = () => { equipoSel = +b.dataset.eq; re(); });
  const on = (s, fn) => { const b = $(s, box); if (b) b.onclick = () => fn(b); };
  on('#reenv', b => conBoton(b, async () => {
    const { error: er } = await sb.rpc('dt_reenviar', { p_token: token, p_equipo: e.id });
    if (er) throw new Error(errMsg(er));
    toast('Lista reenviada a la organización', 'ok'); re();
  }));
  on('#addJ', () => editarJugador(token, e, null, cat, re));
  if (editable) $$('[data-j]', box).forEach(el => el.onclick = () => editarJugador(token, e, js.find(j => j.id === el.dataset.j), cat, re));
  on('#corrB', b => conBoton(b, async () => {
    const { error: er } = await sb.rpc('dt_correccion', { p_token: token, p_equipo: e.id, p_texto: $('#corr', box).value });
    if (er) throw new Error(errMsg(er));
    toast('Pedido enviado a la organización', 'ok'); re();
  }));
  on('#otro', () => otroEquipo(box, token));

  // Acreditaciones con QR (se dibujan después para no frenar la pantalla)
  const cont = $('#acreds', box);
  for (const j of js) {
    const qr = await qrSvg('TRIC:' + j.qr);
    const id = 'ac-' + j.id;
    const div = document.createElement('div');
    div.innerHTML = `<div class="acred" id="${id}">
      <div class="cab">${LOGO}<div><small>Acreditación · ${esc(S.torneo?.nombre || '')}</small></div></div>
      <div class="nombre">${esc(j.nombre)} ${esc(j.apellido)}</div>
      <div class="small" style="color:#d6ecfa;position:relative;z-index:1">${esc(e.nombre)}${j.dorsal != null ? ' · #' + j.dorsal : ''} · ${esc(e.sigla || e.sindicato)} · DNI ${esc(j.dni)}</div>
      <div class="qr">${qr}</div>
      <div class="pie"><span>${esc(e.categoria)}</span><span>${e.estado === 'validada' ? '✔ Habilitada' : 'Pendiente de validación'}</span></div>
    </div>
    <div class="row" style="margin-top:6px">
      ${j.tel ? `<a class="btn wa sm grow" target="_blank" rel="noopener" href="${esc(waLink(j.tel, `Hola ${j.nombre}! Ya estás en la lista de ${e.nombre} para el ${S.torneo?.nombre}. Tu acreditación y tu próximo partido: ${APP_URL()}#/ → Inscripción → Soy jugador/a (DNI + este WhatsApp).`))}">WhatsApp</a>` : ''}
      <button class="btn ghost sm grow" type="button" data-dl="${id}">Descargar</button></div>`;
    cont.append(div);
  }
  $$('[data-dl]', cont).forEach(b => b.onclick = () => conBoton(b, () => exportarImagen(document.getElementById(b.dataset.dl), 'acreditacion-' + b.dataset.dl)));
}

function editarJugador(token, e, j, cat, alGuardar) {
  const v = j ? { nombre: j.nombre, apellido: j.apellido, dni: j.dni, fecha_nac: j.fecha_nac || '', tel: j.tel || '', mail: j.mail || '', dorsal: j.dorsal ?? '',
    apto: j.apto_presentado ? 'si' : '', apto_vence: j.apto_vence || '' } : VACIO();
  const m = modal(`<h2>${j ? 'Corregir jugador' : 'Agregar jugador'}</h2><div class="ficha"><div class="ficha-b">${fichaJugador(v, 0, cat)}</div></div>
    <button class="btn block" id="ok" type="button">Guardar</button>${j ? '<button class="btn ghost block" id="del" type="button">Quitar de la lista</button>' : ''}`);
  $('[data-x]', m.el).remove();
  const d = $('.dep', m.el);
  d.addEventListener('input', ev => { const k = ev.target.dataset.k; if (k) v[k] = ev.target.value;
    if (k === 'apto') $('[data-k="apto_vence"]', d).closest('.f').classList.toggle('hidden', ev.target.value !== 'si'); });
  $('#ok', m.el).onclick = () => conBoton($('#ok', m.el), async () => {
    if (!jugadorCompleto(v)) throw new Error('Completá nombre, apellido, DNI, fecha de nacimiento y WhatsApp o mail.');
    const { error } = await sb.rpc('dt_guardar_jugador', { p_token: token, p_equipo: e.id, p: normJugador(v), p_jugador: j?.id || null });
    if (error) throw new Error(errMsg(error));
    m.close(); toast('Jugador guardado', 'ok'); alGuardar();
  });
  const del = $('#del', m.el);
  if (del) del.onclick = () => conBoton(del, async () => {
    const { error, count } = await sbDT(token).from('plantel').delete({ count: 'exact' }).eq('equipo_id', e.id).eq('jugador_id', j.id);
    if (error) throw new Error(errMsg(error));
    if (!count) throw new Error('No se pudo quitar (la lista puede estar validada o la inscripción cerrada).');
    m.close(); toast('Jugador quitado'); alGuardar();
  });
}

function otroEquipo(box, token) {
  const G = { dt: {}, equipo: { nombre: '', categoria_id: S.categorias[0]?.id || '' }, jugadores: [] };
  box.innerHTML = `<form class="card" novalidate>
    <button class="back" type="button" id="volver">← Volver a mi equipo</button>
    <h2>Inscribir otro equipo</h2>
    <fieldset>
      <div class="f full"><label for="o-sin">Sindicato</label><select id="o-sin"><option value="">Elegí…</option>${S.sindicatos.map(s => `<option value="${s.id}">${esc(s.nombre)}</option>`).join('')}</select></div>
      ${campo('o-nom', 'Nombre del equipo', '', '', 'full')}
      ${S.categorias.length > 1 ? `<div class="f full"><label for="o-cat">Categoría</label><select id="o-cat">${S.categorias.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select></div>` : ''}
    </fieldset>
    <div id="listaBox"></div>
    <button class="btn" type="submit">Confirmar envío</button></form>`;
  const f = $('form', box);
  $('#volver', f).onclick = () => panelInscripcion(box);
  listaEditor($('#listaBox', f), G, () => {});
  f.onsubmit = ev => { ev.preventDefault(); conBoton($('button[type=submit]', f), async () => {
    G.equipo.nombre = $('#o-nom', f).value;
    if ($('#o-cat', f)) G.equipo.categoria_id = $('#o-cat', f).value;
    if (!$('#o-sin', f).value) throw new Error('Elegí el sindicato.');
    if (G.jugadores.length < S.torneo.min_jugadores || G.jugadores.some(j => !jugadorCompleto(j))) throw new Error(`Completá al menos ${S.torneo.min_jugadores} fichas.`);
    const { data, error } = await sb.rpc('dt_agregar_equipo', { p_token: token, p: { sindicato_id: $('#o-sin', f).value, equipo: G.equipo.nombre, categoria_id: G.equipo.categoria_id, jugadores: G.jugadores.map(normJugador) } });
    if (error) throw new Error(errMsg(error));
    toast(`Equipo inscripto · código ${data.codigo}`, 'ok'); equipoSel = -1; panelInscripcion(box);
  }); };
}
