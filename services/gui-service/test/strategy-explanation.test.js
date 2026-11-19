const test = require('node:test');
const assert = require('node:assert/strict');
const explanation = require('../public/strategy-explanation');
const research = require('../public/research-analysis');
const { evaluateVerticalSpread } = require('../../quant-service/src/services/vertical-spread');

function fixture(strategy) {
  const def = explanation.definitions[strategy];
  const longStrike = def.longLower ? 100 : 110, shortStrike = def.longLower ? 110 : 100;
  const longAsk = def.premium === 'debit' ? 8 : 2, shortBid = def.premium === 'debit' ? 3 : 7;
  const timestamp = new Date(Date.now() - 1000).toISOString();
  const leg = (name, strike, bid, ask) => ({ contractSymbol:name, underlyingSymbol:'AAPL', expiration:'2027-12-17', type:def.type, strike, bid, ask, timestamp, multiplier:100 });
  const long = leg('LONG', longStrike, longAsk - .5, longAsk), short = leg('SHORT', shortStrike, shortBid, shortBid + .5);
  const candidate = { strategy, symbol:'AAPL', expiration:'2027-12-17', optionType:def.type, side:def.side, premiumType:def.premium,
    longStrike, shortStrike, longSymbol:'LONG', shortSymbol:'SHORT', longBid:long.bid, longAsk:long.ask, shortBid:short.bid, shortAsk:short.ask,
    longQuoteTimestamp:timestamp, shortQuoteTimestamp:timestamp, netPremium:5, maxProfit:500, maxLoss:500, breakEven:105, riskReward:1, score:.4 };
  return explanation.attachEvidence(candidate, [long, short], {symbol:'AAPL',price:100,source:'quote_midpoint',timestamp});
}

for (const strategy of Object.keys(explanation.definitions)) test(strategy + ': evidencia y evaluación Quant coherentes', () => {
  const candidate = fixture(strategy), checked = explanation.validateCandidate(candidate);
  assert.equal(checked.valid, true, checked.issues.join(' '));
  assert.equal(checked.evaluationRequest.legs[0].price, candidate.longAsk);
  assert.equal(checked.evaluationRequest.legs[1].price, candidate.shortBid);
  const evaluated = evaluateVerticalSpread(checked.evaluationRequest);
  assert.equal(evaluated.maxProfit, 500); assert.equal(evaluated.maxLoss, 500); assert.equal(evaluated.breakEven, 105);
  assert.deepEqual(explanation.verifyEvaluation(candidate, evaluated), { valid:true, issues:[] });
});

test('datos faltantes, cotizaciones cruzadas, fechas y estructura inválidas no se presentan como verificadas', () => {
  const variants = [
    c => { c.evidence.long = null; },
    c => { c.evidence.long.underlyingSymbol = 'MSFT'; },
    c => { c.evidence.short.expiration = '2027-01-01'; },
    c => { c.evidence.long.type = 'put'; },
    c => { c.evidence.long.ask = .1; },
    c => { c.evidence.short.timestamp = 'sin fecha'; },
    c => { c.evidence.short.timestamp = '2020-01-01T00:00:00Z'; },
    c => { c.evidence.short.multiplier = 10; },
    c => { c.evidence.long.multiplier = null; },
    c => { c.evidence.quantity = 2; },
    c => { c.evidence.underlying.symbol = 'MSFT'; },
    c => { c.evidence.underlying.timestamp = null; },
    c => { c.side = 'bearish'; },
    c => { c.longStrike = 110; },
  ];
  for (const mutate of variants) {
    const candidate = structuredClone(fixture('BULL_CALL_SPREAD')); mutate(candidate);
    const result = explanation.validateCandidate(candidate);
    assert.equal(result.valid, false); assert.ok(result.issues.length); assert.equal(result.evaluationRequest, null);
  }
});

test('detecta discrepancias con Quant y no sustituye cifras del ranking', () => {
  const candidate = fixture('BULL_CALL_SPREAD');
  const result = evaluateVerticalSpread(explanation.validateCandidate(candidate).evaluationRequest);
  const discrepancy = explanation.verifyEvaluation(candidate, { ...result, maxLoss: 700 });
  assert.equal(discrepancy.valid, false); assert.match(discrepancy.issues.join(' '), /Pérdida máxima.*500.*700/);
  assert.equal(candidate.maxLoss, 500);
});

test('posición y comparación respetan el orden, ticker y scores disponibles', () => {
  const a = fixture('BULL_CALL_SPREAD'), b = fixture('BEAR_PUT_SPREAD'), noScore = fixture('BULL_PUT_SPREAD');
  a.score = .8; b.score = .4; noScore.score = null;
  const rows = [a, b, noScore].map(candidate => ({ candidate }));
  assert.deepEqual(explanation.rankContext(b, rows), { position:2, total:3, above:a, below:noScore });
  const compared = explanation.comparisonRows(rows, 'AAPL');
  assert.equal(compared.find(row => row.strategy === 'BULL_CALL_SPREAD').candidates[0], a);
  assert.deepEqual(compared.find(row => row.strategy === 'BULL_PUT_SPREAD').candidates, []);
  assert.ok(explanation.comparisonRows(rows, 'MSFT').every(row => !row.candidates.length));
});

test('el ranking conserva fórmula y orden y Black-Scholes no modifica el score', () => {
  const now=Date.now(),timestamp=new Date(now-1000).toISOString(),expiration=new Date(now+30*86400000).toISOString().slice(0,10);
  const bars=Array.from({length:150},(_,i)=>{const close=90+i*.05;return {timestamp:new Date(now-(150-i)*86400000).toISOString(),open:close,high:close+1,low:close-1,close};});
  const contract=(type,strike,bid,ask)=>({type,strike,bid,ask,underlyingSymbol:'AAPL',expiration,contractSymbol:type+strike,timestamp,multiplier:100});
  const contracts=[contract('call',95,8,8.2),contract('call',105,3,3.2),contract('put',95,2,2.2),contract('put',105,7,7.2)];
  const options={symbol:'AAPL',expiration,spot:100,bars,includeTechnical:true};
  const ranked=research.compareStrategies(contracts,{...options,includeBlackScholes:true});
  const withoutBS=research.compareStrategies(contracts,{...options,includeBlackScholes:false});
  assert.equal(ranked.length,4);
  for(const candidate of ranked){
    assert.ok(Math.abs(candidate.score-candidate.probability.probability*candidate.riskReward*candidate.technicalAlignment/(1+candidate.liquidityScore))<1e-12);
    const equivalent=withoutBS.find(item=>item.strategy===candidate.strategy&&item.longStrike===candidate.longStrike&&item.shortStrike===candidate.shortStrike);
    assert.equal(candidate.score,equivalent.score);
  }
  assert.ok(ranked.every((candidate,index)=>index===0||ranked[index-1].score>=candidate.score));
});
