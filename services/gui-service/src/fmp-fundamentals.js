const {createFmpClient}=require('./fmp-client');
const clients=new WeakMap();
const SP500_CACHE_TTL_MS=24*60*60*1000;
function clientFor(fetchImpl,now){if(!clients.has(fetchImpl))clients.set(fetchImpl,createFmpClient({fetchImpl,now}));return clients.get(fetchImpl);}

function finite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
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
  const capturedAt = new Date(now()).toISOString(),client=clientFor(fetchImpl,now);
  const rows = await Promise.all([...new Set(symbols)].map(async symbol => {
    const endpoints=['key-metrics','ratios','income-statement','profile'];
    const results=await Promise.allSettled(endpoints.map(endpoint=>client.request(endpoint,symbol,apiKey)));
    const resources=results.map(result=>result.status==='fulfilled'?result.value:null);
    const [metrics,ratios,statements,profiles]=resources.map(result=>result?.data||[]);
    const row=normalize(symbol,metrics,ratios,statements);
    row.provider='Financial Modeling Prep';row.companyName=profiles[0]?.companyName||null;
    row.metrics.marketCap=row.metrics.marketCap??finite(profiles[0]?.marketCap);
    row.coverage=Object.values(row.metrics).filter(Number.isFinite).length+'/10 métricas';
    row.warnings=[...new Set(results.flatMap(result=>result.status==='rejected'?[result.reason.message]:result.value.warning?[result.value.warning]:[]))];
    row.stale=resources.some(result=>result?.stale);
    const timestamps=resources.filter(result=>result?.data.length).map(result=>result.capturedAt).sort();
    row.dataCapturedAt=timestamps[0]||null;
    if(row.stale)row.warnings.unshift('Datos previamente obtenidos en caché, sin actualizar. Consulta original: '+row.dataCapturedAt+'.');
    row.issues=results.flatMap((result,index)=>result.status==='rejected'?[{endpoint:endpoints[index],code:result.reason.code,retryAt:result.reason.retryAt}]:result.value.code?[{endpoint:endpoints[index],code:result.value.code,retryAt:result.value.retryAt}]:[]);
    row.status=Object.values(row.metrics).some(Number.isFinite)?'available':'unavailable';
    if(row.status==='unavailable')row.error=row.warnings.join(' ')||'El proveedor no devolvió métricas reconocidas para este ticker.';
    return row;
  }));
  const providerState=client.getStatus(apiKey);
  return {status:rows.some(row=>row.status==='available')?'available':'unavailable',provider:'Financial Modeling Prep',capturedAt,providerState,error:providerState.status==='paused'?providerState.message:undefined,rows};
}

async function loadFinancialStatements(symbols, apiKey, { fetchImpl = global.fetch, now = Date.now } = {}) {
  if (!apiKey) return { status:'unavailable', provider:'Financial Modeling Prep', capturedAt:new Date(now()).toISOString(), error:'FMP_API_KEY no está configurada en el servidor.', rows:[] };
  const capturedAt=new Date(now()).toISOString(),client=clientFor(fetchImpl,now);
  const endpoints=['income-statement','balance-sheet-statement','cash-flow-statement'];
  const rows=await Promise.all([...new Set(symbols)].map(async symbol=>{
    const results=await Promise.allSettled(endpoints.map(endpoint=>client.request(endpoint,symbol,apiKey)));
    const data=results.map(result=>result.status==='fulfilled'?result.value.data||[]:[]);
    const [income,balance,cash]=data.map(list=>list[0]||{});
    const num=value=>finite(value);
    const ratio=(a,b)=>Number.isFinite(num(a))&&Number.isFinite(num(b))&&num(b)!==0?num(a)/num(b):null;
    const metrics={
      revenue:num(income.revenue),netIncome:num(income.netIncome),operatingIncome:num(income.operatingIncome),interestExpense:num(income.interestExpense),
      currentAssets:num(balance.totalCurrentAssets),currentLiabilities:num(balance.totalCurrentLiabilities),totalDebt:num(balance.totalDebt),equity:num(balance.totalStockholdersEquity),
      operatingCashFlow:num(cash.operatingCashFlow),freeCashFlow:num(cash.freeCashFlow),capitalExpenditure:num(cash.capitalExpenditure),
      currentRatio:ratio(balance.totalCurrentAssets,balance.totalCurrentLiabilities),debtToEquity:num(balance.totalStockholdersEquity)>0?ratio(balance.totalDebt,balance.totalStockholdersEquity):null,
      interestCoverage:ratio(income.operatingIncome,Math.abs(num(income.interestExpense))),cashConversion:ratio(cash.operatingCashFlow,income.netIncome),
    };
    const warnings=results.flatMap((result,index)=>result.status==='rejected'?[`${endpoints[index]}: ${result.reason.message}`]:result.value.warning?[result.value.warning]:[]);
    const timestamps=results.flatMap(result=>result.status==='fulfilled'&&result.value.data.length?[result.value.capturedAt]:[]).sort();
    return {symbol,status:Object.values(metrics).some(Number.isFinite)?'available':'unavailable',period:income.period||balance.period||cash.period||null,dataDate:income.date||balance.date||cash.date||null,metrics,provider:'Financial Modeling Prep',capturedAt:timestamps[0]||capturedAt,stale:results.some(result=>result.status==='fulfilled'&&result.value.stale),warnings,error:results.every(result=>result.status==='rejected')?warnings.join(' '):undefined};
  }));
  return {status:rows.some(row=>row.status==='available')?'available':'unavailable',provider:'Financial Modeling Prep',capturedAt,rows,error:rows.every(row=>row.status!=='available')?'FMP no devolvió estados financieros utilizables.':undefined};
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
  let response;
  try{response=await fetchImpl(PUBLIC_UNIVERSE_URL,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Catálogo público no disponible.');}
  catch{
    if(!apiKey)throw new Error('No se pudo consultar el catálogo público del S&P 500.');
    const fallback=await clientFor(fetchImpl,now).request('sp500-constituent','',apiKey);
    const constituents=fallback.data.map(item=>({symbol:String(item.symbol||'').trim().toUpperCase(),name:String(item.name||item.companyName||'')}));
    const unique=[...new Map(constituents.filter(item=>/^[A-Z0-9.-]{1,12}$/.test(item.symbol)).map(item=>[item.symbol,item])).values()];
    if(unique.length<400||unique.length>600)throw new Error('FMP devolvió un catálogo incompleto del S&P 500.');
    return {status:'available',provider:'Financial Modeling Prep',capturedAt:fallback.capturedAt,constituents:unique,stale:fallback.stale};
  }
  const [headers,...records]=csvRows(await response.text());
  const symbolIndex=headers.indexOf('Symbol'),nameIndex=headers.indexOf('Security');
  if(symbolIndex<0||nameIndex<0)throw new Error('El catálogo público cambió de formato.');
  const seen=new Set();
  const constituents=records.map(row=>({symbol:String(row[symbolIndex]||'').trim().toUpperCase(),name:row[nameIndex]||''})).filter(row=>/^[A-Z0-9.-]{1,12}$/.test(row.symbol)&&!seen.has(row.symbol)&&seen.add(row.symbol));
  if(constituents.length<400||constituents.length>600)throw new Error('Lista pública incompleta o no reconocida; no se sustituye por una lista de ejemplo.');
  const result={status:'available',provider:'datasets/s-and-p-500-companies (fuente pública basada en Wikipedia)',sourceUrl:PUBLIC_UNIVERSE_URL,capturedAt:new Date(now()).toISOString(),constituents};
  publicUniverseCache={at:now(),result};return result;
}
module.exports = { loadFundamentals, loadFinancialStatements, loadSp500, csvRows, normalize };
