# Torneo Relámpago Intersindical CGT

Web app mobile first para gestionar el torneo: inscripción de equipos y listas de buena fe, fixture y grilla por cancha, planilla de partido con modo offline, tabla y medallero en vivo, acreditación QR y mensajes segmentados.

## Stack
- `web/`: HTML + JS (módulos ES, sin compilación). PWA instalable. Se publica en Netlify (`netlify.toml`).
- Supabase: Postgres con RLS, Realtime y función `admin-usuarios` (alta de usuarios con la service role del lado del servidor).
- `supabase/migrations/`: esquema, permisos y funciones.

## Roles
| Rol | Ingreso | Puede |
|---|---|---|
| Organización (admin) | mail + clave | Todo: torneo, canchas, equipos, validación de listas, fixture, grilla, árbitros, usuarios, mensajes, corregir planillas |
| Responsable de cancha | mail + clave | Planilla de los partidos de su cancha (presentes por QR, goles, tarjetas, confirmar) |
| Responsable sindical | mail + clave | Equipos y listas de su sindicato |
| DT | mail + clave | Su equipo y su lista de buena fe (sindicato obligatorio) |
| Jugador/a | mail o WhatsApp + DNI | Convocatoria, acreditación QR, estadísticas, recordatorio al calendario |
| Árbitro | link personal | Sus partidos asignados |
| Público | sin ingreso | Hoy/en vivo, fixture, posiciones, llaves, medallero, modo pantalla |

## Reglas clave
- Estadísticas calculadas desde las planillas confirmadas (vistas `v_tabla`, `v_stats_jugador`): una corrección recalcula todo.
- Datos personales (DNI, contacto, apto) en `jugadores_datos`, invisibles al público. Apto médico: solo estado y vencimiento.
- Un jugador, un equipo por torneo. DT y sindical no pueden validar listas.
- Planilla offline: cola local con `client_uuid` (sin duplicados al sincronizar).
