# Proposal
## Why
La auditoría funcional identificó órdenes multileg inválidas, setups e ingestiones simulados, estados de BD incompatibles con la documentación y disponibilidad basada solo en procesos. El usuario solicita completar y probar el código.
## What Changes
- Corregir formato multileg y validaciones, limitar ejecución de broker a Paper y evitar dobles envíos en automatización.
- Persistir setups mediante Spread Service/Supabase con sesión y reemplazar ingestión ficticia por descarga normalizada persistida localmente.
- Usar estados documentados draft/evaluated/archived y mantener alias de entrada compatibles.
- Comprobar /health real; estabilizar errores, cálculo de IV, inputs financieros y UI.
- Ejecutar regresión, comprobaciones HTTP, auditoría de dependencias y smoke de solo lectura.
## Capabilities
### New Capabilities
- complete-project-flows: contratos operativos coherentes en el proyecto integrado.
### Modified Capabilities
Ninguna principal archivada.
## Impact
Microservicios y GUI. No migraciones, no órdenes reales durante pruebas y ninguna escritura en Supabase real sin sesión de usuario. Los artefactos anteriores describen sus etapas; esta propuesta documenta la evolución.
