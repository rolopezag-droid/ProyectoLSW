# Proposal

## Why

La pantalla de investigación calcula indicadores técnicos y probabilidades históricas, pero no identifica zonas de soporte/resistencia ni permite elegir qué módulos alimentan su explicación. El cambio permitirá entender qué datos y reglas sustentan cada estrategia y mantener las probabilidades de modelos distintos claramente separadas.

## What Changes

- Añadir selectores para Black-Scholes, análisis técnico, fundamentales FMP y contexto de mercado.
- Detectar y mostrar zonas de soporte/resistencia a partir de pivotes confirmados y velas Alpaca.
- Producir un resumen determinista que enumere las señales, datos, filtros y módulos usados.
- Separar probabilidades Black-Scholes y frecuencias históricas, indicando método y muestra.
- Consultar fundamentales con la API de FMP desde el servidor, manteniendo la clave fuera del navegador.
- Clasificar cambio diario entre los tickers elegidos con velas Alpaca; el plan gratuito de FMP no incluye el screener global.
- Guardar en el snapshot de la bitácora los módulos elegidos y la evidencia disponible.

## Capabilities

### New Capabilities
- `integrated-market-research`: selección y explicación de módulos técnico, financiero, opciones y contexto de mercado.
- `support-resistance-analysis`: detección, agrupación y estado de zonas de soporte y resistencia.

### Modified Capabilities
- Ninguna.

## Impact

- GUI: `services/gui-service/public/index.html`, `research-ui.js` y `research-analysis.js`.
- No requiere cambios al Quant Service ni al esquema de base de datos; FMP se consulta desde el GUI Service y la clave se configura en `.env`.
- README y especificaciones OpenSpec para documentar disponibilidad de datos y límites.
- No se agregan dependencias si los cálculos pueden implementarse sobre las velas actuales.
