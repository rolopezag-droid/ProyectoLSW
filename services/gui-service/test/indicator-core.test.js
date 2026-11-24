const test=require('node:test');const assert=require('node:assert/strict');
const {evaluate}=require('../public/indicator-core');const {rank}=require('../public/research-ranking');
const now=Date.parse('2026-11-24T20:00:00Z');
const bars=values=>values.map((close,i)=>({timestamp:new Date(now-(values.length-i+1)*86400000).toISOString(),open:close,high:close+1,low:close-1,close,volume:100}));
const base={symbol:'AAPL',strategy:'BULL_CALL_SPREAD',side:'bullish',riskReward:1,liquidityScore:.1,longStrike:90,shortStrike:110};
test('historial insuficiente no inventa score y neutro no equivale a compra',()=>{
 assert.equal(evaluate(bars(Array(20).fill(100)),{now}).status,'unavailable');
 const neutral=evaluate(bars(Array(60).fill(100)),{now});assert.equal(neutral.bullScore,50);assert.equal(neutral.signals.length,0);assert.match(neutral.reason,/Sin señales nuevas/);
});
test('señales recientes con fechas, reglas y scores opuestos para Bull y Bear',()=>{
 const e=evaluate(bars([...Array(58).fill(100),95,110]),{symbol:'AAPL',now});
 assert.ok(e.signals.some(signal=>signal.side==='bullish'));assert.ok(e.signals.every(signal=>signal.timestamp&&signal.exactRule));assert.equal(e.bullScore+e.bearScore,100);
 const ranked=rank([{...base,indicatorEvidence:e},{...base,strategy:'BEAR_PUT_SPREAD',side:'bearish',indicatorEvidence:e}],{indicators:true});assert.equal(ranked[0].side,'bullish');assert.deepEqual(Object.keys(ranked[0].scoreComponents),['indicators']);
 const disabled=rank([{...base,indicatorEvidence:e}],{});assert.equal(disabled[0].score,null);assert.deepEqual(disabled[0].scoreComponents,{});
});
test('excluye velas del día actual y futuras sin cambiar señales confirmadas',()=>{
 const input=bars([...Array(58).fill(100),95,110]);const original=evaluate(input,{now});
 const e=evaluate([...input,{...input[0],timestamp:new Date(now).toISOString(),close:99,open:99,high:100,low:98},{...input[0],timestamp:new Date(now+86400000).toISOString()}],{now});
 assert.deepEqual(e,original);assert.equal(rank([{...base,indicatorEvidence:{status:'unavailable'}}],{indicators:true})[0].score,null);
});
