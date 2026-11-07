# Design
## Decisions
Extraer selector puro compartido para evitar algoritmos duplicados. Bull Call compra strike menor; Bear Call compra mayor; Bull Put compra menor; Bear Put compra mayor. Compra Ask y venta Bid. Débito para Bull Call/Bear Put; crédito para Bear Call/Bull Put, estrictamente positivo y menor que ancho. Filtrar ticker, vencimiento, tipo y cotizaciones válidas. Buscar pares consecutivos válidos sin recomendar inversión ni inventar spot. Mantener APIs de órdenes intactas.
## Risks / Trade-offs
Cadena parcial: si no hay par válido se informa sin inventar valores. Descartar respuestas cuyo contexto cambió.
