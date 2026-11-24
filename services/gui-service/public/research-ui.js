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
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>Number.isFinite(value)?'$'+value.toFixed(2):'—';
  const moneyCompact=value=>Number.isFinite(value)?new Intl.NumberFormat('es-MX',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(value):'—';
  const pct=value=>Number.isFinite(value)?(value*100).toFixed(1)+'%':'Insuficientes';
  const percentPoints=value=>Number.isFinite(value)?(value>0?'+':'')+value.toFixed(2)+'%':'—';
  const yearsToExpiration=expiration=>{const ms=Date.parse(expiration+'T00:00:00Z')-Date.now();return Number.isFinite(ms)&&ms>0?ms/31536000000:null;};
  const fmtWorkbenchMetric=(method,value)=>method==='prices'?money(value):method==='greeks'?value.toFixed(3):method==='iv'?(value*100).toFixed(1)+'%':String(value);
  const setStatus=(text,state='')=>{$('researchStatus').textContent=text;$('researchStatus').dataset.state=state;};
  const readModules=()=>({technical:$('researchModuleTechnical').checked,blackScholes:$('researchModuleBlackScholes').checked,financial:$('researchModuleFinancial').checked,movers:$('researchModuleMovers').checked,news:$('researchModuleNews').checked});
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
    const end=new Date(),start=new Date(end);start.setUTCDate(start.getUTCDate()-370);
    const params=new URLSearchParams({symbol,timeframe:'1Day',start:start.toISOString(),end:end.toISOString(),limit:'1000',sort:'asc'});
    const [barsData,quote,calls,puts]=await Promise.all([
      (modules.technical||modules.blackScholes||modules.movers?json('/api/v1/broker/candles?'+params):Promise.resolve({bars:[],complete:true})),json('/api/v1/broker/quotes?symbol='+encodeURIComponent(symbol)).catch(()=>({})),allContracts(symbol,expiration,'call'),allContracts(symbol,expiration,'put')
    ]);
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
    const candidates=ResearchAnalysis.compareStrategies(contracts,{symbol,expiration,spot,bars,includeTechnical:modules.technical,includeBlackScholes:modules.blackScholes,riskFreeRate,dividendYield}).map(candidate=>window.StrategyExplanation.attachEvidence(candidate,contracts,underlying));
    return {symbol,spot,spotSource,spotTimestamp,spotSymbol,capturedAt:barsData.capturedAt,stockFeed:barsData.feed||'iex',dailyChangePct:changePct,dailyClose:last?.close??null,previousClose:previous?.close??null,dailyTimestamp:last?.timestamp??null,technical,supportResistance:levels,candidates};
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
  function renderFinancialAndMovers(snapshot){
    const modules=snapshot.modules,fundamentals=snapshot.fundamentals;
    $('researchFinancialPanel').hidden=!modules.financial;
    if(modules.financial){
      const status=$('researchFinancialStatus'),host=$('researchFinancialRows');
      if(!fundamentals){status.textContent='Se consultan métricas fundamentales en FMP cuando FMP_API_KEY está configurada en el servidor.';host.innerHTML='';}
      else if(fundamentals.status!=='available'){status.textContent=fundamentals.error||'FMP no devolvió fundamentales para estos tickers.';host.innerHTML=fundamentals.rows.map(row=>`<article class="research-financial-row"><strong>${esc(row.symbol)}</strong> · ${esc(row.error||'Sin datos para mostrar.')}</article>`).join('');}
      else {status.textContent=`Fuente: ${fundamentals.provider} · Consulta ${new Date(fundamentals.capturedAt).toLocaleString('es-MX')}. El core fundamental participa solo si está seleccionado; no modifica probabilidades.`;host.innerHTML=fundamentals.rows.map(row=>{if(row.status!=='available')return `<article class="research-financial-row"><strong>${esc(row.symbol)}</strong> · ${esc(row.error||'Sin datos para mostrar.')}</article>`;const m=row.metrics||{},fundamentalScore=row.fundamentalScore,scoreBlock=fundamentalScore?.status==='available'?`<p><strong>Score fundamental: ${fundamentalScore.score.toFixed(1)}/100</strong> · Más alto significa que los datos disponibles se acercan más a los rangos favorecidos por la heurística. Cobertura ${fundamentalScore.coverage}%.</p><details><summary>¿Qué significa este score?</summary><p>Promedio ponderado de crecimiento, rentabilidad, deuda, liquidez y valoración. Cada componente se transforma a 0–100 dentro de rangos generales. La cobertura del score indica qué parte de los pesos de sus ocho indicadores tuvo datos; es distinta del número de métricas mostradas. Capitalización y FCF son contexto y no puntúan. No compara con el sector y no predice el precio.</p><p>${fundamentalScore.components.map(component=>`${esc(component.label)} (${component.weight}% del score): ${component.score===null?'sin dato':component.score.toFixed(0)+'/100'}`).join(' · ')}</p><p>Umbrales usados: crecimiento −20% a +20%; ROE −10% a +30%; margen neto −20% a +20%; deuda/capital 0 a 3 (menor deuda suma más); razón corriente 0.5 a 2; P/E 5 a 40 (menor múltiplo suma más dentro del rango); P/B 1 a 10 (menor múltiplo suma más dentro del rango). Fuera del rango se limita a 0 o 100. Cobertura menor al 50% no produce score.</p></details>`: `<p><strong>Score fundamental no disponible</strong> · Cobertura ${fundamentalScore?.coverage??0}% (mínimo 50%).</p>`,defs=[['Capitalización',m.marketCap===null?'—':moneyCompact(m.marketCap),'Tamaño de mercado de la empresa.'],['P/E',m.pe===null?'—':m.pe.toFixed(2),'Precio frente a ganancias; alto puede significar caro o expectativas de crecimiento.'],['P/B',m.pb===null?'—':m.pb.toFixed(2),'Precio frente al valor contable por acción.'],['ROE',m.roe===null?'—':percentPoints(m.roe*100),'Ganancia generada por cada peso de capital; normalmente más alto es mejor.'],['Margen neto',m.netMargin===null?'—':percentPoints(m.netMargin*100),'Parte de los ingresos que queda como utilidad; normalmente más alto es mejor.'],['Deuda/capital',m.debtEquity===null?'—':m.debtEquity.toFixed(2),'Deuda respecto al capital; valores altos suelen implicar más apalancamiento.'],['Razón corriente',m.currentRatio===null?'—':m.currentRatio.toFixed(2),'Activos disponibles para cubrir obligaciones de corto plazo.'],['Crec. ingresos anual',m.revenueGrowth===null?'—':percentPoints(m.revenueGrowth),'Cambio de ventas frente al año previo.'],['Crec. utilidad anual',m.netIncomeGrowth===null?'—':percentPoints(m.netIncomeGrowth),'Cambio de ganancias frente al año previo.'],['FCF por acción',m.freeCashFlowPerShare===null?'—':money(m.freeCashFlowPerShare),'Efectivo libre generado, dividido entre acciones.']];return `<article class="research-financial-row"><strong>${esc(row.companyName||row.symbol)} (${esc(row.symbol)})</strong>${row.coverage?' · Cobertura '+esc(row.coverage):''}${row.warnings?.length?'<p>'+esc(row.warnings.join(' '))+'</p>':''}${row.period?' · '+esc(row.period):''}${row.dataDate?' · Datos al '+esc(row.dataDate):''}${scoreBlock}<details><summary>Ver métricas e interpretación</summary>${defs.filter(([,v])=>v!=='—').map(([n,v,meaning])=>`<p><strong>${esc(n)}: ${esc(v)}</strong> · ${esc(meaning)}</p>`).join('')||'FMP no devolvió métricas reconocidas para este periodo.'}</details></article>`;}).join('');}
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
  function renderSummary(snapshot){
    const modules=snapshot.modules,selected=[];
    if(modules.technical)selected.push('Técnico');if(modules.blackScholes)selected.push('Black‑Scholes');if(modules.financial)selected.push('Fundamentales');if(modules.movers)selected.push('Ganadores/perdedores entre tickers elegidos');if(modules.news)selected.push('Noticias Alpaca');
    $('researchCoreModules').textContent=selected.join(' · ')||'Solo opciones e histórico';
    const items=[`Comparé ${snapshot.underlyings.map(item=>item.symbol).join(', ')} para vencimiento ${snapshot.expirationDate} con cotizaciones de opciones Alpaca.`,snapshot.screening?`Se intentaron todas las ${snapshot.screening.universeCount} empresas del S&P 500; ${snapshot.screening.evaluatedCount} tuvieron datos para evaluar opciones y ${snapshot.screening.failedCount} fallaron. Se conservó la mejor combinación de cada estrategia por empresa que cumplió los filtros. Fuente del universo: ${snapshot.screening.provider}. El orden corresponde al vencimiento y filtros elegidos, no a todos los vencimientos posibles.`:'El universo comparado proviene de la lista manual ingresada.','El orden usa exclusivamente los cores de puntuación seleccionados; noticias es contexto y no puntúa.'];
    if(modules.technical)for(const item of snapshot.underlyings)items.push(`${item.symbol}: tendencia ${item.technical?.trend||'sin datos'}.`);
    if(modules.blackScholes)items.push('Black‑Scholes estima una probabilidad risk‑neutral independiente usando volatilidad realizada histórica como proxy, no IV de opciones.');
    if(modules.financial)items.push(snapshot.fundamentals?.status==='available'?snapshot.fundamentals.rows.filter(row=>row.status==='available').map(row=>row.fundamentalScore?.status==='available'?`${row.symbol}: score fundamental ${row.fundamentalScore.score.toFixed(1)}/100; aporta al promedio de cores seleccionados.`:`${row.symbol}: score fundamental no disponible por cobertura insuficiente.`).join(' '):snapshot.fundamentals?.error||'No hay fundamentales disponibles desde FMP.');
    if(modules.movers)items.push(snapshot.movers?.status==='available'?'Ganadores/perdedores compara el cambio entre el cierre anterior y el cierre diario más reciente. Es una descripción del movimiento, no su causa ni una predicción.':'No hay cambio diario disponible para comparar los tickers elegidos.');
    if(modules.news)items.push(snapshot.news.status==='available'?`${snapshot.news.articles.length} noticias recientes consultadas en Alpaca.`:'Noticias Alpaca no disponibles: '+(snapshot.news.error||'sin resultados.'));
    items.push('Puntuación de 0 a 100: promedio de los cores elegidos con datos disponibles. Si falta uno, no se asigna puntuación. No es una probabilidad de rentabilidad.');
    $('researchCoreSummary').innerHTML=`<ul class="research-summary-list">${items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`;
  }
  // Índices originales compartidos por tabla, explicaciones y método cuantitativo.
  function filteredRows(snapshot){
    const minP=Number($('researchMinProb').value)/100,minRR=Number($('researchMinRR').value),maxSpread=Number($('researchMaxSpread').value),trendFilter=snapshot.modules.technical?$('researchTrendFilter').value:'all';
    const mode=$('researchMode').value,company=$('researchCompany').value.trim().toUpperCase(),strategy=$('researchStrategyFilter').value,maxLoss=$('researchMaxLoss').value===''?Infinity:Number($('researchMaxLoss').value);
    const probabilityFor=c=>snapshot.modules.blackScholes?c.blackScholes?.probability:snapshot.modules.technical?c.probability?.probability:null;
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
    const trendText=!snapshot.modules.technical?'Análisis técnico no seleccionado; el score usa factor 1.':trend==='insufficient_data'?'No hay suficientes datos para determinar la tendencia o el factor técnico.':trend==='mixed'?'La tendencia es mixta; el factor técnico es neutral.':aligned?'La tendencia calculada está alineada con la dirección de la estrategia.':'La tendencia calculada es contraria a la dirección de la estrategia.';
    const spotTime=evidenceDate(underlying?.spotTimestamp),spotSource=underlying?.spotSource||'No disponible';
    const spotWarning=!underlying?.spotSymbol?'El proveedor no identificó el ticker de la referencia.':underlying.spotSymbol!==candidate.symbol?`La referencia identificó ${underlying.spotSymbol}, distinto del ticker de la candidata.`:'';
    const timeMs=Date.parse(underlying?.spotTimestamp),ageWarning=!Number.isFinite(timeMs)?'La referencia del subyacente no tiene fecha verificable.':Date.now()-timeMs>72*3600000||timeMs>Date.now()+60000?'La referencia del subyacente está desactualizada o tiene una fecha futura.':'';
    const t=underlying?.technical;
    const historical=candidate.probability;
    const bs=candidate.blackScholes;
    const bsInfo=!snapshot.modules.blackScholes?'Black-Scholes no seleccionado.':Number.isFinite(bs?.probability)?`Valor risk-neutral existente ${pct(bs.probability)}; CDF normal estándar verificada; aporta al ranking si se selecciona este core. Volatilidad realizada proxy ${pct(bs.assumptions?.volatility)}, horizonte ${evidenceNumber(bs.assumptions?.timeToMaturityYears)} años, tasa ${evidenceNumber(bs.assumptions?.rate)}, dividendos ${evidenceNumber(bs.assumptions?.dividendYield)}.`:`Black-Scholes no disponible: ${bs?.reason||'faltan datos'}. No se le asigna puntuación cuando falta información.`;
    const technicalContext=t?`SMA20 ${evidenceNumber(t.sma20)}, SMA50 ${evidenceNumber(t.sma50)}, RSI14 ${evidenceNumber(t.rsi14)}, ATR14 ${evidenceNumber(t.atr14)}. RSI y ATR son contexto, no factores directos del score.`:'Indicadores técnicos no disponibles o no seleccionados.';
    const fundamental=snapshot.modules.financial?(Number.isFinite(candidate.fundamentalScore)?`El score fundamental ${evidenceNumber(candidate.fundamentalScore)} aportó ${evidenceNumber(candidate.fundamentalScore)}/100 al promedio de cores.`:'Fundamentales sin cobertura suficiente; la candidata no recibe puntuación.'):'Fundamentales no seleccionados; factor de ranking 1.';
    const news=snapshot.modules.news?`Noticias: ${snapshot.news?.status||'No disponible'}; son contexto y no modifican el score.`:'Noticias no seleccionadas; no modifican el score.';
    const result=verified?.status==='verified'?verified.evaluation:null;
    const pendingValue=verified&&verified.status!=='verified'?'No disponible: candidata no verificada':'Pendiente de verificar';
    const payoff=result?(result.riskRewardRatio<1?'La pérdida máxima supera al beneficio máximo.':result.riskRewardRatio>1?'El beneficio máximo supera a la pérdida máxima.':'Beneficio y pérdida máximos son iguales.'):(verified?'La relación entre beneficio y pérdida no se pudo verificar.':'La relación entre beneficio y pérdida está pendiente de verificación.');
    const history=Number.isFinite(historical?.probability)?(historical.probability<.5?'Menos de la mitad de las ventanas históricas evaluadas alcanzaron el criterio de equilibrio.':'Al menos la mitad de las ventanas históricas evaluadas alcanzaron el criterio de equilibrio.'):'No hay muestra histórica suficiente para evaluar la frecuencia.';
    const outcome=result?`Al vencimiento, la ganancia máxima corresponde a un subyacente ${candidate.side==='bullish'?'igual o superior':'igual o inferior'} al strike corto ${evidenceNumber(candidate.shortStrike)}; un movimiento contrario puede alcanzar la pérdida máxima.`:'Las condiciones de ganancia y pérdida requieren validar primero las patas y los resultados con Quant.';
    return `${evidenceList([['Empresa y ticker',companyName(candidate.symbol)],['Subyacente de referencia',money(underlying?.spot)],['Fuente y fecha',`${spotSource} · ${spotTime}`],['Vencimiento',candidate.expiration],['Estrategia',strategyLabel(candidate.strategy)],['Dirección',candidate.side==='bullish'?'Alcista':'Bajista'],['Contratos',`${candidate.longSymbol||'No disponible'} / ${candidate.shortSymbol||'No disponible'}`],...(snapshot.modules.technical?[['Tendencia',trend]]:[]),['Prima neta total',result?money(result.spreadCategory==='debit'?result.netDebit:result.netCredit):pendingValue],['Beneficio máximo',result?money(result.maxProfit):pendingValue],['Pérdida máxima',result?money(result.maxLoss):pendingValue],['Break-even (USD/acción)',result?evidenceNumber(result.breakEven):pendingValue],['Ganancia / riesgo',result?evidenceNumber(result.riskRewardRatio):pendingValue],...(snapshot.modules.technical?[['Probabilidad histórica',`${pct(historical?.probability)} · ${historical?.sampleSize??'No disponible'} muestras`]]:[])])}
      <p>${snapshot.modules.technical?esc(trendText+" "+technicalContext):""}</p><p>${snapshot.modules.blackScholes?esc(bsInfo):""}</p><p>${snapshot.modules.financial?esc(fundamental):""} ${snapshot.modules.news?esc(news):""}</p>
      <p>${esc(outcome)} No se incluyen comisiones, deslizamiento ni garantías de ejecución.</p>
      <p>${esc(payoff)} ${snapshot.modules.technical?esc(history)+" La frecuencia histórica no es un pronóstico calibrado.":""} Las griegas de las patas y del spread no se calcularon en este ranking. ${esc(spotWarning)} ${esc(ageWarning)}</p>
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
      <p>${lower?`La pata ${esc(lower)} tiene el strike menor; `:'No se pudo comprobar el orden de los strikes; '}se compra al Ask y se vende al Bid. La cantidad mostrada corresponde a una unidad de spread del ranking, no a una orden ejecutada. El ranking revisa pares de la misma empresa, vencimiento y tipo, strikes dentro del 30% del spot, cotizaciones positivas sin cruce y hasta 72 horas de antigüedad; exige prima positiva menor que el ancho. Enumera pares, calcula el score y conserva hasta 20 candidatas por ticker.</p>
      <p>Esta combinación aparece por su posición en ese ranking y los filtros visibles; no se eligió por Delta, Gamma, volumen o interés abierto. La suma de diferenciales relativos Bid/Ask sí penaliza el score. El selector automático del formulario es distinto: usa pares consecutivos y prioriza cercanía al spot, punto medio y ancho.</p><p>${esc(comparison)}</p>
      <p>La distancia entre strikes es el ancho del spread. Si la prima se mantiene constante, un ancho mayor aumenta el beneficio máximo de un débito mientras su pérdida máxima sigue siendo el débito; en un crédito aumenta la pérdida máxima mientras su beneficio máximo sigue siendo el crédito. Los límites concretos se muestran en la evaluación de Quant.</p>`;
  }
  function candidateScore(candidate,snapshot,rows,filters){
    const components=Object.entries(candidate.scoreComponents||{}).map(([key,value])=>[window.ResearchRanking.labels[key],Number.isFinite(value)?value.toFixed(2)+'/100':'Sin datos']);
    return '<p>Puntuación = promedio simple de los cores de puntuación seleccionados. Cada uno pesa lo mismo. Noticias es contexto, no aporta puntuación.</p>'+evidenceList([['Puntuación',Number.isFinite(candidate.score)?candidate.score.toFixed(2)+'/100':'No clasificable'],...components])+`<p>${candidate.scoreMissing?.length?'Faltan datos de: '+esc(candidate.scoreMissing.join(', ')):Object.keys(candidate.scoreComponents||{}).length?'Todos los cores elegidos tienen datos.':'Selecciona al menos un core de puntuación para ordenar.'}</p><p>${snapshot.modules.technical?'Técnico: alineación de tendencia 100, mixta 50, contraria 0. ':''}${snapshot.modules.blackScholes?'Black-Scholes: estimación risk-neutral × 100. ':''}${snapshot.modules.financial?'Fundamental: score de métricas FMP. ':''}${snapshot.modules.movers?'Movimiento: 50 + variación diaria alineada × 5, limitado a 0–100. ':''}</p><p>Desempates: mayor ganancia/riesgo y menor diferencial Bid/Ask; después ticker, estrategia y strikes. Los filtros se aplican antes del top. Es una clasificación heurística, no una garantía de ganancia.</p>`;
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
    renderSummary(snapshot);renderTechnical(snapshot);renderFinancialAndMovers(snapshot);
    const news=snapshot.news,newsPanel=$('researchNewsPanel');newsPanel.hidden=!snapshot.modules.news;
    if(snapshot.modules.news){
      $('researchNewsStatus').textContent=news.status==='available'?`${news.articles.length} artículo(s) consultados para ${snapshot.underlyings.map(x=>x.symbol).join(', ')} · Captura ${new Date(news.capturedAt).toLocaleString('es-MX')}.`:`No se pudieron consultar noticias de Alpaca: ${news.error||'error no especificado'}.`;
      const articleUrl=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}};
      $('researchNews').innerHTML=news.status==='available'&&news.articles.length?news.articles.slice(0,20).map(item=>{const url=articleUrl(item.url),date=item.created_at||item.updated_at,source=item.source||item.author||'Fuente no indicada',assessment=assessNews(item);return `<article class="research-news-item"><strong>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(item.headline||'Artículo sin titular')}</a>`:esc(item.headline||'Artículo sin titular')}</strong><div class="research-news-meta">${esc(source)} · ${esc(date?new Date(date).toLocaleString('es-MX'):'Fecha no indicada')} · ${(item.symbols||[]).map(esc).join(', ')}</div><p class="research-news-summary"><strong>${esc(assessment.label)}.</strong> ${esc(assessment.explanation)} Lectura automática por palabras clave, no confirma que la noticia haya causado un movimiento en el precio.</p>${item.summary?`<p class="research-news-summary">${esc(item.summary)}</p>`:''}</article>`;}).join(''):'<p class="research-panel-description">No hay artículos disponibles para los tickers y periodo consultados.</p>';
    }
    const filtered=filteredRows(snapshot),filters=filtered.filters;
    const allRows=filtered.rows,mode=$('researchMode').value,perCompany=new Map();
    const rows=mode==='top'?window.ResearchRanking.topCompanies(allRows):mode==='list'?allRows.filter(({candidate})=>{const count=perCompany.get(candidate.symbol)||0;perCompany.set(candidate.symbol,count+1);return count<25;}):allRows.slice(0,100);
    const wbMetrics=window.__workbenchTableMetrics,wbCtx=window.__workbenchContext;
    const wbActive=!!(wbMetrics&&wbCtx&&wbMetrics.token===wbCtx.token);
    const wbHead=$('researchMethodHead');
    wbHead.hidden=!wbActive;if(wbActive)wbHead.textContent=wbMetrics.label;
    const wbCell=index=>!wbActive?'':!Number.isFinite(wbMetrics.values[index])?'<td>—</td>':`<td title="${esc(wbMetrics.label+' calculada con el método del Quant Workbench. Métrica informativa; no es pronóstico ni recomendación.')}">${esc(fmtWorkbenchMetric(wbMetrics.method,wbMetrics.values[index]))}</td>`;
    $('researchCandidates').innerHTML=rows.map(({candidate:c,index},position)=>{const bsLabel=!snapshot.modules.blackScholes?'No incluido':c.blackScholes?.probability===null?(c.blackScholes?.reason==='insufficient_realized_volatility'?'Sin vol. histórica':'Sin datos'):pct(c.blackScholes.probability),bsTitle=c.blackScholes?.assumptions?`Vol. realizada ${(c.blackScholes.assumptions.volatility*100).toFixed(1)}% · ${c.blackScholes.assumptions.volatilitySampleBars} velas · r ${(c.blackScholes.assumptions.rate*100).toFixed(2)}% · CDF normal estándar verificada`:`${c.blackScholes?.reason||''}`,scoreTitle=c.scoreMissing?.length?'Sin puntuación: faltan '+c.scoreMissing.join(', '):'Promedio de los cores seleccionados (0–100); no es probabilidad de ganancia';return `<tr data-candidate="${index}" title="Selecciona para ver señales, niveles y explicación"><td>${Number.isFinite(c.score)?position+1:"—"}</td><td>${esc(c.symbol)}</td><td>${esc(c.strategy.replace('_SPREAD','').replaceAll('_',' '))}</td><td data-core-column="technical">${esc(c.technicalTrend||'Sin datos')}</td><td>${esc(c.longStrike)} / ${esc(c.shortStrike)}</td><td>${money(c.maxProfit)}</td><td>${money(c.maxLoss)}</td><td>${money(c.breakEven)}</td><td data-core-column="technical">${pct(c.probability.probability)}</td><td data-core-column="blackScholes" title="${esc(bsTitle)}">${esc(bsLabel)}</td><td data-core-column="technical">${c.probability.interval?`${pct(c.probability.interval.lower)}–${pct(c.probability.interval.upper)}`:'—'}</td><td data-core-column="technical">${c.probability.sampleSize}</td><td title="${esc(scoreTitle)}">${Number.isFinite(c.score)?c.score.toFixed(3):'—'}</td><td>${esc(new Date(c.longQuoteTimestamp).toLocaleString('es-MX'))}<br>${esc(new Date(c.shortQuoteTimestamp).toLocaleString('es-MX'))}</td><td><button type="button" class="btn btn-primary" data-prepare-candidate="${index}">Preparar operación</button> <button type="button" class="btn btn-secondary strategy-explain-button" data-explain-candidate="${index}">Ver explicación</button></td>${wbCell(index)}</tr>`;}).join('')||`<tr><td colspan="${wbActive?16:15}">No hay candidatas que cumplan los filtros seleccionados.</td></tr>`;
    document.querySelectorAll('[data-core-column]').forEach(cell=>{cell.hidden=!snapshot.modules[cell.dataset.coreColumn];});
    $('researchRankingStatus').textContent=$('researchMode').value==='top'?`${rows.length} empresas clasificadas, con una estrategia por empresa, después de filtrar ${allRows.length} pares. Sin datos completos en un core seleccionado no se asigna posición.`:`${rows.length} de ${allRows.length} operaciones que cumplen los filtros para ${$('researchMode').value==='list'?snapshot.underlyings.map(item=>item.symbol).join(', '):$('researchCompany').value}${$('researchMode').value==='list'?' (hasta 25 por empresa)':''}. Orden: cores seleccionados, ganancia/riesgo y diferencial.`;
    $('researchEvidence').hidden=false;
    snapshot.filters=filters;
    $('researchBsCaveat').hidden=!snapshot.modules.blackScholes;
    syncComparisonSymbols(snapshot);
    if(selectedCandidateIndex!==null&&!rows.some(row=>row.index===selectedCandidateIndex))selectCandidate(null);
    else {
      if(selectedCandidateIndex!==null)document.querySelector(`#researchCandidates tr[data-candidate="${selectedCandidateIndex}"]`)?.classList.add('is-selected');
      renderCandidateExplanation(snapshot,rows,filters);
    }
    if($('researchComparison').open)renderStrategyComparison(snapshot,allRows);
  }
  function invalidateResearchContext(showMessage=true){
    researchVersion++;selectionVersion++;comparisonVersion++;analysisController?.abort();
    currentSnapshot=null;selectedCandidateIndex=null;modulesDirty=false;
    window.__researchMarketCache={};window.__workbenchTableMetrics=null;
    $('researchEvidence').hidden=true;$('researchCandidateExplanation').hidden=true;
    $('researchCandidates').innerHTML='';$('researchCompareResults').innerHTML='';
    $('chTriggerStrategy').innerHTML='<option value="">— Ninguna seleccionada —</option>';
    updateCandidateStatus();
    if(typeof refreshChartOverlays==='function')refreshChartOverlays();
    if(showMessage)setStatus('Cambió la empresa, el vencimiento o los módulos. Vuelve a analizar para actualizar las explicaciones.','info');
  }
  async function runAnalysis(){
    if(running)return;const expiration=$('expiration').value.trim(),modules=readModules();
    let symbols=researchSymbols();
    if(!Object.values(modules).some(Boolean))return setStatus('Selecciona al menos un módulo para incluir en el análisis.','error');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(expiration)||Date.parse(expiration+'T00:00:00Z')<=Date.now())return setStatus('Selecciona un vencimiento futuro válido.','error');
    const useSp500=$('researchMode').value==='top'&&$('researchUniverse').value==='sp500';
    if(!useSp500&&(!symbols.length||symbols.length>10||symbols.some(s=>!/^[A-Z0-9.-]{1,12}$/.test(s))))return setStatus('Ingresa de 1 a 10 tickers válidos, separados por coma, espacio o punto y coma, o selecciona el S&P 500.','error');
    invalidateResearchContext(false);const version=researchVersion;
    const btn=$('btnResearchAnalyze');analysisController=new AbortController();$('btnResearchCancel').hidden=false;running=true;btn.disabled=true;btn.textContent='Consultando mercado…';$('researchEvidence').hidden=true;
    try{
      let screening=null;
      if(useSp500){setStatus('Obteniendo todas las empresas del S&P 500…','loading');screening=await scanSp500();symbols=screening.symbols;}
      if(version!==researchVersion)return;
      if(!symbols.length||symbols.length>(useSp500?600:10)||symbols.some(s=>!/^[A-Z0-9.-]{1,12}$/.test(s)))throw new Error('El análisis de opciones necesita de 1 a 10 tickers válidos.');
      const rate=Number($('qwRate')?.value),dividend=Number($('qwDividend')?.value),riskFreeRate=Number.isFinite(rate)?rate:.05,dividendYield=Number.isFinite(dividend)?dividend:0;
      const underlyings=[],failures=[],fundamentalRows=[];let completed=0,empty=0;
      async function getFundamentals(list){
        const parts=[];for(let i=0;i<list.length;i+=3){if(version!==researchVersion)return[];parts.push(await json('/api/research/fundamentals?symbols='+encodeURIComponent(list.slice(i,i+3).join(','))));}
        return parts.flatMap(part=>part.rows||[]).map(row=>row.status==='available'?{...row,fundamentalScore:ResearchAnalysis.scoreFundamentals(row.metrics)}:row);
      }
      for(const symbol of symbols){
        if(version!==researchVersion)return;
        setStatus(`Evaluando opciones ${completed+1}/${symbols.length}: ${symbol}. ${failures.length} errores; ${empty} sin pares válidos. Puedes cancelar.`,'loading');
        try{
          const item=await analyzeSymbol(symbol,expiration,modules,riskFreeRate,dividendYield,version);
          if(useSp500){
            const rows=modules.financial?await getFundamentals([symbol]):[];fundamentalRows.push(...rows);
            if(!screening.changes.some(row=>row.symbol===symbol)&&Number.isFinite(item.dailyChangePct))screening.changes.push({symbol,changePct:item.dailyChangePct,latestClose:item.dailyClose,previousClose:item.previousClose,timestamp:item.dailyTimestamp});
            const ranked=ResearchRanking.rank(item.candidates,modules,{fundamentals:rows,changes:screening.changes});
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
        const articles=new Map();for(let i=0;i<underlyings.length;i+=20){if(version!==researchVersion)return;const part=await fetchNews(underlyings.slice(i,i+20).map(x=>x.symbol));for(const article of part.articles)articles.set(article.id||article.url,article);}
        news={status:'available',provider:'Alpaca',capturedAt:new Date().toISOString(),articles:[...articles.values()]};
      }catch(error){news={status:'unavailable',provider:'Alpaca',capturedAt:new Date().toISOString(),articles:[],error:error.message};}
      let fundamentals=null;
      if(modules.financial)try{const rows=useSp500?fundamentalRows:await getFundamentals(underlyings.map(x=>x.symbol));fundamentals={status:rows.some(row=>row.status==='available')?'available':'unavailable',provider:'Financial Modeling Prep',capturedAt:new Date().toISOString(),rows};}catch(error){fundamentals={status:'unavailable',provider:'Financial Modeling Prep',capturedAt:new Date().toISOString(),error:error.message,rows:[]};}
      if(version!==researchVersion)return;
      if(fundamentals?.rows)fundamentals.rows=fundamentals.rows.map(row=>row.status==='available'?{...row,fundamentalScore:ResearchAnalysis.scoreFundamentals(row.metrics)}:row);
      const changes=screening?.changes||underlyings.filter(x=>Number.isFinite(x.dailyChangePct)).map(x=>({symbol:x.symbol,changePct:x.dailyChangePct,latestClose:x.dailyClose,previousClose:x.previousClose,timestamp:x.dailyTimestamp}));
      const candidates=window.ResearchRanking.rank(underlyings.flatMap(x=>x.candidates),modules,{fundamentals:fundamentals?.rows||[],changes});
      const movers=modules.movers?{status:changes.length?'available':'unavailable',provider:screening?'Alpaca market snapshots':'Alpaca daily bars',capturedAt:screening?.capturedAt||new Date().toISOString(),coveredCount:screening?.coveredCount,universeCount:screening?.universeCount,gainers:changes.filter(x=>x.changePct>=0).sort((a,b)=>b.changePct-a.changePct),losers:changes.filter(x=>x.changePct<0).sort((a,b)=>a.changePct-b.changePct)}:null;
      currentSnapshot={generatedAt:new Date().toISOString(),provider:'Alpaca',expirationDate:expiration,modules,screening,marketData:{capturedAt:new Date().toISOString(),stocksFeed:underlyings.map(x=>({symbol:x.symbol,feed:x.stockFeed})),spotMethod:'midpoint quote, latest trade fallback, then last daily close',candidateRules:'valid bid/ask with timestamp no older than 72h; strikes within 30% of spot; same expiration; vertical width and premium checked'},underlyings,candidates,news,fundamentals,movers,estimation:{historical:{method:'historical-overlapping-returns',confidenceLevel:.95,minSampleSize:20,disclaimer:'Historical frequency is not a calibrated forecast. Rolling windows overlap and the Wilson interval may understate uncertainty.'},blackScholes:{method:'black-scholes-risk-neutral',volatilitySource:'annualized-realized-historical-proxy-not-option-implied',rate:riskFreeRate,dividendYield,disclaimer:'Risk-neutral model estimate; not a calibrated real-world forecast.'}},filters:{},decision:''};
      render(currentSnapshot);modulesDirty=false;setStatus(`Análisis listo: ${underlyings.length}/${symbols.length} tickers de opciones; ${screening?`exploración diaria ${screening.coveredCount}/${screening.universeCount} del S&P 500; `:''}${candidates.length} spreads válidos.${failures.length?' Cobertura parcial: '+failures.length+' errores. Primeros: '+failures.slice(0,5).join(' · '):''}${empty?' '+empty+' empresas sin pares que cumplan los filtros.':''} Las probabilidades son estimaciones separadas, no calibradas.`,'info');
      const triggerSelect=$('chTriggerStrategy');
      triggerSelect.innerHTML='<option value="">— Ninguna seleccionada —</option>'+candidates.map((c,i)=>`<option value="${i}">${esc(c.symbol+' · '+c.strategy.replace('_SPREAD','').replaceAll('_',' ')+' · '+c.longStrike+'/'+c.shortStrike)}</option>`).join('');
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
  function updateCandidateStatus(state = window.__candlesChartState) {
    const candidate = getSelectedCandidate();
    const status = $('candidateSignalStatus');
    if (!candidate) {
      status.textContent = 'Ninguna candidata seleccionada. El análisis técnico independiente sigue disponible.';
    } else if (state?.symbol && candidate.symbol !== state.symbol) {
      status.textContent = `Candidata ${candidate.symbol}; la gráfica muestra ${state.symbol}. Sus niveles y señales requieren el mismo ticker.`;
    } else {
      const name = candidate.strategy.replace('_SPREAD', '').replaceAll('_', ' ');
      status.textContent = `Candidata seleccionada: ${candidate.symbol} · ${name}. ${$('chShowTriggers').checked ? 'Entradas y salidas orientativas activadas.' : 'Activa la casilla para mostrar sus entradas y salidas orientativas.'}`;
    }
  }
  function selectCandidate(index, rowElement) {
    const previous=selectedCandidateIndex;
    selectedCandidateIndex = Number.isInteger(index) && currentSnapshot && currentSnapshot.candidates[index] ? index : null;
    document.querySelectorAll('#researchCandidates tr.is-selected').forEach(row => row.classList.remove('is-selected'));
    const row = rowElement || (selectedCandidateIndex !== null ? document.querySelector('#researchCandidates tr[data-candidate="' + selectedCandidateIndex + '"]') : null);
    if (row) row.classList.add('is-selected');
    const select = $('chTriggerStrategy');
    if (select) select.value = selectedCandidateIndex === null ? '' : String(selectedCandidateIndex);
    if(previous!==selectedCandidateIndex)document.querySelectorAll('#researchCandidateExplanation details').forEach(details=>{details.open=false;});
    updateCandidateStatus();
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
    updateCandidateStatus(state);
    const showSignals = $('chShowTriggers') && $('chShowTriggers').checked;
    const method = workbenchMethodOverlay(state);
    const methodDraws = !!(method && (method.lines.length || method.band));
    const matches = candidate && candidate.symbol === state.symbol;
    const overlays = { levels: matches ? window.StrategyTriggers.strategyLevels(candidate) : null, entries: [], exits: [], technicalSignals: [], method: methodDraws ? method : null, note: '' };
    const notes = [];
    if (method && method.note) notes.push(method.note);
    if (candidate && !matches) notes.push('La candidata corresponde a ' + candidate.symbol + ' y la gráfica muestra ' + state.symbol + '.');
    if (showSignals && !candidate) notes.push('Selecciona una candidata evaluada para ver sus entradas y salidas orientativas.');
    if (state.timeframe !== '1Day') {
      notes.push('Señales desactivadas: solo se calculan con velas 1Day; no se asignan señales diarias a velas intradía u otras temporalidades.');
      overlays.note = notes.join(' ');
      renderSignalTable([], state, overlays.note);
      return overlays;
    }
    const today = marketDate(Date.now());
    const closed = state.candles.filter(bar => marketDate(bar.timestamp) < today);
    if (closed.length !== state.candles.length) notes.push('La vela del día bursátil actual se excluye de las señales hasta el día siguiente para asegurar su cierre.');
    if (!technicalCache || technicalCache.state !== state || technicalCache.today !== today) {
      technicalCache = { state, today, signals: window.StrategyTriggers.computeTechnicalSignals(closed, { symbol: state.symbol, timeframe: '1Day' }) };
    }
    const enabled = new Set([...document.querySelectorAll('.technical-indicator:checked')].map(input => input.value));
    if(!$('researchModuleTechnical').checked)enabled.clear();
    const selected = signal => signal.rule === 'sma_cross' ? enabled.has(signal.side === 'bullish' ? 'sma_up' : 'sma_down') : signal.rule === 'rsi_cross' ? enabled.has('rsi') : enabled.has(signal.side === 'bullish' ? 'resistance' : 'support');
    overlays.technicalSignals = technicalCache.signals.filter(selected);
    if (showSignals && matches) {
      const triggers = window.StrategyTriggers.computeTriggers(closed, candidate);
      const decorate = (signal, exit) => ({ ...signal, ticker: state.symbol, timeframe: '1Day', category: 'candidate',
        indicator: signal.rule === 'sma20_against' ? 'SMA20' : signal.rule === 'sma_cross' ? 'SMA50 + SMA20' : (signal.side === 'bullish' ? 'Resistencia + ATR14' : 'Soporte + ATR14'),
        type: exit ? 'salida' : (signal.side === 'bullish' ? 'alcista' : 'bajista'),
        explanation: window.StrategyTriggers.describeSignal(signal),
        exactRule: signal.rule === 'sma20_against' ? (signal.side === 'bullish' ? 'Cierre anterior ≥ SMA20 anterior y cierre actual < SMA20 actual.' : 'Cierre anterior ≤ SMA20 anterior y cierre actual > SMA20 actual.') : signal.rule === 'sma_cross' ? (signal.side === 'bullish' ? 'Cierre anterior ≤ SMA50 anterior; cierre actual > SMA50 y SMA20 > SMA50.' : 'Cierre anterior ≥ SMA50 anterior; cierre actual < SMA50 y SMA20 < SMA50.') : (signal.side === 'bullish' ? 'Cierre anterior ≤ resistencia previa + 0.25 ATR14 previo; cierre actual > umbral.' : 'Cierre anterior ≥ soporte previo − 0.25 ATR14 previo; cierre actual < umbral.') });
      overlays.entries = triggers.entries.map(signal => decorate(signal, false));
      overlays.exits = triggers.exits.map(signal => decorate(signal, true));
    }
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
    const hasProbability=$('researchModuleTechnical').checked||$('researchModuleBlackScholes').checked;
    $('researchMinProb').closest('div').hidden=!hasProbability;
    if(!hasProbability)$('researchMinProb').value='0';
    document.querySelector('label[for="researchMinProb"]').textContent=$('researchModuleBlackScholes').checked?'Prob. Black-Scholes mínima (%)':'Frecuencia histórica mínima (%)';
    $('researchMinProb').setAttribute('aria-label',document.querySelector('label[for="researchMinProb"]').textContent);
    document.querySelectorAll('[data-core-column]').forEach(cell=>{cell.hidden=!readModules()[cell.dataset.coreColumn];});
  }
  document.addEventListener('DOMContentLoaded',()=>{
    syncResearchControls();
    for(const id of ['researchMode','researchUniverse'])$(id).addEventListener('change',()=>{syncResearchControls();invalidateResearchContext();});
    for(const eventName of ['input','change'])$('researchCompany').addEventListener(eventName,()=>{if(currentSnapshot||running)invalidateResearchContext();});
    document.querySelectorAll('.research-module-options input').forEach(input=>input.addEventListener('change',()=>{syncResearchControls();if(typeof refreshChartOverlays==='function')refreshChartOverlays();}));

    $('btnResearchCancel').addEventListener('click',()=>{invalidateResearchContext(false);setStatus('Análisis cancelado. No se publica un ranking incompleto.','info');});
    $('btnResearchAnalyze').addEventListener('click',runAnalysis);$('btnResearchSave').addEventListener('click',saveJournal);$('btnResearchHistory').addEventListener('click',loadJournal);
    for(const id of ['researchMinProb','researchMinRR','researchMaxSpread','researchTrendFilter','researchMaxLoss','researchStrategyFilter'])for(const event of ['input','change'])$(id).addEventListener(event,()=>{if(currentSnapshot?.screening){invalidateResearchContext(false);setStatus('Cambiaste filtros del recorrido completo. Vuelve a analizar el S&P 500 con estos filtros.','info');}else if(currentSnapshot)render(currentSnapshot);});
    for(const id of ['researchModuleTechnical','researchModuleBlackScholes','researchModuleFinancial','researchModuleMovers','researchModuleNews'])$(id).addEventListener('change',()=>{if(currentSnapshot||running)invalidateResearchContext();});
    for(const id of ['researchSymbols','expiration'])for(const eventName of ['input','change'])$(id).addEventListener(eventName,()=>{if(currentSnapshot||running)invalidateResearchContext();});
    for(const id of ['symbol','chSymbol'])$(id).addEventListener('change',()=>{if(currentSnapshot||running)invalidateResearchContext();});
    for(const id of ['symbol','chSymbol','researchCompany'])$(id).addEventListener('input',event=>{const start=event.target.selectionStart;event.target.value=event.target.value.toUpperCase();if(start!==null)event.target.setSelectionRange(start,start);});
    $('chSymbol').addEventListener('change',()=>{if($('researchSymbols').value.trim()==='AAPL')$('researchSymbols').value=$('chSymbol').value;updateCandidateStatus();});
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
    $('chTriggerStrategy').addEventListener('change',()=>{const value=$('chTriggerStrategy').value;selectCandidate(value===''?null:Number(value));});
    $('researchComparison').addEventListener('toggle',()=>{if(!$('researchComparison').open){comparisonVersion++;return;}if(currentSnapshot)renderStrategyComparison(currentSnapshot,filteredRows(currentSnapshot).rows);});
    $('researchCompareSymbol').addEventListener('change',()=>{if(!currentSnapshot)return;const candidate=getSelectedCandidate();if(candidate&&candidate.symbol!==$('researchCompareSymbol').value)selectCandidate(null);if($('researchComparison').open)renderStrategyComparison(currentSnapshot,filteredRows(currentSnapshot).rows);});
    $('chShowTriggers').addEventListener('change',()=>updateCandidateStatus());
    document.querySelectorAll('.technical-indicator, .chart-layer-toggle').forEach(input=>input.addEventListener('change',()=>refreshChartOverlays()));
    $('chMarkerLimit').addEventListener('change',()=>refreshChartOverlays());
    $('chSignalDate').addEventListener('change',()=>refreshChartOverlays());
    $('btnClearSignalDate').addEventListener('click',()=>{$('chSignalDate').value='';refreshChartOverlays();});
  },{once:true});
})();
