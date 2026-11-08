const test=require('node:test'),assert=require('node:assert/strict');
const {checkService}=require('../src/health');
test('estado comprueba servicio correcto, HTTP y fallos de conexión',async()=>{
 const svc={port:3002,id:'quant-service'};
 assert.equal((await checkService(svc,async()=>({ok:true,json:async()=>({service:'quant-service',status:'ok'})}))).running,true);
 assert.equal((await checkService(svc,async()=>({ok:true,json:async()=>({service:'catalog-service',status:'ok'})}))).running,false);
 assert.equal((await checkService(svc,async()=>{throw Error('refused');})).running,false);
});
