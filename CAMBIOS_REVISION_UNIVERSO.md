# Correcciones de la revisión: empresas, comparación y cobertura

Fecha: 23 de noviembre de 2026. Base integrada: main `94e2ad3` (cambios de Paulina). Implementación y pruebas asistidas por IA: Codex. No se atribuye autoría manual a estos cambios.

## Qué cambió

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
