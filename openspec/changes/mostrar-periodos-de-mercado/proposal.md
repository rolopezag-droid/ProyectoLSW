# Proposal
## Why
El usuario confirmó que el selector representa el periodo total visible, no la duración de cada vela. La implementación previa confundía ambos conceptos.
## What Changes
- Selector de periodos desde un día hasta un año, con fechas start/end acotadas.
- Agregación automática: 15Min para un día, 1Hour para una semana y 1Day para periodos mayores.
- Ampliar el catálogo válido de timeframe de la API con 15Min y 1Hour; mantener HTTP 400 para entradas no admitidas.
- Retirar el límite de velas editable del formulario y usar un límite suficiente para el periodo.
## Capabilities
### New Capabilities
- market-display-period: periodo visible independiente del intervalo técnico de agregación.
### Modified Capabilities
Ninguna especificación principal archivada todavía. Este cambio ajusta explícitamente los valores permitidos del cambio activo validar-intervalos-de-velas: ahora 15Min y 1Hour son válidos por el requisito aclarado; el mínimo de un día aplica al periodo visible.
## Impact
GUI, controlador de velas y pruebas. No órdenes, BD ni estrategias financieras.

