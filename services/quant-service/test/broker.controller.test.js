const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Carga el controlador real con dependencias aisladas: no lee .env ni llama a Alpaca.
function createHarness() {
  const calls = [], newsCalls = [];
  const broker = {
    async getCandles(input) { calls.push(input); return { symbol: input.symbol, timeframe: input.timeframe, bars: [] }; },
    async getNews(input) {
      newsCalls.push(input);
      return {
        provider: 'alpaca',
        capturedAt: '2026-11-24T00:00:00.000Z',
        articles: [
          { headline: 'AAPL beats estimates' },
          { headline: 'AAPL cuts guidance' },
        ],
      };
    },
  };
  const filename = path.join(__dirname, '../src/api/v1/controllers/broker.controller.js');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    require(name) {
      if (name === '../../../brokers') return { createBroker: () => broker };
      if (name === '../../../config/env') return {};
      if (name === '../../../services/ingestion') return {createIngestor:()=>({})};
      if (name === '../../../services/news-sentiment') return require('../src/services/news-sentiment');
      throw new Error('Dependencia no esperada: ' + name);
    },
  }, { filename });
  return { calls, async query(query) {
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await module.exports.getCandles({ query }, response);
    return response;
  }, async queryNews(query) {
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await module.exports.getNews({ query }, response);
    return { ...response, calls: newsCalls };
  } };
}

test('noticias agrega una clasificación y conserva los datos originales', async () => {
  const h = createHarness();
  const response = await h.queryNews({ symbols: 'AAPL', start: '2026-11-01', end: '2026-11-24' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.provider, 'alpaca');
  assert.deepEqual(response.body.articles.map(article => article.sentiment.label), ['bullish', 'bearish']);
  assert.equal(response.calls.length, 1);
  assert.equal(response.calls[0].symbols, 'AAPL');
  assert.equal(response.calls[0].start, '2026-11-01');
  assert.equal(response.calls[0].end, '2026-11-24');
});

for (const timeframe of ['15Min', '1Hour', '1Day', '1Week', '1Month', '3Month', '6Month', '12Month']) {
  test('velas acepta ' + timeframe + ' sin sustituirlo', async () => {
    const h = createHarness();
    const response = await h.query({ symbol: 'AAPL', timeframe, limit: '30', start: '2026-01-01', end: '2026-10-01', sort: 'desc' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.timeframe, timeframe);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].timeframe, timeframe);
    assert.equal(h.calls[0].limit, 30);
    assert.equal(h.calls[0].start, '2026-01-01');
    assert.equal(h.calls[0].end, '2026-10-01');
    assert.equal(h.calls[0].sort, 'desc');
  });
}
test('velas usa 1Day cuando timeframe está ausente', async () => {
  const h = createHarness();
  const response = await h.query({ symbol: 'AAPL' });
  assert.equal(response.statusCode, 200);
  assert.equal(h.calls[0].timeframe, '1Day');
});
for (const [name, timeframe] of [ ['no-admitido', '1Min'], ['desconocido', 'invalid'], ['vacio', ''], ['repetido', ['1Day', '1Week']], ['objeto', {}], ['nulo', null], ['numerico', 1] ]) {
  test('velas rechaza timeframe ' + name + ' antes de consultar al broker', async () => {
    const h = createHarness();
    const response = await h.query({ symbol: 'AAPL', timeframe });
    assert.equal(response.statusCode, 400);
    assert.match(response.body.message, /timeframe/);
    assert.equal(h.calls.length, 0);
  });
}

test('velas rechaza fechas imposibles, futuras, invertidas y límites inseguros', async () => {
  for (const query of [
    { start: '2026-02-30' }, { end: '9999-01-01' }, { start: '2026-02-01', end: '2026-01-01' },
    { limit: '0' }, { limit: '10001' }, { limit: '1.5' }, { sort: 'otro' }, { pageToken: ['a','b'] },
  ]) {
    const h = createHarness();
    const response = await h.query({ symbol: 'AAPL', ...query });
    assert.equal(response.statusCode, 400);
    assert.equal(h.calls.length, 0);
  }
});
