(function(){
  let currentSnapshot=null,accessToken=null,running=false,modulesDirty=false;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>Number.isFinite(value)?'$'+value.toFixed(2):'—';
  const moneyCompact=value=>Number.isFinite(value)?new Intl.NumberFormat('es-MX',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(value):'—';
  const pct=value=>Number.isFinite(value)?(value*100).toFixed(1)+'%':'Insuficientes';
  const percentPoints=value=>Number.isFinite(value)?(value>0?'+':'')+value.toFixed(2)+'%':'—';
  const setStatus=(text,state='')=>{$('researchStatus').textContent=text;$('researchStatus').dataset.state=state;};
  const readModules=()=>({technical:$('researchModuleTechnical').checked,blackScholes:$('researchModuleBlackScholes').checked,financial:$('researchModuleFinancial').checked,movers:$('researchModuleMovers').checked,news:$('researchModuleNews').checked});
  async function json(url,options={}){
    const response=await fetch(url,options),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.detail?`${data.message||'Error del servidor.'} Detalle: ${data.detail}`:data.message||`Error del servidor (${response.status}).`);
    return data;
  }
  async function allContracts(symbol,expiration,type){
    return window.selectVertical.collectOptionChain(async pageToken=>{
      const params=new URLSearchParams({symbol,expiration,type,limit:'200'});if(pageToken)params.set('pageToken',pageToken);
      return json('/api/v1/broker/options-chain?'+params);
    });
  }
  async function analyzeSymbol(symbol,expiration,modules,riskFreeRate,dividendYield){
    const end=new Date(),start=new Date(end);start.setUTCDate(start.getUTCDate()-370);
    const params=new URLSearchParams({symbol,timeframe:'1Day',start:start.toISOString(),end:end.toISOString(),limit:'1000',sort:'asc'});
    const [barsData,quote,calls,puts]=await Promise.all([
      json('/api/v1/broker/candles?'+params),json('/api/v1/broker/quotes?symbol='+encodeURIComponent(symbol)),allContracts(symbol,expiration,'call'),allContracts(symbol,expiration,'put')
    ]);
    const bars=barsData.bars||[],last=bars.at(-1),spot=Number.isFinite(quote.referencePrice)&&quote.referencePrice>0?quote.referencePrice:last?.close;
    if(!Number.isFinite(spot)||spot<=0)throw new Error('No hay precio de referencia válido.');
    const technical=modules.technical?ResearchAnalysis.technicalIndicators(bars):null;
    const levels=modules.technical?ResearchAnalysis.supportResistance(bars):null;
    const contracts=[...calls,...puts];
    const previous=bars.at(-2);
    const changePct=last&&previous&&Number.isFinite(last.close)&&Number.isFinite(previous.close)&&previous.close!==0?(last.close/previous.close-1)*100:null;
    return {symbol,spot,spotSource:quote.referenceSource||'último cierre de vela',spotTimestamp:quote.referenceTimestamp||last?.timestamp||null,capturedAt:barsData.capturedAt,stockFeed:barsData.feed||'iex',dailyChangePct:changePct,technical,supportResistance:levels,candidates:ResearchAnalysis.compareStrategies(contracts,{symbol,expiration,spot,bars,includeTechnical:modules.technical,includeBlackScholes:modules.blackScholes,riskFreeRate,dividendYield})};
  }
  async function fetchNews(symbols){
    const end=new Date(),start=new Date(end);start.setUTCDate(start.getUTCDate()-7);
    const params=new URLSearchParams({symbols:symbols.join(','),start:start.toISOString(),end:end.toISOString(),sort:'desc',limit:'50'});
    const result=await json('/api/v1/broker/news?'+params);
    return {status:'available',provider:'Alpaca',capturedAt:result.capturedAt,articles:result.articles||[]};
  }
  function renderFinancialAndMovers(snapshot){
    const modules=snapshot.modules,fundamentals=snapshot.fundamentals;
    $('researchFinancialPanel').hidden=!modules.financial;
    if(modules.financial){
      const status=$('researchFinancialStatus'),host=$('researchFinancialRows');
      if(!fundamentals){status.textContent='Se consultan métricas fundamentales en FMP cuando FMP_API_KEY está configurada en el servidor.';host.innerHTML='';}
      else if(fundamentals.status!=='available'){status.textContent=fundamentals.error||'FMP no devolvió fundamentales para estos tickers.';host.innerHTML=fundamentals.rows.map(row=>`<article class="research-financial-row"><strong>${esc(row.symbol)}</strong> · ${esc(row.error||'Sin datos para mostrar.')}</article>`).join('');}
      else {status.textContent=`Fuente: ${fundamentals.provider} · Consulta ${new Date(fundamentals.capturedAt).toLocaleString('es-MX')}. El score fundamental ajusta el ranking, no las probabilidades.`;host.innerHTML=fundamentals.rows.map(row=>{if(row.status!=='available')return `<article class="research-financial-row"><strong>${esc(row.symbol)}</strong> · ${esc(row.error||'Sin datos para mostrar.')}</article>`;const m=row.metrics||{},fundamentalScore=row.fundamentalScore,scoreBlock=fundamentalScore?.status==='available'?`<p><strong>Score fundamental: ${fundamentalScore.score.toFixed(1)}/100</strong> · Cobertura ${fundamentalScore.coverage}% · Factor de ranking ×${fundamentalScore.factor.toFixed(2)}</p><details><summary>Componentes del score fundamental</summary><p>${fundamentalScore.components.map(component=>`${esc(component.label)} (${component.weight}%): ${component.score===null?'sin dato':component.score.toFixed(0)+'/100'}`).join(' · ')}</p><p>Umbrales: crecimiento −20% a +20%; ROE −10% a +30%; margen neto −20% a +20%; deuda/capital 0 a 3 (invertido); razón corriente 0.5 a 2; P/E 5 a 40 (invertido); P/B 1 a 10 (invertido). Valores fuera del rango se limitan a 0 o 100. Cobertura menor al 50% deja el score sin calcular. Heurística general sin comparación sectorial.</p></details>`: `<p><strong>Score fundamental no disponible</strong> · Cobertura ${fundamentalScore?.coverage??0}% (mínimo 50%).</p>`,defs=[['Capitalización',m.marketCap===null?'—':moneyCompact(m.marketCap)],['P/E',m.pe===null?'—':m.pe.toFixed(2)],['P/B',m.pb===null?'—':m.pb.toFixed(2)],['ROE',m.roe===null?'—':percentPoints(m.roe*100)],['Margen neto',m.netMargin===null?'—':percentPoints(m.netMargin*100)],['Deuda/capital',m.debtEquity===null?'—':m.debtEquity.toFixed(2)],['Razón corriente',m.currentRatio===null?'—':m.currentRatio.toFixed(2)],['Crec. ingresos anual',m.revenueGrowth===null?'—':percentPoints(m.revenueGrowth)],['Crec. utilidad anual',m.netIncomeGrowth===null?'—':percentPoints(m.netIncomeGrowth)],['FCF por acción',m.freeCashFlowPerShare===null?'—':money(m.freeCashFlowPerShare)]];return `<article class="research-financial-row"><strong>${esc(row.symbol)}</strong>${row.period?' · '+esc(row.period):''}${row.dataDate?' · Datos al '+esc(row.dataDate):''}${scoreBlock}<div>${defs.filter(([,v])=>v!=='—').map(([n,v])=>`${esc(n)}: ${esc(v)}`).join(' · ')||'FMP no devolvió métricas reconocidas para este periodo.'}</div></article>`;}).join('');}
    }
    $('researchMoversPanel').hidden=!modules.movers;
    if(modules.movers){
      const status=$('researchMoversStatus'),host=$('researchMovers');
      const movers=snapshot.movers;
      if(!movers||movers.status!=='available'){status.textContent='No hay cambio diario disponible para los tickers elegidos.';host.innerHTML='';}
      else {
        status.textContent=`Variación diaria de velas Alpaca · Captura ${new Date(movers.capturedAt).toLocaleString('es-MX')}. Comparación limitada a los tickers que ingresaste.`;
        const group=(title,rows)=>`<strong>${title}</strong>${rows.length?rows.map(row=>`<div class="research-mover-row"><strong>${esc(row.symbol)}</strong> · ${percentPoints(row.changePct)}</div>`).join(''):'<div class="research-mover-row">Sin tickers en este grupo.</div>'}`;
        host.innerHTML=group('Ganadores',movers.gainers)+group('Perdedores',movers.losers);
      }
    }
  }
  function renderTechnical(snapshot){
    const selected=snapshot.modules.technical;$('researchTechnicalPanel').hidden=!selected;
    if(!selected){$('researchMetrics').innerHTML='';return;}
    const metrics=[];
    for(const item of snapshot.underlyings){
      const t=item.technical,levels=item.supportResistance;
      const stat=(label,value)=>`<div><span class="research-stat-label">${label}</span><span class="research-stat-value">${value}</span></div>`;
      const zones=(label,items)=>`<div class="research-zone-row"><strong>${label}:</strong> ${items.length?items.map(zone=>`${money(zone.lower)}–${money(zone.upper)} · ${zone.touchCount} pivote(s) · ${zone.distanceAtr.toFixed(1)} ATR · ${esc(zone.status)}${zone.breakoutAt?' · ruptura '+new Date(zone.breakoutAt).toLocaleDateString('es-MX'):''}`).join('<br>'):'sin nivel confirmado'}</div>`;
      const zoneContent=levels?.available?zones('Soportes',levels.supports)+zones('Resistencias',levels.resistances):`<div class="research-zone-row">Soportes/resistencias no disponibles: se requieren al menos 15 velas válidas para calcular ATR y pivotes confirmados.</div>`;
      metrics.push(`<article class="research-ticker-card"><div class="research-ticker-title"><strong>${esc(item.symbol)}</strong><span class="research-trend trend-${esc(t?.trend||'mixed')}">${esc(t?.trend||'sin datos')}</span></div><div class="research-stat-grid">${stat('Precio ref.',money(item.spot))}${stat('RSI 14',Number.isFinite(t?.rsi14)?t.rsi14.toFixed(1):'Insuficientes')}${stat('SMA 20',money(t?.sma20))}${stat('SMA 50',money(t?.sma50))}${stat('ATR 14',money(t?.atr14))}${stat('Vol. anualizada',Number.isFinite(t?.annualizedVolatility)?t.annualizedVolatility.toFixed(1)+'%':'Insuficiente')}</div><div class="research-zone-list">${zoneContent}</div><p class="research-news-meta">${t?.sampleBars??0} velas · Feed ${esc(item.stockFeed)} · Fin ${esc(t?.end?new Date(t.end).toLocaleDateString('es-MX'):'sin fecha')} · pivotes confirmados hasta ${esc(levels?.confirmedThrough?new Date(levels.confirmedThrough).toLocaleDateString('es-MX'):'sin datos')}</p></article>`);
    }
    $('researchMetrics').innerHTML=metrics.join('');
  }
  function renderSummary(snapshot){
    const modules=snapshot.modules,selected=[];
    if(modules.technical)selected.push('Técnico');if(modules.blackScholes)selected.push('Black‑Scholes');if(modules.financial)selected.push('Fundamentales FMP');if(modules.movers)selected.push('Ganadores/perdedores entre tickers elegidos');if(modules.news)selected.push('Noticias Alpaca');
    $('researchCoreModules').textContent=selected.join(' · ')||'Solo opciones e histórico';
    const items=[`Comparé ${snapshot.underlyings.map(item=>item.symbol).join(', ')} para vencimiento ${snapshot.expirationDate} con cotizaciones de opciones Alpaca.`,'La probabilidad histórica es una frecuencia de retornos pasados al break-even; no es pronóstico calibrado.'];
    if(modules.technical)for(const item of snapshot.underlyings){const trend=item.technical?.trend||'sin datos';const supports=item.supportResistance?.supports?.filter(zone=>zone.status==='active')||[],resistances=item.supportResistance?.resistances?.filter(zone=>zone.status==='active')||[];items.push(`${item.symbol}: tendencia ${trend}; soporte activo más cercano ${supports.length?money(supports[0].level):'no identificado'}; resistencia activa más cercana ${resistances.length?money(resistances[0].level):'no identificada'}.`);}
    if(modules.blackScholes)items.push('Black‑Scholes estima una probabilidad risk‑neutral independiente usando volatilidad realizada histórica como proxy, no IV de opciones.');
    if(modules.financial)items.push(snapshot.fundamentals?.status==='available'?snapshot.fundamentals.rows.filter(row=>row.status==='available').map(row=>row.fundamentalScore?.status==='available'?`${row.symbol}: score fundamental ${row.fundamentalScore.score.toFixed(1)}/100; ajusta el ranking con factor ×${row.fundamentalScore.factor.toFixed(2)}.`:`${row.symbol}: score fundamental no disponible por cobertura insuficiente.`).join(' '):snapshot.fundamentals?.error||'No hay fundamentales disponibles desde FMP.');
    if(modules.movers)items.push(snapshot.movers?.status==='available'?'Ganadores/perdedores se comparan solo entre los tickers elegidos, con cambio diario de velas Alpaca.':'No hay cambio diario disponible para comparar los tickers elegidos.');
    if(modules.news)items.push(snapshot.news.status==='available'?`${snapshot.news.articles.length} noticias recientes consultadas en Alpaca.`:'Noticias Alpaca no disponibles: '+(snapshot.news.error||'sin resultados.'));
    const best=snapshot.candidates[0];if(best)items.push(`Mejor score combinado orientativo: ${best.symbol} ${best.strategy.replace('_SPREAD','').replaceAll('_',' ')}; prob. histórica ${pct(best.probability.probability)}${best.blackScholes?`; Black‑Scholes ${pct(best.blackScholes.probability)}`:''}. Las probabilidades no se ajustan con fundamentales.`);
    $('researchCoreSummary').innerHTML=`<ul class="research-summary-list">${items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`;
  }
  function render(snapshot){
    renderSummary(snapshot);renderTechnical(snapshot);renderFinancialAndMovers(snapshot);
    const news=snapshot.news,newsPanel=$('researchNewsPanel');newsPanel.hidden=!snapshot.modules.news;
    if(snapshot.modules.news){
      $('researchNewsStatus').textContent=news.status==='available'?`${news.articles.length} artículo(s) consultados para ${snapshot.underlyings.map(x=>x.symbol).join(', ')} · Captura ${new Date(news.capturedAt).toLocaleString('es-MX')}.`:`No se pudieron consultar noticias de Alpaca: ${news.error||'error no especificado'}.`;
      const articleUrl=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}};
      $('researchNews').innerHTML=news.status==='available'&&news.articles.length?news.articles.slice(0,20).map(item=>{const url=articleUrl(item.url),date=item.created_at||item.updated_at,source=item.source||item.author||'Fuente no indicada';return `<article class="research-news-item"><strong>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(item.headline||'Artículo sin titular')}</a>`:esc(item.headline||'Artículo sin titular')}</strong><div class="research-news-meta">${esc(source)} · ${esc(date?new Date(date).toLocaleString('es-MX'):'Fecha no indicada')} · ${(item.symbols||[]).map(esc).join(', ')}</div>${item.summary?`<p class="research-news-summary">${esc(item.summary)}</p>`:''}</article>`;}).join(''):'<p class="research-panel-description">No hay artículos disponibles para los tickers y periodo consultados.</p>';
    }
    const minP=Number($('researchMinProb').value)/100,minRR=Number($('researchMinRR').value),maxSpread=Number($('researchMaxSpread').value),trendFilter=snapshot.modules.technical?$('researchTrendFilter').value:'all';
    const rows=snapshot.candidates.filter(c=>(minP===0||Number.isFinite(c.probability.probability)&&c.probability.probability>=minP)&&c.riskReward>=minRR&&c.liquidityScore<=maxSpread&&(trendFilter==='all'||c.technicalTrend===c.side)).slice(0,100);
    $('researchCandidates').innerHTML=rows.map((c,i)=>{const bsLabel=!snapshot.modules.blackScholes?'No incluido':c.blackScholes?.probability===null?(c.blackScholes?.reason==='insufficient_realized_volatility'?'Sin vol. histórica':'Sin datos'):pct(c.blackScholes.probability),bsTitle=c.blackScholes?.assumptions?`Vol. realizada ${(c.blackScholes.assumptions.volatility*100).toFixed(1)}% · ${c.blackScholes.assumptions.volatilitySampleBars} velas · r ${(c.blackScholes.assumptions.rate*100).toFixed(2)}%`:`${c.blackScholes?.reason||''}`,scoreTitle=snapshot.modules.financial&&c.fundamentalScore!==null?`Score base ${c.baseScore?.toFixed(3)} × factor fundamental ${c.fundamentalFactor.toFixed(2)}. No modifica probabilidades.`:'Score orientativo de estrategia';return `<tr><td>${i+1}</td><td>${esc(c.symbol)}</td><td>${esc(c.strategy.replace('_SPREAD','').replaceAll('_',' '))}</td><td>${esc(c.technicalTrend||'No incluido')}</td><td>${c.longStrike} / ${c.shortStrike}</td><td>${money(c.maxProfit)}</td><td>${money(c.maxLoss)}</td><td>${money(c.breakEven)}</td><td>${pct(c.probability.probability)}</td><td title="${esc(bsTitle)}">${esc(bsLabel)}</td><td>${c.probability.interval?`${pct(c.probability.interval.lower)}–${pct(c.probability.interval.upper)}`:'—'}</td><td>${c.probability.sampleSize}</td><td title="${esc(scoreTitle)}">${Number.isFinite(c.score)?c.score.toFixed(3):'—'}</td><td>${esc(new Date(c.longQuoteTimestamp).toLocaleString('es-MX'))}<br>${esc(new Date(c.shortQuoteTimestamp).toLocaleString('es-MX'))}</td></tr>`;}).join('')||'<tr><td colspan="14">No hay candidatas que cumplan los filtros seleccionados.</td></tr>';
    $('researchEvidence').hidden=false;
    snapshot.filters={minProbability:minP,minRiskReward:minRR,maxRelativeBidAsk:maxSpread,technicalAlignment:trendFilter};
  }
  async function runAnalysis(){
    if(running)return;const expiration=$('expiration').value.trim(),modules=readModules();
    const symbols=[...new Set($('researchSymbols').value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean))];
    if(!Object.values(modules).some(Boolean))return setStatus('Selecciona al menos un módulo para incluir en el análisis.','error');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(expiration)||Date.parse(expiration+'T00:00:00Z')<=Date.now())return setStatus('Ingresa un vencimiento futuro válido en Estrategia.','error');
    if(!symbols.length||symbols.length>3||symbols.some(s=>!/^[A-Z0-9.-]{1,12}$/.test(s)))return setStatus('Ingresa de 1 a 3 tickers válidos, separados por comas.','error');
    const btn=$('btnResearchAnalyze');running=true;btn.disabled=true;btn.textContent='Consultando mercado…';$('researchEvidence').hidden=true;
    try{
      const rate=Number($('bsRate').value),dividend=Number($('bsDividend').value),riskFreeRate=Number.isFinite(rate)?rate:.05,dividendYield=Number.isFinite(dividend)?dividend:0;
      const underlyings=[],failures=[];
      for(const symbol of symbols){setStatus(`Consultando velas y cadena de opciones de ${symbol}…`,'loading');try{underlyings.push(await analyzeSymbol(symbol,expiration,modules,riskFreeRate,dividendYield));}catch(error){failures.push(`${symbol}: ${error.message}`);}}
      if(!underlyings.length)throw new Error(failures.join(' · ')||'No se obtuvieron datos de mercado.');
      let news={status:'not-selected',provider:'Alpaca',capturedAt:null,articles:[]};
      if(modules.news)try{news=await fetchNews(underlyings.map(x=>x.symbol));}catch(error){news={status:'unavailable',provider:'Alpaca',capturedAt:new Date().toISOString(),articles:[],error:error.message};}
      let fundamentals=null;
      if(modules.financial)try{fundamentals=await json('/api/research/fundamentals?symbols='+encodeURIComponent(underlyings.map(x=>x.symbol).join(',')));}catch(error){fundamentals={status:'unavailable',provider:'Financial Modeling Prep',capturedAt:new Date().toISOString(),error:error.message,rows:[]};}
      if(fundamentals?.rows)fundamentals.rows=fundamentals.rows.map(row=>row.status==='available'?{...row,fundamentalScore:ResearchAnalysis.scoreFundamentals(row.metrics)}:row);
      const fundamentalBySymbol=new Map((fundamentals?.rows||[]).map(row=>[row.symbol,row.fundamentalScore]));
      const candidates=underlyings.flatMap(x=>x.candidates).map(candidate=>{const fundamentalScore=modules.financial?fundamentalBySymbol.get(candidate.symbol):null,factor=fundamentalScore?.status==='available'?fundamentalScore.factor:1;return {...candidate,baseScore:candidate.score,fundamentalScore:fundamentalScore?.status==='available'?fundamentalScore.score:null,fundamentalFactor:factor,score:candidate.score===null?null:candidate.score*factor};}).sort((a,b)=>(b.score??-1)-(a.score??-1));
      const changes=underlyings.filter(x=>Number.isFinite(x.dailyChangePct)).map(x=>({symbol:x.symbol,changePct:x.dailyChangePct}));
      const movers=modules.movers?{status:changes.length?'available':'unavailable',provider:'Alpaca daily bars',capturedAt:new Date().toISOString(),gainers:changes.filter(x=>x.changePct>=0).sort((a,b)=>b.changePct-a.changePct),losers:changes.filter(x=>x.changePct<0).sort((a,b)=>a.changePct-b.changePct)}:null;
      currentSnapshot={generatedAt:new Date().toISOString(),provider:'Alpaca',expirationDate:expiration,modules,marketData:{capturedAt:new Date().toISOString(),stocksFeed:underlyings.map(x=>({symbol:x.symbol,feed:x.stockFeed})),spotMethod:'midpoint quote, latest trade fallback, then last daily close',candidateRules:'valid bid/ask with timestamp no older than 72h; strikes within 30% of spot; same expiration; vertical width and premium checked'},underlyings,candidates,news,fundamentals,movers,estimation:{historical:{method:'historical-overlapping-returns',confidenceLevel:.95,minSampleSize:20,disclaimer:'Historical frequency is not a calibrated forecast. Rolling windows overlap and the Wilson interval may understate uncertainty.'},blackScholes:{method:'black-scholes-risk-neutral',volatilitySource:'annualized-realized-historical-proxy-not-option-implied',rate:riskFreeRate,dividendYield,disclaimer:'Risk-neutral model estimate; not a calibrated real-world forecast.'}},filters:{},decision:''};
      render(currentSnapshot);modulesDirty=false;setStatus(`Análisis listo: ${underlyings.length}/${symbols.length} tickers; ${candidates.length} spreads válidos.${failures.length?' Sin datos: '+failures.join(' · '):''} Las probabilidades son estimaciones separadas, no calibradas.`,'info');
    }catch(error){setStatus(error.message,'error');}
    finally{running=false;btn.disabled=false;btn.textContent='Analizar y comparar los cuatro spreads';}
  }
  async function ensureSession(){
    if(accessToken)return accessToken;
    const email=$('saveEmail').value.trim(),password=$('savePassword').value;
    if(!email||!password)throw new Error('Ingresa el correo y contraseña de tu cuenta de la aplicación en la sección Estrategia.');
    const data=await json('/api/supabase/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    $('savePassword').value='';if(!data.accessToken)throw new Error('Supabase no devolvió una sesión.');accessToken=data.accessToken;return accessToken;
  }
  async function saveJournal(){
    if(!currentSnapshot)return setStatus('Primero genera un análisis.','error');
    if(modulesDirty)return setStatus('La selección de módulos cambió. Vuelve a analizar antes de guardar.','error');
    try{
      currentSnapshot.decision=$('researchDecision').value.trim();const token=await ensureSession();
      const data=await json('/api/v1/research-journal',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({underlyingTicker:currentSnapshot.underlyings[0].symbol,expirationDate:currentSnapshot.expirationDate,snapshot:currentSnapshot})});
      setStatus('Análisis guardado en la bitácora de Supabase. ID '+data.id,'info');$('savePassword').value='';
    }catch(error){if(/Sesión|autentic|token/i.test(error.message))accessToken=null;setStatus(error.message,'error');}
  }
  async function loadJournal(){
    const host=$('researchHistory');host.textContent='Cargando bitácora…';
    try{const token=await ensureSession(),data=await json('/api/v1/research-journal?limit=30',{headers:{Authorization:'Bearer '+token}});
      host.innerHTML=(data.data||[]).map(x=>`<div style="padding:.35rem 0;border-bottom:1px solid var(--border)"><strong>${esc(x.underlying_ticker)}</strong> · ${esc(x.expiration_date)} · ${esc(new Date(x.created_at).toLocaleString('es-MX'))} · ${esc(String(x.snapshot?.candidates?.length??0))} spreads considerados</div>`).join('')||'La bitácora aún no tiene análisis.';
    }catch(error){host.textContent=error.message;}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $('btnResearchAnalyze').addEventListener('click',runAnalysis);$('btnResearchSave').addEventListener('click',saveJournal);$('btnResearchHistory').addEventListener('click',loadJournal);
    for(const id of ['researchMinProb','researchMinRR','researchMaxSpread','researchTrendFilter'])$(id).addEventListener('change',()=>{if(currentSnapshot)render(currentSnapshot);});
    for(const id of ['researchModuleTechnical','researchModuleBlackScholes','researchModuleFinancial','researchModuleMovers','researchModuleNews'])$(id).addEventListener('change',()=>{if(currentSnapshot){modulesDirty=true;$('researchEvidence').hidden=true;setStatus('Cambiaste los módulos seleccionados. Vuelve a analizar para recalcular evidencias.','info');}});
    $('chSymbol').addEventListener('change',()=>{if($('researchSymbols').value.trim()==='AAPL')$('researchSymbols').value=$('chSymbol').value;});
  });
})();
