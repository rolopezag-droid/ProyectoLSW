/* Explain observed agreement; never turn text sentiment into a calibrated forecast. */
(function(root){
 function assess(candidate,news,{enabled=true,technical=false,now=Date.now()}={}){
  const counts={bullish:0,bearish:0,mixed:0,neutral:0,unknown:0},sources=[],seen=new Set();
  const result=(state,label,direction=null)=>{
   const relation=direction&&['bullish','bearish'].includes(candidate.side)?direction===candidate.side?'agreement':'contradiction':null;
   const trend=technical&&['bullish','bearish'].includes(candidate.technicalTrend)?candidate.technicalTrend:null;
   const technicalRelation=direction&&trend?direction===trend?'agreement':'contradiction':null;
   const names={BULL_CALL_SPREAD:'Bull Call',BULL_PUT_SPREAD:'Bull Put',BEAR_CALL_SPREAD:'Bear Call',BEAR_PUT_SPREAD:'Bear Put'};
   const strategy=names[candidate.strategy]||(candidate.side==='bullish'?'estrategia Bull':candidate.side==='bearish'?'estrategia Bear':'estrategia sin dirección');
   const strategyDirection=candidate.side==='bullish'?'alcista':candidate.side==='bearish'?'bajista':'sin dirección';
   if(direction)label=`Noticias ${direction==='bullish'?'alcistas':'bajistas'} frente a ${strategy} (${strategyDirection}): ${relation==='agreement'?'direcciones coincidentes':'direcciones opuestas'}`;
   else if(state==='mixed')label=`Noticias mixtas frente a ${strategy}: sin apoyo direccional`;
   else label=`${label} · ${strategy}`;
   const explanation=`${label}. ${state==='mixed'?'Hay señales opuestas entre los artículos; esto no significa que las cuatro estrategias estén contradichas. ':''}Noticias de ${candidate.symbol}: ${counts.bullish} alcistas, ${counts.bearish} bajistas, ${counts.mixed} mixtas, ${counts.neutral} sin dirección y ${counts.unknown} no clasificadas. ${relation==='agreement'?'El sentimiento coincide con la dirección de la estrategia.':relation==='contradiction'?'El sentimiento contradice la dirección de la estrategia.':'No se atribuye apoyo direccional a la estrategia.'} ${technicalRelation==='agreement'?'También coincide con la tendencia técnica.':technicalRelation==='contradiction'?'Contradice la tendencia técnica.':technical?'La tendencia técnica no permite una comparación direccional.':'Core técnico no seleccionado; no se compara su tendencia.'} Es una lectura heurística de los artículos recibidos de los últimos siete días; no mide reacción efectiva del precio ni modifica el score o los cálculos.`;
   return {state,label,direction,relation,technicalRelation,counts:{...counts},sources:[...sources],explanation,method:'news-direction-agreement-v1',affectsScore:false};
  };
  if(!enabled)return result('disabled','Noticias no seleccionadas');
  if(news?.status!=='available')return result('unavailable','Noticias no disponibles');
  for(const article of news.articles||[]){
   if(!Array.isArray(article.symbols)||!article.symbols.some(symbol=>String(symbol).trim().toUpperCase()===candidate.symbol))continue;
   const time=Date.parse(article.created_at||article.updated_at);
   if(!Number.isFinite(time)||time>now||now-time>7*86400000)continue;
   const key=String(article.id||article.url||`${article.headline}|${time}`);if(seen.has(key))continue;seen.add(key);
   const label=article.sentiment?.label;counts[Object.hasOwn(counts,label)?label:'unknown']++;
   sources.push({id:article.id??null,url:article.url||null,headline:article.headline||'Sin titular',timestamp:new Date(time).toISOString(),label:label||'unknown'});
  }
  if(!sources.length)return result('unavailable','Sin noticias recientes atribuibles al ticker');
  if(counts.mixed||counts.bullish&&counts.bearish)return result('mixed','Noticias mixtas; sin dirección única');
  const direction=counts.bullish?'bullish':counts.bearish?'bearish':null;
  if(!direction)return result('neutral','Noticias sin señal direccional');
  return result(direction===candidate.side?'agreement':'contradiction',direction===candidate.side?'Noticias coinciden con la estrategia':'Noticias contradicen la estrategia',direction);
 }
 const api={assess};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NewsConfluence=api;
})(globalThis);
