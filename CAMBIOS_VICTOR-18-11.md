# Proyecto LSW: cambios de la fase 1 y pulido de interfaz

> **Integración en Victor:** este informe conserva la evidencia histórica de `Iolao`. En la integración actual se adaptaron las señales y los niveles a la gráfica de Victor; el Quant Workbench y sus pruebas pertenecen a la otra rama y no están presentes aquí. Los resultados y comandos de esa rama no describen por sí solos la validación de Victor.

**Ámbito:** análisis técnico histórico, consulta de velas y presentación de señales.  
**Estado de la revisión:** comparación del árbol de trabajo con `HEAD` `e75101c`, rama `Iolao`, y consulta de la evidencia de las dos sesiones de trabajo.  
**Fecha de revisión:** 18 de noviembre de 2026.

Este documento describe la implementación de la fase 1 y el pulido solicitado después. Distingue las funcionalidades que ya estaban en el proyecto de las ampliaciones observables en los cambios actuales. Los resultados de pruebas son los registrados durante esas sesiones; las pruebas automatizadas **no se volvieron a ejecutar para redactar este informe**.

## 1. Resumen general

La fase 1 amplió la gráfica y el análisis técnico existentes para que el usuario pueda consultar señales históricas explicables sin elegir previamente una candidata de opciones. Se corrigió la búsqueda retrospectiva de rupturas que utilizaba zonas calculadas con información posterior, se incorporaron rangos de fechas configurables y se añadió paginación a la consulta de velas de Alpaca.

El pulido posterior aclaró la relación entre periodos y fechas, mejoró los controles y reorganizó la tabla para mostrar una explicación desplegable por señal. El objetivo es poder responder qué vela generó una señal, qué regla se cumplió y qué valores tenía disponibles el sistema en ese momento.

Una señal técnica es una **observación histórica orientativa**, no una predicción garantizada ni una operación ejecutada. El cálculo y el filtrado de estas señales no envían órdenes a Alpaca.

### Punto de partida y procedencia

El historial consultado demuestra que varios componentes ya existían antes de esta fase:

| Evidencia de Git anterior a la fase | Funcionalidad preexistente |
| --- | --- |
| `49e744e` — mejora de periodos e inspección de velas | Gráfica, consulta por periodos y `market-period.js`. |
| `716b2d1` — análisis de investigación integrado | Panel de investigación e indicadores, soportes y resistencias en `research-analysis.js`. Git registra como autor del commit a **Paulina Martinez**. |
| `63f1f16` — módulo de triggers | Señales de entrada y salida para candidatas de spreads. Git registra como autor del commit a **AntonioON117**. |
| `c7f73e6` — overlays de señales | Marcadores y niveles de candidatas en la gráfica existente. Git registra como autor del commit a **AntonioON117**. |
| `15350ca` — integración del Workbench | Conexión previa del Quant Workbench con la gráfica y la tabla comparativa. Git registra como autor del commit a **AntonioON117**. |

Los nombres anteriores son **metadatos de autor de commits**, no una afirmación sobre qué partes fueron escritas manualmente o con asistencia. Las cuatro estrategias, Black-Scholes, el sistema de órdenes y los demás servicios también eran preexistentes; esta fase no los creó.

Las dos solicitudes y sus resultados constan en la conversación como trabajo realizado con asistencia de **OpenCode / IA**. En el momento de esta revisión, los cambios de la fase y el pulido están **sin commit**: antes de crear este informe, `git status` mostraba 13 archivos rastreados modificados y siete archivos no rastreados de documentación/OpenSpec. Git no permite atribuir individualmente esas líneas sin confirmar ni determinar con certeza la identidad del solicitante o quién realizó posibles ajustes intermedios. No se atribuyen como trabajo manual verificado.

La ruta OpenSpec actual es `openspec/changes/senales-tecnicas-causales/`. Los reportes de la primera sesión y parte de la documentación mencionan el nombre anterior `fase-1-senales-tecnicas-causales`; al estar ambos fuera de un commit para esta fase, el historial de Git no permite atribuir el cambio de nombre. En esta revisión se ejecutó `openspec validate senales-tecnicas-causales --strict` y el cambio actual resultó válido.

## 2. Cambios funcionales

### 2.1 Señales técnicas independientes

La gráfica puede calcular y filtrar señales técnicas **sin seleccionar un spread**. Las reglas disponibles para velas diarias son:

| Regla | Condición al cierre de la vela `i` | Tipo mostrado |
| --- | --- | --- |
| Cruce de precio y SMA50, confirmado por SMA20 | `cierre[i−1] ≤ SMA50[i−1]`, `cierre[i] > SMA50[i]` y `SMA20[i] > SMA50[i]`. | Alcista |
| Cruce inverso | `cierre[i−1] ≥ SMA50[i−1]`, `cierre[i] < SMA50[i]` y `SMA20[i] < SMA50[i]`. | Bajista |
| RSI14 sobre 30 | `RSI[i−1] ≤ 30` y `RSI[i] > 30`. | Alcista |
| RSI14 bajo 70 | `RSI[i−1] ≥ 70` y `RSI[i] < 70`. | Bajista |
| Ruptura de resistencia | El cierre pasa desde el lado no roto a superar el límite superior de una zona previa más `0.25 × ATR14` previo. | Alcista |
| Ruptura de soporte | El cierre pasa desde el lado no roto a quedar bajo el límite inferior de una zona previa menos `0.25 × ATR14` previo. | Bajista |

Los umbrales RSI de 30 y 70 son parámetros **heurísticos**. El ATR14 mide volatilidad y aporta tolerancias o márgenes; no genera por sí solo una señal de compra o venta. Los cálculos de SMA, RSI y ATR se reutilizan de `research-analysis.js`: esta fase incorporó las reglas y su presentación, no creó desde cero los indicadores preexistentes.

El modo de candidata permanece separado. Si se selecciona una candidata y se activan sus eventos, se muestran entradas orientativas y salidas por cruce de SMA20 en contra de la dirección de esa candidata. Objetivo, stop y break-even siguen siendo niveles de análisis, no prueba de una posición o ejecución real. Una señal alcista o bajista tampoco equivale automáticamente a una orden de compra o venta.

### 2.2 Corrección del sesgo de anticipación

Antes, `zoneBreakoutEntries` calculaba `supportResistance` con todo el histórico y después buscaba rupturas en fechas anteriores. Eso permitía que pivotes y volatilidad posteriores influyeran en una señal pasada.

Ahora, para evaluar la vela `i`:

1. Las zonas de ruptura se calculan con una ventana de hasta **252 velas anteriores**, terminada en `i−1`.
2. Un pivote usa tres velas anteriores y tres posteriores. Un pivote de la vela `p` solo queda confirmado al cierre de `p+3` y no puede utilizarse antes.
3. La agrupación de pivotes utiliza la tolerancia existente de `0.5 × ATR14`; el límite de ruptura utiliza `0.25 × ATR14` de la ventana previa.
4. Los cierres anterior y actual se contrastan con **el mismo umbral previo**. El evento se asigna a la vela cuyo cierre cumple el cruce.
5. SMA y RSI históricos emplean únicamente el prefijo disponible hasta cada vela; no se añaden velas ficticias.

La prueba de causalidad compara eventos del mismo comienzo de ventana antes y después de añadir velas posteriores. La igualdad depende de conservar los datos originales y la misma ventana inicial; cambiar el inicio puede cambiar el calentamiento de los indicadores y los pivotes disponibles.

En la instantánea actual de `supportResistance`, `status` sigue indicando si la zona está activa o vulnerada. Para no presentar una fecha reconstruida con información posterior como si hubiera sido conocida entonces, `breakoutAt` se devuelve como `null`; las fechas de eventos se consultan en las señales causales.

### 2.3 Fechas y cobertura de velas

- Se conservaron los periodos de un día, una semana, uno, tres y seis meses y un año. En modo automático, un día utiliza `15Min`, una semana `1Hour` y los periodos mensuales utilizan `1Day`.
- Se añadieron fecha inicial, fecha final, temporalidad y cantidad máxima. El selector admite **Rango personalizado**; desde el pulido, editar una fecha también lo activa automáticamente.
- Las fechas se interpretan en **UTC**. En el modo personalizado, la inicial comienza a las `00:00:00.000` y la final es inclusiva hasta `23:59:59.999`, salvo el corte para no solicitar datos futuros. La interfaz muestra tanto la vista previa como el intervalo enviado a Quant.
- La interfaz acepta entre **1 y 2000 velas**; la API valida entre **1 y 10000**. Se rechazan fechas inválidas o futuras, inicio no anterior al final, temporalidades y límites no admitidos.
- La interfaz muestra fuente/feed, cantidades solicitada y recuperada, primer y último registro, temporalidad y estado de cobertura. Una consulta parcial se identifica como tal; una respuesta incompleta no se usa silenciosamente en el análisis comparativo de spreads.

### 2.4 Paginación de Alpaca

El adaptador recorre las páginas de velas mientras haya token y capacidad, con solicitudes de hasta 1000 velas por página y un máximo de 100 páginas. Detecta tokens repetidos, respuestas o velas inválidas, duplicados, límites y errores posteriores. Una consulta puede devolver registros parciales con su motivo; no se rellenan días sin cotizaciones.

`GET /api/v1/broker/candles` conserva los campos previos `provider`, `symbol`, `timeframe`, `feed`, `bars`, `nextPageToken` y `capturedAt`. La respuesta añade `requestedBars`, `retrievedBars`, `firstTimestamp`, `lastTimestamp`, `complete`, `limited`, `partialReason` y `pages`; también admite `pageToken` en la solicitud. `limited` refleja una consulta incompleta por cualquiera de los motivos gestionados, no exclusivamente que se haya alcanzado el límite de cantidad.

**Compatibilidad de entrada:** aunque los campos de respuesta son aditivos, la validación de `limit` es más estricta que en `HEAD`: valores fuera de rango que antes podían ajustarse ahora reciben un error HTTP 400. Los consumidores externos deben enviar parámetros válidos.

## 3. Cambios visuales y de interacción

- La gráfica SVG preexistente conserva velas, medias móviles, volumen, zonas, niveles de candidata y overlays del Workbench. Los marcadores se diferencian por color y código: **M** medias, **R** RSI, **Z** zona, **E** entrada de candidata y **X** salida.
- La asociación de marcadores dejó de hacerse solo por fecha de calendario: compara el instante de la vela normalizado mediante `Date` de JavaScript. Los detalles aparecen al inspeccionar la vela.
- El usuario puede limitar los marcadores visibles a 10, 50, 100, 250 o todos. Ese límite no recorta la tabla de eventos calculados para las reglas seleccionadas.
- La tabla muestra ticker, fecha y hora UTC de la vela, indicador y origen, tipo y precio. **Ver explicación** abre una fila con regla, valores, comparaciones, temporalidad, precio sin redondear y timestamp original del proveedor. También permite filtrar por fecha UTC y volver a todas las fechas.
- Los checkboxes de indicadores tienen tamaño y alineación propios. Hay secciones diferenciadas para señales técnicas independientes y entradas/salidas de candidata; si no existe una candidata seleccionada se muestra un estado informativo.
- En pantallas estrechas la tabla dispone de desplazamiento horizontal dentro de su contenedor. La gráfica y los campos del formulario usan las reglas responsivas del dashboard.

El timestamp del proveedor identifica la vela, normalmente su inicio; la regla se confirma al **cierre**. La interfaz no afirma el minuto exacto de cierre de sesiones especiales.

## 4. Archivos afectados

La tabla identifica las diferencias observadas respecto de `HEAD` y los archivos actualmente no rastreados. La columna «Cambio» describe la fase y el pulido, no implica que el archivo o su funcionalidad básica hayan sido creados en esta fase.

### Código y configuración de interfaz

| Archivo | Función y cambio observado |
| --- | --- |
| `services/gui-service/public/strategy-triggers.js` | Módulo preexistente de triggers; añade `computeTechnicalSignals`, evidencia de valores y cálculo causal de rupturas. Elimina el recorte de entradas a 12. |
| `services/gui-service/public/research-analysis.js` | Indicadores y zonas preexistentes; deja de atribuir retrospectivamente `breakoutAt` a una zona calculada al final de la muestra. |
| `services/gui-service/public/research-ui.js` | Integra señales independientes, filtros, caché de cálculo, estado de candidata y tabla explicable; detecta velas incompletas en el análisis comparativo. |
| `services/gui-service/public/market-period.js` | Amplía el cálculo preexistente de periodos con rangos personalizados, límite y formateo UTC. |
| `services/gui-service/public/index.html` | Controles de fechas, temporalidad y marcadores; tabla y detalle expandible; CSS responsivo; metadatos y representación de señales sobre la gráfica existente. |
| `services/quant-service/src/api/v1/controllers/broker.controller.js` | Valida la solicitud de velas y transmite el token al adaptador. |
| `services/quant-service/src/brokers/alpaca/alpaca.adapter.js` | Recorre páginas de velas, valida resultados y devuelve cobertura. Las funciones de órdenes de este mismo archivo no se modificaron para esta fase. |
| `README.md` | En el árbol de trabajo contiene un enlace a la documentación de señales y aclara la presencia de marcadores RSI. **El enlace actual tiene una discrepancia de nombre**, descrita en pendientes. |

### Pruebas

| Archivo | Cobertura añadida o ampliada |
| --- | --- |
| `services/gui-service/test/triggers.test.js` | Cruces SMA/RSI, datos insuficientes, soportes y resistencias, confirmación de pivotes y estabilidad al añadir velas futuras. |
| `services/gui-service/test/market-period.test.js` | Fechas personalizadas, límites, formato UTC y corte cuando la fecha final es hoy. |
| `services/gui-service/test/ui-flows.test.js` | Filtros, tabla y explicaciones, candidata/Workbench, ausencia de llamadas de órdenes, rango enviado y recorrido HTTP hasta el controlador real de Quant con broker simulado. |
| `services/quant-service/test/broker.controller.test.js` | Rechazo de fechas y parámetros inválidos antes de consultar al broker. |
| `services/quant-service/test/alpaca.adapter.test.js` | Páginas de velas, token repetido, límite, errores, respuestas incompletas, datos vacíos y registros inválidos. |

### Documentación y especificación actualmente no rastreadas

| Archivo | Contenido |
| --- | --- |
| `docs/verificacion/SENALES_TECNICAS.md` | Uso de la interfaz, fórmulas, límites y resultados registrados de ambas sesiones. |
| `openspec/changes/senales-tecnicas-causales/.openspec.yaml` | Identifica el esquema `spec-driven` del cambio. |
| `openspec/changes/senales-tecnicas-causales/proposal.md` | Problema, alcance y capacidades propuestas. |
| `openspec/changes/senales-tecnicas-causales/design.md` | Decisiones sobre causalidad, módulos, cobertura y riesgos. |
| `openspec/changes/senales-tecnicas-causales/tasks.md` | Seguimiento de cinco tareas, actualmente marcadas como completadas. |
| `openspec/changes/senales-tecnicas-causales/specs/causal-technical-signals/spec.md` | Requisitos y escenarios para señales causales, presentación y separación de órdenes. |
| `openspec/changes/senales-tecnicas-causales/specs/bounded-market-candles/spec.md` | Requisitos y escenarios de consulta validada y paginación de velas. |

El presente `CAMBIOS_FASE_1.md` es el informe de revisión solicitado posteriormente; no forma parte de las pruebas ni del motor financiero.

## 5. Explicación técnica de funciones relevantes

### Señales e indicadores

- `sortedBars` filtra velas inválidas y ordena por timestamp antes de calcular señales.
- `smaCrossEntries` reutiliza las series SMA existentes y ahora acompaña cada cruce con los cierres y medias que permiten explicarlo.
- `zoneBreakoutEntries` evalúa cada vela contra `supportResistance` aplicado al prefijo anterior y conserva límites, ATR, margen, umbral y fecha de confirmación del pivote.
- `computeTechnicalSignals` reúne los eventos SMA, RSI y rupturas habilitados, los ordena y añade ticker, temporalidad, tipo, regla y explicación. Devuelve una lista vacía para temporalidades distintas de `1Day`.
- `computeEntrySignals` conserva el flujo de entradas para candidatas sin el recorte anterior a 12; `computeExitSignals` incorpora los valores usados en la salida. `strategyLevels` y `computeTriggers` siguen componiendo los niveles y triggers de la candidata.
- `technicalIndicators`, `simpleMovingAverageSeries` y `relativeStrengthIndexSeries` son funciones preexistentes. La SMA es una media simple; el RSI14 usa suavizado de Wilder; el ATR14 empleado es la media simple de 14 rangos verdaderos. `supportResistance` conserva el cálculo de zonas y deja `breakoutAt` sin fecha retrospectiva.

### Interfaz y fechas

- `marketPeriod` conserva los periodos predefinidos y construye el rango personalizado; `marketPeriod.formatUtc` formatea fechas en UTC para la presentación.
- `showRange` y `updateRangePreview` muestran el intervalo; los eventos de fecha activan `custom`. `invalidateCandles` limpia la vista cuando cambia la configuración y evita que una respuesta anterior sustituya la consulta actual.
- `loadCandles` construye la solicitud, muestra el rango enviado y valida la respuesta antes de renderizar. `renderCandles` comunica cantidades, fuente y cobertura.
- `window.__candleOverlaySource` calcula o reutiliza señales de velas diarias cerradas, aplica filtros y combina de forma diferenciada eventos técnicos, candidata y Workbench. `updateCandidateStatus` comunica el estado de la selección.
- `renderSignalTable` presenta los eventos y los valores ya calculados; el botón de cada fila controla la visibilidad y `aria-expanded` del detalle. `renderCandlesChart` dibuja marcadores y tooltips sobre la gráfica existente.

### API y adaptador

- `validMarketDate` y `broker.controller.getCandles` validan fechas, ticker, temporalidad, orden, límite y token antes de solicitar datos.
- `AlpacaAdapter.getCandles` solicita páginas, vigila tokens y timestamps repetidos, valida OHLCV y límites temporales, y devuelve registros reales junto con los metadatos de cobertura. Si falla una página posterior, conserva los registros ya obtenidos y marca la respuesta como parcial; si falla la primera petición, el error se propaga.

## 6. Pruebas realizadas y resultados registrados

Los siguientes resultados proceden de las ejecuciones observadas en las dos sesiones anteriores y del registro en `docs/verificacion/SENALES_TECNICAS.md`. No se han contado como pruebas nuevas de esta revisión documental.

| Momento y comprobación | Resultado observado |
| --- | ---: |
| Antes de la fase: `npm test` | 187/187 |
| Antes de la fase: `vertical-spread.test.js` y `pricing-validation.test.js` | 9/9 |
| Al finalizar la implementación inicial: `npm test` | 205/205 |
| Regresión inicial final de selección/evaluación de spreads y pricing | 20/20 |
| Pruebas específicas de señales, fechas, interfaz, Workbench y velas durante la implementación | 100/100; posteriormente controlador y adaptador 34/34 tras validaciones adicionales |
| Antes del pulido: regresión financiera y de triggers | 33/33 |
| Tras el pulido: `npm test` | **211/211** |
| Tras el pulido: fechas, interfaz, Workbench y distribución | **63/63** |
| Tras el pulido: selección/evaluación Bull/Bear, Black-Scholes y triggers causales | **33/33** |

Las pruebas financieras incluyen casos para **Bull Call, Bull Put, Bear Call y Bear Put**, selección de patas en los escenarios existentes, pérdida/ganancia y break-even de los casos de prueba, precio conocido y paridad put-call de Black-Scholes, y recuperación/validación de volatilidad implícita. La suite general también prueba flujos de griegas y del Workbench. Estos resultados acreditan los **casos ejecutados**, no una prueba exhaustiva de todas las condiciones de mercado.

Comandos utilizados que pueden repetirse desde la raíz:

```bash
npm test
node --test services/quant-service/test/vertical-spread.test.js services/quant-service/test/pricing-validation.test.js services/gui-service/test/strategy-selection.test.js services/gui-service/test/triggers.test.js
node --test services/gui-service/test/market-period.test.js services/gui-service/test/ui-flows.test.js services/gui-service/test/quant-workbench.test.js services/gui-service/test/workspace-view.test.js
```

La prueba de rango de la interfaz incluye el caso `01/01/2025–18/11/2026` con reloj simulado y verifica los extremos enviados. Otra prueba utiliza una petición HTTP local al controlador real de Quant con un **broker simulado**. Las pruebas de interfaz verifican la apertura/cierre del detalle, valores, filtros, correspondencia con la vela y ausencia de llamadas a las rutas de órdenes.

Durante el pulido se ejecutó además una comprobación con **Chrome headless** y datos simulados: cambio de periodo a rango personalizado, parámetros enviados, apertura de explicación, estado sin candidata y distribución a 390 px. El script usado fue temporal y no quedó como prueba persistente en el repositorio. No se consultó Alpaca real ni se enviaron órdenes en esa comprobación.

El solicitante informó en la conversación de una comprobación previa en navegador con **NVIDIA, 128 velas diarias en seis meses y 28 señales**. Ese dato se consigna como **observación comunicada por el solicitante**: esta revisión no dispone de una captura o traza independiente con rango exacto, fecha de consulta y feed que permita reproducirlo o verificarlo por separado.

En la revisión documental actual, `openspec validate senales-tecnicas-causales --strict` respondió que el cambio es válido. `git diff --check` no informó errores de espacios en las diferencias rastreadas; Git mostró avisos de conversión futura de finales de línea. Las ejecuciones generales registraron avisos preexistentes de deprecación de Node/Mongoose.

## 7. Compatibilidad y funcionalidades conservadas

- **Bull Call, Bull Put, Bear Call y Bear Put:** no se modificaron en esta fase sus evaluadores, selección de patas, primas, ganancias, pérdidas ni break-even. Se mantienen las pruebas de selección, evaluación y flujo de interfaz indicadas arriba.
- **Black-Scholes, griegas y volatilidad implícita:** no se modificaron sus fórmulas. Se conserva el Quant Workbench y su integración previa con la gráfica y la tabla comparativa.
- **Candidatas:** se conservan selección, niveles y señales orientativas; ahora conviven con las señales técnicas independientes y están identificadas por separado.
- **Alpaca Paper y órdenes:** se conserva el flujo preexistente. Las señales no generan órdenes automáticamente; las pruebas de interfaz comprueban que filtrar o consultar señales no llama a las rutas de órdenes o spreads del broker.
- **Arquitectura y persistencia:** se conservan GUI Service, Quant Service, Gateway, los demás microservicios y los flujos existentes de Supabase. No se introdujo una migración de base de datos ni un cambio de autenticación.
- **Alcance:** no se añadió un nuevo ranking de empresas ni simulaciones de 90 días. El comparador de spreads y otras funciones de investigación ya existentes no deben atribuirse a esta fase.

## 8. Pendientes y limitaciones

1. **Consulta real posterior al pulido:** volver a comprobar con la configuración y permisos de Alpaca del equipo el rango deseado, el feed y los metadatos de completitud. Las pruebas automatizadas y la comprobación de Chrome descritas aquí usan datos simulados.
2. **Temporalidades:** las señales históricas se calculan únicamente para `1Day`. En intradía u otras temporalidades se desactivan con aviso; no se trasladan por coincidencia de fecha.
3. **Vela del día actual:** por precaución se excluye de las señales la vela correspondiente al día bursátil actual de Nueva York hasta el día siguiente, incluso si la sesión ya cerró. No se utiliza un calendario que identifique el minuto exacto de cierres especiales.
4. **Ventana y calidad de datos:** las zonas usan hasta 252 velas previas y los indicadores comienzan con las velas recibidas en el rango, sin precalentamiento anterior. Cambios de rango, datos revisados, ajustes, retrasos, permisos del feed o una respuesta parcial pueden afectar los resultados. `complete` describe la paginación recibida —o el segmento solicitado si se parte de un token—, no garantiza cobertura de todas las bolsas ni una vela para cada día.
5. **Precisión del timestamp:** para emparejar marcadores y velas se utiliza `new Date(...).toISOString()`, con precisión de **milisegundos**, no comparación literal de fracciones más finas. El timestamp original se conserva en el detalle de la tabla. Conviene revisar este punto si en el futuro se requieren eventos diferenciados dentro del mismo milisegundo.
6. **Fecha histórica de ruptura de la instantánea:** `supportResistance.breakoutAt` es `null` para evitar una atribución retrospectiva; quien necesite un evento histórico debe consultar las señales causales calculadas, no interpretar ese campo como fecha disponible.
7. **Enlaces y trazabilidad de nombres:** `README.md` apunta actualmente a `docs/verificacion/SENALES_TECNICAS_FASE1.md`, pero el archivo presente es `docs/verificacion/SENALES_TECNICAS.md`. También hay referencias antiguas al nombre OpenSpec `fase-1-senales-tecnicas-causales`, mientras la ruta actual es `senales-tecnicas-causales`. Revisar y reconciliar esos nombres en un cambio autorizado; este informe no modifica el README ni los artefactos existentes.
8. **Registro en Git:** los cambios de fase 1 y el pulido siguen sin confirmar. Antes de utilizarlos como evidencia definitiva de participación conviene revisarlos con el equipo y registrar los commits y autores que correspondan; no se puede reconstruir la autoría individual de líneas no confirmadas solo a partir del estado actual.

## 9. Guía breve para revisar la interfaz

1. Con las dependencias y configuración existentes, iniciar `npm run start:quant` y `npm run start:gui`, y abrir la GUI en el puerto configurado —por defecto, `http://localhost:3005`—.
2. En **Gráfica**, elegir un ticker, un periodo y temporalidad `1Day`. Los periodos predefinidos muestran sus fechas; editar una fecha cambia al rango personalizado.
3. Pulsar **Mostrar gráfica** y comprobar el intervalo UTC enviado, la fuente y si la consulta está completa o parcial.
4. Activar indicadores, consultar el total y abrir **Ver explicación** en distintas filas. Cambiar el máximo de marcadores no debe eliminar filas de la tabla.
5. Opcionalmente, ejecutar el análisis de spreads, elegir una candidata y activar sus entradas/salidas; comprobar también un método del Quant Workbench. Estas interacciones de análisis no requieren enviar una orden.
