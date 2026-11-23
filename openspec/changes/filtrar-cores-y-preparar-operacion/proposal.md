# Filtrar cores y preparar una operación

## Why
El análisis mezclaba datos y factores de módulos desmarcados, no distinguía un top por empresa de las operaciones de una empresa y no trasladaba la sugerencia al formulario de solicitud.

## What Changes
- Dos recorridos: top del catálogo o lista personalizada, y empresa individual.
- Puntuación explicable calculada solo con los cores seleccionados; ausencia de datos impide clasificar, sin valores neutrales inventados.
- Filtros antes del top, sin el recorte previo de 20 pares. Noticias es contexto, sin sentimiento inventado.
- Retirar resistencias de los paneles y de la gráfica; técnico desmarcado oculta sus capas.
- Catálogo paginado de vencimientos reales y fecha manual futura.
- Preparar operación validada por Quant con empresa, fecha, estrategia, strikes, primas, multiplicador y referencia.
- Corregir la conversión erf→CDF para que Black-Scholes pueda aportar al ranking.

## Scope
Cambios locales; no publicar, enviar órdenes ni escribir registros reales durante las pruebas. El ranking es una heurística de análisis, no una recomendación financiera. Los cores técnico y Black-Scholes son los dos métodos centrales; fundamental y movimiento son optativos y noticias es contexto.
