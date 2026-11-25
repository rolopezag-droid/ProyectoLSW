# Guía del análisis y sus cores

Estado: código local, 24/11/2026. Documento generado con asistencia de Codex. No acredita implementación manual ni validación de proveedores reales.

## Qué se ve y en qué orden

Análisis y estrategias es una pantalla continua: precios y gráfica primero; después filtros y selección de módulos; finalmente paneles y comparación. Revisar orden es una pantalla independiente. No hay pasos internos. `services/gui-service/public/workspace-navigation.js` conserva los elementos y sus IDs al componer vistas; `analysis-workflow.js` ordena sus nodos y coloca el resumen de riesgo junto a la orden. `workspace.css` define su presentación.

## De dónde salen los datos

`services/gui-service/public/index.html`, función `loadCandles`, lee ticker, periodo, fechas, temporalidad y límite. `marketPeriod` construye la consulta. Quant consulta Alpaca: la respuesta normalizada contiene timestamp, open, high, low, close y volume. Son fecha, apertura, máximo, mínimo, cierre y volumen de cada vela. La gráfica dibuja esos valores; no inventa cotizaciones ni envía sus píxeles a los cores.

`services/gui-service/public/research-ui.js`, `fetchUnderlying`, consulta por separado velas diarias de los últimos 370 días, precio de referencia y cadenas call/put del vencimiento elegido. `research-analysis.js` utiliza ese historial para comparar pares y calcular indicadores. Por ello cambiar el periodo visual no cambia la ventana del ranking. No se deben interpretar ambos periodos como equivalentes.

## Los seis módulos

| Selección | Entrada y cálculo | Efecto real |
| --- | --- | --- |
| Técnico | Cierres, máximos y mínimos diarios; SMA, RSI, ATR y volatilidad histórica | El ranking compara tendencia con dirección de la estrategia: alineada 100, mixta 50, contraria 0; sin datos no clasifica. RSI y ATR aportan contexto, no un score independiente. |
| Fundamental | Métricas de negocio y valoración de FMP | Score heurístico por cobertura y pesos definidos en `scoreFundamentals`. Participa en consultas manuales. En S&P se consulta después del Top 10 y no reordena el universo. |
| Financiero | Estados de resultados, balance y flujo de efectivo FMP | `scoreFinancialStatements` resume liquidez, deuda y efectivo. Mismo límite de finalistas del S&P. No es Black-Scholes. |
| Monte Carlo | Precio, volatilidad realizada histórica, tasa, dividendos, horizonte y patas | `monteCarloSpread` simula 10,000 precios terminales GBM y calcula P&L por escenario. La proporción de escenarios con P&L positivo × 100 aporta al score si se selecciona. No es una probabilidad real calibrada. |
| Ganadores/perdedores | Cambio entre cierres diarios del universo consultado | Favorece dirección coincidente: 50 + cambio porcentual alineado × 5, acotado entre 0 y 100. Describe movimiento, no su causa. |
| Noticias | Titular/resumen y clasificación textual del backend o fallback | Explica coincidencia con Bull/Bear y con tendencia técnica seleccionada. No modifica score ni cálculos; no equivale a un modelo de IA. |

`research-ui.js`, `readModules`, lee las casillas. Un cambio invalida el análisis previo; se debe analizar nuevamente. `research-ranking.js`, `rank`, promedia solo los módulos de puntuación elegidos. Si falta un dato requerido, no inventa puntuación. Riesgo/beneficio y diferencial sirven como desempates. Las casillas no alteran las fórmulas de ganancia o pérdida de un spread.

## Noticias: cómo leer cada fila

`services/quant-service/src/services/news-sentiment.js` reconoce eventos textuales y negaciones. `news-context.js` es el fallback del cliente. No se conecta un LLM. Una etiqueta expresa una heurística del texto, no una reacción del precio comprobada.

`news-confluence.js`, `assess`, vincula por ticker exacto, deduplica artículos y descarta fechas inválidas, futuras o anteriores a siete días. Una noticia alcista coincide con Bull Call/Bull Put y se opone a Bear Call/Bear Put; bajista al revés. Si hay señales de ambas direcciones o un artículo mixto, muestra mezcla sin favorecer dirección. Sin artículos válidos no se atribuye una señal. Desmarcar Noticias excluye consulta, columna contextual y detalle del nuevo análisis.

La comparación muestra combinaciones de contratos: cien filas no son cien estrategias distintas. Hay cuatro familias Bull Call, Bull Put, Bear Call y Bear Put. Varias filas pueden repetir una familia con diferentes strikes. El texto de noticias nombra la estrategia de esa fila. Las fuentes y recuentos aparecen en Ver explicación. La cobertura está limitada a artículos recibidos, no todas las noticias del mercado.

## Seleccionar, preparar, evaluar y enviar

Seleccionar una fila conserva el ranking y carga la gráfica de su ticker mediante `research:company-selected`. Preparar operación verifica la candidata contra Quant y transfiere sus contratos al formulario. No envía una orden. Bloquea las otras estrategias hasta elegir otra manualmente.

Evaluar usa `services/quant-service/src/services/vertical-spread.js`: obtiene prima neta, ancho, pérdida/ganancia máxima y equilibrio. El resumen lateral replica el resultado ya calculado, sin fórmulas duplicadas. Editar primas, cantidad o strikes invalida los importes. Guardar es una acción distinta de ejecutar Paper. No se enviaron órdenes para revisar esta interfaz.

## Qué no afirmar en una presentación

- Noticias no cambia el orden numérico; muestra evidencia direccional.
- No existe un core LLM o aprendizaje automático por haber desarrollado con IA.
- Monte Carlo y frecuencia histórica son métodos distintos y no garantías.
- Gráfica y core técnico pueden usar periodos diferentes.
- Fundamental y financiero no reordenan el S&P después del Top.
- Un fallo de proveedor se presenta como dato no disponible; no demuestra por sí mismo un error del algoritmo.

## Pruebas y límites

Ver `REVISION_ANALISIS_RESULTADOS.md` para evidencia de esta revisión, resultados y fallos pendientes. La revisión visual requiere acceso al proyecto local: el navegador de revisión no ha podido conectarse. Las pruebas con datos simulados no confirman las cuotas ni disponibilidad de Alpaca o FMP ni el guardado en una cuenta real.


## Indicadores de la gráfica y casilla del core técnico

La captura reportada mostraba SMA marcadas mientras el core técnico estaba desmarcado. El renderer comprobaba ambas selecciones y bloqueaba las curvas: la interfaz permitía una combinación engañosa. La corrección conserva la dependencia y sincroniza los controles.

En `services/gui-service/public/research-ui.js`, dentro de la inicialización de la página, `technicalControls` reúne SMA 20/50/200, soportes, señales y entradas/salidas orientativas. Si se marca uno con el core apagado, se activa `researchModuleTechnical` y se emite su evento `change`. Esto invalida la comparación anterior y solicita analizar de nuevo; no cambia sus scores a escondidas. `refreshChartOverlays` redibuja a partir de las velas ya cargadas, sin petición adicional a Alpaca.

`syncTechnicalControls` desmarca esos controles cuando se apaga el core y actualiza el aviso `chartTechnicalStatus`. La referencia del último cierre no pertenece a ese conjunto y sigue siendo independiente.

El dibujo en `index.html` utiliza `data-sma-period` para identificar las curvas y `data-level-kind` para soportes. Las pruebas comprueban que esos elementos SVG aparecen o desaparecen, no solo que una casilla cambió de estado. Las SMA requieren al menos su número de cierres; las señales se calculan solo con velas diarias cerradas. Un periodo con pocas velas no garantiza curvas SMA200 ni señales, aunque el indicador esté activado.

## Retiro de entradas/salidas de candidata

Por solicitud del usuario se eliminó el bloque de entradas/salidas orientativas, su casilla y selector. La gráfica ya no calcula ni dibuja esas señales ni niveles de candidata. Seleccionar una fila conserva el detalle, la carga de gráfica y Preparar operación. El historial, el filtro de fecha y el límite de marcadores se conservan para señales técnicas independientes; SMA y soportes permanecen. La referencia anterior a chShowTriggers en esta guía corresponde a la versión previa y quedó retirada.


## Core independiente de indicadores y señales (completado)

La sección anterior que integraba las señales dentro del técnico queda sustituida por esta separación:

- **Análisis técnico (tendencia):** determina alineación del precio con SMA20 y SMA50. Las curvas SMA y soportes visuales activan este módulo.
- **Core de indicadores y señales de compra/venta:** interpreta eventos recientes, con casilla, panel y score propios. Las casillas de señales en la gráfica activan este módulo, sin activar el de tendencia. Desmarcarlo excluye panel, componente de score y marcadores. No se reintroduce el bloque retirado de entradas/salidas de candidata.

Archivo nuevo: `services/gui-service/public/indicator-core.js`, función `evaluate`. Recibe velas normalizadas de Alpaca ya consultadas en `research-ui.js`. Filtra precios no válidos, ordena y deduplica fechas y excluye el día bursátil actual de Nueva York y días futuros. Exige 50 velas cerradas. Reutiliza las reglas de `strategy-triggers.js`, `computeTechnicalSignals`:

1. Cruce SMA50 confirmado por SMA20: señal alcista o bajista.
2. RSI14 sale por encima de 30 o cae por debajo de 70: señal alcista o bajista.
3. Ruptura de soporte confirmado con margen ATR: señal bajista. No se agrega resistencia al panel ni una estrategia nueva.

Se toma solo el último evento por familia ocurrido en las últimas cinco velas cerradas. Es una ventana heurística elegida para el proyecto, no una fórmula oficial ni validada predictivamente. Cada familia presente tiene igual peso. Voto alcista = +1 y bajista = -1. Score Bull = 50 + 50 × media de votos; score Bear = 100 − score Bull. Si hay historia suficiente pero ningún evento reciente, ambos reciben neutralidad 50 y se comunica que no hay señal nueva. Con historia insuficiente, los scores son null y no se clasifica la candidata si se exigió este core.

`research-ranking.js`, `rank`, incorpora `indicators` solo si está seleccionado. Con otros cores, se promedia como un componente adicional de igual peso. Puede estar correlacionado con tendencia: seleccionarlos juntos no representa dos pruebas independientes ni una probabilidad de ganancia.

`research-ui.js`, `renderIndicators`, muestra ticker, número de velas cerradas, última fecha, scores Bull/Bear y eventos con fecha, regla y explicación. La evidencia viaja con las candidatas y la bitácora. Puede servir para seleccionar finalistas del S&P antes de consultar FMP. No añade llamadas a otro proveedor.

Los filtros de señales gráficas son solo visuales: se aplican al periodo visible. El score siempre usa las reglas fijas y las cinco últimas velas cerradas del historial diario del análisis. Una marca de compra/venta es un evento heurístico, no una compra, venta, cierre de posición ni automatización ejecutada. IA continúa pendiente.

### Lectura del panel sin fórmulas

El panel presenta primero una conclusión: predominio alcista, bajista, señales contrapuestas, sin eventos recientes o datos insuficientes. Debajo relata qué ocurrió y muestra fechas legibles. Ejemplo QQQ: el 20 de noviembre rompió un soporte (debilidad) y el 23 de noviembre el RSI salió de su zona baja (posible recuperación). Una señal por cada dirección se compensa bajo los pesos actuales; el core no favorece Bull ni Bear. 50/50 es empate de puntos, no 50% de posibilidad de ganar. Las reglas, recuento de velas y fórmula se conservan en un detalle desplegable. Esta mejora no modifica el algoritmo ni sus pesos.

### Presentación cronológica del panel

Las tarjetas narran Qué pasó primero / Qué pasó después (o ese mismo día), con fecha y explicación de cada evento y su relación con Bull/Bear. Después muestran Qué significa para las estrategias y Cómo leer la puntuación. Las fórmulas siguen dentro del detalle. La cronología no cambia los pesos: el método conserva igual peso por familia aunque una señal sea posterior.


## Ejecución sin congelar la pantalla

`research-ui.js` mantiene la consulta a Quant/Alpaca y FMP. El cálculo intensivo de pares Monte Carlo y del core de indicadores se delega a `research-computation.js`, `run`, que inicia `research-worker.js`. El worker importa los mismos algoritmos del proyecto: no cambia fórmulas, reduce simulaciones ni omite pares. Ejecuta sin bloquear el hilo encargado de clics y dibujo.

Cada trabajo captura la señal de cancelación de su análisis. Cancelar o cambiar contexto termina el worker, descarta respuestas tardías y evita que un análisis viejo reutilice el controlador del nuevo. Al completar o fallar también se termina el worker. Hay límite de 120 segundos por empresa; no es un límite de duración del recorrido completo del S&P. El cálculo sigue consumiendo CPU y puede tardar; que sea en segundo plano no implica respuesta inmediata.

`research-computation.js`, `calculate`, es una frontera de cálculo sin acceso a red, credenciales u órdenes. El backend sirve los archivos como JavaScript mediante su ruta estática. Si un navegador real no admite workers, se presenta un error en vez de volver al cálculo bloqueante. El fallback síncrono existe únicamente para pruebas JSDOM. Las cuotas y errores parciales FMP siguen mostrándose como falta de datos; el worker no resuelve límites del proveedor.

## Core de IA incorporado con OpenRouter

La sección anterior que señala IA pendiente queda sustituida por la integración opcional: interpretación manual por empresa del snapshot visible. No participa en el score ni genera órdenes. Clave/modelo solo en el backend; prompt editable en `services/gui-service/prompts/core-ia.txt`. La IA recibe únicamente resúmenes permitidos de cores seleccionados. Coincidencias, contradicciones, datos faltantes y lectura conjunta se presentan como texto generado por IA. Configuración, flujo y límites en `services/gui-service/OPENROUTER.md`. Falta configurar clave/modelo para validar el proveedor real; las pruebas no consumieron saldo.

### Monte Carlo: muestra compartida para evitar timeout
La comparación actual simula 10000 precios terminales una sola vez por empresa y conjunto de supuestos. Reutiliza esos precios para todas sus verticales: ordenar precios y construir sumas prefijas evita repetir simulación y ordenación por cada pareja. La media y percentiles se calculan con el payoff del spread; 10000 sigue siendo la cantidad de escenarios. La semilla común se registra en el resultado con sampling=shared-underlying-terminal-sample. No se comparte entre comparaciones. La función independiente usa standalone-spread-sample. Cambiar de sorteos independientes por spread a muestra común puede variar frecuencias y orden dentro del error de muestreo; no equivale a cambiar a una predicción calibrada.
