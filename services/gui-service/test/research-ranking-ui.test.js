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

function page({ evaluate, missingQuotes = false, missingMultiplier = false, quoteSymbol, barsCount = 260, waitForCandles, extraStrike = false, universeSize = 0, scanFailures = false, articles = [], fundamentalsUnavailable = false, fundamentalsMissingKey = false, newsArticles } = {}) {
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
    if(u.pathname.endsWith('/broker/news'))return response({articles:newsArticles??articles,capturedAt:timestamp});
    if(u.pathname==='/api/research/fundamentals'&&fundamentalsMissingKey)return response({status:'unavailable',rows:[],error:'FMP_API_KEY no está configurada en el servidor.'});
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

test('muestra la etiqueta de sentimiento recibida y filtra noticias por clasificación',async()=>{
 const newsArticles=[
  {headline:'AAPL beats estimates',summary:'Revenue grows.',source:'Example',symbols:['AAPL'],sentiment:{label:'bullish',confidence:'medium',signals:{bullish:['beats estimates'],bearish:[]}}},
  {headline:'AAPL cuts guidance',summary:'',source:'Example',symbols:['AAPL'],sentiment:{label:'bearish',confidence:'low',signals:{bullish:[],bearish:['cuts guidance']}}},
 ];
 const {dom,w}=page({newsArticles});try{
  await analyze(w);
  const $=id=>w.document.getElementById(id);
  assert.equal(w.document.querySelectorAll('#researchNews .research-news-item').length,2);
  assert.match(w.document.querySelector('.research-sentiment-badge').textContent,/Alcista · nivel heurístico media/);
  assert.match($('researchNewsStatus').textContent,/1 alcistas, 1 bajistas/);
  $('researchNewsFilter').value='bearish';$('researchNewsFilter').dispatchEvent(new w.Event('change'));
  assert.equal(w.document.querySelectorAll('#researchNews .research-news-item').length,1);
  assert.match(w.document.querySelector('#researchNews .research-news-item').textContent,/AAPL cuts guidance/);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('navegación simplificada sin calculadora, conexiones ni sondeo técnico en el cliente',async()=>{
 const {dom,w,calls}=page();try{
  const doc=w.document;
  assert.deepEqual([...doc.querySelectorAll('.tabs [data-page]')].map(button=>button.dataset.page),['inicio','comparar','operacion','historial']);
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

test('Black-Scholes no se ofrece; movimiento funciona sin técnico ni probabilidad de modelo',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);$('researchModuleTechnical').checked=false;$('researchModuleTechnical').dispatchEvent(new w.Event('change'));$('researchModuleNews').checked=false;$('researchModuleMovers').checked=true;
  assert.equal($('researchModuleBlackScholes'),null);assert.equal($('researchBsCaveat'),null);
  const compare=w.ResearchAnalysis.compareStrategies;let verifiedModels=false;
  w.ResearchAnalysis.compareStrategies=(contracts,context)=>{assert.equal(context.includeBlackScholes,false);const rows=compare(contracts,context);assert.ok(rows.every(row=>row.blackScholes===null));verifiedModels=true;return rows;};
  await analyze(w);assert.equal($('researchTechnicalPanel').hidden,true);assert.equal($('researchNewsPanel').hidden,true);
  assert.ok([...w.document.querySelectorAll('[data-core-column="technical"]')].every(cell=>cell.hidden));
  assert.equal(w.document.querySelectorAll('[data-core-column="blackScholes"]').length,0);
  assert.equal($('researchMinProb').closest('div').hidden,true);
  assert.equal(verifiedModels,true);
  assert.equal(calls.some(call=>call.url.pathname.endsWith('/news')||call.url.pathname.includes('fundamentals')),false);
  assert.equal(w.document.querySelector('.technical-indicator[value="resistance"]'),null);
  candidateButton(w,'BULL CALL').click();await until(()=>$('researchCandidateValidation').dataset.state==='verified');
  assert.doesNotMatch($('researchCandidateWhy').textContent,/SMA20|Probabilidad histórica/);
  assert.doesNotMatch($('researchCandidateScore').textContent,/Técnico: alineación|Black-Scholes/);
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
   const chosen=strategy.replaceAll(' ','_')+'_SPREAD',beforePrice=$('priceLong').value;
   for(const chip of w.document.querySelectorAll('.strategy-chip')){
    assert.equal(chip.tagName,'BUTTON');assert.equal(chip.disabled,chip.dataset.strategy!==chosen);
    assert.equal(chip.getAttribute('aria-disabled'),String(chip.disabled));
    if(chip.disabled){chip.click();chip.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));}
   }
   assert.equal(w.document.querySelector('.strategy-chip.active').dataset.strategy,chosen);assert.equal($('priceLong').value,beforePrice);
   assert.equal($('preparedStrategyNotice').hidden,false);
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
  $('researchModuleTechnical').checked=false;await analyze(w);
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
  $('researchModuleTechnical').checked=false;$('researchModuleNews').checked=false;$('researchModuleFinancial').checked=true;
  const before=calls.length;$('btnResearchAnalyze').click();
  assert.equal(calls.length,before);assert.match($('researchStatus').textContent,/selecciona Técnico, Indicadores, Monte Carlo o Movimiento/);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('un ticker conserva el aviso real cuando FMP no devuelve filas por configuración faltante',async()=>{
 const {dom,w}=page({fundamentalsMissingKey:true});try{
  const $=id=>w.document.getElementById(id);$('researchModuleFinancial').checked=true;await analyze(w);
  assert.match($('researchFinancialStatus').textContent,/FMP_API_KEY/);
  assert.match($('researchFinancialRows').textContent,/no está configurada/);
  assert.doesNotMatch($('researchStatus').textContent,/Cannot read/);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('filtro encuentra noticias después de las primeras veinte sin red adicional',async()=>{
 const newsArticles=Array.from({length:25},(_,i)=>({headline:'Noticia '+i,symbols:['AAPL'],sentiment:{label:i===24?'bearish':'bullish',confidence:'low',signals:{bullish:[],bearish:[]}}}));
 const {dom,w,calls}=page({newsArticles});try{
  await analyze(w);const before=calls.length;
  const select=w.document.getElementById('researchNewsFilter');select.value='bearish';select.dispatchEvent(new w.Event('change'));
  assert.equal(w.document.querySelectorAll('#researchNews .research-news-item').length,1);
  assert.match(w.document.getElementById('researchNews').textContent,/Noticia 24/);assert.equal(calls.length,before);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('el acceso a envío abre Paper sin evaluar, enviar órdenes ni perder los datos',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);w.WorkspaceNavigation.navigate('operacion');
  $('priceLong').value='12.34';const before=calls.length;
  assert.equal($('operationExecution').open,false);$('btnGoToOrder').click();
  assert.equal(w.WorkspaceNavigation.current,'operacion');assert.equal($('operationExecution').open,true);
  assert.equal(w.document.activeElement,$('operationExecution').querySelector('summary'));
  assert.equal($('priceLong').value,'12.34');assert.equal(calls.length,before);
  assert.equal(calls.some(call=>/\/broker\/(orders|spreads)$/.test(call.url.pathname)),false);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('salir del bloqueo permite selección manual y descarta las primas y evaluación anteriores',async()=>{
 const {dom,w}=page();try{
  const $=id=>w.document.getElementById(id);await analyze(w);
  const row=w.document.querySelector('#researchCandidates tr[data-candidate]');row.querySelector('[data-prepare-candidate]').click();await until(()=>w.WorkspaceNavigation.current==='operacion');
  assert.equal([...w.document.querySelectorAll('.strategy-chip')].filter(chip=>chip.disabled).length,3);
  $('btnUnlockStrategy').click();assert.ok([...w.document.querySelectorAll('.strategy-chip')].every(chip=>!chip.disabled));
  assert.equal($('preparedStrategyNotice').hidden,true);assert.equal($('strikeLong').disabled,false);assert.equal($('strikeShort').disabled,false);assert.equal($('priceLong').value,'');assert.equal($('priceShort').value,'');assert.equal($('resultsCard').style.display,'none');
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('una preparación cancelada no repone primas después de desbloquear el selector',async()=>{
 const {dom,w}=page();try{
  const $=id=>w.document.getElementById(id);await analyze(w);let captured;
  const prepare=w.prepareResearchOperation;w.prepareResearchOperation=(candidate,spot)=>{captured=candidate;return prepare(candidate,spot);};
  w.document.querySelector('[data-prepare-candidate]').click();await until(()=>w.WorkspaceNavigation.current==='operacion');
  const fetch=w.fetch;let release;
  w.fetch=async(url,options)=>{const response=await fetch(url,options);return String(url).includes('/broker/options-chain/strikes?')?new Promise(resolve=>{release=()=>resolve(response);}):response;};
  const pending=prepare(captured,100).then(()=>null,error=>error);
  await until(()=>release);$('btnUnlockStrategy').click();release();const error=await pending;
  assert.match(error.message,/Cambió la selección/);assert.equal($('priceLong').value,'');assert.equal($('priceShort').value,'');
  assert.ok([...w.document.querySelectorAll('.strategy-chip')].every(chip=>!chip.disabled));
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});


test('análisis integrado conserva enlaces antiguos y gráfica junto a comparación',async()=>{
 const {dom,w}=page();try{
  const doc=w.document;
  for(const link of ['mercado','candles','comparar','research']){
   assert.equal(w.WorkspaceNavigation.navigate(link),true);
   assert.equal(w.WorkspaceNavigation.current,'comparar');
   assert.equal(doc.getElementById('chSymbol').closest('.workspace-page'),doc.getElementById('researchCompany').closest('.workspace-page'));
   assert.equal(doc.getElementById('researchCompany').closest('.workspace-page').hidden,false);
  }
  doc.getElementById('chSymbol').value='MSFT';doc.getElementById('chSymbol').dispatchEvent(new w.Event('change'));
  assert.equal(doc.getElementById('researchCompany').value,'MSFT');
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('seleccionar empresa del ranking carga su gráfica sin borrar candidatas ni enviar órdenes',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);
  $('researchMode').value='list';$('researchSymbols').value='AAPL, MSFT';
  await analyze(w);
  const before=$('researchCandidates').querySelectorAll('tr[data-candidate]').length;
  const row=[...$('researchCandidates').querySelectorAll('tr[data-candidate]')].find(row=>row.cells[1].textContent==='MSFT');
  assert.ok(row);$('chTimeframe').value='12Month';row.cells[1].click();
  assert.equal($('chSymbol').value,'MSFT');
  await until(()=>calls.some(call=>call.url.pathname.endsWith('/broker/candles')&&call.url.searchParams.get('symbol')==='MSFT'&&call.url.searchParams.has('limit')));
  await until(()=>w.__candlesChartState?.symbol==='MSFT');
  assert.ok(w.__candlesChartState.candles.length>0);
  assert.equal($('researchCandidates').querySelectorAll('tr[data-candidate]').length,before);
  assert.equal($('researchEvidence').hidden,false);
  assert.equal(calls.some(call=>/\/broker\/(orders|spreads)$/.test(call.url.pathname)),false);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});


test('pantalla continua conserva gráfica y ranking y abre la revisión independiente',async()=>{
 const {dom,w}=page();try{
  const $=id=>w.document.getElementById(id);
  w.WorkspaceNavigation.navigate('comparar');
  assert.equal(w.document.querySelector('[data-analysis-step]'),null);
  assert.equal($('analysisMarket').closest('.workspace-page'),$('researchCandidates').closest('.workspace-page'));
  await analyze(w);
  const count=$('researchCandidates').children.length;
  $('researchCandidates').querySelector('[data-explain-candidate]').click();
  assert.equal(w.WorkspaceNavigation.current,'comparar');
  assert.equal($('analysisMarket').closest('.workspace-page').hidden,false);
  assert.equal($('researchCandidateExplanation').hidden,false);
  assert.equal($('researchEvidence').hidden,false);
  assert.equal($('researchCandidates').children.length,count);
  const prepare=$('researchCandidates').querySelector('[data-prepare-candidate]');prepare.click();
  await until(()=>!prepare.disabled&&w.WorkspaceNavigation.current==='operacion');
  assert.equal($('tab-candles').hidden,true);
  assert.equal($('tab-strategy').hidden,false);
  assert.equal($('orderRiskSummary').closest('.operation-layout'),$('strategyForm').closest('.operation-layout'));
  $('btnEvaluate').click();
  await until(()=>$('orderRiskMetrics').children.length>0);
  assert.match($('orderRiskMetrics').textContent,/Pérdida|Ganancia/);
  $('quantity').value='2';$('quantity').dispatchEvent(new w.Event('input'));
  await until(()=>$('orderRiskMetrics').children.length===0);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});


test('Monte Carlo de main participa como módulo opcional sin restaurar Black-Scholes',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);
  $('researchModuleTechnical').checked=false;$('researchModuleMonteCarlo').checked=true;$('researchModuleNews').checked=false;
  $('researchModuleMonteCarlo').dispatchEvent(new w.Event('change'));
  assert.match(w.document.querySelector('label[for="researchMinProb"]').textContent,/Monte Carlo/);
  await analyze(w);
  assert.equal($('researchMonteCarloPanel').hidden,false);
  assert.ok($('researchMonteCarloResults').textContent.length>0);
  assert.equal($('researchModuleBlackScholes'),null);
  assert.equal($('researchTechnicalPanel').hidden,true);
  assert.ok(calls.some(call=>call.url.pathname.endsWith('/broker/candles')));
  assert.equal(calls.some(call=>/\/broker\/(orders|spreads)$/.test(call.url.pathname)),false);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});


test('noticias explican coincidencias y contradicciones Bull/Bear en el ranking y detalle',async()=>{
 const {dom,w,calls}=page({newsArticles:[{id:'event-1',symbols:['AAPL'],headline:'Results beat expectations',created_at:new Date().toISOString(),url:'https://example.com/event',sentiment:{label:'bullish',confidence:'low',explanation:'Clasificación de prueba'}}]});try{
  await analyze(w);
  const rows=[...w.document.querySelectorAll('#researchCandidates tr[data-candidate]')];
  const bull=rows.find(row=>row.cells[2].textContent.includes('BULL CALL'));
  const bear=rows.find(row=>row.cells[2].textContent.includes('BEAR CALL'));
  assert.equal(bull.querySelector('.news-confluence').dataset.state,'agreement');
  assert.match(bull.querySelector('.news-confluence').textContent,/Noticias alcistas frente a Bull Call.*direcciones coincidentes/);
  const bullPut=rows.find(row=>row.cells[2].textContent.includes('BULL PUT'));
  assert.match(bullPut.querySelector('.news-confluence').textContent,/frente a Bull Put/);
  assert.equal(bear.querySelector('.news-confluence').dataset.state,'contradiction');
  assert.match(bear.querySelector('.news-confluence').textContent,/Noticias alcistas frente a Bear Call.*direcciones opuestas/);
  bear.querySelector('[data-explain-candidate]').click();
  assert.match(w.document.getElementById('researchCandidateWhy').textContent,/contradice la dirección/);
  assert.ok(w.document.querySelector('#researchCandidateWhy a[href="https://example.com/event"]'));
  assert.equal(calls.some(call=>/\/broker\/(orders|spreads)$/.test(call.url.pathname)),false);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});


test('la gráfica precede los filtros de comparación y las noticias desmarcadas no se consultan ni aparecen',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);
  const layout=w.document.querySelector('.continuous-analysis');
  assert.equal(layout.firstElementChild,$('analysisMarket'));
  assert.ok($('analysisMarket').compareDocumentPosition($('researchMode'))&w.Node.DOCUMENT_POSITION_FOLLOWING);
  $('researchModuleNews').checked=false;$('researchModuleNews').dispatchEvent(new w.Event('change'));
  await analyze(w);
  assert.equal($('researchNewsPanel').hidden,true);
  assert.equal(calls.some(call=>call.url.pathname.endsWith('/broker/news')),false);
  assert.equal(w.document.querySelector('.news-confluence'),null);
  assert.ok([...w.document.querySelectorAll('[data-core-column="news"]')].every(cell=>cell.hidden));
  $('researchCandidates').querySelector('[data-explain-candidate]').click();
  assert.equal($('researchCandidateWhy').querySelector('.news-confluence-detail'),null);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});


test('sin core técnico una candidata no deja señales técnicas activas en la gráfica',async()=>{
 const {dom,w}=page();try{
  const $=id=>w.document.getElementById(id);
  await analyze(w);$('researchCandidates').querySelector('[data-explain-candidate]').click();
  const bars=Array.from({length:260},(_,i)=>({timestamp:new Date(Date.now()-(261-i)*86400000).toISOString(),open:100+i*.1,high:102+i*.1,low:99+i*.1,close:101+i*.1,volume:100}));
  w.__candlesChartState={symbol:'AAPL',timeframe:'1Day',candles:bars};
  $('researchModuleTechnical').checked=false;
  const overlays=w.__candleOverlaySource();
  assert.deepEqual(Array.from(overlays.technicalSignals),[]);assert.deepEqual(Array.from(overlays.entries),[]);assert.deepEqual(Array.from(overlays.exits),[]);
  assert.match(overlays.note,/Core de indicadores no seleccionado/);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});


test('indicadores marcados activan el core y se dibujan; apagar core limpia selección y conserva último cierre',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);
  const bars=Array.from({length:240},(_,i)=>{const close=100+Math.sin(i/6)*4;return {timestamp:new Date(Date.now()-(250-i)*86400000).toISOString(),open:close-.2,high:close+1,low:close-1,close,volume:10000};});
  w.renderCandles({symbol:'AAPL',timeframe:'1Day',periodLabel:'1 Año',bars,complete:true});
  const count=selector=>$('candlesChart').querySelectorAll(selector).length;
  $('researchModuleTechnical').checked=false;$('researchModuleTechnical').dispatchEvent(new w.Event('change'));
  assert.ok([...w.document.querySelectorAll('.technical-indicator')].every(input=>!input.checked));
  const requests=calls.length;
  $('chShowLastPrice').checked=true;$('chShowLastPrice').dispatchEvent(new w.Event('change'));
  assert.equal($('researchModuleTechnical').checked,false);assert.equal(count('[data-chart-layer="last-price"]'),1);
  for(const period of [20,50,200]){
   $('chShowSma'+period).checked=true;$('chShowSma'+period).dispatchEvent(new w.Event('change'));
   assert.equal($('researchModuleTechnical').checked,true);assert.equal(count('[data-sma-period="'+period+'"]'),1);
  }
  $('chShowSupportLines').checked=true;$('chShowSupportLines').dispatchEvent(new w.Event('change'));
  assert.ok(count('[data-level-kind="support"]')>0);
  $('researchModuleTechnical').checked=false;$('researchModuleTechnical').dispatchEvent(new w.Event('change'));
  assert.equal(count('[data-sma-period],[data-level-kind]'),0);
  assert.ok(['chShowSma20','chShowSma50','chShowSma200','chShowSupportLines'].every(id=>!$(id).checked));
  assert.equal(count('[data-chart-layer="last-price"]'),1);assert.equal(calls.length,requests);
  assert.match($('chartTechnicalStatus').textContent,/desactivado/);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});

test('activar indicador con core apagado invalida comparación anterior sin consultar ni enviar órdenes',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);
  $('researchModuleTechnical').checked=false;$('researchModuleMovers').checked=true;await analyze(w);
  assert.equal($('researchEvidence').hidden,false);const count=calls.length;
  $('chShowSma20').checked=true;$('chShowSma20').dispatchEvent(new w.Event('change'));
  assert.equal($('researchModuleTechnical').checked,true);assert.equal($('researchEvidence').hidden,true);
  assert.match($('chartTechnicalStatus').textContent,/vuelve a analizar/);assert.equal(calls.length,count);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});


test('el bloque de entradas y salidas se retira sin perder comparación ni explicación',async()=>{
 const {dom,w}=page();try{
  for(const id of ['chShowTriggers','chTriggerStrategy','candidateSignalStatus'])assert.equal(w.document.getElementById(id),null);
  await analyze(w);w.document.querySelector('[data-explain-candidate]').click();
  assert.equal(w.document.getElementById('researchCandidateExplanation').hidden,false);
  assert.ok(w.document.getElementById('chShowSma20'));assert.ok(w.document.getElementById('signalTableBody'));
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});


test('core de indicadores funciona sin técnico, aporta al score y se excluye al desmarcar',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);$('researchModuleTechnical').checked=false;$('researchModuleNews').checked=false;$('researchModuleIndicators').checked=true;
  $('researchModuleIndicators').dispatchEvent(new w.Event('change'));await analyze(w);
  assert.equal($('researchIndicatorsPanel').hidden,false);assert.equal($('researchTechnicalPanel').hidden,true);
  assert.match($('researchIndicatorsResults').textContent,/Score Bull:/);assert.ok(calls.some(call=>call.url.pathname.endsWith('/broker/candles')));
  $('researchCandidates').querySelector('[data-explain-candidate]').click();assert.match($('researchCandidateScore').textContent,/Indicadores y señales/);assert.match($('researchCandidateWhy').textContent,/Core de indicadores:/);
  const before=calls.length;$('researchModuleIndicators').checked=false;$('researchModuleNews').checked=true;$('researchModuleIndicators').dispatchEvent(new w.Event('change'));await analyze(w);
  assert.equal($('researchIndicatorsPanel').hidden,true);assert.equal($('researchIndicatorsResults').textContent,'');assert.equal(calls.slice(before).some(call=>call.url.pathname.endsWith('/broker/candles')),false);
  assert.equal(calls.some(call=>/\/broker\/(orders|spreads)$/.test(call.url.pathname)),false);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});


test('señales gráficas activan indicadores sin activar tendencia y desaparecen al desmarcar su core',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);$('researchModuleTechnical').checked=false;$('researchModuleTechnical').dispatchEvent(new w.Event('change'));
  const values=[...Array(58).fill(100),95,110];const bars=values.map((close,i)=>({timestamp:new Date(Date.now()-(values.length-i+2)*86400000).toISOString(),open:close,high:close+1,low:close-1,close,volume:100}));
  w.renderCandles({symbol:'AAPL',timeframe:'1Day',periodLabel:'1 Año',bars,complete:true});
  const count=calls.length,input=w.document.querySelector('.technical-indicator[value="rsi"]');input.checked=true;input.dispatchEvent(new w.Event('change'));
  assert.equal($('researchModuleIndicators').checked,true);assert.equal($('researchModuleTechnical').checked,false);
  assert.ok($('candlesChart').querySelector('[data-trigger-mark="technical"]'));
  $('researchModuleIndicators').checked=false;$('researchModuleIndicators').dispatchEvent(new w.Event('change'));
  assert.equal($('candlesChart').querySelector('[data-trigger-mark="technical"]'),null);assert.equal(input.checked,false);assert.equal(calls.length,count);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});


test('panel de indicadores explica señales contrapuestas antes de la fórmula y distingue empate de probabilidad',async()=>{
 const {dom,w}=page();try{
  const $=id=>w.document.getElementById(id);$('researchModuleIndicators').checked=true;
  w.IndicatorCore.evaluate=()=>({status:'available',sampleBars:253,bullScore:50,bearScore:50,asOf:'2026-11-23T05:00:00Z',reason:'Reglas de prueba',signals:[{timestamp:'2026-11-20T05:00:00Z',rule:'zone_breakout',side:'bearish',indicator:'Soporte + ATR14',exactRule:'Regla de soporte'},{timestamp:'2026-11-23T05:00:00Z',rule:'rsi_cross',side:'bullish',indicator:'RSI14',exactRule:'RSI anterior ≤ 30 y actual > 30'}]});
  await analyze(w);const host=$('researchIndicatorsResults');
  assert.match(host.querySelector('.indicator-conclusion').textContent,/Se compensan.*no favorece Bull ni Bear/);
  assert.match(host.textContent,/Señales contrapuestas/);assert.match(host.textContent,/23 de noviembre de 2026/);
  assert.match(host.textContent,/no porcentajes de ganancia/);assert.match(host.textContent,/zona de debilidad/);
  const events=[...host.querySelectorAll('.indicator-event-list li')];
  assert.match(events[0].textContent,/Qué pasó primero.*20 de noviembre/s);
  assert.match(events[1].textContent,/Qué pasó después.*23 de noviembre/s);
  assert.match(events[0].textContent,/Bear Call y Bear Put/);assert.match(events[1].textContent,/Bull Call y Bull Put/);
  assert.match(host.textContent,/no un 50 % de probabilidad/);
  assert.equal(host.querySelector('details').open,false);assert.doesNotMatch(host.querySelector('.indicator-conclusion').textContent,/ATR|RSI|Score/);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});


test('todos los cores seleccionados completan análisis y muestran paneles aun sin datos FMP',async()=>{
 const {dom,w}=page({fundamentalsUnavailable:true});try{
  const $=id=>w.document.getElementById(id);
  for(const input of w.document.querySelectorAll('.research-module-options input[type="checkbox"]'))input.checked=true;
  await analyze(w);
  assert.equal($('researchStatus').dataset.state,'info');
  for(const id of ['researchTechnicalPanel','researchIndicatorsPanel','researchFinancialPanel','researchStatementsPanel','researchMonteCarloPanel','researchMoversPanel','researchNewsPanel'])assert.equal($(id).hidden,false,id);
  assert.ok($('researchCandidates').children.length>0);assert.match($('researchStatus').textContent,/Análisis listo/);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});
