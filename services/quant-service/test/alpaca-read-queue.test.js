const test=require('node:test'),assert=require('node:assert/strict');
const AlpacaAdapter=require('../src/brokers/alpaca/alpaca.adapter');
test('las lecturas paralelas reservan turnos separados; un POST no se reintenta',async()=>{
 const calls=[];
 const adapter=new AlpacaAdapter({keyId:'fake',secretKey:'fake',tradingBaseUrl:'https://paper.invalid',dataBaseUrl:'https://data.invalid',readIntervalMs:25,fetchImplementation:async(url,options)=>{
  calls.push({url,method:options.method,at:Date.now()});return{ok:true,json:async()=>({})};
 }});
 await Promise.all([adapter.request(adapter.dataBaseUrl,'/a'),adapter.request(adapter.dataBaseUrl,'/b'),adapter.request(adapter.dataBaseUrl,'/c'),adapter.request(adapter.tradingBaseUrl,'/order',{method:'POST',body:'{}'})]);
 const reads=calls.filter(call=>call.method==='GET');assert.equal(reads.length,3);
 assert.ok(reads[1].at-reads[0].at>=18);assert.ok(reads[2].at-reads[1].at>=18);
 assert.equal(calls.filter(call=>call.method==='POST').length,1);
});
