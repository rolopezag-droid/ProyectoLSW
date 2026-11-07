# Design
## Decisions
Separar construcción/validación de órdenes de la red. Documentación Alpaca exige order_class=mleg, qty del spread y ratio_qty por pata. Solo verticales de dos patas en nuestro módulo F3, con símbolos OCC de seis dígitos de fecha; orden límite neta firmada (débito positivo, crédito negativo). Rechazar stops por pata no soportados y ofrecer límite en la UI con explicación. No simular una protección inexistente.
Los setups reutilizan el servicio de persistencia existente por HTTP; no crean otra fuente de verdad. Las ingestiones guardan snapshots normalizados en disco local con escritura atómica, sin inventar colas. Se explicita ese almacenamiento.
Mantener estructura por servicio, extraer orden builder y snapshots/helpers donde evitan duplicación. Estado de servicios mediante petición HTTP con timeout. Guardado sigue RLS con usuario autenticado. No crear usuarios ni modificar BD para pruebas.
## Risks / Trade-offs
La prueba real autenticada de persistencia requiere cuenta del usuario, no disponible al agente. Consultas de solo lectura verifican conectividad, no acreditan escritura. Dependencias externas pueden estar caídas; informar estado real. Automatización en navegador cesa al cerrarlo y no garantiza ejecución con pestaña suspendida. Idempotencia usa client_order_id y evita reintentar tras resultados inciertos.
## Validation
Mocks de broker y BD para mutaciones, regresión HTTP local, lectura real de mercado y BD cuando autorizada. Registrar pruebas con límites, sin afirmar ejecución o rendimiento no medido.
