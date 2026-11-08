const test=require('node:test'),assert=require('node:assert/strict');
const {createSetupClient}=require('../src/services/setup-client');
const req={get:()=> 'Bearer user-token',query:{limit:10,status:'draft'}};
test('setups transmiten sesión, cuerpo y filtros al servicio persistente',async()=>{
 const calls=[];const client=createSetupClient(async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({id:'saved'})};},'http://spread.example');
 assert.equal((await client.create(req,{status:'draft'})).id,'saved');await client.list(req);
 assert.equal(calls[0].options.headers.Authorization,'Bearer user-token');assert.equal(JSON.parse(calls[0].options.body).status,'draft');assert.equal(new URL(calls[1].url).searchParams.get('status'),'draft');
});
test('setups rechazan sesión ausente y propagan fallos de persistencia',async()=>{
 let calls=0;const c=createSetupClient(async()=>{calls++;return {ok:false,status:403,json:async()=>({message:'RLS denied'})};});
 await assert.rejects(c.create({get:()=>undefined},{}),{status:401});assert.equal(calls,0);await assert.rejects(c.create(req,{}),{status:403});
});
