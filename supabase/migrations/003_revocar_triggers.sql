-- Las funciones de trigger no se llaman por API: se quitan de la exposición pública.
revoke execute on function public.tg_equipos_reglas(), public.tg_eventos_reglas(), public.tg_plantel_unico() from authenticated;
