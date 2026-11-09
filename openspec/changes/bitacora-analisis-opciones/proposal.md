# Proposal
## Why
El dashboard permite elegir y evaluar spreads verticales, pero no ofrece un registro explicable que compare candidatas y muestre evidencia técnica, noticias y error de estimación antes de elegir strikes.
## What Changes
- Añadir un flujo de análisis por símbolo que compare Bull Call, Bear Call, Bull Put y Bear Put con precios históricos y cotizaciones disponibles.
- Mostrar señales técnicas y estimaciones de probabilidad al vencimiento con método, periodo de datos y margen de error explícitos.
- Registrar instantáneas de análisis, filtros, fuentes, datos de mercado, strikes evaluados y decisión para revisión posterior.
- Presentar noticias con su procedencia y hora; dejar el análisis fundamental fuera del alcance.
## Capabilities
### New Capabilities
- options-research-journal: análisis comparativo y bitácora técnica para estrategias verticales.
### Modified Capabilities
- Ninguna.
## Impact
GUI, Quant Service y persistencia de análisis. No se cambiará el esquema Supabase existente ni se enviarán órdenes. Las credenciales de proveedores no se almacenarán en el repositorio.
