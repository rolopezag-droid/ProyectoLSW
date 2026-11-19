# Tasks

## 1. Core técnico y probabilidades

- [x] 1.1 Implementar pivotes confirmados, zonas ATR, pruebas y rupturas en el análisis; verificar la salida y el caso sin ATR mediante inspección del código.
- [x] 1.2 Añadir probabilidad Black-Scholes separada de la frecuencia histórica y etiquetar claramente los supuestos; revisar que ambas cifras no se mezclen en el ranking.

## 2. Datos fundamentales FMP

- [x] 2.1 Añadir consulta server-side a FMP con clave de entorno, validación de tickers, caché y estado claro si falta configuración o cobertura.
- [x] 2.2 Mostrar métricas financieras y su fecha; calcular ganadores/perdedores solo entre tickers elegidos usando velas Alpaca.
- [x] 2.3 Calcular un score fundamental interpretable con umbrales y cobertura mínima; aplicarlo al score de ranking sin alterar las probabilidades históricas o Black-Scholes.

## 3. Interfaz y explicación

- [x] 3.1 Añadir casillas independientes de módulos y mostrar sólo las señales seleccionadas; inspeccionar estado inicial, deselección y datos no disponibles.
- [x] 3.2 Mostrar zonas técnicas, datos financieros, movimientos de mercado y explicación determinista; verificar que la fuente y hora acompañen cada evidencia.
- [x] 3.3 Incluir selecciones, resultados, método y límites en snapshots nuevos manteniendo compatibilidad con snapshots antiguos; revisar el objeto guardado.
- [x] 3.4 Mantener RSI como métrica técnica y dejar la gráfica enfocada en velas, SMA 20/50/200 y volumen, según el ajuste solicitado.

## 4. Documentación e integración

- [x] 4.1 Documentar FMP, configuración de clave, fuentes y límites en README sin incluir credenciales; revisar que el flujo coincide con la interfaz.
- [x] 4.2 Revisar cambios, validar artefactos OpenSpec y registrar honestamente pruebas no ejecutadas; no enviar órdenes al broker.
