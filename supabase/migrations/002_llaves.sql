-- Llaves eliminatorias: el cruce se arma antes de conocer los equipos.
alter table public.partidos add column ref_l text, add column ref_v text;
comment on column public.partidos.ref_l is 'Origen del equipo en llaves: Z:<zona_id>:<pos> | G:<partido_id> | P:<partido_id>';
