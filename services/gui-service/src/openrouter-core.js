const fs=require('node:fs');const path=require('node:path');const {createHash}=require('node:crypto');
const PROMPT_PATH=path.join(__dirname,'../prompts/core-ia.txt');
const keys=['technical','indicators','financial','statements','monteCarlo','movers','news'];
const error=(status,message)=>Object.assign(new Error(message),{status});
const number=value=>Number.isFinite(value)?value:null;
function cleanInput(input){
 if(!input||!/[A-Z0-9]/.test(input.symbol||'')||!/^[A-Z0-9.-]{1,12}$/.test(input.symbol||'')||!Array.isArray(input.selected)||!input.selected.length||input.selected.some(key=>!keys.includes(key)))throw error(400,'Selecciona una empresa y al menos un core calculado para interpretar.');
 const selected=[...new Set(input.selected)],cores={};
 const numeric={technical:['latestClose','sma20','sma50','rsi14','atr14'],indicators:['bullScore','bearScore','sampleBars'],financial:['score','coverage'],statements:['score','coverage'],monteCarlo:['probability','expectedPnl','p05','p95','simulations'],movers:['changePct'],news:['bullish','bearish','mixed','neutral','unknown']};
 for(const key of selected){const value=input.cores?.[key];if(!value||typeof value!=='object'){cores[key]={status:'unavailable'};continue;}
  cores[key]={status:value.status==='unavailable'?'unavailable':'reported'};
  for(const field of numeric[key])cores[key][field]=number(value[field]);
  if(key==='monteCarlo')cores[key].strategy=['BULL_CALL_SPREAD','BULL_PUT_SPREAD','BEAR_CALL_SPREAD','BEAR_PUT_SPREAD'].includes(value.strategy)?value.strategy:null;
  if(key==='technical')cores[key].trend=['bullish','bearish','mixed'].includes(value.trend)?value.trend:null;
  if(key==='news')cores[key].headlines=Array.isArray(value.headlines)?value.headlines.slice(0,3).map(text=>String(text).slice(0,250)):[];
  if(key==='indicators')cores[key].signals=Array.isArray(value.signals)?value.signals.slice(0,3).map(signal=>({side:['bullish','bearish'].includes(signal.side)?signal.side:null,rule:String(signal.rule||'').slice(0,80),timestamp:String(signal.timestamp||'').slice(0,40)})):[];
 }
 return {symbol:input.symbol,generatedAt:String(input.generatedAt||'').slice(0,40),selected,cores};
}
function validateOutput(value){
 if(!value||typeof value.summary!=='string'||!value.summary.trim()||value.summary.length>2000||typeof value.conclusion!=='string'||!value.conclusion.trim()||value.conclusion.length>2000)throw error(502,'La IA devolvió una interpretación incompleta.');
 const result={summary:value.summary,conclusion:value.conclusion};
 for(const key of ['agreements','contradictions','missingData']){if(!Array.isArray(value[key])||value[key].length>5||value[key].some(item=>typeof item!=='string'||item.length>1000))throw error(502,'La IA devolvió una estructura no válida.');result[key]=value[key];}
 return result;
}
function createAiCore({fetchImpl=global.fetch,now=Date.now}={}){
 const cache=new Map();let active=false,lastStart=-Infinity;
 return async function interpret(input,{apiKey=process.env.OPENROUTER_API_KEY,model=process.env.OPENROUTER_MODEL}={}){
  const payload=cleanInput(input);
  if(!apiKey||!model)return {status:'unavailable',message:'Configura OPENROUTER_API_KEY y OPENROUTER_MODEL en el servidor para usar la IA.'};
  const prompt=fs.readFileSync(PROMPT_PATH,'utf8'),id=createHash('sha256').update(apiKey+model+prompt+JSON.stringify(payload)).digest('hex'),previous=cache.get(id);
  if(previous&&now()-previous.at<300000)return {...previous.value,fromCache:true};
  if(active||now()-lastStart<5000)throw error(429,'La IA está procesando o acaba de recibir una consulta. Espera unos segundos.');
  active=true;lastStart=now();
  try{
   const response=await fetchImpl('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({model,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(payload)}],response_format:{type:'json_object'},max_tokens:1000,temperature:0.2})});
   let data;try{data=await response.json();}catch{throw error(502,'OpenRouter devolvió una respuesta no válida.');}
   if(!response.ok||data?.error||data?.choices?.[0]?.error){const status=response.status;throw error(status===429?429:502,status===401||status===403?'OpenRouter rechazó la clave o los permisos.':status===402?'OpenRouter no tiene saldo disponible para esta consulta.':status===429?'OpenRouter alcanzó un límite de consultas.':'No se pudo generar la interpretación. Revisa modelo, compatibilidad JSON y disponibilidad de OpenRouter.');}
   let parsed;try{parsed=JSON.parse(data?.choices?.[0]?.message?.content);}catch{throw error(502,'La IA no devolvió el JSON esperado. No se mostrará contenido incompleto.');}
   const result={status:'available',provider:'OpenRouter',model,generatedAt:new Date(now()).toISOString(),interpretation:validateOutput(parsed),affectsRanking:false,fromCache:false};
   if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(id,{at:now(),value:result});return result;
  }catch(cause){if(cause.status)throw cause;throw error(502,'No se pudo contactar a OpenRouter o venció el tiempo de espera. El resto del análisis sigue disponible.');}
  finally{active=false;}
 };
}
module.exports={createAiCore,cleanInput,validateOutput,PROMPT_PATH};
