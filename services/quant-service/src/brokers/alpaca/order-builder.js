const { evaluateVerticalSpread } = require('../../services/vertical-spread');
const fail = message => { const error = new Error(message); error.status = 400; throw error; };
function parseContract(symbol) {
  const match = typeof symbol === 'string' && symbol.match(/^([A-Z]{1,6}[0-9]?)([0-9]{6})([CP])([0-9]{8})$/);
  if (!match) fail('Símbolo de contrato inválido; utiliza el símbolo OCC devuelto por Alpaca.');
  const expiration = '20'+match[2].slice(0,2)+'-'+match[2].slice(2,4)+'-'+match[2].slice(4,6);
  if (!Number.isFinite(Date.parse(expiration)) || new Date(expiration).toISOString().slice(0,10)!==expiration) fail('Fecha del contrato inválida.');
  return { underlying:match[1],expiration,type:match[3]==='C'?'call':'put',strike:Number(match[4])/1000 };
}
function buildSpreadOrder({symbol,legs,qty,quantity,type='limit',limitPrice,clientOrderId,timeInForce='day'} = {}) {
  if(typeof symbol!=='string'||!/^[A-Z0-9.]{1,10}$/i.test(symbol)||!Array.isArray(legs)||legs.length!==2) fail('Se requieren symbol y exactamente dos patas para una vertical F3.');
  const orderType = String(type||'limit').toLowerCase();
  if(!['limit','market'].includes(orderType)) fail('Los spreads multileg se envían como orden limit o market.');
  if(orderType==='limit' && legs.some(l=>l.stopLossPrice!==undefined || (l.type && l.type!=='limit'))) fail('No se admiten órdenes stop por pata en un spread multileg.');
  const quantityValue=Number(qty ?? quantity ?? legs[0].qty ?? 1);
  if(!Number.isInteger(quantityValue)||quantityValue<1) fail('qty debe ser un entero mayor que cero.');
  const parsed=legs.map(l=>({...parseContract(l.symbol),side:String(l.side||'').toLowerCase(),price:Number(l.limitPrice ?? l.price)}));
  if(parsed.some((l,i)=>l.underlying!==symbol.toUpperCase()||!['buy','sell'].includes(l.side)||!Number.isFinite(l.price)||l.price<0||(legs[i].qty!==undefined&&Number(legs[i].qty)!==quantityValue))) fail('Las patas requieren mismo subyacente, cantidades iguales y primas válidas.');
  if(parsed[0].expiration!==parsed[1].expiration||parsed[0].type!==parsed[1].type||legs[0].symbol===legs[1].symbol) fail('Las dos patas deben tener el mismo tipo y vencimiento y distintos strikes.');
  const sorted=parsed.slice().sort((a,b)=>a.strike-b.strike);
  const strategyType=sorted[0].type==='call'?(sorted[0].side==='buy'?'BULL_CALL_SPREAD':'BEAR_CALL_SPREAD'):(sorted[0].side==='buy'?'BULL_PUT_SPREAD':'BEAR_PUT_SPREAD');
  let result;
  try { result=evaluateVerticalSpread({strategyType,symbol,expiration:parsed[0].expiration,quantity:quantityValue,multiplier:100,legs:parsed}); } catch(e){ fail(e.message); }
  const signedNet=parsed.reduce((sum,l)=>sum+(l.side==='buy'?l.price:-l.price),0);
  const net=Number(signedNet.toFixed(2));
  if(clientOrderId!==undefined&&(typeof clientOrderId!=='string'||! /^[A-Za-z0-9_-]{1,48}$/.test(clientOrderId))) fail('clientOrderId inválido.');
  const order = {order_class:'mleg',qty:String(quantityValue),type:orderType,time_in_force:String(timeInForce||'day'),...(clientOrderId?{client_order_id:clientOrderId}:{}),legs:legs.map(l=>({symbol:l.symbol,ratio_qty:'1',side:String(l.side).toLowerCase(),position_intent:String(l.side).toLowerCase()==='buy'?'buy_to_open':'sell_to_open'}))};
  if(orderType==='limit') {
    if(net===0 || Math.abs(net)>=result.width) fail('El precio neto redondeado debe ser positivo y menor que el ancho en valor absoluto.');
    const lp = limitPrice!==undefined ? Number(limitPrice) : net;
    if(!Number.isFinite(lp)||Math.abs(lp-net)>0.005) fail('limitPrice debe coincidir con la prima neta: débito positivo y crédito negativo.');
    order.limit_price = Number(lp).toFixed(2);
  }
  return order;
}
module.exports={buildSpreadOrder,parseContract};
