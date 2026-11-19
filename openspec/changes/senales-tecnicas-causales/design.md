# Design

## Context
GUI ya dispone de indicadores, gráfica SVG y overlays; Quant valida el endpoint y el adaptador traduce Alpaca. Las pruebas previas a los cambios pasan: 187/187 generales y 9/9 de estrategias/Black-Scholes.

## Goals / Non-Goals
**Goals:** causalidad por prefijos, eventos explicables, control de rango y cobertura del proveedor, compatibilidad aditiva.

**Non-Goals:** órdenes, cambios de estrategias, fórmulas financieras, Supabase, ranking nuevo o simulación.

## Decisions
- Estructura actual: lógica de señales en `strategy-triggers.js`, indicadores en `research-analysis.js`, presentación en GUI y transporte en Quant. Alternativa: crear un nuevo microservicio de señales; duplicaría contratos y despliegue. Se conserva la estructura y se amplían interfaces existentes.
- En cada vela i se evalúan zonas calculadas con hasta 252 velas anteriores hasta i−1; los pivotes requieren tres velas derechas y el buffer usa ATR del mismo prefijo. Alternativa: zonas del histórico completo, descartada por anticipación.
- Se identifican eventos por timestamp exacto de la vela, explicando que el sello del proveedor identifica la vela y la confirmación ocurre al cierre. Señales solo en 1Day; intradía conserva gráfica y niveles.
- La API conserva campos anteriores y agrega conteos/cobertura. El controlador valida; el adaptador recorre páginas con límites y tokens vigilados. Una falla posterior se declara parcial, no éxito completo.
- Las reglas técnicas y señales de candidata se presentan como categorías diferentes; ninguna interactúa con el endpoint de órdenes.

## Risks / Trade-offs
- [Coste de calcular zonas históricas] → limitar cantidad de velas y evitar cálculos redundantes cuando sea posible.
- [Ajustes, retraso y cobertura del feed] → indicar fuente y completitud; no interpolar datos.
- [Ventana inicial insuficiente] → advertir que indicadores empiezan en la primera vela consultada.

## Migration Plan
Desplegar Quant antes o junto con GUI; campos adicionales preservan consumidores anteriores. Revertir los archivos de este cambio si es necesario, sin migración de datos.
