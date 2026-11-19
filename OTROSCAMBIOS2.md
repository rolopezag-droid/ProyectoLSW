# Fase 2A: explicabilidad y validación de estrategias Bull/Bear

> **Integración en Victor:** las referencias al Workbench describen la rama `Iolao` donde se elaboró esta auditoría. Victor conserva sus pestañas independientes de precios, griegas y volatilidad implícita; la explicabilidad y las señales se integraron en esa interfaz sin el Workbench.

## Estado y objetivo

Se añadió una capa de explicabilidad y contraste para las candidatas existentes de Bull Call, Bull Put, Bear Call y Bear Put. El objetivo es explicar las patas, las cifras financieras y el orden del ranking utilizando sus datos y reglas reales, sin sustituir el selector, los evaluadores o el score.

**Pendientes financieros:** la probabilidad risk-neutral del panel de investigación presenta una discrepancia preexistente en su CDF normal y la descripción previa de Theta en el Workbench indica una unidad incorrecta. Ambos problemas se describen en la sección 7. La probabilidad cuestionada se advierte como no validada y existe una prueba `TODO` que reproduce la discrepancia. No se considera resuelto ese defecto ni se cambiaron las fórmulas para ocultarlo.

Una candidata es una observación orientativa. Su score no garantiza rentabilidad, seguridad ni ejecución; consultar sus explicaciones no envía órdenes.

## 1. Auditoría y recorrido de datos

La auditoría encontró dos procesos diferentes:

1. **Ranking de investigación:** `ResearchAnalysis.compareStrategies` enumera pares de contratos de la misma empresa, vencimiento y tipo; exige cotizaciones válidas, strikes dentro del 30% del subyacente y prima neta positiva menor que el ancho. Calcula el score existente y conserva hasta 20 candidatas por ticker.
2. **Selector automático del formulario:** `selectVertical` usa pares consecutivos y prioriza la distancia del spot al intervalo de strikes, la distancia al punto medio y después el ancho. No es el algoritmo que genera el ranking.

```text
Alpaca: velas, cotización y cadenas de opciones
 → adaptador y endpoints existentes de Quant
 → allContracts / analyzeSymbol en GUI
 → compareStrategies: pares, métricas y top 20 por ticker
 → attachEvidence: identidad y cotizaciones de patas y subyacente
 → runAnalysis: factor fundamental existente y orden global
 → filteredRows: filtros visibles
 → validateCandidate → POST /api/v1/strategies/evaluate
 → verifyEvaluation → explicación y comparación en GUI
```

Noticias y fundamentales utilizan los módulos existentes; no se introdujeron integraciones externas. La ruta anterior no crea órdenes.

## 2. Funcionalidades agregadas

- Acción **Ver explicación** por candidata, con secciones inicialmente cerradas: **¿Por qué esta estrategia?**, **¿Por qué estas patas?**, **Ver cálculos financieros** y **¿Cómo se calculó el score?**.
- Identificación de empresa, referencia del subyacente y fecha, vencimiento, dirección, tendencia, indicadores, probabilidades identificadas por método, beneficio, pérdida y riesgos. Una tendencia contraria o una pérdida máxima superior al beneficio se presentan como tales.
- Evidencia de las patas comprada y vendida: contrato, empresa, vencimiento, tipo, strike, Bid, Ask, fecha, cantidad y multiplicador. La compra utiliza Ask y la venta Bid.
- Validación de identidad, estructura, timestamps, cotizaciones, strikes, dirección y multiplicador. Quant evalúa las patas y su respuesta se compara con el ranking. Faltantes o discrepancias se muestran como **no verificadas**.
- Comparación plegable por empresa de las cuatro estrategias usando candidatas visibles y el orden existente. Si faltan score o verificaciones se comunica que no es posible comparar las cuatro bajo criterios equivalentes.
- Invalidación del detalle al cambiar empresa, vencimiento, módulos o filtros, y protección frente a respuestas asíncronas de selecciones anteriores.

## 3. Funciones existentes reutilizadas

Se conservaron `compareStrategies`, `historicalOutcomes`, `technicalIndicators`, `scoreFundamentals`, `blackScholesProbability`, `selectVertical`, `collectOptionChain` y `evaluateVerticalSpread`. No se modificaron las fórmulas de Bull/Bear, Black-Scholes, griegas o volatilidad implícita, ni los flujos de Supabase y órdenes. El Workbench, los niveles de candidatas y las señales causales de la fase 1 permanecen disponibles.

El evaluador de Quant sigue siendo la fuente de las cifras financieras verificadas. La interfaz muestra cómo se obtienen y contrasta sus resultados con las cifras preliminares del ranking; no sustituye el evaluador por otro motor de payoff.

## 4. Cálculos de las cuatro estrategias

`A` es el Ask de la pata comprada, `B` el Bid de la vendida, `W = strike superior − strike inferior`, `Q` la cantidad y `M` el multiplicador. El ranking representa **una unidad de spread**, no la cantidad introducida en el ticket de órdenes. Prima y break-even se expresan por acción; ganancias y pérdidas totales en USD.

| Estrategia | Prima por acción | Beneficio máximo | Pérdida máxima | Break-even |
| --- | --- | --- | --- | --- |
| Bull Call | Débito `A − B` | `(W − débito) × Q × M` | `débito × Q × M` | `strike inferior + débito` |
| Bull Put | Crédito `B − A` | `crédito × Q × M` | `(W − crédito) × Q × M` | `strike superior − crédito` |
| Bear Call | Crédito `B − A` | `crédito × Q × M` | `(W − crédito) × Q × M` | `strike inferior + crédito` |
| Bear Put | Débito `A − B` | `(W − débito) × Q × M` | `débito × Q × M` | `strike superior − débito` |

La interfaz sustituye las variables con valores de la candidata y solo presenta los resultados de Quant como verificados si coinciden con el ranking. Los máximos son al vencimiento y excluyen comisiones y deslizamiento; si la opción admite ejercicio anticipado puede existir asignación de la pata vendida.

## 5. Ranking y elección de patas

La fórmula preexistente es:

```text
score base = probabilidad histórica × (beneficio máximo / pérdida máxima)
             × factor técnico / (1 + suma de diferenciales relativos Bid/Ask)
score final = score base × factor fundamental
```

- La frecuencia histórica utiliza ventanas de retornos traslapadas y requiere al menos 20 muestras; no es una probabilidad calibrada.
- El factor técnico es 1.1 si la tendencia SMA20/SMA50 coincide con la dirección, 1 si es mixta, 0.9 si es contraria y 1 si el módulo está desactivado. Sin tendencia suficiente el score queda no disponible.
- El diferencial es la suma de `(Ask − Bid) / punto medio` de ambas patas; no es volumen ni interés abierto.
- Con cobertura fundamental suficiente, el factor es `0.8 + 0.4 × scoreFundamental/100`; si no está disponible o seleccionado es 1. Los pesos existentes son ingresos 15%, utilidad 15%, ROE 15%, margen 10%, deuda/capital 15%, razón corriente 10%, P/E 10% y P/B 10%, con cobertura mínima del 50%.
- Noticias, RSI, ATR, Delta, Gamma y Black-Scholes no son factores directos del score. La interfaz los distingue de los factores efectivos o los marca como no disponibles.

La lista inicial por ticker se ordena por score y, en empate, tamaño de muestra; conserva un máximo de 20 antes del ajuste fundamental y ordenamiento global. Los filtros visibles no crean una fórmula nueva. El detalle compara los factores de candidatas vecinas y, cuando existen, pares visibles de la misma estrategia. Si no existe otra alternativa visible, no se afirma que no haya otras en la cadena completa.

## 6. Archivos de la fase

| Archivo | Función del cambio |
| --- | --- |
| `services/gui-service/public/strategy-explanation.js` | Conserva evidencia y valida candidatas; contrasta Quant y consulta el contexto del ranking sin alterar su orden. |
| `services/gui-service/public/research-ui.js` | Enlaza evidencia, evaluador, explicaciones, comparación y protección frente a contexto obsoleto. |
| `services/gui-service/public/index.html` | Controles, acordeones, comparación, aviso de CDF y ajuste responsivo de vista apilada. |
| `services/gui-service/test/strategy-explanation.test.js` | Cuatro estrategias, validación, discrepancias y ranking. |
| `services/gui-service/test/strategy-explanation-ui.test.js` | Interacciones, comparación, datos faltantes, cambios de contexto y ausencia de órdenes. |
| `services/gui-service/test/research-probability-discrepancy.test.js` | Prueba `TODO` que reproduce la discrepancia de CDF. |
| `services/quant-service/test/greeks-regression.test.js` | Referencias y diferencias finitas para griegas Call, y referencias/paridad para Put. |
| `docs/verificacion/fase-2a-interfaz-simulada.png` | Captura de Chrome headless rotulada como datos simulados. |
| `openspec/changes/fase-2a-explicabilidad-estrategias/.openspec.yaml` | Esquema del cambio. |
| `openspec/changes/fase-2a-explicabilidad-estrategias/proposal.md` | Problema, alcance y capacidades. |
| `openspec/changes/fase-2a-explicabilidad-estrategias/design.md` | Diseño, auditoría y hallazgos financieros. |
| `openspec/changes/fase-2a-explicabilidad-estrategias/specs/vertical-strategy-explanations/spec.md` | Requisitos y escenarios. |
| `openspec/changes/fase-2a-explicabilidad-estrategias/tasks.md` | Seguimiento de tareas. |
| `CAMBIOS_FASE_2A.md` | Este documento. |

Funciones nuevas principales: `attachEvidence`, `validateCandidate`, `verifyEvaluation`, `rankContext`, `comparisonRows`, `evaluateCandidate`, `candidateWhy`, `candidateLegs`, `candidateScore`, `financialCalculations`, `renderCandidateExplanation`, `renderStrategyComparison`, `syncComparisonSymbols` e `invalidateResearchContext`. Se ampliaron `analyzeSymbol`, `runAnalysis`, `render` y `selectCandidate` para conservar y presentar la evidencia.

## 7. Problemas financieros identificados

### Probabilidad risk-neutral de investigación

`research-analysis.js` utiliza una aproximación de `erf` sin escalar el argumento por `√2`, a diferencia de la CDF normal estándar usada por Quant. Caso determinista **simulado**: spot y objetivo 100, tasa 0.05, dividendos 0, volatilidad 20%, fecha de cálculo `2026-01-01T16:00:00Z` y vencimiento `2027-01-01`. El valor actual es **0.5839696290**; la CDF normal estándar para el mismo `d2` da **0.5595974556**, diferencia aproximada de 0.02437.

La prueba `research-probability-discrepancy.test.js` reproduce el caso con una aserción marcada `TODO`. La interfaz advierte que esta cifra no está validada; no participa en el score. No se modificó la fórmula: su corrección y validación requieren un cambio financiero autorizado.

### Etiqueta de Theta

`blackScholesGreeks` devuelve Theta anualizada cuando el tiempo está expresado en años, mientras el texto preexistente del Workbench dice «por día». No se cambió la fórmula ni la pantalla preexistente. La nueva explicación indica que las griegas de las patas y del spread no se calcularon en el ranking. La etiqueta debe revisarse por separado.

## 8. Pruebas y evidencia

| Ejecución | Resultado real |
| --- | ---: |
| Línea base: `npm test` | 211/211 aprobadas |
| Línea base: selección, Bull/Bear, pricing, triggers y Strategy Service | 42/42 aprobadas |
| Línea base numérica de Delta, Gamma, Theta y Vega Call | Valores contrastados con referencias deterministas |
| Final: `npm test` | **233 aprobadas y 1 `TODO` con aserción fallida esperada**; 234 totales |
| Final: explicabilidad, selección, triggers, verticales, pricing y griegas | **55 aprobadas y 1 `TODO`**; 56 totales |
| Ajuste final: explicabilidad, interfaz y griegas | 22/22 aprobadas |
| `npm --workspace services/quant-service test` | 57/57 aprobadas |
| `npm --workspace services/strategy-service test` | 9/9 aprobadas |
| `npm --workspace services/spread-service test` | 34/34 aprobadas |
| `openspec validate fase-2a-explicabilidad-estrategias --strict` | Válido |

Node contabiliza cero fallos ordinarios porque la aserción de CDF está marcada `TODO`; **esa aserción no pasó**. Las pruebas verifican Bull Call, Bull Put, Bear Call, Bear Put, precio Black-Scholes, Delta, Gamma, Theta, Vega, volatilidad implícita, ranking, cambios de contexto y ausencia de órdenes en escenarios deterministas.

Chrome headless comprobó las cuatro candidatas con datos de mercado simulados y el evaluador vertical real, incluidos la vista apilada a 390 px y el detalle financiero. No se llamaron rutas de órdenes. La captura está rotulada para que los datos no se confundan con cotizaciones reales:

![Detalle de Bull Call con datos simulados](docs/verificacion/fase-2a-interfaz-simulada.png)

No se realizó una consulta real nueva a Alpaca, FMP o Supabase; las pruebas de Spread usan simulaciones. Los resultados no acreditan todos los mercados o contratos posibles. Node/Mongoose y Git emitieron avisos preexistentes de deprecación y finales de línea.

## 9. Limitaciones y pendientes

1. Corregir y validar mediante autorización separada la CDF de probabilidad de investigación y revisar la etiqueta diaria de Theta.
2. El adaptador normaliza el multiplicador a 100 cuando falta `size`; se puede contrastar el valor normalizado, pero no demostrar si el proveedor lo envió o fue supuesto. La interfaz advierte esta limitación.
3. La comparación no examina candidatas excluidas por filtros ni por el máximo de 20 por ticker. Con score o evidencia insuficientes no se inventa una ganadora.
4. La validación usa metadatos del proveedor y símbolos presentes; no verifica de manera independiente el contenido OCC de cada símbolo, ni garantiza liquidez ejecutable, ausencia de asignación o rentabilidad.
5. Queda pendiente la comprobación con permisos y datos reales del equipo para confirmar cobertura, antigüedad de cotizaciones y experiencia completa con los servicios externos.

## 10. Cómo probar Bull Call, Bull Put, Bear Call y Bear Put

1. Con la configuración existente, iniciar `npm run start:quant` y `npm run start:gui`; abrir `http://localhost:3005` o el puerto configurado.
2. En **Estrategia**, elegir un vencimiento futuro. En **Panel de investigación**, introducir un ticker y ejecutar **Analizar los cuatro spreads**.
3. En una fila **Bull Call**, pulsar **Ver explicación**: revisar compra Call inferior, venta Call superior y débito. Abrir el desglose de Quant.
4. Repetir para **Bull Put** —compra Put inferior, venta Put superior, crédito—; **Bear Call** —venta Call inferior, compra Call superior, crédito—; y **Bear Put** —venta Put inferior, compra Put superior, débito—.
5. Abrir **Comparar las cuatro estrategias**. Si alguna no aparece, revisar filtros, vencimiento, cotizaciones y límite de 20. Cambiar ticker o vencimiento y confirmar que desaparece el detalle anterior.
6. Ninguno de estos pasos requiere pulsar **Ejecutar Bull/Bear en Paper**.

## 11. Guion orientativo para una exposición oral

La fase 2A responde a una pregunta: cuando el panel muestra un spread vertical, ¿podemos explicar de dónde salieron sus patas y sus cifras? No sustituimos el motor financiero ni inventamos una recomendación. El ranking examina pares de contratos y los ordena por una puntuación heurística; el selector automático del formulario es distinto, porque revisa pares consecutivos y prioriza cercanía al precio de la acción.

Al elegir una candidata, el panel muestra qué contrato se compra y cuál se vende, sus strikes, Bid, Ask y fechas. La compra utiliza Ask y la venta Bid. Enviamos esas patas al evaluador vertical que ya existía en Quant y contrastamos el resultado con el ranking. Si coinciden, mostramos prima, ancho, beneficio máximo, pérdida máxima y break-even con sus unidades. Si faltan datos o hay discrepancia, la candidata queda como no verificada. Consultar estas explicaciones no envía órdenes.

El score tampoco se cambió. Combina frecuencia histórica, ganancia dividida entre riesgo, alineación técnica y penalización por diferencial Bid/Ask. Si hay suficiente información fundamental, utiliza además el factor que ya existía. Noticias, RSI, ATR y Black-Scholes se distinguen como contexto cuando corresponde; no se les atribuye una participación directa que no tienen. La comparación se limita a candidatas visibles y al máximo previo de veinte por ticker.

Durante la auditoría encontramos una discrepancia preexistente en la CDF de la probabilidad Black-Scholes del panel de investigación. La documentamos, la reproducimos en una prueba pendiente y mostramos un aviso, sin modificar la fórmula. También identificamos que la descripción anterior de Theta dice «por día» aunque su fórmula devuelve una tasa anualizada. Las pruebas de las cuatro estrategias, precio Black-Scholes y griegas pasaron en los casos ejecutados; la aserción pendiente conserva visible la discrepancia.

## 12. Autoría y estado

Trabajo solicitado por el usuario y realizado con asistencia de OpenCode / IA; no se atribuye como edición manual verificada. Al comenzar ya existían cambios de fase 1 sin confirmar y se conservaron. No se realizaron commits, cambios de rama ni operaciones reales.
