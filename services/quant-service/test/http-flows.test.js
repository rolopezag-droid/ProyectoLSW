const test=require('node:test'),assert=require('node:assert/strict');
test('HTTP Quant: catálogo, build, evaluación, precios, griegas, IV y errores',async()=>{
 const app=require('../src/app');const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 async function post(path,body){const r=await fetch(base+'/api/v1/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
 try{
  let r=await fetch(base+'/api/v1/strategies/types');assert.equal((await r.json()).strategies.length,4);
  for(const [strategyType,premiums]of [['BULL_CALL_SPREAD',[4,2]],['BEAR_CALL_SPREAD',[4,2]],['BULL_PUT_SPREAD',[2,4]],['BEAR_PUT_SPREAD',[2,4]]]) {
   const built=await post('strategies/build',{strategyType,symbol:'AAPL',expiration:'2026-12-18',quantity:1,strikes:[190,195],premiums});assert.equal(built.status,200);assert.equal(built.data.legs.length,2);assert.equal(built.data.validation.complete,true);
   const evaluated=await post('strategies/evaluate',built.data);assert.equal(evaluated.status,200);assert.ok(evaluated.data.maxProfit>0);
  }
  const invalid=await post('strategies/build',{strategyType:'BULL_CALL_SPREAD'});assert.ok(invalid.status>=400);
  const pricing={spot:100,strike:100,volatility:0.2,timeToMaturity:1,optionType:'call',rate:0.05};
  const price=await post('quant/prices',pricing);assert.equal(price.status,200);assert.ok(price.data.price>0);
  assert.equal((await post('quant/greeks',pricing)).status,200);
  assert.equal((await post('quant/implied-volatility',{...pricing,marketPrice:price.data.price})).status,200);
  assert.equal((await post('quant/prices',{...pricing,spot:-1})).status,400);
  assert.equal((await post('quant/implied-volatility',{...pricing,marketPrice:-1})).status,400);
  assert.equal((await post('strategies/setups',{})).status,401);
  assert.equal((await fetch(base+'/api/v1/strategies/setups')).status,401);
  assert.equal((await fetch(base+'/api/v1/broker/candles?symbol=AAPL&timeframe=bad')).status,400);
  assert.equal((await fetch(base+'/api/v1/nope')).status,404);
 }finally{await new Promise(r=>server.close(r));}
});
