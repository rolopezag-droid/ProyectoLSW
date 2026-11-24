const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { evaluateVerticalSpread } = require('../../quant-service/src/services/vertical-spread');

async function until(predicate) {
  for (let i=0;i<1000;i++) { if (predicate()) return; await new Promise(resolve=>setTimeout(resolve,2)); }
  throw new Error('La interfaz no completó la operación esperada.');
}

function page({ evaluate, missingQuotes = false, missingMultiplier = false, quoteSymbol, barsCount = 260, waitForCandles, extraStrike = false, universeSize = 0, scanFailures = false, articles = [], fundamentalsUnavailable = false } = {}) {
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost:3005',runScripts:'outside-only'}),w=dom.window,calls=[];
  w.structuredClone=structuredClone;Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});
  const expiration=new Date(Date.now()+45*86400000).toISOString().slice(0,10),timestamp=new Date().toISOString();
  const bars=Array.from({length:barsCount},(_,i)=>{const close=90+i*.05;return {timestamp:new Date(Date.now()-(barsCount-i)*86400000).toISOString(),open:close,high:close+1,low:close-1,close,volume:100};});
  const response=body=>({ok:true,status:200,json:async()=>body});
  w.fetch=async(url,options={})=>{
    const u=new URL(url,'http://localhost:3005');calls.push({url:u,options});
    if(u.pathname==='/api/research/universe/sp500')return response({provider:'fixture público',constituents:Array.from({length:universeSize},(_,i)=>({symbol:'T'+i,name:'Empresa '+i}))});
    if(u.pathname.endsWith('/market-snapshots'))return response({snapshots:{}});
    if(scanFailures&&u.searchParams.get('symbol')==='T399')throw new Error('Fallo controlado de proveedor');
    if(u.pathname==='/api/services/status')return response({});
    if(u.pathname.endsWith('/broker/candles')){const result=response({symbol:u.searchParams.get('symbol'),timeframe:'1Day',bars,complete:true,feed:'iex'});return waitForCandles?waitForCandles(result):result;}
    if(u.pathname.endsWith('/broker/quotes'))return response({symbol:quoteSymbol||u.searchParams.get('symbol'),referencePrice:100,referenceSource:'quote_midpoint',referenceTimestamp:timestamp});
    if(u.pathname.endsWith('/broker/options-chain')){
      const type=u.searchParams.get('type'),symbol=u.searchParams.get('symbol'),exp=u.searchParams.get('expiration');
      const make=(strike,bid,ask)=>({type,underlyingSymbol:symbol,expiration:exp,contractSymbol:`${symbol}-${type}-${strike}`,strike,bid,ask,timestamp,multiplier:100});
      const contracts=type==='call'?[make(95,8,8.2),make(105,3,3.2)]:[make(95,2,2.2),make(105,7,7.2)];
      if(extraStrike)contracts.push(type==='call'?make(110,1,1.2):make(110,10,10.2));
      if(missingQuotes)contracts.forEach(contract=>{contract.ask=null;});
      if(missingMultiplier)contracts.forEach(contract=>{delete contract.multiplier;});
      return response({contracts,nextPageToken:null});
    }
    if(u.pathname.endsWith('/options-chain/expirations'))return response({expirations:[expiration],complete:true});
    if(u.pathname.endsWith('/broker/news'))return response({articles,capturedAt:timestamp});
    if(u.pathname==='/api/research/fundamentals')return response({status:'available',provider:'simulado',capturedAt:timestamp,rows:u.searchParams.get('symbols').split(',').map(symbol=>fundamentalsUnavailable?{symbol,status:'unavailable',error:'FMP alcanzó el límite de consultas.',metrics:{}}:({symbol,status:'available',metrics:{revenueGrowth:10,netIncomeGrowth:8,roe:.2,netMargin:.15,debtEquity:1,currentRatio:1.5,pe:20,pb:2}}))});
    if(u.pathname.endsWith('/strategies/evaluate')){
      const body=JSON.parse(options.body);
      if(evaluate)return evaluate(body,response);
      return response(evaluateVerticalSpread(body));
    }
    return response({});
  };
  for(const script of w.document.querySelectorAll('script')){
    if(script.src)w.eval(fs.readFileSync(path.join(__dirname,'../public',new URL(script.src).pathname.replace(/^\//,'')),'utf8'));
    else w.eval(script.textContent);
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.document.getElementById('expiration').value=expiration;
  w.document.getElementById('researchMode').value='company';
  w.document.getElementById('researchMinRR').value='0';
  return {dom,w,calls,expiration};
}

async function analyze(w) {
  const button=w.document.getElementById('btnResearchAnalyze');button.click();
  await until(()=>!button.disabled&&!w.document.getElementById('researchEvidence').hidden);
}
function candidateButton(w,strategy) {
  return [...w.document.querySelectorAll('#researchCandidates tr[data-candidate]')].find(row=>row.cells[2].textContent.trim()===strategy)?.querySelector('button[data-explain-candidate]');
}

test('navegación simplificada sin calculadora, conexiones ni sondeo técnico en el cliente',async()=>{
 const {dom,w,calls}=page();try{
  const doc=w.document;
  assert.deepEqual([...doc.querySelectorAll('.tabs [data-page]')].map(button=>button.dataset.page),['inicio','mercado','comparar','operacion','historial']);
  for(const id of ['tab-quant','tab-btn-quant','workspaceConnection','servicesList','servicesStatus'])assert.equal(doc.getElementById(id),null);
  assert.equal(doc.querySelector('[data-page="conexiones"]'),null);
  assert.equal(w.WorkspaceNavigation.navigate('calculadora'),true);assert.equal(w.WorkspaceNavigation.current,'comparar');
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.some(call=>call.url.pathname==='/api/services/status'),false);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('top: catálogo completo, una mejor estrategia por empresa y filtros antes del top',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);$('researchMode').value='top';$('researchUniverse').value='custom';$('researchSymbols').value=[...$('tickerCatalog').options].map(option=>option.value).join(',');
  await analyze(w);
  const rows=[...w.document.querySelectorAll('#researchCandidates tr[data-candidate]')];
  assert.equal(rows.length,$('tickerCatalog').options.length);assert.equal(new Set(rows.map(row=>row.cells[1].textContent)).size,rows.length);
  $('researchMinRR').value='1.5';$('researchMinRR').dispatchEvent(new w.Event('input'));
  for(const row of w.document.querySelectorAll('#researchCandidates tr[data-candidate]'))assert.ok(Number(row.cells[5].textContent.slice(1))/Number(row.cells[6].textContent.slice(1))>=1.5);
  assert.match($('researchRankingStatus').textContent,/después de filtrar/);
  assert.equal(calls.some(call=>/\/broker\/(orders|spreads)$/.test(call.url.pathname)),false);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('solo Black-Scholes: ocultar técnico, no consultar noticias/fundamentales y no dibujar resistencias',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);$('researchModuleTechnical').checked=false;$('researchModuleNews').checked=false;
  await analyze(w);assert.equal($('researchTechnicalPanel').hidden,true);assert.equal($('researchNewsPanel').hidden,true);
  assert.ok([...w.document.querySelectorAll('[data-core-column="technical"]')].every(cell=>cell.hidden));
  assert.ok([...w.document.querySelectorAll('[data-core-column="blackScholes"]')].every(cell=>!cell.hidden));
  assert.equal(calls.some(call=>call.url.pathname.endsWith('/news')||call.url.pathname.includes('fundamentals')),false);
  assert.equal(w.document.querySelector('.technical-indicator[value="resistance"]'),null);
  candidateButton(w,'BULL CALL').click();await until(()=>$('researchCandidateValidation').dataset.state==='verified');
  assert.doesNotMatch($('researchCandidateWhy').textContent,/SMA20|Probabilidad histórica/);
  assert.doesNotMatch($('researchCandidateScore').textContent,/Técnico: alineación/);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('las cuatro sugerencias se trasladan con empresa, fecha, patas, primas y cantidad; no se envían órdenes',async()=>{
 const {dom,w,calls,expiration}=page();try{
  const $=id=>w.document.getElementById(id);await analyze(w);
  for(const strategy of ['BULL CALL','BULL PUT','BEAR CALL','BEAR PUT']){
   const row=[...w.document.querySelectorAll('#researchCandidates tr[data-candidate]')].find(item=>item.cells[2].textContent===strategy);
   const strikes=row.cells[4].textContent.split(' / ');
   row.querySelector('[data-prepare-candidate]').click();await until(()=>w.WorkspaceNavigation.current==='operacion'&&!row.querySelector('[data-prepare-candidate]').disabled);
   assert.equal($('symbol').value,'AAPL');assert.equal($('expiration').value,expiration);assert.equal($('strikeLong').value,strikes[0]);assert.equal($('strikeShort').value,strikes[1]);
   assert.ok(Number($('priceLong').value)>0);assert.ok(Number($('priceShort').value)>0);assert.equal($('quantity').value,'1');assert.equal($('multiplier').value,'100');
   $('btnEvaluate').click();await until(()=>$('resultsCard').style.display!=='none');assert.match($('resultsGrid').textContent,new RegExp(strategy.replaceAll(' ','_')));
   w.WorkspaceNavigation.navigate('comparar');
  }
  assert.equal(calls.some(call=>/\/broker\/(orders|spreads)$/.test(call.url.pathname)),false);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('vencimientos: catálogo real automático en un solo selector sincronizado',async()=>{
 const {dom,w,calls,expiration}=page();try{
  const $=id=>w.document.getElementById(id),select=$('researchExpiration');
  assert.equal(calls.filter(call=>call.url.pathname.endsWith('/options-chain/expirations')).length,0);
  w.WorkspaceNavigation.navigate('comparar');
  await until(()=>select.options.length>1&&!select.disabled);
  assert.equal(select.tagName,'SELECT');assert.equal(select.parentElement.querySelector('input[type="date"]'),null);
  assert.equal(select.parentElement.querySelector('button'),null);assert.equal(select.value,expiration);
  assert.equal($('expiration').value,expiration);assert.equal($('researchExpiration').value,expiration);
  assert.equal(calls.filter(call=>call.url.pathname.endsWith('/options-chain/expirations')).length,1);
  $('researchCompany').value='MSFT';$('researchCompany').dispatchEvent(new w.Event('change'));
  await until(()=>calls.some(call=>call.url.pathname.endsWith('/options-chain/expirations')&&call.url.searchParams.get('symbol')==='MSFT'));
  await until(()=>select.options.length>1&&!select.disabled&&calls.filter(call=>call.url.pathname.endsWith('/options-chain/expirations')).length===2);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('Nueva operación conserva la consulta manual y comparte el vencimiento',async()=>{
 const {dom,w,calls,expiration}=page();try{
  const $=id=>w.document.getElementById(id),input=$('expiration'),host=input.nextElementSibling,button=host.querySelector('button');
  button.click();await until(()=>!button.disabled);
  const select=host.querySelector('select');assert.equal(select.hidden,false);
  select.value=expiration;select.dispatchEvent(new w.Event('change'));
  assert.equal(input.value,expiration);assert.equal($('researchExpiration').value,expiration);
  assert.equal(calls.filter(call=>call.url.pathname.endsWith('/options-chain/expirations')).length,1);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('operación y presupuesto filtran inmediatamente las candidatas de la empresa',async()=>{
 const {dom,w}=page();try{
  const $=id=>w.document.getElementById(id);await analyze(w);
  $('researchStrategyFilter').value='BULL_PUT_SPREAD';$('researchStrategyFilter').dispatchEvent(new w.Event('change'));
  const rows=[...w.document.querySelectorAll('#researchCandidates tr[data-candidate]')];assert.equal(rows.length,1);assert.equal(rows[0].cells[2].textContent,'BULL PUT');
  $('researchMaxLoss').value='1';$('researchMaxLoss').dispatchEvent(new w.Event('input'));
  assert.equal(w.document.querySelectorAll('#researchCandidates tr[data-candidate]').length,0);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('la gráfica dibuja solo las curvas y líneas seleccionadas y las retira sin consultar de nuevo',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);
  const bars=Array.from({length:240},(_,i)=>{const close=100+Math.sin(i/6)*4;return {timestamp:new Date(Date.now()-(250-i)*86400000).toISOString(),open:close-.2,high:close+1,low:close-1,close,volume:10000};});
  w.renderCandles({symbol:'AAPL',timeframe:'1Day',periodLabel:'1 Año',bars,complete:true});
  const count=selector=>$('candlesChart').querySelectorAll(selector).length;
  assert.equal(count('[data-sma-period]'),0);assert.equal(count('[data-sma-legend]'),0);assert.equal(count('[data-level-kind]'),0);assert.equal(count('[data-chart-layer="last-price"]'),0);
  const requests=calls.length;
  for(const period of [20,50,200]){const input=$('chShowSma'+period);input.checked=true;input.dispatchEvent(new w.Event('change'));assert.equal(count('[data-sma-period="'+period+'"]'),1);assert.equal(count('[data-sma-legend="'+period+'"]'),1);}
  $('chShowSupportLines').checked=true;$('chShowSupportLines').dispatchEvent(new w.Event('change'));assert.ok(count('[data-level-kind="support"]')>0);
  $('chShowLastPrice').checked=true;$('chShowLastPrice').dispatchEvent(new w.Event('change'));assert.equal(count('[data-chart-layer="last-price"]'),1);
  for(const id of ['chShowSma20','chShowSma50','chShowSma200','chShowSupportLines','chShowLastPrice']){$(id).checked=false;$(id).dispatchEvent(new w.Event('change'));}
  assert.equal(count('[data-sma-period],[data-sma-legend],[data-level-kind],[data-chart-layer="last-price"]'),0);assert.equal($('candlesLevelsNote').textContent,'');assert.equal(calls.length,requests);
  $('chShowSma20').checked=true;$('chShowSupportLines').checked=true;$('researchModuleTechnical').checked=false;$('researchModuleTechnical').dispatchEvent(new w.Event('change'));
  assert.equal(count('[data-sma-period],[data-level-kind]'),0);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('solo noticias: sin top artificial ni consulta de histórico técnico',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);$('researchMode').value='top';$('researchUniverse').value='custom';
  $('researchModuleTechnical').checked=false;$('researchModuleBlackScholes').checked=false;await analyze(w);
  assert.equal(w.document.querySelectorAll('#researchCandidates tr[data-candidate]').length,0);
  assert.equal(calls.some(call=>call.url.pathname.endsWith('/candles')),false);
  assert.equal($('researchNewsPanel').hidden,false);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});


test('lista manual admite separadores, duplica cero tickers y permite empresas fuera del catálogo',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);$('researchMode').value='list';$('researchMode').dispatchEvent(new w.Event('change'));
  assert.equal($('researchSymbols').hidden,false);assert.equal($('researchUniverseField').hidden,true);
  $('researchSymbols').value='dell; ibm AAPL,DELL';await analyze(w);
  const requested=new Set(calls.filter(call=>call.url.pathname.endsWith('/quotes')).map(call=>call.url.searchParams.get('symbol')));
  assert.deepEqual([...requested],['DELL','IBM','AAPL']);
  assert.equal([...w.document.querySelectorAll('#researchCandidates tr')].some(row=>row.textContent.includes('DELL')),true);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('S&P completo intenta 400 empresas, identifica cobertura parcial y cambiar filtros exige repetir',async()=>{
 const {dom,w,calls}=page({universeSize:400,scanFailures:true,fundamentalsUnavailable:true,articles:[{id:1,headline:'Finalista raises guidance',symbols:['T0']},{id:2,headline:'Fuera del Top',symbols:['T398']},{id:3,headline:'Sin ticker asociado',symbols:[]}]});try{
  const $=id=>w.document.getElementById(id);$('researchMode').value='top';$('researchUniverse').value='sp500';$('researchModuleFinancial').checked=true;
  $('btnResearchAnalyze').click();
  for(let i=0;i<10000&&$('btnResearchAnalyze').disabled;i++)await new Promise(resolve=>setTimeout(resolve,2));
  assert.equal($('btnResearchAnalyze').disabled,false);
  assert.equal(new Set(calls.filter(call=>call.url.pathname.endsWith('/quotes')).map(call=>call.url.searchParams.get('symbol'))).size,400);
  assert.match($('researchStatus').textContent,/Cobertura parcial: 1 errores/);
  assert.match($('researchCoreSummary').textContent,/400 empresas.*399 tuvieron datos/);
  assert.equal(calls.some(call=>call.url.pathname.endsWith('/market-snapshots')),false,'Movimiento desmarcado no debe consultar snapshots');
  const visible=()=>[...w.document.querySelectorAll('#researchCandidates tr[data-candidate]')];
  assert.equal(visible().length,10);
  assert.equal($('researchMetrics').querySelectorAll('.research-ticker-card').length,10);
  assert.equal($('researchFinancialRows').querySelectorAll('article').length,10);
  assert.equal($('researchCompareSymbol').options.length,10);
  assert.match($('researchTopReasons').textContent,/Supera al segundo lugar|Empata en puntuación/);
  assert.match($('researchNews').textContent,/Finalista raises guidance/);
  assert.doesNotMatch($('researchNews').textContent,/Fuera del Top|Sin ticker asociado/);
  const fundamentalCalls=calls.filter(call=>call.url.pathname==='/api/research/fundamentals');
  const requestedFundamentals=fundamentalCalls.flatMap(call=>call.url.searchParams.get('symbols').split(','));
  assert.match($('researchFinancialRows').textContent,/límite de consultas/);
  assert.equal(visible().length,10,'La falta de FMP no elimina ni altera el Top previamente elegido');
  assert.equal(requestedFundamentals.length,10);assert.deepEqual(requestedFundamentals,visible().map(row=>row.cells[1].textContent));
  const firstFmp=calls.findIndex(call=>call.url.pathname==='/api/research/fundamentals');
  assert.ok(firstFmp>calls.findLastIndex(call=>call.url.pathname.endsWith('/quotes')),'FMP solo después de recorrer las 400 empresas');
  assert.match($('researchCoreSummary').textContent,/fundamental es contexto complementario/);
  const firstTen=visible().map(row=>({index:row.dataset.candidate,text:row.textContent})),requests=calls.length;
  $('btnResearchShowAll').click();assert.equal(visible().length,399);
  assert.equal($('researchMetrics').querySelectorAll('.research-ticker-card').length,399);
  assert.equal($('researchFinancialRows').querySelectorAll('article').length,10,'Ver todos no consulta fundamentales fuera de las finalistas');
  assert.match($('researchNews').textContent,/Fuera del Top/);
  $('btnResearchShowAll').click();assert.deepEqual(visible().map(row=>({index:row.dataset.candidate,text:row.textContent})),firstTen);
  assert.equal(calls.length,requests,'Cambiar alcance no repite consultas');
  assert.equal($('researchStrategiesTitle').closest('section').previousElementSibling.id,'researchNewsPanel');
  $('researchMinRR').value='1.5';$('researchMinRR').dispatchEvent(new w.Event('input'));
  assert.equal($('researchEvidence').hidden,true);assert.match($('researchStatus').textContent,/Vuelve a analizar/);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('cancelar el recorrido descarta respuestas tardías y no muestra un top incompleto',async()=>{
 let release;const {dom,w}=page({universeSize:400,waitForCandles:result=>new Promise(resolve=>{release=()=>resolve(result);})});try{
  const $=id=>w.document.getElementById(id);$('researchMode').value='top';$('btnResearchAnalyze').click();await until(()=>release);
  $('btnResearchCancel').click();release();await until(()=>!$('btnResearchAnalyze').disabled);
  assert.equal($('researchEvidence').hidden,true);assert.match($('researchStatus').textContent,/cancelado/);assert.equal($('researchCancel')?.hidden??true,true);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('noticias reales del flujo cargan el clasificador y muestran el motivo sin romper resultados',async()=>{
 const {dom,w}=page({articles:[{headline:'GF Securities Lowers Price Target on Dell Technologies',summary:'Concerns over spending slowdowns.',symbols:['DELL'],url:'https://example.com/news',created_at:new Date().toISOString()}]});try{
  await analyze(w);assert.match(w.document.getElementById('researchNews').textContent,/Posible sesgo bajista/);assert.match(w.document.getElementById('researchNews').textContent,/lowers price target/);
  assert.doesNotMatch(w.document.getElementById('researchStatus').textContent,/Cannot read/);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('S&P con solo fundamental solicita otro core antes de consumir consultas',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);$('researchMode').value='top';$('researchUniverse').value='sp500';
  $('researchModuleTechnical').checked=false;$('researchModuleBlackScholes').checked=false;$('researchModuleNews').checked=false;$('researchModuleFinancial').checked=true;
  const before=calls.length;$('btnResearchAnalyze').click();
  assert.equal(calls.length,before);assert.match($('researchStatus').textContent,/selecciona Técnico, Black-Scholes o Movimiento/);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});
