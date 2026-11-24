## ADDED Requirements
### Requirement: Mercado primero
La pantalla SHALL mostrar la gráfica antes de filtros de comparación y resultados.
#### Scenario: Abrir análisis
- **WHEN** se abre Análisis y estrategias
- **THEN** Precios y gráfica precede a los controles de comparación.
### Requirement: Exclusión de módulos
Los módulos desmarcados SHALL dejar de aportar a resultados, columnas y explicaciones del análisis nuevo.
#### Scenario: Retirar noticias
- **WHEN** se desmarca Noticias y se analiza nuevamente
- **THEN** no se consulta noticias ni se muestra confluencia anterior.
