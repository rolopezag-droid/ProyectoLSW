# Correcciones de la revisión: empresas, comparación y cobertura

Fecha: 23 de noviembre de 2026. Base integrada: main `94e2ad3` (cambios de Paulina). Implementación y pruebas asistidas por IA: Codex. No se atribuye autoría manual a estos cambios.

## Qué cambió

### Ajuste posterior: presentar solo las finalistas

En el modo Top, el resultado inicial muestra como máximo diez empresas con score completo y una estrategia por empresa, después de comparar todo el universo elegible. La comparación aparece antes de las tarjetas de contexto y explica componentes del score, diferencia respecto al primer/segundo lugar y criterios de desempate. Los paneles técnico, fundamental, movimientos y noticias corresponden a esas mismas finalistas. Las noticias sin ticker asociado no se atribuyen a una finalista.

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
