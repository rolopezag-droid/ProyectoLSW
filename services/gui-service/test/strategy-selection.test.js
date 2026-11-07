const test=require('node:test');
const assert=require('node:assert/strict');
const select=require('../public/strategy-selection');
const {evaluateVerticalSpread}=require('../../quant-service/src/services/vertical-spread');
const expiration='2026-12-18';
const contract=(type,strike,bid,ask,extra={})=>({type,strike,bid,ask,underlyingSymbol:'AAPL',expiration,contractSymbol:type+strike,...extra});
const chain=[contract('call',190,4,4.2),contract('call',195,2,2.2),contract('put',190,2,2.2),contract('put',195,4,4.2)];
for(const [strategy,type,long,short,category] of [
 ['BULL_CALL_SPREAD','call',190,195,'debit'],['BEAR_CALL_SPREAD','call',195,190,'credit'],['BULL_PUT_SPREAD','put',190,195,'credit'],['BEAR_PUT_SPREAD','put',195,190,'debit']]) {
 test(strategy+' selecciona contratos correctos y supera el evaluador',()=>{
  const r=select([...chain].reverse(),strategy,'AAPL',expiration);
  assert.equal(r.long.strike,long);assert.equal(r.short.strike,short);assert.equal(r.category,category);
  assert.equal(r.legs[0].type,type);assert.equal(r.legs[0].price,r.long.ask);assert.equal(r.legs[1].price,r.short.bid);
  const result=evaluateVerticalSpread({strategyType:strategy,symbol:'AAPL',expiration,underlyingPrice:190,quantity:1,multiplier:100,legs:r.legs});
  assert.equal(result.spreadCategory,category);assert.ok(result.maxLoss>0);assert.ok(result.maxProfit>0);
 });
}
test('rechaza otra empresa, vencimiento y tipo',()=>{
 for(const bad of [chain.map(c=>({...c,underlyingSymbol:'MSFT'})),chain.map(c=>({...c,expiration:'2027-01-15'})),chain.filter(c=>c.type==='put')]) assert.throws(()=>select(bad,'BULL_CALL_SPREAD','AAPL',expiration));
});
test('rechaza cotizaciones ausentes, cero, cruzadas y no numéricas',()=>{
 for(const extra of [{ask:null},{bid:0},{ask:1,bid:5},{ask:NaN},{ask:'4.2'}]) assert.throws(()=>select(chain.filter(c=>c.type==='call').map(c=>({...c,...extra})),'BULL_CALL_SPREAD','AAPL',expiration));
});
test('rechaza neto cero, negativo o superior al ancho',()=>{
 for(const bid of [4.2,5,0.1]) assert.throws(()=>select([contract('call',190,4,4.2),contract('call',191,bid,Math.max(bid,6))],'BULL_CALL_SPREAD','AAPL',expiration));
});
test('rechaza cadena vacía y estrategia desconocida',()=>{
 assert.throws(()=>select([],'BEAR_PUT_SPREAD','AAPL',expiration));assert.throws(()=>select(chain,'OTHER','AAPL',expiration));
});

test('recorre páginas y encuentra un Bull Put que necesita la segunda página',async()=>{
 const tokens=[];
 const contracts=await select.collectOptionChain(async token=>{tokens.push(token);return token?{contracts:[contract('put',195,4,4.2)],nextPageToken:null}:{contracts:[contract('put',190,2,2.2)],nextPageToken:'next'};});
 assert.deepEqual(tokens,[undefined,'next']);assert.equal(select(contracts,'BULL_PUT_SPREAD','AAPL',expiration).category,'credit');
});
test('rechaza paginación repetida y fallos en páginas posteriores',async()=>{
 await assert.rejects(()=>select.collectOptionChain(async()=>({contracts:[],nextPageToken:'same'})),/repetida/);
 await assert.rejects(()=>select.collectOptionChain(async token=>{if(token)throw Error('Alpaca 429');return {contracts:[],nextPageToken:'next'};}),/429/);
});
test('distingue ausencia de contratos de ausencia de cotizaciones',()=>{
 assert.throws(()=>select([],'BULL_PUT_SPREAD','AAPL',expiration),/dos contratos/);
 assert.throws(()=>select(chain.filter(c=>c.type==='put').map(c=>({...c,bid:null})),'BULL_PUT_SPREAD','AAPL',expiration),/utilizables/);
});
