-- Inscripción estilo JUBU: el DT (jefe de delegación) se inscribe solo con su mail + DNI, sin usuario creado por la organización.

alter table public.torneos
  add column inscripcion_abierta boolean not null default true,
  add column cierre_inscripcion timestamptz,
  add column reglamento text,
  add column organiza text default 'Confederación General del Trabajo de la República Argentina',
  add column max_jugadores int not null default 20,
  add column min_jugadores int not null default 7;

create table public.delegados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido text not null,
  dni text not null unique,
  fecha_nac date,
  cargo text,
  tel text not null,
  mail text not null unique,
  token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now()
);
alter table public.delegados enable row level security;
create policy admin_todo on public.delegados for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

alter table public.equipos
  add column delegado_id uuid references public.delegados on delete set null,
  add column codigo text unique default ('CGT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)));
create index on public.equipos (delegado_id);

create table public.correcciones (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos on delete cascade,
  texto text not null,
  resuelta boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.correcciones (equipo_id);
alter table public.correcciones enable row level security;
create policy admin_todo on public.correcciones for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

-- El teléfono del DT deja de ser público: anon solo ve columnas no personales de equipos.
revoke select on public.equipos from anon;
grant select (id, torneo_id, categoria_id, sindicato_id, nombre, estado_lista, zona_id, color, created_at, codigo) on public.equipos to anon;

-- Núcleo de alta/edición de jugador (sin chequeo de permisos: lo llaman funciones que ya validaron).
create or replace function public._jugador_core(p_equipo uuid, p jsonb, p_jugador uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_dni text := upper(regexp_replace(coalesce(p->>'dni',''), '[^0-9A-Za-z]', '', 'g'));
  v_id uuid := p_jugador;
  v_existente uuid;
  v_max int;
begin
  if v_dni !~ '^[0-9A-Z]{6,12}$' then raise exception 'DNI inválido (%).', coalesce(p->>'apellido', ''); end if;
  if length(trim(coalesce(p->>'nombre',''))) < 2 or length(trim(coalesce(p->>'apellido',''))) < 2 then raise exception 'Falta nombre o apellido.'; end if;
  select t.max_jugadores into v_max from public.equipos e join public.torneos t on t.id = e.torneo_id where e.id = p_equipo;
  if p_jugador is null and (select count(*) from public.plantel where equipo_id = p_equipo) >= v_max then
    raise exception 'La lista ya tiene el máximo de % jugadores.', v_max;
  end if;
  select jugador_id into v_existente from public.jugadores_datos where dni = v_dni;
  if v_id is null then
    if v_existente is not null then
      v_id := v_existente;
    else
      if coalesce((p->>'consentimiento')::boolean, false) is not true then raise exception 'Falta el consentimiento de datos personales.'; end if;
      insert into public.jugadores (nombre, apellido) values (trim(p->>'nombre'), trim(p->>'apellido')) returning id into v_id;
      insert into public.jugadores_datos (jugador_id, dni, consentimiento_at) values (v_id, v_dni, now());
    end if;
  elsif v_existente is not null and v_existente <> v_id then
    raise exception 'Ese DNI ya pertenece a otro jugador.';
  end if;
  insert into public.plantel (equipo_id, jugador_id, dorsal, observaciones)
  values (p_equipo, v_id, nullif(p->>'dorsal','')::int, left(nullif(trim(p->>'observaciones'),''), 300))
  on conflict (equipo_id, jugador_id) do update set dorsal = excluded.dorsal, observaciones = excluded.observaciones;
  update public.jugadores set nombre = left(trim(p->>'nombre'),60), apellido = left(trim(p->>'apellido'),60) where id = v_id;
  update public.jugadores_datos set
    dni = v_dni,
    fecha_nac = nullif(p->>'fecha_nac','')::date,
    tel = left(nullif(trim(p->>'tel'),''), 30),
    mail = left(lower(nullif(trim(p->>'mail'),'')), 120),
    apto_vence = nullif(p->>'apto_vence','')::date,
    apto_presentado = coalesce((p->>'apto_presentado')::boolean, false)
  where jugador_id = v_id;
  return v_id;
end $$;

create or replace function public.guardar_jugador(p_equipo uuid, p jsonb, p_jugador uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not public.puede_editar_equipo(p_equipo) then raise exception 'No tenés permiso sobre este equipo.'; end if;
  if not public.lista_editable(p_equipo) then raise exception 'La lista ya fue validada. Pedí cambios a la mesa.'; end if;
  return public._jugador_core(p_equipo, p, p_jugador);
end $$;

-- DT por token
create or replace function public._dt(p_token uuid) returns public.delegados
language plpgsql stable security definer set search_path = '' as $$
declare d public.delegados;
begin
  select * into d from public.delegados where token = p_token;
  if d.id is null then raise exception 'Sesión vencida. Ingresá de nuevo con tu mail y DNI.'; end if;
  return d;
end $$;

create or replace function public._dt_equipo(p_token uuid, p_equipo uuid, p_editar boolean) returns public.equipos
language plpgsql stable security definer set search_path = '' as $$
declare d public.delegados := public._dt(p_token); e public.equipos; t public.torneos;
begin
  select * into e from public.equipos where id = p_equipo and delegado_id = d.id;
  if e.id is null then raise exception 'Ese equipo no es de tu delegación.'; end if;
  if p_editar then
    select * into t from public.torneos where id = e.torneo_id;
    if e.estado_lista = 'validada' then raise exception 'La lista ya fue validada. Pedí la corrección a la organización.'; end if;
    if e.estado_lista <> 'observada' and (not t.inscripcion_abierta or (t.cierre_inscripcion is not null and now() > t.cierre_inscripcion)) then
      raise exception 'La inscripción está cerrada. Pedí la corrección a la organización.';
    end if;
  end if;
  return e;
end $$;

create or replace function public._nuevo_equipo(d public.delegados, p jsonb) returns public.equipos
language plpgsql security definer set search_path = '' as $$
declare t public.torneos; v_sin uuid; v_cat uuid; e public.equipos; j jsonb; n int := 0;
begin
  select * into t from public.torneos where activo limit 1;
  if not t.inscripcion_abierta or (t.cierre_inscripcion is not null and now() > t.cierre_inscripcion) then raise exception 'La inscripción está cerrada.'; end if;
  if (select count(*) from public.equipos where delegado_id = d.id) >= 6 then raise exception 'Máximo 6 equipos por DT.'; end if;
  v_sin := nullif(p->>'sindicato_id','')::uuid;
  if v_sin is null then
    if length(trim(coalesce(p->>'sindicato_nuevo',''))) < 3 then raise exception 'Elegí o escribí el sindicato.'; end if;
    select id into v_sin from public.sindicatos where lower(nombre) = lower(trim(p->>'sindicato_nuevo'));
    if v_sin is null then
      insert into public.sindicatos (nombre, sigla) values (left(trim(p->>'sindicato_nuevo'), 80), left(nullif(upper(trim(p->>'sigla')),''), 12)) returning id into v_sin;
    end if;
  end if;
  v_cat := coalesce(nullif(p->>'categoria_id','')::uuid, (select id from public.categorias where torneo_id = t.id order by orden limit 1));
  if length(trim(coalesce(p->>'equipo',''))) < 2 then raise exception 'Falta el nombre del equipo.'; end if;
  insert into public.equipos (torneo_id, categoria_id, sindicato_id, nombre, delegado_id, dt_nombre, dt_tel, estado_lista)
  values (t.id, v_cat, v_sin, left(trim(p->>'equipo'), 60), d.id, d.nombre || ' ' || d.apellido, d.tel, 'enviada') returning * into e;
  for j in select * from jsonb_array_elements(coalesce(p->'jugadores', '[]'::jsonb)) loop
    perform public._jugador_core(e.id, j || jsonb_build_object('consentimiento', true), null);
    n := n + 1;
  end loop;
  if n < t.min_jugadores then raise exception 'La lista necesita al menos % jugadores.', t.min_jugadores; end if;
  return e;
end $$;

-- Alta completa: DT + equipo + lista de buena fe, en una sola confirmación.
create or replace function public.dt_inscribir(p jsonb) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_mail text := lower(trim(coalesce(p->>'mail','')));
  v_dni text := upper(regexp_replace(coalesce(p->>'dni',''), '[^0-9A-Za-z]', '', 'g'));
  d public.delegados; e public.equipos;
begin
  if coalesce(p->>'web','') <> '' then raise exception 'Envío rechazado.'; end if; -- honeypot
  if coalesce((p->>'acepto')::boolean, false) is not true then raise exception 'Falta aceptar la declaración y el consentimiento.'; end if;
  if v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Mail del DT inválido.'; end if;
  if v_dni !~ '^[0-9A-Z]{6,12}$' then raise exception 'DNI del DT inválido.'; end if;
  if length(regexp_replace(coalesce(p->>'tel',''), '[^0-9]', '', 'g')) < 8 then raise exception 'Celular del DT inválido.'; end if;
  select * into d from public.delegados where mail = v_mail or dni = v_dni limit 1;
  if d.id is not null then
    if d.mail <> v_mail or d.dni <> v_dni then raise exception 'Ese mail o DNI ya está registrado. Entrá por "Ya inscribí mi equipo".'; end if;
  else
    if length(trim(coalesce(p->>'nombre',''))) < 2 or length(trim(coalesce(p->>'apellido',''))) < 2 then raise exception 'Falta nombre o apellido del DT.'; end if;
    insert into public.delegados (nombre, apellido, dni, fecha_nac, cargo, tel, mail)
    values (left(trim(p->>'nombre'),60), left(trim(p->>'apellido'),60), v_dni, nullif(p->>'fecha_nac','')::date, left(nullif(trim(p->>'cargo'),''),80), left(trim(p->>'tel'),30), v_mail)
    returning * into d;
  end if;
  e := public._nuevo_equipo(d, p);
  return json_build_object('token', d.token, 'codigo', e.codigo);
end $$;

create or replace function public.dt_agregar_equipo(p_token uuid, p jsonb) returns json
language plpgsql security definer set search_path = '' as $$
declare e public.equipos;
begin
  e := public._nuevo_equipo(public._dt(p_token), p);
  return json_build_object('codigo', e.codigo);
end $$;

create or replace function public.dt_login(p_mail text, p_dni text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_mail text := lower(trim(coalesce(p_mail,''))); v_dni text := upper(regexp_replace(coalesce(p_dni,''), '[^0-9A-Za-z]', '', 'g')); d public.delegados;
begin
  if (select count(*) from public.login_intentos where clave = 'dt:' || v_mail and ts > now() - interval '15 minutes') >= 8 then
    raise exception 'Demasiados intentos. Probá de nuevo en 15 minutos.';
  end if;
  select * into d from public.delegados where mail = v_mail and dni = v_dni;
  if d.id is null then
    insert into public.login_intentos (clave) values ('dt:' || v_mail);
    raise exception 'No encontramos un DT con ese mail y DNI.';
  end if;
  return json_build_object('token', d.token, 'nombre', d.nombre);
end $$;

-- Todo lo que ve el DT: sus equipos, listas, estado, partidos y pedidos de corrección.
create or replace function public.dt_panel(p_token uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare d public.delegados := public._dt(p_token); t public.torneos;
begin
  select * into t from public.torneos where activo limit 1;
  return json_build_object(
    'dt', json_build_object('nombre', d.nombre, 'apellido', d.apellido, 'dni', d.dni, 'mail', d.mail, 'tel', d.tel, 'cargo', d.cargo),
    'torneo', json_build_object('nombre', t.nombre, 'fecha', t.fecha, 'sede', t.sede, 'abierta', t.inscripcion_abierta and (t.cierre_inscripcion is null or now() <= t.cierre_inscripcion),
      'cierre', t.cierre_inscripcion, 'max', t.max_jugadores, 'min', t.min_jugadores),
    'equipos', coalesce((select json_agg(json_build_object(
      'id', e.id, 'codigo', e.codigo, 'nombre', e.nombre, 'estado', e.estado_lista, 'obs', e.obs_mesa,
      'sindicato', s.nombre, 'sigla', s.sigla, 'categoria', c.nombre, 'edad_min', c.edad_min, 'edad_max', c.edad_max,
      'jugadores', coalesce((select json_agg(json_build_object('id', j.id, 'nombre', j.nombre, 'apellido', j.apellido, 'dorsal', pl.dorsal, 'obs', pl.observaciones,
          'dni', jd.dni, 'fecha_nac', jd.fecha_nac, 'tel', jd.tel, 'mail', jd.mail, 'apto_vence', jd.apto_vence, 'apto_presentado', jd.apto_presentado, 'qr', jd.qr)
          order by pl.dorsal nulls last, j.apellido)
        from public.plantel pl join public.jugadores j on j.id = pl.jugador_id join public.jugadores_datos jd on jd.jugador_id = j.id
        where pl.equipo_id = e.id), '[]'::json),
      'partidos', coalesce((select json_agg(json_build_object('inicio', p.inicio, 'cancha', ca.nombre, 'estado', p.estado, 'fase', p.fase,
          'rival', case when p.local_id = e.id then ev.nombre else el.nombre end, 'gf', case when p.local_id = e.id then p.goles_l else p.goles_v end,
          'gc', case when p.local_id = e.id then p.goles_v else p.goles_l end) order by p.inicio nulls last)
        from public.partidos p left join public.canchas ca on ca.id = p.cancha_id
        left join public.equipos el on el.id = p.local_id left join public.equipos ev on ev.id = p.visitante_id
        where e.id in (p.local_id, p.visitante_id)), '[]'::json),
      'correcciones', coalesce((select json_agg(json_build_object('texto', x.texto, 'resuelta', x.resuelta, 'fecha', x.created_at) order by x.created_at desc)
        from public.correcciones x where x.equipo_id = e.id), '[]'::json)
    ) order by e.created_at)
    from public.equipos e join public.sindicatos s on s.id = e.sindicato_id join public.categorias c on c.id = e.categoria_id
    where e.delegado_id = d.id and e.torneo_id = t.id), '[]'::json)
  );
end $$;

create or replace function public.dt_guardar_jugador(p_token uuid, p_equipo uuid, p jsonb, p_jugador uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform public._dt_equipo(p_token, p_equipo, true);
  if p_jugador is not null and not exists (select 1 from public.plantel where equipo_id = p_equipo and jugador_id = p_jugador) then
    raise exception 'Ese jugador no está en tu lista.';
  end if;
  return public._jugador_core(p_equipo, p || jsonb_build_object('consentimiento', true), p_jugador);
end $$;

-- El DT quita jugadores con un DELETE directo sobre plantel; su token viaja en el header x-dt-token.
create or replace function public.dt_header_puede(p_equipo uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v text := current_setting('request.headers', true)::json->>'x-dt-token';
begin
  if v is null or v !~ '^[0-9a-f-]{36}$' then return false; end if;
  perform public._dt_equipo(v::uuid, p_equipo, true);
  return true;
exception when others then return false;
end $$;
grant execute on function public.dt_header_puede(uuid) to anon, authenticated;
create policy dt_quita on public.plantel for delete to anon using (public.dt_header_puede(equipo_id));
grant delete on public.plantel to anon;

create or replace function public.dt_reenviar(p_token uuid, p_equipo uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._dt_equipo(p_token, p_equipo, true);
  update public.equipos set estado_lista = 'enviada' where id = p_equipo;
end $$;

create or replace function public.dt_correccion(p_token uuid, p_equipo uuid, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._dt_equipo(p_token, p_equipo, false);
  if length(trim(coalesce(p_texto,''))) < 5 then raise exception 'Contá qué hay que corregir.'; end if;
  if (select count(*) from public.correcciones where equipo_id = p_equipo and not resuelta) >= 5 then raise exception 'Ya hay 5 pedidos pendientes para este equipo.'; end if;
  insert into public.correcciones (equipo_id, texto) values (p_equipo, left(trim(p_texto), 1000));
end $$;

revoke execute on function public._jugador_core(uuid, jsonb, uuid), public._dt(uuid), public._dt_equipo(uuid, uuid, boolean),
  public._nuevo_equipo(public.delegados, jsonb) from public, anon, authenticated;
grant execute on function public.dt_inscribir(jsonb), public.dt_agregar_equipo(uuid, jsonb), public.dt_login(text, text), public.dt_panel(uuid),
  public.dt_guardar_jugador(uuid, uuid, jsonb, uuid), public.dt_reenviar(uuid, uuid),
  public.dt_correccion(uuid, uuid, text) to anon, authenticated;
grant execute on function public.guardar_jugador(uuid, jsonb, uuid) to authenticated;

update public.torneos set reglamento =
'Requisitos
- Cada equipo representa a un sindicato adherido y lo inscribe su DT (responsable del equipo).
- Categoría Master +40: todos los jugadores deben tener 40 años cumplidos al día del torneo.
- Apto médico vigente obligatorio para cada jugador.
- Presentarse en la mesa de su cancha 15 minutos antes, con DNI y acreditación QR.

Inscripción
1. El DT completa sus datos, los del equipo y la lista de buena fe.
2. La organización valida la lista o la observa con un comentario.
3. Con la lista validada, cada jugador ve su acreditación en "Soy jugador/a".

Sistema de juego
Zonas todos contra todos y luego eliminación directa. Ganado 3 puntos, empate 1. Desempate: diferencia de gol, goles a favor y fair play.'
where activo;
