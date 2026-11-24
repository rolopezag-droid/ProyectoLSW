## ADDED Requirements
### Requirement: Análisis continuo
La GUI SHALL mostrar filtros, gráfica, cores y estrategias en la misma pantalla, sin pasos internos.
#### Scenario: Consultar explicación
- **WHEN** se abre una explicación
- **THEN** el ranking y la gráfica permanecen en la misma página.
### Requirement: Revisión independiente
La GUI SHALL mantener la revisión de orden en una pantalla independiente.
#### Scenario: Preparar operación
- **WHEN** se prepara una candidata verificada
- **THEN** se abre la pantalla de orden conservando el bloqueo de estrategia.
### Requirement: Riesgo verificado
El resumen SHALL usar exclusivamente la evaluación existente.
#### Scenario: Editar entrada
- **WHEN** se invalida la evaluación
- **THEN** se retiran los importes anteriores.
