# Diseño

Se conserva GUI/Quant y el ranking existente. Se separa el proveedor público del universo del adaptador FMP: una suscripción de fundamentales no debe bloquear la lista de empresas. La fuente alternativa será el dataset público datasets/s-and-p-500-companies, con URL y fecha; no se sustituye por diez tickers.

La exploración recorre todos los símbolos, de forma secuencial para limitar carga, con progreso y cancelación. Se evalúan los pares de cada empresa con los filtros elegidos antes de conservar sus mejores cuatro estrategias, evitando acumular millones de combinaciones. Cambiar filtros requiere repetir este recorrido. La cobertura distingue errores, ausencia de contratos válidos y empresas evaluadas; un resultado parcial nunca se presenta como ranking completo.

FMP conserva respuestas útiles aunque otro endpoint falle. HTTP 402 se identifica como restricción del proveedor; no se inventan métricas ni se promete acceso por cambiar de ticker. La SEC devolvió 403 en la verificación real de este entorno: no se introduce un fallback inaccesible como solución aparente.

Para hacer viable el recorrido se preparan las ventanas históricas una sola vez por empresa. La búsqueda binaria cuenta los mismos éxitos >= o <= break-even, conservando muestra, horizonte e intervalo Wilson. Se verifica contra el conteo directo anterior; no cambia la fórmula financiera. Las lecturas de Alpaca reservan turnos de 400 ms para evitar ráfagas; no es una cuota global entre instancias cloud.
