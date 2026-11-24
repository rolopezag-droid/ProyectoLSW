const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyNewsSentiment } = require('../src/services/news-sentiment');

test('clasifica señales alcistas en inglés y español y expone las frases que las sustentan', () => {
  const result = classifyNewsSentiment({
    headline: 'AAPL beats estimates and raises guidance',
    summary: 'La compañía supera las expectativas.',
  });

  assert.equal(result.label, 'bullish');
  assert.equal(result.confidence, 'medium');
  assert.ok(result.signals.bullish.includes('beats estimates'));
  assert.ok(result.signals.bullish.includes('raises guidance'));
  assert.ok(result.signals.bullish.includes('supera las expectativas'));
});

test('clasifica señales bajistas encontradas en el resumen', () => {
  const result = classifyNewsSentiment({
    headline: 'AAPL outlook update',
    summary: 'The company cuts guidance and misses estimates.',
  });

  assert.equal(result.label, 'bearish');
  assert.equal(result.confidence, 'medium');
  assert.deepEqual(result.signals.bearish, ['misses estimates', 'cuts guidance']);
});

test('marca como mixtas las señales alcistas y bajistas en un mismo artículo', () => {
  const result = classifyNewsSentiment({
    headline: 'Shares rally after earnings',
    summary: 'The company misses estimates.',
  });

  assert.equal(result.label, 'mixed');
  assert.deepEqual(result.signals.bullish, ['shares rally']);
  assert.deepEqual(result.signals.bearish, ['misses estimates']);
});

test('no inventa una dirección cuando no encuentra frases reconocidas', () => {
  const result = classifyNewsSentiment({ headline: 'Company announces quarterly results' });

  assert.equal(result.label, 'neutral');
  assert.equal(result.confidence, 'low');
  assert.deepEqual(result.signals, { bullish: [], bearish: [] });
});
