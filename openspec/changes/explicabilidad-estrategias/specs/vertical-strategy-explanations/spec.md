# Spec Delta

## Purpose
Explicar y validar las candidatas de spreads verticales utilizando la evidencia y los cálculos ya disponibles en el proyecto.

## ADDED Requirements

### Requirement: Evidencia de candidata
El sistema SHALL mostrar contexto, contratos, patas, primas, riesgos y motivos reales de una candidata del ranking sin inventar criterios.

#### Scenario: Candidata seleccionada
- **WHEN** se selecciona una candidata visible
- **THEN** SHALL distinguir condiciones favorables y desfavorables, procedencia de cada pata y datos no disponibles.

### Requirement: Verificación financiera
El sistema SHALL validar la identidad y cotizaciones de las patas y contrastar los resultados con el evaluador vertical existente antes de presentar los cálculos como verificados.

#### Scenario: Resultado coherente
- **WHEN** Quant evalúa una candidata con datos verificables y sus resultados coinciden con el ranking
- **THEN** SHALL mostrar sus cálculos, unidades, cantidad y multiplicador provenientes del evaluador.

#### Scenario: Datos ausentes o discrepancia
- **WHEN** faltan datos, las cotizaciones no son válidas o Quant discrepa del ranking
- **THEN** SHALL indicar el motivo y SHALL NOT presentar la candidata como validada.

### Requirement: Transparencia del score
El sistema SHALL explicar los factores, filtros, truncamiento y desempates que utiliza el ranking existente, distinguiendo contexto de factores efectivos.

#### Scenario: Puntaje disponible
- **WHEN** una candidata tiene puntuación
- **THEN** SHALL mostrar la fórmula real, sus factores y la comparación con candidatas vecinas sin introducir pesos nuevos.

#### Scenario: Puntaje no calculable
- **WHEN** faltan muestras o el factor técnico requerido
- **THEN** SHALL mostrar el score como no disponible y explicar la causa.

### Requirement: Comparación de estrategias
El sistema SHALL comparar las cuatro estrategias con las candidatas existentes y los filtros vigentes, indicando el alcance de la comparación.

#### Scenario: Estrategia sin candidata visible
- **WHEN** una estrategia no aparece entre las candidatas disponibles
- **THEN** SHALL mostrar que no hay candidata visible sin inventar métricas ni afirmar ausencia en toda la cadena.

#### Scenario: Mejor puntuación
- **WHEN** existen candidatas comparables
- **THEN** SHALL identificar la mejor según el ranking disponible y aclarar que no garantiza rentabilidad ni seguridad.

### Requirement: Contexto actualizado
El sistema SHALL descartar o actualizar explicaciones cuando cambien ticker, vencimiento, filtros, módulos o candidata.

#### Scenario: Cambia el contexto durante una petición
- **WHEN** llega una respuesta de evaluación para una selección anterior
- **THEN** SHALL NOT mostrarla como resultado de la selección actual.

### Requirement: Protección de funcionalidades financieras
La explicabilidad SHALL NOT cambiar evaluadores, selección, score, Black-Scholes, griegas, IV u órdenes y SHALL NOT enviar operaciones.

#### Scenario: Usuario consulta explicaciones
- **WHEN** se abre o compara una candidata
- **THEN** SHALL usar solo endpoints de lectura/evaluación y SHALL NOT crear órdenes.
