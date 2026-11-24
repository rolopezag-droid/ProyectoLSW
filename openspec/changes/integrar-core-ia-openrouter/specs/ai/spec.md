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
