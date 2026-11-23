# Design

ResearchRanking.rank normaliza los cores elegidos a 0–100 y calcula su promedio con pesos iguales. Técnico: tendencia alineada 100, mixta 50, contraria 0. Black-Scholes: Φ(d2) o Φ(−d2) ×100 según dirección, con volatilidad histórica realizada como proxy. Fundamental: score FMP ya existente con cobertura mínima. Movimiento: 50 + cambio diario alineado ×5, limitado a 0–100. Estas reglas son decisiones heurísticas del proyecto, no una fórmula financiera universal. Noticias no puntúa. Si un core elegido no tiene dato, el score es null.

Se filtra el universo completo de candidatas; después se agrupa una por ticker para el top o se muestran hasta 100 operaciones de una empresa. Los desempates usan ganancia/riesgo y diferencial, después identidad estable. La tabla y sus detalles ocultan datos de cores desmarcados. La probabilidad mínima usa Black-Scholes si está marcado o frecuencia histórica si solo está marcado técnico; se oculta si ninguno lo está.

El catálogo de vencimientos consulta metadatos de contratos activos de Alpaca, con paginación, sin cotizar cada contrato; el rango consultado va desde hoy hasta diez años. El selector informa la empresa de referencia y no asegura que la misma fecha exista para todas. Una fecha manual sigue siendo válida si es futura y el proveedor tiene contratos; si no, el análisis informa ausencia de datos.

Preparar requiere identidad/cotizaciones coherentes y verificación del evaluador de Quant, evita respuestas de un análisis anterior y espera la carga de strikes antes de fijar los contratos. No dispara evaluación, guardado ni órdenes. El usuario pulsa Evaluar posteriormente.

La bitácora conserva una muestra filtrada ordenada de hasta 50 pares y hasta 20 noticias, declara conteos y alcance, y evita duplicar todos los pares en cada subyacente para respetar 200 KB.

Fuente de contratos y filtros: https://docs.alpaca.markets/us/reference/get-options-contracts . Para la CDF se aplica Φ(z)=(1+erf(z/√2))/2, consistente con option-pricing.js; la regresión compara ambos módulos.
