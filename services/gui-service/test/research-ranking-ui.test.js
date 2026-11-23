const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { evaluateVerticalSpread } = require('../../quant-service/src/services/vertical-spread');

async function until(predicate) {
  for (let i=0;i<150;i++) { if (predicate()) return; await new Promise(resolve=>setImmediate(resolve)); }
  throw new Error('La interfaz no completó la operación esperada.');
}

function page({ evaluate, missingQuotes = false, missingMultiplier = false, quoteSymbol, barsCount = 260, waitForCandles, extraStrike = false } = {}) {
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost:3005',runScripts:'outside-only'}),w=dom.window,calls=[];
  w.structuredClone=structuredClone;Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});
  const expiration=new Date(Date.now()+45*86400000).toISOString().slice(0,10),timestamp=new Date().toISOString();
  const bars=Array.from({length:barsCount},(_,i)=>{const close=90+i*.05;return {timestamp:new Date(Date.now()-(barsCount-i)*86400000).toISOString(),open:close,high:close+1,low:close-1,close,volume:100};});
  const response=body=>({ok:true,status:200,json:async()=>body});
  w.fetch=async(url,options={})=>{
    const u=new URL(url,'http://localhost:3005');calls.push({url:u,options});
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
    if(u.pathname.endsWith('/broker/news'))return response({articles:[],capturedAt:timestamp});
    if(u.pathname==='/api/research/fundamentals')return response({status:'available',provider:'simulado',capturedAt:timestamp,rows:u.searchParams.get('symbols').split(',').map(symbol=>({symbol,status:'available',metrics:{revenueGrowth:10,netIncomeGrowth:8,roe:.2,netMargin:.15,debtEquity:1,currentRatio:1.5,pe:20,pb:2}}))});
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

test('top: catálogo completo, una mejor estrategia por empresa y filtros antes del top',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);$('researchMode').value='top';$('researchUniverse').value='all';
  await analyze(w);
  const rows=[...w.document.querySelectorAll('#researchCandidates tr[data-candidate]')];
  assert.equal(rows.length,$('chSymbol').options.length);assert.equal(new Set(rows.map(row=>row.cells[1].textContent)).size,rows.length);
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

test('vencimientos: catálogo real bajo demanda, selección sincronizada y sin fecha inventada',async()=>{
 const {dom,w,calls,expiration}=page();try{
  const $=id=>w.document.getElementById(id);const host=$('researchExpiration').nextElementSibling;
  host.querySelector('button').click();await until(()=>!host.querySelector('button').disabled);
  const select=host.querySelector('select');assert.equal(select.hidden,false);select.value=expiration;select.dispatchEvent(new w.Event('change'));
  assert.equal($('expiration').value,expiration);assert.equal($('researchExpiration').value,expiration);
  assert.ok(calls.some(call=>call.url.pathname.endsWith('/options-chain/expirations')));
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

test('solo noticias: sin top artificial ni consulta de histórico técnico',async()=>{
 const {dom,w,calls}=page();try{
  const $=id=>w.document.getElementById(id);$('researchMode').value='top';$('researchUniverse').value='custom';
  $('researchModuleTechnical').checked=false;$('researchModuleBlackScholes').checked=false;await analyze(w);
  assert.equal(w.document.querySelectorAll('#researchCandidates tr[data-candidate]').length,0);
  assert.equal(calls.some(call=>call.url.pathname.endsWith('/candles')),false);
  assert.equal($('researchNewsPanel').hidden,false);
 }finally{await new Promise(resolve=>setImmediate(resolve));dom.window.close();}
});
