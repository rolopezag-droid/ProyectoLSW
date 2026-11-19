(function(){
  let currentSnapshot=null,accessToken=null,running=false,modulesDirty=false;
  let researchVersion=0,selectionVersion=0,comparisonVersion=0;
  const evaluationCache=new WeakMap();
  let selectedCandidateIndex = null;
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
    if (!Array.isArray(barsData.bars)) throw new Error('La respuesta de velas está incompleta.');
    if (barsData.complete === false) throw new Error('La consulta de velas quedó incompleta: ' + (barsData.partialReason || 'cobertura desconocida') + '.');
    const bars=barsData.bars||[],last=bars.at(-1),usesQuote=Number.isFinite(quote.referencePrice)&&quote.referencePrice>0,spot=usesQuote?quote.referencePrice:last?.close;
    if(!Number.isFinite(spot)||spot<=0)throw new Error('No hay precio de referencia válido.');
    const technical=modules.technical?ResearchAnalysis.technicalIndicators(bars):null;
    const levels=modules.technical?ResearchAnalysis.supportResistance(bars):null;
    const contracts=[...calls,...puts];
    const previous=bars.at(-2);
    const changePct=last&&previous&&Number.isFinite(last.close)&&Number.isFinite(previous.close)&&previous.close!==0?(last.close/previous.close-1)*100:null;
    const spotSource=usesQuote?(quote.referenceSource||'referencia de cotización sin método'):'último cierre de vela',spotTimestamp=usesQuote?(quote.referenceTimestamp||null):(last?.timestamp||null),spotSymbol=usesQuote?(quote.symbol||null):symbol;
    const underlying={symbol:spotSymbol,price:spot,source:spotSource,timestamp:spotTimestamp};
    const candidates=ResearchAnalysis.compareStrategies(contracts,{symbol,expiration,spot,bars,includeTechnical:modules.technical,includeBlackScholes:modules.blackScholes,riskFreeRate,dividendYield}).map(candidate=>window.StrategyExplanation.attachEvidence(candidate,contracts,underlying));
    return {symbol,spot,spotSource,spotTimestamp,spotSymbol,capturedAt:barsData.capturedAt,stockFeed:barsData.feed||'iex',dailyChangePct:changePct,technical,supportResistance:levels,candidates};
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
    const best=snapshot.candidates.find(candidate=>Number.isFinite(candidate.score));if(best)items.push(`Mayor score combinado preliminar antes de los filtros de tabla: ${best.symbol} ${best.strategy.replace('_SPREAD','').replaceAll('_',' ')}; prob. histórica ${pct(best.probability.probability)}${best.blackScholes?`; Black‑Scholes ${pct(best.blackScholes.probability)} (CDF con discrepancia auditada)` : ''}. Abre el detalle para verificar la candidata; las probabilidades no se ajustan con fundamentales.`);else if(snapshot.candidates.length)items.push('No hay un score calculable con los datos disponibles.');
    $('researchCoreSummary').innerHTML=`<ul class="research-summary-list">${items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`;
  }
  // Mantener los índices originales para sincronizar tabla, gráfica y explicaciones.
  function filteredRows(snapshot){
    const minP=Number($('researchMinProb').value)/100,minRR=Number($('researchMinRR').value),maxSpread=Number($('researchMaxSpread').value),trendFilter=snapshot.modules.technical?$('researchTrendFilter').value:'all';
    const rows=snapshot.candidates.map((candidate,index)=>({candidate,index})).filter(({candidate:c})=>(minP===0||Number.isFinite(c.probability.probability)&&c.probability.probability>=minP)&&c.riskReward>=minRR&&c.liquidityScore<=maxSpread&&(trendFilter==='all'||c.technicalTrend===c.side)).slice(0,100);
    return {rows,filters:{minProbability:minP,minRiskReward:minRR,maxRelativeBidAsk:maxSpread,technicalAlignment:trendFilter}};
  }
  const evidenceNumber=value=>Number.isFinite(value)?String(Number(value.toFixed(6))):'No disponible';
  const scoreNumber=value=>Number.isFinite(value)?String(value):'No disponible';
  const evidenceDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():'No disponible';
  const strategyLabel=value=>String(value||'').replace('_SPREAD','').replaceAll('_',' ');
  function companyName(symbol){
    const option=[...$('chSymbol').options].find(item=>item.value===symbol);
    return option?option.textContent:`Nombre no disponible (${symbol})`;
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
    const bsInfo=!snapshot.modules.blackScholes?'Black-Scholes no seleccionado.':Number.isFinite(bs?.probability)?`Valor risk-neutral existente ${pct(bs.probability)}; CDF con discrepancia auditada, no validado ni usado en el score. Volatilidad realizada proxy ${pct(bs.assumptions?.volatility)}, horizonte ${evidenceNumber(bs.assumptions?.timeToMaturityYears)} años, tasa ${evidenceNumber(bs.assumptions?.rate)}, dividendos ${evidenceNumber(bs.assumptions?.dividendYield)}.`:`Black-Scholes no disponible: ${bs?.reason||'faltan datos'}. La implementación de su CDF tiene una discrepancia auditada y no participa en el score.`;
    const technicalContext=t?`SMA20 ${evidenceNumber(t.sma20)}, SMA50 ${evidenceNumber(t.sma50)}, RSI14 ${evidenceNumber(t.rsi14)}, ATR14 ${evidenceNumber(t.atr14)}. RSI y ATR son contexto, no factores directos del score.`:'Indicadores técnicos no disponibles o no seleccionados.';
    const fundamental=snapshot.modules.financial?(Number.isFinite(candidate.fundamentalScore)?`El score fundamental ${evidenceNumber(candidate.fundamentalScore)} ajustó el ranking mediante ×${evidenceNumber(candidate.fundamentalFactor)}.`:'Fundamentales sin cobertura suficiente o no disponibles; factor de ranking 1.'):'Fundamentales no seleccionados; factor de ranking 1.';
    const news=snapshot.modules.news?`Noticias: ${snapshot.news?.status||'No disponible'}; son contexto y no modifican el score.`:'Noticias no seleccionadas; no modifican el score.';
    const result=verified?.status==='verified'?verified.evaluation:null;
    const pendingValue=verified&&verified.status!=='verified'?'No disponible: candidata no verificada':'Pendiente de verificar';
    const payoff=result?(result.riskRewardRatio<1?'La pérdida máxima supera al beneficio máximo.':result.riskRewardRatio>1?'El beneficio máximo supera a la pérdida máxima.':'Beneficio y pérdida máximos son iguales.'):(verified?'La relación entre beneficio y pérdida no se pudo verificar.':'La relación entre beneficio y pérdida está pendiente de verificación.');
    const history=Number.isFinite(historical?.probability)?(historical.probability<.5?'Menos de la mitad de las ventanas históricas evaluadas alcanzaron el criterio de equilibrio.':'Al menos la mitad de las ventanas históricas evaluadas alcanzaron el criterio de equilibrio.'):'No hay muestra histórica suficiente para evaluar la frecuencia.';
    const outcome=result?`Al vencimiento, la ganancia máxima corresponde a un subyacente ${candidate.side==='bullish'?'igual o superior':'igual o inferior'} al strike corto ${evidenceNumber(candidate.shortStrike)}; un movimiento contrario puede alcanzar la pérdida máxima.`:'Las condiciones de ganancia y pérdida requieren validar primero las patas y los resultados con Quant.';
    return `${evidenceList([['Empresa y ticker',companyName(candidate.symbol)],['Subyacente de referencia',money(underlying?.spot)],['Fuente y fecha',`${spotSource} · ${spotTime}`],['Vencimiento',candidate.expiration],['Estrategia',strategyLabel(candidate.strategy)],['Dirección',candidate.side==='bullish'?'Alcista':'Bajista'],['Contratos',`${candidate.longSymbol||'No disponible'} / ${candidate.shortSymbol||'No disponible'}`],['Tendencia',trend],['Prima neta total',result?money(result.spreadCategory==='debit'?result.netDebit:result.netCredit):pendingValue],['Beneficio máximo',result?money(result.maxProfit):pendingValue],['Pérdida máxima',result?money(result.maxLoss):pendingValue],['Break-even (USD/acción)',result?evidenceNumber(result.breakEven):pendingValue],['Ganancia / riesgo',result?evidenceNumber(result.riskRewardRatio):pendingValue],['Probabilidad histórica',`${pct(historical?.probability)} · ${historical?.sampleSize??'No disponible'} muestras · ${historical?.horizonTradingDays??'No disponible'} días hábiles estimados`]])}
      <p>${esc(trendText)} ${esc(technicalContext)}</p><p>${esc(bsInfo)}</p><p>${esc(fundamental)} ${esc(news)}</p>
      <p>${esc(outcome)} No se incluyen comisiones, deslizamiento ni garantías de ejecución.</p>
      <p>${esc(payoff)} ${esc(history)} La probabilidad histórica es frecuencia de retornos pasados en ventanas traslapadas; no es equivalente a la estimación del modelo ni una probabilidad calibrada. Las griegas de las patas y del spread no se calcularon en este ranking. ${esc(spotWarning)} ${esc(ageWarning)}</p>
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
    const comparison=other?`Entre ${alternatives.length} alternativa(s) visible(s) de la misma estrategia, el par ${other.longStrike}/${other.shortStrike} tiene score ${scoreNumber(other.score)}, probabilidad histórica ${pct(other.probability?.probability)}, ganancia/riesgo ${evidenceNumber(other.riskReward)} y diferencial ${evidenceNumber(other.liquidityScore)}; el par seleccionado tiene score ${scoreNumber(candidate.score)}, probabilidad ${pct(candidate.probability?.probability)}, ganancia/riesgo ${evidenceNumber(candidate.riskReward)} y diferencial ${evidenceNumber(candidate.liquidityScore)}.`:'No hay otro par visible de la misma empresa y estrategia para comparar; los filtros y el límite de 20 pueden haber excluido alternativas.';
    const provenance=e.long&&e.short?'Identidades y cotizaciones proceden de las patas conservadas para esta candidata.':'Falta la evidencia original completa; los campos disponibles proceden del ranking y no están verificados.';
    return `<p>${esc(provenance)}</p><h4>Pata comprada (long)</h4>${leg('Compra',long,'buy')}<h4>Pata vendida (short)</h4>${leg('Venta',short,'sell')}
      <p>${lower?`La pata ${esc(lower)} tiene el strike menor; `:'No se pudo comprobar el orden de los strikes; '}se compra al Ask y se vende al Bid. La cantidad mostrada corresponde a una unidad de spread del ranking, no a una orden ejecutada. El ranking revisa pares de la misma empresa, vencimiento y tipo, strikes dentro del 30% del spot, cotizaciones positivas sin cruce y hasta 72 horas de antigüedad; exige prima positiva menor que el ancho. Enumera pares, calcula el score y conserva hasta 20 candidatas por ticker.</p>
      <p>Esta combinación aparece por su posición en ese ranking y los filtros visibles; no se eligió por Delta, Gamma, volumen o interés abierto. La suma de diferenciales relativos Bid/Ask sí penaliza el score. El selector automático del formulario es distinto: usa pares consecutivos y prioriza cercanía al spot, punto medio y ancho.</p><p>${esc(comparison)}</p>
      <p>La distancia entre strikes es el ancho del spread. Si la prima se mantiene constante, un ancho mayor aumenta el beneficio máximo de un débito mientras su pérdida máxima sigue siendo el débito; en un crédito aumenta la pérdida máxima mientras su beneficio máximo sigue siendo el crédito. Los límites concretos se muestran en la evaluación de Quant.</p>`;
  }
  function candidateScore(candidate,snapshot,rows,filters){
    const context=window.StrategyExplanation.rankContext(candidate,rows),p=candidate.probability?.probability;
    const reason=!Number.isFinite(p)?'Probabilidad histórica insuficiente: se requieren al menos 20 muestras.':candidate.technicalAlignment===null?'La tendencia técnica es insuficiente y el factor técnico no está disponible.':'No disponible.';
    const technical=!snapshot.modules.technical?'1 (módulo técnico desactivado)':evidenceNumber(candidate.technicalAlignment);
    const fundamental=!snapshot.modules.financial?'1 (fundamentales no seleccionados)':Number.isFinite(candidate.fundamentalScore)?`${evidenceNumber(candidate.fundamentalFactor)} (score fundamental ${evidenceNumber(candidate.fundamentalScore)})`:'1 (fundamentales no disponibles o cobertura insuficiente)';
    const neighbor=(label,other)=>other?`${label}: ${other.symbol} ${strategyLabel(other.strategy)}, score ${scoreNumber(other.score)}, probabilidad ${pct(other.probability?.probability)}, ganancia/riesgo ${evidenceNumber(other.riskReward)}, factor técnico ${evidenceNumber(other.technicalAlignment)}, diferencial ${evidenceNumber(other.liquidityScore)}, factor fundamental ${evidenceNumber(other.fundamentalFactor)}.`:`${label}: no existe en la lista visible.`;
    const fundamentalData=snapshot.fundamentals?.rows?.find(row=>row.symbol===candidate.symbol)?.fundamentalScore;
    const components=fundamentalData?.components?.map(item=>`${item.label}: peso ${item.weight}%, valor normalizado ${evidenceNumber(item.score)}`).join(' · ');
    const difference=(label,other)=>{
      if(!other||!Number.isFinite(other.score)||!Number.isFinite(candidate.score))return `${label}: diferencia no disponible.`;
      const delta=candidate.score-other.score;
      return delta===0?`${label}: empate en score; se conserva el orden previo estable.`:`${label}: diferencia de score ${scoreNumber(delta)} (candidata menos vecino).`;
    };
    const explanation=Number.isFinite(candidate.score)?`Su posición ${context.position??'No disponible'} de ${context.total} se debe al score mostrado; los factores interactúan y no se atribuye el orden a un único factor aislado. ${difference('Frente al anterior',context.above)} ${difference('Frente al siguiente',context.below)}`:`Score no disponible. ${reason} No puede afirmarse que sea la mejor puntuación.`;
    return `<p>Score base = probabilidad histórica × (beneficio máximo / pérdida máxima) × factor técnico ÷ (1 + suma de diferenciales relativos Bid/Ask). Score final = score base × factor fundamental. No hay pesos porcentuales adicionales en esta fórmula.</p>
      ${evidenceList([['Score total',scoreNumber(candidate.score)],['Score base',scoreNumber(candidate.baseScore)],['Probabilidad histórica',pct(p)],['Ganancia / riesgo',evidenceNumber(candidate.riskReward)],['Factor técnico',technical],['Diferencial relativo Bid/Ask',evidenceNumber(candidate.liquidityScore)],['Factor fundamental',fundamental],['Muestras históricas',String(candidate.probability?.sampleSize??'No disponible')]])}
      <p>${esc(explanation)}</p><p>${esc(neighbor('Anterior',context.above))}</p><p>${esc(neighbor('Siguiente',context.below))}</p>
      <p>Fundamentales: ${esc(components||'No disponibles o no seleccionados')}. Cobertura de pesos ${esc(fundamentalData?.coverage??'No disponible')}%; se exige al menos 50%. La tendencia contraria usa factor 0.9 y un mayor diferencial Bid/Ask reduce el score al aumentar el denominador; el factor fundamental puede estar por debajo de 1.</p>
      <p>Filtros visibles: probabilidad mínima ${esc(evidenceNumber(filters.minProbability*100))}%, ganancia/riesgo mínimo ${esc(evidenceNumber(filters.minRiskReward))}, diferencial máximo ${esc(evidenceNumber(filters.maxRelativeBidAsk))}, tendencia ${esc(filters.technicalAlignment)}. Por ticker se conservan hasta 20 pares antes del ajuste fundamental; empate inicial por tamaño de muestra, después orden global por score con orden estable en empates. La tabla limita a 100 filas.</p>
      <p>El diferencial es la suma de (Ask − Bid)/punto medio de cada pata; no es volumen ni interés abierto. Black-Scholes, noticias, RSI y ATR no son factores directos del score. La puntuación es heurística y no garantiza rentabilidad ni seguridad.</p>`;
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
    const winner=winners[0]?.candidate,runner=winners[1]?.candidate,skippedCount=results.reduce((sum,item)=>sum+item.skipped.length,0);
    $('researchCompareStatus').textContent=`${winners.length}/4 estrategias con candidata verificada entre las visibles. ${skippedCount} candidata(s) no verificadas. ${winners.length<4?'No es posible comparar las cuatro con criterios equivalentes por ausencia de datos o verificación. ':''}Comparación limitada al ranking existente, filtros y máximo de 20 por ticker.`;
    const lines=results.map(item=>{
      if(!item.candidate){
        const any=visible.some(row=>row.candidate.strategy===item.strategy);
        const text=item.skipped.length?'Candidatas no verificadas: '+item.skipped.join(' · '):any?'Score no disponible para las candidatas visibles.':'Sin candidata visible; puede deberse a filtros o al límite de 20.';
        return `<tr><td>${esc(strategyLabel(item.strategy))}</td><td colspan="7">${esc(text)}</td></tr>`;
      }
      const c=item.candidate,e=item.verification.evaluation;
      const advantage=c.side==='bullish'?'Favorece cierre al alza':'Favorece cierre a la baja';
      return `<tr><td>${esc(strategyLabel(c.strategy))}</td><td>${esc(advantage)}</td><td>${esc(c.longStrike)} / ${esc(c.shortStrike)}</td><td>${esc(money(e.maxProfit))}</td><td>${esc(money(e.maxLoss))}</td><td>${esc(evidenceNumber(e.breakEven))} USD/acción</td><td>${esc(evidenceNumber(e.riskRewardRatio))} · ${esc(pct(c.probability?.probability))}</td><td>${esc(scoreNumber(c.score))}<br>${esc(item.skipped.length?`Superiores no verificadas: ${item.skipped.join(' · ')}. `:'')}Beneficio y pérdida limitados; riesgo de movimiento contrario y ejecución.</td></tr>`;
    }).join('');
    let summary='No hay una mejor puntuación verificable con los datos disponibles.';
    if(winner){
      summary=`Mejor puntuación verificada entre las candidatas visibles: ${winner.symbol} ${strategyLabel(winner.strategy)}, score ${scoreNumber(winner.score)}. Probabilidad histórica ${pct(winner.probability?.probability)}, ganancia/riesgo ${evidenceNumber(winner.riskReward)}, factor técnico ${evidenceNumber(winner.technicalAlignment)}, diferencial ${evidenceNumber(winner.liquidityScore)} y factor fundamental ${evidenceNumber(winner.fundamentalFactor)}.`;
      if(runner)summary+=` Siguiente estrategia verificada: ${strategyLabel(runner.strategy)}, score ${scoreNumber(runner.score)}; diferencia ${scoreNumber(winner.score-runner.score)}. Sus factores son probabilidad histórica ${pct(runner.probability?.probability)}, ganancia/riesgo ${evidenceNumber(runner.riskReward)}, factor técnico ${evidenceNumber(runner.technicalAlignment)}, diferencial ${evidenceNumber(runner.liquidityScore)} y factor fundamental ${evidenceNumber(runner.fundamentalFactor)}.`;
      if(firstRanked!==winner)summary+=' La primera candidata del ranking no pudo verificarse; se muestra la primera que sí pudo contrastarse.';
    }
    $('researchCompareResults').innerHTML=`<div class="research-table-wrap"><table class="research-table"><thead><tr><th>Estrategia</th><th>Dirección</th><th>Strikes largo/corto</th><th>Beneficio máximo</th><th>Pérdida máxima</th><th>Break-even</th><th>Ganancia/riesgo · prob. histórica</th><th>Score y riesgos</th></tr></thead><tbody>${lines}</tbody></table></div><h4>¿Cuál estrategia obtuvo la mejor puntuación y por qué?</h4><p>${esc(summary)} «Mejor» se refiere al score y datos visibles, no a la inversión más rentable ni más segura. El score combina esos factores; Black-Scholes no interviene.</p>`;
  }
  function render(snapshot){
    renderSummary(snapshot);renderTechnical(snapshot);renderFinancialAndMovers(snapshot);
    const news=snapshot.news,newsPanel=$('researchNewsPanel');newsPanel.hidden=!snapshot.modules.news;
    if(snapshot.modules.news){
      $('researchNewsStatus').textContent=news.status==='available'?`${news.articles.length} artículo(s) consultados para ${snapshot.underlyings.map(x=>x.symbol).join(', ')} · Captura ${new Date(news.capturedAt).toLocaleString('es-MX')}.`:`No se pudieron consultar noticias de Alpaca: ${news.error||'error no especificado'}.`;
      const articleUrl=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}};
      $('researchNews').innerHTML=news.status==='available'&&news.articles.length?news.articles.slice(0,20).map(item=>{const url=articleUrl(item.url),date=item.created_at||item.updated_at,source=item.source||item.author||'Fuente no indicada';return `<article class="research-news-item"><strong>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(item.headline||'Artículo sin titular')}</a>`:esc(item.headline||'Artículo sin titular')}</strong><div class="research-news-meta">${esc(source)} · ${esc(date?new Date(date).toLocaleString('es-MX'):'Fecha no indicada')} · ${(item.symbols||[]).map(esc).join(', ')}</div>${item.summary?`<p class="research-news-summary">${esc(item.summary)}</p>`:''}</article>`;}).join(''):'<p class="research-panel-description">No hay artículos disponibles para los tickers y periodo consultados.</p>';
    }
    const {rows,filters}=filteredRows(snapshot);
    $('researchCandidates').innerHTML=rows.map(({candidate:c,index},position)=>{const bsLabel=!snapshot.modules.blackScholes?'No incluido':c.blackScholes?.probability===null?(c.blackScholes?.reason==='insufficient_realized_volatility'?'Sin vol. histórica':'Sin datos'):pct(c.blackScholes.probability),bsTitle=c.blackScholes?.assumptions?`Vol. realizada ${(c.blackScholes.assumptions.volatility*100).toFixed(1)}% · ${c.blackScholes.assumptions.volatilitySampleBars} velas · r ${(c.blackScholes.assumptions.rate*100).toFixed(2)}% · CDF con discrepancia auditada`:`${c.blackScholes?.reason||''}`,scoreTitle=snapshot.modules.financial&&c.fundamentalScore!==null?`Score base ${c.baseScore?.toFixed(3)} × factor fundamental ${c.fundamentalFactor.toFixed(2)}. No modifica probabilidades.`:'Score orientativo de estrategia';return `<tr data-candidate="${index}" title="Selecciona para ver señales, niveles y explicación"><td>${position+1}</td><td>${esc(c.symbol)}</td><td>${esc(c.strategy.replace('_SPREAD','').replaceAll('_',' '))}</td><td>${esc(c.technicalTrend||'No incluido')}</td><td>${esc(c.longStrike)} / ${esc(c.shortStrike)}</td><td>${money(c.maxProfit)}</td><td>${money(c.maxLoss)}</td><td>${money(c.breakEven)}</td><td>${pct(c.probability.probability)}</td><td title="${esc(bsTitle)}">${esc(bsLabel)}</td><td>${c.probability.interval?`${pct(c.probability.interval.lower)}–${pct(c.probability.interval.upper)}`:'—'}</td><td>${c.probability.sampleSize}</td><td title="${esc(scoreTitle)}">${Number.isFinite(c.score)?c.score.toFixed(3):'—'}</td><td>${esc(new Date(c.longQuoteTimestamp).toLocaleString('es-MX'))}<br>${esc(new Date(c.shortQuoteTimestamp).toLocaleString('es-MX'))}</td><td><button type="button" class="btn btn-secondary strategy-explain-button" data-explain-candidate="${index}">Ver explicación</button></td></tr>`;}).join('')||'<tr><td colspan="15">No hay candidatas que cumplan los filtros seleccionados.</td></tr>';
    $('researchEvidence').hidden=false;
    snapshot.filters=filters;
    $('researchBsCaveat').hidden=!snapshot.modules.blackScholes;
    syncComparisonSymbols(snapshot);
    if(selectedCandidateIndex!==null&&!rows.some(row=>row.index===selectedCandidateIndex))selectCandidate(null);
    else {
      if(selectedCandidateIndex!==null)document.querySelector(`#researchCandidates tr[data-candidate="${selectedCandidateIndex}"]`)?.classList.add('is-selected');
      renderCandidateExplanation(snapshot,rows,filters);
    }
    if($('researchComparison').open)renderStrategyComparison(snapshot,rows);
  }
  function invalidateResearchContext(showMessage=true){
    researchVersion++;selectionVersion++;comparisonVersion++;
    currentSnapshot=null;selectedCandidateIndex=null;modulesDirty=false;
    $('researchEvidence').hidden=true;$('researchCandidateExplanation').hidden=true;
    $('researchCandidates').innerHTML='';$('researchCompareResults').innerHTML='';
    $('chTriggerStrategy').innerHTML='<option value="">— Ninguna seleccionada —</option>';
    updateCandidateStatus();
    if(typeof refreshChartOverlays==='function')refreshChartOverlays();
    if(showMessage)setStatus('Cambió la empresa, el vencimiento o los módulos. Vuelve a analizar para actualizar las explicaciones.','info');
  }
  async function runAnalysis(){
    if(running)return;const expiration=$('expiration').value.trim(),modules=readModules();
    const symbols=[...new Set($('researchSymbols').value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean))];
    if(!Object.values(modules).some(Boolean))return setStatus('Selecciona al menos un módulo para incluir en el análisis.','error');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(expiration)||Date.parse(expiration+'T00:00:00Z')<=Date.now())return setStatus('Ingresa un vencimiento futuro válido en Estrategia.','error');
    if(!symbols.length||symbols.length>3||symbols.some(s=>!/^[A-Z0-9.-]{1,12}$/.test(s)))return setStatus('Ingresa de 1 a 3 tickers válidos, separados por comas.','error');
    invalidateResearchContext(false);const version=researchVersion;
    const btn=$('btnResearchAnalyze');running=true;btn.disabled=true;btn.textContent='Consultando mercado…';$('researchEvidence').hidden=true;
    try{
      const rate=Number($('bsRate').value),dividend=Number($('bsDividend').value),riskFreeRate=Number.isFinite(rate)?rate:.05,dividendYield=Number.isFinite(dividend)?dividend:0;
      const underlyings=[],failures=[];
      for(const symbol of symbols){if(version!==researchVersion)return;setStatus(`Consultando velas y cadena de opciones de ${symbol}…`,'loading');try{underlyings.push(await analyzeSymbol(symbol,expiration,modules,riskFreeRate,dividendYield));}catch(error){failures.push(`${symbol}: ${error.message}`);}if(version!==researchVersion)return;}
      if(!underlyings.length)throw new Error(failures.join(' · ')||'No se obtuvieron datos de mercado.');
      let news={status:'not-selected',provider:'Alpaca',capturedAt:null,articles:[]};
      if(modules.news)try{news=await fetchNews(underlyings.map(x=>x.symbol));}catch(error){news={status:'unavailable',provider:'Alpaca',capturedAt:new Date().toISOString(),articles:[],error:error.message};}
      let fundamentals=null;
      if(modules.financial)try{fundamentals=await json('/api/research/fundamentals?symbols='+encodeURIComponent(underlyings.map(x=>x.symbol).join(',')));}catch(error){fundamentals={status:'unavailable',provider:'Financial Modeling Prep',capturedAt:new Date().toISOString(),error:error.message,rows:[]};}
      if(version!==researchVersion)return;
      if(fundamentals?.rows)fundamentals.rows=fundamentals.rows.map(row=>row.status==='available'?{...row,fundamentalScore:ResearchAnalysis.scoreFundamentals(row.metrics)}:row);
      const fundamentalBySymbol=new Map((fundamentals?.rows||[]).map(row=>[row.symbol,row.fundamentalScore]));
      const candidates=underlyings.flatMap(x=>x.candidates).map(candidate=>{const fundamentalScore=modules.financial?fundamentalBySymbol.get(candidate.symbol):null,factor=fundamentalScore?.status==='available'?fundamentalScore.factor:1;return {...candidate,baseScore:candidate.score,fundamentalScore:fundamentalScore?.status==='available'?fundamentalScore.score:null,fundamentalFactor:factor,score:candidate.score===null?null:candidate.score*factor};}).sort((a,b)=>(b.score??-1)-(a.score??-1));
      const changes=underlyings.filter(x=>Number.isFinite(x.dailyChangePct)).map(x=>({symbol:x.symbol,changePct:x.dailyChangePct}));
      const movers=modules.movers?{status:changes.length?'available':'unavailable',provider:'Alpaca daily bars',capturedAt:new Date().toISOString(),gainers:changes.filter(x=>x.changePct>=0).sort((a,b)=>b.changePct-a.changePct),losers:changes.filter(x=>x.changePct<0).sort((a,b)=>a.changePct-b.changePct)}:null;
      currentSnapshot={generatedAt:new Date().toISOString(),provider:'Alpaca',expirationDate:expiration,modules,marketData:{capturedAt:new Date().toISOString(),stocksFeed:underlyings.map(x=>({symbol:x.symbol,feed:x.stockFeed})),spotMethod:'midpoint quote, latest trade fallback, then last daily close',candidateRules:'valid bid/ask with timestamp no older than 72h; strikes within 30% of spot; same expiration; vertical width and premium checked'},underlyings,candidates,news,fundamentals,movers,estimation:{historical:{method:'historical-overlapping-returns',confidenceLevel:.95,minSampleSize:20,disclaimer:'Historical frequency is not a calibrated forecast. Rolling windows overlap and the Wilson interval may understate uncertainty.'},blackScholes:{method:'black-scholes-risk-neutral',volatilitySource:'annualized-realized-historical-proxy-not-option-implied',rate:riskFreeRate,dividendYield,disclaimer:'Risk-neutral model estimate; not a calibrated real-world forecast.'}},filters:{},decision:''};
      render(currentSnapshot);modulesDirty=false;setStatus(`Análisis listo: ${underlyings.length}/${symbols.length} tickers; ${candidates.length} spreads válidos.${failures.length?' Sin datos: '+failures.join(' · '):''} Las probabilidades son estimaciones separadas, no calibradas.`,'info');
      const triggerSelect=$('chTriggerStrategy');
      triggerSelect.innerHTML='<option value="">— Ninguna seleccionada —</option>'+candidates.map((c,i)=>`<option value="${i}">${esc(c.symbol+' · '+c.strategy.replace('_SPREAD','').replaceAll('_',' ')+' · '+c.longStrike+'/'+c.shortStrike)}</option>`).join('');
      selectCandidate(null);
    }catch(error){if(version===researchVersion)setStatus(error.message,'error');}
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
  // ── Selección de candidata ↔ gráfica ──
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
  // Fuente de overlays: señales técnicas y señales de candidata independientes.
  window.__candleOverlaySource = function () {
    if (!window.StrategyTriggers) return null;
    const state = window.__candlesChartState;
    if (!state || !Array.isArray(state.candles) || !state.candles.length) return null;
    const candidate = getSelectedCandidate();
    updateCandidateStatus(state);
    const showSignals = $('chShowTriggers') && $('chShowTriggers').checked;
    const matches = candidate && candidate.symbol === state.symbol;
    const overlays = { levels: matches ? window.StrategyTriggers.strategyLevels(candidate) : null, entries: [], exits: [], technicalSignals: [], note: '' };
    const notes = [];
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
  document.addEventListener('DOMContentLoaded',()=>{
    $('btnResearchAnalyze').addEventListener('click',runAnalysis);$('btnResearchSave').addEventListener('click',saveJournal);$('btnResearchHistory').addEventListener('click',loadJournal);
    for(const id of ['researchMinProb','researchMinRR','researchMaxSpread','researchTrendFilter'])$(id).addEventListener('change',()=>{if(currentSnapshot)render(currentSnapshot);});
    for(const id of ['researchModuleTechnical','researchModuleBlackScholes','researchModuleFinancial','researchModuleMovers','researchModuleNews'])$(id).addEventListener('change',()=>{if(currentSnapshot||running)invalidateResearchContext();});
    for(const id of ['researchSymbols','expiration'])for(const eventName of ['input','change'])$(id).addEventListener(eventName,()=>{if(currentSnapshot||running)invalidateResearchContext();});
    for(const id of ['symbol','chSymbol'])$(id).addEventListener('change',()=>{if(currentSnapshot||running)invalidateResearchContext();});
    $('chSymbol').addEventListener('change',()=>{if($('researchSymbols').value.trim()==='AAPL')$('researchSymbols').value=$('chSymbol').value;updateCandidateStatus();});
    $('researchCandidates').addEventListener('click',event=>{const tr=event.target.closest('tr[data-candidate]');if(tr)selectCandidate(Number(tr.dataset.candidate),tr);});
    $('chTriggerStrategy').addEventListener('change',()=>{const value=$('chTriggerStrategy').value;selectCandidate(value===''?null:Number(value));});
    $('researchComparison').addEventListener('toggle',()=>{if(!$('researchComparison').open){comparisonVersion++;return;}if(currentSnapshot)renderStrategyComparison(currentSnapshot,filteredRows(currentSnapshot).rows);});
    $('researchCompareSymbol').addEventListener('change',()=>{if(!currentSnapshot)return;const candidate=getSelectedCandidate();if(candidate&&candidate.symbol!==$('researchCompareSymbol').value)selectCandidate(null);if($('researchComparison').open)renderStrategyComparison(currentSnapshot,filteredRows(currentSnapshot).rows);});
    $('chShowTriggers').addEventListener('change',()=>updateCandidateStatus());
    document.querySelectorAll('.technical-indicator').forEach(input=>input.addEventListener('change',()=>refreshChartOverlays()));
    $('chMarkerLimit').addEventListener('change',()=>refreshChartOverlays());
    $('chSignalDate').addEventListener('change',()=>refreshChartOverlays());
    $('btnClearSignalDate').addEventListener('click',()=>{$('chSignalDate').value='';refreshChartOverlays();});
  },{once:true});
})();
