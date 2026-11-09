(function(){
  let currentSnapshot=null, accessToken=null, running=false;
  const $=id=>document.getElementById(id), esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>Number.isFinite(value)?'$'+value.toFixed(2):'—';
  const pct=value=>Number.isFinite(value)?(value*100).toFixed(1)+'%':'Insuficientes';
  const setStatus=(text,state='')=>{$('researchStatus').textContent=text;$('researchStatus').dataset.state=state;};
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
  async function analyzeSymbol(symbol,expiration){
    const end=new Date(),start=new Date(end);start.setUTCDate(start.getUTCDate()-370);
    const params=new URLSearchParams({symbol,timeframe:'1Day',start:start.toISOString(),end:end.toISOString(),limit:'1000',sort:'asc'});
    const [barsData,quote,calls,puts]=await Promise.all([
      json('/api/v1/broker/candles?'+params),json('/api/v1/broker/quotes?symbol='+encodeURIComponent(symbol)),allContracts(symbol,expiration,'call'),allContracts(symbol,expiration,'put')
    ]);
    const bars=barsData.bars||[],last=bars.at(-1),spot=Number.isFinite(quote.referencePrice)&&quote.referencePrice>0?quote.referencePrice:last?.close;
    if(!Number.isFinite(spot)||spot<=0)throw new Error('No hay precio de referencia válido.');
    const contracts=[...calls,...puts];
    return {symbol,spot,spotSource:quote.referenceSource||'último cierre de vela',spotTimestamp:quote.referenceTimestamp||last?.timestamp||null,capturedAt:barsData.capturedAt,stockFeed:barsData.feed||'iex',technical:ResearchAnalysis.technicalIndicators(bars),candidates:ResearchAnalysis.compareStrategies(contracts,{symbol,expiration,spot,bars})};
  }
  async function fetchNews(symbols){
    const end=new Date(),start=new Date(end);start.setUTCDate(start.getUTCDate()-7);
    const params=new URLSearchParams({symbols:symbols.join(','),start:start.toISOString(),end:end.toISOString(),sort:'desc',limit:'50'});
    const result=await json('/api/v1/broker/news?'+params);
    return {status:'available',provider:'Alpaca',capturedAt:result.capturedAt,articles:result.articles||[]};
  }
  function render(snapshot){
    const metrics=[];
    for(const item of snapshot.underlyings){
      const t=item.technical;
      const stat=(label,value)=>`<div><span class="research-stat-label">${label}</span><span class="research-stat-value">${value}</span></div>`;
      metrics.push(`<article class="research-ticker-card"><div class="research-ticker-title"><strong>${esc(item.symbol)}</strong><span class="research-trend trend-${esc(t.trend)}">${esc(t.trend)}</span></div><div class="research-stat-grid">${stat('Precio ref.',money(item.spot))}${stat('RSI 14',Number.isFinite(t.rsi14)?t.rsi14.toFixed(1):'Insuficientes')}${stat('SMA 20',money(t.sma20))}${stat('SMA 50',money(t.sma50))}${stat('ATR 14',money(t.atr14))}${stat('Vol. anualizada',Number.isFinite(t.annualizedVolatility)?t.annualizedVolatility.toFixed(1)+'%':'Insuficiente')}</div><p class="research-news-meta">${t.sampleBars} velas · Feed ${esc(item.stockFeed)} · Fin ${esc(t.end?new Date(t.end).toLocaleDateString('es-MX'):'sin fecha')}</p></article>`);
    }
    $('researchMetrics').innerHTML=metrics.join('');
    const news=snapshot.news;
    $('researchNewsStatus').textContent=news.status==='available'?`${news.articles.length} artículo(s) consultados para ${snapshot.underlyings.map(x=>x.symbol).join(', ')} · Captura ${new Date(news.capturedAt).toLocaleString('es-MX')}.`:`No se pudieron consultar noticias de Alpaca: ${news.error||'error no especificado'}.`;
    const articleUrl=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}};
    $('researchNews').innerHTML=news.status==='available'&&news.articles.length?news.articles.slice(0,20).map(item=>{const url=articleUrl(item.url),date=item.created_at||item.updated_at,source=item.source||item.author||'Fuente no indicada';return `<article class="research-news-item"><strong>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(item.headline||'Artículo sin titular')}</a>`:esc(item.headline||'Artículo sin titular')}</strong><div class="research-news-meta">${esc(source)} · ${esc(date?new Date(date).toLocaleString('es-MX'):'Fecha no indicada')} · ${(item.symbols||[]).map(esc).join(', ')}</div>${item.summary?`<p class="research-news-summary">${esc(item.summary)}</p>`:''}</article>`;}).join(''):'<p class="research-panel-description">No hay artículos disponibles para los tickers y periodo consultados.</p>';
    const minP=Number($('researchMinProb').value)/100,minRR=Number($('researchMinRR').value),maxSpread=Number($('researchMaxSpread').value),trendFilter=$('researchTrendFilter').value;
    const rows=snapshot.candidates.filter(c=>(minP===0||Number.isFinite(c.probability.probability)&&c.probability.probability>=minP)&&c.riskReward>=minRR&&c.liquidityScore<=maxSpread&&(trendFilter==='all'||c.technicalTrend===c.side)).slice(0,100);
    $('researchCandidates').innerHTML=rows.map((c,i)=>`<tr><td>${i+1}</td><td>${esc(c.symbol)}</td><td>${esc(c.strategy.replace('_SPREAD','').replaceAll('_',' '))}</td><td>${esc(c.technicalTrend)}</td><td>${c.longStrike} / ${c.shortStrike}</td><td>${money(c.maxProfit)}</td><td>${money(c.maxLoss)}</td><td>${money(c.breakEven)}</td><td>${pct(c.probability.probability)}</td><td>${c.probability.interval?`${pct(c.probability.interval.lower)}–${pct(c.probability.interval.upper)}`:'—'}</td><td>${c.probability.sampleSize}</td><td>${Number.isFinite(c.score)?c.score.toFixed(3):'—'}</td><td>${esc(new Date(c.longQuoteTimestamp).toLocaleString('es-MX'))}<br>${esc(new Date(c.shortQuoteTimestamp).toLocaleString('es-MX'))}</td></tr>`).join('')||'<tr><td colspan="13">No hay candidatas que cumplan los filtros seleccionados.</td></tr>';
    $('researchEvidence').hidden=false;
    snapshot.filters={minProbability:minP,minRiskReward:minRR,maxRelativeBidAsk:maxSpread,technicalAlignment:trendFilter};
  }
  async function runAnalysis(){
    if(running)return;const expiration=$('expiration').value.trim();
    const symbols=[...new Set($('researchSymbols').value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean))];
    if(!/^\d{4}-\d{2}-\d{2}$/.test(expiration)||Date.parse(expiration+'T00:00:00Z')<=Date.now())return setStatus('Ingresa un vencimiento futuro válido en Estrategia.','error');
    if(!symbols.length||symbols.length>3||symbols.some(s=>!/^[A-Z0-9.-]{1,12}$/.test(s)))return setStatus('Ingresa de 1 a 3 tickers válidos, separados por comas.','error');
    const btn=$('btnResearchAnalyze');running=true;btn.disabled=true;btn.textContent='Consultando mercado…';$('researchEvidence').hidden=true;
    try{
      const underlyings=[],failures=[];
      for(const symbol of symbols){setStatus(`Consultando velas y cadena de opciones de ${symbol}…`,'loading');try{underlyings.push(await analyzeSymbol(symbol,expiration));}catch(error){failures.push(`${symbol}: ${error.message}`);}}
      if(!underlyings.length)throw new Error(failures.join(' · ')||'No se obtuvieron datos de mercado.');
      let news;try{news=await fetchNews(underlyings.map(x=>x.symbol));}catch(error){news={status:'unavailable',provider:'Alpaca',capturedAt:new Date().toISOString(),articles:[],error:error.message};}
      const candidates=underlyings.flatMap(x=>x.candidates).sort((a,b)=>(b.score??-1)-(a.score??-1));
      currentSnapshot={generatedAt:new Date().toISOString(),provider:'Alpaca',expirationDate:expiration,marketData:{capturedAt:new Date().toISOString(),stocksFeed:underlyings.map(x=>({symbol:x.symbol,feed:x.stockFeed})),spotMethod:'midpoint quote, latest trade fallback, then last daily close',candidateRules:'valid bid/ask with timestamp no older than 72h; strikes within 30% of spot; same expiration; vertical width and premium checked'},underlyings,candidates,news,estimation:{method:'historical-overlapping-returns',confidenceLevel:.95,minSampleSize:20,disclaimer:'Historical frequency is not a calibrated forecast. The Wilson interval is approximate because rolling return windows overlap; it may understate uncertainty. Estimates exclude fees, early exercise, volatility changes, and execution slippage.'},filters:{},decision:''};
      render(currentSnapshot);setStatus(`Análisis listo: ${underlyings.length}/${symbols.length} tickers; ${candidates.length} spreads válidos.${failures.length?' Sin datos: '+failures.join(' · '):''} Probabilidades históricas no calibradas.`,'info');
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
    $('chSymbol').addEventListener('change',()=>{if($('researchSymbols').value.trim()==='AAPL')$('researchSymbols').value=$('chSymbol').value;});
  });
})();
