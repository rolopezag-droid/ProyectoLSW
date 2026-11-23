# Comparación por cores y preparación de una operación

Trabajo asistido por IA, en la copia local de `ProyectoLSW` sobre main. No se publicó en GitHub ni Vercel y no se modificó la base de datos para verificarlo.

## Recorridos
1. Comparar estrategias → Top: todas las empresas del selector del proyecto o una lista personalizada de hasta diez tickers. Una fila por empresa, con su mejor par tras los filtros.
2. Comparar estrategias → Una empresa: hasta cien pares ordenados de esa empresa. Se puede filtrar por Bull Call, Bear Call, Bull Put o Bear Put.
3. Preparar operación: verifica identidad de ambas patas y consistencia con Quant, carga empresa, fecha, strikes, Ask/Bid, multiplicador, cantidad y referencia, y abre Nueva operación. No evalúa automáticamente ni envía órdenes.

## Selección, información y orden
- Técnico y Black-Scholes son los dos cores centrales; fundamental y movimiento diario son opcionales. Noticias es contexto sin puntuación de sentimiento.
- Solo los cores marcados aportan al promedio. La información del técnico/BS desmarcado se oculta también en las columnas y el detalle. Ningún factor técnico oculto decide el top de Black-Scholes.
- Los scores de los cores elegidos se promedian con pesos iguales (0–100). No es una probabilidad de rentabilidad. Si falta información de un core seleccionado, no se le asigna posición. La explicación muestra componentes y datos faltantes.
- Los filtros se aplican a todos los pares antes de agrupar por empresa: estrategia, pérdida máxima, ganancia/riesgo, diferencial Bid/Ask, probabilidad del método seleccionado y alineación técnica cuando está marcada.
- Ganancia/riesgo inicia en 1; es un filtro editable, no una propiedad del modelo. Sin límite de pérdida implica campo vacío.
- Se retiraron resistencias de paneles y gráfica. Técnico desmarcado oculta las medias y señales técnicas; las velas permanecen como datos de mercado.

## Vencimiento
Una fecha futura se puede ingresar manualmente. El botón Consultar vencimientos disponibles consulta contratos activos paginados de Alpaca sin pedir cotizaciones por cada contrato. El catálogo se obtiene para la empresa indicada y desde hoy hasta diez años; el top puede incluir otras empresas sin esa misma fecha, que se reportan sin datos. No se inventan contratos para satisfacer una fecha.

Fuente: [Get Option Contracts, Alpaca](https://docs.alpaca.markets/us/reference/get-options-contracts).

## Archivos
- `services/gui-service/public/research-ranking.js`: puntuación por selección, top y evidencia compacta de bitácora.
- `services/gui-service/public/research-ui.js`: consulta, filtros, presentación y verificación de candidatas.
- `services/gui-service/public/research-analysis.js`: cálculo de indicadores y enumeración de pares; CDF corregida con z/√2 para concordar con Quant.
- `services/gui-service/public/index.html`: campos, eventos de formulario y transferencia de sugerencia; control de respuestas tardías de strikes.
- `services/gui-service/public/option-expirations.js`: catálogo bajo demanda, caché de cinco minutos, errores y sincronización de fecha.
- `services/quant-service/src/brokers/alpaca/alpaca.adapter.js`: lectura paginada de vencimientos.
- `services/quant-service/src/api/v1/controllers/broker.controller.js` y `routes/broker.routes.js`: GET `/api/v1/broker/options-chain/expirations?symbol=AAPL`.

## Verificación y límites
Las 45 pruebas enfocadas pasaron. Cubren cuatro spreads, transferencia completa sin órdenes, ranking con cores desmarcados, datos faltantes, noticias sin score, agrupamiento después de filtrar, operación/presupuesto, paginación repetida y límite de bitácora. La bitácora conserva hasta cincuenta pares filtrados ordenados, declara el universo y el alcance guardado, y no duplica todas las combinaciones por subyacente.

Verificación real en navegador el 22/11/2026: AAPL devolvió 24 fechas disponibles; se analizaron 2,638 pares de AAPL para 18/12/2026 y se trasladó una sugerencia al formulario. Un top AAPL/MSFT con solo Black-Scholes procesó 9,105 pares; al limitar la pérdida a USD 1,000, MSFT cambió a otro par elegible y permaneció clasificada. No se guardaron registros ni se enviaron órdenes.

La suite general también se ejecutó sin restricciones de conexiones locales: 224 aprobadas y 32 fallidas en ese punto. Los fallos incluyen pruebas de paneles plegables y vista lado a lado del diseño anterior, controles automáticos eliminados, expectativas de resistencias y dos expectativas de órdenes Alpaca. No se considera que toda la suite esté aprobada. Las pruebas de los nuevos recorridos se mantienen separadas de esas expectativas anteriores.
