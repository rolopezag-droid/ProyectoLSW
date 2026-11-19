# Proposal

## Why
El ranking calcula candidatas en investigación, pero no conserva toda la evidencia de las patas ni contrasta sus métricas con Quant. Además, su enumeración de pares y el selector automático del formulario son algoritmos distintos, por lo que atribuirles los mismos criterios sería incorrecto.

## What Changes
- Conservar procedencia de contratos y explicar reglas, riesgos, contexto y puntuación de cada candidata visible.
- Validar datos y contrastar primas, ganancias, pérdidas y equilibrio con `POST /api/v1/strategies/evaluate`, sin cambiar fórmulas ni ordenar por criterios nuevos.
- Comparar las cuatro estrategias usando únicamente las candidatas y filtros existentes, con límites explícitos del top 20 por ticker.
- Invalidar explicaciones obsoletas, agregar pruebas y documentar discrepancias o datos no verificables.

## Capabilities

### New Capabilities
- `vertical-strategy-explanations`: evidencia verificable de patas, cálculos, score y comparación del ranking existente.

### Modified Capabilities
No existen especificaciones principales publicadas; se conservan los cambios anteriores.

## Impact
GUI y consumo del endpoint existente de evaluación de Quant. Sin cambios en las fórmulas financieras, selección, orden de ranking, órdenes, autenticación ni persistencia de Supabase. Sin ranking de empresas ni simulaciones nuevas.
