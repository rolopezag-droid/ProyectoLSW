const test=require('node:test');
const assert=require('node:assert/strict');
const {rank,topCompanies}=require('../public/research-ranking');
const sample=(symbol,overrides={})=>({symbol,strategy:'BULL_CALL_SPREAD',side:'bullish',technicalTrend:'bullish',riskReward:1,liquidityScore:.1,longStrike:95,shortStrike:105,blackScholes:{probability:.6},...overrides});
test('un core desmarcado no altera el orden ni aparece en los componentes',()=>{
 const a=sample('AAPL',{blackScholes:{probability:.01}}),b=sample('MSFT',{technicalTrend:'bearish',blackScholes:{probability:.99}});
 assert.equal(rank([b,a],{technical:true})[0].symbol,'AAPL');
 assert.equal(rank([b,a],{technical:true,blackScholes:true})[0].symbol,'AAPL');
 assert.deepEqual(Object.keys(rank([a],{technical:true,blackScholes:true})[0].scoreComponents),['technical']);
});
test('promedio de cores seleccionados; no se premia un core sin datos',()=>{
 assert.equal(rank([sample('AAPL')],{technical:true,movers:true},{changes:[{symbol:'AAPL',changePct:0}]} )[0].score,75);
 const row=rank([sample('AAPL')],{technical:true,financial:true})[0];assert.equal(row.score,null);assert.deepEqual(row.scoreMissing,['Fundamental']);
});
test('noticias solas no inventan sentimiento ni un top',()=>{
 const rows=rank([sample('AAPL')],{news:true});assert.equal(rows[0].score,null);assert.equal(topCompanies(rows.map(candidate=>({candidate}))).length,0);
});
test('el top agrupa después de filtros y conserva la mejor candidata elegible',()=>{
 const ranked=rank([sample('AAPL',{riskReward:3}),sample('AAPL',{strategy:'BULL_PUT_SPREAD',riskReward:2}),sample('MSFT',{riskReward:2})],{technical:true});
 const rows=ranked.filter(row=>row.riskReward<3).map((candidate,index)=>({candidate,index}));
 const top=topCompanies(rows);assert.equal(top.length,2);assert.equal(top[0].candidate.strategy,'BULL_PUT_SPREAD');
});
test('una variación diaria bajista favorece el Bear solo si se selecciona movimiento',()=>{
 const bullish=sample('AAPL'),bearish=sample('AAPL',{strategy:'BEAR_CALL_SPREAD',side:'bearish'});
 assert.equal(rank([bullish,bearish],{movers:true},{changes:[{symbol:'AAPL',changePct:-3}]})[0].side,'bearish');
});
test('el flag legacy Black-Scholes no produce puntuación ni un Top',()=>{
 const rows=rank([sample('AAPL',{probability:{probability:null}})],{blackScholes:true});assert.equal(rows[0].score,null);assert.deepEqual(rows[0].scoreComponents,{});assert.equal(topCompanies(rows.map(candidate=>({candidate}))).length,0);
});
test('bitácora conserva el alcance filtrado sin duplicar el universo ni exceder 200 KB',()=>{
 const {journalSnapshot}=require('../public/research-ranking');
 const candidates=Array.from({length:1000},(_,i)=>sample('AAPL',{longStrike:i+1,evidence:'x'.repeat(6000)}));
 const snapshot={underlyings:[{symbol:'AAPL',candidates}],candidates,news:{articles:[{summary:'a'.repeat(30000)}]}};
 const result=journalSnapshot(snapshot,candidates.slice(10).map(candidate=>({candidate})));
 assert.ok(Buffer.byteLength(JSON.stringify(result))<200000);assert.equal(result.persistence.universeCandidates,1000);assert.equal(result.persistence.filteredCandidates,990);
 assert.equal(result.underlyings[0].candidates,undefined);assert.equal(result.candidates[0].longStrike,11);assert.equal(snapshot.candidates.length,1000);
});
