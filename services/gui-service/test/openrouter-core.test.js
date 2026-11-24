const test=require('node:test');const assert=require('node:assert/strict');const {createAiCore,cleanInput}=require('../src/openrouter-core');
const input={symbol:'AAPL',selected:['technical'],cores:{technical:{trend:'bullish',sma20:100,password:'never-send'},news:{headlines:['unselected']}},accessToken:'never-send'};
const output={summary:'Datos mixtos',agreements:['Tendencia alcista'],contradictions:[],missingData:[],conclusion:'No garantiza dirección.'};
const response=(body,status=200)=>({ok:status===200,status,json:async()=>body});
test('falta configuración no consulta proveedor; whitelist excluye credenciales y cores no seleccionados',async()=>{
 const run=createAiCore({fetchImpl:()=>{throw new Error('no fetch');}});assert.equal((await run(input,{apiKey:'',model:''})).status,'unavailable');
 const clean=cleanInput(input);assert.equal(clean.cores.news,undefined);assert.equal(clean.accessToken,undefined);assert.equal(clean.cores.technical.password,undefined);
 await assert.rejects(run({symbol:'INVALID!',selected:['technical']}),error=>error.status===400);
});
test('OpenRouter usa bearer y prompt backend; valida JSON y reutiliza caché sin otra llamada',async()=>{
 let calls=0;const run=createAiCore({fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer fake-test-key');const body=JSON.parse(options.body);assert.equal(body.model,'test/model');assert.equal(body.response_format.type,'json_object');assert.match(body.messages[0].content,/Bull & Bear/);assert.doesNotMatch(body.messages[1].content,/never-send|unselected/);return response({choices:[{message:{content:JSON.stringify(output)}}]});}});
 const value=await run(input,{apiKey:'fake-test-key',model:'test/model'});assert.deepEqual(value.interpretation,output);assert.equal(value.affectsRanking,false);
 assert.equal((await run(input,{apiKey:'fake-test-key',model:'test/model'})).fromCache,true);assert.equal(calls,1);
});
test('errores, JSON incompleto y límites no se convierten en interpretación falsa',async()=>{
 for(const provider of [response({error:{message:'fake-secret'}},402),response({error:{message:'fake-secret'}},401),response({choices:[{message:{content:'not JSON'}}]}),response({choices:[{message:{content:'{"summary":"incomplete"}'}}]})]){
  const run=createAiCore({fetchImpl:async()=>provider});await assert.rejects(run(input,{apiKey:'fake-test-key',model:'test/model'}),error=>error.status===502&&!error.message.includes('fake-secret'));
 }
 const run=createAiCore({now:()=>100,fetchImpl:async()=>response({choices:[{message:{content:JSON.stringify(output)}}]})});await run(input,{apiKey:'fake',model:'test/model'});await assert.rejects(run({...input,symbol:'MSFT'},{apiKey:'fake',model:'test/model'}),error=>error.status===429);
});
