## ADDED Requirements
### Requirement: Periodo visible
La gráfica SHALL limitar la consulta a un día, una semana, uno, tres, seis o doce meses según la selección, independientemente del número de velas.
#### Scenario: Un mes
- **WHEN** se selecciona un mes
- **THEN** start y end abarcan un mes natural y timeframe es 1Day
#### Scenario: Un día
- **WHEN** se selecciona un día
- **THEN** start y end distan 24 horas y timeframe es 15Min
#### Scenario: Una semana
- **WHEN** se selecciona una semana
- **THEN** start y end distan 7 días y timeframe es 1Hour
### Requirement: Contrato del broker
La API SHALL aceptar 15Min y 1Hour además del catálogo anterior y mantener HTTP 400 para intervalos desconocidos.
#### Scenario: Agregación automática intradía
- **WHEN** la GUI consulta 15Min dentro del periodo de un día
- **THEN** el broker recibe 15Min sin sustitución
### Requirement: Información visible
La interfaz SHALL distinguir periodo y agregación y declarar el retraso de consulta.
#### Scenario: Cambio de periodo
- **WHEN** el usuario selecciona otro periodo
- **THEN** la gráfica consulta automáticamente ese periodo y muestra las fechas realmente obtenidas


### Requirement: Inspección de velas y márgenes
La gráfica SHALL mostrar fecha/hora, apertura, máximo, mínimo, cierre y volumen al pasar el cursor o enfocar una vela, sin superponer las etiquetas de ejes sobre las velas.
#### Scenario: Cursor sobre una vela
- **WHEN** el usuario pasa el cursor sobre una vela
- **THEN** aparece información de esa vela y se oculta al salir del área
#### Scenario: Extremos de la gráfica
- **WHEN** se dibujan la primera y última vela
- **THEN** quedan dentro del área de trazado y las etiquetas de precio se alinean fuera de ella
