const test = require('node:test');
const assert = require('node:assert/strict');
const research = require('../public/research-analysis');
const { normalCdf } = require('../../quant-service/src/services/option-pricing');

test('la probabilidad risk-neutral de investigación usa la CDF normal estándar de Quant', () => {
  const asOf = Date.parse('2026-01-01T16:00:00Z');
  const result = research.blackScholesProbability(100, 100, '2027-01-01', 20, 'bullish', { rate:.05, dividendYield:0, asOf });
  const time = (Date.parse('2027-01-01T16:00:00Z') - asOf) / (365.25 * 86400000);
  const d2 = (.05 - .2 * .2 / 2) * time / (.2 * Math.sqrt(time));
  assert.ok(Math.abs(result.probability - normalCdf(d2)) < 1e-6, `Actual ${result.probability}; esperado ${normalCdf(d2)}.`);
});
