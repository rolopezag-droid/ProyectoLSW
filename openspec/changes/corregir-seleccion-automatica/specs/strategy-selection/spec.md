## ADDED Requirements
### Requirement: Selección por estrategia
La interfaz SHALL seleccionar dos contratos del ticker y vencimiento solicitados, calls para estrategias Call y puts para Put, con compra Ask y venta Bid y orden de strikes acorde a cada estrategia.
#### Scenario: Cuatro estrategias
- **WHEN** se solicita una vertical F3
- **THEN** la selección corresponde a la estrategia y su prima neta es positiva y menor que el ancho
### Requirement: Contexto y errores
La interfaz SHALL descartar cotizaciones incompletas y respuestas de otro contexto.
#### Scenario: No existe par
- **WHEN** la cadena no contiene dos contratos válidos
- **THEN** se informa el error sin reutilizar cotizaciones antiguas
### Requirement: Selector compartido
Los flujos de cotización, evaluación automática y preparación Paper SHALL usar el mismo selector.
#### Scenario: Evaluación automática
- **WHEN** está activada la selección automática
- **THEN** se consultan y validan los contratos antes de evaluar
