const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const {Worker}=require('node:worker_threads');
const directory=path.resolve(__dirname,'../public');
function client(){
 const instances=[];
 class BrowserWorker{
  constructor(url){assert.equal(url,'/research-worker.js');instances.push(this);this.terminated=false;
   this.worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const context=vm.createContext({console});context.self=context;context.postMessage=data=>parentPort.postMessage(data);context.importScripts=(...urls)=>{for(const url of urls)vm.runInContext(fs.readFileSync(path.join(workerData,url.slice(1)),'utf8'),context);};vm.runInContext(fs.readFileSync(path.join(workerData,'research-worker.js'),'utf8'),context);parentPort.on('message',data=>context.onmessage({data}));`,{eval:true,workerData:directory});
   this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.({message:error.message,preventDefault(){}}));
  }
  postMessage(payload){this.worker.postMessage(payload);}
  terminate(){this.terminated=true;this.worker.terminate();}
 }
 const context=vm.createContext({Worker:BrowserWorker,DOMException,AbortController,setTimeout,clearTimeout,navigator:{userAgent:'browser-test'}});
 vm.runInContext(fs.readFileSync(path.join(directory,'research-computation.js'),'utf8'),context);
 return {api:context.ResearchComputation,instances};
}
function payload(){const expiration=new Date(Date.now()+45*86400000).toISOString().slice(0,10);return {indicators:true,context:{symbol:'AAPL',expiration,spot:100,includeTechnical:true,includeMonteCarlo:true,includeBlackScholes:false,bars:Array.from({length:260},(_,i)=>({timestamp:new Date(Date.now()-(261-i)*86400000).toISOString(),open:100,high:101,low:99,close:100+Math.sin(i/7)*.2}))},contracts:['call','put'].flatMap(type=>Array.from({length:12},(_,i)=>({type,underlyingSymbol:'AAPL',expiration,strike:94+i,contractSymbol:type+i,bid:20+(type==='call'?-1:1)*i*.5,ask:20+(type==='call'?-1:1)*i*.5+.05,timestamp:new Date().toISOString(),multiplier:100}))) };}
test('worker real ejecuta Monte Carlo e indicadores mientras el hilo principal sigue atendiendo eventos',async()=>{
 const {api,instances}=client();let ticks=0;const pulse=setInterval(()=>ticks++,5);
 try{const result=await api.run(payload());assert.ok(result.candidates.length>100);assert.ok(result.candidates.every(row=>row.monteCarlo?.simulations===10000));assert.equal(result.indicatorEvidence.status,'available');assert.ok(ticks>1,'el hilo principal debe seguir respondiendo');assert.equal(instances[0].terminated,true);}finally{clearInterval(pulse);for(const instance of instances)instance.terminate();}
});
test('cancelación y timeout terminan workers sin publicar respuestas tardías',async()=>{
 const {api,instances}=client();const controller=new AbortController();const pending=api.run(payload(),{signal:controller.signal});controller.abort();await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(instances[0].terminated,true);
 await assert.rejects(api.run(payload(),{timeoutMs:1}),/tiempo máximo/);assert.equal(instances[1].terminated,true);
});
test('error de cálculo no deja worker vivo',async()=>{const {api,instances}=client();await assert.rejects(api.run({context:null}),/null|context|bars/);assert.equal(instances[0].terminated,true);});

test('worker resuelve más de 120000 combinaciones sin recortar escenarios ni bloquear la interfaz',async()=>{
 const job=payload(),count=250;
 job.indicators=false;
 job.contracts=['call','put'].flatMap(type=>Array.from({length:count},(_,i)=>({type,underlyingSymbol:'AAPL',expiration:job.context.expiration,strike:80+i*40/count,contractSymbol:type+i,bid:40+(type==='call'?-1:1)*i*20/count,ask:40+(type==='call'?-1:1)*i*20/count+.01,timestamp:new Date().toISOString(),multiplier:100})));
 const {api,instances}=client();let ticks=0;const pulse=setInterval(()=>ticks++,5),start=performance.now();
 try{
  const result=await api.run(job);
  assert.ok(result.candidates.length>120000);
  assert.ok(result.candidates.every(c=>c.monteCarlo?.simulations===10000));
  assert.ok(ticks>1);assert.equal(instances[0].terminated,true);
  console.log(JSON.stringify({workerCandidates:result.candidates.length,elapsedMs:Math.round(performance.now()-start),uiHeartbeats:ticks}));
 }finally{clearInterval(pulse);for(const instance of instances)instance.terminate();}
});
