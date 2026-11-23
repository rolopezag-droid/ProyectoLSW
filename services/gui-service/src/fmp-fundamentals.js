const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map();
const SP500_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let sp500Cache = null;

function finite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

async function request(endpoint, symbol, apiKey, fetchImpl) {
  const url = new URL(`${FMP_BASE_URL}/${endpoint}`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('limit', '2');
  url.searchParams.set('period', 'annual');
  url.searchParams.set('apikey', apiKey);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    const error = new Error(response.status === 429 ? 'FMP alcanzó el límite de consultas.' : `FMP respondió con HTTP ${response.status}.`);
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }
  const data = await response.json();
  if (!Array.isArray(data)) throw Object.assign(new Error('FMP devolvió datos no válidos.'), { status: 502 });
  return data;
}

function normalize(symbol, keyMetrics, ratios, statements) {
  const metrics = keyMetrics[0] || {};
  const ratio = ratios[0] || {};
  const latest = statements[0] || {};
  const previous = statements[1] || {};
  const growth = (current, old) => Number.isFinite(Number(current)) && Number.isFinite(Number(old)) && Number(old) !== 0
    ? (Number(current) / Number(old) - 1) * 100 : null;
  return {
    symbol,
    status: Object.keys(metrics).length || Object.keys(ratio).length || Object.keys(latest).length ? 'available' : 'unavailable',
    period: latest.period || metrics.period || ratio.period || null,
    dataDate: latest.date || metrics.date || ratio.date || null,
    metrics: {
      marketCap: finite(metrics.marketCap),
      pe: finite(metrics.peRatio, ratio.priceToEarningsRatio),
      pb: finite(metrics.pbRatio, ratio.priceToBookRatio),
      roe: finite(metrics.returnOnEquity, ratio.returnOnEquity),
      netMargin: finite(ratio.netProfitMargin, latest.netIncome && latest.revenue ? Number(latest.netIncome) / Number(latest.revenue) : null),
      debtEquity: finite(metrics.debtToEquityRatio, ratio.debtToEquityRatio),
      currentRatio: finite(metrics.currentRatio, ratio.currentRatio),
      revenueGrowth: growth(latest.revenue, previous.revenue),
      netIncomeGrowth: growth(latest.netIncome, previous.netIncome),
      freeCashFlowPerShare: finite(metrics.freeCashFlowPerShare),
    },
  };
}

async function loadFundamentals(symbols, apiKey, { fetchImpl = global.fetch, now = Date.now } = {}) {
  if (!apiKey) return { status: 'unavailable', provider: 'Financial Modeling Prep', capturedAt: new Date(now()).toISOString(), error: 'FMP_API_KEY no está configurada en el servidor.', rows: [] };
  const capturedAt = new Date(now()).toISOString();
  const rows = await Promise.all(symbols.map(async symbol => {
    const key = `${symbol}:${apiKey.slice(-4)}`;
    const cached = cache.get(key);
    if (cached && now() - cached.at < CACHE_TTL_MS) return cached.row;
    try {
      const [metrics, ratios, statements] = await Promise.all([
        request('key-metrics', symbol, apiKey, fetchImpl),
        request('ratios', symbol, apiKey, fetchImpl),
        request('income-statement', symbol, apiKey, fetchImpl),
      ]);
      const row = normalize(symbol, metrics, ratios, statements);
      cache.set(key, { at: now(), row });
      return row;
    } catch (error) {
      return { symbol, status: 'unavailable', error: error.message, metrics: {} };
    }
  }));
  return { status: rows.some(row => row.status === 'available') ? 'available' : 'unavailable', provider: 'Financial Modeling Prep', capturedAt, rows };
}

async function loadSp500(apiKey, { fetchImpl = global.fetch, now = Date.now } = {}) {
  if (!apiKey) return { status: 'unavailable', provider: 'Financial Modeling Prep', capturedAt: new Date(now()).toISOString(), error: 'FMP_API_KEY no está configurada en el servidor.', constituents: [] };
  if (sp500Cache && sp500Cache.key === apiKey.slice(-4) && now() - sp500Cache.at < SP500_CACHE_TTL_MS) return sp500Cache.result;
  const capturedAt = new Date(now()).toISOString();
  const url = new URL(`${FMP_BASE_URL}/sp500-constituent`);
  url.searchParams.set('apikey', apiKey);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const error = new Error(response.status === 429 ? 'FMP alcanzó el límite de consultas.' : `FMP respondió con HTTP ${response.status}.`);
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }
  const data = await response.json();
  if (!Array.isArray(data)) throw Object.assign(new Error('FMP devolvió una lista del S&P 500 no válida.'), { status: 502 });
  const seen = new Set();
  const constituents = data.map(item => ({ symbol: String(item.symbol || '').trim().toUpperCase(), name: String(item.name || item.companyName || '').trim() }))
    .filter(item => /^[A-Z0-9.-]{1,12}$/.test(item.symbol) && !seen.has(item.symbol) && seen.add(item.symbol));
  if (constituents.length < 400) throw Object.assign(new Error('FMP devolvió una lista incompleta del S&P 500.'), { status: 502 });
  const result = { status: 'available', provider: 'Financial Modeling Prep', capturedAt, constituents };
  sp500Cache = { key: apiKey.slice(-4), at: now(), result };
  return result;
}

module.exports = { loadFundamentals, loadSp500 };
