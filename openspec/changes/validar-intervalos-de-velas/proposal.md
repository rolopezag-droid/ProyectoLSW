# Proposal

## Why
La API GET /api/v1/broker/candles convierte intervalos no permitidos en 1Day sin informar al consumidor. Esto puede mostrar una gráfica diferente de la solicitada sin error explícito.

## What Changes
- Devolver HTTP 400 para un timeframe explícito fuera del catálogo permitido.
- Conservar 1Day cuando se omite timeframe.
- Conservar 1Day, 1Week, 1Month, 3Month, 6Month y 12Month como valores permitidos.
- Añadir pruebas de contrato del controlador con broker simulado y evidencia del proceso.
- **BREAKING**: consumidores que envían intervalos inválidos dejarán de recibir una sustitución silenciosa.

## Capabilities

### New Capabilities
- market-candles-validation: contrato explícito de intervalos para consultas de velas.

### Modified Capabilities
Ninguna; es la primera especificación del proyecto.

## Impact
Quant Service, broker.controller.js y pruebas del controlador. No cambia cálculos financieros, persistencia, órdenes ni la lista del selector actual. El endpoint público se conserva.

