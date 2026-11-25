# Correcciones de la revisión: empresas, comparación y cobertura

Fecha: 23 de noviembre de 2026. Base integrada: main `94e2ad3` (cambios de Paulina). Implementación y pruebas asistidas por IA: Codex. No se atribuye autoría manual a estos cambios.

## Qué cambió

### Nueva operación: acceso al envío y estrategia preparada

Solicitud confirmada: el botón debe llevar al envío de orden, y preparar una sugerencia debe bloquear las otras tres estrategias (no el menú de navegación).

- Se añadió **Ir al envío de orden (Paper)** al panel principal. Abre el apartado existente Ejecución Paper y automatización, desplaza la vista y enfoca su encabezado. No evalúa ni envía una orden por sí mismo; el envío sigue en su botón explícito.
- Al preparar una candidata desde Comparar, solo queda habilitada su estrategia. Las otras tres son botones nativos deshabilitados, también para teclado. Preparar otra sugerencia cambia el bloqueo a la nueva estrategia y conserva sus contratos y primas.
- **Elegir otra estrategia** permite volver a selección manual. Limpia las primas, evaluación y strikes anteriores, detiene automatización e invalida cargas pendientes. Una preparación cancelada no puede reponer posteriormente sus datos.
- Cambios en `public/index.html`, `public/workspace-navigation.js`, `public/workspace.css` y pruebas de flujo. Se conservan el aporte de Pau y el retiro pendiente del core Black-Scholes.

Validación: **45 pruebas aprobadas**, incluyendo las cuatro estrategias, bloqueo por clic/teclado, reemplazo de sugerencia, desbloqueo, cancelación con respuesta tardía, navegación sin solicitudes de órdenes, vencimientos y regresiones financieras. Verificación en navegador: el botón abre el apartado Paper y enfoca su encabezado; no se activó Ejecutar. Se detuvieron los servicios temporales de verificación. Cambios locales, sin push ni despliegue.

### Retiro del core Black-Scholes independiente

Se retiró del comparador la casilla “Core Black-Scholes”, la columna “Prob. BS”, su aporte al score, sus explicaciones y los metadatos que anunciaban una estimación no ejecutada. Esa opción sí influía antes en la clasificación; por tanto, los rankings nuevos pueden cambiar al usar únicamente los otros cores elegidos. Un flag legacy blackScholes no puede volver a activarla en el motor de ranking.

El filtro se llama “Frecuencia histórica mínima” y solo se ofrece cuando el análisis técnico está seleccionado. La preselección S&P 500 antes de consultar FMP requiere Técnico o Movimiento diario. Los snapshots nuevos conservan blackScholes=false únicamente como compatibilidad de formato.

Se mantienen los cálculos financieros en Quant: precios Black-Scholes, griegas y volatilidad implícita. No se eliminaron sus servicios ni se presentó una casilla renombrada como si implementara todo un core financiero. El algoritmo de comparación se invoca con includeBlackScholes=false y sus candidatas no generan la probabilidad de ese modelo.

Validación: **43 pruebas aprobadas**, incluyendo ausencia de selector y columna, score sin contribución del flag legacy, cuatro estrategias y transferencia a operación, recorrido simulado del universo, explicaciones, precios conocidos, paridad put-call, griegas y recuperación de volatilidad implícita. OpenSpec validado. Trabajo asistido por IA; sin órdenes ni cambios de BD. Modificación local, sin push ni despliegue.

### Integración y revisión de la rama Carlos

Origen: `Carlos`, commit `aa8ce06` de CarlosMdza (“Cambio en noticias”). Aporte real: clasificación heurística de titulares/resúmenes en Quant, frases que sustentan la etiqueta, nivel heurístico, conteos y filtro de noticias en la GUI. No modifica el score de estrategias ni predice retornos.

La rama parte de una base anterior a nuestros cambios: se resolvieron conflictos conservando el recorrido completo del índice, Top 10, consulta FMP posterior a las finalistas, protección de cuota y vencimientos actuales. Se preserva la autoría de Carlos mediante una integración con su commit como padre.

Revisión adicional asistida por IA: filtrar antes del límite de veinte artículos; omitir frases negadas; conservar eventos bajistas reconocidos anteriormente; compatibilidad de la interfaz con noticias sin sentimiento; evitar que artículos sin id/URL se sobrescriban entre sí; colores de etiquetas adecuados al tema claro. La heurística sigue siendo limitada y no interpreta todo el contexto del artículo.

Validación: **64 pruebas aprobadas**, incluyendo clasificador/backend, filtro, artículo coincidente después del puesto veinte, explicaciones, recorrido simulado de 400 empresas, Top y protecciones FMP. OpenSpec validado. No se consultaron noticias reales para esta revisión ni se enviaron órdenes. Integración local en roberto; no implica publicación remota ni despliegue. No se declara resuelta la suite heredada completa.

### Revisión del 24 de noviembre: FMP bloqueado con un ticker

**Causa comprobada:** una lectura real de `profile` para AAPL respondió HTTP 429 con `Limit Reach`. No es que el ticker haya dejado de existir ni que Alpaca esté caído. [FMP documenta que exceder la cuota puede suspender las consultas de toda la cuenta hasta su renovación](https://site.financialmodelingprep.com/faqs). No se modificó la suscripción ni se conoce el instante de renovación de esta cuenta.

**Protecciones nuevas:**

- Cliente separado en `services/gui-service/src/fmp-client.js`: cola por credencial, solicitudes simultáneas idénticas compartidas y pausa de todas las lecturas FMP tras el primer 429. Respeta `Retry-After`; sin ese dato aplica 60 segundos de pausa local, que no equivale a prometer renovación de cuota en 60 segundos. No hay reintentos automáticos.
- Caché independiente por recurso exitoso durante seis horas. Una fila parcialmente disponible ya no congela sus errores durante seis horas; los recursos faltantes pueden recuperarse al terminar su pausa. Los recursos vacíos se conservan brevemente para evitar consultas repetidas.
- Ante un error, puede reutilizar datos reales previamente obtenidos de hasta 24 horas, mostrando advertencia y fecha original. Si nunca se obtuvieron datos, continúa informando indisponibilidad. La caché vive en cada proceso, no es almacenamiento persistente ni una cuota coordinada entre todas las instancias cloud.
- Se evita que un 402 de una empresa bloquee otras; un 429 sí pausa la credencial completa. Se distinguen restricciones del plan, acceso, red y respuesta inválida.
- El catálogo público del S&P 500 se consulta primero sin gastar cuota FMP. FMP queda como alternativa si el catálogo público no está disponible.
- La interfaz conserva el motivo real aunque el proveedor no devuelva filas y muestra cuándo se obtuvieron los datos. Se conserva la consulta fundamental posterior al Top de diez empresas, el ranking, las cuatro estrategias y las rutas existentes.
- La regresión detectó que temporizadores vencidos podían agrupar lecturas de Alpaca bajo carga. La cola ahora encadena turnos y calcula la espera desde la última salida real; las órdenes no se reintentan.

**Verificación:**

- Prueba real de AAPL, DELL e IBM: una llamada efectiva a FMP recibió 429; las otras once lecturas quedaron frenadas. Una consulta posterior de MSFT no generó llamadas adicionales durante la pausa. La misma prueba obtuvo el catálogo público de 503 símbolos. No se siguió probando FMP después del bloqueo.
- Pruebas enfocadas: **82 aprobadas**, cubriendo protección global de cuota, aislamiento de claves, `Retry-After` numérico/fecha, `Limit Reach` con HTTP 200, recuperación de recursos parciales, deduplicación, caché antigua señalada, ticker único sin configuración, selección posterior al Top, gráfica, explicación y fórmulas.
- Última batería general de esta revisión: 281 pruebas, 237 aprobadas y 44 fallidas en las pruebas heredadas de pantallas/controles retirados y aserciones antiguas del broker. No se declara la suite completa en verde. El test nuevo de aviso de configuración se ejecutó además en la batería enfocada posterior.
- No se pudo verificar una respuesta real exitosa de fundamentales mientras la cuenta permanezca bloqueada; la recuperación se verificó con respuestas controladas. El código no puede liberar una cuota agotada ni desbloquear recursos premium.
- Sin órdenes, cambios de BD, exposición de claves ni servicios de prueba dejados corriendo. Esta revisión queda local en la rama roberto hasta solicitar su publicación.

### Corrección posterior: cuota FMP y orden de apartados

- La sección **05 Comparación de estrategias** vuelve a estar después de **04 Noticias**, respetando la secuencia numerada.
- En S&P 500 con fundamental seleccionado, primero se evalúa el universo con Técnico, Black-Scholes y/o Movimiento, según lo seleccionado. Después de aplicar filtros y elegir las diez finalistas se consultan sus fundamentales en FMP. No se consulta FMP durante el bucle de empresas para sus fundamentales.
- En este flujo, fundamental es información complementaria de las finalistas: no participa en el ranking global ni lo modifica después. Pantalla, explicaciones y snapshot indican `fundamentalScope.phase = post-selection` y `affectsRanking = false`. Los modos manuales conservan el fundamental como core de puntuación.
- Si solo está elegido fundamental, se solicita al menos otro core de puntuación antes de consumir consultas. Noticias por sí sola no permite clasificar empresas.
- “Ver todos” conserva los fundamentales de esas diez finalistas, sin nuevas llamadas ni fundamentos inventados para el resto. Un fallo o límite de FMP muestra el aviso y conserva el ranking ya calculado.
- El límite es de diez **empresas**, no diez peticiones al proveedor: cada empresa puede requerir hasta cuatro recursos (métricas, ratios, estados y perfil), con las cachés existentes. Esto reduce consumo; no restaura una cuota ya agotada ni desbloquea recursos premium.

Prueba: recorrido simulado de 400 empresas, consulta fundamental solo para diez símbolos después de todas las cotizaciones, FMP sin cuota manteniendo el Top, expansión sin llamadas adicionales y orden de sección 05 después de Noticias. No se repitió un recorrido real completo ni se consumió cuota real para esta validación.

### Ajuste posterior: presentar solo las finalistas

En el modo Top, el resultado inicial muestra como máximo diez empresas con score completo y una estrategia por empresa, después de comparar todo el universo elegible. El resumen de finalistas precede las tarjetas de contexto; la sección numerada 05 permanece después de Noticias. Se explican componentes del score, diferencia respecto al primer/segundo lugar y criterios de desempate. Los paneles técnico, fundamental, movimientos y noticias corresponden a esas mismas finalistas. Las noticias sin ticker asociado no se atribuyen a una finalista.

“Ver todos los resultados” permite consultar todas las empresas clasificadas y volver al Top 10 sin repetir consultas ni cambiar scores. El snapshot completo y los índices originales se conservan para preparar operaciones y consultar explicaciones. Las empresas con datos incompletos no se incorporan al Top por rellenar diez posiciones. Los modos Una empresa y Varias empresas conservan su comportamiento anterior.

Validación: prueba de recorrido simulado de 400 empresas (399 evaluadas y un fallo), comprobando diez filas/tarjetas/selectores inicialmente, paneles fundamentales limitados a diez, noticias asociadas, expansión a 399, retorno al Top conservando índices/puntuaciones y cero consultas adicionales. Se mantiene la cobertura global separada del alcance visible. Estos resultados no se presentan como una garantía de inversión.

- Navegación: se eliminó la dependencia de `selectedOptions` al convertir el ticker en un campo editable. Las sugerencias no limitan los tickers admitidos por Alpaca.
- Comparación: nuevo modo **Varias empresas**, con 1–10 símbolos, separadores coma/espacios/punto y coma y deduplicación. Se muestran hasta 25 operaciones por empresa para que una emisora no oculte las demás. Una empresa mantiene hasta 100 operaciones visibles.
- S&P 500: se obtiene un catálogo completo con procedencia. Si FMP lo restringe, se usa [datasets/s-and-p-500-companies](https://github.com/datasets/s-and-p-500-companies), basado en Wikipedia, con caché de 24 horas. No se sustituye por las diez empresas iniciales ni por cinco alzas/cinco caídas.
- El recorrido intenta opciones de **todos los símbolos** para el vencimiento elegido. Tiene progreso, cancelación, conteo de errores y ausencia de pares elegibles. Un resultado con fallos se identifica como parcial. No se publica un ranking intermedio al cancelar.
- Por empresa se evalúan los pares válidos, se aplican los filtros actuales y se conserva la mejor combinación de cada estrategia. El top final elige una estrategia por empresa. Cambiar filtros exige repetir el recorrido completo: no se finge recalcular combinaciones ya descartadas.
- Las ventanas históricas se preparan una vez por empresa; la búsqueda binaria conserva el mismo conteo de éxitos e intervalo Wilson. Las lecturas de Alpaca se espacian 400 ms en cada instancia; no se reintentan órdenes.
- FMP: las respuestas útiles se conservan aunque otro endpoint falle. El perfil aporta la capitalización real cuando faltan ratios/estados; no se crea un score con información insuficiente. HTTP 402 se explica como restricción del plan. Las restricciones por símbolo no bloquean otras empresas. Se diferencian cantidad de métricas reconocidas y cobertura ponderada del score.
- Noticias: contexto favorable/adverso/mixto/sin dirección, con los eventos textuales que motivan la etiqueta. No es un pronóstico ni demuestra causalidad y no participa en el score.
- Ganadores/perdedores: explicación, precios comparados, fecha de vela y advertencia de sesión en formación. La variación diaria no es una recomendación de estrategia.

## Archivos

- `services/gui-service/public/index.html`: campos, modos y carga del clasificador de noticias.
- `services/gui-service/public/workspace-navigation.js`: contexto del ticker editable.
- `services/gui-service/public/research-ui.js`: recorrido, cobertura, listas, filtros, explicaciones y cancelación.
- `services/gui-service/public/research-analysis.js`: preparación reutilizable de muestras históricas.
- `services/gui-service/public/news-context.js`: reglas textuales explícitas, independientes del ranking.
- `services/gui-service/src/fmp-fundamentals.js`: catálogo público, perfil, métricas parciales y cachés.
- `services/gui-service/src/server.js`: mensajes de disponibilidad del universo.
- `services/quant-service/src/brokers/alpaca/alpaca.adapter.js`: cola de lecturas.
- OpenSpec: `openspec/changes/corregir-universo-y-cobertura/`.

## Evidencia y límites reales

- Pruebas enfocadas: 43 aprobadas (proveedores, noticias, muestra histórica, selección múltiple, recorrido simulado de 400 empresas, cancelación, cuatro estrategias, transferencia sin órdenes y capas de la gráfica).
- OpenSpec: validación estricta aprobada.
- Verificación real en navegador: DELL, IBM y AAPL se compararon juntas; 10,374 pares válidos y 75 filas visibles, con las tres empresas presentes. DELL cargó su gráfica mensual con 21 velas.
- Universo real: HTTP 200 con 503 símbolos. Se verificó el inicio del recorrido real y su cancelación. **No se completó el recorrido real de las 503 emisoras**; la exploración completa se probó con proveedor simulado de 400.
- FMP real: DELL e IBM devolvieron perfil/capitalización (1/10 métricas), pero estados y ratios devolvieron 402; AAPL devolvió 9/10 métricas y score con cobertura suficiente. No es un error que pueda eliminarse fabricando datos. Se necesita un plan que cubra esos recursos u otro proveedor autorizado con cobertura equivalente para tener fundamentales completos.
- Se comprobó SEC EDGAR como posible alternativa: respondió 403 desde este entorno. No se integró como fallback supuestamente funcional.
- El recorrido completo puede tardar decenas de minutos según cadenas y cuotas. Requiere mantener la pestaña abierta; no es un trabajo durable en segundo plano. El límite local de lecturas no coordina varias instancias cloud ni garantiza cuota disponible. La lista pública tampoco es una certificación del proveedor oficial del índice.
- Batería general ejecutada antes de los últimos tests nuevos: 267 pruebas, 223 aprobadas y 44 fallidas. Persisten tests de interfaz antigua (calculadora, resistencias, disposición y controles retirados) y aserciones antiguas del broker. **No se declara toda la suite en verde.** La migración de esos tests queda fuera de las correcciones de esta revisión.
- No se enviaron órdenes reales/Paper, no se escribieron registros en BD y no se subieron credenciales. La entrega se prepara en la rama `roberto`, junto con este reporte. Publicar la rama no implica desplegar la aplicación ni integrar los cambios en main.

## Comprobar localmente

Desde la raíz `ProyectoLSW`, ejecutar `npm start` y abrir `http://localhost:3005`.
En Comparar estrategias, elegir Varias empresas e introducir `DELL; IBM AAPL`. Activar solamente los cores deseados. Para probar el universo completo, elegir Top y S&P 500; revisar el progreso y la cobertura, o cancelar. Para empresas con fundamentales restringidos, desmarcar ese core permite comparar con los demás, pero no equivale a haber obtenido sus fundamentales.

## Mercado y comparación en una sección — 24/11/2026

- Menú único **Análisis y estrategias**, con gráfica, filtros, cores y comparación en la misma página; accesos internos para recorrerla.
- Los enlaces antiguos Mercado/candles siguen abriendo el análisis integrado.
- Cambiar la empresa de la gráfica actualiza la empresa a comparar; seleccionar una empresa del ranking carga su gráfica sin invalidar los resultados ni preparar/enviar órdenes.
- Se conserva la diferencia entre periodo visual y ventana diaria del core técnico; las fórmulas de ranking y spreads no cambian.
- Archivos: `services/gui-service/public/workspace-navigation.js`, `research-ui.js`, `workspace.css` y `services/gui-service/test/research-ranking-ui.test.js`. Asistencia IA: Codex.
- Validación: 41 pruebas focalizadas aprobadas; tras reforzar la prueba de carga real de velas simuladas, 3 pruebas de integración aprobadas. OpenSpec estricto aprobado. Navegador de revisión: no pudo acceder al servidor local (timeout); revisión visual pendiente. No se enviaron órdenes ni se modificó la BD.

## Mesa por etapas basada en referencias del usuario — 24/11/2026

- Tres pasos visibles dentro de Análisis y estrategias: Buscar oportunidades, Evaluación detallada y Revisar orden. Se mantiene identidad visual propia y Bull/Bear; no se incorporan CSP/CC ni proveedores extra.
- La búsqueda presenta filtros y ranking; Ver explicación abre gráfica y explicación de la candidata. Cambiar de etapa conserva el ranking. Los paneles de cores identifican sus tickers y conservan el alcance original de finalistas.
- Preparar operación abre revisión y conserva el bloqueo de las otras tres estrategias. Formulario con resumen de riesgo a la derecha en escritorio, apilado en pantallas pequeñas.
- El resumen replica los resultados del evaluador existente, sin fórmulas paralelas; editar entradas retira los importes previos. Navegar no envía órdenes.
- Nuevo módulo: `services/gui-service/public/analysis-workflow.js`; integración en `index.html`, estilos en `workspace.css` y pruebas en `test/research-ranking-ui.test.js`. Implementación asistida por IA: Codex.
- 42 pruebas focalizadas aprobadas. Revisión visual pendiente: navegador integrado sin acceso local; Chrome no disponible. Sin modificaciones de BD ni órdenes al broker.

### Corrección final del recorrido solicitado

La separación por tres etapas descrita arriba fue retirada por indicación del usuario: filtros, mercado, gráfica, cores y comparación conviven en una sola pantalla continua. No hay pestañas internas ni botones de avanzar/volver por etapas. Revisar orden conserva su pantalla independiente y su entrada en el menú; Preparar operación traslada los contratos allí. Se conserva el resumen de riesgo y su invalidación. Validación final: 42 pruebas focalizadas aprobadas y OpenSpec estricto válido. Revisión visual sigue pendiente por la limitación de acceso local ya registrada.

## Actualización de main de Paulina — 24/11/2026

Integrado `3b1f2b0` (Paulina Martinez, Analisis Montecarl}o): simulación Monte Carlo opcional, panel, columna y contribución al ranking. Conservados cambios locales de pantalla continua, revisión independiente, bloqueo de estrategia y retiro del core Black-Scholes. Conflictos resueltos en README, index.html, research-ui.js y research-ranking.js; respaldo local retenido en stash. HEAD coincide con origin/main; modificaciones locales siguen sin publicar. Validación: 43 pruebas focalizadas aprobadas, incluida selección de Monte Carlo sin técnico, navegación, ranking y preparación sin enviar órdenes. No equivale a validar todo el proyecto ni sus proveedores reales.

## Sentimiento de noticias conectado al análisis — 24/11/2026

- Nuevo `services/gui-service/public/news-confluence.js`: relación por ticker entre sentimiento, dirección Bull/Bear y tendencia técnica solo si el core está seleccionado. Clasificación por reglas existente, sin LLM ni probabilidad inventada.
- Columna contextual en ranking y explicación con recuentos, fechas y enlaces. Solo artículos recibidos de los últimos siete días, sin duplicados ni fechas futuras. Señales contrapuestas se muestran mixtas; faltantes no se convierten en neutrales ni apoyo direccional.
- No altera precios, RSI, fundamentales, Monte Carlo ni puntuación del ranking; conecta conclusiones como evidencia explicable para la selección. El volumen de artículos recibido no representa cobertura completa de noticias. Se reutiliza la confluencia por ticker/dirección para evitar repetirla por cada par. Evidencia guardada con la candidata.
- Asistencia IA: Codex. 47 pruebas focalizadas aprobadas; después de optimizar reutilización, 3 pruebas de integración aprobadas. OpenSpec estricto válido. No se enviaron órdenes ni se modificó la BD. Revisión visual no realizada por limitación del navegador local ya registrada.

### Etiquetas explícitas por fila
La columna de noticias ahora indica sentimiento, nombre de estrategia y dirección: por ejemplo, Noticias bajistas frente a Bull Call (alcista): direcciones opuestas. La reutilización incluye estrategia para no confundir Bull Call con Bull Put. El pie de tabla aclara que cada fila es una combinación de contratos y pueden repetirse estrategias con distintos strikes. Validación: 4 pruebas de confluencia y 3 de integración aprobadas; OpenSpec estricto válido.

## Revisión de coherencia y documentación

Gráfica al principio, explicación de módulos sin factores ficticios, señales de candidata también condicionadas al core técnico y etiquetas de fuentes en español. Guía: `GUIA_ANALISIS_Y_CORES.md`. Auditoría y pendientes: `REVISION_ANALISIS_RESULTADOS.md`. Suite de flujo vigente: 50 aprobadas; verificación final de posición y exclusión técnica: 2 aprobadas. Suite general con acceso local: 260/305 aprobadas, 45 fallas pendientes descritas sin ocultarlas. Asistencia IA Codex. Sin órdenes ni cambios de BD.

## Corrección de indicadores bloqueados por core desmarcado

Corregida inconsistencia confirmada por captura del usuario: seleccionar capa o señal técnica activa el core y redibuja; desactivar core limpia esas selecciones. Aviso junto a los controles y sincronización con invalidación del ranking. El último cierre es independiente. Implementación asistida por IA Codex. Documentación técnica en GUIA_ANALISIS_Y_CORES.md y evidencia en REVISION_ANALISIS_RESULTADOS.md.

## Retiro del bloque de entradas/salidas de candidata

Eliminados bloque, casilla, selector, listeners y cálculo de entradas/salidas orientativas; sin controles ocultos de compatibilidad. Se mantienen comparación, explicación, preparación, velas e indicadores técnicos independientes. Documentación actualizada. Suite focalizada: 53 aprobadas. Asistencia IA Codex.

## Core independiente de indicadores y señales completado

Nuevo `services/gui-service/public/indicator-core.js`, casilla independiente, panel con fechas/reglas, evidencia en explicación/bitácora y componente indicators del ranking. Usa reglas ya existentes sobre velas diarias cerradas y última señal por familia en cinco velas. Neutralidad 50 cuando no hay eventos e historial suficiente; sin 50 velas, datos no disponibles. Separado del core técnico de tendencia y sus controles gráficos. No ejecuta órdenes ni reintroduce entradas/salidas de candidata. Fórmula heurística del proyecto, no validación predictiva ni core IA. Documentado en GUIA_ANALISIS_Y_CORES.md y OpenSpec completar-core-indicadores. 71 pruebas focalizadas aprobadas, OpenSpec válido. IA pendiente; revisión visual y pendientes generales anteriores continúan registrados. Asistencia IA Codex; sin publicación Git ni cambios de BD.

### Panel de indicadores comprensible

Sustituido texto técnico inicial por conclusión e implicación Bull/Bear, eventos en lenguaje sencillo y fechas UTC legibles. Fórmulas y score permanecen bajo Ver puntuación y reglas del cálculo. Distinción explícita entre empate por señales contrapuestas y ausencia de señales. Puntuaciones no son probabilidades. Dos pruebas focalizadas aprobadas, incluida reproducción de una señal RSI alcista y ruptura de soporte bajista como en la captura; sin cambios de score ni órdenes.

### Lectura cronológica de indicadores

Aplicado el formato aprobado: qué pasó primero/después, implicación de cada señal para Bull/Bear, conclusión y lectura del empate; fórmulas desplegables. Mismo score y reglas. Dos pruebas focalizadas aprobadas, incluida secuencia soporte bajista antes de recuperación RSI. Documentación y OpenSpec actualizados.

## Corrección de congelamiento con todos los cores

Diagnóstico reproducido: Monte Carlo bloqueaba el hilo de interfaz al recorrer miles de pares. Añadidos research-computation.js y research-worker.js para mover comparación e indicadores a worker cancelable. Señal de cancelación capturada por trabajo y guardia de versión tras fetch; límite por empresa de 120 s. APIs y fórmulas sin cambios. 74 pruebas focalizadas aprobadas y 1 prueba HTTP de backend aprobada, con worker real, cancelación y FMP no disponible. Documentación actualizada. Asistencia IA Codex; sin órdenes, modificaciones de BD ni publicación.

## Publicación en main — 24/11/2026

Paquete final: pantalla continua de análisis con gráfica primero, revisión independiente, indicadores como core separado, confluencia de noticias con explicación por estrategia, controles de gráfica sincronizados y cálculo Monte Carlo/indicadores en worker cancelable. Se conserva la incorporación de Paulina 3b1f2b0. Documentación: GUIA_ANALISIS_Y_CORES.md y REVISION_ANALISIS_RESULTADOS.md. Verificación previa a publicación: 87 pruebas focalizadas aprobadas; prueba HTTP backend adicional aprobada durante esta sesión. Los pendientes de suite general y revisión visual documentados siguen abiertos. Desarrollo asistido por IA (Codex), no atribuido como optimización manual.

## Core IA opcional mediante OpenRouter

Endpoint POST /api/research/ai, servicio openrouter-core.js, módulo visual research-ai.js y prompt básico editable en services/gui-service/prompts/core-ia.txt. Configuración OPENROUTER_API_KEY/OPENROUTER_MODEL con plantilla vacía y guía OPENROUTER.md. Generación manual por empresa, solo cores seleccionados, sin llamadas por todo el S&P ni cambios de ranking. Timeout, JSON validado, textos escapados, caché y límite por instancia. Fallos o ausencia de configuración conservan resultados existentes. 68 pruebas focalizadas aprobadas y 2 HTTP locales aprobadas; OpenSpec válido. No se llamó al proveedor real ni se consumió saldo; falta configurar clave/modelo. Asistencia IA Codex. No publicado en Git.

### Publicación de Core de IA en main

Etiqueta final: Core de IA, sin paréntesis. Incluye prompt editable, plantilla sin clave, endpoint backend y guía. Validación previa: 5 pruebas focalizadas de IA aprobadas y OpenSpec estricto válido; se conserva evidencia previa de 70 pruebas. No se configuró ni se publica una clave real; falta configurar OPENROUTER_API_KEY y OPENROUTER_MODEL para probar al proveedor.

## Diagnóstico y corrección del core IA local

El usuario confirmó localhost:3005/#comparar. La ruta local reconoce POST; OpenRouter rechazó la configuración existente con 401 y la verificación de la clave también devolvió 401. Inspección solo de indicadores booleanos confirmó valores de ejemplo, sin mostrar ni cambiar sus valores. Añadido rechazo preventivo de plantilla antes de consultar el modelo y mensaje específico para backend antiguo con 404. Reiniciado solo GUI local y verificado HTTP 200/example_configuration; otros servicios conservados. 4 pruebas backend simuladas y 3 de UI aprobadas, OpenSpec válido. Falta una clave real y modelo válido para acreditar generación real. No se editaron credenciales. Durante el diagnóstico también se actualizó el despliegue Vercel de la versión antigua a main 7fd02f1, antes de que el usuario aclarara el entorno local. Correcciones actuales permanecen locales.

## Prueba real de OpenRouter con configuración del usuario

Cargada nueva configuración sin mostrar ni modificar la clave. Reiniciados servicios mediante npm start al detectar Quant apagado. Flujo final: 254 velas reales QQQ, interpretación HTTP 200 con openrouter/free (modelo servido particle-ai/particle-1:free), repetición idéntica desde caché. Detectada y corregida atribución de datos faltantes a cores no seleccionados: ahora el backend determina esos faltantes. Manejo de JSON cercado y rechazo de respuesta truncada, 1600 tokens y reasoning desactivado cuando se permite. 6 pruebas backend y 3 UI aprobadas. Sin órdenes ni publicación de claves. Cambios locales.

## Encabezados de los bloques de análisis
Se uniformaron los encabezados de IA e indicadores y se numeran consecutivamente los bloques visibles, incluyendo IA. No se cambió el lugar de IA ni el cálculo de los cores. Resumen y bitácora tienen rótulos propios sin números de core. Implementación: `services/gui-service/public/research-sections.js`, cargada después de `research-ai.js`; procesa `research:snapshot` cuando ya está definida la visibilidad. Validación: 44 pruebas de IA, comparación y encabezados aprobadas; interpretación real QQQ y caché verificadas previamente.
