# Consulta completa de contratos por estrategia
Responsable Roberto con asistencia IA de Codex. Filtra type=call/put, pagina mediante pageToken/nextPageToken y cotiza todos los contratos de cada página en bloques de 100. GUI agrega páginas, deduplica contratos y detecta tokens repetidos; máximo 50 páginas con error explícito, sin evaluación parcial. Limit conserva significado por página. No se amplían cotizaciones artificialmente ni se envían órdenes.

Pruebas simuladas: 28 Quant y 11 selector/paginación, todas aprobadas. Caso de 201 contratos requiere 3 lotes (100,100,1). Bull Put necesita segunda página y se selecciona correctamente. Se verifican tokens repetidos, error de página posterior y ausencia de cotizaciones. No se afirma ejecución real con Alpaca para esta intervención.

Referencia oficial: https://docs.alpaca.markets/us/reference/get-options-contracts
