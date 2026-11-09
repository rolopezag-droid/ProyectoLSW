(function (root) {
  const STRATEGIES = {
    BULL_CALL_SPREAD: { optionType: 'call', side: 'bullish', legs: 'debit' },
    BEAR_CALL_SPREAD: { optionType: 'call', side: 'bearish', legs: 'credit' },
    BULL_PUT_SPREAD: { optionType: 'put', side: 'bullish', legs: 'credit' },
    BEAR_PUT_SPREAD: { optionType: 'put', side: 'bearish', legs: 'debit' },
  };

  function technicalIndicators(bars) {
    const sorted = (bars || []).filter(b => Number.isFinite(b.close) && Number.isFinite(b.high) && Number.isFinite(b.low)).slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
    const closes = sorted.map(b => b.close);
    const mean = values => values.reduce((a,b)=>a+b,0)/values.length;
    const sma = n => closes.length >= n ? mean(closes.slice(-n)) : null;
    let gains=0, losses=0, trSum=0;
    const first=Math.max(1,sorted.length-14);
    for(let i=first;i<sorted.length;i++) {
      const change=closes[i]-closes[i-1]; gains+=Math.max(0,change); losses+=Math.max(0,-change);
      trSum+=Math.max(sorted[i].high-sorted[i].low,Math.abs(sorted[i].high-closes[i-1]),Math.abs(sorted[i].low-closes[i-1]));
    }
    const periods=Math.max(0,sorted.length-first), avgGain=periods?gains/periods:null, avgLoss=periods?losses/periods:null;
    const rsi=periods>=14?(avgLoss===0?100:100-100/(1+avgGain/avgLoss)):null;
    const returns=[]; for(let i=1;i<closes.length;i++)if(closes[i-1]>0)returns.push(Math.log(closes[i]/closes[i-1]));
    const returnMean=returns.length?mean(returns):0;
    const volatility=returns.length>1?Math.sqrt(returns.reduce((s,r)=>s+(r-returnMean)**2,0)/(returns.length-1)*252)*100:null;
    const ma20=sma(20), ma50=sma(50), last=closes.at(-1);
    return {sampleBars:sorted.length,latestClose:last??null,sma20:ma20,sma50:ma50,rsi14:rsi,atr14:periods>=14?trSum/periods:null,annualizedVolatility:volatility,trend:ma20===null||ma50===null?'insufficient_data':last>ma20&&ma20>ma50?'bullish':last<ma20&&ma20<ma50?'bearish':'mixed',start:sorted[0]?.timestamp??null,end:sorted.at(-1)?.timestamp??null};
  }

  function wilson(successes,total,z=1.96) {
    if(!total)return null; const p=successes/total,z2=z*z,den=1+z2/total;
    const center=(p+z2/(2*total))/den,half=z*Math.sqrt(p*(1-p)/total+z2/(4*total*total))/den;
    return {lower:Math.max(0,center-half),upper:Math.min(1,center+half),confidence:0.95};
  }

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

  function compareStrategies(contracts, {symbol,expiration,spot,bars,multiplier=100}={}) {
    const candidates=[],technical=technicalIndicators(bars);
    for(const [strategy,definition] of Object.entries(STRATEGIES)) {
      const chain=(contracts||[]).filter(c=>c.type===definition.optionType&&c.underlyingSymbol===symbol&&c.expiration===expiration&&Number.isFinite(c.strike)&&c.strike>0&&Number.isFinite(c.bid)&&Number.isFinite(c.ask)&&c.bid>0&&c.ask>=c.bid&&c.ask>0&&typeof c.timestamp==='string'&&Number.isFinite(Date.parse(c.timestamp))&&Date.now()-Date.parse(c.timestamp)<=72*3600000&&Date.parse(c.timestamp)<=Date.now()+60000&&Math.abs(c.strike-spot)<=spot*.3).sort((a,b)=>a.strike-b.strike);
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
        const technicalAlignment=technical.trend===definition.side?1.1:technical.trend==='mixed'?1:technical.trend==='insufficient_data'?null:.9;
        const score=probability.probability===null||technicalAlignment===null?null:probability.probability*(maxProfit/maxLoss)*technicalAlignment/(1+liquidity);
        candidates.push({strategy,symbol,expiration,optionType:definition.optionType,side:definition.side,technicalTrend:technical.trend,technicalAlignment,longStrike:long.strike,shortStrike:short.strike,longSymbol:long.contractSymbol,shortSymbol:short.contractSymbol,longBid:long.bid,longAsk:long.ask,longQuoteTimestamp:long.timestamp,shortBid:short.bid,shortAsk:short.ask,shortQuoteTimestamp:short.timestamp,netPremium:net,premiumType:debit?'debit':'credit',maxProfit,maxLoss,breakEven,riskReward:maxProfit/maxLoss,liquidityScore:liquidity,score,probability});
      }
    }
    return candidates.sort((a,b)=>(b.score??-1)-(a.score??-1)||b.probability.sampleSize-a.probability.sampleSize).slice(0,20);
  }

  const api={technicalIndicators,wilson,historicalOutcomes,compareStrategies};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ResearchAnalysis=api;
})(globalThis);
