# Proposal
## Why
La selección automática solo recibía la primera página y cotizaciones de los primeros 100 contratos.
## What Changes
- Filtrar call/put, exponer nextPageToken y recorrer páginas en la GUI.
- Consultar cotizaciones de todos los contratos de cada página en lotes de 100.
- Informar causa de ausencia de pares sin asumir que la cadena parcial es completa.
## Capabilities
### New Capabilities
- option-chain-pagination: búsqueda paginada y filtrada de contratos.
### Modified Capabilities
Ninguna.
## Impact
Controlador broker, adaptador Alpaca y selector GUI. No órdenes ni BD.
