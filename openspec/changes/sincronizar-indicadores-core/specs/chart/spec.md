## ADDED Requirements
### Requirement: Selección coherente de indicadores
La GUI SHALL sincronizar indicadores técnicos de gráfica y el core técnico.
#### Scenario: Activar SMA con core apagado
- **WHEN** el usuario selecciona SMA con el core desmarcado
- **THEN** se activa el core y la curva se dibuja con velas suficientes sin nueva consulta.
#### Scenario: Apagar core
- **WHEN** el usuario desmarca el core técnico
- **THEN** se desmarcan sus capas y señales y se retiran del SVG; último cierre no cambia.
#### Scenario: Último cierre
- **WHEN** se selecciona solo último cierre con core apagado
- **THEN** se muestra su línea sin activar el core técnico.
