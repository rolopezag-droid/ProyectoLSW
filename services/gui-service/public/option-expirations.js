/* Carga las fechas reales de Alpaca para el selector de comparación. */
(function(){
  const cache=new Map(),$=id=>document.getElementById(id);
  async function getExpirations(symbol){
    let data=cache.get(symbol);
    if(!data||Date.now()-data.loadedAt>300000){
      const response=await fetch('/api/v1/broker/options-chain/expirations?symbol='+encodeURIComponent(symbol));data=await response.json();
      if(!response.ok)throw new Error(data.message||'No se pudieron consultar los vencimientos.');
      if(data.complete!==true||!Array.isArray(data.expirations))throw new Error('Catálogo de vencimientos incompleto.');
      data={...data,loadedAt:Date.now()};cache.set(symbol,data);
    }
    return data;
  }
  function installOperationCatalog(){
    const input=$('expiration');if(!input)return;
    const host=document.createElement('div');host.className='expiration-catalog';
    const button=document.createElement('button');button.type='button';button.className='btn btn-secondary';button.textContent='Consultar vencimientos disponibles';
    const select=document.createElement('select');select.hidden=true;select.setAttribute('aria-label','Vencimientos disponibles para operación');
    const status=document.createElement('small');status.setAttribute('role','status');host.append(button,select,status);input.after(host);
    let version=0,lastSymbol=null;
    const symbolFor=()=>$('symbol').value;
    button.addEventListener('click',async()=>{
      const symbol=symbolFor(),token=++version;lastSymbol=symbol;button.disabled=true;select.hidden=true;status.textContent='Consultando contratos de '+symbol+'…';
      try{
        const data=await getExpirations(symbol);
        if(token!==version||symbolFor()!==symbol)return;
        select.replaceChildren(new Option('Elige un vencimiento',''));
        data.expirations.forEach(date=>select.add(new Option(date,date)));
        select.value=data.expirations.includes(input.value)?input.value:'';
        select.hidden=!data.expirations.length;
        status.textContent=data.expirations.length?`${data.expirations.length} fechas de ${symbol}.`:`No hay fechas disponibles para ${symbol}.`;
      }catch(error){if(token===version)status.textContent=error.message;}
      finally{if(token===version)button.disabled=false;}
    });
    select.addEventListener('change',()=>{
      if(!select.value)return;
      if(lastSymbol!==symbolFor()){select.hidden=true;status.textContent='Cambió la empresa. Consulta sus vencimientos.';return;}
      input.value=select.value;input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    $('symbol')?.addEventListener('change',()=>{if(lastSymbol!==symbolFor()){version++;button.disabled=false;select.hidden=true;status.textContent='Consulta las fechas de la nueva empresa.';}});
  }
  function install(){
    const select=$('researchExpiration'),input=$('expiration'),status=$('researchExpirationStatus');
    if(!select||!input||!status)return;
    let version=0,lastSymbol=null;
    function symbolFor(){
      if($('researchMode').value==='company')return $('researchCompany').value.trim().toUpperCase();
      if($('researchUniverse').value==='custom')return $('researchSymbols').value.split(/[,\s;]+/)[0].trim().toUpperCase();
      return $('chSymbol').value.trim().toUpperCase();
    }
    async function load(){
      const symbol=symbolFor(),token=++version;
      lastSymbol=symbol;select.disabled=true;select.replaceChildren(new Option('Cargando fechas…',''));
      status.textContent=symbol?`Consultando vencimientos disponibles para ${symbol}…`:'Selecciona una empresa para consultar sus vencimientos.';
      if(!symbol){select.disabled=true;return;}
      try{
        const data=await getExpirations(symbol);
        if(token!==version||symbolFor()!==symbol)return;
        select.replaceChildren(new Option('Elige un vencimiento',''));
        data.expirations.forEach(date=>select.add(new Option(date,date)));
        const selected=data.expirations.includes(input.value)?input.value:(data.expirations[0]||'');
        select.value=selected;
        select.disabled=!selected;
        status.textContent=data.expirations.length?`${data.expirations.length} fechas disponibles para ${symbol}. En Top, otras empresas quizá no tengan esa fecha.`:`No hay vencimientos disponibles para ${symbol}.`;
        if(selected&&input.value!==selected){input.value=selected;input.dispatchEvent(new Event('change',{bubbles:true}));}
      }catch(error){
        if(token!==version)return;
        select.replaceChildren(new Option('Fechas no disponibles',''));select.disabled=true;status.textContent=error.message;
      }
    }
    select.addEventListener('change',()=>{
      if(!select.value)return;
      if(lastSymbol!==symbolFor()){load();return;}
      input.value=select.value;input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    for(const field of ['chSymbol','researchCompany','researchSymbols','researchMode','researchUniverse']){
      $(field)?.addEventListener('change',()=>{if(lastSymbol!==symbolFor())load();});
    }
    document.addEventListener('workspace:navigate',event=>{if(event.detail?.page==='comparar')load();});
    if(document.body.dataset.workspacePage==='comparar')load();
  }
  document.addEventListener('DOMContentLoaded',()=>{installOperationCatalog();install();},{once:true});
})();
