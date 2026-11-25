const test=require('node:test');
const assert=require('node:assert/strict');
const analysis=require('../public/research-analysis');
const expiration=new Date(Date.now()+45*86400000).toISOString().slice(0,10);

test('muestra común conserva media, frecuencia estricta y percentiles de cada tipo de vertical',()=>{
 const cache={seed:'escenarios-comunes-prueba'};
 const types=[['BULL_CALL_SPREAD','debit',95,105],['BEAR_CALL_SPREAD','credit',105,95],['BULL_PUT_SPREAD','credit',95,105],['BEAR_PUT_SPREAD','debit',105,95]];
 for(const [strategy,premiumType,longStrike,shortStrike] of types) for(const netPremium of [.01,2,5,9.99]){
  const result=analysis.monteCarloSpread({strategy,premiumType,longStrike,shortStrike,netPremium,spot:100,expiration,volatility:.25,multiplier:100,simulations:10000},cache);
  const call=strategy.includes('CALL');
  const intrinsic=(s,k)=>Math.max(call?s-k:k-s,0);
  // Referencia directa: valor de pata larga menos corta y flujo de apertura.
  const values=cache.sample.terminals.map(s=>(intrinsic(s,longStrike)-intrinsic(s,shortStrike)+(premiumType==='credit'?netPremium:-netPremium))*100).sort((a,b)=>a-b);
  assert.equal(result.simulations,10000);
  assert.equal(result.probability,values.filter(v=>v>0).length/values.length);
  for(const [key,q] of [['p05',.05],['medianPnl',.5],['p95',.95]])assert.equal(result[key],values[Math.floor((values.length-1)*q)]);
  const mean=values.reduce((a,b)=>a+b,0)/values.length;
  assert.ok(Math.abs(result.expectedPnl-mean)<1e-7,`${strategy}: ${result.expectedPnl} vs ${mean}`);
  assert.equal(result.sampling,'shared-underlying-terminal-sample');
 }
});

test('el equilibrio exacto no cuenta como resultado positivo',()=>{
 const terminals=[90,95,97,100,105,110],prefix=[0];for(const s of terminals)prefix.push(prefix.at(-1)+s);
 const result=analysis.monteCarloSpread({strategy:'BULL_CALL_SPREAD',premiumType:'debit',longStrike:95,shortStrike:105,netPremium:2,spot:100,expiration,volatility:.25}, {sample:{terminals,prefix,time:.1,seed:'fixture'}});
 assert.equal(result.probability,3/6);
});

function fixture(count=180){return {symbol:'QQQ',expiration,spot:100,includeTechnical:true,includeBlackScholes:false,includeMonteCarlo:true,bars:Array.from({length:260},(_,i)=>({timestamp:new Date(Date.now()-(261-i)*86400000).toISOString(),open:100,high:102,low:98,close:100+Math.sin(i/7)})),contracts:['call','put'].flatMap(type=>Array.from({length:count},(_,i)=>({type,underlyingSymbol:'QQQ',expiration,strike:80+i*40/count,contractSymbol:type+i,bid:40+(type==='call'?-1:1)*i*20/count,ask:40+(type==='call'?-1:1)*i*20/count+.01,timestamp:new Date().toISOString(),multiplier:100})))};}

test('cadena extensa conserva todas las candidatas y 10000 escenarios, sin reutilizar muestra entre análisis',()=>{
 const {contracts,...context}=fixture();
 const start=performance.now();
 const actual=analysis.compareStrategies(contracts,context), elapsed=performance.now()-start;
 const without=analysis.compareStrategies(contracts,{...context,includeMonteCarlo:false});
 assert.ok(actual.length>60000);assert.equal(actual.length,without.length);
 assert.ok(actual.every(c=>c.monteCarlo.simulations===10000));
 assert.ok(without.every(c=>c.monteCarlo===null));
 assert.equal(new Set(actual.map(c=>c.monteCarlo.seed)).size,1);
 const changed=analysis.compareStrategies(contracts,{...context,spot:101});
 assert.notEqual(changed[0].monteCarlo.seed,actual[0].monteCarlo.seed);
 assert.ok(elapsed<120000,`Superó timeout: ${elapsed}`);
 console.log(JSON.stringify({candidates:actual.length,simulations:10000,elapsedMs:Math.round(elapsed)}));
});
