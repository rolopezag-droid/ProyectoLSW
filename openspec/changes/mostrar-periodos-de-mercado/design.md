# Design
## Context
El requisito aclarado cambia el significado del selector. No se debe multiplicar el periodo por el número de velas.
## Decisions
Separar la conversión de periodo a fechas en un helper puro de la interfaz con pruebas. Conservar rutas -> controlador -> adaptador. Incorporar 15Min y 1Hour al catálogo interno, sin reintroducir el selector de intervalos intradía.
Usar ventana móvil de 24 horas o 7 días; los meses se restan con ajuste al último día válido del mes. El final de consulta se retrasa 16 minutos para evitar restricciones sobre datos recientes del feed SIP. Se muestran fechas reales y se informa si no hay datos; no extender silenciosamente el periodo por fines de semana.
## Risks / Trade-offs
El día es una ventana móvil, no la última sesión bursátil. Un fin de semana puede no incluir velas. Datos históricos con retraso, sin garantía de tiempo real.
## Migration Plan
Actualizar pruebas del catálogo anterior para aceptar 15Min/1Hour. Las demás entradas inválidas siguen devolviendo 400.

