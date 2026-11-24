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

test('las cuatro candidatas muestran patas y cálculos del evaluador sin enviar órdenes',async()=>{
  const {dom,w,calls}=page();try{
    await analyze(w);
    for(const strategy of ['BULL CALL','BULL PUT','BEAR CALL','BEAR PUT']){
      const button=candidateButton(w,strategy);assert.ok(button,strategy);button.click();
      await until(()=>w.document.getElementById('researchCandidateValidation').dataset.state==='verified');
      const panel=w.document.getElementById('researchCandidateExplanation');
      assert.match(w.document.getElementById('researchCandidateTitle').textContent,new RegExp(strategy));
      assert.equal(panel.querySelector('details').open,true,'el botón abre la explicación principal');
      assert.ok([...panel.querySelectorAll('details')].slice(1).every(detail=>!detail.open),'el resto de los detalles conserva su apertura explícita');
      assert.equal(w.document.activeElement,panel,'el foco llega a la explicación visible');
      assert.match(w.document.getElementById('researchCandidateLegs').textContent,/Pata comprada.*Pata vendida.*Ask.*Bid/s);
      const sent=JSON.parse(calls.filter(call=>call.url.pathname.endsWith('/strategies/evaluate')).at(-1).options.body);
      const evaluated=evaluateVerticalSpread(sent),text=w.document.getElementById('researchCandidateCalculations').textContent;
      assert.match(text,/POST \/api\/v1\/strategies\/evaluate/);
      assert.ok(text.includes('$'+evaluated.maxProfit.toFixed(2)));assert.ok(text.includes('$'+evaluated.maxLoss.toFixed(2)));
      assert.ok(text.includes(String(evaluated.breakEven)));assert.match(text,/acciones\/contrato.*contrato\(s\)/);
      assert.match(w.document.getElementById('researchCandidateScore').textContent,/promedio simple.*cores de puntuación/i);
      assert.doesNotMatch(w.document.getElementById('researchCandidateWhy').textContent,/risk-neutral|CDF normal estándar verificada|Black-Scholes/i);
    }
    assert.equal(calls.some(call=>/\/broker\/(orders|spreads)$/.test(call.url.pathname)),false);
  }finally{await new Promise(resolve=>setTimeout(resolve,0));dom.window.close();}
});

test('comparación usa cuatro candidatas verificadas y explica alcance y mejor score visible',async()=>{
  const {dom,w,calls}=page();try{
    await analyze(w);
    const comparison=w.document.getElementById('researchComparison');comparison.open=true;comparison.dispatchEvent(new w.Event('toggle'));
    await until(()=>/4\/4 estrategias con candidata verificada/.test(w.document.getElementById('researchCompareStatus').textContent));
    const text=w.document.getElementById('researchCompareResults').textContent;
    for(const strategy of ['BULL CALL','BULL PUT','BEAR CALL','BEAR PUT'])assert.ok(text.includes(strategy));
    assert.match(text,/Mejor puntuación verificada entre las candidatas visibles/);
    assert.match(text,/no a la inversión más rentable ni más segura/);
    assert.match(w.document.getElementById('researchCompareStatus').textContent,/todos los pares válidos por ticker/);
    assert.equal(calls.some(call=>/\/broker\/(orders|spreads)$/.test(call.url.pathname)),false);
  }finally{await new Promise(resolve=>setTimeout(resolve,0));dom.window.close();}
});

test('la explicación compara patas con alternativas visibles sin atribuirles criterios ficticios',async()=>{
  const {dom,w}=page({extraStrike:true});try{
    await analyze(w);candidateButton(w,'BULL CALL').click();
    await until(()=>w.document.getElementById('researchCandidateValidation').dataset.state==='verified');
    const text=w.document.getElementById('researchCandidateLegs').textContent;
    assert.match(text,/alternativa\(s\) visible\(s\).*score.*ganancia\/riesgo.*diferencial/i);
    assert.match(text,/no se eligió por Delta, Gamma, volumen o interés abierto/i);
    assert.match(text,/selector automático del formulario es distinto/i);
  }finally{await new Promise(resolve=>setTimeout(resolve,0));dom.window.close();}
});

test('el score explica pesos fundamentales y noticias sin añadir un core Black-Scholes',async()=>{
  const {dom,w}=page();try{
    w.document.getElementById('researchModuleFinancial').checked=true;await analyze(w);candidateButton(w,'BULL CALL').click();
    await until(()=>w.document.getElementById('researchCandidateValidation').dataset.state==='verified');
    const score=w.document.getElementById('researchCandidateScore').textContent,why=w.document.getElementById('researchCandidateWhy').textContent;
    assert.match(score,/Fundamental/);assert.match(w.document.getElementById('researchFinancialRows').textContent,/Crecimiento de ingresos/);
    assert.match(score,/Cada uno pesa lo mismo/);assert.match(score,/Noticias es contexto, no aporta puntuación/i);
    assert.match(why,/score fundamental.*aportó/i);assert.match(why,/Noticias:.*no modifican el score/i);
  }finally{await new Promise(resolve=>setTimeout(resolve,0));dom.window.close();}
});

test('discrepancia del evaluador no se presenta como cálculo verificado',async()=>{
  const {dom,w}=page({evaluate:(body,response)=>response({...evaluateVerticalSpread(body),maxLoss:9999})});try{
    await analyze(w);candidateButton(w,'BULL CALL').click();
    await until(()=>w.document.getElementById('researchCandidateValidation').dataset.state==='discrepancy');
    assert.match(w.document.getElementById('researchCandidateValidation').textContent,/Pérdida máxima.*ranking.*Quant/);
    assert.match(w.document.getElementById('researchCandidateCalculations').textContent,/No se presentan cálculos como verificados/);
  }finally{await new Promise(resolve=>setTimeout(resolve,0));dom.window.close();}
});

test('filtros, empresa y vencimiento invalidan la explicación anterior',async()=>{
  const {dom,w}=page();try{
    await analyze(w);candidateButton(w,'BULL CALL').click();
    await until(()=>w.document.getElementById('researchCandidateValidation').dataset.state==='verified');
    const filter=w.document.getElementById('researchMinProb');filter.value='101';filter.dispatchEvent(new w.Event('change'));
    assert.equal(w.document.getElementById('researchCandidateExplanation').hidden,true);
    filter.value='0';filter.dispatchEvent(new w.Event('change'));candidateButton(w,'BULL PUT').click();
    await until(()=>w.document.getElementById('researchCandidateValidation').dataset.state==='verified');
    const symbols=w.document.getElementById('researchSymbols');symbols.value='MSFT';symbols.dispatchEvent(new w.Event('input'));
    assert.equal(w.document.getElementById('researchEvidence').hidden,true);
    assert.equal(w.document.getElementById('researchCandidateExplanation').hidden,true);
    await analyze(w);candidateButton(w,'BULL CALL').click();
    await until(()=>w.document.getElementById('researchCandidateValidation').dataset.state==='verified');
    const expiration=w.document.getElementById('expiration');expiration.value='2028-12-15';expiration.dispatchEvent(new w.Event('change'));
    assert.equal(w.document.getElementById('researchEvidence').hidden,true);
    assert.equal(w.document.getElementById('researchCandidateExplanation').hidden,true);
  }finally{await new Promise(resolve=>setTimeout(resolve,0));dom.window.close();}
});

test('sin cotizaciones suficientes no se inventan candidatas ni se llama al evaluador',async()=>{
  const {dom,w,calls}=page({missingQuotes:true});try{
    await analyze(w);
    assert.match(w.document.getElementById('researchCandidates').textContent,/No hay candidatas/);
    assert.equal(w.document.querySelectorAll('#researchCandidates button[data-explain-candidate]').length,0);
    assert.equal(calls.some(call=>call.url.pathname.endsWith('/strategies/evaluate')),false);
  }finally{await new Promise(resolve=>setTimeout(resolve,0));dom.window.close();}
});

test('multiplicador o ticker de referencia no verificables impiden presentar cálculos como validados',async()=>{
  for(const options of [{missingMultiplier:true},{quoteSymbol:'MSFT'}]){
    const {dom,w,calls}=page(options);try{
      await analyze(w);candidateButton(w,'BULL CALL').click();
      await until(()=>w.document.getElementById('researchCandidateValidation').dataset.state==='invalid');
      assert.match(w.document.getElementById('researchCandidateValidation').textContent,/Multiplicador|subyacente no verificable/i);
      assert.equal(calls.some(call=>call.url.pathname.endsWith('/strategies/evaluate')),false);
    }finally{await new Promise(resolve=>setTimeout(resolve,0));dom.window.close();}
  }
});

test('una respuesta tardía de Quant no reemplaza la explicación de otra candidata',async()=>{
  let release,first=true;
  const {dom,w}=page({evaluate:(body,response)=>{
    if(first){first=false;return new Promise(resolve=>{release=()=>resolve(response(evaluateVerticalSpread(body)));});}
    return response(evaluateVerticalSpread(body));
  }});try{
    await analyze(w);candidateButton(w,'BULL CALL').click();await until(()=>typeof release==='function');
    candidateButton(w,'BEAR PUT').click();
    await until(()=>w.document.getElementById('researchCandidateValidation').dataset.state==='verified');
    assert.match(w.document.getElementById('researchCandidateTitle').textContent,/BEAR PUT/);
    release();await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
    assert.match(w.document.getElementById('researchCandidateTitle').textContent,/BEAR PUT/);
    assert.match(w.document.getElementById('researchCandidateWhy').textContent,/BAJISTA|Bajista/);
  }finally{await new Promise(resolve=>setTimeout(resolve,0));dom.window.close();}
});

test('muestras insuficientes dejan el score no disponible y no inventan una ganadora',async()=>{
  const {dom,w}=page({barsCount:20});try{
    await analyze(w);candidateButton(w,'BULL CALL').click();
    await until(()=>w.document.getElementById('researchCandidateValidation').dataset.state==='verified');
    assert.match(w.document.getElementById('researchCandidateScore').textContent,/No clasificable.*Faltan datos/i);
    const comparison=w.document.getElementById('researchComparison');comparison.open=true;comparison.dispatchEvent(new w.Event('toggle'));
    await until(()=>/0\/4 estrategias/.test(w.document.getElementById('researchCompareStatus').textContent));
    assert.match(w.document.getElementById('researchCompareStatus').textContent,/No es posible comparar las cuatro con criterios equivalentes/);
    assert.match(w.document.getElementById('researchCompareResults').textContent,/No hay una mejor puntuación verificable/);
  }finally{await new Promise(resolve=>setTimeout(resolve,0));dom.window.close();}
});

test('si cambia el ticker durante la consulta no se publica el snapshot anterior',async()=>{
  let release;
  const {dom,w}=page({waitForCandles:result=>new Promise(resolve=>{release=()=>resolve(result);})});try{
    const button=w.document.getElementById('btnResearchAnalyze');button.click();await until(()=>typeof release==='function');
    const symbols=w.document.getElementById('researchSymbols');symbols.value='MSFT';symbols.dispatchEvent(new w.Event('input'));
    release();await until(()=>!button.disabled);
    assert.equal(w.document.getElementById('researchEvidence').hidden,true);
    assert.match(w.document.getElementById('researchStatus').textContent,/Cambió la empresa/);
  }finally{await new Promise(resolve=>setTimeout(resolve,0));dom.window.close();}
});

test('cambiar empresa en la comparación retira el detalle de otra empresa',async()=>{
  const {dom,w}=page();try{
    w.document.getElementById('researchMode').value='top';w.document.getElementById('researchUniverse').value='custom';w.document.getElementById('researchSymbols').value='AAPL,MSFT';await analyze(w);
    const aapl=[...w.document.querySelectorAll('#researchCandidates tr[data-candidate]')].find(row=>row.cells[1].textContent==='AAPL');aapl.querySelector('button[data-explain-candidate]').click();
    await until(()=>w.document.getElementById('researchCandidateValidation').dataset.state==='verified');
    const comparison=w.document.getElementById('researchComparison');comparison.open=true;comparison.dispatchEvent(new w.Event('toggle'));
    const symbol=w.document.getElementById('researchCompareSymbol');symbol.value='MSFT';symbol.dispatchEvent(new w.Event('change'));
    assert.equal(w.document.getElementById('researchCandidateExplanation').hidden,true);
    await until(()=>/4\/4 estrategias/.test(w.document.getElementById('researchCompareStatus').textContent));
    assert.match(w.document.getElementById('researchCompareResults').textContent,/MSFT/);
  }finally{await new Promise(resolve=>setTimeout(resolve,0));dom.window.close();}
});
