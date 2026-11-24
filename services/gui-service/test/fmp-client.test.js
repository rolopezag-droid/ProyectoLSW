const test=require('node:test'),assert=require('node:assert/strict');
const {createFmpClient}=require('../src/fmp-client');
const {loadFundamentals}=require('../src/fmp-fundamentals');
const response=(data,status=200,retry)=>({ok:status===200,status,json:async()=>data,headers:{get:()=>retry}});

test('429 frena toda la cuenta y respeta Retry-After; otra credencial continúa',async()=>{
 let time=0,calls=0;
 const client=createFmpClient({now:()=>time,fetchImpl:async url=>{calls++;return new URL(url).searchParams.get('apikey')==='blocked'?response({'Error Message':'Limit Reach'},429,'120'):response([{marketCap:123}]);}});
 const attempts=await Promise.allSettled(['profile','ratios','key-metrics'].map(endpoint=>client.request(endpoint,'AAPL','blocked')));
 assert.equal(calls,1);assert.ok(attempts.every(result=>result.reason.code==='quota_exhausted'));
 await assert.rejects(client.request('profile','DELL','blocked'),/cuota/);assert.equal(calls,1);
 await client.request('profile','DELL','working');assert.equal(calls,2);
 time=119999;await assert.rejects(client.request('profile','DELL','blocked'),/cuota/);assert.equal(calls,2);
 time=120001;await assert.rejects(client.request('profile','DELL','blocked'),/cuota/);assert.equal(calls,3);
});
test('Limit Reach dentro de HTTP 200 también activa la protección',async()=>{
 let calls=0;const client=createFmpClient({fetchImpl:async()=>{calls++;return response({'Error Message':'Limit Reach. Please upgrade your plan.'});}});
 await assert.rejects(client.request('profile','AAPL','key'),/429/);await assert.rejects(client.request('ratios','MSFT','key'),/cuota/);assert.equal(calls,1);
});
test('recurso exitoso se reutiliza y los fallidos se recuperan al terminar la pausa',async()=>{
 let time=0,blocked=true;const calls=[];
 const fetchImpl=async url=>{const endpoint=new URL(url).pathname.split('/').at(-1);calls.push(endpoint);if(endpoint==='ratios'&&blocked)return response({},429,'1');return response([{marketCap:100,returnOnEquity:.2}]);};
 const options={fetchImpl,now:()=>time};
 const first=await loadFundamentals(['RECOVERY'],'recovery-key',options);
 assert.equal(first.rows[0].status,'available');assert.equal(calls.length,2);assert.match(first.rows[0].warnings.join(' '),/cuota/);
 const paused=await loadFundamentals(['RECOVERY'],'recovery-key',options);assert.equal(calls.length,2);assert.equal(paused.providerState.status,'paused');
 time=1001;blocked=false;const recovered=await loadFundamentals(['RECOVERY'],'recovery-key',options);
 assert.equal(calls.filter(endpoint=>endpoint==='key-metrics').length,1);assert.equal(calls.length,5);assert.equal(recovered.rows[0].warnings.length,0);
});
test('solicitudes concurrentes idénticas comparten la misma lectura',async()=>{
 let calls=0;const client=createFmpClient({fetchImpl:async()=>{calls++;return response([{marketCap:100}]);}});
 await Promise.all(Array.from({length:20},()=>client.request('profile','IBM','same')));assert.equal(calls,1);
});
test('caché vencida conserva fecha y marca datos sin actualizar ante error, nunca inventa datos',async()=>{
 let time=0,fail=false,calls=0;
 const client=createFmpClient({now:()=>time,fetchImpl:async()=>{calls++;return fail?response({},429,'60'):response([{marketCap:10}]);}});
 const first=await client.request('profile','IBM','stale');time=6*3600000+1;fail=true;
 const old=await client.request('profile','IBM','stale');assert.equal(old.stale,true);assert.equal(old.capturedAt,first.capturedAt);assert.equal(old.data[0].marketCap,10);
 await assert.rejects(client.request('profile','DELL','stale'),/cuota/);assert.equal(calls,2);
 time=25*3600000;await assert.rejects(client.request('profile','IBM','stale'),/cuota/);
});
test('Retry-After acepta fecha HTTP y 402 no bloquea a otra empresa',async()=>{
 let time=Date.parse('2026-11-24T12:00:00Z'),calls=0;
 const client=createFmpClient({now:()=>time,fetchImpl:async url=>{calls++;return new URL(url).searchParams.get('symbol')==='AAPL'?response({},402):response({},429,'Tue, 24 Nov 2026 12:02:00 GMT');}});
 await assert.rejects(client.request('ratios','AAPL','key'),/402/);
 await assert.rejects(client.request('ratios','DELL','key'),/429/);assert.equal(calls,2);
 assert.equal(client.getStatus('key').retryAt,'2026-11-24T12:02:00.000Z');
});
