# Periodo visible de mercado
Requisito aclarado por Roberto: el selector controla el periodo total, no la duración de cada vela.
Implementación asistida por Codex. Sin atribución manual ni órdenes de broker.

Antes: periodo multiplicado por cantidad de velas, con agregaciones mensuales/anuales.
Después: fechas start/end de 24 horas, 7 días o meses naturales; agregación automática 15Min, 1Hour o 1Day. Se retira el límite editable y se pide hasta 1000 velas, suficiente para las ventanas soportadas.
Las ventanas terminan 16 minutos antes del momento de consulta. En días sin mercado puede no haber datos; no se amplía el rango silenciosamente.

Pruebas: 8 del cálculo de periodos y 27 de Quant, todas aprobadas. Incluye ajuste de fin de mes y rechazo de intervalos no admitidos. Sintaxis de scripts verificada. No se ha verificado visualmente en navegador ni se ha realizado una consulta real nueva para este cambio.

Esta aclaración amplía intencionalmente la lista de intervalos técnicos del primer cambio OpenSpec con 15Min y 1Hour. La evidencia del primer cambio documenta el comportamiento de aquel momento; no se debe usar como descripción del contrato actual. El rechazo de valores desconocidos permanece.
