## ADDED Requirements
### Requirement: Interpretación optativa
La GUI SHALL enviar a OpenRouter solo resúmenes de cores seleccionados mediante backend y acción explícita.
#### Scenario: Módulo desmarcado
- **WHEN** IA no está seleccionada
- **THEN** no consulta el endpoint ni muestra resultados previos.
### Requirement: Configuración y errores
El backend SHALL proteger su clave y manejar proveedor no disponible sin interrumpir los demás cores.
#### Scenario: Sin clave o modelo
- **WHEN** falta configuración
- **THEN** devuelve IA no disponible sin contactar al proveedor.
### Requirement: Prompt y respuesta
El sistema SHALL usar prompt editable y validar la respuesta estructurada antes de mostrarla.
#### Scenario: Respuesta inválida
- **WHEN** el proveedor devuelve JSON incompleto o error
- **THEN** informa el fallo sin inventar interpretación ni modificar el ranking.

### Requirement: Diagnóstico de configuración
El backend SHALL detectar valores de ejemplo sin consultar OpenRouter y el cliente SHALL distinguir endpoint ausente de fallo del proveedor.
#### Scenario: Plantilla copiada literalmente
- **WHEN** se configuran tu_clave y un identificador de ejemplo
- **THEN** informa que debe usarse una clave real y un modelo válido sin consumir una llamada.
#### Scenario: Backend antiguo
- **WHEN** el endpoint devuelve HTTP 404
- **THEN** el cliente explica que se debe reiniciar o actualizar el backend, sin atribuirlo al modelo.

### Requirement: Ausencias verificadas
El backend SHALL limitar los datos faltantes a campos de cores seleccionados y rechazar interpretaciones truncadas.
#### Scenario: Ausencia inventada
- **WHEN** el modelo menciona noticias como faltantes pero no se seleccionaron
- **THEN** la lista de datos faltantes se obtiene del resumen validado y excluye noticias.
#### Scenario: Respuesta cortada
- **WHEN** OpenRouter informa finish_reason length
- **THEN** se informa respuesta incompleta sin publicar interpretación.

### Requirement: Encabezados consecutivos del análisis
Los bloques visibles MUST mostrar encabezados uniformes y numeración consecutiva, incluyendo IA. Ocultar un core MUST eliminarlo de la secuencia sin modificar el ranking ni solicitar datos.

#### Scenario: Selección parcial de cores
- **WHEN** se muestran solo algunos cores y la comparación
- **THEN** sus encabezados siguen el orden visual sin saltos e incluyen IA cuando está seleccionada
