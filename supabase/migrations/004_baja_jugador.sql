-- Baja de datos personales a pedido (Ley 25.326): la organización puede borrar al jugador (arrastra sus datos y su lista).
create policy admin_borra on public.jugadores for delete to authenticated using ((select public.es_admin()));
