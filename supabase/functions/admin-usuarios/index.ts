// Alta y gestión de usuarios de la organización (admin, resp. de cancha, sindical, DT).
// Solo la puede usar un perfil admin activo. La service_role queda en el servidor.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ROLES = ["admin", "resp_cancha", "sindical", "dt"];

function res(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function txt(v: unknown, max = 120) {
  return String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return res({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return res({ error: "Sesión inválida" }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: yo } = await admin.from("perfiles").select("rol, activo").eq("id", u.user.id).maybeSingle();
  if (!yo || yo.rol !== "admin" || !yo.activo) return res({ error: "Solo la organización puede gestionar usuarios" }, 403);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return res({ error: "Datos inválidos" }, 400); }

  try {
    if (b.accion === "crear") {
      const email = txt(b.email).toLowerCase();
      const password = String(b.password ?? "");
      const nombre = txt(b.nombre, 80);
      const rol = String(b.rol ?? "");
      const sindicato_id = b.sindicato_id ? String(b.sindicato_id) : null;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res({ error: "Mail inválido" }, 400);
      if (password.length < 8) return res({ error: "La clave debe tener al menos 8 caracteres" }, 400);
      if (nombre.length < 2) return res({ error: "Falta el nombre" }, 400);
      if (!ROLES.includes(rol)) return res({ error: "Rol inválido" }, 400);
      if (rol === "sindical" && !sindicato_id) return res({ error: "El responsable sindical necesita sindicato" }, 400);

      const { data: c, error: e1 } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (e1 || !c.user) return res({ error: e1?.message?.includes("already") ? "Ese mail ya tiene usuario" : (e1?.message ?? "No se pudo crear") }, 400);
      const { error: e2 } = await admin.from("perfiles").insert({
        id: c.user.id, nombre, rol, sindicato_id, tel: txt(b.tel, 30) || null, mail: email,
      });
      if (e2) {
        await admin.auth.admin.deleteUser(c.user.id);
        return res({ error: e2.message }, 400);
      }
      return res({ ok: true, id: c.user.id });
    }

    if (b.accion === "clave") {
      const password = String(b.password ?? "");
      if (password.length < 8) return res({ error: "La clave debe tener al menos 8 caracteres" }, 400);
      const { error } = await admin.auth.admin.updateUserById(String(b.id), { password });
      if (error) return res({ error: error.message }, 400);
      return res({ ok: true });
    }

    if (b.accion === "editar") {
      const id = String(b.id);
      if (id === u.user.id && b.activo === false) return res({ error: "No podés darte de baja a vos mismo" }, 400);
      const cambios: Record<string, unknown> = {};
      if (b.nombre !== undefined) cambios.nombre = txt(b.nombre, 80);
      if (b.rol !== undefined) { if (!ROLES.includes(String(b.rol))) return res({ error: "Rol inválido" }, 400); cambios.rol = b.rol; }
      if (b.sindicato_id !== undefined) cambios.sindicato_id = b.sindicato_id || null;
      if (b.tel !== undefined) cambios.tel = txt(b.tel, 30) || null;
      if (b.activo !== undefined) cambios.activo = !!b.activo;
      const { error } = await admin.from("perfiles").update(cambios).eq("id", id);
      if (error) return res({ error: error.message }, 400);
      if (b.activo !== undefined) {
        await admin.auth.admin.updateUserById(id, { ban_duration: b.activo ? "none" : "876000h" });
      }
      return res({ ok: true });
    }

    return res({ error: "Acción desconocida" }, 400);
  } catch (e) {
    return res({ error: String((e as Error).message ?? e) }, 500);
  }
});
