## ADDED Requirements

### Requirement: Intervalos explícitos permitidos
El endpoint GET /api/v1/broker/candles SHALL aceptar únicamente 1Day, 1Week, 1Month, 3Month, 6Month y 12Month cuando timeframe se proporciona.

#### Scenario: Consulta con intervalo permitido
- **WHEN** el cliente consulta AAPL con timeframe=1Week y el broker responde correctamente
- **THEN** la API responde HTTP 200 y transmite 1Week al adaptador sin sustituirlo

#### Scenario: Consulta con intervalo inválido
- **WHEN** el cliente proporciona timeframe=1Hour, un valor desconocido o una cadena vacía
- **THEN** la API responde HTTP 400 con message explicativo y no consulta al broker

### Requirement: Intervalo predeterminado
La API SHALL usar 1Day únicamente cuando timeframe está ausente.

#### Scenario: Consulta sin intervalo
- **WHEN** el cliente consulta AAPL sin el parámetro timeframe
- **THEN** la API consulta al adaptador con 1Day

### Requirement: Parámetros repetidos
La API SHALL rechazar un timeframe que no sea una cadena única.

#### Scenario: Intervalo repetido
- **WHEN** el cliente envía timeframe=1Day&timeframe=1Week
- **THEN** la API responde HTTP 400 sin consultar al broker

