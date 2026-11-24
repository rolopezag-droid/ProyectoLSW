/* Runs only local algorithms. No credentials, fetches or order execution. */
importScripts('/research-analysis.js','/strategy-triggers.js','/indicator-core.js','/research-computation.js');
self.onmessage=event=>{
 try{self.postMessage({ok:true,result:self.ResearchComputation.calculate(event.data)});}
 catch(error){self.postMessage({ok:false,error:error.message||'Error de cálculo'});}
};
