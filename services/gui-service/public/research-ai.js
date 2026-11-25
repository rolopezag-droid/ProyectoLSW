/* Optional interpretation only; formulas and ranking remain owned by the existing cores. */
(function(){
 const $=id=>document.getElementById(id);let snapshot=null,controller=null,version=0;
 const allowed=['technical','indicators','financial','statements','monteCarlo','movers','news'];
 function clear(){version++;controller?.abort();controller=null;$('researchAiResult').replaceChildren();$('researchAiStatus').textContent='';$('btnResearchAi').disabled=false;}
 function payload(state,symbol){
  const item=state.underlyings.find(item=>item.symbol===symbol),candidate=state.candidates.find(row=>row.symbol===symbol);
  const selected=allowed.filter(key=>state.modules[key]),cores={};
  for(const key of selected){
   if(key==='technical')cores[key]=item?.technical||{status:'unavailable'};
   if(key==='indicators')cores[key]=item?.indicatorEvidence||{status:'unavailable'};
   if(key==='financial'){const score=state.fundamentals?.rows?.find(row=>row.symbol===symbol)?.fundamentalScore;cores[key]=score||{status:'unavailable'};}
   if(key==='statements'){const score=state.financialStatements?.rows?.find(row=>row.symbol===symbol)?.financialScore;cores[key]=score||{status:'unavailable'};}
   if(key==='monteCarlo')cores[key]=candidate?.monteCarlo?{...candidate.monteCarlo,strategy:candidate.strategy,status:Number.isFinite(candidate.monteCarlo.probability)?'available':'unavailable'}:{status:'unavailable'};
   if(key==='movers')cores[key]=Number.isFinite(item?.dailyChangePct)?{changePct:item.dailyChangePct}:{status:'unavailable'};
   if(key==='news'){
    const articles=(state.news?.articles||[]).filter(article=>{const time=Date.parse(article.created_at||article.updated_at);return (article.symbols||[]).includes(symbol)&&Number.isFinite(time)&&time<=Date.now()&&Date.now()-time<=7*86400000;});
    const counts={bullish:0,bearish:0,mixed:0,neutral:0,unknown:0};
    for(const article of articles){const fallback=window.NewsContext.assess(article),map={'Posible sesgo alcista':'bullish','Posible sesgo bajista':'bearish','Señales mixtas':'mixed','Sin dirección clara':'neutral'},label=article.sentiment?.label||map[fallback.label]||'unknown';counts[Object.hasOwn(counts,label)?label:'unknown']++;}
    cores[key]={status:state.news?.status==='available'&&articles.length?'available':'unavailable',...counts,headlines:articles.slice(0,3).map(article=>article.headline)};
   }
  }
  return {symbol,generatedAt:state.generatedAt,selected,cores};
 }
 document.addEventListener('research:invalidated',()=>{clear();snapshot=null;$('researchAiPanel').hidden=true;});
 document.addEventListener('research:snapshot',event=>{
  clear();snapshot=event.detail;const panel=$('researchAiPanel');panel.hidden=!snapshot.modules.ai;
  const select=$('researchAiCompany'),previous=select.value;select.replaceChildren();
  for(const item of snapshot.underlyings){const option=document.createElement('option');option.value=item.symbol;option.textContent=item.symbol;select.append(option);}
  if([...select.options].some(option=>option.value===previous))select.value=previous;
  $('btnResearchAi').disabled=!select.value;
  if(!panel.hidden)$('researchAiStatus').textContent='El análisis está listo. Pulsa el botón para solicitar una interpretación; no se consulta IA automáticamente.';
 });
 $('researchAiCompany').addEventListener('change',clear);
 $('btnResearchAi').addEventListener('click',async()=>{
  if(!snapshot?.modules.ai||!$('researchAiCompany').value)return;
  clear();const requestVersion=version,state=snapshot,symbol=$('researchAiCompany').value;controller=new AbortController();$('btnResearchAi').disabled=true;$('researchAiStatus').textContent='Consultando interpretación de '+symbol+'…';
  try{
   const response=await fetch('/api/research/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload(state,symbol)),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});
   if(response.status===404){
    if(requestVersion===version)$('researchAiStatus').textContent='El servidor que está ejecutándose todavía no reconoce el core de IA. Reinicia la aplicación desde la carpeta actualizada del proyecto; recargar la página no actualiza el backend.';
    return;
   }
   const data=await response.json();if(requestVersion!==version||snapshot!==state)return;
   if(!response.ok||data.status!=='available'){ $('researchAiStatus').textContent=data.message||'La IA no está disponible. Los otros cores conservan sus resultados.';return;}
   const result=data.interpretation;if(!result||typeof result.summary!=='string'||typeof result.conclusion!=='string'||!['agreements','contradictions','missingData'].every(key=>Array.isArray(result[key])&&result[key].every(item=>typeof item==='string')))throw new Error('Respuesta de IA incompleta.');
   const host=$('researchAiResult');
   for(const [title,value] of [['Qué muestran los datos',result.summary],['Señales que coinciden',result.agreements],['Señales que se contradicen',result.contradictions],['Datos faltantes',result.missingData],['Lectura conjunta',result.conclusion]]){
    const heading=document.createElement('h4');heading.textContent=title;host.append(heading);
    if(Array.isArray(value)){const list=document.createElement('ul');for(const text of value){const li=document.createElement('li');li.textContent=text;list.append(li);}if(!value.length){const li=document.createElement('li');li.textContent='Ninguna identificada por el modelo.';list.append(li);}host.append(list);}else{const p=document.createElement('p');p.textContent=value;host.append(p);}
   }
   $('researchAiStatus').textContent='Interpretación generada por IA · OpenRouter · '+(data.servedModel||data.model||'modelo configurado')+(data.fromCache?' · recuperada de caché':'')+'. Puede contener errores; no cambia el ranking ni ejecuta operaciones.';
  }catch(error){if(requestVersion===version)$('researchAiStatus').textContent=error.name==='AbortError'?'Consulta de IA cancelada o tiempo de espera agotado.':'No se pudo generar la interpretación. Los otros cores siguen disponibles.';}
  finally{if(requestVersion===version){controller=null;$('btnResearchAi').disabled=false;}}
 });
})();
