## 1. Auditoría
- [x] 1.1 Revisar código, documentación externa y ejecutar regresión inicial (86 pruebas).
## 2. Correcciones
- [x] 2.1 Corregir órdenes y automatización, sin ejecutar operaciones reales.
- [x] 2.2 Completar setups e ingestión con almacenamiento explícito.
- [x] 2.3 Corregir persistencia, disponibilidad y validaciones/UI.
- [x] 2.4 Actualizar dependencias afectadas sin saltos mayores forzados.
## 3. Verificación
- [x] 3.1 Ejecutar pruebas unitarias, integración HTTP local y smoke de lectura.
- [x] 3.2 Documentar resultados, límites y pasos de ejecución.

## 4. Mensajes de registro
- [x] 4.1 Mostrar carga, confirmación requerida, éxito y errores accionables sin credenciales.
- [x] 4.2 Probar respuestas Auth y flujos de interfaz, incluyendo servidor anterior y fallos de conexión.
- [x] 4.3 Validar precio antes de autenticar, mostrar resultado de guardado y probar credenciales rechazadas y reintento parcial sin duplicar el padre.
- [x] 4.4 Consultar la acción al cotizar opciones, completar referencia Bid/Ask y probar las cuatro estrategias, cotizaciones inválidas y cambio de empresa durante la petición.
- [x] 4.5 Incorporar última operación fechada como alternativa a cotización incompleta; verificar precio cero, fecha ausente, error y consulta real de solo lectura.
- [x] 4.6 Implementar mostrar/ocultar contraseña, pantallas de recuperación y nueva contraseña, endpoints verificados con Auth y retorno desde el gateway.
- [x] 4.7 Probar recuperación con Auth simulado y revisar visualmente ambas pantallas en navegador; cerrar el servidor temporal.
- [x] 4.8 Actualizar draft a evaluated tras persistir evaluación, conservar archived y advertir de fallos parciales; probar y corregir únicamente el registro existente autorizado.
