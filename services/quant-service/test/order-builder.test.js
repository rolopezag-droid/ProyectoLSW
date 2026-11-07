const test=require('node:test');
const assert=require('node:assert/strict');
const {buildSpreadOrder,parseContract}=require('../src/brokers/alpaca/order-builder');
const A=require('../src/brokers/alpaca/alpaca.adapter');
function input(type='call',buyLower=true) {
 const letter=type==='call'?'C':'P';
 return {symbol:'AAPL',qty:2,clientOrderId:'test-123',legs:[{symbol:'AAPL261218'+letter+'00190000',qty:2,side:buyLower?'buy':'sell',type:'limit',limitPrice:type==='call'?4:2},{symbol:'AAPL261218'+letter+'00195000',qty:2,side:buyLower?'sell':'buy',type:'limit',limitPrice:type==='call'?2:4}]};
}
for(const [name,type,buyLower,net] of [['Bull Call','call',true,'2.00'],['Bear Call','call',false,'-2.00'],['Bull Put','put',true,'-2.00'],['Bear Put','put',false,'2.00']]) {
 test(name+' construye orden multileg con signo neto correcto',()=>{
 const o=buildSpreadOrder(input(type,buyLower));assert.equal(o.qty,'2');assert.equal(o.order_class,'mleg');assert.equal(o.limit_price,net);assert.equal(o.client_order_id,'test-123');assert.ok(o.legs.every(l=>l.ratio_qty==='1'));assert.equal(o.legs[0].qty,undefined);assert.equal(o.legs[0].limit_price,undefined);
 });
}
test('rechaza símbolo de ocho dígitos de fecha, stop y patas desnudas',()=>{
 assert.throws(()=>parseContract('AAPL20261218C00190000'));
 let i=input();i.legs[0].type='stop_limit';assert.throws(()=>buildSpreadOrder(i));
 i=input();i.legs[1].side='buy';assert.throws(()=>buildSpreadOrder(i));
 i=input();i.legs[1].symbol='MSFT261218C00195000';assert.throws(()=>buildSpreadOrder(i));
});
test('rechaza cantidades desbalanceadas, fecha distinta y límite incongruente',()=>{
 let i=input();i.legs[1].qty=1;assert.throws(()=>buildSpreadOrder(i));
 i=input();i.qty=0;assert.throws(()=>buildSpreadOrder(i));
 i=input();i.legs[1].symbol='AAPL270115C00195000';assert.throws(()=>buildSpreadOrder(i));
 i=input();i.limitPrice=5;assert.throws(()=>buildSpreadOrder(i));
});
test('no envía órdenes a cuentas live ni reintenta POST',async()=>{
 let calls=0;const a=new A({keyId:'fake',secretKey:'fake',tradingBaseUrl:'https://api.alpaca.markets',dataBaseUrl:'https://data.example',fetchImplementation:async()=>{calls++;}});
 await assert.rejects(a.createSpread(input()),{status:403});assert.equal(calls,0);
 a.tradingBaseUrl='https://paper-api.alpaca.markets';a.fetch=async()=>{calls++;throw Error('network');};
 await assert.rejects(a.createSpread(input()));assert.equal(calls,1);
});
