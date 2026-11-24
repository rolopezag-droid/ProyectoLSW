const test=require('node:test');
const assert=require('node:assert/strict');
const {assess}=require('../public/news-confluence');
const now=Date.parse('2026-11-24T12:00:00Z');
const candidate={symbol:'AAPL',side:'bullish',technicalTrend:'bullish'};
const article=(label,extra={})=>({id:label,symbols:['AAPL'],created_at:'2026-11-24T10:00:00Z',sentiment:{label},headline:label,...extra});
const run=(articles,options={})=>assess(candidate,{status:'available',articles},{now,technical:true,...options});
test('confluencia direccional y técnica conserva evidencia sin score artificial',()=>{
 const agree=run([article('bullish')]);assert.equal(agree.relation,'agreement');assert.equal(agree.technicalRelation,'agreement');assert.equal(agree.affectsScore,false);assert.equal(agree.sources.length,1);
 const contra=run([article('bearish')]);assert.equal(contra.relation,'contradiction');assert.equal(contra.technicalRelation,'contradiction');
 const bear=assess({...candidate,side:'bearish'},{status:'available',articles:[article('bearish')]},{now,technical:false});assert.equal(bear.relation,'agreement');assert.equal(bear.technicalRelation,null);
});
test('noticias mixtas no se convierten en mayoría ni predicción',()=>{
 assert.equal(run([article('bullish'),article('bullish',{id:'b2'}),article('bearish')]).state,'mixed');assert.equal(run([article('mixed')]).direction,null);
 for(const label of ['neutral','unknown'])assert.equal(run([article(label)]).relation,null);
});
test('aislamiento por ticker, fecha, duplicados y módulo desmarcado',()=>{
 const rows=[article('bullish'),article('bullish'),article('bearish',{symbols:['MSFT']}),article('bearish',{id:'old',created_at:'2026-10-01'}),article('bearish',{id:'future',created_at:'2026-12-01'}),article('bearish',{id:'invalid',created_at:'no-date'})];
 assert.equal(run(rows).counts.bullish,1);assert.equal(run(rows).state,'agreement');assert.equal(run(rows,{enabled:false}).state,'disabled');assert.equal(run([]).state,'unavailable');
 assert.equal(assess(candidate,{status:'unavailable'},{now}).state,'unavailable');
});

test('las cuatro estrategias distinguen mezcla de artículos y oposición Bull/Bear',()=>{
 const strategies=['BULL_CALL_SPREAD','BULL_PUT_SPREAD','BEAR_CALL_SPREAD','BEAR_PUT_SPREAD'];
 const evaluate=articles=>strategies.map(strategy=>assess({...candidate,strategy,side:strategy.startsWith('BULL')?'bullish':'bearish'},{status:'available',articles},{now,technical:true}));
 const mixed=evaluate([article('bullish'),article('bearish')]);
 assert.ok(mixed.every(item=>item.state==='mixed'&&item.relation===null));assert.ok(mixed.every(item=>/no significa que las cuatro estrategias/.test(item.explanation)));
 const bullish=evaluate([article('bullish')]);assert.deepEqual(bullish.map(item=>item.relation),['agreement','agreement','contradiction','contradiction']);
 const bearish=evaluate([article('bearish')]);assert.deepEqual(bearish.map(item=>item.relation),['contradiction','contradiction','agreement','agreement']);
});
