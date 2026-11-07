## ADDED Requirements
### Requirement: Paginación y filtro
La API SHALL transmitir el tipo de opción y token de página a Alpaca y devolver el siguiente token.
#### Scenario: Puts en páginas posteriores
- **WHEN** se selecciona Bull Put o Bear Put
- **THEN** se consultan puts y se recorren páginas hasta terminar, sin confundir truncamiento con ausencia de pares
### Requirement: Cotizaciones completas por página
El adaptador SHALL consultar las cotizaciones de todos los contratos de la página en bloques de hasta 100 símbolos.
#### Scenario: Página de 201 contratos
- **WHEN** Alpaca devuelve 201 contratos
- **THEN** se realizan tres consultas de cotizaciones y se preservan todos los contratos
### Requirement: Errores explicativos
La GUI SHALL diferenciar falta de contratos, cotizaciones utilizables y prima válida.
#### Scenario: Cotizaciones ausentes
- **WHEN** existen contratos sin dos cotizaciones utilizables
- **THEN** se indica la causa y no se evalúa con datos anteriores
