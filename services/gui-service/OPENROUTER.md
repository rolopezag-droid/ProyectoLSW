# Core de IA con OpenRouter

## Configuración

Agrega al `.env` de la raíz del repositorio:

```dotenv
OPENROUTER_API_KEY=tu_clave_de_openrouter
OPENROUTER_MODEL=identificador_del_modelo
```

El identificador se toma del catálogo de OpenRouter; elige uno compatible con `response_format: json_object`. No se fija un modelo ni se presupone que sea gratuito. La plantilla vacía está en `services/gui-service/.env.example`; no contiene una clave. Reinicia los servicios después de configurar variables. En Vercel las variables pertenecen al servicio GUI, no al navegador.

Prompt básico editable: `services/gui-service/prompts/core-ia.txt`. El backend lo lee antes de consultar y la caché incluye su contenido. Cambiar el prompt no altera las fórmulas de los demás cores.

## Uso

1. Selecciona los cores de datos que quieras analizar y activa Core de IA.
2. Ejecuta el análisis normal.
3. En Interpretación de IA elige una empresa visible.
4. Pulsa Enviar resumen e interpretar con IA.

No se generan llamadas automáticas por ticker del S&P. Seleccionar el core o filtrar resultados no consume por sí solo una llamada. La solicitud manual puede consumir saldo. El resumen incluye solo los cores marcados: tendencia, indicadores, scores fundamental/financiero, resultado Monte Carlo con estrategia identificada, movimiento y hasta tres titulares recientes si noticias está seleccionado. Las métricas de cartera, usuarios y credenciales no se incluyen. El backend vuelve a aplicar una lista de campos permitidos.

## Archivos y flujo

- `public/research-ai.js`: prepara el resumen y muestra texto, sin interpretar HTML del modelo.
- `public/research-ui.js`: entrega el snapshot visible y avisa cuándo se invalida.
- `src/server.js`: POST `/api/research/ai`, respuesta sin caché HTTP y tamaño acotado.
- `src/openrouter-core.js`: valida entrada, selecciona campos, lee el prompt y consulta `https://openrouter.ai/api/v1/chat/completions`. La clave viaja solo en el encabezado Authorization del backend.
- `prompts/core-ia.txt`: instrucciones y contrato JSON para resumen, coincidencias, contradicciones, datos faltantes y conclusión.

La IA interpreta; no es un core de puntuación. No modifica el score, los resultados Monte Carlo, primas ni órdenes. Su texto puede contener errores y está rotulado como generado por IA. Si falta configuración, crédito, permiso o JSON válido, el panel informa indisponibilidad y conserva el análisis existente.

## Límites operativos

Timeout del proveedor 20 segundos, hasta 1000 tokens de salida, sin reintentos automáticos. Caché en memoria de 5 minutos, hasta 100 entradas. Una llamada activa e intervalo de 5 segundos por instancia; esto no es una cuota global multiinstancia ni autenticación para un servicio público. Antes de habilitar una clave en un despliegue público, establece un presupuesto/límite apropiado en el proveedor y el control de acceso que corresponda al despliegue. Nunca poner la clave en `public/`, GitHub ni en el prompt.

No se realizó consulta real a OpenRouter ni se gastó saldo al implementar. Pruebas: proveedor simulado para bearer, selección de campos, JSON inválido, errores de acceso/saldo y caché; UI para acción manual y exclusión; HTTP local para falta de configuración. Validar un modelo real requiere configurar clave y modelo.

Referencia oficial consultada: https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request
