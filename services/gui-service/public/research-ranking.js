/* Ranking heurístico: únicamente los cores elegidos aportan al promedio.
 * Noticias se consulta como contexto: no existe un clasificador de sentimiento.
 * Riesgo y liquidez son filtros/desempates, nunca una probabilidad de éxito. */
(function(root){
  const labels={technical:'Técnico',blackScholes:'Black-Scholes',financial:'Fundamental',statements:'Financiero',movers:'Movimiento diario'};
  function rank(candidates,modules,{fundamentals=[],financialStatements=[],changes=[]}={}){
    const selected=Object.keys(labels).filter(key=>modules[key]);
    return candidates.map(candidate=>{
      const components={};
      if(modules.technical)components.technical=candidate.technicalTrend===candidate.side?100:candidate.technicalTrend==='mixed'?50:['bullish','bearish'].includes(candidate.technicalTrend)?0:null;
      if(modules.blackScholes)components.blackScholes=Number.isFinite(candidate.blackScholes?.probability)?candidate.blackScholes.probability*100:null;
      const fundamental=fundamentals.find(row=>row.symbol===candidate.symbol)?.fundamentalScore;
      if(modules.financial)components.financial=fundamental?.status==='available'?fundamental.score:null;
      const statements=financialStatements.find(row=>row.symbol===candidate.symbol)?.financialScore;
      if(modules.statements)components.statements=statements?.status==='available'?statements.score:null;
      const change=changes.find(row=>row.symbol===candidate.symbol)?.changePct;
      if(modules.movers)components.movers=Number.isFinite(change)?Math.max(0,Math.min(100,50+(candidate.side==='bullish'?change:-change)*5)):null;
      const missing=selected.filter(key=>!Number.isFinite(components[key]));
      const score=selected.length&&!missing.length?selected.reduce((sum,key)=>sum+components[key],0)/selected.length:null;
      return {...candidate,score,scoreComponents:components,scoreMissing:missing.map(key=>labels[key]),scoreMethod:'selected-cores-equal-mean-v1',fundamentalScore:modules.financial&&fundamental?.status==='available'?fundamental.score:null,financialScore:modules.statements&&statements?.status==='available'?statements.score:null};
    }).sort((a,b)=>(b.score??-1)-(a.score??-1)||b.riskReward-a.riskReward||a.liquidityScore-b.liquidityScore||a.symbol.localeCompare(b.symbol)||a.strategy.localeCompare(b.strategy)||a.longStrike-b.longStrike||a.shortStrike-b.shortStrike);
  }
  function topCompanies(rows){
    const seen=new Set();return rows.filter(({candidate})=>{if(!Number.isFinite(candidate.score)||seen.has(candidate.symbol))return false;seen.add(candidate.symbol);return true;});
  }
  function journalSnapshot(snapshot,rows){
    // La bitácora admite 200 KB: no duplicar todas las combinaciones en cada empresa.
    const result={...snapshot,underlyings:snapshot.underlyings.map(({candidates,...item})=>item),candidates:rows.slice(0,50).map(row=>row.candidate),persistence:{universeCandidates:snapshot.candidates.length,filteredCandidates:rows.length,savedCandidates:0,scope:'filtered-ranked-first-50'}};
    const news=snapshot.news;
    if(news)result.news={...news,articles:(news.articles||[]).slice(0,20).map(article=>({...article,content:undefined,summary:String(article.summary||'').slice(0,1200)}))};
    const size=()=>new TextEncoder().encode(JSON.stringify(result)).length;
    while(size()>180000&&result.candidates.length)result.candidates.pop();
    while(size()>180000&&result.news?.articles?.length)result.news.articles.pop();
    if(size()>190000)throw new Error('La evidencia excede el límite de la bitácora; reduce las empresas o módulos.');
    result.persistence.savedCandidates=result.candidates.length;return result;
  }
  const api={rank,topCompanies,labels,journalSnapshot};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ResearchRanking=api;
})(globalThis);
