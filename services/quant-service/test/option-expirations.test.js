const test=require('node:test'),assert=require('node:assert/strict');
const AlpacaAdapter=require('../src/brokers/alpaca/alpaca.adapter');
test('vencimientos paginados, únicos y por empresa, sin consultar cotizaciones',async()=>{
 const urls=[],today=new Date().toISOString().slice(0,10),future=new Date(Date.now()+86400000*30).toISOString().slice(0,10);
 const adapter=new AlpacaAdapter({keyId:'test',secretKey:'test',tradingBaseUrl:'https://paper.example',dataBaseUrl:'https://data.example',fetchImplementation:async url=>{
  urls.push(new URL(url));const next=urls.length===1?'page-2':null;
  return {ok:true,json:async()=>({option_contracts:[{underlying_symbol:'AAPL',expiration_date:future},{underlying_symbol:'AAPL',expiration_date:today},{underlying_symbol:'AAPL',expiration_date:'2000-01-01'},{underlying_symbol:'MSFT',expiration_date:'2099-01-01'}],next_page_token:next})};
 }});
 const result=await adapter.getOptionExpirations({symbol:'aapl'});assert.deepEqual(result.expirations,[today,future]);assert.equal(result.complete,true);
 assert.equal(urls.length,2);assert.ok(urls.every(url=>url.pathname==='/v2/options/contracts'));assert.equal(urls[1].searchParams.get('page_token'),'page-2');assert.equal(urls[0].searchParams.get('expiration_date_gte'),today);
});
test('rechaza paginación repetida y un ticker inválido; no presenta listas parciales',async()=>{
 const adapter=new AlpacaAdapter({keyId:'test',secretKey:'test',tradingBaseUrl:'https://paper.example',dataBaseUrl:'https://data.example',fetchImplementation:async()=>({ok:true,json:async()=>({option_contracts:[],next_page_token:'repeat'})})});
 await assert.rejects(()=>adapter.getOptionExpirations({symbol:'AAPL'}),/Paginación/);await assert.rejects(()=>adapter.getOptionExpirations({symbol:'AAPL?x'}),/ticker válido/);
});
