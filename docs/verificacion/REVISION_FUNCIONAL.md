# Revisión funcional de ProyectoLSW

## Verificación de entrega: 2026-11-07
Suite completa `npm test`: 150 pruebas aprobadas, cero fallidas. Ejecución previa a preparar el commit de esta entrega. Se confirmó por lectura SQL el primer guardado real del usuario: un spread, dos patas y una evaluación. Tras autorización se corrigió únicamente su estado a evaluated y se comprobó de nuevo. Las verificaciones históricas descritas abajo conservan el alcance y resultados que tenían en su fecha; no deben interpretarse como limitaciones de acceso que sigan sin resolverse.

## Seguimiento del registro: 2026-11-07
Estado después de evaluar: SpreadService.evaluate cambia draft a evaluated solo después de insertar correctamente la evaluación. El UPDATE se restringe al propietario, estado draft y registro no eliminado; conserva archived. Si falla esa segunda operación, devuelve la evaluación con advertencia en lugar de provocar un reintento que duplique la instantánea. La UI muestra estado o advertencia. Pruebas específicas de persistencia e interfaz: 36 aprobadas, cero fallidas. Se corrigió con autorización exclusivamente el estado del spread existente d358d9b2-1193-4a1f-b307-d77271c79a73, que tenía dos patas y una evaluación; lectura posterior confirmó evaluated, dos patas y una evaluación, sin crear registros ni alterar cálculos.
Recuperación: /auth/recuperar.html solicita un enlace; /auth/restablecer.html recibe sesión recovery o token_hash y ofrece contraseña y confirmación con Mostrar/Ocultar. El dashboard también permite mostrar su contraseña y abre recuperación en otra pestaña para conservar la estrategia. Endpoints POST /api/supabase/password-reset y /password-reset/confirm utilizan resetPasswordForEmail, setSession/verifyOtp y updateUser, sin claves administrativas. El destino procede de APP_PUBLIC_URL o http://localhost:3005, nunca del Host aportado por el cliente. No-store, no-referrer y CSP en pantallas Auth; se limpian fragmento/query del historial y los secretos solo permanecen en memoria hasta finalizar. Se verifica el enlace antes del cambio y se intenta cerrar la sesión de recuperación local al terminar.
Compatibilidad: GET / del gateway redirige con 303 al GUI; el navegador conserva el fragmento de autenticación cuando Location no incluye otro fragmento. Se añade manejo del retorno al dashboard. Para despliegue, configurar APP_PUBLIC_URL y autorizar /auth/restablecer.html en Redirect URLs de Supabase. No se cambió la configuración remota durante esta intervención.
Verificación: 56 pruebas GUI aprobadas, cero fallidas. Incluyen credenciales ausentes, enlace rechazado, contraseñas diferentes, límite de correo, cambio exitoso simulado, token_hash, visibilidad y limpieza de URL. Ambas pantallas se inspeccionaron visualmente en el navegador integrado con un servidor temporal en 127.0.0.1:4515, cerrado al terminar. No se enviaron correos reales ni se restableció la contraseña del usuario durante la verificación; el flujo completo por correo real se comprobará cuando el usuario lo solicite desde la interfaz.
Contratos consultados: https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail, https://supabase.com/docs/reference/javascript/auth-setsession y https://supabase.com/docs/reference/javascript/auth-updateuser.
Caso real de referencia sin Ask: la ruta respondió Bid=328.06 y Ask=0 para AAPL, por lo que no era válido calcular un promedio. El adaptador ahora consulta /v2/stocks/{symbol}/trades/latest como alternativa y devuelve referencePrice/referenceSource/referenceTimestamp. La interfaz identifica la última operación y muestra su fecha sin prometer tiempo real. Consulta real de solo lectura: referencia AAPL=342.41, timestamp 2026-11-06T20:59:57.566180707Z; valor histórico observado durante la revisión. Pruebas específicas de adaptador e interfaz: 35 aprobadas, cero fallidas. No se escribieron datos ni se enviaron órdenes. Fuente del contrato: https://docs.alpaca.markets/us/reference/stocklatesttradesingle-1.
Autollenado del subyacente: consultar opciones solicita también GET /api/v1/broker/quotes para el ticker seleccionado. El campo de guardado recibe el promedio Bid/Ask válido, redondeado a centavos e identificado como referencia Alpaca con timestamp cuando existe. No se presenta como última operación ni precio garantizado en tiempo real. Se limpia al cambiar contexto o ante cotización inválida; una petición anterior no sobrescribe otra empresa. Se conserva entrada manual si no hay cotización. Regresión de GUI: 46 pruebas aprobadas, cero fallidas, con proveedor simulado. Sin escrituras ni órdenes reales; reiniciar y recargar para utilizar el cambio.
Seguimiento de guardado: el precio del subyacente se valida antes de iniciar sesión; progreso y resultado se muestran tanto en texto persistente como en aviso fijo. Se distinguen credenciales inválidas y correo sin confirmar. Hay timeout por petición y los resultados inciertos piden comprobar registros antes de reintentar. Se conserva el ID del padre cuando falla la evaluación. Regresión posterior de GUI: 42 pruebas aprobadas, cero fallidas; incluye cuatro pruebas adicionales de sesión, precio obligatorio y guardado parcial. Sin escrituras en Supabase real.
Se agregó progreso visible, resultado persistente accesible y aviso fijo al crear una cuenta. El botón bloquea solicitudes duplicadas y recupera su estado al finalizar. La interfaz diferencia confirmación de correo, sesión creada, rechazo, servidor anterior/HTML y error de conexión o timeout, sin afirmar creación cuando el resultado es incierto. Se aclararon las etiquetas de cuenta de la aplicación. La API traduce códigos de error de Auth sin filtrar detalles internos; responde 201 con sesión, 202 cuando se requiere confirmar y error ante respuesta incompleta.
Verificación: `node --test services/gui-service/test/*.test.js`, 38 aprobadas y cero fallidas, con Auth simulado y servidores locales temporales. Incluye 10 pruebas nuevas de API/interfaz. No se crearon cuentas, no se cambió la configuración de Supabase y no se enviaron correos durante estas pruebas. Es necesario reiniciar el servidor existente y recargar la página para utilizar el cambio.

Fecha de intervención: 2026-11-06, America/Mazatlan. Responsable Roberto, con asistencia IA de Codex. Cambios locales; no se han enviado órdenes ni creado cuentas reales.

## Cambios de código

| Flujo | Resultado de la revisión |
|---|---|
| Arranque | npm start inicia GUI y cinco servicios. npm run dev es alias de arranque. Validación de puertos y cierre de procesos propios. Enlace local 127.0.0.1. |
| Disponibilidad | Se consulta /health por HTTP con timeout y verificación de identidad del servicio. Spread verifica acceso a strategy_types; Catalog verifica conexión Mongo. El proceso iniciado no equivale a dependencia disponible. |
| Broker F3 | Constructor puro order-builder.js: OCC con fecha YYMMDD, dos patas del mismo activo/tipo/vencimiento, qty del spread, ratio_qty=1, intenciones de apertura, límite neto firmado. Solo Paper, no fallback market. |
| Automatización | Bloqueo de envíos simultáneos; client_order_id para intentos de la misma orden; detener ciclo tras errores de envío y cambios de contexto. Temporizador del navegador, no trabajo persistente en servidor. |
| Stop por pata | Se rechaza en el backend y se deshabilita en la interfaz: no se ofrece una protección inexistente para multileg. |
| Plantillas F3 | Build genera dos patas correctas y campos pendientes; se elimina la plantilla ficticia de una sola pata. Catálogo público acotado a las cuatro estrategias del equipo. |
| Setups | GET/POST utilizan Spread Service con la sesión del consumidor; persistencia en Supabase, no arreglos vacíos o IDs ficticios. |
| Ingestión | POST descarga páginas y guarda snapshot normalizado en .local-data/ingestions; GET por UUID recupera el snapshot. Sin cola simulada. Se informa storage=local-file. |
| Guardado | GUI crea draft. Estados documentados draft/evaluated/archived; active y closed son alias de entrada hacia evaluated y archived. No migración de BD. Se conservan contrato, Bid y Ask de la selección automática. |
| Registro | Botón Crear cuenta y endpoint /api/supabase/register. El usuario proporciona datos y confirma correo cuando Supabase lo requiere. Contraseñas sin persistencia en disco; respuestas no-store. |
| Precios/Greeks/IV | Validación de inputs, fechas, resultados finitos y modelo soportado. IV tiene iteraciones acotadas, límites de no arbitraje y Newton con respaldo por bisección. UI desbloquea el botón tras 422. |
| Selección automática | Call/put correcto, Ask/Bid, paginación y metadatos contractuales originales. No seleccionar contratos marcados no negociables. |
| GUI | Proxy del mismo origen para Quant; respeta configuración del servidor. Avisos fijos y protección de historial local. Modificar entradas invalida el resultado anterior. |
| Catálogos | Validación de actualizaciones, rechazo de operadores y errores 400/409/404 adecuados. Mantiene MongoDB, sin migraciones ni escrituras reales durante revisión. |
| Dependencias | Actualizaciones compatibles; nodemon reemplazado por node --watch. SDK Supabase fijado en Catalog. npm audit final: cero vulnerabilidades reportadas. |

## Compatibilidad
- POST de ingestión ahora responde 201 completed con snapshot, no 202 queued ficticio.
- Catálogo de tipos expone F3. Build requiere ticker, vencimiento y strikes reales.
- Estados devueltos por persistencia usan nombres canónicos de la documentación SQL del equipo. Confirmar contra la instancia real cuando vuelva a responder.
- Una respuesta accepted de Alpaca no confirma ejecución/llenado. La aplicación lo indica; no promete que una orden se haya llenado.

## Pruebas
- Regresión inicial: 86 pruebas aprobadas.
- Suite final: 115 pruebas aprobadas, cero fallidas; ver salida en tests.txt, incluye contratos de órdenes, controladores, HTTP local, sesiones y BD simuladas, cálculo financiero, ingestión con archivos temporales y flujo de interfaz con jsdom.
- Pruebas de UI simulan las cuatro estrategias, Paper sin dobles POST, errores de IV, tooltip de vela y guardado con una sesión falsa.
- Arranque real aislado: npm run test:startup inicia puertos 4200 a 4205, comprueba identidad del proceso y detiene solo los procesos creados por la prueba.
- Pruebas financieras verifican paridad put-call y recuperación de volatilidad conocida. No son recomendaciones de inversión.

## Comprobaciones reales de solo lectura
- Catálogos: HTTP 200 en instancia local existente.
- Alpaca: consulta de cinco velas de AAPL correcta.
- Cuenta configurada: host Paper, estado ACTIVE, trading no bloqueado y nivel de opciones 3. No se muestran identificadores ni saldos.
- Arranque temporal: Gateway, Catalog, Quant y Strategy responden health; Spread inicia, pero su dependencia Supabase no respondió al health.
- Supabase: consultas de lectura no completaron dentro del tiempo límite. No se verificó escritura real ni se creó un usuario. El usuario indicó que todavía no tiene cuenta.

## Límites de esta comprobación
Las pruebas simuladas no acreditan llenado de órdenes, escritura real autenticada, carga de producción ni disponibilidad futura de proveedores. El navegador integrado no pudo conectar a la instancia temporal; la interacción de scripts se verificó con jsdom, no mediante una inspección visual completa. La revisión automática rechazó temporalmente enlazar a 0.0.0.0 por exposición LAN; se corrigió usando 127.0.0.1 y se comprobó el acceso por HTTP.

## Uso
1. Si otra versión está ejecutándose, detenerla con Ctrl+C.
2. Ejecutar npm ci si se descargó esta revisión desde otra máquina.
3. Mantener .env local con las claves propias, excluido de Git.
4. Ejecutar npm start y abrir http://localhost:3005.
5. Para guardar: evaluar, introducir precio del subyacente, correo y contraseña. Si no existe cuenta, pulsar Crear cuenta y confirmar correo antes de guardar.
6. Supabase debe estar disponible, permitir registro por correo y contar con tablas/RLS del proyecto. Este cambio no altera su esquema.
7. Los snapshots de ingestión se almacenan localmente, no en Supabase; .local-data está excluida de Git.

## Reproducción
- npm test
- npm run test:startup
- npm audit
- npx openspec validate completar-flujos-proyecto --strict

## Fuentes de contratos
https://docs.alpaca.markets/us/reference/postorder
https://docs.alpaca.markets/us/docs/options-level-3-trading
https://supabase.com/docs/reference/javascript/auth-signup
https://supabase.com/docs/reference/javascript/auth-getuser
