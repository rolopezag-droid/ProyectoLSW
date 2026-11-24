const test=require('node:test'),assert=require('node:assert/strict');
const {historicalEvaluator,wilson}=require('../public/research-analysis');
test('muestra preparada conserva exactamente el conteo directo, empates, ambas direcciones y Wilson',()=>{
 const bars=Array.from({length:260},(_,i)=>({timestamp:new Date(Date.now()-(260-i)*86400000).toISOString(),close:100+Math.sin(i)*10}));
 bars[50].close=null;
 const expiration=new Date(Date.now()+30*86400000).toISOString().slice(0,10),spot=100;
 const horizon=Math.max(1,Math.ceil(Math.max(1,Math.ceil((Date.parse(expiration+'T16:00:00Z')-Date.now())/86400000))*5/7));
 const sorted=bars.filter(b=>Number.isFinite(b.close)&&b.close>0),sample=[];
 for(let i=horizon;i<sorted.length;i++)sample.push(spot*(sorted[i].close/sorted[i-horizon].close));
 const evaluate=historicalEvaluator([...bars].reverse(),spot,expiration);
 for(const target of [0,85,100,115,200,...sample.slice(0,10)])for(const direction of ['bullish','bearish']){
  const wins=sample.filter(price=>direction==='bullish'?price>=target:price<=target).length;
  assert.deepEqual(evaluate(target,direction),{probability:wins/sample.length,interval:wilson(wins,sample.length),sampleSize:sample.length,horizonTradingDays:horizon,method:'historical-overlapping-returns'});
 }
});
test('histórico insuficiente nunca se transforma en probabilidad cero',()=>{
 const evaluate=historicalEvaluator([{timestamp:'2026-01-01',close:100}],100,'2099-12-18');
 assert.equal(evaluate(100,'bullish').probability,null);assert.equal(evaluate(100,'bearish').interval,null);
});
