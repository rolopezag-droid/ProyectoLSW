# Proposal
## Why
La interfaz reutiliza Bull Call para otras estrategias y produce estructuras incorrectas.
## What Changes
- Centralizar selección de las cuatro verticales, tipo de opción, sentido, Ask/Bid y validación de prima respecto al ancho.
- Reutilizarla en cotización, evaluación automática y preparación Paper. Invalidar datos al cambiar contexto.
## Capabilities
### New Capabilities
- strategy-selection: selección coherente de verticales F3.
### Modified Capabilities
Ninguna.
## Impact
GUI y pruebas simuladas; no cambios en envío de órdenes ni bases de datos.
