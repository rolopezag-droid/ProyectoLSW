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

test('Workbench: un cálculo exitoso publica __workbenchContext y un fallo lo limpia', async () => {
  const { dom, w } = page(u => {
    if (u.pathname.endsWith('/quant/greeks')) return { ok: false, status: 500, json: async () => ({ message: 'quant-service sin modelo' }) };
    return null;
  }); try {
    w.document.getElementById('btnCalcQuant').click();
    await until(() => w.document.getElementById('quantResult').textContent.includes('Precio teórico'));
    const ctx = w.__workbenchContext;
    assert.ok(ctx, 'el contexto debe publicarse tras un cálculo exitoso');
    assert.equal(ctx.method, 'prices');
    assert.equal(ctx.symbol, 'AAPL');
    assert.equal(ctx.strike, 340);
    assert.equal(ctx.expiration, '2026-12-18');
    assert.equal(ctx.data.price, 12.3456);
    assert.match(ctx.token, /^wb-/);
    w.document.querySelector('[data-method="greeks"]').click();
    w.document.getElementById('btnCalcQuant').click();
    await until(() => w.document.getElementById('quantResult').textContent.includes('No se pudo completar'));
    assert.equal(w.__workbenchContext, null, 'un cálculo fallido limpia el contexto');
    await new Promise(r => setImmediate(r));
  } finally { dom.window.close(); }
});

test('Workbench: IV sin convergencia (422) no publica contexto y el botón aplicar avisa sin cálculo', async () => {
  const { dom, w, setIVReject } = page(); try {
    setIVReject(true);
    w.document.querySelector('[data-method="iv"]').click();
    w.document.getElementById('btnCalcQuant').click();
    await until(() => w.document.getElementById('quantResult').textContent.includes('no convergió'));
    assert.equal(w.__workbenchContext, null);
    assert.ok(w.document.getElementById('btnApplyQuantToTable'), 'el botón aplicar debe existir');
    w.document.getElementById('btnApplyQuantToTable').click();
    await until(() => w.document.getElementById('researchStatus').textContent.includes('Primero calcula'));
    assert.match(w.document.getElementById('researchStatus').textContent, /Primero calcula un método/);
    await new Promise(r => setImmediate(r));
  } finally { dom.window.close(); }
});

test('Workbench: el selector cambia método, muestra campos de IV y ajusta el botón', async () => {
  const { dom, w } = page(); try {
    const chips = w.document.querySelectorAll('#quantMethodGrid .method-chip');
    assert.equal(chips.length, 3);
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

test('Workbench: el modo combinado "Los tres" ya no existe y cada método llama un solo endpoint', async () => {
  const { dom, w, calls } = page(); try {
    assert.equal(w.document.querySelector('[data-method="all"]'), null, 'el chip "Los tres" fue eliminado');
    assert.equal(w.QuantWorkbench.METHODS.all, undefined);
    w.document.querySelector('[data-method="iv"]').click();
    assert.equal(w.document.getElementById('qwIvExtras').hidden, false);
    const btn = w.document.getElementById('btnCalcQuant');
    btn.click();
    await until(() => w.document.getElementById('quantResult').textContent.includes('Volatilidad Implícita'));
    const paths = calls.filter(c => c.url.includes('/quant/')).map(c => new URL(c.url, 'http://localhost:3005').pathname);
    assert.deepEqual(paths, ['/api/v1/quant/implied-volatility']);
    assert.match(w.document.getElementById('quantResult').textContent, /Newton-Raphson/);
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
