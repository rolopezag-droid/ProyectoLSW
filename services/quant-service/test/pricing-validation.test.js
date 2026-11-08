const test=require('node:test'),assert=require('node:assert/strict');
const pricing=require('../src/services/option-pricing');
const c=require('../src/api/v1/controllers/quant.controller');
const params={spot:100,strike:100,rate:0.05,dividendYield:0,volatility:0.2,timeToMaturity:1,optionType:'call'};
function response(){return {statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};}
test('Black-Scholes verifica precio conocido y paridad put-call',()=>{
 const call=pricing.blackScholesPrice(params),put=pricing.blackScholesPrice({...params,optionType:'put'});
 assert.ok(Math.abs(call-10.4506)<0.001);assert.ok(Math.abs(call-put-(100-100*Math.exp(-0.05)))<1e-8);
});
test('rechaza entradas financieras que antes producían NaN',()=>{
 for(const bad of [{spot:-1},{strike:0},{volatility:-1},{timeToMaturity:0},{rate:Infinity},{optionType:'bad'}]) assert.throws(()=>pricing.blackScholesPrice({...params,...bad}));
 assert.throws(()=>pricing.getTimeToMaturity('garbage'));assert.throws(()=>pricing.getTimeToMaturity('2030-02-30'));
});
test('IV recupera volatilidad call y put y no supera el máximo de iteraciones',()=>{
 for(const optionType of ['call','put']){
  const body={...params,optionType,marketPrice:pricing.blackScholesPrice({...params,optionType}),initialGuess:0.8};const r=response();c.getImpliedVolatility({body},r);assert.equal(r.statusCode,200);assert.ok(Math.abs(r.body.impliedVolatility-0.2)<1e-5);
 }
 const r=response();c.getImpliedVolatility({body:{...params,marketPrice:10,initialGuess:2,maxIterations:1}},r);assert.equal(r.statusCode,422);assert.equal(r.body.iterations,1);
});
test('IV responde 400 por iteraciones/precios inválidos y 422 por arbitraje',()=>{
 for(const bad of [{maxIterations:Infinity},{maxIterations:0},{marketPrice:-1},{initialGuess:0},{tolerance:0},{spot:-1}]){const r=response();c.getImpliedVolatility({body:{...params,marketPrice:10,...bad}},r);assert.equal(r.statusCode,400);}
 const r=response();c.getImpliedVolatility({body:{...params,marketPrice:101}},r);assert.equal(r.statusCode,422);
});
