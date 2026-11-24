## ADDED Requirements
### Requirement: Análisis sin bloqueo
El cliente SHALL ejecutar cálculo pesado fuera del hilo de interfaz.
#### Scenario: Todos los cores
- **WHEN** se analizan todos los cores
- **THEN** el cálculo se ejecuta en worker y la interfaz puede responder mientras espera.
### Requirement: Cancelación
El cliente SHALL terminar workers ante cancelación y descartar resultados tardíos.
#### Scenario: Cambiar módulos
- **WHEN** se cancela o cambia el contexto
- **THEN** se abortan sus cálculos y no publican resultados obsoletos.
