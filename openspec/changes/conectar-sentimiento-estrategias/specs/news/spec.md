## ADDED Requirements
### Requirement: Confluencia de noticias
El sistema SHALL explicar coincidencia y contradicción entre noticias del ticker y dirección de la candidata.
#### Scenario: Noticia contraria
- **WHEN** noticias bajistas recientes pertenecen al ticker de una candidata Bull
- **THEN** se identifica contradicción sin modificar sus cálculos ni score.
#### Scenario: Conflicto
- **WHEN** existen noticias alcistas y bajistas
- **THEN** se muestran señales mixtas sin preferir una dirección.
#### Scenario: Sin datos
- **WHEN** faltan noticias válidas o el core está desmarcado
- **THEN** no se infiere sentimiento ni se usan noticias de otras empresas.

### Requirement: Mensaje inequívoco para mezcla
El sistema SHALL distinguir artículos con sentimientos opuestos de contradicción con una estrategia.
#### Scenario: Las cuatro estrategias con noticias mixtas
- **WHEN** hay artículos alcistas y bajistas del ticker
- **THEN** las cuatro muestran noticias mixtas sin afirmar oposición a las cuatro.

### Requirement: Etiqueta específica por estrategia
La comparación SHALL indicar sentimiento y nombre de la estrategia de cada fila.
#### Scenario: Distintas estrategias de igual dirección
- **WHEN** aparecen Bull Call y Bull Put con noticias bajistas
- **THEN** cada fila identifica su propia estrategia y explica direcciones opuestas, sin reutilizar el nombre de otra candidata.
