# Design

## Context
La auditoría encontró dos rutas diferentes: `compareStrategies` enumera pares de contratos para el ranking y conserva los mejores 20 por ticker; `selectVertical` usa pares consecutivos próximos al spot para el formulario de estrategia. Quant ofrece `POST /api/v1/strategies/evaluate` con `evaluateVerticalSpread`. La línea base pasa `npm test` 211/211 y la regresión financiera/técnica seleccionada 42/42; Delta, Gamma, Theta y Vega también se contrastaron numéricamente.

## Goals / Non-Goals
**Goals:** presentar evidencia atribuible, verificar contra Quant, conservar el orden actual y evitar resultados obsoletos.

**Non-Goals:** cambiar el selector, el score, los evaluadores, Black-Scholes, órdenes, Supabase, ranking de empresas o simulaciones.

## Decisions
- Situación actual: el ranking y la presentación viven en GUI, mientras el evaluador de verticales vive en Quant. Alternativa: mover/reimplementar ranking en un nuevo servicio; cambiaría contratos y comportamiento. Se conserva el límite existente y se añade un módulo de evidencia en GUI que no recalcula métricas financieras.
- Conservar la procedencia original de ambas patas junto a cada candidata sin cambiar la enumeración ni la puntuación. La selección manual automática se documenta como un proceso distinto, no se atribuye al ranking.
- Validar identidad, estructura, cotizaciones, antigüedad y multiplicador con los datos disponibles; consultar el evaluador de Quant con compra Ask y venta Bid y comparar sus resultados con las cifras del ranking. Datos faltantes o divergencias quedan visibles como no verificadas, no se reparan alterando fórmulas.
- La comparación opera sobre candidatas visibles por ticker después de los filtros y del límite de 20 por ticker. Sus métricas verificadas se obtienen del evaluador, no de una implementación financiera paralela. Se explicita que una estrategia ausente puede haber quedado fuera por filtros o truncamiento.
- El score es probabilidad histórica × ganancia/riesgo × factor técnico ÷ (1 + diferencial relativo), multiplicado por el factor fundamental disponible. Black-Scholes, RSI, ATR y noticias son contexto salvo que el código existente los use realmente.
- Asociar cada evaluación asíncrona al snapshot y selección; cambios de ticker, vencimiento, módulos o filtros invalidan o vuelven a presentar evidencia correspondiente. Sin solicitudes a rutas de órdenes.

## Risks / Trade-offs
- [Campos de contrato insuficientes en snapshots anteriores] → mostrar no verificable y no inventar multiplicador o fecha.
- [El adaptador actual supone tamaño 100 si Alpaca no lo proporciona] → identificar la fuente y la limitación de esa normalización.
- [Puntuación nula o filtros/top 20] → no declarar mejor candidato global ni inventar probabilidades.
- [Evaluador no disponible o discrepante] → mantener las cifras del ranking etiquetadas como no verificadas y explicar el fallo.

## Hallazgos financieros previos
- Contexto de integración: la referencia al Workbench siguiente documenta la auditoría de `Iolao`. La fusión lo incorpora en Victor y corrige la descripción de Theta sin cambiar la fórmula.
- `research-analysis.blackScholesProbability` usa una aproximación de erf sin dividir el argumento por √2, a diferencia de `option-pricing.normalCdf`. Caso determinista: spot 100, objetivo 100, tasa 0.05, volatilidad 20%, asOf `2026-01-01T16:00:00Z`, vencimiento `2027-01-01`: resultado actual 0.5839696290; CDF normal estándar esperada 0.5595974556. No se modifica la fórmula en esta fase; se mostrará la discrepancia y se agregará un caso de prueba pendiente reproducible.
- `blackScholesGreeks` devuelve Theta anualizada; el texto anterior de `quant-workbench.js` la describía como diaria. La fusión corrige esa descripción sin cambiar la fórmula; el panel de explicabilidad no atribuye unidades diarias.

## Migration Plan
Los metadatos son aditivos en el snapshot existente; no se cambia el esquema ni CRUD. Desplegar la GUI con Quant compatible y revertir los archivos de interfaz si fuese necesario.
