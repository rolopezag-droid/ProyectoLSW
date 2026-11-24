## ADDED Requirements
### Requirement: Core independiente
El sistema SHALL ofrecer indicadores y señales como módulo independiente del técnico.
#### Scenario: Indicadores sin técnico
- **WHEN** solo se selecciona indicadores
- **THEN** consulta velas, calcula señales cerradas, muestra su panel y aporta score por dirección sin exigir tendencia técnica.
#### Scenario: Desmarcar
- **WHEN** indicadores está desmarcado
- **THEN** no aporta score ni panel ni señales gráficas.
### Requirement: Evidencia y límites
Las señales SHALL incluir fecha, regla y dirección sin ejecutar operaciones.
#### Scenario: Historia corta
- **WHEN** hay menos de 50 velas cerradas válidas
- **THEN** informa insuficiencia y no inventa score.
#### Scenario: Sin eventos recientes
- **WHEN** hay historial suficiente sin eventos en las últimas cinco velas
- **THEN** informa neutralidad 50 sin afirmar una señal de compra o venta.

### Requirement: Lectura comprensible
La GUI SHALL mostrar primero conclusión, eventos en lenguaje sencillo e implicación para Bull/Bear, con fórmulas desplegables.
#### Scenario: Señales contrapuestas
- **WHEN** una señal alcista y una bajista se compensan
- **THEN** explica señales contrapuestas y que 50/50 es empate de puntuación, no probabilidad de ganar.

### Requirement: Relato de eventos
El panel SHALL explicar en orden cronológico qué pasó primero y después y su significado para Bull/Bear.
#### Scenario: Eventos contrapuestos
- **WHEN** se detecta debilidad y después recuperación
- **THEN** relata ambos y explica que el mismo peso produce un empate de puntos, no de probabilidad.
