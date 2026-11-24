const test=require('node:test');const assert=require('node:assert/strict');const app=require('../src/server');
test('backend sirve worker y dependencias; FMP sin credencial informa ausencia sin tumbar health',async()=>{
 const previous=process.env.FMP_API_KEY;process.env.FMP_API_KEY='';
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const file of ['research-worker.js','research-computation.js','research-analysis.js','strategy-triggers.js','indicator-core.js']){const response=await fetch(base+'/'+file);assert.equal(response.status,200,file);assert.match(response.headers.get('content-type'),/javascript/);assert.ok((await response.text()).length>50);}
  const results=await Promise.all(['fundamentals','financial-statements'].map(endpoint=>fetch(base+'/api/research/'+endpoint+'?symbols=AAPL,MSFT,QQQ').then(async response=>({status:response.status,data:await response.json()}))));
  assert.ok(results.every(result=>result.status===200&&result.data.status==='unavailable'&&Array.isArray(result.data.rows)));
  const health=await fetch(base+'/health');assert.equal(health.status,200);
  assert.equal((await fetch(base+'/api/research/financial-statements?symbols=A,B,C,D')).status,400);
 }finally{if(previous===undefined)delete process.env.FMP_API_KEY;else process.env.FMP_API_KEY=previous;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});


test('endpoint IA sin configuración devuelve unavailable sin afectar otros servicios',async()=>{
 const key=process.env.OPENROUTER_API_KEY,model=process.env.OPENROUTER_MODEL;delete process.env.OPENROUTER_API_KEY;delete process.env.OPENROUTER_MODEL;
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});const base='http://127.0.0.1:'+server.address().port;
 try{const response=await fetch(base+'/api/research/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:'AAPL',selected:['technical'],cores:{technical:{trend:'bullish'}}})});assert.equal(response.status,200);const data=await response.json();assert.equal(data.status,'unavailable');assert.match(data.message,/OPENROUTER/);assert.equal((await fetch(base+'/health')).status,200);
 const invalid=await fetch(base+'/api/research/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(invalid.status,400);
 }finally{if(key===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=key;if(model===undefined)delete process.env.OPENROUTER_MODEL;else process.env.OPENROUTER_MODEL=model;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
