## ADDED Requirements
### Requirement: Escenarios comunes y comparación completa
La comparación SHALL reutilizar 10000 precios terminales por empresa y supuestos cuando Monte Carlo esté seleccionado, sin recortar candidatas.
#### Scenario: Cadena extensa
- **WHEN** se comparan miles de pares
- **THEN** se conserva la cantidad de escenarios y cada payoff equivale a evaluar esa misma muestra por fuerza bruta
#### Scenario: Núcleo apagado
- **WHEN** Monte Carlo está desmarcado
- **THEN** no se genera muestra Monte Carlo
#### Scenario: Independencia entre análisis
- **WHEN** cambian empresa o supuestos
- **THEN** la muestra compartida anterior no se reutiliza
