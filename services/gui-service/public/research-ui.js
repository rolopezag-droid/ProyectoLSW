(function(){
  let currentSnapshot=null,accessToken=null,running=false,modulesDirty=false;
  let researchVersion=0,selectionVersion=0,comparisonVersion=0;
  const evaluationCache=new WeakMap();
  let analysisController=null;
  // Caché runtime de velas diarias por ticker para señales/prefill. Vive FUERA del
  // snapshot persistido: la bitácora de Supabase no se engorda con las velas.
  window.__researchMarketCache = window.__researchMarketCache || {};
  // Métrica por candidata derivada del método del Quant Workbench. Solo vista:
  // nunca se persiste en el snapshot de Supabase.
  window.__workbenchTableMetrics = window.__workbenchTableMetrics || null;
  let selectedCandidateIndex = null;
  let showAllRankedCompanies=false;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>Number.isFinite(value)?'$'+value.toFixed(2):'—';
  const moneyCompact=value=>Number.isFinite(value)?new Intl.NumberFormat('es-MX',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(value):'—';
  const pct=value=>Number.isFinite(value)?(value*100).toFixed(1)+'%':'Insuficientes';
  const percentPoints=value=>Number.isFinite(value)?(value>0?'+':'')+value.toFixed(2)+'%':'—';
  const yearsToExpiration=expiration=>{const ms=Date.parse(expiration+'T00:00:00Z')-Date.now();return Number.isFinite(ms)&&ms>0?ms/31536000000:null;};
  const fmtWorkbenchMetric=(method,value)=>method==='prices'?money(value):method==='greeks'?value.toFixed(3):method==='iv'?(value*100).toFixed(1)+'%':String(value);
  const setStatus=(text,state='')=>{$('researchStatus').textContent=text;$('researchStatus').dataset.state=state;};
  const readModules=()=>({technical:$('researchModuleTechnical').checked,indicators:$('researchModuleIndicators').checked,ai:$('researchModuleAi').checked,blackScholes:false,monteCarlo:$('researchModuleMonteCarlo').checked,financial:$('researchModuleFinancial').checked,statements:$('researchModuleStatements').checked,movers:$('researchModuleMovers').checked,news:$('researchModuleNews').checked});
  async function json(url,options={}){
    const response=await fetch(url,{...options,signal:analysisController?AbortSignal.any([analysisController.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)}),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.detail?`${data.message||'Error del servidor.'} Detalle: ${data.detail}`:data.message||`Error del servidor (${response.status}).`);
    return data;
  }
  async function allContracts(symbol,expiration,type){
    return window.selectVertical.collectOptionChain(async pageToken=>{
      const params=new URLSearchParams({symbol,expiration,type,limit:'200'});if(pageToken)params.set('pageToken',pageToken);
      return json('/api/v1/broker/options-chain?'+params);
    });
  }
  async function analyzeSymbol(symbol,expiration,modules,riskFreeRate,dividendYield,version){
    const computationSignal=analysisController?.signal;
    const end=new Date(),start=new Date(end);start.setUTCDate(start.getUTCDate()-370);
    const params=new URLSearchParams({symbol,timeframe:'1Day',start:start.toISOString(),end:end.toISOString(),limit:'1000',sort:'asc'});
    const [barsData,quote,calls,puts]=await Promise.all([
      (modules.technical||modules.indicators||modules.monteCarlo||modules.movers?json('/api/v1/broker/candles?'+params):Promise.resolve({bars:[],complete:true})),json('/api/v1/broker/quotes?symbol='+encodeURIComponent(symbol)).catch(()=>({})),allContracts(symbol,expiration,'call'),allContracts(symbol,expiration,'put')
    ]);
    if(version!==researchVersion||computationSignal?.aborted)throw new DOMException('Análisis cancelado','AbortError');
    if (!Array.isArray(barsData.bars)) throw new Error('La respuesta de velas está incompleta.');
    if (barsData.complete === false) throw new Error('La consulta de velas quedó incompleta: ' + (barsData.partialReason || 'cobertura desconocida') + '.');
    const bars=barsData.bars||[],last=bars.at(-1),usesQuote=Number.isFinite(quote.referencePrice)&&quote.referencePrice>0,spot=usesQuote?quote.referencePrice:last?.close;
    if(!Number.isFinite(spot)||spot<=0)throw new Error('No hay precio de referencia válido.');
    const technical=modules.technical?ResearchAnalysis.technicalIndicators(bars):null;
    const levels=null; // Las resistencias no forman parte de esta comparación.

    const contracts=[...calls,...puts];
    const previous=bars.at(-2);
    const changePct=last&&previous&&Number.isFinite(last.close)&&Number.isFinite(previous.close)&&previous.close!==0?(last.close/previous.close-1)*100:null;
    if(version===researchVersion)window.__researchMarketCache[symbol]={bars,fetchedAt:new Date().toISOString(),realizedVolatility:technical?.annualizedVolatility??null,spot,expiration};
    const spotSource=usesQuote?(quote.referenceSource||'referencia de cotización sin método'):'último cierre de vela',spotTimestamp=usesQuote?(quote.referenceTimestamp||null):(last?.timestamp||null),spotSymbol=usesQuote?(quote.symbol||null):symbol;
    const underlying={symbol:spotSymbol,price:spot,source:spotSource,timestamp:spotTimestamp};
    if(version===researchVersion)setStatus('Calculando '+symbol+' en segundo plano. Puedes seguir usando la página o cancelar el análisis.','loading');
    const computed=await window.ResearchComputation.run({contracts,context:{symbol,expiration,spot,bars,includeTechnical:modules.technical,includeBlackScholes:false,includeMonteCarlo:modules.monteCarlo,riskFreeRate,dividendYield},indicators:modules.indicators},{signal:computationSignal});
    const indicatorEvidence=computed.indicatorEvidence;
    const candidates=computed.candidates.map(candidate=>({...window.StrategyExplanation.attachEvidence(candidate,contracts,underlying),...(modules.indicators?{indicatorEvidence}: {})}));
    return {symbol,spot,spotSource,spotTimestamp,spotSymbol,capturedAt:barsData.capturedAt,stockFeed:barsData.feed||'iex',dailyChangePct:changePct,dailyClose:last?.close??null,previousClose:previous?.close??null,dailyTimestamp:last?.timestamp??null,technical,indicatorEvidence,supportResistance:levels,candidates};
  }
  async function fetchNews(symbols){
    const end=new Date(),start=new Date(end);start.setUTCDate(start.getUTCDate()-7);
    const params=new URLSearchParams({symbols:symbols.join(','),start:start.toISOString(),end:end.toISOString(),sort:'desc',limit:'50'});
    const result=await json('/api/v1/broker/news?'+params);
    return {status:'available',provider:'Alpaca',capturedAt:result.capturedAt,articles:result.articles||[]};
  }
  async function scanSp500(){
    const universe=await json('/api/research/universe/sp500');
    const symbols=(universe.constituents||[]).map(item=>item.symbol);
    for(const item of universe.constituents||[]){if(![...$('tickerCatalog').options].some(option=>option.value===item.symbol)){const option=document.createElement('option');option.value=item.symbol;option.label=item.name||item.symbol;$('tickerCatalog').append(option);}}
    if(symbols.length<400)throw new Error('El proveedor no entregó una lista completa del S&P 500.');
    const snapshots=readModules().movers?await json('/api/v1/broker/market-snapshots?symbols='+encodeURIComponent(symbols.join(','))).catch(()=>({snapshots:{}})):{snapshots:{}};
    const changes=symbols.map(symbol=>{
      const snap=snapshots.snapshots?.[symbol],close=Number(snap?.dailyBar?.c),previous=Number(snap?.prevDailyBar?.c);
      return Number.isFinite(close)&&close>0&&Number.isFinite(previous)&&previous>0?{symbol,changePct:(close/previous-1)*100,latestClose:close,previousClose:previous,timestamp:snap.dailyBar.t}:null;
    }).filter(Boolean);
    // Los snapshots solo nutren Movimiento diario; su ausencia no elimina empresas del universo de opciones.
    return {symbols,changes,universeCount:symbols.length,coveredCount:changes.length,capturedAt:snapshots.capturedAt||universe.capturedAt,provider:universe.provider,sourceUrl:universe.sourceUrl};
  }

  const assessNews=item=>window.NewsContext.assess(item);
  function sentimentOf(item){
    if(['bullish','bearish','mixed','neutral','unknown'].includes(item.sentiment?.label))return item.sentiment;
    const fallback=assessNews(item),labels={'Posible sesgo alcista':'bullish','Posible sesgo bajista':'bearish','Señales mixtas':'mixed','Sin dirección clara':'neutral'};
    return {label:labels[fallback.label]||'unknown',confidence:'low',signals:{bullish:fallback.matched.favorable,bearish:fallback.matched.adverse},explanation:fallback.label+'. '+fallback.explanation};
  }
  function renderFinancialAndMovers(snapshot){
    const modules=snapshot.modules,fundamentals=snapshot.fundamentals;
    $('researchFinancialPanel').hidden=!modules.financial;
    const scopeNote=snapshot.fundamentalScope?' Consulta limitada a las diez finalistas elegidas con los otros cores; estos fundamentales son complementarios y no modifican el Top.':'';
    if(modules.financial){
      const status=$('researchFinancialStatus'),host=$('researchFinancialRows');
      if(!fundamentals){status.textContent='Se consultan métricas fundamentales en FMP cuando FMP_API_KEY está configurada en el servidor.';host.innerHTML='';}
      else if(fundamentals.status!=='available'){status.textContent=(fundamentals.error||'FMP no devolvió fundamentales para estos tickers.')+scopeNote;host.innerHTML=fundamentals.rows.map(row=>`<article class="research-financial-row"><strong>${esc(row.symbol)}</strong> · ${esc(row.error||'Sin datos para mostrar.')}</article>`).join('');}
      else {status.textContent=`Fuente: ${fundamentals.provider} · Consulta ${new Date(fundamentals.capturedAt).toLocaleString('es-MX')}.${scopeNote} ${snapshot.fundamentalScope?'No participa en la puntuación del universo.':'El core fundamental participa solo si está seleccionado; no modifica probabilidades.'}`;host.innerHTML=fundamentals.rows.map(row=>{if(row.status!=='available')return `<article class="research-financial-row"><strong>${esc(row.symbol)}</strong> · ${esc(row.error||'Sin datos para mostrar.')}</article>`;const m=row.metrics||{},fundamentalScore=row.fundamentalScore,scoreBlock=fundamentalScore?.status==='available'?`<p><strong>Score fundamental: ${fundamentalScore.score.toFixed(1)}/100</strong> · Más alto significa que los datos disponibles se acercan más a los rangos favorecidos por la heurística. Cobertura ${fundamentalScore.coverage}%.</p><details><summary>¿Qué significa este score?</summary><p>Promedio ponderado de crecimiento, rentabilidad, deuda, liquidez y valoración. Cada componente se transforma a 0–100 dentro de rangos generales. La cobertura del score indica qué parte de los pesos de sus ocho indicadores tuvo datos; es distinta del número de métricas mostradas. Capitalización y FCF son contexto y no puntúan. No compara con el sector y no predice el precio.</p><p>${fundamentalScore.components.map(component=>`${esc(component.label)} (${component.weight}% del score): ${component.score===null?'sin dato':component.score.toFixed(0)+'/100'}`).join(' · ')}</p><p>Umbrales usados: crecimiento −20% a +20%; ROE −10% a +30%; margen neto −20% a +20%; deuda/capital 0 a 3 (menor deuda suma más); razón corriente 0.5 a 2; P/E 5 a 40 (menor múltiplo suma más dentro del rango); P/B 1 a 10 (menor múltiplo suma más dentro del rango). Fuera del rango se limita a 0 o 100. Cobertura menor al 50% no produce score.</p></details>`: `<p><strong>Score fundamental no disponible</strong> · Cobertura ${fundamentalScore?.coverage??0}% (mínimo 50%).</p>`,defs=[['Capitalización',m.marketCap===null?'—':moneyCompact(m.marketCap),'Tamaño de mercado de la empresa.'],['P/E',m.pe===null?'—':m.pe.toFixed(2),'Precio frente a ganancias; alto puede significar caro o expectativas de crecimiento.'],['P/B',m.pb===null?'—':m.pb.toFixed(2),'Precio frente al valor contable por acción.'],['ROE',m.roe===null?'—':percentPoints(m.roe*100),'Ganancia generada por cada peso de capital; normalmente más alto es mejor.'],['Margen neto',m.netMargin===null?'—':percentPoints(m.netMargin*100),'Parte de los ingresos que queda como utilidad; normalmente más alto es mejor.'],['Deuda/capital',m.debtEquity===null?'—':m.debtEquity.toFixed(2),'Deuda respecto al capital; valores altos suelen implicar más apalancamiento.'],['Razón corriente',m.currentRatio===null?'—':m.currentRatio.toFixed(2),'Activos disponibles para cubrir obligaciones de corto plazo.'],['Crec. ingresos anual',m.revenueGrowth===null?'—':percentPoints(m.revenueGrowth),'Cambio de ventas frente al año previo.'],['Crec. utilidad anual',m.netIncomeGrowth===null?'—':percentPoints(m.netIncomeGrowth),'Cambio de ganancias frente al año previo.'],['FCF por acción',m.freeCashFlowPerShare===null?'—':money(m.freeCashFlowPerShare),'Efectivo libre generado, dividido entre acciones.']];return `<article class="research-financial-row"><strong>${esc(row.companyName||row.symbol)} (${esc(row.symbol)})</strong>${row.coverage?' · Cobertura '+esc(row.coverage):''}${row.warnings?.length?'<p>'+esc(row.warnings.join(' '))+'</p>':''}${row.dataCapturedAt?' · Obtenidos '+esc(new Date(row.dataCapturedAt).toLocaleString('es-MX')):''}${row.period?' · '+esc(row.period):''}${row.dataDate?' · Datos al '+esc(row.dataDate):''}${scoreBlock}<details><summary>Ver métricas e interpretación</summary>${defs.filter(([,v])=>v!=='—').map(([n,v,meaning])=>`<p><strong>${esc(n)}: ${esc(v)}</strong> · ${esc(meaning)}</p>`).join('')||'FMP no devolvió métricas reconocidas para este periodo.'}</details></article>`;}).join('');}
    }
    $('researchStatementsPanel').hidden=!modules.statements;
    if(modules.statements){
      const status=$('researchStatementsStatus'),host=$('researchStatementsRows'),analysis=snapshot.financialStatements;
      status.textContent=analysis?`Fuente: ${analysis.provider} · Estados anuales más recientes disponibles. ${snapshot.financialStatementsScope?'Consulta limitada a las diez finalistas del S&P 500; no modifica el Top.':'Si se seleccionó, el score financiero participa en el promedio de cores.'}`:'Se consultan estados financieros de FMP cuando FMP_API_KEY está configurada.';
      host.innerHTML=(analysis?.rows||[]).map(row=>{if(row.status!=='available')return `<article class="research-financial-row"><strong>${esc(row.symbol)}</strong> · ${esc(row.error||analysis?.error||'Estados financieros no disponibles.')}</article>`;const m=row.metrics||{},s=row.financialScore,items=[['Ventas',moneyCompact(m.revenue)],['Utilidad neta',moneyCompact(m.netIncome)],['Activos corrientes',moneyCompact(m.currentAssets)],['Pasivos corrientes',moneyCompact(m.currentLiabilities)],['Deuda total',moneyCompact(m.totalDebt)],['Capital contable',moneyCompact(m.equity)],['Flujo operativo',moneyCompact(m.operatingCashFlow)],['Flujo libre',moneyCompact(m.freeCashFlow)],['Razón corriente',Number.isFinite(m.currentRatio)?m.currentRatio.toFixed(2):'—'],['Deuda/capital',Number.isFinite(m.debtToEquity)?m.debtToEquity.toFixed(2):'—'],['Cobertura de intereses',Number.isFinite(m.interestCoverage)?m.interestCoverage.toFixed(2)+'×':'—'],['Flujo operativo/utilidad',Number.isFinite(m.cashConversion)?m.cashConversion.toFixed(2)+'×':'—']];return `<article class="research-financial-row"><strong>${esc(row.symbol)}</strong>${row.period?' · '+esc(row.period):''}${row.dataDate?' · Datos al '+esc(row.dataDate):''}<p><strong>Salud financiera: ${s?.status==='available'?s.score.toFixed(1)+'/100':'score no disponible'}</strong> · Cobertura ${s?.coverage??0}%. La calificación resume liquidez, deuda, cobertura de intereses y conversión de utilidad a efectivo.</p><p>${s?.components?.map(c=>`${esc(c.label)}: ${c.score===null?'sin dato':c.score.toFixed(0)+'/100'}`).join(' · ')||''}</p>${row.warnings?.length?`<p>${esc(row.warnings.join(' '))}</p>`:''}<details><summary>Ver estados e indicadores</summary>${items.map(([n,v])=>`<p><strong>${esc(n)}:</strong> ${esc(v)}</p>`).join('')}</details></article>`;}).join('')||`<article class="research-financial-row">${esc(analysis?.error||'Sin datos financieros disponibles.')}</article>`;
    }
    $('researchMoversPanel').hidden=!modules.movers;
    if(modules.movers){
      const status=$('researchMoversStatus'),host=$('researchMovers');
      const movers=snapshot.movers;
      if(!movers||movers.status!=='available'){status.textContent='No hay cambio diario disponible para los tickers elegidos.';host.innerHTML='';}
      else {
        status.textContent=`Cambio porcentual respecto al cierre anterior: el numerador es la variación y el cierre anterior es la base de comparación. Se exploraron ${movers.coveredCount??movers.gainers.length+movers.losers.length} empresas${movers.universeCount?` de ${movers.universeCount} del S&P 500`:''}. Positivo significa avance; negativo, caída. La última vela diaria puede estar en formación durante la sesión. No explica por sí solo la causa ni predice la siguiente sesión. Se muestran hasta 10 por grupo.`;
        const group=(title,rows)=>`<strong>${title}</strong>${rows.length?rows.slice(0,10).map(row=>`<div class="research-mover-row"><strong>${esc(row.symbol)}</strong> · ${percentPoints(row.changePct)}${Number.isFinite(row.previousClose)&&Number.isFinite(row.latestClose)?' · De '+money(row.previousClose)+' a '+money(row.latestClose):''}${row.timestamp?' · Vela '+esc(new Date(row.timestamp).toLocaleDateString('es-MX',{timeZone:'UTC'})):''} <span>${row.changePct>=0?'El último precio diario disponible está arriba del cierre anterior.':'El último precio diario disponible está abajo del cierre anterior.'}</span></div>`).join(''):'<div class="research-mover-row">Sin tickers en este grupo.</div>'}`;
        host.innerHTML=group('Ganadores',movers.gainers)+group('Perdedores',movers.losers);
      }
    }
  }
  function renderIndicators(snapshot){
    const panel=$('researchIndicatorsPanel'),host=$('researchIndicatorsResults');panel.hidden=!snapshot.modules.indicators;
    if(panel.hidden){host.replaceChildren();return;}
    const date=value=>{const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric',timeZone:'UTC'}):'Fecha no disponible';};
    host.innerHTML=snapshot.underlyings.map(item=>{
      const e=item.indicatorEvidence,signals=e?.signals||[],valid=e?.status==='available';
      const up=signals.filter(signal=>signal.side==='bullish').length,down=signals.filter(signal=>signal.side==='bearish').length;
      const label=!valid?'Datos insuficientes':!signals.length?'Sin señales recientes':e.bullScore===e.bearScore?'Señales contrapuestas':e.bullScore>e.bearScore?'Predominan las señales alcistas':'Predominan las señales bajistas';
      const reading=!valid?'No hay suficientes velas diarias cerradas para evaluar este core. No aporta una puntuación válida.':!signals.length?'No se detectaron eventos nuevos de las reglas elegidas en las últimas cinco velas cerradas. Este core no favorece Bull ni Bear.':e.bullScore===e.bearScore?`Hay ${up} señal(es) alcista(s) y ${down} bajista(s). Se compensan: este core no favorece Bull ni Bear.`:e.bullScore>e.bearScore?`Hay ${up} señal(es) alcista(s) y ${down} bajista(s). Este core favorece la dirección de Bull Call y Bull Put; no confirma por sí solo que el precio vaya a subir.`:`Hay ${up} señal(es) alcista(s) y ${down} bajista(s). Este core favorece la dirección de Bear Call y Bear Put; no confirma por sí solo que el precio vaya a bajar.`;
      const eventText=signal=>signal.rule==='rsi_cross'?(signal.side==='bullish'?'El RSI dejó atrás la zona de debilidad. Es una posible señal de recuperación; no confirma una subida.':'El RSI salió de la zona de fuerza elevada. Es una posible señal de pérdida de impulso; no confirma una caída.'):signal.rule==='sma_cross'?(signal.side==='bullish'?'El precio cruzó por encima de su media y otra media confirmó la dirección alcista.':'El precio cruzó por debajo de su media y otra media confirmó la dirección bajista.'):'El precio cerró por debajo de un soporte: una zona donde antes había encontrado apoyo. Es una señal de debilidad.';
      const recent=signals.slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
      const chronological=recent.map((signal,index)=>{
        const sameDay=index>0&&date(signal.timestamp)===date(recent[index-1].timestamp);
        const heading=recent.length===1?'¿Qué ocurrió?':index===0?'¿Qué pasó primero?':sameDay?'¿Qué ocurrió ese mismo día?':'¿Qué pasó después?';
        const meaning=signal.side==='bullish'?'Esta señal acompaña la dirección alcista de Bull Call y Bull Put.':'Esta señal acompaña la dirección bajista de Bear Call y Bear Put.';
        return `<li><h5>${heading}</h5><strong>${esc(date(signal.timestamp))} · ${signal.side==='bullish'?'Señal alcista':'Señal bajista'}</strong><p>${esc(eventText(signal))}</p><p>${meaning}</p></li>`;
      }).join('');
      const interpretation=valid&&e.bullScore===e.bearScore?(signals.length?'Las señales tienen el mismo peso y se compensan. 50/50 significa empate de puntos entre Bull y Bear, no un 50 % de probabilidad de ganar.':'Sin señales nuevas, ambos reciben 50 puntos por neutralidad. No significa un 50 % de probabilidad de ganar.'):'La puntuación representa afinidad con cada dirección, no una probabilidad de ganancia.';
      return `<article class="research-ticker-card indicator-reading"><div class="indicator-reading-heading"><h4>${esc(item.symbol)}: señales encontradas</h4><strong>${esc(label)}</strong></div>${recent.length?'<ol class="indicator-event-list">'+chronological+'</ol>':''}<h5>¿Qué significa para las estrategias?</h5><p class="indicator-conclusion">${esc(reading)}</p>${valid?`<h5>¿Cómo leer la puntuación?</h5><p>${esc(interpretation)}</p>`:''}<p class="research-panel-description">Se revisan las últimas cinco velas diarias cerradas. Última vela disponible: ${esc(date(e?.asOf))}. Estas señales no envían órdenes.</p><details class="research-method"><summary>Ver puntuación y reglas del cálculo</summary><p>Score Bull: ${Number.isFinite(e?.bullScore)?e.bullScore.toFixed(1):'No disponible'} · Score Bear: ${Number.isFinite(e?.bearScore)?e.bearScore.toFixed(1):'No disponible'}</p><p>Son puntos de afinidad con cada dirección, no porcentajes de ganancia. 50/50 significa empate; puede deberse a señales contrapuestas o a ausencia de señales nuevas. Si este core está seleccionado, su puntuación participa en el promedio del ranking.</p><p>Historial: ${e?.sampleBars||0} velas cerradas. ${esc(e?.reason||'Sin datos')} Cada familia presente pesa lo mismo; se usa su evento más reciente. Score Bull = 50 + 50 × media de votos (+1 alcista, −1 bajista). Score Bear = 100 − Score Bull.</p><ul>${recent.map(signal=>`<li>${esc(date(signal.timestamp))}: ${esc(signal.exactRule)}</li>`).join('')}</ul></details></article>`;
    }).join('');
  }
  function renderTechnical(snapshot){
    const selected=snapshot.modules.technical;$('researchTechnicalPanel').hidden=!selected;
    if(!selected){$('researchMetrics').innerHTML='';return;}
    const metrics=[];
    for(const item of snapshot.underlyings){
      const t=item.technical,levels=item.supportResistance;
      const stat=(label,value)=>`<div><span class="research-stat-label">${label}</span><span class="research-stat-value">${value}</span></div>`;
      metrics.push(`<article class="research-ticker-card"><div class="research-ticker-title"><strong>${esc(item.symbol)}</strong><span class="research-trend trend-${esc(t?.trend||'mixed')}">${esc(t?.trend||'sin datos')}</span></div><div class="research-stat-grid">${stat('Precio ref.',money(item.spot))}${stat('RSI 14',Number.isFinite(t?.rsi14)?t.rsi14.toFixed(1):'Insuficientes')}${stat('SMA 20',money(t?.sma20))}${stat('SMA 50',money(t?.sma50))}${stat('ATR 14',money(t?.atr14))}${stat('Vol. anualizada',Number.isFinite(t?.annualizedVolatility)?t.annualizedVolatility.toFixed(1)+'%':'Insuficiente')}</div><p class="research-news-meta">${t?.sampleBars??0} velas · Feed ${esc(item.stockFeed)} · Fin ${esc(t?.end?new Date(t.end).toLocaleDateString('es-MX'):'sin fecha')}</p></article>`);
    }
    $('researchMetrics').innerHTML=metrics.join('');
  }
  function renderMonteCarlo(snapshot){
    const panel=$('researchMonteCarloPanel'),host=$('researchMonteCarloResults');
    panel.hidden=!snapshot.modules.monteCarlo;
    if(panel.hidden){host.innerHTML='';return;}
    const bySymbol=new Map();
    for(const candidate of snapshot.candidates||[]){
      if(!snapshot.underlyings.some(item=>item.symbol===candidate.symbol))continue;
      const rows=bySymbol.get(candidate.symbol)||[];rows.push(candidate);bySymbol.set(candidate.symbol,rows);
    }
    const stat=(label,value)=>`<div><span class="research-stat-label">${label}</span><span class="research-stat-value">${value}</span></div>`;
    host.innerHTML=snapshot.underlyings.map(item=>{
      const candidates=bySymbol.get(item.symbol)||[],available=candidates.filter(candidate=>Number.isFinite(candidate.monteCarlo?.probability)).sort((a,b)=>b.monteCarlo.probability-a.monteCarlo.probability),candidate=available[0],result=candidate?.monteCarlo;
      if(!candidate){const reason=candidates[0]?.monteCarlo?.reason;return `<article class="research-ticker-card"><div class="research-ticker-title"><strong>${esc(item.symbol)}</strong><span class="research-trend trend-mixed">Sin simulación</span></div><p class="research-news-meta">${esc(reason==='insufficient_realized_volatility'?'Volatilidad histórica insuficiente para simular.':reason==='expiration_not_in_future'?'El vencimiento ya pasó.':reason||'No hubo un spread válido para evaluar.')}</p></article>`;}
      const assumptions=result.assumptions||{};
      return `<article class="research-ticker-card"><div class="research-ticker-title"><strong>${esc(item.symbol)}</strong><span class="research-trend trend-mixed">${pct(result.probability)} P&amp;L positivo</span></div><p class="research-news-meta">Mejor frecuencia simulada: ${esc(strategyLabel(candidate.strategy))} · strikes ${esc(candidate.longStrike)} / ${esc(candidate.shortStrike)} · ${result.simulations.toLocaleString('es-MX')} escenarios</p><div class="research-stat-grid">${stat('P&amp;L esperado',money(result.expectedPnl))}${stat('P&amp;L mediano',money(result.medianPnl))}${stat('Percentil 5',money(result.p05))}${stat('Percentil 95',money(result.p95))}${stat('Spot usado',money(assumptions.spot))}${stat('Vol. realizada',pct(assumptions.volatility))}</div><p class="research-news-meta">${assumptions.volatilitySampleBars??0} velas para volatilidad · horizonte ${evidenceNumber(assumptions.timeToMaturityYears)} años · tasa ${pct(assumptions.rate)}</p></article>`;
    }).join('')||'<p class="research-panel-description">No hay tickers con resultados de Monte Carlo.</p>';
  }
  function renderSummary(snapshot){
    const modules=snapshot.modules,selected=[];
    if(modules.ai)selected.push('IA (interpretación manual, sin puntuación)');if(modules.technical)selected.push('Técnico');if(modules.indicators)selected.push('Indicadores y señales');if(modules.monteCarlo)selected.push('Monte Carlo');if(modules.financial)selected.push(snapshot.fundamentalScope?'Fundamentales de las finalistas (complementario)':'Fundamentales');if(modules.statements)selected.push(snapshot.financialStatementsScope?'Financiero de las finalistas (complementario)':'Financiero');if(modules.movers)selected.push('Ganadores/perdedores entre tickers elegidos');if(modules.news)selected.push('Noticias Alpaca');
    $('researchCoreModules').textContent=selected.join(' · ')||'Solo opciones e histórico';
    const items=[...(snapshot.fundamentalScope?['FMP se consultó después de elegir las diez finalistas. El orden utiliza los otros cores seleccionados; el fundamental es contexto complementario y no cambia la puntuación.']:[]),...(snapshot.financialStatementsScope?['Los estados financieros de FMP se consultaron después de elegir las diez finalistas; son contexto y no cambian este Top.']:[]),`Comparé ${snapshot.viewScope?snapshot.viewScope.total+' empresas; mostrando '+snapshot.viewScope.visible+' clasificadas':snapshot.underlyings.map(item=>item.symbol).join(', ')} para vencimiento ${snapshot.expirationDate} con cotizaciones de opciones Alpaca.`,snapshot.screening?`Se intentaron todas las ${snapshot.screening.universeCount} empresas del S&P 500; ${snapshot.screening.evaluatedCount} tuvieron datos para evaluar opciones y ${snapshot.screening.failedCount} fallaron. Se conservó la mejor combinación de cada estrategia por empresa que cumplió los filtros. Fuente del universo: ${snapshot.screening.provider}. El orden corresponde al vencimiento y filtros elegidos, no a todos los vencimientos posibles.`:'El universo comparado proviene de la lista manual ingresada.','El orden usa exclusivamente los cores de puntuación seleccionados; noticias es contexto y no puntúa.'];
    if(modules.technical)for(const item of snapshot.underlyings)items.push(`${item.symbol}: tendencia ${item.technical?.trend||'sin datos'}.`);
    if(modules.monteCarlo)items.push('Monte Carlo simula 10,000 precios al vencimiento con un modelo GBM y volatilidad realizada histórica; muestra probabilidad estimada de P&L positivo y distribución de P&L. Los escenarios son reproducibles y dependen de los supuestos del modelo.');
    if(modules.financial)items.push(snapshot.fundamentals?.status==='available'?snapshot.fundamentals.rows.filter(row=>row.status==='available').map(row=>row.fundamentalScore?.status==='available'?`${row.symbol}: score fundamental ${row.fundamentalScore.score.toFixed(1)}/100; ${snapshot.fundamentalScope?'información complementaria, no altera el Top':'aporta al promedio de cores seleccionados'}.`:`${row.symbol}: score fundamental no disponible por cobertura insuficiente.`).join(' '):snapshot.fundamentals?.error||'No hay fundamentales disponibles desde FMP.');
    if(modules.statements)items.push(snapshot.financialStatements?.status==='available'?snapshot.financialStatements.rows.filter(row=>row.status==='available').map(row=>row.financialScore?.status==='available'?`${row.symbol}: score de salud financiera ${row.financialScore.score.toFixed(1)}/100; ${snapshot.financialStatementsScope?'contexto de finalistas, no altera el Top':'aporta al promedio de cores seleccionados'}.`:`${row.symbol}: score financiero no disponible por cobertura insuficiente.`).join(' '):snapshot.financialStatements?.error||'No hay estados financieros disponibles desde FMP.');
    if(modules.movers)items.push(snapshot.movers?.status==='available'?'Ganadores/perdedores compara el cambio entre el cierre anterior y el cierre diario más reciente. Es una descripción del movimiento, no su causa ni una predicción.':'No hay cambio diario disponible para comparar los tickers elegidos.');
    if(modules.news)items.push('El sentimiento se contrasta con cada estrategia y con la tendencia técnica seleccionada; coincidencias y contradicciones aparecen en la candidata. No altera el score ni las métricas de otros cores.');
    if(modules.news)items.push(snapshot.news.status==='available'?`${snapshot.news.articles.length} noticias recientes consultadas en Alpaca.`:'Noticias Alpaca no disponibles: '+(snapshot.news.error||'sin resultados.'));
    items.push('Puntuación de 0 a 100: promedio de los cores elegidos con datos disponibles. Si falta uno, no se asigna puntuación. No es una probabilidad de rentabilidad.');
    $('researchCoreSummary').innerHTML=`<ul class="research-summary-list">${items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`;
  }
  // Índices originales compartidos por tabla, explicaciones y método cuantitativo.
  function filteredRows(snapshot){
    const minP=Number($('researchMinProb').value)/100,minRR=Number($('researchMinRR').value),maxSpread=Number($('researchMaxSpread').value),trendFilter=snapshot.modules.technical?$('researchTrendFilter').value:'all';
    const mode=$('researchMode').value,company=$('researchCompany').value.trim().toUpperCase(),strategy=$('researchStrategyFilter').value,maxLoss=$('researchMaxLoss').value===''?Infinity:Number($('researchMaxLoss').value);
    const probabilityFor=c=>snapshot.modules.monteCarlo?c.monteCarlo?.probability:snapshot.modules.technical?c.probability?.probability:null;
    const rows=snapshot.candidates.map((candidate,index)=>({candidate,index})).filter(({candidate:c})=>(mode!=='company'||c.symbol===company)&&(strategy==='all'||c.strategy===strategy)&&c.maxLoss<=maxLoss&&(minP===0||Number.isFinite(probabilityFor(c))&&probabilityFor(c)>=minP)&&c.riskReward>=minRR&&c.liquidityScore<=maxSpread&&(trendFilter==='all'||c.technicalTrend===c.side));
    return {rows,filters:{minProbability:minP,minRiskReward:minRR,maxRelativeBidAsk:maxSpread,technicalAlignment:trendFilter,strategy,maxLoss:Number.isFinite(maxLoss)?maxLoss:null}};
  }

  const evidenceNumber=value=>Number.isFinite(value)?String(Number(value.toFixed(6))):'No disponible';
  const scoreNumber=value=>Number.isFinite(value)?String(value):'No disponible';
  const evidenceDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():'No disponible';
  const strategyLabel=value=>String(value||'').replace('_SPREAD','').replaceAll('_',' ');
  function companyName(symbol){
    const option=[...$('tickerCatalog').options].find(item=>item.value===symbol);
    return option?.label||`Nombre no disponible (${symbol})`;
  }
  function evidenceList(items){return `<dl>${items.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;}
  async function evaluateCandidate(candidate){
    const validation=window.StrategyExplanation.validateCandidate(candidate);
    if(!validation.valid)return {status:'invalid',issues:validation.issues,warnings:validation.warnings};
    if(evaluationCache.has(candidate))return evaluationCache.get(candidate);
    const pending=(async()=>{
      try{
        const evaluation=await json('/api/v1/strategies/evaluate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(validation.evaluationRequest)});
        const checked=window.StrategyExplanation.verifyEvaluation(candidate,evaluation);
        return {status:checked.valid?'verified':'discrepancy',issues:checked.issues,warnings:validation.warnings,evaluation};
      }catch(error){return {status:'unavailable',issues:['No se pudo obtener la evaluación de Quant: '+error.message],warnings:validation.warnings};}
    })();
    evaluationCache.set(candidate,pending);
    const result=await pending;
    if(result.status==='unavailable')evaluationCache.delete(candidate);
    return result;
  }
  function candidateWhy(candidate,snapshot,underlying,verified){
    const trend=underlying?.technical?.trend||'No disponible',aligned=candidate.technicalTrend===candidate.side;
    const trendText=!snapshot.modules.technical?'Análisis técnico no seleccionado; no participa en el score.':trend==='insufficient_data'?'No hay suficientes datos para determinar la tendencia o el factor técnico.':trend==='mixed'?'La tendencia es mixta; el factor técnico es neutral.':aligned?'La tendencia calculada está alineada con la dirección de la estrategia.':'La tendencia calculada es contraria a la dirección de la estrategia.';
    const spotTime=evidenceDate(underlying?.spotTimestamp),spotSource=underlying?.spotSource||'No disponible';
    const spotWarning=!underlying?.spotSymbol?'El proveedor no identificó el ticker de la referencia.':underlying.spotSymbol!==candidate.symbol?`La referencia identificó ${underlying.spotSymbol}, distinto del ticker de la candidata.`:'';
    const timeMs=Date.parse(underlying?.spotTimestamp),ageWarning=!Number.isFinite(timeMs)?'La referencia del subyacente no tiene fecha verificable.':Date.now()-timeMs>72*3600000||timeMs>Date.now()+60000?'La referencia del subyacente está desactualizada o tiene una fecha futura.':'';
    const t=underlying?.technical;
    const historical=candidate.probability;
    const mc=candidate.monteCarlo,mcInfo=!snapshot.modules.monteCarlo?'Monte Carlo no seleccionado.':Number.isFinite(mc?.probability)?`Monte Carlo: ${mc.simulations} escenarios al vencimiento; ${pct(mc.probability)} terminaron con P&L positivo. P&L medio ${money(mc.expectedPnl)}, mediano ${money(mc.medianPnl)}, percentil 5 ${money(mc.p05)} y percentil 95 ${money(mc.p95)}. Volatilidad realizada ${pct(mc.assumptions?.volatility)}. Aporta al ranking si se selecciona este core.`:`Monte Carlo no disponible: ${mc?.reason||'faltan datos'}. No se asigna puntuación cuando falta información.`;
    const technicalContext=t?`SMA20 ${evidenceNumber(t.sma20)}, SMA50 ${evidenceNumber(t.sma50)}, RSI14 ${evidenceNumber(t.rsi14)}, ATR14 ${evidenceNumber(t.atr14)}. RSI y ATR son contexto, no factores directos del score.`:'Indicadores técnicos no disponibles o no seleccionados.';
    const fundamental=snapshot.fundamentalScope?'Fundamentales consultados después de elegir las finalistas; son contexto y no participan en este ranking.':snapshot.modules.financial?(Number.isFinite(candidate.fundamentalScore)?`El score fundamental ${evidenceNumber(candidate.fundamentalScore)} aportó ${evidenceNumber(candidate.fundamentalScore)}/100 al promedio de cores.`:'Fundamentales sin cobertura suficiente; la candidata no recibe puntuación.'):'Fundamentales no seleccionados; no participan en el score.';
    const statements=snapshot.financialStatementsScope?'Estados financieros consultados después de elegir las finalistas; son contexto y no participan en este ranking.':snapshot.modules.statements?(Number.isFinite(candidate.financialScore)?`El score de salud financiera ${evidenceNumber(candidate.financialScore)} aportó ${evidenceNumber(candidate.financialScore)}/100 al promedio de cores.`:'Estados financieros sin cobertura suficiente; la candidata no recibe puntuación.'):'Análisis financiero no seleccionado.';
    const news=snapshot.modules.news?`Noticias: ${snapshot.news?.status||'No disponible'}; son contexto y no modifican el score.`:'Noticias no seleccionadas; no modifican el score.';
    const result=verified?.status==='verified'?verified.evaluation:null;
    const pendingValue=verified&&verified.status!=='verified'?'No disponible: candidata no verificada':'Pendiente de verificar';
    const payoff=result?(result.riskRewardRatio<1?'La pérdida máxima supera al beneficio máximo.':result.riskRewardRatio>1?'El beneficio máximo supera a la pérdida máxima.':'Beneficio y pérdida máximos son iguales.'):(verified?'La relación entre beneficio y pérdida no se pudo verificar.':'La relación entre beneficio y pérdida está pendiente de verificación.');
    const history=Number.isFinite(historical?.probability)?(historical.probability<.5?'Menos de la mitad de las ventanas históricas evaluadas alcanzaron el criterio de equilibrio.':'Al menos la mitad de las ventanas históricas evaluadas alcanzaron el criterio de equilibrio.'):'No hay muestra histórica suficiente para evaluar la frecuencia.';
    const outcome=result?`Al vencimiento, la ganancia máxima corresponde a un subyacente ${candidate.side==='bullish'?'igual o superior':'igual o inferior'} al strike corto ${evidenceNumber(candidate.shortStrike)}; un movimiento contrario puede alcanzar la pérdida máxima.`:'Las condiciones de ganancia y pérdida requieren validar primero las patas y los resultados con Quant.';
    return `${evidenceList([['Empresa y ticker',companyName(candidate.symbol)],['Subyacente de referencia',money(underlying?.spot)],['Fuente y fecha',`${spotSource} · ${spotTime}`],['Vencimiento',candidate.expiration],['Estrategia',strategyLabel(candidate.strategy)],['Dirección',candidate.side==='bullish'?'Alcista':'Bajista'],['Contratos',`${candidate.longSymbol||'No disponible'} / ${candidate.shortSymbol||'No disponible'}`],...(snapshot.modules.technical?[['Tendencia',trend]]:[]),['Prima neta total',result?money(result.spreadCategory==='debit'?result.netDebit:result.netCredit):pendingValue],['Beneficio máximo',result?money(result.maxProfit):pendingValue],['Pérdida máxima',result?money(result.maxLoss):pendingValue],['Break-even (USD/acción)',result?evidenceNumber(result.breakEven):pendingValue],['Ganancia / riesgo',result?evidenceNumber(result.riskRewardRatio):pendingValue],...(snapshot.modules.technical?[['Probabilidad histórica',`${pct(historical?.probability)} · ${historical?.sampleSize??'No disponible'} muestras`]]:[])])}
      <p>${snapshot.modules.technical?esc(trendText+" "+technicalContext):""}</p><p>${snapshot.modules.monteCarlo?esc(mcInfo):""}</p><p>${snapshot.modules.financial?esc(fundamental):""} ${snapshot.modules.statements?esc(statements):""} ${snapshot.modules.news?esc(news):""}</p>
      ${snapshot.modules.news?`<section class="news-confluence-detail"><h4>Noticias frente a esta estrategia y al core técnico</h4><p>${esc(candidate.newsConfluence?.explanation||'Sin datos de confluencia para esta candidata.')}</p><ul>${(candidate.newsConfluence?.sources||[]).slice(0,10).map(source=>{const url=(()=>{try{const value=new URL(source.url);return ['https:','http:'].includes(value.protocol)?value.href:null;}catch{return null;}})();return `<li>${esc(source.timestamp)} · ${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(source.headline)}</a>`:esc(source.headline)} · ${esc(({bullish:'Alcista',bearish:'Bajista',mixed:'Mixta',neutral:'Sin dirección clara',unknown:'Sin clasificar'})[source.label]||'Sin clasificar')}</li>`;}).join('')}</ul></section>`:''}
      ${snapshot.modules.indicators?`<p>Core de indicadores: ${esc(candidate.indicatorEvidence?.reason||'Sin datos')}. Score para esta dirección: ${esc(evidenceNumber(candidate.side==='bullish'?candidate.indicatorEvidence?.bullScore:candidate.indicatorEvidence?.bearScore))}. Se consideran las últimas cinco velas diarias cerradas; las señales y sus reglas están en el panel de indicadores.</p>`:''}
      <p>${esc(outcome)} No se incluyen comisiones, deslizamiento ni garantías de ejecución.</p>
      <p>${esc(payoff)} ${snapshot.modules.technical?esc(history)+" La frecuencia histórica no es un pronóstico calibrado.":""} ${snapshot.modules.monteCarlo?'Monte Carlo usa precios lognormales, volatilidad y tasa constantes; no incluye comisiones, deslizamiento ni ejercicio anticipado. Es una estimación condicionada por esos supuestos, no una probabilidad garantizada. ':''}Las griegas de las patas y del spread no se calcularon en este ranking. ${esc(spotWarning)} ${esc(ageWarning)}</p>
      <p>Si la opción admite ejercicio anticipado, la pata vendida puede ser asignada antes del vencimiento. El análisis no modela comisiones, deslizamiento ni ejecución.</p>`;
  }
  function candidateLegs(candidate,rows){
    const e=candidate.evidence||{};
    const fromRanking=side=>({contractSymbol:candidate[side+'Symbol'],type:candidate.optionType,strike:candidate[side+'Strike'],bid:candidate[side+'Bid'],ask:candidate[side+'Ask'],timestamp:candidate[side+'QuoteTimestamp']});
    const long=e.long||fromRanking('long'),short=e.short||fromRanking('short');
    const leg=(label,leg,side)=>evidenceList([['Pata',label],['Contrato',leg.contractSymbol||'No disponible'],['Empresa',leg.underlyingSymbol||'No disponible'],['Vencimiento',leg.expiration||'No disponible'],['Opción',leg.type?leg.type.toUpperCase():'No disponible'],['Strike',evidenceNumber(leg.strike)],['Prima utilizada',side==='buy'?`Ask ${evidenceNumber(leg.ask)}`:`Bid ${evidenceNumber(leg.bid)}`],['Bid / Ask',`${evidenceNumber(leg.bid)} / ${evidenceNumber(leg.ask)}`],['Fecha de cotización',evidenceDate(leg.timestamp)],['Cantidad',evidenceNumber(e.quantity)],['Multiplicador',evidenceNumber(leg.multiplier)]]);
    const lower=Number.isFinite(candidate.longStrike)&&Number.isFinite(candidate.shortStrike)&&candidate.longStrike!==candidate.shortStrike?(candidate.longStrike<candidate.shortStrike?'larga':'corta'):null;
    const alternatives=rows.map(row=>row.candidate).filter(other=>other!==candidate&&other.symbol===candidate.symbol&&other.expiration===candidate.expiration&&other.strategy===candidate.strategy);
    const other=alternatives[0];
    const comparison=other?`Entre ${alternatives.length} alternativa(s) visible(s) de la misma estrategia, el par ${other.longStrike}/${other.shortStrike} tiene score ${scoreNumber(other.score)}, probabilidad histórica ${pct(other.probability?.probability)}, ganancia/riesgo ${evidenceNumber(other.riskReward)} y diferencial ${evidenceNumber(other.liquidityScore)}; el par seleccionado tiene score ${scoreNumber(candidate.score)}, probabilidad ${pct(candidate.probability?.probability)}, ganancia/riesgo ${evidenceNumber(candidate.riskReward)} y diferencial ${evidenceNumber(candidate.liquidityScore)}.`:'No hay otro par visible de la misma empresa y estrategia para comparar; el alcance mostrado y los filtros pueden haber excluido alternativas.';
    const provenance=e.long&&e.short?'Identidades y cotizaciones proceden de las patas conservadas para esta candidata.':'Falta la evidencia original completa; los campos disponibles proceden del ranking y no están verificados.';
    return `<p>${esc(provenance)}</p><h4>Pata comprada (long)</h4>${leg('Compra',long,'buy')}<h4>Pata vendida (short)</h4>${leg('Venta',short,'sell')}
      <p>${lower?`La pata ${esc(lower)} tiene el strike menor; `:'No se pudo comprobar el orden de los strikes; '}se compra al Ask y se vende al Bid. La cantidad mostrada corresponde a una unidad de spread del ranking, no a una orden ejecutada. El ranking revisa pares de la misma empresa, vencimiento y tipo, strikes dentro del 30% del spot, cotizaciones positivas sin cruce y hasta 72 horas de antigüedad; exige prima positiva menor que el ancho. Enumera pares, calcula el score y en el S&P conserva la mejor combinación de cada estrategia por empresa después de filtrar.</p>
      <p>Esta combinación aparece por su posición en ese ranking y los filtros visibles; no se eligió por Delta, Gamma, volumen o interés abierto. La suma de diferenciales relativos Bid/Ask se utiliza como filtro y criterio de desempate. El selector automático del formulario es distinto: usa pares consecutivos y prioriza cercanía al spot, punto medio y ancho.</p><p>${esc(comparison)}</p>
      <p>La distancia entre strikes es el ancho del spread. Si la prima se mantiene constante, un ancho mayor aumenta el beneficio máximo de un débito mientras su pérdida máxima sigue siendo el débito; en un crédito aumenta la pérdida máxima mientras su beneficio máximo sigue siendo el crédito. Los límites concretos se muestran en la evaluación de Quant.</p>`;
  }
  function candidateScore(candidate,snapshot,rows,filters){
    const components=Object.entries(candidate.scoreComponents||{}).map(([key,value])=>[window.ResearchRanking.labels[key],Number.isFinite(value)?value.toFixed(2)+'/100':'Sin datos']);
    return '<p>Puntuación = promedio simple de los cores de puntuación seleccionados. Cada uno pesa lo mismo. Noticias es contexto, no aporta puntuación.</p>'+ (snapshot.fundamentalScope||snapshot.financialStatementsScope?'<p>En este recorrido del S&P 500, los análisis FMP se consultan después de elegir el Top y no forman parte del promedio.</p>':'') +evidenceList([['Puntuación',Number.isFinite(candidate.score)?candidate.score.toFixed(2)+'/100':'No clasificable'],...components])+`<p>${candidate.scoreMissing?.length?'Faltan datos de: '+esc(candidate.scoreMissing.join(', ')):Object.keys(candidate.scoreComponents||{}).length?'Todos los cores que participan en la puntuación tienen datos.':'Selecciona al menos un core de puntuación para ordenar.'}</p><p>${snapshot.modules.technical?'Técnico: alineación de tendencia 100, mixta 50, contraria 0. ':''}${snapshot.modules.indicators?'Indicadores: media direccional de la última señal reciente por familia; sin eventos, neutral 50. ':''}${snapshot.modules.monteCarlo?'Monte Carlo: frecuencia simulada de P&L positivo × 100. ':''}${snapshot.modules.financial&&!snapshot.fundamentalScope?'Fundamental: score de métricas FMP. ':''}${snapshot.modules.statements&&!snapshot.financialStatementsScope?'Financiero: salud de liquidez, deuda y flujos FMP. ':''}${snapshot.modules.movers?'Movimiento: 50 + variación diaria alineada × 5, limitado a 0–100. ':''}</p><p>Desempates: mayor ganancia/riesgo y menor diferencial Bid/Ask; después ticker, estrategia y strikes. Los filtros se aplican antes del top. Es una clasificación heurística, no una garantía de ganancia.</p>`;
  }
  function financialCalculations(candidate,evaluation){
    const long=evaluation.legs.find(leg=>leg.side==='buy'),short=evaluation.legs.find(leg=>leg.side==='sell'),debit=evaluation.spreadCategory==='debit';
    const net=candidate.netPremium,amount=debit?evaluation.netDebit:evaluation.netCredit;
    const premiumExpression=debit?`${evidenceNumber(long.price)} − ${evidenceNumber(short.price)}`:`${evidenceNumber(short.price)} − ${evidenceNumber(long.price)}`;
    const benefit=debit?`(ancho ${evidenceNumber(evaluation.width)} − débito ${evidenceNumber(net)})`:`crédito ${evidenceNumber(net)}`;
    const loss=debit?`débito ${evidenceNumber(net)}`:`(ancho ${evidenceNumber(evaluation.width)} − crédito ${evidenceNumber(net)})`;
    const lower=Math.min(candidate.longStrike,candidate.shortStrike),higher=Math.max(candidate.longStrike,candidate.shortStrike);
    const breakFormula=candidate.optionType==='call'?`strike inferior ${evidenceNumber(lower)} + prima ${evidenceNumber(net)}`:`strike superior ${evidenceNumber(higher)} − prima ${evidenceNumber(net)}`;
    return `<p>Resultados de <code>POST /api/v1/strategies/evaluate</code>, contrastados con el ranking. Prima por acción: ${esc(premiumExpression)} = ${esc(evidenceNumber(net))} USD/acción (${debit?'débito':'crédito'}).</p>
      <p>Prima total: ${esc(evidenceNumber(net))} USD/acción × ${esc(evidenceNumber(evaluation.multiplier))} acciones/contrato × ${esc(evidenceNumber(evaluation.quantity))} contrato(s) = ${esc(money(amount))} USD ${debit?'pagados':'recibidos'}.</p>
      <p>Ancho: ${esc(evidenceNumber(higher))} − ${esc(evidenceNumber(lower))} = ${esc(evidenceNumber(evaluation.width))} USD/acción.</p>
      <p>Beneficio máximo: ${esc(benefit)} × ${esc(evidenceNumber(evaluation.multiplier))} × ${esc(evidenceNumber(evaluation.quantity))} = ${esc(money(evaluation.maxProfit))} USD. Pérdida máxima: ${esc(loss)} × ${esc(evidenceNumber(evaluation.multiplier))} × ${esc(evidenceNumber(evaluation.quantity))} = ${esc(money(evaluation.maxLoss))} USD.</p>
      <p>Break-even: ${esc(breakFormula)} = ${esc(evidenceNumber(evaluation.breakEven))} USD/acción. Relación ganancia/riesgo: ${esc(evidenceNumber(evaluation.riskRewardRatio))}. Las cifras son al vencimiento y excluyen comisiones.</p>`;
  }
  function renderCandidateExplanation(snapshot,rows,filters){
    const candidate=getSelectedCandidate(),panel=$('researchCandidateExplanation');
    if(!candidate){panel.hidden=true;selectionVersion++;return;}
    panel.hidden=false;
    const underlying=snapshot.underlyings.find(item=>item.symbol===candidate.symbol);
    $('researchCandidateTitle').textContent=`${candidate.symbol} · ${strategyLabel(candidate.strategy)} · ${candidate.longStrike}/${candidate.shortStrike}`;
    $('researchCandidateWhy').innerHTML=candidateWhy(candidate,snapshot,underlying);
    $('researchCandidateLegs').innerHTML=candidateLegs(candidate,rows);
    $('researchCandidateScore').innerHTML=candidateScore(candidate,snapshot,rows,filters);
    $('researchCandidateValidation').dataset.state='loading';
    $('researchCandidateValidation').textContent='Comprobando datos de las patas y evaluación en Quant…';
    $('researchCandidateCalculations').innerHTML='<p>Esperando validación del evaluador de Quant.</p>';
    const version=++selectionVersion;
    evaluateCandidate(candidate).then(result=>{
      if(version!==selectionVersion||currentSnapshot!==snapshot||getSelectedCandidate()!==candidate)return;
      const status=$('researchCandidateValidation');status.dataset.state=result.status;
      status.textContent=result.status==='verified'?'Candidata coherente con el evaluador de Quant. '+(result.warnings||[]).join(' '):'No verificada: '+result.issues.join(' ');
      $('researchCandidateWhy').innerHTML=candidateWhy(candidate,snapshot,underlying,result);
      $('researchCandidateCalculations').innerHTML=result.status==='verified'?financialCalculations(candidate,result.evaluation):`<p>No se presentan cálculos como verificados. ${esc(result.issues.join(' '))}</p>`;
    });
  }
  function syncComparisonSymbols(snapshot){
    const select=$('researchCompareSymbol'),current=select.value,symbols=snapshot.underlyings.map(item=>item.symbol);
    select.innerHTML=symbols.map(symbol=>`<option value="${esc(symbol)}">${esc(companyName(symbol))}</option>`).join('');
    const candidate=getSelectedCandidate();
    select.value=symbols.includes(current)?current:(candidate&&symbols.includes(candidate.symbol)?candidate.symbol:symbols[0]||'');
  }
  async function renderStrategyComparison(snapshot,rows){
    if(!$('researchComparison').open)return;
    const version=++comparisonVersion,symbol=$('researchCompareSymbol').value;
    $('researchCompareStatus').textContent='Validando las candidatas visibles contra Quant…';
    $('researchCompareResults').innerHTML='';
    const groups=window.StrategyExplanation.comparisonRows(rows,symbol);
    const results=await Promise.all(groups.map(async group=>{
      const skipped=[];
      for(const candidate of group.candidates){
        const verification=await evaluateCandidate(candidate);
        if(verification.status==='verified')return {...group,candidate,verification,skipped};
        skipped.push(`${candidate.longStrike}/${candidate.shortStrike}: ${verification.issues.join(' ')}`);
      }
      return {...group,candidate:null,verification:null,skipped};
    }));
    if(version!==comparisonVersion||currentSnapshot!==snapshot||!$('researchComparison').open||$('researchCompareSymbol').value!==symbol)return;
    const visible=rows.filter(row=>row.candidate.symbol===symbol),firstRanked=visible.find(row=>Number.isFinite(row.candidate.score))?.candidate;
    const winners=results.filter(item=>item.candidate).sort((a,b)=>rows.findIndex(row=>row.candidate===a.candidate)-rows.findIndex(row=>row.candidate===b.candidate));
    const winner=winners.find(item=>Number.isFinite(item.candidate.score))?.candidate,runner=winners.filter(item=>Number.isFinite(item.candidate.score))[1]?.candidate,skippedCount=results.reduce((sum,item)=>sum+item.skipped.length,0);
    $('researchCompareStatus').textContent=`${winners.length}/4 estrategias con candidata verificada entre las visibles. ${skippedCount} candidata(s) no verificadas. ${winners.length<4?'No es posible comparar las cuatro con criterios equivalentes por ausencia de datos o verificación. ':''}Comparación limitada al ranking existente, filtros y todos los pares válidos por ticker.`;
    const lines=results.map(item=>{
      if(!item.candidate){
        const any=visible.some(row=>row.candidate.strategy===item.strategy);
        const text=item.skipped.length?'Candidatas no verificadas: '+item.skipped.join(' · '):any?'Score no disponible para las candidatas visibles.':'Sin candidata visible; puede deberse a filtros o al límite de 20.';
        return `<tr><td>${esc(strategyLabel(item.strategy))}</td><td colspan="7">${esc(text)}</td></tr>`;
      }
      const c=item.candidate,e=item.verification.evaluation;
      const advantage=c.side==='bullish'?'Favorece cierre al alza':'Favorece cierre a la baja';
      return `<tr><td>${esc(strategyLabel(c.strategy))}</td><td>${esc(advantage)}</td><td>${esc(c.longStrike)} / ${esc(c.shortStrike)}</td><td>${esc(money(e.maxProfit))}</td><td>${esc(money(e.maxLoss))}</td><td>${esc(evidenceNumber(e.breakEven))} USD/acción</td><td>${esc(evidenceNumber(e.riskRewardRatio))}</td><td>${esc(scoreNumber(c.score))}<br>${esc(item.skipped.length?`Superiores no verificadas: ${item.skipped.join(' · ')}. `:'')}Beneficio y pérdida limitados; riesgo de movimiento contrario y ejecución.</td></tr>`;
    }).join('');
    let summary='No hay una mejor puntuación verificable con los datos disponibles.';
    if(winner){
      summary=`Mejor puntuación verificada entre las candidatas visibles: ${winner.symbol} ${strategyLabel(winner.strategy)}, score ${scoreNumber(winner.score)}. Ganancia/riesgo ${evidenceNumber(winner.riskReward)}. Componentes seleccionados: ${Object.entries(winner.scoreComponents||{}).map(([key,value])=>window.ResearchRanking.labels[key]+': '+evidenceNumber(value)).join(' · ')}.`;
      if(runner)summary+=` Siguiente estrategia verificada: ${strategyLabel(runner.strategy)}, score ${scoreNumber(runner.score)}; diferencia ${scoreNumber(winner.score-runner.score)}.`;
      if(firstRanked!==winner)summary+=' La primera candidata del ranking no pudo verificarse; se muestra la primera que sí pudo contrastarse.';
    }
    $('researchCompareResults').innerHTML=`<div class="research-table-wrap"><table class="research-table"><thead><tr><th>Estrategia</th><th>Dirección</th><th>Strikes largo/corto</th><th>Beneficio máximo</th><th>Pérdida máxima</th><th>Break-even</th><th>Ganancia/riesgo</th><th>Score y riesgos</th></tr></thead><tbody>${lines}</tbody></table></div><h4>¿Cuál estrategia obtuvo la mejor puntuación y por qué?</h4><p>${esc(summary)} «Mejor» se refiere al score y datos visibles, no a la inversión más rentable ni más segura. La puntuación utiliza únicamente los cores seleccionados con datos completos.</p>`;
  }
  function render(snapshot){
    const filtered=filteredRows(snapshot),filters=filtered.filters;
    const allRows=filtered.rows,mode=$('researchMode').value,perCompany=new Map();
    const rankedCompanies=mode==='top'?window.ResearchRanking.topCompanies(allRows):[];
    // Si ningún candidato tiene score completo, conserva el análisis por empresa
    // y muestra candidatos sin clasificar en vez de dejar vacíos todos los paneles.
    const hasRankingCore=snapshot.modules.technical||(!snapshot.fundamentalScope&&snapshot.modules.financial)||(!snapshot.financialStatementsScope&&snapshot.modules.statements)||snapshot.modules.movers;
    const unrankedSeen=new Set();
    const unrankedCompanies=mode==='top'&&hasRankingCore&&!rankedCompanies.length?allRows.filter(({candidate})=>{if(unrankedSeen.has(candidate.symbol))return false;unrankedSeen.add(candidate.symbol);return true;}):[];
    const rows=mode==='top'?(rankedCompanies.length?(showAllRankedCompanies?rankedCompanies:rankedCompanies.slice(0,10)):unrankedCompanies.slice(0,10)):mode==='list'?allRows.filter(({candidate})=>{const count=perCompany.get(candidate.symbol)||0;perCompany.set(candidate.symbol,count+1);return count<25;}):allRows.slice(0,100);
    const symbols=new Set(rows.map(row=>row.candidate.symbol));
    // Proyección solo de lectura: no recortar el snapshot ni renumerar candidatas.
    const view=mode==='top'?{...snapshot,viewScope:{total:snapshot.underlyings.length,visible:symbols.size},underlyings:rows.map(row=>snapshot.underlyings.find(item=>item.symbol===row.candidate.symbol)).filter(Boolean),fundamentals:snapshot.fundamentals?{...snapshot.fundamentals,rows:snapshot.fundamentals.rows.filter(row=>symbols.has(row.symbol))}:null,movers:snapshot.movers?{...snapshot.movers,coveredCount:symbols.size,universeCount:null,gainers:snapshot.movers.gainers.filter(row=>symbols.has(row.symbol)),losers:snapshot.movers.losers.filter(row=>symbols.has(row.symbol))}:null,news:{...snapshot.news,articles:snapshot.news.articles.filter(article=>(article.symbols||[]).some(symbol=>symbols.has(symbol)))}}:snapshot;
    $('researchResultScope').hidden=mode!=='top';
    $('researchScopeStatus').textContent=rankedCompanies.length?`${showAllRankedCompanies?'Todas las empresas clasificadas':'Top 10'}: ${rows.length} de ${rankedCompanies.length} empresas elegibles entre ${snapshot.underlyings.length} evaluadas. Los paneles siguientes corresponden a estas mismas empresas. ${snapshot.fundamentalScope?'FMP se consultó solo para las diez finalistas y no modifica este orden. ':''}${snapshot.screening?.failedCount?'Cobertura parcial: '+snapshot.screening.failedCount+' empresas con errores. ':''}El score compara los cores seleccionados; no garantiza rentabilidad.`:`No hay empresas con score completo entre ${snapshot.underlyings.length} evaluadas. Se muestran hasta ${rows.length} empresas sin clasificar para conservar su análisis; revisa los datos de los cores seleccionados. ${snapshot.fundamentalScope?'FMP se consultó solo para las diez finalistas y no modifica este orden. ':''}${snapshot.screening?.failedCount?'Cobertura parcial: '+snapshot.screening.failedCount+' empresas con errores. ':''}`;
    $('btnResearchShowAll').hidden=rankedCompanies.length<=10;
    $('btnResearchShowAll').textContent=showAllRankedCompanies?'Mostrar solo el Top 10':'Ver todos los resultados';
    $('btnResearchShowAll').setAttribute('aria-expanded',String(showAllRankedCompanies));
    $('researchTopReasons').innerHTML=mode==='top'&&rankedCompanies.length&&!showAllRankedCompanies?'<ol>'+rows.map(({candidate:c},position)=>{
      const next=rows[position+1]?.candidate,leader=rows[0]?.candidate;
      const comparison=position===0?(next?(c.score===next.score?'Empata en puntuación con el segundo lugar; el orden se decide por ganancia/riesgo y diferencial.':`Supera al segundo lugar por ${(c.score-next.score).toFixed(2)} puntos.`):'Única empresa con puntuación completa y filtros válidos.'):(leader.score===c.score?'Tiene la misma puntuación que el primer lugar; se aplica el criterio de desempate.':`Está ${(leader.score-c.score).toFixed(2)} puntos debajo del primer lugar.`);
      const components=Object.entries(c.scoreComponents||{}).map(([key,value])=>`${window.ResearchRanking.labels[key]}: ${Number.isFinite(value)?value.toFixed(1):'sin dato'}/100`).join(' · ');
      return `<li><strong>${esc(c.symbol)} · ${esc(strategyLabel(c.strategy))} · ${c.score.toFixed(2)}/100</strong>. ${esc(comparison)} ${esc(components)}. Ganancia/riesgo ${c.riskReward.toFixed(2)}; diferencial ${c.liquidityScore.toFixed(3)}. En empate se prioriza ganancia/riesgo y después menor diferencial.</li>`;
    }).join('')+'</ol>':'';
    // La comparación sigue al contexto de noticias; research-sections numera los bloques visibles.
    const resultPanel=$('researchStrategiesTitle').closest('section');
    $('researchNewsPanel').after(resultPanel);
    renderIndicators(view);renderSummary(view);renderTechnical(view);renderMonteCarlo(view);renderFinancialAndMovers(view);
    const news=view.news,newsPanel=$('researchNewsPanel');newsPanel.hidden=!snapshot.modules.news;
    if(snapshot.modules.news){
      const sentimentCounts=news.articles.reduce((counts,item)=>{const label=sentimentOf(item).label;counts[label]=(counts[label]||0)+1;return counts;},{});
      $('researchNewsStatus').textContent=news.status==='available'?`${news.articles.length} artículo(s) para ${view.underlyings.map(x=>x.symbol).join(', ')} · ${sentimentCounts.bullish||0} alcistas, ${sentimentCounts.bearish||0} bajistas, ${sentimentCounts.mixed||0} mixtas, ${sentimentCounts.neutral||0} sin señal clara · Captura ${new Date(news.capturedAt).toLocaleString('es-MX')}.`:`No se pudieron consultar noticias de Alpaca: ${news.error||'error no especificado'}.`;
      const articleUrl=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}};
      const filter=$('researchNewsFilter').value,labels={bullish:'Alcista',bearish:'Bajista',mixed:'Mixta',neutral:'Sin señal clara',unknown:'Sin clasificar'},confidenceLabels={low:'baja',medium:'media',high:'alta'};
      const articles=news.articles.filter(item=>filter==='all'||sentimentOf(item).label===filter).slice(0,20);
      $('researchNews').innerHTML=news.status==='available'&&articles.length?articles.map(item=>{const url=articleUrl(item.url),date=item.created_at||item.updated_at,source=item.source||item.author||'Fuente no indicada',sentiment=sentimentOf(item),label=labels[sentiment.label]||labels.unknown,confidence=confidenceLabels[sentiment.confidence]||confidenceLabels.low,signals=[...(sentiment.signals?.bullish||[]),...(sentiment.signals?.bearish||[])];return `<article class="research-news-item"><strong>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(item.headline||'Artículo sin titular')}</a>`:esc(item.headline||'Artículo sin titular')}<span class="research-sentiment-badge sentiment-${esc(sentiment.label)}">${esc(label)} · nivel heurístico ${esc(confidence)}</span></strong><div class="research-news-meta">${esc(source)} · ${esc(date?new Date(date).toLocaleString('es-MX'):'Fecha no indicada')} · ${(item.symbols||[]).map(esc).join(', ')}</div>${sentiment.explanation?`<p class="research-news-summary">${esc(sentiment.explanation)}</p>`:''}${signals.length?`<p class="research-news-meta">Señales de texto: ${signals.map(esc).join(', ')}</p>`:''}${item.summary?`<p class="research-news-summary">${esc(item.summary)}</p>`:''}</article>`;}).join(''):`<p class="research-panel-description">${news.status==='available'?'No hay artículos disponibles para esa clasificación.':'No hay artículos disponibles para los tickers y periodo consultados.'}</p>`;
    }
    const wbMetrics=window.__workbenchTableMetrics,wbCtx=window.__workbenchContext;
    const wbActive=!!(wbMetrics&&wbCtx&&wbMetrics.token===wbCtx.token);
    const wbHead=$('researchMethodHead');
    wbHead.hidden=!wbActive;if(wbActive)wbHead.textContent=wbMetrics.label;
    const wbCell=index=>!wbActive?'':!Number.isFinite(wbMetrics.values[index])?'<td>—</td>':`<td title="${esc(wbMetrics.label+' calculada con el método del Quant Workbench. Métrica informativa; no es pronóstico ni recomendación.')}">${esc(fmtWorkbenchMetric(wbMetrics.method,wbMetrics.values[index]))}</td>`;
    $('researchCandidates').innerHTML=rows.map(({candidate:c,index},position)=>{const mc=c.monteCarlo,mcTitle=mc?.assumptions?`${mc.simulations} escenarios · vol. realizada ${(mc.assumptions.volatility*100).toFixed(1)}% · P&L medio ${money(mc.expectedPnl)} · P05 ${money(mc.p05)} · P95 ${money(mc.p95)}`:mc?.reason||'Monte Carlo no disponible',mcLabel=!snapshot.modules.monteCarlo?'No incluido':Number.isFinite(mc?.probability)?pct(mc.probability):'Sin datos',scoreTitle=c.scoreMissing?.length?'Sin puntuación: faltan '+c.scoreMissing.join(', '):'Promedio de los cores seleccionados (0–100); no es probabilidad de ganancia';return `<tr data-candidate="${index}" title="Selecciona para ver señales, niveles y explicación"><td>${Number.isFinite(c.score)?position+1:"—"}</td><td>${esc(c.symbol)}</td><td>${esc(c.strategy.replace('_SPREAD','').replaceAll('_',' '))}</td><td data-core-column="technical">${esc(c.technicalTrend||'Sin datos')}</td><td>${esc(c.longStrike)} / ${esc(c.shortStrike)}</td><td>${money(c.maxProfit)}</td><td>${money(c.maxLoss)}</td><td>${money(c.breakEven)}</td><td data-core-column="technical">${pct(c.probability.probability)}</td><td data-core-column="monteCarlo" title="${esc(mcTitle)}">${esc(mcLabel)}</td><td data-core-column="technical">${c.probability.interval?`${pct(c.probability.interval.lower)}–${pct(c.probability.interval.upper)}`:'—'}</td><td data-core-column="technical">${c.probability.sampleSize}</td><td title="${esc(scoreTitle)}">${Number.isFinite(c.score)?c.score.toFixed(3):'—'}</td><td>${esc(new Date(c.longQuoteTimestamp).toLocaleString('es-MX'))}<br>${esc(new Date(c.shortQuoteTimestamp).toLocaleString('es-MX'))}</td><td><button type="button" class="btn btn-primary" data-prepare-candidate="${index}">Preparar operación</button> <button type="button" class="btn btn-secondary strategy-explain-button" data-explain-candidate="${index}">Ver explicación</button></td><td data-core-column="news">${snapshot.modules.news?`<small class="news-confluence" data-state="${esc(c.newsConfluence?.state||'unavailable')}" title="${esc(c.newsConfluence?.explanation||'Sin datos de confluencia')}">${esc(c.newsConfluence?.label||'Sin datos de confluencia')}</small>`:''}</td>${wbCell(index)}</tr>`;}).join('')||`<tr><td colspan="${wbActive?17:16}">No hay candidatas que cumplan los filtros seleccionados.</td></tr>`;
    document.querySelectorAll('[data-core-column]').forEach(cell=>{cell.hidden=!snapshot.modules[cell.dataset.coreColumn];});
    document.dispatchEvent(new CustomEvent('research:snapshot',{detail:{...view,candidates:rows.map(row=>row.candidate)}}));
    $('researchRankingStatus').textContent=$('researchMode').value==='top'?rankedCompanies.length?`${showAllRankedCompanies?"Todas las clasificadas":"Top 10"}: ${rows.length} de ${rankedCompanies.length} empresas, con una estrategia por empresa, después de filtrar ${allRows.length} pares. Sin datos completos en un core seleccionado no se asigna posición.`:hasRankingCore?`No hay scores completos después de filtrar ${allRows.length} pares. Mostrando ${rows.length} empresas sin clasificar.`:`No hay cores de puntuación seleccionados; no se genera un top de empresas.`:`${rows.length} de ${allRows.length} combinaciones de contratos que cumplen los filtros para ${$('researchMode').value==='list'?snapshot.underlyings.map(item=>item.symbol).join(', '):$('researchCompany').value}${$('researchMode').value==='list'?' (hasta 25 por empresa)':''}. Orden: cores seleccionados, ganancia/riesgo y diferencial. Varias filas pueden corresponder a la misma estrategia con strikes distintos.`;
    $('researchEvidence').hidden=false;
    snapshot.filters=filters;
    syncComparisonSymbols(view);
    if(selectedCandidateIndex!==null&&!rows.some(row=>row.index===selectedCandidateIndex))selectCandidate(null);
    else {
      if(selectedCandidateIndex!==null)document.querySelector(`#researchCandidates tr[data-candidate="${selectedCandidateIndex}"]`)?.classList.add('is-selected');
      renderCandidateExplanation(snapshot,rows,filters);
    }
    if($('researchComparison').open)renderStrategyComparison(snapshot,allRows);
  }
  function invalidateResearchContext(showMessage=true){
    researchVersion++;selectionVersion++;comparisonVersion++;analysisController?.abort();
    document.dispatchEvent(new Event('research:invalidated'));
    currentSnapshot=null;selectedCandidateIndex=null;modulesDirty=false;showAllRankedCompanies=false;
    window.__researchMarketCache={};window.__workbenchTableMetrics=null;
    $('researchEvidence').hidden=true;$('researchCandidateExplanation').hidden=true;
    $('researchCandidates').innerHTML='';$('researchCompareResults').innerHTML='';
    if(typeof refreshChartOverlays==='function')refreshChartOverlays();
    if(showMessage)setStatus('Cambió la empresa, el vencimiento o los módulos. Vuelve a analizar para actualizar las explicaciones.','info');
  }
  async function runAnalysis(){
    if(running)return;const expiration=$('expiration').value.trim(),modules=readModules();
    let symbols=researchSymbols();
    if(!Object.entries(modules).some(([key,value])=>key!=='ai'&&value))return setStatus('Selecciona al menos un core de datos para analizar. La IA interpreta resultados; no calcula por sí sola.','error');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(expiration)||Date.parse(expiration+'T00:00:00Z')<=Date.now())return setStatus('Selecciona un vencimiento futuro válido.','error');
    const useSp500=$('researchMode').value==='top'&&$('researchUniverse').value==='sp500';
    if(!useSp500&&(!symbols.length||symbols.length>10||symbols.some(s=>!/^[A-Z0-9.-]{1,12}$/.test(s))))return setStatus('Ingresa de 1 a 10 tickers válidos, separados por coma, espacio o punto y coma, o selecciona el S&P 500.','error');
    const deferredFundamentals=useSp500&&modules.financial,deferredStatements=useSp500&&modules.statements;
    const deferredFinancial=deferredFundamentals||deferredStatements;
    const rankingModules=deferredFinancial?{...modules,financial:false,statements:false}:modules;
    if(deferredFinancial&&!['technical','indicators','monteCarlo','movers'].some(key=>rankingModules[key]))return setStatus('Para elegir el Top del S&P 500 antes de consultar FMP, selecciona Técnico, Indicadores, Monte Carlo o Movimiento diario. Los análisis financieros se consultan después para las diez finalistas.','error');
    invalidateResearchContext(false);const version=researchVersion;
    const btn=$('btnResearchAnalyze');analysisController=new AbortController();$('btnResearchCancel').hidden=false;running=true;btn.disabled=true;btn.textContent='Consultando mercado…';$('researchEvidence').hidden=true;
    try{
      let screening=null;
      if(useSp500){setStatus('Obteniendo todas las empresas del S&P 500…','loading');screening=await scanSp500();symbols=screening.symbols;}
      if(version!==researchVersion)return;
      if(!symbols.length||symbols.length>(useSp500?600:10)||symbols.some(s=>!/^[A-Z0-9.-]{1,12}$/.test(s)))throw new Error('El análisis de opciones necesita de 1 a 10 tickers válidos.');
      const rate=Number($('qwRate')?.value),dividend=Number($('qwDividend')?.value),riskFreeRate=Number.isFinite(rate)?rate:.05,dividendYield=Number.isFinite(dividend)?dividend:0;
      const underlyings=[],failures=[];let completed=0,empty=0;
      async function getFundamentals(list){
        const parts=[];for(let i=0;i<list.length;i+=3){if(version!==researchVersion)return[];parts.push(await json('/api/research/fundamentals?symbols='+encodeURIComponent(list.slice(i,i+3).join(','))));}
        return parts.flatMap((part,index)=>part.rows?.length?part.rows:list.slice(index*3,index*3+3).map(symbol=>({symbol,status:'unavailable',metrics:{},error:part.error||'FMP no devolvió datos para este ticker.'}))).map(row=>row.status==='available'?{...row,fundamentalScore:ResearchAnalysis.scoreFundamentals(row.metrics)}:row);
      }
      async function getFinancialStatements(list){
        const parts=[];for(let i=0;i<list.length;i+=3){if(version!==researchVersion)return[];parts.push(await json('/api/research/financial-statements?symbols='+encodeURIComponent(list.slice(i,i+3).join(','))));}
        return parts.flatMap((part,index)=>part.rows?.length?part.rows:list.slice(index*3,index*3+3).map(symbol=>({symbol,status:'unavailable',metrics:{},error:part.error||'FMP no devolvió estados para este ticker.'}))).map(row=>row.status==='available'?{...row,financialScore:ResearchAnalysis.scoreFinancialStatements(row.metrics)}:row);
      }
      for(const symbol of symbols){
        if(version!==researchVersion)return;
        setStatus(`Evaluando opciones ${completed+1}/${symbols.length}: ${symbol}. ${failures.length} errores; ${empty} sin pares válidos. Puedes cancelar.`,'loading');
        try{
          const item=await analyzeSymbol(symbol,expiration,modules,riskFreeRate,dividendYield,version);
          if(useSp500){
            // FMP se consulta después de seleccionar las diez finalistas.
            if(!screening.changes.some(row=>row.symbol===symbol)&&Number.isFinite(item.dailyChangePct))screening.changes.push({symbol,changePct:item.dailyChangePct,latestClose:item.dailyClose,previousClose:item.previousClose,timestamp:item.dailyTimestamp});
            const ranked=ResearchRanking.rank(item.candidates,rankingModules,{changes:screening.changes});
            const matching=filteredRows({modules,candidates:ranked}).rows;
            const strategies=new Set();item.candidates=matching.filter(({candidate})=>!strategies.has(candidate.strategy)&&strategies.add(candidate.strategy)).map(row=>row.candidate);
            // Las velas para 500 empresas no deben permanecer en memoria del navegador.
            delete window.__researchMarketCache[symbol];
          }
          if(!item.candidates.length)empty++;underlyings.push(item);
        }catch(error){if(version!==researchVersion)return;failures.push(`${symbol}: ${error.message}`);}
        completed++;if(useSp500)await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(!underlyings.length)throw new Error(failures.slice(0,10).join(' · ')||'No se obtuvieron datos de mercado.');
      if(screening){screening.evaluatedCount=underlyings.length;screening.failedCount=failures.length;screening.emptyCount=empty;screening.coveredCount=screening.changes.length;screening.complete=failures.length===0;screening.failures=failures;}
      let news={status:'not-selected',provider:'Alpaca',capturedAt:null,articles:[]};
      if(modules.news)try{
        const articles=new Map();for(let i=0;i<underlyings.length;i+=20){if(version!==researchVersion)return;const part=await fetchNews(underlyings.slice(i,i+20).map(x=>x.symbol));for(const article of part.articles)articles.set(article.id||article.url||[article.headline,article.created_at||article.updated_at,article.source||article.author].join('|'),article);}
        news={status:'available',provider:'Alpaca',capturedAt:new Date().toISOString(),articles:[...articles.values()]};
      }catch(error){news={status:'unavailable',provider:'Alpaca',capturedAt:new Date().toISOString(),articles:[],error:error.message};}
      const changes=screening?.changes||underlyings.filter(x=>Number.isFinite(x.dailyChangePct)).map(x=>({symbol:x.symbol,changePct:x.dailyChangePct,latestClose:x.dailyClose,previousClose:x.previousClose,timestamp:x.dailyTimestamp}));
      const preliminary=ResearchRanking.rank(underlyings.flatMap(x=>x.candidates),rankingModules,{changes});
      const finalists=deferredFinancial?ResearchRanking.topCompanies(filteredRows({modules,candidates:preliminary}).rows).slice(0,10).map(row=>row.candidate.symbol):[];
      let fundamentals=null;
      if(modules.financial)try{
        const targets=deferredFundamentals?finalists:underlyings.map(x=>x.symbol);
        setStatus(`Consultando fundamentales de ${targets.length} empresas${deferredFundamentals?' finalistas; el Top ya está elegido':''}…`,'loading');
        const rows=targets.length?await getFundamentals(targets):[];
        fundamentals={status:rows.some(row=>row.status==='available')?'available':'unavailable',provider:'Financial Modeling Prep',capturedAt:new Date().toISOString(),rows,error:!targets.length?'No hay finalistas con score completo; no se consumieron consultas de FMP.':rows.every(row=>row.status!=='available')?[...new Set(rows.map(row=>row.error).filter(Boolean))].join(' '):undefined};
      }catch(error){fundamentals={status:'unavailable',provider:'Financial Modeling Prep',capturedAt:new Date().toISOString(),error:error.message,rows:[]};}
      let financialStatements=null;
      if(modules.statements)try{
        const targets=deferredStatements?finalists:underlyings.map(x=>x.symbol);
        setStatus(`Consultando estados financieros de ${targets.length} empresas${deferredStatements?' finalistas':''}…`,'loading');
        const rows=targets.length?await getFinancialStatements(targets):[];
        financialStatements={status:rows.some(row=>row.status==='available')?'available':'unavailable',provider:'Financial Modeling Prep',capturedAt:new Date().toISOString(),rows,error:!targets.length?'No hay finalistas con score completo; no se consultaron estados financieros.':rows.every(row=>row.status!=='available')?[...new Set(rows.map(row=>row.error).filter(Boolean))].join(' '):undefined};
      }catch(error){financialStatements={status:'unavailable',provider:'Financial Modeling Prep',capturedAt:new Date().toISOString(),error:error.message,rows:[]};}
      if(version!==researchVersion)return;
      const candidates=deferredFinancial?preliminary:ResearchRanking.rank(underlyings.flatMap(x=>x.candidates),modules,{fundamentals:fundamentals?.rows||[],financialStatements:financialStatements?.rows||[],changes});
      const classifiedNews={...news,articles:(news.articles||[]).map(item=>({...item,sentiment:sentimentOf(item)}))};
      const confluenceCache=new Map();
      for(const candidate of candidates){const key=[candidate.symbol,candidate.strategy,candidate.side,candidate.technicalTrend].join('|');if(!confluenceCache.has(key))confluenceCache.set(key,window.NewsConfluence.assess(candidate,classifiedNews,{enabled:modules.news,technical:modules.technical}));candidate.newsConfluence=confluenceCache.get(key);}
      const fundamentalScope=deferredFundamentals?{phase:'post-selection',symbols:finalists,affectsRanking:false}:null;
      const financialStatementsScope=deferredStatements?{phase:'post-selection',symbols:finalists,affectsRanking:false}:null;
      const movers=modules.movers?{status:changes.length?'available':'unavailable',provider:screening?'Alpaca market snapshots':'Alpaca daily bars',capturedAt:screening?.capturedAt||new Date().toISOString(),coveredCount:screening?.coveredCount,universeCount:screening?.universeCount,gainers:changes.filter(x=>x.changePct>=0).sort((a,b)=>b.changePct-a.changePct),losers:changes.filter(x=>x.changePct<0).sort((a,b)=>a.changePct-b.changePct)}:null;
      currentSnapshot={generatedAt:new Date().toISOString(),provider:'Alpaca',expirationDate:expiration,modules,screening,fundamentalScope,financialStatementsScope,marketData:{capturedAt:new Date().toISOString(),stocksFeed:underlyings.map(x=>({symbol:x.symbol,feed:x.stockFeed})),spotMethod:'midpoint quote, latest trade fallback, then last daily close',candidateRules:'valid bid/ask with timestamp no older than 72h; strikes within 30% of spot; same expiration; vertical width and premium checked'},underlyings,candidates,news,fundamentals,financialStatements,movers,estimation:{historical:{method:'historical-overlapping-returns',confidenceLevel:.95,minSampleSize:20,disclaimer:'Historical frequency is not a calibrated forecast. Rolling windows overlap and the Wilson interval may understate uncertainty.'},monteCarlo:{method:'monte-carlo-gbm-expiration',simulations:10000,volatilitySource:'annualized-realized-historical',disclaimer:'Model-dependent estimate. Assumes lognormal prices, constant volatility and rates; excludes fees, slippage, early exercise and changing volatility.'}},filters:{},decision:''};
      render(currentSnapshot);modulesDirty=false;setStatus(`Análisis listo: ${underlyings.length}/${symbols.length} tickers de opciones; ${screening?`exploración diaria ${screening.coveredCount}/${screening.universeCount} del S&P 500; `:''}${candidates.length} spreads válidos.${failures.length?' Cobertura parcial: '+failures.length+' errores. Primeros: '+failures.slice(0,5).join(' · '):''}${empty?' '+empty+' empresas sin pares que cumplan los filtros.':''} Las probabilidades son estimaciones separadas, no calibradas.`,'info');
      selectCandidate(null);
    }catch(error){if(version===researchVersion)setStatus(error.message,'error');}
    finally{analysisController=null;$('btnResearchCancel').hidden=true;running=false;btn.disabled=false;btn.textContent='Analizar y comparar los cuatro spreads';}
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
      const savedSnapshot=window.ResearchRanking.journalSnapshot(currentSnapshot,filteredRows(currentSnapshot).rows);
      const data=await json('/api/v1/research-journal',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({underlyingTicker:currentSnapshot.underlyings[0].symbol,expirationDate:currentSnapshot.expirationDate,snapshot:savedSnapshot})});
      setStatus('Análisis guardado en la bitácora de Supabase. ID '+data.id,'info');$('savePassword').value='';
    }catch(error){if(/Sesión|autentic|token/i.test(error.message))accessToken=null;setStatus(error.message,'error');}
  }
  async function loadJournal(){
    const host=$('researchHistory');host.textContent='Cargando bitácora…';
    try{const token=await ensureSession(),data=await json('/api/v1/research-journal?limit=30',{headers:{Authorization:'Bearer '+token}});
      host.innerHTML=(data.data||[]).map(x=>`<div style="padding:.35rem 0;border-bottom:1px solid var(--border)"><strong>${esc(x.underlying_ticker)}</strong> · ${esc(x.expiration_date)} · ${esc(new Date(x.created_at).toLocaleString('es-MX'))} · ${esc(String(x.snapshot?.candidates?.length??0))} spreads considerados</div>`).join('')||'La bitácora aún no tiene análisis.';
    }catch(error){host.textContent=error.message;}
  }
  // ── Selección de candidata ↔ gráfica ↔ workbench ──
  function getSelectedCandidate() {
    if (selectedCandidateIndex === null || !currentSnapshot) return null;
    return currentSnapshot.candidates[selectedCandidateIndex] ?? null;
  }
  function selectCandidate(index, rowElement) {
    const previous=selectedCandidateIndex;
    selectedCandidateIndex = Number.isInteger(index) && currentSnapshot && currentSnapshot.candidates[index] ? index : null;
    document.querySelectorAll('#researchCandidates tr.is-selected').forEach(row => row.classList.remove('is-selected'));
    const row = rowElement || (selectedCandidateIndex !== null ? document.querySelector('#researchCandidates tr[data-candidate="' + selectedCandidateIndex + '"]') : null);
    if (row) row.classList.add('is-selected');
    if(selectedCandidateIndex!==null&&previous!==selectedCandidateIndex)document.dispatchEvent(new CustomEvent('research:company-selected',{detail:{symbol:currentSnapshot.candidates[selectedCandidateIndex].symbol}}));
    if(previous!==selectedCandidateIndex)document.querySelectorAll('#researchCandidateExplanation details').forEach(details=>{details.open=false;});
    if (typeof refreshChartOverlays === 'function') refreshChartOverlays();
    if(currentSnapshot){
      const {rows,filters}=filteredRows(currentSnapshot);
      renderCandidateExplanation(currentSnapshot,rows,filters);
      const candidate=getSelectedCandidate();
      if(candidate&&[...$('researchCompareSymbol').options].some(option=>option.value===candidate.symbol))$('researchCompareSymbol').value=candidate.symbol;
      if($('researchComparison').open)renderStrategyComparison(currentSnapshot,rows);
    }else{selectionVersion++;$('researchCandidateExplanation').hidden=true;}
  }
  let technicalCache = null;
  const marketDateFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  // Alpaca identifica una vela diaria por su inicio. Sin calendario de sesiones,
  // se excluye todo el día bursátil actual para no confirmar una vela en formación.
  function marketDate(value) {
    const parts = marketDateFormatter.formatToParts(new Date(value));
    const get = name => parts.find(part => part.type === name)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function renderSignalTable(signals, state, note) {
    const date = $('chSignalDate').value;
    const filtered = date ? signals.filter(signal => new Date(signal.timestamp).toISOString().slice(0, 10) === date) : signals;
    const valueLabels = { previousClose:'Cierre anterior', previousSma50:'SMA50 anterior', sma20:'SMA20', sma50:'SMA50', previousSma20:'SMA20 anterior', previousRsi14:'RSI14 anterior', rsi14:'RSI14', threshold:'Umbral', zoneLower:'Límite inferior', zoneUpper:'Límite superior', atr14:'ATR14 anterior', buffer:'Margen ATR', pivotConfirmedAt:'Pivote confirmado', zoneAsOf:'Zona calculada hasta' };
    const formatValue = value => value === null || value === undefined ? 'No disponible' : String(value);
    // Mostrar los valores ya calculados, sin volver a evaluar ni alterar los indicadores.
    const calculation = signal => {
      const v = signal.values || {}, up = signal.side === 'bullish', price = formatValue(signal.price);
      if (signal.rule === 'sma_cross') return `Cierre anterior ${formatValue(v.previousClose)} ${up ? '≤' : '≥'} SMA50 anterior ${formatValue(v.previousSma50)}; cierre ${price} ${up ? '>' : '<'} SMA50 ${formatValue(v.sma50)}; SMA20 ${formatValue(v.sma20)} ${up ? '>' : '<'} SMA50 ${formatValue(v.sma50)}.`;
      if (signal.rule === 'rsi_cross') return `RSI anterior ${formatValue(v.previousRsi14)} ${up ? '≤' : '≥'} ${formatValue(v.threshold)}; RSI actual ${formatValue(v.rsi14)} ${up ? '>' : '<'} ${formatValue(v.threshold)}.`;
      if (signal.rule === 'zone_breakout') return `Límite previo ${formatValue(up ? v.zoneUpper : v.zoneLower)} ${up ? '+' : '−'} margen ATR ${formatValue(v.buffer)} = umbral ${formatValue(v.threshold)}; cierre anterior ${formatValue(v.previousClose)}, cierre actual ${price}.`;
      if (signal.rule === 'sma20_against') return `Cierre anterior ${formatValue(v.previousClose)} ${up ? '≥' : '≤'} SMA20 anterior ${formatValue(v.previousSma20)}; cierre ${price} ${up ? '<' : '>'} SMA20 ${formatValue(v.sma20)}.`;
      return 'Consultar los valores disponibles y la regla indicada.';
    };
    $('signalSummary').textContent = `${signals.length} señal(es) total(es) calculadas${date ? ` · ${filtered.length} para ${date} UTC` : ''}. ${note || ''}`;
    $('signalTableBody').innerHTML = filtered.map((signal, index) => {
      const values = Object.entries(signal.values || {}).map(([key,value]) => `<div><dt>${esc(valueLabels[key] || key)}</dt><dd>${esc(formatValue(value))}</dd></div>`).join('') || '<div><dd>No disponibles</dd></div>';
      const category = signal.category === 'technical' ? 'Técnica independiente' : 'Candidata: entrada/salida orientativa';
      const type = ['alcista', 'bajista', 'salida'].includes(signal.type) ? signal.type : 'neutral';
      const detailId = `signal-detail-${index}`;
      const dateLabel = window.marketPeriod.formatUtc(signal.timestamp);
      return `<tr data-signal-timestamp="${esc(signal.timestamp)}"><td>${esc(signal.ticker || state.symbol)}</td><td>${esc(dateLabel)}</td><td><strong>${esc(signal.indicator)}</strong><span class="signal-source">${esc(category)}</span></td><td><span class="signal-type signal-type-${type}">${esc(signal.type)}</span></td><td>${esc(money(signal.price))}</td><td><button type="button" class="signal-detail-toggle" data-signal-detail aria-expanded="false" aria-controls="${detailId}" aria-label="Ver explicación de ${esc(signal.indicator)} en ${esc(dateLabel)}">Ver explicación</button></td></tr>
        <tr id="${detailId}" class="signal-detail-row" hidden><td colspan="6"><div class="signal-detail-content"><p><strong>Explicación:</strong> ${esc(signal.explanation || 'No disponible')}</p><p><strong>Condición:</strong> ${esc(signal.exactRule || 'No disponible')}</p><p><strong>Valores en la condición:</strong> ${esc(calculation(signal))}</p><p><strong>Timestamp original del proveedor:</strong> <code>${esc(signal.timestamp)}</code> · <strong>Temporalidad:</strong> ${esc(signal.timeframe || '1Day')} · Confirmada al cierre de esta vela.</p><p><strong>Precio de cierre sin redondear:</strong> ${esc(formatValue(signal.price))}</p><dl class="signal-detail-values">${values}</dl></div></td></tr>`;
    }).join('') || '<tr><td colspan="6">Sin señales para el periodo y las reglas seleccionadas</td></tr>';
  }
  $('signalTableBody').addEventListener('click', event => {
    const button = event.target.closest('button[data-signal-detail]');
    if (!button) return;
    const detail = document.getElementById(button.getAttribute('aria-controls'));
    if (!detail) return;
    const opening = detail.hidden;
    detail.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    button.textContent = opening ? 'Ocultar explicación' : 'Ver explicación';
    button.setAttribute('aria-label', button.getAttribute('aria-label').replace(opening ? /^Ver explicación/ : /^Ocultar explicación/, opening ? 'Ocultar explicación' : 'Ver explicación'));
  });
  // ── Overlay del método del Quant Workbench (dibujado tras un cálculo explícito) ──
  // prices → precio teórico BS de la pata larga; greeks → spot con |Δ|≈0.5;
  // iv → banda de 1 desviación anualizada (spot·e^(±σ√T)) al vencimiento.
  function workbenchMethodOverlay(state) {
    const ctx = window.__workbenchContext;
    if (!ctx || !ctx.data) return null;
    if (ctx.symbol !== state.symbol) {
      return { lines: [], band: null, note: 'El método del workbench corresponde a ' + ctx.symbol + ' y la gráfica muestra ' + state.symbol + '; no se dibuja overlay.' };
    }
    const overlay = { lines: [], band: null, note: '' };
    const T = yearsToExpiration(ctx.expiration);
    if (!Number.isFinite(T)) {
      overlay.note = 'El vencimiento del método del workbench ya venció; no se dibuja overlay.';
      return overlay;
    }
    const sigma = Number(ctx.volatility), spot = Number(ctx.spot);
    if (ctx.method === 'prices' && Number.isFinite(ctx.data.price)) {
      overlay.lines.push({ value: ctx.data.price, label: 'BS pata larga' });
      overlay.note = `Método Workbench (precio BS): línea violeta en $${ctx.data.price.toFixed(2)}, precio teórico de la pata larga K=$${ctx.strike}.`;
    } else if (ctx.method === 'greeks' && Number.isFinite(sigma) && sigma > 0 && Number.isFinite(ctx.strike)) {
      const r = Number(ctx.rate) || 0, q = Number(ctx.dividendYield) || 0;
      const halfSpot = ctx.strike * Math.exp(-(r - q + sigma * sigma / 2) * T);
      overlay.lines.push({ value: halfSpot, label: 'Spot con Δ≈0.5' });
      const delta = ctx.data.greeks?.delta;
      overlay.note = `Método Workbench (griegas): línea violeta en $${halfSpot.toFixed(2)}, nivel de spot donde |Δ|≈0.5 con el horizonte restante al vencimiento; Δ calculado en spot $${spot.toFixed(2)}: ${Number.isFinite(delta) ? delta.toFixed(3) : '—'}.`;
    } else if (ctx.method === 'iv' && Number.isFinite(ctx.data.impliedVolatility) && ctx.data.converged !== false && Number.isFinite(spot)) {
      const iv = ctx.data.impliedVolatility;
      if (iv > 0) {
        const drift = iv * Math.sqrt(T);
        overlay.band = { lower: spot * Math.exp(-drift), upper: spot * Math.exp(drift), label: 'Banda IV ±1σ' };
        overlay.note = `Método Workbench (IV): banda violeta de ±1 desviación anualizada al vencimiento con IV ${(iv * 100).toFixed(1)}% ($${(spot * Math.exp(-drift)).toFixed(2)}–$${(spot * Math.exp(drift)).toFixed(2)}).`;
      }
    }
    return overlay;
  }
  // Señales independientes, niveles de candidata y método del workbench.
  window.__candleOverlaySource = function () {
    if (!window.StrategyTriggers) return null;
    const state = window.__candlesChartState;
    if (!state || !Array.isArray(state.candles) || !state.candles.length) return null;
    const candidate = getSelectedCandidate();
    const method = workbenchMethodOverlay(state);
    const methodDraws = !!(method && (method.lines.length || method.band));
    const matches = candidate && candidate.symbol === state.symbol;
    const overlays = { levels: null, entries: [], exits: [], technicalSignals: [], method: methodDraws ? method : null, note: '' };
    const notes = [];
    if (method && method.note) notes.push(method.note);
    if (candidate && !matches) notes.push('La candidata corresponde a ' + candidate.symbol + ' y la gráfica muestra ' + state.symbol + '.');
    if (state.timeframe !== '1Day') {
      notes.push('Señales desactivadas: solo se calculan con velas 1Day; no se asignan señales diarias a velas intradía u otras temporalidades.');
      overlays.note = notes.join(' ');
      renderSignalTable([], state, overlays.note);
      return overlays;
    }
    if(!$('researchModuleIndicators').checked){
      notes.push('Core de indicadores no seleccionado: se omiten sus señales. Las SMA y los soportes visuales dependen del análisis técnico.');
      overlays.note=notes.join(' ');renderSignalTable([],state,overlays.note);return overlays;
    }
    const today = marketDate(Date.now());
    const closed = state.candles.filter(bar => marketDate(bar.timestamp) < today);
    if (closed.length !== state.candles.length) notes.push('La vela del día bursátil actual se excluye de las señales hasta el día siguiente para asegurar su cierre.');
    if (!technicalCache || technicalCache.state !== state || technicalCache.today !== today) {
      technicalCache = { state, today, signals: window.StrategyTriggers.computeTechnicalSignals(closed, { symbol: state.symbol, timeframe: '1Day' }) };
    }
    const enabled = new Set([...document.querySelectorAll('.technical-indicator:checked')].map(input => input.value));
    if(!$('researchModuleIndicators').checked)enabled.clear();
    const selected = signal => signal.rule === 'sma_cross' ? enabled.has(signal.side === 'bullish' ? 'sma_up' : 'sma_down') : signal.rule === 'rsi_cross' ? enabled.has('rsi') : enabled.has(signal.side === 'bullish' ? 'resistance' : 'support');
    overlays.technicalSignals = technicalCache.signals.filter(selected);
    const all = [...overlays.technicalSignals, ...overlays.entries, ...overlays.exits].sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp) || a.indicator.localeCompare(b.indicator));
    const markerLimit = $('chMarkerLimit').value === 'all' ? all.length : Number($('chMarkerLimit').value);
    overlays.visibleSignals = all.slice(-markerLimit || all.length);
    if (all.length > overlays.visibleSignals.length) notes.push(`Se muestran los ${overlays.visibleSignals.length} marcadores más recientes de ${all.length}; la tabla conserva todas las señales.`);
    notes.push('Confirmación al cierre de cada vela; los cálculos comienzan en la primera vela del rango consultado.');
    overlays.note = notes.join(' ');
    renderSignalTable(all, state, overlays.note);
    return overlays;
  };
  // Fuente de prefill explícito para el Quant Workbench (candidata primero,
  // gráfica cargada como alternativa; nunca llamadas automáticas).
  window.__chartPrefillSource = function () {
    const candidate = getSelectedCandidate();
    if (candidate) {
      const cache = window.__researchMarketCache[candidate.symbol];
      const bsSigma = candidate.blackScholes?.assumptions?.volatility;
      const volatilityPercent = Number.isFinite(bsSigma) ? bsSigma * 100 : (Number.isFinite(cache?.realizedVolatility) ? cache.realizedVolatility : null);
      return {
        symbol: candidate.symbol,
        spot: Number.isFinite(cache?.spot) ? cache.spot : candidate.blackScholes?.assumptions?.spot ?? null,
        strike: candidate.longStrike,
        expiration: candidate.expiration,
        volatility: volatilityPercent,
        source: 'candidata ' + candidate.symbol + ' ' + candidate.strategy.replace('_SPREAD', '').replaceAll('_', ' ') + ' (' + candidate.longStrike + '/' + candidate.shortStrike + ')',
      };
    }
    const state = window.__candlesChartState;
    if (state && Array.isArray(state.candles) && state.candles.length) {
      const cache = window.__researchMarketCache[state.symbol];
      return {
        symbol: state.symbol,
        spot: state.candles.at(-1).close,
        strike: null,
        expiration: null,
        volatility: Number.isFinite(cache?.realizedVolatility) ? cache.realizedVolatility : null,
        source: 'última vela de la gráfica (' + state.symbol + ')',
      };
    }
    return null;
  };
  // ── Aplicar el método del workbench a la tabla comparativa (explícito) ──
  const WB_METHOD_PATH = { prices: 'prices', greeks: 'greeks', iv: 'implied-volatility' };
  const WB_METHOD_LABEL = { prices: 'Precio BS (pata larga)', greeks: 'Delta (pata larga)', iv: 'IV (pata larga)' };
  let workbenchApplicationVersion = 0;
  window.__renderResearchTable = function () { if (currentSnapshot) render(currentSnapshot); };
  window.__applyWorkbenchToTable = async function () {
    const ctx = window.__workbenchContext;
    if (!ctx || !ctx.data || !WB_METHOD_PATH[ctx.method]) return setStatus('Primero calcula un método en Análisis cuantitativo para poder aplicarlo a la tabla.', 'error');
    if (!currentSnapshot) return setStatus('Primero ejecuta un análisis de investigación para tener candidatas en la tabla.', 'error');
    const snapshot=currentSnapshot,version=researchVersion,application=++workbenchApplicationVersion;
    const { rows,filters } = filteredRows(snapshot),filterKey=JSON.stringify(filters);
    if (!rows.length) return setStatus('No hay candidatas visibles tras los filtros; ajusta los filtros y vuelve a intentar.', 'error');
    const stillCurrent=()=>currentSnapshot===snapshot&&researchVersion===version&&workbenchApplicationVersion===application&&window.__workbenchContext===ctx&&JSON.stringify(filteredRows(snapshot).filters)===filterKey;
    const target = rows.slice(0, 20), omitted = rows.length - target.length;
    const values = {}, pending = target.slice();
    let completed = 0;
    setStatus(`Aplicando ${WB_METHOD_LABEL[ctx.method]} a ${target.length} candidata(s) visible(s)…`, 'loading');
    const computeOne = async () => {
      while (pending.length && stillCurrent()) {
        const { candidate: c, index } = pending.shift();
        try {
          const cached = window.__researchMarketCache[c.symbol] || {};
          const spot = Number.isFinite(cached.spot) ? cached.spot : (Number.isFinite(c.blackScholes?.assumptions?.spot) ? c.blackScholes.assumptions.spot : ctx.spot);
          const volatility = Number.isFinite(c.blackScholes?.assumptions?.volatility) ? c.blackScholes.assumptions.volatility : (Number.isFinite(cached.realizedVolatility) ? cached.realizedVolatility / 100 : ctx.volatility);
          const body = { symbol: c.symbol, spot, strike: c.longStrike, expiration: c.expiration || snapshot.expirationDate, rate: ctx.rate, dividendYield: ctx.dividendYield, volatility, optionType: c.optionType, tolerance: 1e-8, maxIterations: 200 };
          if (ctx.method === 'iv') {
            const mid = (Number(c.longBid) + Number(c.longAsk)) / 2;
            if (!Number.isFinite(mid) || mid <= 0) { values[index] = null; completed++; continue; }
            body.marketPrice = mid; body.initialGuess = 0.2;
          }
          const response = await fetch('/api/v1/quant/' + WB_METHOD_PATH[ctx.method], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const data = await response.json().catch(() => ({}));
          const raw = response.ok ? (ctx.method === 'prices' ? data.price : ctx.method === 'greeks' ? data.greeks?.delta : data.impliedVolatility) : null;
          values[index] = Number.isFinite(raw) ? raw : null;
        } catch { values[index] = null; }
        completed++;
      }
    };
    await Promise.all([computeOne(), computeOne(), computeOne()]);
    if(!stillCurrent())return;
    window.__workbenchTableMetrics = { token: ctx.token, method: ctx.method, label: WB_METHOD_LABEL[ctx.method], values };
    render(snapshot);
    setStatus(`${WB_METHOD_LABEL[ctx.method]} aplicado a ${completed} candidata(s)${omitted ? ` (se omitieron ${omitted} por el límite de 20)` : ''}. Métrica informativa del método elegido; no es pronóstico ni recomendación.`, 'info');
  };

  function researchSymbols(){
    if($('researchMode').value==='company')return [$('researchCompany').value.trim().toUpperCase()];
    return [...new Set($('researchSymbols').value.split(/[\s,;]+/).map(symbol=>symbol.trim().toUpperCase()).filter(Boolean))];
  }
  function syncResearchControls(){
    const single=$('researchMode').value==='company',list=$('researchMode').value==='list',custom=list||$('researchUniverse').value==='custom';
    $('researchCompanyField').hidden=!single;$('researchUniverseField').hidden=single||list;
    $('researchSymbols').hidden=single||!custom;document.querySelector('label[for="researchSymbols"]').hidden=single||!custom;
    $('researchTrendFilter').closest('div').hidden=!$('researchModuleTechnical').checked;
    const hasProbability=$('researchModuleTechnical').checked||$('researchModuleMonteCarlo').checked;
    $('researchMinProb').closest('div').hidden=!hasProbability;
    if(!hasProbability)$('researchMinProb').value='0';
    document.querySelector('label[for="researchMinProb"]').textContent=$('researchModuleMonteCarlo').checked?'Prob. Monte Carlo mínima (%)':'Frecuencia histórica mínima (%)';
    $('researchMinProb').setAttribute('aria-label',document.querySelector('label[for="researchMinProb"]').textContent);
    document.querySelectorAll('[data-core-column]').forEach(cell=>{cell.hidden=!readModules()[cell.dataset.coreColumn];});
  }
  document.addEventListener('DOMContentLoaded',()=>{
    syncResearchControls();
    for(const id of ['researchMode','researchUniverse'])$(id).addEventListener('change',()=>{syncResearchControls();invalidateResearchContext();});
    for(const eventName of ['input','change'])$('researchCompany').addEventListener(eventName,()=>{if(currentSnapshot||running)invalidateResearchContext();});
    document.querySelectorAll('.research-module-options input').forEach(input=>input.addEventListener('change',()=>{syncResearchControls();if(typeof refreshChartOverlays==='function')refreshChartOverlays();}));

    $('btnResearchShowAll').addEventListener('click',()=>{if(currentSnapshot){showAllRankedCompanies=!showAllRankedCompanies;render(currentSnapshot);}});
    $('btnResearchCancel').addEventListener('click',()=>{invalidateResearchContext(false);setStatus('Análisis cancelado. No se publica un ranking incompleto.','info');});
    $('btnResearchAnalyze').addEventListener('click',runAnalysis);$('btnResearchSave').addEventListener('click',saveJournal);$('btnResearchHistory').addEventListener('click',loadJournal);
    $('researchNewsFilter').addEventListener('change',()=>{if(currentSnapshot)render(currentSnapshot);});
    for(const id of ['researchMinProb','researchMinRR','researchMaxSpread','researchTrendFilter','researchMaxLoss','researchStrategyFilter'])for(const event of ['input','change'])$(id).addEventListener(event,()=>{if(currentSnapshot?.screening){invalidateResearchContext(false);setStatus('Cambiaste filtros del recorrido completo. Vuelve a analizar el S&P 500 con estos filtros.','info');}else if(currentSnapshot)render(currentSnapshot);});
    for(const id of ['researchModuleTechnical','researchModuleIndicators','researchModuleAi','researchModuleMonteCarlo','researchModuleFinancial','researchModuleStatements','researchModuleMovers','researchModuleNews'])$(id).addEventListener('change',()=>{if(currentSnapshot||running)invalidateResearchContext();});
    for(const id of ['researchSymbols','expiration'])for(const eventName of ['input','change'])$(id).addEventListener(eventName,()=>{if(currentSnapshot||running)invalidateResearchContext();});
    for(const id of ['symbol','chSymbol'])$(id).addEventListener('change',()=>{if(currentSnapshot||running)invalidateResearchContext();});
    for(const id of ['symbol','chSymbol','researchCompany'])$(id).addEventListener('input',event=>{const start=event.target.selectionStart;event.target.value=event.target.value.toUpperCase();if(start!==null)event.target.setSelectionRange(start,start);});
    $('chSymbol').addEventListener('change',()=>{if($('researchSymbols').value.trim()==='AAPL')$('researchSymbols').value=$('chSymbol').value;});
    $('researchCandidates').addEventListener('click',async event=>{
      const prepare=event.target.closest('[data-prepare-candidate]');
      if(prepare){const snapshot=currentSnapshot,candidate=snapshot?.candidates[Number(prepare.dataset.prepareCandidate)];if(!candidate)return;prepare.disabled=true;
        try{const verified=await evaluateCandidate(candidate);if(snapshot!==currentSnapshot)throw new Error('Cambió el análisis. Vuelve a seleccionar una sugerencia.');if(verified.status!=='verified')throw new Error(verified.issues.join(' '));await window.prepareResearchOperation(candidate,snapshot.underlyings.find(item=>item.symbol===candidate.symbol)?.spot);}catch(error){setStatus('No se pudo preparar: '+error.message,'error');}finally{prepare.disabled=false;}return;}
      const tr=event.target.closest('tr[data-candidate]');if(tr)selectCandidate(Number(tr.dataset.candidate));
      if(event.target.closest('[data-explain-candidate]')){
        const panel=$('researchCandidateExplanation');
        if(!panel.hidden){
          panel.querySelector('details').open=true;
          panel.tabIndex=-1;panel.focus({preventScroll:true});
          panel.scrollIntoView?.({block:'start',behavior:'auto'});
        }
      }
    });
    $('researchComparison').addEventListener('toggle',()=>{if(!$('researchComparison').open){comparisonVersion++;return;}if(currentSnapshot)renderStrategyComparison(currentSnapshot,filteredRows(currentSnapshot).rows);});
    $('researchCompareSymbol').addEventListener('change',()=>{if(!currentSnapshot)return;const candidate=getSelectedCandidate();if(candidate&&candidate.symbol!==$('researchCompareSymbol').value)selectCandidate(null);if($('researchComparison').open)renderStrategyComparison(currentSnapshot,filteredRows(currentSnapshot).rows);});
    // A checked technical layer must never silently remain blocked by an unchecked core.
    const technicalCore=$('researchModuleTechnical');
    const technicalControls=[...document.querySelectorAll('.chart-layer-toggle:not(#chShowLastPrice)')];
    function syncTechnicalControls(){
      if(!technicalCore.checked)technicalControls.forEach(input=>{input.checked=false;});
      $('chartTechnicalStatus').textContent=technicalCore.checked?'Análisis técnico activo: SMA y soportes seleccionados visibles con datos suficientes. Las señales tienen su propio core de indicadores.':'Core técnico desactivado. Selecciona un indicador para activarlo; el último cierre funciona por separado.';
    }
    technicalCore.addEventListener('change',()=>{syncTechnicalControls();refreshChartOverlays();});
    technicalControls.forEach(input=>input.addEventListener('change',()=>{
      if(input.checked&&!technicalCore.checked){
        technicalCore.checked=true;
        // Reuse the same invalidation path as the core checkbox. No broker action.
        technicalCore.dispatchEvent(new Event('change',{bubbles:true}));
        $('chartTechnicalStatus').textContent='Se activó el core técnico al seleccionar este indicador. Si ya tenías resultados, vuelve a analizar para actualizar la comparación.';
      }
      refreshChartOverlays();
    }));
    const indicatorsCore=$('researchModuleIndicators'),signalControls=[...document.querySelectorAll('.technical-indicator')];
    const syncSignals=()=>{if(!indicatorsCore.checked)signalControls.forEach(input=>{input.checked=false;});refreshChartOverlays();};
    indicatorsCore.addEventListener('change',syncSignals);
    signalControls.forEach(input=>input.addEventListener('change',()=>{if(input.checked&&!indicatorsCore.checked){indicatorsCore.checked=true;indicatorsCore.dispatchEvent(new Event('change',{bubbles:true}));}refreshChartOverlays();}));
    if(!indicatorsCore.checked)signalControls.forEach(input=>{input.checked=false;});
    $('chShowLastPrice').addEventListener('change',()=>refreshChartOverlays());
    syncTechnicalControls();
    $('chMarkerLimit').addEventListener('change',()=>refreshChartOverlays());
    $('chSignalDate').addEventListener('change',()=>refreshChartOverlays());
    $('btnClearSignalDate').addEventListener('click',()=>{$('chSignalDate').value='';refreshChartOverlays();});
  },{once:true});
})();
