# Design
La estructura local usa procesos hijos y puertos loopback. Reutilizarlos en una función remota no conecta servicios distribuidos. Se mantienen los seis paquetes, pero Vercel administra sus instancias y proporciona URLs privadas mediante bindings. Services es una capacidad Beta de Vercel.

GUI conserva autenticación y FMP. Gateway enruta /api/v1. Quant y Catalog añaden entrypoints de nube; los cores existentes no se reescriben. Catalog reutiliza una conexión MongoDB y responde 503 si falta una URI remota, sin sustituir datos reales por simulaciones.

Los secretos se suministran como variables del proyecto, nunca en vercel.json ni en el código. .env, .vercel y datos locales quedan excluidos de la carga. Las órdenes Paper y el saldo del broker requieren sesión en nube; las órdenes permanecen deshabilitadas salvo habilitación explícita y lista de usuarios permitidos. Las ingestiones en archivos quedan indisponibles en nube hasta definir almacenamiento durable.

Pruebas locales usan servidores temporales y respuestas simuladas. Verificación remota solo consulta estado, páginas, cotizaciones y cálculos; no modifica registros ni ejecuta órdenes. Cualquier dependencia no configurada se informa como pendiente.
