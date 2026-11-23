# Despliegue en Vercel

Proyecto: `brujin/proyectolsw`. Configuración en `vercel.json`: seis Services (Beta), bindings privados y API pública mediante Gateway. GUI publica sus archivos de `public/` en CDN y conserva autenticación/FMP. Las fórmulas no cambian.

## Reproducir
1. Instalar dependencias con `npm ci`.
2. Autorizar Vercel con `npx vercel@66.6.0 login`.
3. Vincular explícitamente: `npx vercel@66.6.0 link --yes --project proyectolsw --scope brujin`.
4. Confirmar destino con `npx vercel@66.6.0 project inspect --non-interactive`.
5. Configurar secretos de producción usando el panel o `node scripts/configure-vercel-env.cjs`. El helper lee el `.env` local sin imprimir valores; omite MongoDB si apunta a localhost. No sube `.env` ni el token de Vercel.
6. Ejecutar pruebas de despliegue y después `npx vercel@66.6.0 deploy --prod --scope brujin`.
7. Comprobar dashboard, `/health`, `/api/services/status`, cotizaciones y evaluación. No enviar órdenes ni modificar registros para validar.

## Dependencias externas
- MongoDB necesita URI remota y acceso de red para Vercel. No se crea ni modifica una base en este cambio.
- Supabase debe permitir como redirect de Auth la URL pública seguida de `/auth/restablecer.html`; ajustar Site URL cuando corresponda. No utilizar localhost en correos del entorno publicado.
- Alpaca y FMP requieren sus claves como variables de servidor. Conservar feeds configurados según el plan del proveedor.
- Las órdenes Paper están deshabilitadas por defecto en nube. Habilitarlas requiere `PAPER_TRADING_ENABLED=true`, lista `BROKER_ALLOWED_USER_IDS` y sesión válida. La publicación no autoriza enviar órdenes.
- Las ingestiones a archivos no están disponibles en nube: requieren un almacenamiento durable definido. Los CRUD Supabase utilizan sus tablas reales.
- No hay control público de procesos start/stop: Vercel administra las instancias.

## Evidencia
El despliegue parte de `88612ff` con cambios locales de adaptación. El URL y las comprobaciones efectivas se registran al terminar; no afirmar que un health correcto valida escrituras o una base no configurada.

### Resultado del 20 de noviembre de 2026
- URL pública: https://proyectolsw.vercel.app
- Proyecto: `brujin/proyectolsw`; destino production; estado READY.
- Deployment: `dpl_6GGXW4nKQBLWM1hNGWip9GSMPfSL`; compilación 28 segundos. Se probó antes de promoverlo a producción.
- Framework de los servicios: Express, con Services Beta y bindings. No se utiliza el lanzador de procesos local en nube.
- `/`, `/health`, `/api/services/status` y `/auth/recuperar.html`: HTTP 200 sin sesión de Vercel. El alias `proyectolsw-brujin.vercel.app` conserva protección de Vercel; compartir el dominio público anterior.
- GUI, Gateway, Quant, Strategy y Spread saludables. Spread comprobó lectura de `strategy_types`; no se crearon registros de prueba.
- Alpaca: cotización AAPL con referencia de última transacción; cadena/selector con 102 strikes; velas históricas recibidas.
- Navegador: periodo de un año cargó 251 velas diarias y 67 señales, consulta completa. El despliegue conserva el defecto previo de doble signo negativo en la tarjeta porcentual; no se corrigió como parte de esta adaptación.
- FMP: respuesta available con métricas AAPL; no se publicaron claves en el cliente.
- Evaluación de ejemplo Bull Call 100/105, primas 4/2: pérdida 200, ganancia 300, equilibrio 102.
- Pruebas específicas de despliegue y regresiones de acceso: 19/19 aprobadas. No representa la aprobación de la suite completa preexistente.
- OpenSpec: `desplegar-vercel --strict` válido.
- Archivos de carga comprobados contra secretos del .env: sin coincidencias; .env, .vercel, datos locales y documentación excluidos de la carga.
- Logs de runtime: tres entradas clasificadas como error contenían advertencias DEP0060 de `util._extend` del proxy; las peticiones verificadas respondieron correctamente. No se configuró un servicio externo de monitorización.

### Pendientes concretos
1. MongoDB local no es accesible desde Vercel: `/api/v1/catalogs` responde 503 explícito. Configurar una URI remota autorizada antes de dar el catálogo por funcional.
2. Añadir la URL pública de recuperación a la configuración Auth de Supabase y probar el recorrido con la cuenta del usuario; no se modificó configuración remota de Auth en esta tarea.
3. Guardado autenticado real no probado por no usar contraseñas del usuario; la conexión Supabase sí responde al health.
4. Paper permanece deshabilitado en nube; no se enviaron órdenes. Las ingestiones en archivos también permanecen indisponibles hasta definir almacenamiento durable.
5. Auditoría de dependencias de producción: Mongoose instalado 9.10.1 tiene una vulnerabilidad alta reportada; existe corrección compatible desde 9.11.4. Se registró sin cambiar versiones del equipo fuera de este despliegue.
6. Vercel aún no está conectado a GitHub para despliegue automático; la publicación se hizo con CLI desde este checkout. Los cambios locales de despliegue no se han subido al repositorio.

La compilación local de Vercel en Windows falló por permisos de enlaces simbólicos de su caché. Se usó compilación remota en Vercel, que terminó correctamente. La primera compilación remota mostró dependencias compartidas sin resolver; se corrigió instalando los workspaces desde la raíz y la versión final no tuvo esas advertencias.
