const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createIngestor}=require('../src/services/ingestion');
test('ingestión descarga páginas, persiste snapshot y lo recupera',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lsw-ingestion-test-'));let count=0;
 try{const service=createIngestor({getOptionChain:async input=>{count++;return {contracts:[{contractSymbol:'AAPL'+count}],nextPageToken:count===1?'next':null};}},dir);
 const r=await service.run({symbol:'AAPL',expiration:'2026-12-18'});assert.equal(count,2);assert.equal(r.status,'completed');assert.equal(r.counts.normalized,2);assert.equal((await service.read(r.ingestionId)).contracts.length,2);
 await assert.rejects(service.read('../private'),{status:400});await fs.unlink(path.join(dir,r.ingestionId+'.json'));
 }finally{await fs.rmdir(dir);}
});
test('ingestión no guarda resultados incompletos ni acepta datos inválidos',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lsw-ingestion-test-'));
 try{const service=createIngestor({getOptionChain:async()=>({contracts:[],nextPageToken:'same'})},dir);await assert.rejects(service.run({symbol:'AAPL',expiration:'2026-12-18'}),{status:502});assert.equal((await fs.readdir(dir)).length,0);await assert.rejects(service.run({symbol:'AAPL',expiration:'bad'}),{status:400});}finally{await fs.rmdir(dir);}
});
