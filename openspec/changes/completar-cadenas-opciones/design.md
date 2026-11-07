# Design
## Decisions
Mantener la API de cadena por página compatible con limit existente. Añadir type y pageToken y devolver nextPageToken. La GUI agrega hasta 50 páginas y rechaza tokens repetidos o búsqueda incompleta. Cada página consulta todas sus cotizaciones en bloques de 100. Selector busca pares consecutivos dentro de cotizaciones válidas; distingue falta de contratos, cotizaciones y prima neta. No inventar precios.
## Risks / Trade-offs
Más llamadas y posible limitación de Alpaca: propagar el error sin evaluar datos incompletos. No reintentos automáticos ni recomendaciones financieras.
