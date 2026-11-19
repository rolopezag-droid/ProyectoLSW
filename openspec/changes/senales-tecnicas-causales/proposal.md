# Proposal

## Why
Las rupturas históricas usan zonas calculadas con información posterior y las señales dependen de una candidata. La API de velas solo consulta una página, lo que puede ocultar datos.

## What Changes
- Calcular señales técnicas deterministas y causales al cierre; conservar entradas, salidas y niveles de candidatas por separado.
- Consultar velas con rango, temporalidad y límite validados, paginando con protección frente a tokens repetidos y comunicando cobertura.
- Mostrar filtros, marcadores, explicaciones y tabla cronológica completa para señales diarias, sin generar órdenes.
- Documentar reglas y limitaciones y verificar compatibilidad con las cuatro estrategias y la interfaz cuantitativa disponible. La propuesta original en `Iolao` también contemplaba el Workbench, que no existe en Victor.

## Capabilities

### New Capabilities
- `causal-technical-signals`: señales históricas explicables, pivotes confirmados y presentación independiente.
- `bounded-market-candles`: consulta validada, paginada y con metadatos de cobertura.

### Modified Capabilities
Ninguna especificación principal está publicada todavía; no se alteran cambios existentes.

## Impact
GUI y endpoint GET `/api/v1/broker/candles` de Quant; metadatos aditivos sobre el contrato existente. No cambia estrategias, Black-Scholes, órdenes, autenticación ni persistencia. Sin ranking nuevo ni simulaciones futuras.
