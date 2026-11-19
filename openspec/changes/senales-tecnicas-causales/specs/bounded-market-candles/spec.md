# Spec Delta

## Purpose
Consultar y presentar velas reales con rangos validados y cobertura explícita del proveedor de mercado.

## ADDED Requirements

### Requirement: Consulta validada de velas
La API SHALL validar ticker, fechas, orden, temporalidad y límite seguro antes de llamar a Alpaca.

#### Scenario: Rango inválido
- **WHEN** una fecha es inválida, futura o el inicio no precede al final
- **THEN** SHALL responder error de entrada sin consultar el proveedor.

### Requirement: Paginación y cobertura
La API SHALL recorrer páginas hasta completar el rango o alcanzar el límite solicitado, sin bucles de tokens, e informar fuente, temporalidad, cantidades y fechas reales.

#### Scenario: Página adicional
- **WHEN** Alpaca devuelve un token nuevo y queda capacidad
- **THEN** SHALL recuperar la página siguiente.

#### Scenario: Datos parciales o token repetido
- **WHEN** la recuperación no puede completarse
- **THEN** SHALL informar explícitamente el motivo y no presentar el resultado como completo.

#### Scenario: Rango sin cotizaciones
- **WHEN** el proveedor no devuelve velas
- **THEN** SHALL mostrar el periodo vacío sin generar velas ficticias.
