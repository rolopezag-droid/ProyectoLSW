# Design

## Context
La adopción de OpenSpec empieza aquí. El selector y el rango histórico existentes son trabajo previo asistido por IA; este cambio aún no modifica la implementación.

## Goals / Non-Goals
Objetivo: contrato inequívoco y probado para timeframe. Se excluyen órdenes, BD, rediseño, paginación y optimización de rendimiento.

## Decisions
Estructura actual: rutas -> broker.controller.js -> AlpacaAdapter. La validación simple vive en el controlador. Se conservará esta separación para este cambio pequeño, con pruebas en test/broker.controller.test.js. Si el catálogo de validaciones crece, se propondrá extraer validadores puros; no se impone una reestructuración sin necesidad.
El controlador comprobará typeof, ausencia y catálogo antes de invocar el broker. Las pruebas sustituirán el broker, sin acceder a Alpaca ni Supabase.

## Risks / Trade-offs
El rechazo de valores antes tolerados es un cambio de contrato. El cliente actual utiliza solo valores permitidos. Mantener intacto el caso de parámetro ausente.

## Migration Plan
Primero pruebas, luego validación, regresión de Quant y evidencia. Sin migraciones de datos. Revertir el cambio del controlador permite volver al comportamiento anterior si fuera necesario.

## Open Questions
La actividad manual del equipo se documentará cuando realmente ocurra; no se atribuye a personas una implementación aún no realizada.

