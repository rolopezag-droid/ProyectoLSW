const {spawn}=require('node:child_process');
const path=require('node:path');
const base=4200,root=path.resolve(__dirname,'..');
const env={...process.env,GATEWAY_PORT:String(base),PORT:String(base+1),QUANT_PORT:String(base+2),STRATEGY_PORT:String(base+3),SPREAD_PORT:String(base+4),GUI_PORT:String(base+5),GATEWAY_SERVICE_URL:'http://127.0.0.1:'+base,CATALOG_SERVICE_URL:'http://127.0.0.1:'+(base+1),QUANT_SERVICE_URL:'http://127.0.0.1:'+(base+2),SPREAD_SERVICE_URL:'http://127.0.0.1:'+(base+4)};
const child=spawn(process.execPath,['services/gui-service/src/server.js'],{cwd:root,env,windowsHide:true,stdio:'ignore'});
const url='http://127.0.0.1:'+(base+5);let owned=false;
(async()=>{
 try{
  for(let i=0;i<40;i++) {
   if(child.exitCode!==null)throw Error('La instancia temporal no pudo iniciar; revisa puertos 4200 a 4205.');
   try{const h=await(await fetch(url+'/health',{signal:AbortSignal.timeout(500)})).json();if(h.pid===child.pid){owned=true;break;}}catch{}
   await new Promise(r=>setTimeout(r,200));
  }
  if(!owned)throw Error('No respondió la instancia temporal.');
  await new Promise(r=>setTimeout(r,2000));
  const status=await(await fetch(url+'/api/services/status',{signal:AbortSignal.timeout(5000)})).json();
  for(const [key,svc]of Object.entries(status))console.log(key+': proceso='+svc.processRunning+', health='+svc.running);
  if(Object.values(status).some(s=>!s.processRunning))throw Error('Un servicio terminó al iniciar.');
  if(Object.entries(status).some(([key,s])=>key!=='spread-service'&&!s.running))throw Error('Un servicio local no está disponible.');
  if(!status['spread-service'].running)console.log('Spread está iniciado, pero Supabase no respondió al health: verificar conectividad externa.');
  console.log('Arranque único comprobado; no se enviaron órdenes ni escrituras de negocio.');
 }finally{
  if(owned)for(const name of ['api-gateway','catalog-service','quant-service','strategy-service','spread-service'])try{await fetch(url+'/api/services/'+name+'/stop',{method:'POST',signal:AbortSignal.timeout(1000)});}catch{}
  child.kill();
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
