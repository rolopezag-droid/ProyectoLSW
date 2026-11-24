const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map();
const restrictedEndpoints = new Map();
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
  const restrictionKey = `${endpoint}:${symbol}:${require('node:crypto').createHash('sha256').update(apiKey).digest('hex')}`;
  const restricted = restrictedEndpoints.get(restrictionKey);
  if (restricted && Date.now() - restricted.at < 60000) throw restricted.error;
  const url = new URL(`${FMP_BASE_URL}/${endpoint}`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('limit', '2');
  url.searchParams.set('period', 'annual');
  url.searchParams.set('apikey', apiKey);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    const error = new Error(response.status === 429 ? 'FMP alcanzó el límite de consultas.' : response.status === 402 ? 'FMP restringe este recurso al plan contratado (HTTP 402); cambiar de ticker no garantiza acceso.' : `FMP respondió con HTTP ${response.status}.`);
    if (response.status === 402 || response.status === 429) restrictedEndpoints.set(restrictionKey, {at:Date.now(),error});
    error.upstreamStatus = response.status;
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
  const growth = (current, old) => current != null && old != null && current !== '' && old !== '' && Number.isFinite(Number(current)) && Number.isFinite(Number(old)) && Number(old) !== 0
    ? ((Number(current) - Number(old)) / Math.abs(Number(old))) * 100 : null;
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
    const key = `${symbol}:${require('node:crypto').createHash('sha256').update(apiKey).digest('hex')}`;
    const cached = cache.get(key);
    if (cached && now() - cached.at < (cached.row.status === 'available' ? CACHE_TTL_MS : 60000)) return cached.row;
    try {
      const results = await Promise.allSettled([
        request('key-metrics', symbol, apiKey, fetchImpl),
        request('ratios', symbol, apiKey, fetchImpl),
        request('income-statement', symbol, apiKey, fetchImpl),
        request('profile', symbol, apiKey, fetchImpl),
      ]);
      const [metrics, ratios, statements, profiles] = results.map(result => result.status === 'fulfilled' ? result.value : []);
      const row = normalize(symbol, metrics, ratios, statements);
      row.provider = 'Financial Modeling Prep';
      row.companyName = profiles[0]?.companyName || null;
      row.metrics.marketCap = row.metrics.marketCap ?? finite(profiles[0]?.marketCap);
      row.coverage = Object.values(row.metrics).filter(Number.isFinite).length + '/10 métricas';
      row.warnings = [...new Set(results.filter(result => result.status === 'rejected').map(result => result.reason.message))];
      row.status = Object.values(row.metrics).some(Number.isFinite) ? 'available' : 'unavailable';
      if (row.status === 'unavailable') row.error = row.warnings.join(' ') || 'El proveedor no devolvió métricas reconocidas para este ticker.';
      cache.set(key, { at: now(), row });
      return row;
    } catch (error) {
      return { symbol, status: 'unavailable', error: error.message, metrics: {} };
    }
  }));
  return { status: rows.some(row => row.status === 'available') ? 'available' : 'unavailable', provider: 'Financial Modeling Prep', capturedAt, rows };
}

async function loadFmpSp500(apiKey, { fetchImpl = global.fetch, now = Date.now } = {}) {
  if (!apiKey) return { status: 'unavailable', provider: 'Financial Modeling Prep', capturedAt: new Date(now()).toISOString(), error: 'FMP_API_KEY no está configurada en el servidor.', constituents: [] };
  if (sp500Cache && sp500Cache.key === apiKey.slice(-4) && now() - sp500Cache.at < SP500_CACHE_TTL_MS) return sp500Cache.result;
  const capturedAt = new Date(now()).toISOString();
  const url = new URL(`${FMP_BASE_URL}/sp500-constituent`);
  url.searchParams.set('apikey', apiKey);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const error = new Error(response.status === 429 ? 'FMP alcanzó el límite de consultas.' : response.status === 402 ? 'FMP restringe este recurso al plan contratado (HTTP 402); cambiar de ticker no garantiza acceso.' : `FMP respondió con HTTP ${response.status}.`);
    error.upstreamStatus = response.status;
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

// El universo público es independiente del acceso a fundamentales de pago.
const PUBLIC_UNIVERSE_URL = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv';
let publicUniverseCache;
function csvRows(text) {
  const rows=[]; let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  if(quoted)throw new Error('CSV de empresas incompleto.');
  return rows;
}
async function loadSp500(apiKey,{fetchImpl=global.fetch,now=Date.now}={}){
  if(publicUniverseCache&&now()-publicUniverseCache.at<SP500_CACHE_TTL_MS)return publicUniverseCache.result;
  let restriction=null;
  if(apiKey)try{const result=await loadFmpSp500(apiKey,{fetchImpl,now});if(result.status==='available')return result;}catch(error){restriction=error.message;}
  const response=await fetchImpl(PUBLIC_UNIVERSE_URL,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`No se pudo obtener el universo público (${response.status}). ${restriction||''}`);
  const [headers,...records]=csvRows(await response.text());
  const symbolIndex=headers.indexOf('Symbol'),nameIndex=headers.indexOf('Security');
  if(symbolIndex<0||nameIndex<0)throw new Error('El catálogo público cambió de formato.');
  const seen=new Set();
  const constituents=records.map(row=>({symbol:String(row[symbolIndex]||'').trim().toUpperCase(),name:row[nameIndex]||''})).filter(row=>/^[A-Z0-9.-]{1,12}$/.test(row.symbol)&&!seen.has(row.symbol)&&seen.add(row.symbol));
  if(constituents.length<400||constituents.length>600)throw new Error('Lista pública incompleta o no reconocida; no se sustituye por una lista de ejemplo.');
  const result={status:'available',provider:'datasets/s-and-p-500-companies (fuente pública basada en Wikipedia)',sourceUrl:PUBLIC_UNIVERSE_URL,capturedAt:new Date(now()).toISOString(),warning:restriction,constituents};
  publicUniverseCache={at:now(),result};return result;
}
module.exports = { loadFundamentals, loadSp500, csvRows, normalize };
