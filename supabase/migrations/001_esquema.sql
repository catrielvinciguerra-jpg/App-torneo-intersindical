-- Torneo Relámpago Intersindical CGT · esquema base
-- Datos públicos (fixture, resultados, nombres) separados de datos personales (DNI, contacto, apto).

create extension if not exists pgcrypto;

-- ───────── Tablas ─────────
create table public.torneos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  fecha date,
  sede text,
  direccion text,
  activo boolean not null default true,
  hora_inicio time not null default '09:00',
  duracion_min int not null default 20 check (duracion_min between 5 and 120),
  intervalo_min int not null default 5 check (intervalo_min between 0 and 60),
  descanso_min int not null default 20 check (descanso_min between 0 and 240),
  pts_ganado int not null default 3,
  pts_empate int not null default 1,
  fp_amarilla int not null default 1,
  fp_roja int not null default 3,
  publicado boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references public.torneos on delete cascade,
  nombre text not null,
  edad_min int,
  edad_max int,
  orden int not null default 0
);

create table public.sindicatos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  sigla text,
  contacto_nombre text,
  contacto_tel text,
  contacto_mail text,
  created_at timestamptz not null default now()
);

create table public.perfiles (
  id uuid primary key references auth.users on delete cascade,
  nombre text not null,
  rol text not null check (rol in ('admin','resp_cancha','sindical','dt')),
  sindicato_id uuid references public.sindicatos on delete set null,
  tel text,
  mail text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.canchas (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references public.torneos on delete cascade,
  nombre text not null,
  tipo text not null default 'F5',
  activa boolean not null default true,
  responsable_id uuid references public.perfiles on delete set null,
  hora_desde time,
  hora_hasta time,
  orden int not null default 0
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references public.torneos on delete cascade,
  nombre text not null,
  funcion text not null default 'arbitro' check (funcion in ('arbitro','planillero','otro')),
  tel text,
  mail text,
  disponible_desde time,
  disponible_hasta time,
  activo boolean not null default true,
  token uuid not null default gen_random_uuid() unique
);

create table public.zonas (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references public.torneos on delete cascade,
  categoria_id uuid not null references public.categorias on delete cascade,
  nombre text not null,
  cancha_base_id uuid references public.canchas on delete set null,
  orden int not null default 0
);

create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references public.torneos on delete cascade,
  categoria_id uuid not null references public.categorias,
  sindicato_id uuid not null references public.sindicatos,
  nombre text not null,
  dt_id uuid references public.perfiles on delete set null,
  dt_nombre text,
  dt_tel text,
  estado_lista text not null default 'borrador' check (estado_lista in ('borrador','enviada','observada','validada')),
  obs_mesa text,
  zona_id uuid references public.zonas on delete set null,
  color text,
  created_at timestamptz not null default now(),
  unique (torneo_id, nombre)
);

-- Pública: solo lo que se muestra en fixture, planillas y goleadores.
create table public.jugadores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido text not null,
  created_at timestamptz not null default now()
);

-- Privada: datos personales (Ley 25.326). Apto: solo estado y vencimiento, sin certificado.
create table public.jugadores_datos (
  jugador_id uuid primary key references public.jugadores on delete cascade,
  dni text not null unique,
  fecha_nac date,
  tel text,
  mail text,
  apto_vence date,
  apto_presentado boolean not null default false,
  consentimiento_at timestamptz not null,
  token uuid not null default gen_random_uuid() unique,
  qr text not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)) unique
);

create table public.plantel (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos on delete cascade,
  jugador_id uuid not null references public.jugadores on delete cascade,
  dorsal int check (dorsal between 0 and 99),
  observaciones text,
  unique (equipo_id, jugador_id)
);

create table public.partidos (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references public.torneos on delete cascade,
  categoria_id uuid not null references public.categorias on delete cascade,
  zona_id uuid references public.zonas on delete set null,
  fase text not null default 'zona' check (fase in ('zona','octavos','cuartos','semi','tercero','final')),
  ronda int not null default 1,
  orden_llave int,
  local_id uuid references public.equipos on delete cascade,
  visitante_id uuid references public.equipos on delete cascade,
  cancha_id uuid references public.canchas on delete set null,
  inicio timestamptz,
  estado text not null default 'programado' check (estado in ('programado','en_juego','confirmado')),
  goles_l int,
  goles_v int,
  penales_l int,
  penales_v int,
  arbitro_id uuid references public.staff on delete set null,
  obs text,
  confirmado_por uuid references public.perfiles on delete set null,
  confirmado_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references public.partidos on delete cascade,
  equipo_id uuid not null references public.equipos on delete cascade,
  jugador_id uuid references public.jugadores on delete cascade,
  tipo text not null check (tipo in ('presente','gol','amarilla','roja')),
  minuto int,
  client_uuid uuid not null unique,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index eventos_presente_unico on public.eventos (partido_id, jugador_id) where tipo = 'presente';

create table public.mensajes (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid references public.torneos on delete cascade,
  segmento text not null,
  destino text,
  texto text not null,
  canal text not null,
  cantidad int not null default 0,
  autor uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.login_intentos (
  id bigint generated always as identity primary key,
  clave text not null,
  ts timestamptz not null default now()
);
create index login_intentos_clave_ts on public.login_intentos (clave, ts);

-- índices de FKs
create index on public.categorias (torneo_id);
create index on public.perfiles (sindicato_id);
create index on public.canchas (torneo_id);
create index on public.canchas (responsable_id);
create index on public.staff (torneo_id);
create index on public.zonas (torneo_id);
create index on public.zonas (categoria_id);
create index on public.zonas (cancha_base_id);
create index on public.equipos (categoria_id);
create index on public.equipos (sindicato_id);
create index on public.equipos (dt_id);
create index on public.equipos (zona_id);
create index on public.plantel (jugador_id);
create index on public.partidos (torneo_id);
create index on public.partidos (categoria_id);
create index on public.partidos (zona_id);
create index on public.partidos (local_id);
create index on public.partidos (visitante_id);
create index on public.partidos (cancha_id);
create index on public.partidos (arbitro_id);
create index on public.partidos (confirmado_por);
create index on public.eventos (partido_id);
create index on public.eventos (equipo_id);
create index on public.eventos (jugador_id);
create index on public.mensajes (torneo_id);

-- ───────── Funciones de permiso ─────────
create or replace function public.mi_rol() returns text
language sql stable security definer set search_path = '' as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select rol = 'admin' from public.perfiles where id = auth.uid() and activo), false)
$$;

create or replace function public.mi_sindicato() returns uuid
language sql stable security definer set search_path = '' as $$
  select sindicato_id from public.perfiles where id = auth.uid() and activo
$$;

create or replace function public.puede_editar_equipo(eq uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.equipos e
    join public.perfiles p on p.id = auth.uid() and p.activo
    where e.id = eq and (
      p.rol = 'admin'
      or (p.rol = 'sindical' and e.sindicato_id = p.sindicato_id)
      or (p.rol = 'dt' and e.dt_id = p.id)
    )
  )
$$;

create or replace function public.lista_editable(eq uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.es_admin() or exists (
    select 1 from public.equipos e where e.id = eq and e.estado_lista in ('borrador','observada')
  )
$$;

create or replace function public.puede_planillar(par uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.es_admin() or exists (
    select 1 from public.partidos x
    join public.canchas c on c.id = x.cancha_id
    join public.perfiles p on p.id = auth.uid() and p.activo and p.rol = 'resp_cancha'
    where x.id = par and c.responsable_id = p.id
  )
$$;

-- ───────── Reglas de negocio (triggers) ─────────
create or replace function public.tg_equipos_reglas() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r text := public.mi_rol();
begin
  if public.es_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.zona_id := null;
    new.obs_mesa := null;
    if r = 'dt' then new.dt_id := auth.uid(); end if;
    if r = 'sindical' and new.sindicato_id is distinct from public.mi_sindicato() then
      raise exception 'Solo podés cargar equipos de tu sindicato.';
    end if;
    if new.estado_lista not in ('borrador','enviada') then new.estado_lista := 'borrador'; end if;
    return new;
  end if;
  -- UPDATE por sindical o DT
  if old.estado_lista = 'validada' then raise exception 'La lista ya fue validada por la organización. Pedí cambios a la mesa.'; end if;
  if new.estado_lista not in ('borrador','enviada') then raise exception 'Solo la organización valida u observa listas.'; end if;
  new.zona_id := old.zona_id;
  new.obs_mesa := old.obs_mesa;
  new.torneo_id := old.torneo_id;
  if r = 'dt' then new.dt_id := old.dt_id; end if;
  if r = 'sindical' then new.sindicato_id := old.sindicato_id; end if;
  return new;
end $$;
create trigger equipos_reglas before insert or update on public.equipos
  for each row execute function public.tg_equipos_reglas();

-- Un jugador, un equipo por torneo.
create or replace function public.tg_plantel_unico() returns trigger
language plpgsql security definer set search_path = '' as $$
declare otro text;
begin
  select e2.nombre into otro
  from public.plantel p2
  join public.equipos e2 on e2.id = p2.equipo_id
  join public.equipos e1 on e1.id = new.equipo_id
  where p2.jugador_id = new.jugador_id and p2.equipo_id <> new.equipo_id and e2.torneo_id = e1.torneo_id
  limit 1;
  if otro is not null then raise exception 'El jugador ya está en la lista de %.', otro; end if;
  return new;
end $$;
create trigger plantel_unico before insert or update on public.plantel
  for each row execute function public.tg_plantel_unico();

-- Eventos: el equipo debe jugar el partido y el jugador pertenecer al equipo.
create or replace function public.tg_eventos_reglas() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  select * into p from public.partidos where id = new.partido_id;
  if new.equipo_id not in (p.local_id, p.visitante_id) then raise exception 'Ese equipo no juega este partido.'; end if;
  if new.jugador_id is not null and not exists (select 1 from public.plantel where equipo_id = new.equipo_id and jugador_id = new.jugador_id) then
    raise exception 'El jugador no está en la lista del equipo.';
  end if;
  if new.jugador_id is null and new.tipo <> 'gol' then raise exception 'Falta el jugador.'; end if;
  return new;
end $$;
create trigger eventos_reglas before insert or update on public.eventos
  for each row execute function public.tg_eventos_reglas();

-- ───────── RLS ─────────
alter table public.torneos enable row level security;
alter table public.categorias enable row level security;
alter table public.sindicatos enable row level security;
alter table public.perfiles enable row level security;
alter table public.canchas enable row level security;
alter table public.staff enable row level security;
alter table public.zonas enable row level security;
alter table public.equipos enable row level security;
alter table public.jugadores enable row level security;
alter table public.jugadores_datos enable row level security;
alter table public.plantel enable row level security;
alter table public.partidos enable row level security;
alter table public.eventos enable row level security;
alter table public.mensajes enable row level security;
alter table public.login_intentos enable row level security;

-- Lectura pública (pantalla en vivo sin login)
create policy lectura_publica on public.torneos for select using (true);
create policy lectura_publica on public.categorias for select using (true);
create policy lectura_publica on public.sindicatos for select using (true);
create policy lectura_publica on public.canchas for select using (true);
create policy lectura_publica on public.zonas for select using (true);
create policy lectura_publica on public.equipos for select using (true);
create policy lectura_publica on public.jugadores for select using (true);
create policy lectura_publica on public.plantel for select using (true);
create policy lectura_publica on public.partidos for select using (true);
create policy lectura_publica on public.eventos for select using (true);

-- Escritura solo admin
create policy admin_escribe on public.torneos for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy admin_escribe on public.categorias for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy admin_escribe on public.sindicatos for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy admin_escribe on public.canchas for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy admin_escribe on public.zonas for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy admin_escribe on public.partidos for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy admin_escribe on public.mensajes for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy admin_escribe on public.staff for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

-- Perfiles: cada uno ve el suyo; admin ve y edita todos (altas por función admin-usuarios)
create policy perfil_select on public.perfiles for select to authenticated using (id = (select auth.uid()) or (select public.es_admin()));
create policy perfil_admin_update on public.perfiles for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

-- Equipos: admin, sindical (su sindicato), DT (el suyo)
create policy equipo_insert on public.equipos for insert to authenticated
  with check ((select public.mi_rol()) in ('admin','sindical','dt'));
create policy equipo_update on public.equipos for update to authenticated
  using (public.puede_editar_equipo(id)) with check (public.puede_editar_equipo(id));
create policy equipo_delete on public.equipos for delete to authenticated
  using ((select public.es_admin()) or (public.puede_editar_equipo(id) and estado_lista = 'borrador'));

-- Plantel: quien puede editar el equipo, mientras la lista no esté validada
create policy plantel_update on public.plantel for update to authenticated
  using (public.puede_editar_equipo(equipo_id) and public.lista_editable(equipo_id))
  with check (public.puede_editar_equipo(equipo_id) and public.lista_editable(equipo_id));
create policy plantel_delete on public.plantel for delete to authenticated
  using (public.puede_editar_equipo(equipo_id) and public.lista_editable(equipo_id));
-- inserts de plantel y jugadores: por la función guardar_jugador

-- Datos personales: admin y responsables de cancha (control de identidad); sindical/DT solo de sus equipos
create policy datos_select on public.jugadores_datos for select to authenticated using (
  (select public.mi_rol()) in ('admin','resp_cancha')
  or exists (select 1 from public.plantel p where p.jugador_id = jugadores_datos.jugador_id and public.puede_editar_equipo(p.equipo_id))
);

-- Eventos: admin o responsable de la cancha, con el partido sin confirmar
create policy eventos_insert on public.eventos for insert to authenticated with check (
  public.puede_planillar(partido_id) and exists (select 1 from public.partidos x where x.id = partido_id and x.estado <> 'confirmado'));
create policy eventos_update on public.eventos for update to authenticated using (
  public.puede_planillar(partido_id) and exists (select 1 from public.partidos x where x.id = partido_id and x.estado <> 'confirmado'));
create policy eventos_delete on public.eventos for delete to authenticated using (
  public.puede_planillar(partido_id) and exists (select 1 from public.partidos x where x.id = partido_id and x.estado <> 'confirmado'));

-- login_intentos y staff.token: sin acceso directo (solo funciones)

-- ───────── Vistas de estadísticas (calculadas, nunca guardadas) ─────────
create view public.v_tabla with (security_invoker = true) as
with jugados as (
  select p.id, p.zona_id, p.local_id eq, p.goles_l gf, p.goles_v gc from public.partidos p where p.estado = 'confirmado' and p.fase = 'zona'
  union all
  select p.id, p.zona_id, p.visitante_id, p.goles_v, p.goles_l from public.partidos p where p.estado = 'confirmado' and p.fase = 'zona'
), tarjetas as (
  select ev.equipo_id,
    count(*) filter (where ev.tipo = 'amarilla') am,
    count(*) filter (where ev.tipo = 'roja') ro
  from public.eventos ev join public.partidos p on p.id = ev.partido_id and p.estado = 'confirmado'
  group by ev.equipo_id
)
select e.id equipo_id, e.nombre, e.zona_id, e.categoria_id, e.sindicato_id, e.torneo_id,
  count(j.id)::int pj,
  count(*) filter (where j.gf > j.gc)::int pg,
  count(*) filter (where j.gf = j.gc)::int pe,
  count(*) filter (where j.gf < j.gc)::int pp,
  coalesce(sum(j.gf),0)::int gf,
  coalesce(sum(j.gc),0)::int gc,
  coalesce(max(t.am),0)::int amarillas,
  coalesce(max(t.ro),0)::int rojas
from public.equipos e
left join jugados j on j.eq = e.id
left join tarjetas t on t.equipo_id = e.id
group by e.id;

create view public.v_stats_jugador with (security_invoker = true) as
select pl.jugador_id, pl.equipo_id, j.nombre, j.apellido, e.nombre equipo, e.categoria_id, e.torneo_id,
  count(*) filter (where ev.tipo = 'presente')::int pj,
  count(*) filter (where ev.tipo = 'gol')::int goles,
  count(*) filter (where ev.tipo = 'amarilla')::int amarillas,
  count(*) filter (where ev.tipo = 'roja')::int rojas
from public.plantel pl
join public.jugadores j on j.id = pl.jugador_id
join public.equipos e on e.id = pl.equipo_id
left join public.eventos ev on ev.jugador_id = pl.jugador_id and ev.equipo_id = pl.equipo_id
  and exists (select 1 from public.partidos p where p.id = ev.partido_id and p.estado = 'confirmado')
group by pl.jugador_id, pl.equipo_id, j.nombre, j.apellido, e.nombre, e.categoria_id, e.torneo_id;

-- ───────── Funciones de negocio ─────────

-- Alta/edición de jugador + lista de buena fe, en un paso.
create or replace function public.guardar_jugador(p_equipo uuid, p jsonb, p_jugador uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_dni text := upper(regexp_replace(coalesce(p->>'dni',''), '[^0-9A-Za-z]', '', 'g'));
  v_id uuid := p_jugador;
  v_existente uuid;
begin
  if not public.puede_editar_equipo(p_equipo) then raise exception 'No tenés permiso sobre este equipo.'; end if;
  if not public.lista_editable(p_equipo) then raise exception 'La lista ya fue validada. Pedí cambios a la mesa.'; end if;
  if v_dni !~ '^[0-9A-Z]{6,12}$' then raise exception 'DNI inválido.'; end if;
  if length(trim(coalesce(p->>'nombre',''))) < 2 or length(trim(coalesce(p->>'apellido',''))) < 2 then raise exception 'Falta nombre o apellido.'; end if;

  select jugador_id into v_existente from public.jugadores_datos where dni = v_dni;
  if v_id is null then
    if v_existente is not null then
      v_id := v_existente;
    else
      if coalesce((p->>'consentimiento')::boolean, false) is not true then
        raise exception 'Falta el consentimiento de datos personales.';
      end if;
      insert into public.jugadores (nombre, apellido) values (trim(p->>'nombre'), trim(p->>'apellido')) returning id into v_id;
      insert into public.jugadores_datos (jugador_id, dni, consentimiento_at) values (v_id, v_dni, now());
    end if;
  elsif v_existente is not null and v_existente <> v_id then
    raise exception 'Ese DNI ya pertenece a otro jugador.';
  end if;

  -- Si el jugador está en otro equipo, el trigger del plantel lo rechaza.
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

-- Responsable de cancha: pasar a "en juego"
create or replace function public.iniciar_partido(p_partido uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.puede_planillar(p_partido) then raise exception 'No tenés permiso sobre este partido.'; end if;
  update public.partidos set estado = 'en_juego' where id = p_partido and estado = 'programado';
end $$;

-- Confirmar planilla: el resultado sale de los goles cargados.
create or replace function public.confirmar_partido(p_partido uuid, p_pen_l int default null, p_pen_v int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p record; gl int; gv int;
begin
  if not public.puede_planillar(p_partido) then raise exception 'No tenés permiso sobre este partido.'; end if;
  select * into p from public.partidos where id = p_partido for update;
  if p.estado = 'confirmado' then return; end if;
  select count(*) filter (where equipo_id = p.local_id), count(*) filter (where equipo_id = p.visitante_id)
    into gl, gv from public.eventos where partido_id = p_partido and tipo = 'gol';
  if p.fase <> 'zona' and gl = gv and (p_pen_l is null or p_pen_v is null or p_pen_l = p_pen_v) then
    raise exception 'Partido de eliminación empatado: cargá el resultado de los penales.';
  end if;
  update public.partidos set estado = 'confirmado', goles_l = gl, goles_v = gv,
    penales_l = case when p.fase <> 'zona' and gl = gv then p_pen_l end,
    penales_v = case when p.fase <> 'zona' and gl = gv then p_pen_v end,
    confirmado_por = auth.uid(), confirmado_at = now()
  where id = p_partido;
end $$;

-- Admin: reabrir una planilla confirmada para corregirla
create or replace function public.reabrir_partido(p_partido uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'Solo la organización puede reabrir una planilla.'; end if;
  update public.partidos set estado = 'en_juego', confirmado_por = null, confirmado_at = null where id = p_partido;
end $$;

-- Login del deportista: mail o WhatsApp + DNI. Máximo 8 intentos cada 15 minutos.
create or replace function public.login_jugador(p_ident text, p_dni text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_ident text := lower(trim(coalesce(p_ident,'')));
  v_dig text := regexp_replace(coalesce(p_ident,''), '[^0-9]', '', 'g');
  v_dni text := upper(regexp_replace(coalesce(p_dni,''), '[^0-9A-Za-z]', '', 'g'));
  v_clave text;
  r record;
begin
  v_clave := case when position('@' in v_ident) > 0 then v_ident else right(v_dig, 8) end;
  if length(v_clave) < 6 or length(v_dni) < 6 then raise exception 'Completá tu mail o WhatsApp y tu DNI.'; end if;
  if (select count(*) from public.login_intentos where clave = v_clave and ts > now() - interval '15 minutes') >= 8 then
    raise exception 'Demasiados intentos. Probá de nuevo en 15 minutos.';
  end if;
  select d.token, j.nombre into r
  from public.jugadores_datos d join public.jugadores j on j.id = d.jugador_id
  where d.dni = v_dni and (
    (position('@' in v_ident) > 0 and lower(d.mail) = v_ident)
    or (position('@' in v_ident) = 0 and length(v_dig) >= 8 and right(regexp_replace(coalesce(d.tel,''), '[^0-9]', '', 'g'), 8) = right(v_dig, 8))
  ) limit 1;
  if r.token is null then
    insert into public.login_intentos (clave) values (v_clave);
    raise exception 'Los datos no coinciden con ningún jugador inscripto.';
  end if;
  return json_build_object('token', r.token, 'nombre', r.nombre);
end $$;

-- Ficha del deportista: convocatoria, acreditación y estadísticas
create or replace function public.mi_ficha(p_token uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare d record; res json;
begin
  select dd.*, j.nombre, j.apellido into d
  from public.jugadores_datos dd join public.jugadores j on j.id = dd.jugador_id where dd.token = p_token;
  if d.jugador_id is null then raise exception 'Sesión vencida. Volvé a ingresar.'; end if;
  select json_build_object(
    'jugador', json_build_object('id', d.jugador_id, 'nombre', d.nombre, 'apellido', d.apellido, 'dni', d.dni, 'qr', d.qr,
      'apto_vence', d.apto_vence, 'apto_presentado', d.apto_presentado, 'fecha_nac', d.fecha_nac),
    'equipos', coalesce((
      select json_agg(json_build_object(
        'equipo_id', e.id, 'equipo', e.nombre, 'estado_lista', e.estado_lista, 'dorsal', pl.dorsal,
        'sindicato', s.nombre, 'categoria', c.nombre, 'torneo', t.nombre, 'torneo_fecha', t.fecha, 'sede', t.sede, 'direccion', t.direccion,
        'stats', (select json_build_object('pj', v.pj, 'goles', v.goles, 'amarillas', v.amarillas, 'rojas', v.rojas)
                  from public.v_stats_jugador v where v.jugador_id = d.jugador_id and v.equipo_id = e.id),
        'partidos', coalesce((
          select json_agg(json_build_object(
            'id', p.id, 'inicio', p.inicio, 'cancha', ca.nombre, 'estado', p.estado, 'fase', p.fase,
            'local', el.nombre, 'visitante', ev.nombre, 'goles_l', p.goles_l, 'goles_v', p.goles_v,
            'es_local', p.local_id = e.id) order by p.inicio nulls last)
          from public.partidos p
          left join public.canchas ca on ca.id = p.cancha_id
          left join public.equipos el on el.id = p.local_id
          left join public.equipos ev on ev.id = p.visitante_id
          where e.id in (p.local_id, p.visitante_id)), '[]'::json)
      ))
      from public.plantel pl
      join public.equipos e on e.id = pl.equipo_id
      join public.sindicatos s on s.id = e.sindicato_id
      join public.categorias c on c.id = e.categoria_id
      join public.torneos t on t.id = e.torneo_id
      where pl.jugador_id = d.jugador_id and t.activo), '[]'::json)
  ) into res;
  return res;
end $$;

-- Árbitros: link personal sin usuario
create or replace function public.partidos_arbitro(p_token uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  select * into s from public.staff where token = p_token and activo;
  if s.id is null then raise exception 'Link inválido.'; end if;
  return json_build_object('nombre', s.nombre, 'partidos', coalesce((
    select json_agg(json_build_object('id', p.id, 'inicio', p.inicio, 'cancha', c.nombre, 'estado', p.estado, 'fase', p.fase,
      'local', el.nombre, 'visitante', ev.nombre, 'goles_l', p.goles_l, 'goles_v', p.goles_v) order by p.inicio)
    from public.partidos p
    left join public.canchas c on c.id = p.cancha_id
    left join public.equipos el on el.id = p.local_id
    left join public.equipos ev on ev.id = p.visitante_id
    where p.arbitro_id = s.id), '[]'::json));
end $$;

-- Permisos de ejecución
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;
grant execute on function public.login_jugador(text, text) to anon, authenticated;
grant execute on function public.mi_ficha(uuid) to anon, authenticated;
grant execute on function public.partidos_arbitro(uuid) to anon, authenticated;
grant execute on function public.mi_rol(), public.es_admin(), public.mi_sindicato(), public.puede_editar_equipo(uuid),
  public.lista_editable(uuid), public.puede_planillar(uuid), public.guardar_jugador(uuid, jsonb, uuid),
  public.iniciar_partido(uuid), public.confirmar_partido(uuid, int, int), public.reabrir_partido(uuid) to authenticated;

-- Tiempo real
alter publication supabase_realtime add table public.partidos, public.eventos, public.equipos, public.plantel;

-- ───────── Datos iniciales ─────────
with t as (
  insert into public.torneos (nombre, sede) values ('Torneo Relámpago Intersindical CGT', 'A definir') returning id
), c as (
  insert into public.categorias (torneo_id, nombre, edad_min, orden) select id, 'Master +40', 40, 1 from t returning torneo_id
)
insert into public.canchas (torneo_id, nombre, orden)
select torneo_id, x.n, x.o from c, (values ('Cancha 1', 1), ('Cancha 2', 2)) x(n, o);
