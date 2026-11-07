# Evidencia: validación de intervalos de velas

Fecha: 2026-11-06 (America/Mazatlan).
Responsable: Roberto. Modalidad: desarrollo asistido por IA (Codex).
API: GET /api/v1/broker/candles, Quant Service.
Herramienta: OpenSpec 1.16.1, esquema spec-driven.

## Secuencia verificable
1. Se redactaron config.yaml, propuesta, diseño, especificaciones y tareas antes de modificar la validación.
2. Commit 8e44431: documentos OpenSpec y pruebas previas. No contiene la corrección del controlador.
3. Se ejecutó node --test services/quant-service/test/broker.controller.test.js contra el controlador previo: 14 casos, 7 correctos y 7 fallidos. Los casos inválidos devolvían 200 en lugar de 400.
4. Se implementó la corrección y se ejecutó npm --workspace services/quant-service test: 25 pruebas aprobadas, 0 fallidas. Incluye los 14 casos nuevos y 11 previos.
5. Commit 5e58281: validación conforme a especificación y tareas de implementación/pruebas completadas.

Los hashes son commits locales reales; esta intervención no se ha subido a GitHub.

## Antes y después
| Caso | Antes | Después |
|---|---|---|
| 1Day, 1Week, 1Month, 3Month, 6Month, 12Month | Se conservan | Se conservan, HTTP 200 con broker simulado |
| timeframe ausente | 1Day | 1Day |
| 1Hour, desconocido, vacío | Sustitución silenciosa por 1Day | HTTP 400 con message explicativo |
| Array/repetición, objeto, null, número | Sustitución silenciosa por 1Day | HTTP 400 |
| Broker ante entrada inválida | Se consulta | Cero invocaciones, comprobado por prueba |

## Estructura
Antes y después: rutas -> controlador -> adaptador del broker. Se conserva porque la validación es breve y corresponde al límite HTTP. Alternativa evaluada: extraer módulo de validación; se descarta para este cambio por no aportar separación significativa adicional. Las pruebas nuevas viven en services/quant-service/test/broker.controller.test.js y sustituyen las dependencias del controlador real con un harness aislado.

## Alcance de las pruebas
Pruebas unitarias del controlador y regresión de Quant con respuestas simuladas. No acreditan integración real con Alpaca, pruebas HTTP E2E ni un contrato Pact. Se preservan parámetros start/end/sort/limit. Las pruebas no leen .env, no envían órdenes y no escriben en Supabase.
No se atribuye la corrección de órdenes del broker a estas pruebas ni se afirma que se haya optimizado rendimiento.

## IA y trabajo manual
Codex redactó especificaciones, pruebas y cambio de controlador bajo indicación de Roberto. Los commits usan su identidad Git; esto no convierte el código en optimización manual. No hay una intervención manual verificada en este caso y no se inventan aportaciones de compañeros.

## Reproducir
- npm ci
- node --test services/quant-service/test/broker.controller.test.js
- npm --workspace services/quant-service test
- npx openspec validate validar-intervalos-de-velas --strict

## Estado
Implementación y pruebas completadas. Cambio activo conservado para revisión y consulta de evidencia antes del archivo final. La tarea de archivo permanece sin marcar hasta ejecutar realmente ese paso.
