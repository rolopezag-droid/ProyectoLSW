(function (root) {
  const STRATEGIES = {
    BULL_CALL_SPREAD: { optionType: 'call', side: 'bullish', legs: 'debit' },
    BEAR_CALL_SPREAD: { optionType: 'call', side: 'bearish', legs: 'credit' },
    BULL_PUT_SPREAD: { optionType: 'put', side: 'bullish', legs: 'credit' },
    BEAR_PUT_SPREAD: { optionType: 'put', side: 'bearish', legs: 'debit' },
  };

  function technicalIndicators(bars) {
    //ordenar por fecha y filtrar valores no finitos
    const sorted = (bars || []).filter(b => Number.isFinite(b.close) && Number.isFinite(b.high) && Number.isFinite(b.low)).slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
    const closes = sorted.map(b => b.close);
    const mean = values => values.reduce((a,b)=>a+b,0)/values.length;
    //calcular medias moviles simples de 20 y 50 dias, RSI de 14 dias, ATR de 14 dias y volatilidad anualizada
    const sma = n => closes.length >= n ? mean(closes.slice(-n)) : null;
    //calcular RSI y ATR
    let gains=0, losses=0, trSum=0;
    const first=Math.max(1,sorted.length-14);
    for(let i=first;i<sorted.length;i++) {
      const change=closes[i]-closes[i-1]; gains+=Math.max(0,change); losses+=Math.max(0,-change);
      trSum+=Math.max(sorted[i].high-sorted[i].low,Math.abs(sorted[i].high-closes[i-1]),Math.abs(sorted[i].low-closes[i-1]));
    }
    //calcular volatilidad anualizada y mantener el RSI Wilder alineado con el panel de gráfica
    const periods=Math.max(0,sorted.length-first),rsiSeries=relativeStrengthIndexSeries(sorted,14);
    const rsi=rsiSeries.at(-1)?.value??null;
    const returns=[]; for(let i=1;i<closes.length;i++)if(closes[i-1]>0)returns.push(Math.log(closes[i]/closes[i-1]));
    const returnMean=returns.length?mean(returns):0;
    const volatility=returns.length>1?Math.sqrt(returns.reduce((s,r)=>s+(r-returnMean)**2,0)/(returns.length-1)*252)*100:null;
    const ma20=sma(20), ma50=sma(50), last=closes.at(-1);
    return {sampleBars:sorted.length,latestClose:last??null,sma20:ma20,sma50:ma50,rsi14:rsi,atr14:periods>=14?trSum/periods:null,annualizedVolatility:volatility,trend:ma20===null||ma50===null?'insufficient_data':last>ma20&&ma20>ma50?'bullish':last<ma20&&ma20<ma50?'bearish':'mixed',start:sorted[0]?.timestamp??null,end:sorted.at(-1)?.timestamp??null};
  }

  function relativeStrengthIndexSeries(bars, period=14) {
    if(!Number.isInteger(period)||period<1)return [];
    const sorted=(bars||[]).filter(bar=>Number.isFinite(bar.close)).slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
    const result=sorted.map(bar=>({timestamp:bar.timestamp,value:null}));
    if(sorted.length<=period)return result;
    let gains=0,losses=0;
    for(let index=1;index<=period;index++){
      const change=sorted[index].close-sorted[index-1].close;
      gains+=Math.max(0,change);losses+=Math.max(0,-change);
    }
    let averageGain=gains/period,averageLoss=losses/period;
    const value=()=>averageGain===0&&averageLoss===0?50:averageLoss===0?100:100-100/(1+averageGain/averageLoss);
    result[period].value=value();
    for(let index=period+1;index<sorted.length;index++){
      const change=sorted[index].close-sorted[index-1].close;
      averageGain=(averageGain*(period-1)+Math.max(0,change))/period;
      averageLoss=(averageLoss*(period-1)+Math.max(0,-change))/period;
      result[index].value=value();
    }
    return result;
  }

  function simpleMovingAverageSeries(bars, period) {
    if(!Number.isInteger(period)||period<1)return [];
    const sorted=(bars||[]).filter(bar=>Number.isFinite(bar.close)).slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
    let rollingSum=0;
    return sorted.map((bar,index)=>{
      rollingSum+=bar.close;
      if(index>=period)rollingSum-=sorted[index-period].close;
      return {timestamp:bar.timestamp,value:index>=period-1?rollingSum/period:null};
    });
  }

  function supportResistance(bars, {leftBars=3,rightBars=3,zoneAtrTolerance=.5,breakoutAtrBuffer=.25,maxPerSide=4}={}) {
    const sorted=(bars||[]).filter(b=>[b.high,b.low,b.close].every(Number.isFinite)&&b.high>=b.low&&Number.isFinite(Date.parse(b.timestamp))).slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
    const technical=technicalIndicators(sorted),spot=sorted.at(-1)?.close,atr=technical.atr14;
    if(!Number.isFinite(spot)||!Number.isFinite(atr)||atr<=0)return {available:false,reason:'insufficient_atr_data',supports:[],resistances:[],sampleBars:sorted.length};
    if(!Number.isInteger(leftBars)||leftBars<1||!Number.isInteger(rightBars)||rightBars<1)return {available:false,reason:'invalid_pivot_window',supports:[],resistances:[],sampleBars:sorted.length};
    const pivots={support:[],resistance:[]};
    for(let index=leftBars;index<sorted.length-rightBars;index++) {
      const bar=sorted[index],before=sorted.slice(index-leftBars,index),after=sorted.slice(index+1,index+rightBars+1);
      const isLow=before.every(item=>bar.low<item.low)&&after.every(item=>bar.low<=item.low);
      const isHigh=before.every(item=>bar.high>item.high)&&after.every(item=>bar.high>=item.high);
      if(isLow)pivots.support.push({price:bar.low,index,timestamp:bar.timestamp,confirmedAt:sorted[index+rightBars].timestamp});
      if(isHigh)pivots.resistance.push({price:bar.high,index,timestamp:bar.timestamp,confirmedAt:sorted[index+rightBars].timestamp});
    }
    const tolerance=atr*zoneAtrTolerance,buffer=atr*breakoutAtrBuffer;
    const makeZones=(kind)=>{
      const groups=[];
      for(const pivot of pivots[kind].slice().sort((a,b)=>a.price-b.price)) {
        let group=groups.find(candidate=>Math.abs(pivot.price-candidate.mean)<=tolerance);
        if(!group){group={pivots:[],sum:0,mean:pivot.price,lower:pivot.price,upper:pivot.price};groups.push(group);}
        group.pivots.push(pivot);group.sum+=pivot.price;group.mean=group.sum/group.pivots.length;group.lower=Math.min(group.lower,pivot.price);group.upper=Math.max(group.upper,pivot.price);
      }
      return groups.map(group=>{
        const lastPivot=group.pivots.reduce((latest,pivot)=>pivot.index>latest.index?pivot:latest,group.pivots[0]);
        const crossed=sorted.slice(lastPivot.index+rightBars+1).find(bar=>kind==='support'?bar.close<group.lower-buffer:bar.close>group.upper+buffer);
        const breached=kind==='support'?spot<group.lower-buffer:spot>group.upper+buffer;
        return {kind,level:group.mean,lower:group.lower,upper:group.upper,touchCount:group.pivots.length,lastTest:lastPivot.timestamp,confirmedAt:lastPivot.confirmedAt,distanceFromPrice:Math.abs(spot-group.mean),distanceAtr:Math.abs(spot-group.mean)/atr,status:breached?'breached':'active',breakoutAt:breached?(crossed?.timestamp||sorted.at(-1).timestamp):null,breakoutDirection:breached?(kind==='support'?'down':'up'):null};
      }).sort((a,b)=>a.distanceFromPrice-b.distanceFromPrice).slice(0,maxPerSide);
    };
    return {available:true,method:'confirmed-swing-pivots-clustered-by-atr',pivotWindow:{left:leftBars,right:rightBars},zoneAtrTolerance,breakoutAtrBuffer,atr,latestClose:spot,confirmedThrough:sorted.at(-1).timestamp,sampleBars:sorted.length,supports:makeZones('support'),resistances:makeZones('resistance')};
  }

  function normalCdf(value) {
    const sign=value<0?-1:1,x=Math.abs(value),t=1/(1+.3275911*x);
    const polynomial=(((((1.061405429*t-1.453152027)*t+1.421413741)*t-.284496736)*t+.254829592)*t);
    const erf=sign*(1-polynomial*Math.exp(-x*x));
    return .5*(1+erf);
  }

  function blackScholesProbability(spot,target,expiration,annualizedVolatility,direction,{rate=.05,dividendYield=0,volatilitySampleBars=null,asOf=Date.now()}={}) {
    const unavailable=reason=>({probability:null,method:'black-scholes-risk-neutral',reason});
    if(!Number.isFinite(spot)||spot<=0||!Number.isFinite(target)||target<=0)return unavailable('invalid_price_or_break_even');
    if(!Number.isFinite(annualizedVolatility)||annualizedVolatility<=0)return unavailable('insufficient_realized_volatility');
    if(!['bullish','bearish'].includes(direction))return unavailable('invalid_direction');
    const expirationTime=Date.parse(String(expiration)+'T16:00:00Z'),time=(expirationTime-asOf)/(365.25*86400000),sigma=annualizedVolatility/100;
    if(!Number.isFinite(time)||time<=0)return unavailable('expiration_not_in_future');
    if(!Number.isFinite(rate)||!Number.isFinite(dividendYield))return unavailable('invalid_rate_assumption');
    const d2=(Math.log(spot/target)+(rate-dividendYield-sigma*sigma/2)*time)/(sigma*Math.sqrt(time));
    if(!Number.isFinite(d2))return unavailable('invalid_model_inputs');
    return {probability:direction==='bullish'?normalCdf(d2):normalCdf(-d2),method:'black-scholes-risk-neutral',assumptions:{spot,target,timeToMaturityYears:time,volatility:sigma,volatilitySource:'annualized-realized-historical-proxy-not-option-implied',volatilitySampleBars,rate,dividendYield,direction}};
  }

//calcular intervalo de confianza de Wilson para una proporción
  function wilson(successes,total,z=1.96) {
    if(!total)return null; const p=successes/total,z2=z*z,den=1+z2/total;
    const center=(p+z2/(2*total))/den,half=z*Math.sqrt(p*(1-p)/total+z2/(4*total*total))/den;
    return {lower:Math.max(0,center-half),upper:Math.min(1,center+half),confidence:0.95};
  }
//calcular resultados históricos de una estrategia de opciones
  function historicalOutcomes(bars, spot, expiration, breakEven, direction) {
    const sorted=(bars||[]).filter(b=>Number.isFinite(b.close)&&b.close>0).slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
    const days=Math.max(1,Math.ceil((Date.parse(expiration+'T16:00:00Z')-Date.now())/86400000));
    const horizon=Math.max(1,Math.ceil(days*5/7)); const outcomes=[];
    for(let i=horizon;i<sorted.length;i++) {
      const base=sorted[i-horizon].close, end=sorted[i].close;
      if(base<=0)continue;
      const projected=spot*(end/base);
      outcomes.push(direction==='bullish'?projected>=breakEven:projected<=breakEven);
    }
    const wins=outcomes.filter(Boolean).length;
    return {probability:outcomes.length>=20?wins/outcomes.length:null,interval:outcomes.length>=20?wilson(wins,outcomes.length):null,sampleSize:outcomes.length,horizonTradingDays:horizon,method:'historical-overlapping-returns'};
  }
//comparar estrategias de opciones y devolver las mejores 20
  function compareStrategies(contracts, {symbol,expiration,spot,bars,multiplier=100,includeTechnical=true,includeBlackScholes=true,riskFreeRate=.05,dividendYield=0}={}) {
    const candidates=[],technical=technicalIndicators(bars);
    //filtrar contratos por tipo, simbolo subyacente, fecha de vencimiento, strike y liquidez,
    //y calcular resultados historicos y puntuacion para cada estrategia
    for(const [strategy,definition] of Object.entries(STRATEGIES)) {
      const chain=(contracts||[]).filter(c=>c.type===definition.optionType&&c.underlyingSymbol===symbol&&c.expiration===expiration&&Number.isFinite(c.strike)&&c.strike>0&&Number.isFinite(c.bid)&&Number.isFinite(c.ask)&&c.bid>0&&c.ask>=c.bid&&c.ask>0&&typeof c.timestamp==='string'&&Number.isFinite(Date.parse(c.timestamp))&&Date.now()-Date.parse(c.timestamp)<=72*3600000&&Date.parse(c.timestamp)<=Date.now()+60000&&Math.abs(c.strike-spot)<=spot*.3).sort((a,b)=>a.strike-b.strike);
     //comparar cada par de strikes y calcular resultados historicos y puntuacion
      for(let i=0;i<chain.length;i++)for(let j=i+1;j<chain.length;j++) {
        const low=chain[i],high=chain[j],width=high.strike-low.strike;
        if(!(width>0))continue;
        let long,short,net,breakEven;
        if(strategy==='BULL_CALL_SPREAD'){long=low;short=high;net=long.ask-short.bid;if(!(net>0&&net<width))continue;breakEven=low.strike+net;}
        else if(strategy==='BEAR_CALL_SPREAD'){short=low;long=high;net=short.bid-long.ask;if(!(net>0&&net<width))continue;breakEven=low.strike+net;}
        else if(strategy==='BULL_PUT_SPREAD'){long=low;short=high;net=short.bid-long.ask;if(!(net>0&&net<width))continue;breakEven=high.strike-net;}
        else {short=low;long=high;net=long.ask-short.bid;if(!(net>0&&net<width))continue;breakEven=high.strike-net;}
        const contractMultiplier=Number(long.multiplier)||multiplier;
        if((Number(short.multiplier)||multiplier)!==contractMultiplier)continue;
        const debit=definition.legs==='debit',maxProfit=(debit?width-net:net)*contractMultiplier,maxLoss=(debit?net:width-net)*contractMultiplier;
        const probability=historicalOutcomes(bars,spot,expiration,breakEven,definition.side);
        const liquidity=(long.ask-long.bid)/((long.ask+long.bid)/2)+(short.ask-short.bid)/((short.ask+short.bid)/2);
        const rawTechnicalAlignment=technical.trend===definition.side?1.1:technical.trend==='mixed'?1:technical.trend==='insufficient_data'?null:.9;
        const technicalAlignment=includeTechnical?rawTechnicalAlignment:1;
        const score=probability.probability===null||technicalAlignment===null?null:probability.probability*(maxProfit/maxLoss)*technicalAlignment/(1+liquidity);
        const blackScholes=includeBlackScholes?blackScholesProbability(spot,breakEven,expiration,technical.annualizedVolatility,definition.side,{rate:riskFreeRate,dividendYield,volatilitySampleBars:technical.sampleBars}):null;
        candidates.push({strategy,symbol,expiration,optionType:definition.optionType,side:definition.side,technicalTrend:includeTechnical?technical.trend:null,technicalAlignment,longStrike:long.strike,shortStrike:short.strike,longSymbol:long.contractSymbol,shortSymbol:short.contractSymbol,longBid:long.bid,longAsk:long.ask,longQuoteTimestamp:long.timestamp,shortBid:short.bid,shortAsk:short.ask,shortQuoteTimestamp:short.timestamp,netPremium:net,premiumType:debit?'debit':'credit',maxProfit,maxLoss,breakEven,riskReward:maxProfit/maxLoss,liquidityScore:liquidity,score,probability,blackScholes});
      }
    }
    return candidates.sort((a,b)=>(b.score??-1)-(a.score??-1)||b.probability.sampleSize-a.probability.sampleSize).slice(0,20);
  }

  function scoreFundamentals(metrics={}) {
    const clamp=value=>Math.max(0,Math.min(100,value));
    const linear=(value,low,high)=>Number.isFinite(value)?clamp((value-low)/(high-low)*100):null;
    const inverse=(value,best,worst)=>Number.isFinite(value)?clamp((worst-value)/(worst-best)*100):null;
    const components=[
      {key:'revenueGrowth',label:'Crecimiento de ingresos',weight:15,score:linear(metrics.revenueGrowth,-20,20)},
      {key:'netIncomeGrowth',label:'Crecimiento de utilidad',weight:15,score:linear(metrics.netIncomeGrowth,-20,20)},
      {key:'roe',label:'ROE',weight:15,score:linear(metrics.roe,-.1,.3)},
      {key:'netMargin',label:'Margen neto',weight:10,score:linear(metrics.netMargin,-.2,.2)},
      {key:'debtEquity',label:'Deuda/capital',weight:15,score:inverse(metrics.debtEquity,0,3)},
      {key:'currentRatio',label:'Razón corriente',weight:10,score:linear(metrics.currentRatio,.5,2)},
      {key:'pe',label:'P/E',weight:10,score:Number.isFinite(metrics.pe)?(metrics.pe<=0?0:inverse(metrics.pe,5,40)):null},
      {key:'pb',label:'P/B',weight:10,score:inverse(metrics.pb,1,10)},
    ];
    const available=components.filter(item=>item.score!==null),coverage=available.reduce((sum,item)=>sum+item.weight,0);
    if(coverage<50)return {status:'unavailable',score:null,coverage,components,method:'weighted-fundamental-heuristic-v1'};
    const score=available.reduce((sum,item)=>sum+item.score*item.weight,0)/coverage;
    return {status:'available',score,coverage,components,factor:.8+.4*(score/100),method:'weighted-fundamental-heuristic-v1'};
  }

  const api={technicalIndicators,relativeStrengthIndexSeries,simpleMovingAverageSeries,supportResistance,blackScholesProbability,scoreFundamentals,wilson,historicalOutcomes,compareStrategies};
  root.ResearchAnalysis=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
