function createSetupClient(fetchImplementation=fetch,baseUrl=process.env.SPREAD_SERVICE_URL||'http://127.0.0.1:3004') {
  async function send(request,method,body) {
    const authorization=request.get('authorization');
    if(!/^Bearer \S+$/.test(authorization||'')){const e=new Error('Se requiere una sesión de Supabase.');e.status=401;throw e;}
    const url=new URL('/api/v1/spreads',baseUrl);
    if(method==='GET')for(const key of ['limit','skip','status','strategyType','underlyingTicker'])if(request.query[key]!==undefined)url.searchParams.set(key,request.query[key]);
    let response;
    try{response=await fetchImplementation(url.toString(),{method,headers:{Authorization:authorization,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});}catch{const e=new Error('No se pudo contactar al servicio de persistencia.');e.status=502;throw e;}
    const data=await response.json();
    if(!response.ok){const e=new Error(data.message||'No se pudo persistir el setup.');e.status=response.status;throw e;}
    return data;
  }
  return {list:request=>send(request,'GET'),create:(request,body)=>send(request,'POST',body)};
}
module.exports={createSetupClient};
