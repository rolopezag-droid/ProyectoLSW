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

  // Ventana móvil de zonas: solo velas anteriores, nunca la vela de ruptura.
  const ZONE_LOOKBACK = 252;

  function sortedBars(bars) {
    return (bars || [])
      .filter(bar => Number.isFinite(bar.close) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && bar.high >= bar.low && Number.isFinite(Date.parse(bar.timestamp)))
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
        signals.push({ index, timestamp: sorted[index].timestamp, price: closeNow, rule: 'sma_cross', side: direction,
          values: { previousClose: closePrev, previousSma50: ma50Prev, sma20: ma20Now, sma50: ma50Now } });
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
    const signals = [];
    for (let index = 1; index < sorted.length; index += 1) {
      // El prefijo termina en i−1: pivotes, agrupación y ATR ya existían al cierre anterior.
      const history = sorted.slice(Math.max(0, index - ZONE_LOOKBACK), index);
      const levels = ResearchAnalysis.supportResistance(history, { maxPerSide: ZONE_LOOKBACK });
      if (!levels.available) continue;
      const buffer = levels.atr * levels.breakoutAtrBuffer;
      const zones = direction === 'bullish' ? levels.resistances : levels.supports;
      for (const zone of zones) {
        const threshold = direction === 'bullish' ? zone.upper + buffer : zone.lower - buffer;
        const previousClose = sorted[index - 1].close, close = sorted[index].close;
        const crossed = direction === 'bullish'
          ? previousClose <= threshold && close > threshold
          : previousClose >= threshold && close < threshold;
        if (crossed) signals.push({ index, timestamp: sorted[index].timestamp, price: close, rule: 'zone_breakout', side: direction,
          values: { previousClose, zoneLower: zone.lower, zoneUpper: zone.upper, atr14: levels.atr, buffer, threshold,
            pivotConfirmedAt: zone.confirmedAt, zoneAsOf: sorted[index - 1].timestamp } });
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
        signals.push({ index, timestamp: sorted[index].timestamp, price: closeNow, rule: 'sma20_against', side: direction,
          values: { previousClose: closePrev, previousSma20: ma20Prev, sma20: ma20Now } });
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
    return signals;
  }

  /** Las fechas identifican la vela del proveedor; cada evento se confirma a su cierre. */
  function computeTechnicalSignals(bars, { symbol = '', timeframe = '1Day', indicators } = {}) {
    if (timeframe !== '1Day' || !ResearchAnalysis) return [];
    const sorted = sortedBars(bars);
    const enabled = new Set(indicators || ['sma_up', 'sma_down', 'rsi', 'resistance', 'support']);
    const events = [];
    const add = (signal, indicator, type, exactRule, explanation) => events.push({
      ...signal, ticker: symbol, timeframe, indicator, type, exactRule, explanation,
      category: 'technical', confirmation: 'al cierre de la vela',
    });
    for (const [direction, key, type] of [['bullish', 'sma_up', 'alcista'], ['bearish', 'sma_down', 'bajista']]) {
      if (!enabled.has(key)) continue;
      for (const signal of smaCrossEntries(sorted, direction)) {
        const up = direction === 'bullish';
        add(signal, 'SMA50 + SMA20', type,
          up ? 'Cierre anterior ≤ SMA50 anterior; cierre actual > SMA50 actual; SMA20 actual > SMA50 actual.' : 'Cierre anterior ≥ SMA50 anterior; cierre actual < SMA50 actual; SMA20 actual < SMA50 actual.',
          up ? 'El cierre cruzó al alza la SMA50 y la SMA20 confirmó la tendencia alcista.' : 'El cierre cruzó a la baja la SMA50 y la SMA20 confirmó la tendencia bajista.');
      }
    }
    if (enabled.has('rsi')) {
      const rsi = ResearchAnalysis.relativeStrengthIndexSeries(sorted, 14);
      for (let index = 1; index < sorted.length; index += 1) {
        const previous = pick(rsi, index - 1), current = pick(rsi, index);
        if (previous === null || current === null) continue;
        const up = previous <= 30 && current > 30, down = previous >= 70 && current < 70;
        if (!up && !down) continue;
        add({ index, timestamp: sorted[index].timestamp, price: sorted[index].close, rule: 'rsi_cross', side: up ? 'bullish' : 'bearish', values: { previousRsi14: previous, rsi14: current, threshold: up ? 30 : 70 } },
          'RSI14', up ? 'alcista' : 'bajista', up ? 'RSI14 anterior ≤ 30 y RSI14 actual > 30.' : 'RSI14 anterior ≥ 70 y RSI14 actual < 70.',
          up ? 'El RSI14 salió al alza de la zona de 30.' : 'El RSI14 salió a la baja de la zona de 70.');
      }
    }
    for (const [direction, key, type] of [['bullish', 'resistance', 'alcista'], ['bearish', 'support', 'bajista']]) {
      if (!enabled.has(key)) continue;
      for (const signal of zoneBreakoutEntries(sorted, direction)) {
        const up = direction === 'bullish';
        add(signal, up ? 'Resistencia + ATR14' : 'Soporte + ATR14', type,
          up ? 'Cierre anterior ≤ límite superior previo + 0.25 × ATR14 previo; cierre actual > ese umbral.' : 'Cierre anterior ≥ límite inferior previo − 0.25 × ATR14 previo; cierre actual < ese umbral.',
          up ? 'El cierre superó una resistencia ya confirmada y su margen ATR.' : 'El cierre cayó por debajo de un soporte ya confirmado y su margen ATR.');
      }
    }
    return events.sort((a, b) => a.index - b.index || a.indicator.localeCompare(b.indicator));
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
    if (signal.explanation) return signal.indicator + ': ' + signal.explanation;
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

  const api = { computeEntrySignals, computeExitSignals, computeTechnicalSignals, strategyLevels, computeTriggers, describeSignal };
  root.StrategyTriggers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
