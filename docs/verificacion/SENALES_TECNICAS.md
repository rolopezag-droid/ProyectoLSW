# Fase 1: señales técnicas y velas

> **Integración en Victor:** las referencias y resultados relativos al Quant Workbench corresponden a la implementación anterior en `Iolao`. Victor conserva sus pestañas cuantitativas independientes; la gráfica integrada sí incluye los niveles y las señales de candidata.

## Uso desde la interfaz

1. Con las dependencias y la configuración de Alpaca del proyecto ya instaladas, inicia Quant y GUI en terminales separadas con `npm run start:quant` y `npm run start:gui`. Abre `http://localhost:3005` o el puerto configurado. La gráfica independiente no necesita seleccionar una estrategia.
2. Abre **Gráfica**, selecciona un ticker y un periodo. Para señales usa **Temporalidad de vela → 1 día**; en automático, 1 día y 1 semana utilizan velas intradía, que no generan señales. Para mayor contexto de SMA50, elige, por ejemplo, 1 año y suficientes velas.
3. Los periodos predefinidos muestran las fechas que utilizan. Para fechas propias elige **Rango personalizado** o edita cualquiera de las fechas —esto activa el modo personalizado automáticamente—, indica temporalidad y máximo de velas y pulsa **Mostrar gráfica**. El intervalo UTC exacto enviado aparece junto al formulario y en los metadatos. La fecha final incluye el día hasta 23:59:59.999 UTC, limitada al instante de consulta con el margen habitual de 16 minutos. En la interfaz se admiten entre 1 y 2000 velas. Las fechas futuras, imposibles o invertidas se rechazan.
4. Activa las casillas de los indicadores. La tabla muestra todos los eventos de las reglas elegidas, su número total, indicador, tipo y precio de cierre; **Ver explicación** despliega la regla, los valores completos, las comparaciones y el timestamp original. El campo **Consultar fecha UTC** filtra la tabla y el botón restaura todas las fechas. El límite de marcadores solo afecta a la gráfica, donde se muestran los más recientes. Pasa el cursor por la vela o enfócala con teclado para ver sus detalles.
5. Los símbolos M, R y Z identifican medias, RSI y zona. Verde es alcista, rojo bajista y amarillo salida; E/X identifican entrada/salida de candidata. Para el modo de candidata, ejecuta **Analizar los cuatro spreads**, selecciona una candidata y activa sus entradas/salidas. Los niveles y el Quant Workbench siguen disponibles por separado.

## Reglas deterministas

Cada evento se confirma **al cierre de la vela**, nunca al comenzar. El timestamp mostrado es el timestamp de la vela proporcionado por Alpaca, normalmente su inicio; no representa la hora exacta de confirmación. No se dispone de un calendario de sesiones que permita afirmar el minuto exacto de cierre en días especiales. Como salvaguarda, las velas correspondientes al día actual de Nueva York se excluyen de las señales hasta el día siguiente, incluso si la sesión ya cerró. La gráfica puede mostrarlas igualmente.

- **SMA20 y SMA50:** media aritmética de los 20 o 50 cierres terminados en la vela actual. Un cruce alcista exige `cierre[i−1] ≤ SMA50[i−1]`, `cierre[i] > SMA50[i]` y `SMA20[i] > SMA50[i]`; el bajista invierte las desigualdades. Se requiere SMA50 disponible también en la vela anterior.
- **RSI14:** cambios de cierre, ganancia y pérdida medias iniciales de 14 periodos, después suavizadas por Wilder: `media[i] = (13 × media[i−1] + cambio[i])/14`. `RSI = 100 − 100/(1 + gananciaMedia/pérdidaMedia)`; si ambas son cero es 50, y sin pérdidas con ganancias es 100. Alcista: `RSI[i−1] ≤ 30` y `RSI[i] > 30`. Bajista: `RSI[i−1] ≥ 70` y `RSI[i] < 70`. Los umbrales 30 y 70 son heurísticos, no garantías financieras.
- **ATR14:** media simple de los 14 rangos verdaderos más recientes, donde `TR = max(máximo−mínimo, |máximo−cierre anterior|, |mínimo−cierre anterior|)`. Mide volatilidad; no produce una señal por sí solo.
- **Pivotes y zonas:** un máximo/mínimo debe superar estrictamente los tres máximos/mínimos anteriores y ser al menos tan extremo como los tres posteriores. Por tanto, un pivote de la vela `p` se confirma al cierre de `p+3`; no está disponible antes. Los pivotes confirmados de las **hasta 252 velas anteriores** se agrupan por cercanía usando tolerancia `0.5 × ATR14` de ese prefijo.
- **Ruptura:** para la vela `i`, las zonas y ATR se calculan únicamente hasta `i−1`, de modo que la zona ya existía antes del cierre actual. La resistencia requiere `cierre[i−1] ≤ límiteSuperior + 0.25 × ATR14` y `cierre[i] > ese umbral`; el soporte exige `cierre[i−1] ≥ límiteInferior − 0.25 × ATR14` y `cierre[i] < ese umbral`. Ambos cierres se comparan con el mismo umbral previo. Pueden registrarse varias zonas rotas por la misma vela.
- **Salida de candidata:** únicamente en el modo de candidata, el cierre cruza SMA20 en contra de su dirección, comparando el cierre y SMA20 tanto actuales como anteriores. Es una señal orientativa del análisis, no evidencia de una posición real.

La tabla conserva los valores usados, incluidos umbral y fecha de confirmación del pivote para rupturas. Si la muestra es insuficiente, no se inventa un indicador ni se emite la señal. La instantánea de zonas actuales puede señalar que una zona está vulnerada, pero ya no atribuye retrospectivamente una fecha de ruptura a una zona reconstruida al final. Las señales históricas exactas se calculan mediante las reglas anteriores.

## Causalidad y límites de interpretación

Cada SMA y RSI usa solo el prefijo de velas disponible; las zonas y ATR de una ruptura se calculan antes de la vela que cruza. Agregar velas posteriores no cambia eventos anteriores **si el comienzo de la ventana y los datos originales son los mismos**. Cambiar el inicio del rango puede cambiar el calentamiento de SMA/RSI, los pivotes disponibles y, por tanto, las señales. Una consulta parcial puede omitir señales; su estado se muestra junto a la gráfica y el análisis comparativo no usa silenciosamente esos datos incompletos.

Una señal técnica es una descripción de condiciones históricas, no una predicción calibrada ni una operación ejecutada. Una entrada/salida de candidata es una indicación hipotética específica de una estrategia; los niveles objetivo, stop y break-even no demuestran una orden o ejecución. El cálculo y filtrado de señales no envían órdenes a Alpaca. Las órdenes reales/paper siguen su flujo explícito preexistente.

## Datos y API

`GET /api/v1/broker/candles` conserva `provider`, `symbol`, `timeframe`, `feed`, `bars`, `nextPageToken` y `capturedAt`, y añade `requestedBars`, `retrievedBars`, `firstTimestamp`, `lastTimestamp`, `complete`, `limited`, `partialReason` y `pages`. `limit` admite enteros de 1 a 10000 en la API; el adaptador solicita hasta 1000 por página y como máximo 100 páginas, hasta agotar el token o alcanzar el límite. Acepta `pageToken` para continuar. Los tokens repetidos, páginas inválidas, límites o errores posteriores se informan como parciales. Un fallo de red en la primera página devuelve error; una consulta vacía completa no crea velas.

La completitud se refiere a las páginas devueltas por el proveedor, no garantiza que haya cotizaciones para todos los días ni cobertura de todos los mercados. IEX, SIP o delayed SIP dependen de la configuración y permisos de Alpaca; pueden existir retrasos, cambios posteriores, ajustes de precios, huecos de mercado, límites de acceso o ausencia de datos. No se rellenan días festivos o sin cotizaciones y no se recupera historial anterior al rango para precalentar indicadores. Las señales intradía y de otras temporalidades están desactivadas; no se asigna una señal diaria por simple coincidencia de fecha.

## Evidencia y autoría

Trabajo solicitado por el usuario del proyecto y generado con asistencia de IA OpenCode (GPT-6.1); no se atribuye como edición manual verificada. Cambio OpenSpec: `fase-1-senales-tecnicas-causales`. No se crearon commits. Las pruebas usan respuestas simuladas y no validan disponibilidad real de Alpaca ni inspección visual en navegador; véase el reporte final de ejecución para los resultados concretos.

Resultados observados en esta sesión:

- Antes de modificar: `npm test`, 187/187; `node --test services/quant-service/test/vertical-spread.test.js services/quant-service/test/pricing-validation.test.js`, 9/9.
- Después: `npm test`, 205/205; regresión de `vertical-spread.test.js`, `pricing-validation.test.js` y `strategy-selection.test.js`, 20/20. Incluye selección y evaluación de Bull Call, Bull Put, Bear Call y Bear Put, precio/paridad Black-Scholes y volatilidad implícita.
- Pruebas específicas conjuntas de señales, fechas, Workbench, interfaz, controlador y adaptador: 100/100; tras la validación adicional de velas incompletas se ejecutaron controlador y adaptador de nuevo, 34/34, y la suite completa anterior.
- `openspec validate fase-1-senales-tecnicas-causales --strict`: válido. `git diff --check`: sin errores; Git advirtió sobre conversión futura de finales de línea. Node/Mongoose emitieron avisos de deprecación preexistentes.

### Pulido de interfaz posterior

- `npm test`: 211/211; pruebas específicas de fechas, interfaz y Workbench: 63/63. Regresión de las cuatro estrategias, Black-Scholes y causalidad: 33/33.
- La prueba de integración envía las fechas desde los controles de la interfaz por HTTP al controlador real de Quant con el broker simulado. Una comprobación adicional con Chrome headless y datos simulados verificó el cambio automático a rango personalizado, el detalle expandible y el desplazamiento de la tabla en una ventana de 390 px.
- La verificación de este pulido no consultó Alpaca con credenciales reales ni ejecutó órdenes. La revisión se realizó con asistencia de IA OpenCode (GPT-6.1); no se generaron commits.
