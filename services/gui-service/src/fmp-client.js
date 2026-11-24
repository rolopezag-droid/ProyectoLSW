const {createHash}=require('node:crypto');
const FRESH_MS=6*3600000,STALE_MS=24*3600000;
const quotaMessage='FMP agotó su cuota de consultas (HTTP 429). La restricción afecta a la cuenta, incluso con un solo ticker. Se pausaron las solicitudes; cambiar de empresa o refrescar no restablece la cuota.';

function createFmpClient({fetchImpl=global.fetch,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),intervalMs=fetchImpl===global.fetch?300:0}={}){
  const successes=new Map(),pending=new Map(),restrictions=new Map(),accounts=new Map();
  function account(key){const fingerprint=createHash('sha256').update(key).digest('hex');if(!accounts.has(fingerprint))accounts.set(fingerprint,{queue:Promise.resolve(),nextAt:0,blockedUntil:0});return {fingerprint,state:accounts.get(fingerprint)};}
  function getStatus(key){const {state}=account(key);return now()<state.blockedUntil?{status:'paused',code:'quota_exhausted',retryAt:new Date(state.blockedUntil).toISOString(),message:quotaMessage}:{status:'ready'};}
  function failure(code,status,message,retryAt){return Object.assign(new Error(message),{code,upstreamStatus:status,retryAt});}
  function quotaError(state){return failure('quota_exhausted',429,quotaMessage,new Date(state.blockedUntil).toISOString());}
  async function request(endpoint,symbol,apiKey){
    const {fingerprint,state}=account(apiKey),cacheKey=`${fingerprint}:${endpoint}:${symbol}`,cached=successes.get(cacheKey);
    if(cached&&now()-cached.at<(cached.result.data.length?FRESH_MS:60000))return {...cached.result,fromCache:true};
    if(pending.has(cacheKey))return pending.get(cacheKey);
    const operation=state.queue.catch(()=>{}).then(async()=>{
      try{
        if(now()<state.blockedUntil)throw quotaError(state);
        const restricted=restrictions.get(cacheKey);if(restricted&&now()<restricted.until)throw restricted.error;
        if(state.nextAt>now())await wait(state.nextAt-now());
        if(now()<state.blockedUntil)throw quotaError(state);
        state.nextAt=now()+intervalMs;
        const url=new URL(`https://financialmodelingprep.com/stable/${endpoint}`);
        url.searchParams.set('apikey',apiKey);if(symbol)url.searchParams.set('symbol',symbol);
        if(['key-metrics','ratios','income-statement'].includes(endpoint)){url.searchParams.set('limit','2');url.searchParams.set('period','annual');}
        const response=await fetchImpl(url,{signal:AbortSignal.timeout(10000)});
        let data;try{data=await response.json();}catch{data=null;}
        const message=typeof data==='string'?data:String(data?.['Error Message']||data?.message||'');
        if(response.status===429||(!Array.isArray(data)&&/limit\s*reach|quota|too many requests|bandwidth.*limit/i.test(message))){
          const retry=response.headers?.get?.('retry-after');
          const delay=retry&&Number.isFinite(Number(retry))?Number(retry)*1000:retry?Date.parse(retry)-now():60000;
          state.blockedUntil=now()+Math.max(1000,Number.isFinite(delay)?delay:60000);
          throw quotaError(state);
        }
        if(!response.ok){
          const error=response.status===402?failure('plan_restricted',402,'FMP restringe este recurso al plan contratado (HTTP 402); cambiar de ticker no garantiza acceso.'):
            response.status===401||response.status===403?failure('access_denied',response.status,`FMP rechazó el acceso (HTTP ${response.status}). Revisa la clave y los permisos del proveedor.`):failure('provider_error',response.status,`FMP no pudo completar la consulta (HTTP ${response.status}).`);
          restrictions.set(cacheKey,{until:now()+60000,error});throw error;
        }
        if(!Array.isArray(data))throw failure('invalid_response',502,'FMP devolvió una respuesta no válida; no se generaron métricas sustitutas.');
        const result={data,capturedAt:new Date(now()).toISOString(),stale:false,fromCache:false};
        successes.set(cacheKey,{at:now(),result});
        return result;
      }catch(error){
        if(cached&&cached.result.data.length&&now()-cached.at<STALE_MS)return {...cached.result,stale:true,fromCache:true,warning:error.message,code:error.code||'network_error',retryAt:error.retryAt};
        if(error.code)throw error;
        throw failure('network_error',502,'No se pudo contactar a FMP o venció el tiempo de espera. No se consumen reintentos automáticos.');
      }
    });
    state.queue=operation.then(()=>{},()=>{});pending.set(cacheKey,operation);
    try{return await operation;}finally{pending.delete(cacheKey);}
  }
  return {request,getStatus};
}
module.exports={createFmpClient};
