/**
 * Señales de entrada/salida (triggers) y niveles de salida para spreads verticales.
 *
 * Heurístico y orientativo: reglas deterministas sobre velas diarias ya descargadas
 * (cruce de medias móviles y ruptura de zonas de pivote). No es un pronóstico
 * calibrado ni una recomendación de inversión.
 *
 * API:
 *   computeEntrySignals(bars, {direction}) → [{index, timestamp, price, rule, side}]
 *   computeExitSignals(bars, {direction})  → [{index, timestamp, price, rule, side}]
 *   strategyLevels(candidate)              → {direction, breakEven, target, stop}
 *   computeTriggers(bars, candidate)       → {entries, exits, levels}
 *   describeSignal(signal)                 → texto para tooltip/leyenda
 */
(function (root) {
  const ResearchAnalysis = typeof require === 'function' && typeof module !== 'undefined' && module.exports
    ? require('./research-analysis.js')
    : (root.ResearchAnalysis || null);

  const MAX_MARKERS_PER_KIND = 12;

  function sortedBars(bars) {
    return (bars || [])
      .filter(bar => Number.isFinite(bar.close) && Number.isFinite(bar.high) && Number.isFinite(bar.low))
      .slice()
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  }

  function pick(series, index) {
    const point = series[index];
    return point && Number.isFinite(point.value) ? point.value : null;
  }

  /**
   * Entradas por cruce de SMA50 con confirmación de SMA20:
   * bullish si el cierre cruza al alza la SMA50 y SMA20 > SMA50;
   * bearish si el cierre cruza a la baja la SMA50 y SMA20 < SMA50.
   */
  function smaCrossEntries(sorted, direction) {
    const signals = [];
    const sma20 = ResearchAnalysis ? ResearchAnalysis.simpleMovingAverageSeries(sorted, 20) : [];
    const sma50 = ResearchAnalysis ? ResearchAnalysis.simpleMovingAverageSeries(sorted, 50) : [];
    for (let index = 1; index < sorted.length; index += 1) {
      const closeNow = sorted[index].close;
      const closePrev = sorted[index - 1].close;
      const ma50Now = pick(sma50, index);
      const ma50Prev = pick(sma50, index - 1);
      const ma20Now = pick(sma20, index);
      if (ma50Now === null || ma50Prev === null || ma20Now === null) continue;
      const crossedUp = closeNow > ma50Now && closePrev <= ma50Prev;
      const crossedDown = closeNow < ma50Now && closePrev >= ma50Prev;
      const confirmed = direction === 'bullish' ? ma20Now > ma50Now : ma20Now < ma50Now;
      if ((direction === 'bullish' && crossedUp && confirmed) || (direction === 'bearish' && crossedDown && confirmed)) {
        signals.push({ index, timestamp: sorted[index].timestamp, price: closeNow, rule: 'sma_cross', side: direction });
      }
    }
    return signals;
  }

  /**
   * Entradas por ruptura de zona de pivote: primer cierre que rebasa el límite
   * de la zona por el buffer de ruptura (0.25 ATR, misma regla del panel técnico).
   */
  function zoneBreakoutEntries(sorted, direction) {
    if (!ResearchAnalysis || !ResearchAnalysis.supportResistance) return [];
    const levels = ResearchAnalysis.supportResistance(sorted);
    if (!levels || !levels.available) return [];
    const buffer = levels.atr * (levels.breakoutAtrBuffer || 0.25);
    const zones = direction === 'bullish' ? (levels.resistances || []) : (levels.supports || []);
    const signals = [];
    for (const zone of zones) {
      const threshold = direction === 'bullish' ? zone.upper + buffer : zone.lower - buffer;
      const index = sorted.findIndex(bar => direction === 'bullish' ? bar.close > threshold : bar.close < threshold);
      if (index > 0) {
        signals.push({ index, timestamp: sorted[index].timestamp, price: sorted[index].close, rule: 'zone_breakout', side: direction });
      }
    }
    return signals;
  }

  /**
   * Salidas: el cierre cruza la SMA20 en contra de la dirección del spread.
   */
  function computeExitSignals(bars, { direction } = {}) {
    if (!['bullish', 'bearish'].includes(direction)) return [];
    const sorted = sortedBars(bars);
    if (sorted.length < 2) return [];
    const sma20 = ResearchAnalysis ? ResearchAnalysis.simpleMovingAverageSeries(sorted, 20) : [];
    const signals = [];
    for (let index = 1; index < sorted.length; index += 1) {
      const closeNow = sorted[index].close;
      const closePrev = sorted[index - 1].close;
      const ma20Now = pick(sma20, index);
      const ma20Prev = pick(sma20, index - 1);
      if (ma20Now === null || ma20Prev === null) continue;
      const againstBullish = closeNow < ma20Now && closePrev >= ma20Prev;
      const againstBearish = closeNow > ma20Now && closePrev <= ma20Prev;
      if ((direction === 'bullish' && againstBullish) || (direction === 'bearish' && againstBearish)) {
        signals.push({ index, timestamp: sorted[index].timestamp, price: closeNow, rule: 'sma20_against', side: direction });
      }
    }
    return signals;
  }

  function computeEntrySignals(bars, { direction } = {}) {
    if (!['bullish', 'bearish'].includes(direction)) return [];
    const sorted = sortedBars(bars);
    if (sorted.length < 2) return [];
    const signals = [...smaCrossEntries(sorted, direction), ...zoneBreakoutEntries(sorted, direction)]
      .sort((a, b) => a.index - b.index || a.rule.localeCompare(b.rule));
    return signals.slice(0, MAX_MARKERS_PER_KIND);
  }

  /**
   * Niveles de salida del spread evaluado:
   * target = strike corto (zona de ganancia máxima), stop = strike largo
   * (pérdida máxima), breakEven = punto de equilibrio.
   */
  function strategyLevels(candidate) {
    const side = candidate && candidate.side;
    if (!['bullish', 'bearish'].includes(side)) return null;
    const numbers = [candidate.breakEven, candidate.shortStrike, candidate.longStrike];
    if (!numbers.every(value => Number.isFinite(value) && value > 0)) return null;
    return {
      direction: side,
      breakEven: Number(candidate.breakEven),
      target: Number(candidate.shortStrike),
      stop: Number(candidate.longStrike),
    };
  }

  function computeTriggers(bars, candidate) {
    const levels = strategyLevels(candidate);
    const direction = levels ? levels.direction : null;
    return {
      entries: computeEntrySignals(bars, { direction }),
      exits: computeExitSignals(bars, { direction }),
      levels,
    };
  }

  function describeSignal(signal) {
    if (!signal) return '';
    if (signal.rule === 'sma_cross') {
      return (signal.side === 'bullish' ? 'Entrada (cruce al alza de SMA50 con SMA20 confirmada)' : 'Entrada (cruce a la baja de SMA50 con SMA20 confirmada)');
    }
    if (signal.rule === 'zone_breakout') {
      return signal.side === 'bullish' ? 'Entrada (ruptura de resistencia por margen ATR)' : 'Entrada (ruptura de soporte por margen ATR)';
    }
    if (signal.rule === 'sma20_against') {
      return signal.side === 'bullish' ? 'Salida (cierre bajo SMA20 en contra de la dirección)' : 'Salida (cierre sobre SMA20 en contra de la dirección)';
    }
    return 'Señal';
  }

  const api = { computeEntrySignals, computeExitSignals, strategyLevels, computeTriggers, describeSignal };
  root.StrategyTriggers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
