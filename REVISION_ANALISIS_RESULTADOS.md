# Revisión del análisis — 24/11/2026

Revisión asistida por IA (Codex), sobre main `3b1f2b0` más cambios locales sin publicar. No se enviaron órdenes ni se modificaron esquemas o datos de producción.

## Correcciones aplicadas

- Gráfica primero, antes de los filtros de comparación; una pantalla continua y revisión de orden independiente.
- Core técnico desmarcado: se omiten señales técnicas, incluso entradas/salidas de una candidata previamente seleccionada; se conserva la referencia de precio y las velas.
- Explicaciones sin factores ficticios: un core ausente no aporta al score, en lugar de afirmar «factor 1».
- Fuentes de noticias con etiquetas en español; coincidencia direccional distingue estrategia y sentimiento.
- README precisa que Monte Carlo depende del horizonte de consulta aunque repita la semilla aleatoria.
- Se mantiene fundamental/financiero después del Top 10 para evitar consumir FMP para todo el S&P.

## Pruebas ejecutadas

Primera ejecución general restringida: 304 pruebas, 226 aprobadas y 78 fallidas. Varias fallas HTTP mostraron `EACCES` al conectarse a servidores de pruebas locales.

Reejecución con acceso local: 305 pruebas, 260 aprobadas y 45 fallidas. El conteo varió por haberse agregado una prueba durante la revisión. No constituye una suite verde.

Pruebas focalizadas del flujo vigente, tras los ajustes: 50 pruebas aprobadas (confluencia, ranking, comparación, explicación, preparación, exclusión de noticias, gráfica primero y señales técnicas desmarcadas). Ver tareas OpenSpec para validaciones posteriores.

## Fallas pendientes de la suite general

| Grupo | Cantidad | Diagnóstico |
| --- | --- | --- |
| `services/gui-service/test/collapsible.test.js` | 9 | Espera controles y paneles del diseño anterior, incluyendo servicios/conexiones retirados. Requiere migración de expectativas; no reintroducir elementos solo para satisfacerlas. |
| `services/gui-service/test/quant-workbench.test.js` | 9 | Espera la calculadora eliminada por el usuario. Los endpoints cuantitativos se conservan y deben validarse por su propia suite. |
| `services/gui-service/test/ui-flows.test.js` | 22 | Hay referencias a `chkAutoStrikes` ausente, controles del workbench y resistencias retiradas. Requiere adaptar fixtures al flujo actual y conservar pruebas equivalentes de guardado y ejecución simulada. No se afirma que todo fallo sea inocuo sin esa migración. |
| `services/gui-service/test/workspace-view.test.js` | 3 | Espera el antiguo alternador lado a lado/apilado. La estructura vigente es continua. |
| `services/quant-service/test/alpaca.adapter.test.js` | 2 | Discrepancia entre pruebas que esperan `position_intent` y payload actual que no lo incluye. Pendiente contrastar con contrato vigente del broker antes de cambiar una instrucción de apertura/cierre. No se enviaron órdenes. |

No se eliminaron ni se marcaron como omitidas estas pruebas para simular éxito. Los archivos de salida locales sirvieron de diagnóstico y no se incluyen como entregables.

## Límites

- La validación visual sigue pendiente: el navegador integrado no accede al servidor local y Chrome no está disponible como superficie de revisión.
- No se acreditó conexión real con FMP, Alpaca ni guardado Supabase mediante estas pruebas.
- Noticias sigue siendo contexto explicable; no participa en la puntuación numérica.
- No hay un core LLM de IA en el proyecto revisado.

Guía de funcionamiento: `GUIA_ANALISIS_Y_CORES.md`. Cambios y evidencias acumuladas: `CAMBIOS_REVISION_UNIVERSO.md`.

## Corrección posterior a captura de indicadores

La captura del usuario confirmó selección inconsistente: SMA activas en controles pero bloqueadas por el core técnico apagado. La revisión anterior no había cubierto ese recorrido. Ahora seleccionar un indicador activa el core, muestra aviso e invalida la comparación; apagarlo desmarca sus indicadores y retira el SVG. Último cierre sigue independiente. Cuatro pruebas focalizadas aprobaron dibujo real de SMA20/50/200, soportes, exclusión y ausencia de consultas adicionales. Las limitaciones de revisión visual y suite general antes indicadas no se dan por resueltas por esta corrección.

Resultado final de regresión focalizada tras corregir sincronización: 52 pruebas aprobadas, 0 fallidas. OpenSpec estricto válido. Esto no sustituye los pendientes de la suite general ni una revisión visual en el navegador del usuario.

## Validación del core independiente de indicadores

71 pruebas focalizadas aprobadas (indicador puro, reglas de señales reutilizadas, ranking, confluencia, comparación y GUI). Comprueban historial corto, exclusión de velas actuales/futuras, score Bull/Bear, neutralidad sin eventos, módulo desmarcado, funcionamiento sin técnico y marcadores SVG con core independiente. No se reejecutó la suite general; los pendientes anteriores no se consideran resueltos. OpenSpec estricto válido.

## Congelamiento al activar todos los cores

Confirmado por el usuario: al pulsar Analizar deja de responder la página. Se reprodujo carga síncrona de 1740 pares con 10,000 simulaciones por par (~4845 ms en una medición local). La API no ejecuta ese Monte Carlo; ocurría en el hilo principal del navegador. Cálculo trasladado a Web Worker sin cambiar fórmulas. Prueba con worker real confirma que el hilo principal sigue atendiendo intervalos mientras calcula, y terminación ante cancelación, error y timeout. Suite focalizada de 74 pruebas aprobada; prueba HTTP adicional del backend aprobada (sirve worker/dependencias y mantiene health con FMP sin clave). No se probó un proveedor real ni órdenes. La medición de tiempo es orientativa, no benchmark garantizado.
