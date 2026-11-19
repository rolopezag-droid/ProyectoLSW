# Spec Delta

## Purpose
Permitir revisar señales técnicas históricas explicables sin depender de estrategias de opciones ni operaciones ejecutadas.

## ADDED Requirements

### Requirement: Señales históricas causales
El sistema SHALL confirmar señales al cierre usando exclusivamente información disponible hasta ese cierre; las rupturas SHALL comparar con zonas y ATR previamente disponibles.

#### Scenario: Se agregan velas posteriores
- **WHEN** se recalcula la misma ventana inicial agregando velas futuras
- **THEN** las señales anteriores SHALL conservar fecha, regla y valores.

#### Scenario: Pivote aún no confirmado
- **WHEN** faltan velas posteriores para confirmar un pivote
- **THEN** el pivote SHALL quedar excluido de las zonas disponibles.

### Requirement: Reglas independientes y explicables
El sistema SHALL permitir seleccionar cruces SMA50 confirmados por SMA20, cruces RSI14 de 30 y 70 y rupturas de soporte/resistencia con buffer ATR14.

#### Scenario: Cruce válido
- **WHEN** se cumple una regla seleccionada al cierre de una vela diaria
- **THEN** SHALL mostrar ticker, fecha y hora, temporalidad, precio, indicador, tipo, valores, regla y explicación.

#### Scenario: Datos insuficientes
- **WHEN** no hay suficientes velas o no se cumple una regla
- **THEN** SHALL omitir la señal sin inventar valores.

### Requirement: Presentación diferenciada
La gráfica SHALL emparejar señales exclusivamente con el timestamp exacto de su vela y la tabla SHALL contener todas las señales seleccionadas, con búsqueda por fecha.

#### Scenario: Temporalidad intradía
- **WHEN** la gráfica no usa velas diarias
- **THEN** SHALL desactivar las señales diarias y explicar el motivo.

#### Scenario: Sin señales
- **WHEN** no existen eventos para las reglas y periodo seleccionados
- **THEN** SHALL mostrar «Sin señales para el periodo y las reglas seleccionadas».

### Requirement: Separación de órdenes
La interfaz SHALL distinguir señales técnicas, entradas y salidas de candidata y operaciones ejecutadas; el cálculo de señales SHALL NOT enviar órdenes.

#### Scenario: Consulta de señales
- **WHEN** el usuario calcula o filtra señales
- **THEN** SHALL NOT crear una orden en el broker.
