# Selección automática F3
Responsable: Roberto, con asistencia IA de Codex.

Problema: cotización siempre filtraba calls y elegía estructura Bull Call; Paper repetía compra de strike menor para todas las estrategias.
Solución: selector puro strategy-selection.js compartido por cotización, evaluación automática y preparación Paper. Compra usa Ask, venta Bid; Bull Call/Bear Put débito, Bear Call/Bull Put crédito. Filtra ticker, vencimiento, tipo, símbolo contractual y cotizaciones numéricas no cruzadas. La prima neta debe ser mayor que cero y menor que ancho. Limpia cotizaciones/resultados al cambiar contexto y descarta respuestas de otro contexto. No se usa la prima de una opción como supuesto spot.

Pruebas: 8 del selector, incluyendo las cuatro estrategias contra el evaluador real y casos negativos; 27 de regresión Quant, todas aprobadas. Broker simulado, sin órdenes y sin escrituras BD. No se afirma que el envío de órdenes Paper esté corregido: permanece fuera de este cambio, con las limitaciones ya detectadas.

La selección toma el primer par consecutivo válido de la cadena recibida; no garantiza par óptimo ni cadena completa y no supone cotizaciones ejecutables. Si no encuentra par, informa error.
