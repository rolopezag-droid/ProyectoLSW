> Revisión funcional actual: [docs/verificacion/REVISION_FUNCIONAL.md](docs/verificacion/REVISION_FUNCIONAL.md). Incluye arranque, contratos actualizados, pruebas y límites externos. El texto histórico siguiente puede describir etapas anteriores.

> Integración local actual: consulta [INTEGRACION_SUPABASE.md](INTEGRACION_SUPABASE.md). El contrato Supabase de ese documento sustituye las referencias antiguas de MongoDB para Spread Service.

> Señales técnicas causales, rangos y paginación de velas: [docs/verificacion/SENALES_TECNICAS.md](docs/verificacion/SENALES_TECNICAS.md).

# Catalogos Microservices Demo

Demo de una aplicacion REST con Express organizada como microservicios.

## Feed de acciones en Alpaca

Quant consulta velas de acciones con `ALPACA_STOCKS_FEED=iex` por defecto, compatible con el nivel Basic. Para cuentas con permiso SIP se puede configurar `ALPACA_STOCKS_FEED=sip`. Valores admitidos: `iex`, `sip`, `delayed_sip`. Las cadenas de opciones conservan su configuración independiente `ALPACA_OPTIONS_FEED`.

Las noticias del análisis se consultan a Alpaca Market Data por los tickers analizados. Se muestran titulares, fuente, fecha y enlace. Quant agrega una clasificación heurística (alcista, bajista, mixta o sin señal clara) basada en frases reconocidas del titular y resumen, junto con las frases que motivaron la etiqueta. No es una interpretación completa del artículo ni un pronóstico, y no modifica el score de estrategias.

En el panel de investigación se pueden seleccionar por separado el análisis técnico, la simulación Monte Carlo, los fundamentales de Financial Modeling Prep (FMP), el cambio diario entre los tickers elegidos y las noticias. Monte Carlo simula 10,000 precios al vencimiento bajo un modelo lognormal (GBM) con volatilidad histórica realizada; presenta probabilidad simulada de P&L positivo, P&L esperado, mediano y percentiles 5/95, y puede participar en el ranking seleccionado. La semilla hace reproducible la secuencia aleatoria; el horizonte depende de la hora de consulta y puede cambiar los resultados entre ejecuciones. Es una estimación condicionada por volatilidad y tasas constantes; no modela comisiones, deslizamiento ni ejercicio anticipado, y no es una probabilidad garantizada. El análisis técnico detecta pivotes confirmados con tres velas posteriores, agrupa niveles cercanos con tolerancia de medio ATR y marca ruptura cuando el cierre atraviesa la zona por un cuarto de ATR. Los niveles son orientativos y dependen del periodo de velas.

La gráfica muestra velas, SMA 20/50/200 y barras de volumen, calculadas con OHLCV de Alpaca. También muestra marcadores opcionales de cruces RSI14, sin dibujar una curva de RSI. No requiere otra API ni una cuenta Finviz Elite.

Los fundamentales se consultan desde FMP en el servidor. Crea una cuenta gratuita en [FMP](https://site.financialmodelingprep.com/developer/docs/dashboard), copia la API key y configura `FMP_API_KEY` en `.env`; la clave nunca se entrega al navegador. Se consultan valoración, rentabilidad, deuda y crecimiento anual disponibles, con fecha del último reporte. El servicio conserva respuestas en caché durante seis horas. El plan gratuito limita las consultas diarias, los periodos y el universo de símbolos; datos no disponibles se muestran como tales. El core calcula un score fundamental de 0 a 100 con ocho indicadores y pesos visibles; requiere al menos 50% de cobertura y aporta al promedio en consultas manuales; en el S&P 500 se consulta después del Top y no cambia su orden. Es una heurística general sin calibración sectorial. No modifica las estimaciones histórica ni Monte Carlo, que permanecen separadas. El ranking de ganadores/perdedores usa el cambio diario de las velas Alpaca únicamente para los tickers ingresados, no para todo el mercado.

El comparador muestra frecuencia histórica de retornos pasados en ventanas traslapadas cuando se selecciona análisis técnico. Se retiró Black-Scholes como core independiente: ya no hay casilla, columna de probabilidad de modelo ni contribución al score. Las funciones cuantitativas de precios Black-Scholes, griegas y volatilidad implícita se conservan en Quant; este cambio no implementa ni sustituye un core financiero completo. La frecuencia histórica no es un pronóstico calibrado ni una recomendación. El score de spreads es una heurística orientativa.

## Estructura base

- `services/api-gateway`: punto de entrada HTTP para los clientes.
- `services/catalog-service`: servicio preparado para el dominio de catalogos.
- `services/quant-service`: servicio base para cálculo cuantitativo, market data y estrategias de opciones.
- `services/strategy-service`: capa de dominio, modelos y servicios de persistencia para F3.
- `catalogs-mongodb.md`: modelo de persistencia para MongoDB.O
- `catalogs-supabase-postgres.md`: modelo de persistencia para Supabase/Postgres.

## Módulos base integrados

- `GET /health` en cada servicio
- `POST /api/v1/quant/prices`
- `POST /api/v1/quant/greeks`
- `POST /api/v1/quant/implied-volatility`
- `GET /api/v1/strategies/types`
- `POST /api/v1/strategies/build`
- `POST /api/v1/strategies/evaluate`
- `GET /api/v1/market-data/options-chains`

El API Gateway conserva el prefijo `/api/v1`; las rutas HTTP de estrategias que ya existen se reenvían a `quant-service` (puerto 3002). 

Configura `MONGODB_URI` y `MONGODB_DATABASE` para la persistencia de spreads; `STRATEGY_PORT` permite configurar el puerto del proceso de `strategy-service`.

La implementación F3 incluye los modelos Mongoose `VerticalSpread` y `optionLeg` en `src/api/v1/models`, además de la lógica de dominio y operaciones de persistencia exportadas desde `src/api/v1/services`.

Cada servicio puede arrancar de forma independiente y expone un endpoint técnico `/health`. Ejecuta `npm run dev:strategy` para iniciar la conexión de `strategy-service` y `npm run test:strategy` para validar las reglas, el mapeo y los modelos de spreads.

## Punto G: rutas de spreads verticales

La rama `feature/G-routes` expone 18 rutas en `spread-service`, agrupadas en
`src/routes/index.js`: CRUD de spreads, lotes y operaciones sobre `legs`.
La matriz completa y pendientes de integración están en [PUNTO_G_RUTAS.md](PUNTO_G_RUTAS.md).

- `npm run test:spread`: pruebas HTTP con servicios simulados y pruebas de modelos.
- `npm run test:strategy`: pruebas existentes del dominio F3.
- `services/spread-service/examples/spreads.http`: ejemplos para un cliente REST.

PUT de un spread requiere todos los campos de negocio y `legs`; conserva key, ID,
createdBy y auditoría. Los opcionales omitidos se eliminan. PUT de una pata conserva
su ID y parentId, y restablece opcionales omitidos. POST de patas conserva el contrato
anterior de F: recibe un arreglo completo de dos patas. No admite creación de una pata
suelta porque el modelo admite cero o dos patas. DELETE de patas es lógico; GET de patas
incluye sus indicadores active/deletedAt para auditoría, pero GET individual responde
404 si la pata ya está eliminada.

Los lotes de spreads admiten hasta 100 elementos con éxito parcial (`atomic: false`).
Las operaciones de varias patas se guardan juntas solamente si todas son válidas.
PATCH acepta únicamente campos de negocio permitidos; no permite cambiar IDs ni auditoría.

spread-service ya conecta MongoDB antes de iniciar HTTP. H debe
configurar el proxy `/api/v1/spreads` en el gateway. Para arrancar directamente: `npm --workspace services/spread-service start`. La configuración usa el .env raíz; `SPREAD_PORT` tiene prioridad sobre `PORT`. El ruteo se puede verificar con
los tests sin credenciales. Estas pruebas no validan persistencia SQL ni selección
de base de datos al iniciar sesión.

### Core independiente de indicadores

Además de tendencia técnica existe una selección independiente de indicadores y señales. Usa velas diarias cerradas, toma la última señal por familia de las últimas cinco velas y aporta un score direccional heurístico solo si se selecciona. Sin eventos recientes: neutral 50; sin 50 velas válidas: no disponible. Panel con fechas y reglas; no ejecuta órdenes. Ver `GUIA_ANALISIS_Y_CORES.md` y `openspec/changes/completar-core-indicadores`. No constituye un core de IA.
