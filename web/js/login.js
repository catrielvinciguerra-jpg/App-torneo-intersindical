// Ingreso: deportista (mail o WhatsApp + DNI) u organización (mail + clave dada por la organización).
import { S, sb, $, $$, cabecera, toast, errMsg, conBoton, cargarSesion, inicioRol } from './core.js';

let modo = 'jugador';

export async function vistaLogin(root) {
  if (S.perfil) { location.hash = inicioRol(S.perfil.rol); return; }
  let token = null; try { token = localStorage.getItem('jug_token'); } catch {}
  if (token && modo === 'jugador') { location.hash = '#/yo'; return; }

  root.innerHTML = cabecera('Ingresar') + `
  <main class="wrap" style="max-width:460px">
    <div class="tabs"><button class="tab ${modo === 'jugador' ? 'on' : ''}" data-m="jugador">Soy jugador/a</button>
      <button class="tab ${modo === 'org' ? 'on' : ''}" data-m="org">Organización · DT · Sindicato</button></div>
    ${modo === 'jugador' ? `
    <form class="card stack" id="fJug">
      <h2>Mi convocatoria</h2>
      <p class="muted small" style="margin:0">Usá el mail o el WhatsApp que cargó tu DT en la lista de buena fe. La clave es tu DNI.</p>
      <label class="f">Mail o WhatsApp<input name="ident" autocomplete="username" required placeholder="nombre@mail.com o 11 2345 6789"></label>
      <label class="f">DNI<input name="dni" inputmode="numeric" autocomplete="current-password" required placeholder="Sin puntos"></label>
      <button class="btn block">Ver mi convocatoria</button>
    </form>` : `
    <form class="card stack" id="fOrg">
      <h2>Ingreso de la organización</h2>
      <p class="muted small" style="margin:0">Mail y clave entregados por la organización del torneo.</p>
      <label class="f">Mail<input name="email" type="email" autocomplete="username" required></label>
      <label class="f">Clave<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn block">Ingresar</button>
    </form>`}
    <p class="center"><a href="#/">← Ver fixture y resultados</a></p>
  </main>`;

  $$('[data-m]', root).forEach(b => b.onclick = () => { modo = b.dataset.m; vistaLogin(root); });

  const fj = $('#fJug', root);
  if (fj) fj.onsubmit = e => {
    e.preventDefault();
    conBoton($('button', fj), async () => {
      const { data, error } = await sb.rpc('login_jugador', { p_ident: fj.ident.value, p_dni: fj.dni.value });
      if (error) throw new Error(errMsg(error));
      try { localStorage.setItem('jug_token', data.token); } catch {}
      toast(`¡Hola ${data.nombre}!`, 'ok');
      location.hash = '#/yo';
    });
  };
  const fo = $('#fOrg', root);
  if (fo) fo.onsubmit = e => {
    e.preventDefault();
    conBoton($('button', fo), async () => {
      const { error } = await sb.auth.signInWithPassword({ email: fo.email.value.trim(), password: fo.password.value });
      if (error) throw new Error(/Invalid login/i.test(error.message) ? 'Mail o clave incorrectos.' : errMsg(error));
      const p = await cargarSesion();
      if (!p) { await sb.auth.signOut(); throw new Error('Tu usuario no está habilitado. Consultá a la organización.'); }
      location.hash = inicioRol(p.rol);
    });
  };
}
