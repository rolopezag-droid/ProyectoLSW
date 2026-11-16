const test = require('node:test');
const assert = require('node:assert/strict');
const StrategyTriggers = require('../public/strategy-triggers.js');

// Serie determinista: 60 velas planas en 100 y luego sube 1 por vela.
// El cruce del cierre sobre la SMA50 ocurre en el índice 60 (la SMA50 necesita 50 velas).
function risingBars() {
  return Array.from({ length: 120 }, (_, i) => {
    const close = i < 60 ? 100 : 100 + (i - 59);
    return {
      timestamp: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1000,
    };
  });
}

function fallingBars() {
  return risingBars().map(bar => ({
    ...bar,
    open: 200 - bar.open, high: 200 - bar.low, low: 200 - bar.high, close: 200 - bar.close,
  }));
}

function flatBars() {
  return Array.from({ length: 120 }, (_, i) => ({
    timestamp: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
    open: 100, high: 101, low: 99, close: 100, volume: 1000,
  }));
}

test('Entrada bullish por cruce de SMA50 detectada exactamente al romper la media', () => {
  const entries = StrategyTriggers.computeEntrySignals(risingBars(), { direction: 'bullish' });
  const cross = entries.find(signal => signal.rule === 'sma_cross');
  assert.ok(cross, 'debe existir una señal sma_cross');
  assert.equal(cross.index, 60);
  assert.equal(cross.side, 'bullish');
  assert.equal(cross.price, 101);
  assert.ok(Number.isFinite(Date.parse(cross.timestamp)));
  // No debe haber señales antes del cruce ni cruz repetida después (serie monótona).
  assert.ok(entries.every(signal => signal.rule !== 'sma_cross' || signal.index >= 60));
});

test('Entrada bearish con serie descendente y confirmación de SMA20', () => {
  const entries = StrategyTriggers.computeEntrySignals(fallingBars(), { direction: 'bearish' });
  const cross = entries.find(signal => signal.rule === 'sma_cross');
  assert.ok(cross, 'debe existir una señal sma_cross bearish');
  assert.equal(cross.index, 60);
  assert.equal(cross.side, 'bearish');
  assert.equal(cross.price, 99);
});

test('Serie plana no genera señales de entrada ni de salida', () => {
  const bars = flatBars();
  assert.deepEqual(StrategyTriggers.computeEntrySignals(bars, { direction: 'bullish' }), []);
  assert.deepEqual(StrategyTriggers.computeEntrySignals(bars, { direction: 'bearish' }), []);
  assert.deepEqual(StrategyTriggers.computeExitSignals(bars, { direction: 'bullish' }), []);
});

test('Salida cuando el cierre cruza la SMA20 en contra de la dirección', () => {
  // Sube 60 velas y luego baja: la caída cruza la SMA20 a la baja (salida bullish).
  const bars = risingBars().slice(0, 90).map(bar => ({ ...bar }));
  for (let i = 75; i < bars.length; i += 1) {
    const close = bars[74].close - (i - 74) * 2;
    Object.assign(bars[i], { open: close + 0.5, high: close + 1, low: close - 1, close });
  }
  const exits = StrategyTriggers.computeExitSignals(bars, { direction: 'bullish' });
  assert.ok(exits.length >= 1, 'debe existir al menos una salida');
  assert.equal(exits[0].rule, 'sma20_against');
  assert.equal(exits[0].side, 'bullish');
  assert.ok(exits[0].index > 75, 'la salida ocurre durante la caída');
});

test('Ruptura de resistencia genera entrada por zona (rule zone_breakout)', () => {
  const bars = flatBars().map(bar => ({ ...bar }));
  bars[10].high = 110; // pivote de resistencia en 110
  for (let i = 20; i < bars.length; i += 1) {
    bars[i] = { ...bars[i], open: 111, high: 112, low: 110.5, close: 111 };
  }
  const entries = StrategyTriggers.computeEntrySignals(bars, { direction: 'bullish' });
  const zone = entries.find(signal => signal.rule === 'zone_breakout');
  assert.ok(zone, 'debe existir una señal zone_breakout');
  assert.equal(zone.side, 'bullish');
  assert.ok(zone.index >= 20);
  assert.ok(zone.price > 110);
});

test('Niveles de salida correctos por tipo de spread', () => {
  const bullCall = StrategyTriggers.strategyLevels({
    strategy: 'BULL_CALL_SPREAD', side: 'bullish', breakEven: 192, shortStrike: 195, longStrike: 190,
  });
  assert.deepEqual(bullCall, { direction: 'bullish', breakEven: 192, target: 195, stop: 190 });

  const bearPut = StrategyTriggers.strategyLevels({
    strategy: 'BEAR_PUT_SPREAD', side: 'bearish', breakEven: 48.5, shortStrike: 45, longStrike: 50,
  });
  assert.deepEqual(bearPut, { direction: 'bearish', breakEven: 48.5, target: 45, stop: 50 });
});

test('Niveles inválidos o sin dirección devuelven null / listas vacías', () => {
  assert.equal(StrategyTriggers.strategyLevels({ side: 'otro', breakEven: 1, shortStrike: 2, longStrike: 3 }), null);
  assert.equal(StrategyTriggers.strategyLevels({ side: 'bullish', breakEven: null, shortStrike: 2, longStrike: 3 }), null);
  assert.deepEqual(StrategyTriggers.computeEntrySignals(risingBars(), { direction: 'otro' }), []);
  assert.deepEqual(StrategyTriggers.computeExitSignals(risingBars(), {}), []);
});

test('computeTriggers compone entradas, salidas y niveles del candidato', () => {
  const result = StrategyTriggers.computeTriggers(risingBars(), {
    strategy: 'BULL_CALL_SPREAD', side: 'bullish', breakEven: 105, shortStrike: 110, longStrike: 100,
  });
  assert.ok(result.entries.length >= 1);
  assert.deepEqual(result.levels, { direction: 'bullish', breakEven: 105, target: 110, stop: 100 });
  assert.ok(result.exits.every(signal => signal.rule === 'sma20_against'));
});

test('describeSignal produce texto comprensible por regla', () => {
  assert.match(StrategyTriggers.describeSignal({ rule: 'sma_cross', side: 'bullish' }), /SMA50/);
  assert.match(StrategyTriggers.describeSignal({ rule: 'zone_breakout', side: 'bearish' }), /soporte/i);
  assert.match(StrategyTriggers.describeSignal({ rule: 'sma20_against', side: 'bullish' }), /SMA20/);
  assert.equal(StrategyTriggers.describeSignal(null), '');
});
