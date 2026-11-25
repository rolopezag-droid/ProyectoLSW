/* Calculation boundary shared by the worker and test harness; no network or broker access. */
(function(root){
 const node=typeof module!=='undefined'&&module.exports;
 function calculate({contracts,context,indicators,now}){
  const analysis=node?require('./research-analysis'):root.ResearchAnalysis;
  const core=node?require('./indicator-core'):root.IndicatorCore;
  return {candidates:analysis.compareStrategies(contracts,context),indicatorEvidence:indicators?core.evaluate(context.bars,{symbol:context.symbol,now:now??Date.now()}):null};
 }
 function run(payload,{signal,timeoutMs=120000}={}){
  if(signal?.aborted)return Promise.reject(new DOMException('Análisis cancelado','AbortError'));
  if(typeof root.Worker!=='function'){
   if(/jsdom/i.test(root.navigator?.userAgent||''))return Promise.resolve().then(()=>calculate(payload));
   return Promise.reject(new Error('Este navegador no permite ejecutar el análisis en segundo plano. Abre la aplicación en una versión actual de Edge, Chrome o Firefox.'));
  }
  return new Promise((resolve,reject)=>{
   let worker,timer,settled=false;
   const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();error?reject(error):resolve(value);};
   const abort=()=>finish(new DOMException('Análisis cancelado','AbortError'));
   try{
    worker=new root.Worker('/research-worker.js');
    worker.onmessage=event=>{const message=event.data;if(message?.ok)finish(null,message.result);else finish(new Error(message?.error||'No se pudo completar el cálculo.'));};
    worker.onerror=event=>{event.preventDefault?.();finish(new Error('Falló el cálculo en segundo plano: '+(event.message||'worker no disponible')));};
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted){abort();return;}
    timer=setTimeout(()=>finish(new Error('El cálculo de esta empresa superó el tiempo máximo de 120 segundos. Su cadena puede tener demasiadas combinaciones para este equipo. Vuelve a intentarlo; no se publicaron resultados parciales.')),timeoutMs);
    worker.postMessage(payload);
   }catch(error){finish(new Error('No se pudo iniciar el cálculo en segundo plano: '+error.message));}
  });
 }
 const api={calculate,run};if(node)module.exports=api;else root.ResearchComputation=api;
})(globalThis);
