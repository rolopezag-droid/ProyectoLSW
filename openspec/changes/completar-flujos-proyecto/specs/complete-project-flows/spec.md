## ADDED Requirements
### Requirement: Órdenes F3 coherentes
El broker SHALL construir verticales multileg de dos contratos con símbolos válidos, cantidades coherentes y precios límite netos, y rechazar peticiones inválidas antes de enviar.
#### Scenario: Spread de crédito
- **WHEN** se prepara un Bear Call válido con qty=1
- **THEN** se construye order_class=mleg, qty=1, ratio_qty=1 por pata y límite negativo de crédito
#### Scenario: Stop por pata
- **WHEN** se solicita un stop multileg no soportado
- **THEN** se rechaza explícitamente en vez de enviar una orden market
### Requirement: Funciones persistentes
La API SHALL guardar setups con sesión mediante Spread Service y realizar ingestiones reales de cadenas normalizadas en almacenamiento local.
#### Scenario: Setup sin sesión
- **WHEN** se intenta crear un setup sin token
- **THEN** responde 401 sin escribir
#### Scenario: Ingestión
- **WHEN** se solicita una cadena válida
- **THEN** descarga páginas y guarda un snapshot o comunica un error, sin responder queued ficticio
### Requirement: Disponibilidad real
La UI SHALL distinguir proceso iniciado de /health disponible.
#### Scenario: Servicio sin respuesta
- **WHEN** un proceso existe pero no responde health
- **THEN** el indicador no se presenta como listo
### Requirement: Persistencia compatible y errores claros
El sistema SHALL aceptar estados canónicos documentados y validar entradas financieras; las sesiones y escrituras permanecen sujetas a RLS.
#### Scenario: Entrada financiera inválida
- **WHEN** se envían precios negativos o iteraciones inválidas
- **THEN** responde 400 sin resultados no finitos ni bucles no acotados


### Requirement: Registro del usuario
La interfaz SHALL permitir que el usuario solicite su registro por correo sin guardar su contraseña y sin crear cuentas automáticamente durante las pruebas.
#### Scenario: Confirmación requerida
- **WHEN** Supabase acepta un registro sin devolver sesión
- **THEN** la interfaz indica confirmar el correo antes de guardar

### Requirement: Resultado visible del registro
El registro SHALL mostrar estado de carga y un resultado persistente y accesible, además de un aviso fijo, sin exponer credenciales. Los errores del proveedor SHALL traducirse a mensajes concretos y los fallos de red no SHALL presentarse como creación confirmada.
#### Scenario: Registro con sesión
- **WHEN** Supabase devuelve usuario y sesión
- **THEN** la API informa registered y la interfaz confirma la cuenta, limpia la contraseña y restaura el botón
#### Scenario: Registro rechazado o servidor anterior
- **WHEN** se recibe un error de registro, HTTP 404 o una respuesta HTML
- **THEN** la interfaz muestra un error útil y restaura el botón sin afirmar que la cuenta se creó
#### Scenario: Espera o conexión interrumpida
- **WHEN** la solicitud está pendiente o vence su tiempo de espera
- **THEN** muestra el progreso y después indica que no pudo confirmar el registro, sin reintentar automáticamente

### Requirement: Guardado con resultado visible
La interfaz SHALL validar el precio del subyacente antes de autenticar, mostrar progreso de sesión y guardado y comunicar el resultado mediante texto persistente y aviso fijo. Los errores de credenciales SHALL distinguirse de fallos de conexión. Un fallo después de crear el padre SHALL conservar su ID y no duplicarlo al reintentar la evaluación.
#### Scenario: Sesión rechazada
- **WHEN** la contraseña no permite iniciar sesión
- **THEN** se muestra el error y no se solicita crear el spread
#### Scenario: Guardado parcial
- **WHEN** el padre fue creado pero falla la evaluación
- **THEN** se informa su ID y el reintento guarda únicamente la evaluación

### Requirement: Referencia del subyacente desde Alpaca
Al consultar opciones, la GUI SHALL consultar también la cotización de la acción y completar el precio para guardar con el promedio de Bid y Ask válidos. SHALL identificarlo como referencia y descartar el valor anterior al cambiar contexto o fallar una nueva consulta. Una respuesta de otro contexto no SHALL sobrescribir la selección actual.
#### Scenario: Cotización disponible
- **WHEN** Alpaca devuelve Bid y Ask positivos, finitos y no cruzados para el ticker seleccionado
- **THEN** completa el precio con su promedio e indica la fuente
#### Scenario: Cotización no disponible
- **WHEN** falta cotización válida o cambia el ticker durante la consulta
- **THEN** no reutiliza el precio anterior ni el de otra empresa
#### Scenario: Cotización sin contraparte
- **WHEN** falta Bid o Ask válido y Alpaca proporciona una última operación con precio positivo y fecha válida
- **THEN** utiliza esa operación como referencia e indica su fecha, sin presentarla como cotización en tiempo real

### Requirement: Recuperación de contraseña y visibilidad
La aplicación SHALL ofrecer una pantalla para solicitar recuperación y otra para establecer y confirmar una contraseña nueva. Las entradas SHALL permitir mostrar/ocultar sin perder el contenido. El backend SHALL verificar la sesión o token de recuperación con Supabase antes de cambiar la contraseña; no SHALL usar privilegios administrativos ni guardar credenciales en disco o almacenamiento del navegador.
#### Scenario: Solicitud de recuperación
- **WHEN** se proporciona un correo válido
- **THEN** se solicita resetPasswordForEmail con destino fijo de la aplicación, mostrando aceptación genérica sin revelar existencia de usuarios
#### Scenario: Enlace válido
- **WHEN** el usuario abre un enlace recovery y escribe dos contraseñas coincidentes
- **THEN** se verifica la sesión y se cambia la contraseña con updateUser, sin devolver credenciales en la respuesta final
#### Scenario: Enlace inválido o vencido
- **WHEN** faltan datos de recuperación o Supabase los rechaza
- **THEN** se muestra una pantalla útil para solicitar otro enlace y no se cambia ninguna contraseña
#### Scenario: Retorno al gateway anterior
- **WHEN** Supabase redirige a la raíz del gateway configurada previamente
- **THEN** se redirige a la pantalla de autenticación del GUI conservando el fragmento del enlace

### Requirement: Estado posterior a evaluación persistida
El servicio SHALL cambiar de draft a evaluated solamente después de guardar la evaluación correctamente. No SHALL reabrir un spread archived. Si la evaluación se guardó y falla actualizar el estado, SHALL devolver el resultado con una advertencia explícita para evitar duplicar evaluaciones al reintentar.
#### Scenario: Evaluación guardada
- **WHEN** se guarda correctamente una evaluación de un spread draft
- **THEN** el servicio actualiza su estado a evaluated y su updated_at
#### Scenario: Evaluación rechazada
- **WHEN** falla el guardado de la evaluación
- **THEN** no modifica el estado del spread
#### Scenario: Spread archivado
- **WHEN** se evalúa un spread archived
- **THEN** conserva archived
