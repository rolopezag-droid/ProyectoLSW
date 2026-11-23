/* Catálogo real, bajo demanda. La fecha manual sigue disponible; nunca inventar fechas. */
(function(){
  const cache=new Map(),$=id=>document.getElementById(id);
  function install(id,symbolFor){
    const input=$(id);if(!input)return;
    const host=document.createElement('div');host.className='expiration-catalog';
    const button=document.createElement('button');button.type='button';button.className='btn btn-secondary';button.textContent='Consultar vencimientos disponibles';
    const select=document.createElement('select');select.hidden=true;select.setAttribute('aria-label','Vencimientos disponibles para '+id);
    const status=document.createElement('small');status.setAttribute('role','status');host.append(button,select,status);input.after(host);
    let version=0,lastSymbol=null;
    button.addEventListener('click',async()=>{
      const symbol=symbolFor(),token=++version;lastSymbol=symbol;button.disabled=true;select.hidden=true;status.textContent='Consultando contratos de '+symbol+'…';
      try{
        let data=cache.get(symbol);if(!data||Date.now()-data.loadedAt>300000){
          const response=await fetch('/api/v1/broker/options-chain/expirations?symbol='+encodeURIComponent(symbol));data=await response.json();
          if(!response.ok)throw new Error(data.message||'No se pudieron consultar los vencimientos.');
          if(data.complete!==true||!Array.isArray(data.expirations))throw new Error('Catálogo de vencimientos incompleto. Puedes escribir una fecha manual.');
          data={...data,loadedAt:Date.now()};cache.set(symbol,data);
        }
        if(token!==version||symbolFor()!==symbol)return;
        select.replaceChildren(new Option('Elige un vencimiento',''));
        data.expirations.forEach(date=>select.add(new Option(date,date)));select.hidden=!data.expirations.length;
        status.textContent=data.expirations.length?`${data.expirations.length} fechas de ${symbol}. En el top, otras empresas pueden no tener contratos para la misma fecha.`:`No hay fechas disponibles para ${symbol}.`;
      }catch(error){if(token===version)status.textContent=error.message;}
      finally{if(token===version)button.disabled=false;}
    });
    select.addEventListener('change',()=>{if(!select.value)return;if(lastSymbol!==symbolFor()){select.hidden=true;status.textContent='Cambió la empresa. Consulta sus vencimientos.';return;}input.value=select.value;input.dispatchEvent(new Event('change',{bubbles:true}));});
    for(const field of ['symbol','researchCompany','researchSymbols','researchMode','researchUniverse'])$(field)?.addEventListener('change',()=>{if(lastSymbol!==symbolFor()){version++;button.disabled=false;select.hidden=true;status.textContent='Consulta las fechas de la nueva selección.';}});
  }
  document.addEventListener('DOMContentLoaded',()=>{
    install('expiration',()=>$('symbol').value);
    install('researchExpiration',()=>$('researchMode').value==='company'?$('researchCompany').value:$('researchUniverse').value==='all'?$('chSymbol').options[0].value:$('researchSymbols').value.split(',')[0].trim().toUpperCase());
  },{once:true});
})();
