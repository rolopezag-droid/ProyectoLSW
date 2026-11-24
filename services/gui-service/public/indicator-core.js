/* Independent event-based heuristic. Reuses existing rules, never sends orders. */
(function(root){
 const triggers=typeof module!=='undefined'&&module.exports?require('./strategy-triggers'):root.StrategyTriggers;
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
 function evaluate(bars,{symbol='',now=Date.now()}={}){
  const today=day.format(new Date(now)),seen=new Set();
  const closed=(bars||[]).filter(bar=>{const time=Date.parse(bar.timestamp);if(!Number.isFinite(time)||day.format(new Date(time))>=today||seen.has(time)||![bar.open,bar.high,bar.low,bar.close].every(Number.isFinite)||bar.low<=0||bar.high<bar.low||bar.close<bar.low||bar.close>bar.high||bar.open<bar.low||bar.open>bar.high)return false;seen.add(time);return true;}).slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
  const base={symbol,sampleBars:closed.length,windowBars:5,asOf:closed.at(-1)?.timestamp||null,method:'recent-closed-events-v1'};
  if(closed.length<50)return {...base,status:'unavailable',reason:'Se requieren al menos 50 velas diarias cerradas válidas.',bullScore:null,bearScore:null,signals:[]};
  const recent=new Set(closed.slice(-5).map(bar=>bar.timestamp));
  const events=triggers.computeTechnicalSignals(closed,{symbol,timeframe:'1Day',indicators:['sma_up','sma_down','rsi','support']});
  const latest=new Map();for(const event of events)if(recent.has(event.timestamp))latest.set(event.rule,event);
  const signals=[...latest.values()],balance=signals.length?signals.reduce((sum,event)=>sum+(event.side==='bullish'?1:-1),0)/signals.length:0;
  const bullScore=50+50*balance;
  return {...base,status:'available',bullScore,bearScore:100-bullScore,signals,direction:balance>0?'bullish':balance<0?'bearish':'mixed',reason:signals.length?'Última señal reciente por familia, con igual peso.':'Sin señales nuevas en las últimas cinco velas cerradas; neutralidad 50, no una orden.'};
 }
 const api={evaluate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IndicatorCore=api;
})(globalThis);
