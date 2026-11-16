const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

async function until(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(r => setImmediate(r)); } throw Error('La interfaz no completó la acción.'); }

// Página igual que ui-flows.test.js pero con interceptores dedicados al workbench.
function page(intercept) {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost:3005', runScripts: 'outside-only' }), w = dom.window, calls = [];
  w.structuredClone = structuredClone;
  Object.defineProperty(w, 'crypto', { value: require('node:crypto').webcrypto });
  w.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    let body = {};
    const u = new URL(url, 'http://localhost:3005');
    if (intercept) { const response = intercept(u, opts); if (response) return response; }
    if (u.pathname === '/api/services/status') return { ok: true, status: 200, json: async () => ({}) };
    if (u.pathname.endsWith('/quant/prices')) {
      const input = JSON.parse(opts.body);
      body = { model: 'black-scholes', currency: 'USD', symbol: input.symbol, price: 12.3456, greeks: { delta: 0.5 }, assumptions: { timeToMaturityYears: 0.25 }, calculatedAt: '2026-11-15T00:00:00Z' };
    } else if (u.pathname.endsWith('/quant/greeks')) {
      body = { model: 'black-scholes', symbol: JSON.parse(opts.body).symbol, greeks: { delta: 0.42, gamma: 0.03, theta: -0.05, vega: 12.5, rho: 4.2 }, calculatedAt: '2026-11-15T00:00:00Z' };
    } else if (u.pathname.endsWith('/implied-volatility')) {
      if (interceptIVReject) return { ok: false, status: 422, json: async () => ({ message: 'Precio fuera de límites', converged: false }) };
      body = { impliedVolatility: 0.2731, method: 'newton-raphson', converged: true, iterations: 5, modelPrice: 5.0, pricingError: 1e-9, calculatedAt: '2026-11-15T00:00:00Z' };
    }
    return { ok: true, status: 200, json: async () => body };
  };
  let interceptIVReject = false;
  for (const script of w.document.querySelectorAll('script')) {
    if (script.src) w.eval(fs.readFileSync(path.join(__dirname, '../public', new URL(script.src).pathname.replace(/^\//, '')), 'utf8'));
    else w.eval(script.textContent);
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { dom, w, calls, setIVReject: value => { interceptIVReject = value; } };
}

test('Workbench: el selector cambia método, muestra campos de IV y ajusta el botón', async () => {
  const { dom, w } = page(); try {
    const chips = w.document.querySelectorAll('#quantMethodGrid .method-chip');
    assert.equal(chips.length, 4);
    assert.equal(w.document.getElementById('qwIvExtras').hidden, true);
    w.document.querySelector('[data-method="iv"]').click();
    assert.equal(w.document.getElementById('qwIvExtras').hidden, false);
    assert.match(w.document.getElementById('btnCalcQuant').textContent, /volatilidad implícita/i);
    w.document.querySelector('[data-method="prices"]').click();
    assert.equal(w.document.getElementById('qwIvExtras').hidden, true);
    assert.match(w.document.getElementById('btnCalcQuant').textContent, /precio/i);
    await new Promise(r => setImmediate(r));
  } finally { dom.window.close(); }
});

test('Workbench: precios y griegas envían el payload correcto y renderizan resultados', async () => {
  const { dom, w, calls } = page(); try {
    const form = w.document.getElementById('quantForm');
    form.querySelector('#qwSymbol').value = 'msft';
    form.querySelector('#qwSpot').value = '343.87';
    form.querySelector('#qwStrike').value = '340';
    form.querySelector('#qwExpiration').value = '2026-12-18';
    form.querySelector('#qwVolatility').value = '0.25';
    w.document.getElementById('btnCalcQuant').click();
    await until(() => w.document.getElementById('quantResult').textContent.includes('Precio teórico'));
    const sent = JSON.parse(calls.find(c => c.url.endsWith('/quant/prices')).opts.body);
    assert.equal(sent.symbol, 'MSFT'); assert.equal(sent.spot, 343.87); assert.equal(sent.optionType, 'call');
    assert.equal(sent.marketPrice, undefined);
    w.document.querySelector('[data-method="greeks"]').click();
    assert.equal(w.document.getElementById('qwIvExtras').hidden, true);
    w.document.getElementById('btnCalcQuant').click();
    await until(() => w.document.getElementById('quantResult').textContent.includes('Delta'));
    const greeksCall = calls.find(c => c.url.endsWith('/quant/greeks'));
    assert.equal(JSON.parse(greeksCall.opts.body).symbol, 'MSFT');
    assert.match(w.document.getElementById('quantResult').textContent, /Griegas/);
    assert.match(w.document.getElementById('quantResult').textContent, /Delta/);
  } finally { dom.window.close(); }
});

test('Workbench: "Los tres" llama a los tres endpoints y apila resultados', async () => {
  const { dom, w, calls } = page(); try {
    w.document.querySelector('[data-method="all"]').click();
    assert.equal(w.document.getElementById('qwIvExtras').hidden, false);
    w.document.getElementById('btnCalcQuant').click();
    await until(() => w.document.getElementById('quantResult').textContent.includes('Volatilidad Implícita'));
    const paths = calls.filter(c => c.url.startsWith('http://localhost:3005/api/v1/quant/') || c.url.startsWith('/api/v1/quant/')).map(c => new URL(c.url, 'http://localhost:3005').pathname);
    assert.deepEqual(paths, ['/api/v1/quant/prices', '/api/v1/quant/greeks', '/api/v1/quant/implied-volatility']);
    const text = w.document.getElementById('quantResult').textContent;
    assert.match(text, /Precio Black-Scholes/); assert.match(text, /Gamma/); assert.match(text, /Newton-Raphson/);
  } finally { dom.window.close(); }
});

test('Workbench: IV rechazada con 422 sin volatilidad muestra mensaje y rehabilita el botón', async () => {
  const { dom, w, setIVReject } = page(); try {
    setIVReject(true);
    w.document.querySelector('[data-method="iv"]').click();
    const btn = w.document.getElementById('btnCalcQuant');
    btn.click();
    await until(() => !btn.disabled);
    assert.match(w.document.getElementById('quantResult').textContent, /no convergió/i);
    assert.match(w.document.getElementById('alertContainer').textContent, /Precio fuera de límites/);
  } finally { dom.window.close(); }
});

test('Workbench: valida antes de enviar y no llama a la API con datos incompletos', async () => {
  const { dom, w, calls } = page(); try {
    w.document.getElementById('qwSpot').value = '';
    w.document.getElementById('btnCalcQuant').click();
    await new Promise(r => setImmediate(r));
    assert.equal(calls.filter(c => c.url.includes('/quant/')).length, 0);
    assert.match(w.document.getElementById('alertContainer').textContent, /precio spot válido/);
  } finally { dom.window.close(); }
});

test('Workbench: prefill desde gráfica carga S, símbolo y σ con fuente explicada', async () => {
  const { dom, w } = page(); try {
    w.renderCandles({ symbol: 'TSLA', timeframe: '1Day', bars: [{ timestamp: '2026-11-06T15:00:00Z', open: 100, high: 102, low: 99, close: 101, volume: 123 }] });
    w.__researchMarketCache.TSLA = { bars: [], realizedVolatility: 31.2, spot: 101, expiration: '2026-12-18' };
    w.document.getElementById('btnPrefillQuant').click();
    assert.equal(w.document.getElementById('qwSymbol').value, 'TSLA');
    assert.equal(w.document.getElementById('qwSpot').value, '101.00');
    assert.equal(w.document.getElementById('qwVolatility').value, '0.3120');
    assert.match(w.document.getElementById('alertContainer').textContent, /última vela de la gráfica \(TSLA\)/);
    await new Promise(r => setImmediate(r));
  } finally { dom.window.close(); }
});

test('Workbench: prefill sin gráfica ni candidata avisa en lugar de fallar', async () => {
  const { dom, w } = page(); try {
    w.document.getElementById('btnPrefillQuant').click();
    assert.match(w.document.getElementById('alertContainer').textContent, /Primero carga la gráfica o selecciona una candidata/);
    await new Promise(r => setImmediate(r));
  } finally { dom.window.close(); }
});
