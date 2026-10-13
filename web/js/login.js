// Acceso de la organización (admin, responsables de cancha y sindicales): mail + clave dada por la organización.
// DT y jugadores entran desde el portal (Inscripción), como en JUBU.
import { S, sb, $, cabecera, errMsg, conBoton, cargarSesion, inicioRol } from './core.js';

export async function vistaLogin(root) {
  if (S.perfil) { location.hash = inicioRol(S.perfil.rol); return; }
  root.innerHTML = cabecera('Acceso organización') + `
  <main class="wrap" style="max-width:480px">
    <form class="card" id="fOrg" novalidate>
      <h2>Ingreso de la organización</h2>
      <p class="small">Mesa, responsables de cancha y sindicales: mail y clave entregados por la organización.</p>
      <fieldset>
        <div class="f full"><label for="o-mail">Mail</label><input id="o-mail" name="email" type="email" autocomplete="username" required></div>
        <div class="f full"><label for="o-pass">Clave</label><input id="o-pass" name="password" type="password" autocomplete="current-password" required></div>
      </fieldset>
      <button class="btn">Ingresar</button>
    </form>
    <div class="card flat"><p class="small"><b>¿Sos DT o jugador/a?</b> Entrá por el portal, en la pestaña Inscripción.</p>
      <a class="btn ghost" href="#/inscripcion">Ir a Inscripción</a></div>
  </main>`;
  const fo = $('#fOrg', root);
  fo.onsubmit = e => {
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
