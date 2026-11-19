const test = require('node:test');
const assert = require('node:assert/strict');
const { blackScholesPrice, blackScholesGreeks } = require('../src/services/option-pricing');

test('Delta, Gamma, Theta y Vega de Black-Scholes coinciden con referencias y diferencias finitas', () => {
  const input = { spot:100, strike:100, rate:.05, dividendYield:0, volatility:.2, timeToMaturity:1, optionType:'call' };
  const greeks = blackScholesGreeks(input), expected = { delta:.636831, gamma:.018762, theta:-6.414028, vega:37.524035 };
  for (const [name,value] of Object.entries(expected)) assert.ok(Math.abs(greeks[name] - value) < .001, name);
  const h = .01, base = blackScholesPrice(input), up = blackScholesPrice({ ...input, spot:input.spot+h }), down = blackScholesPrice({ ...input, spot:input.spot-h });
  assert.ok(Math.abs((up-down)/(2*h)-greeks.delta) < .0001);
  assert.ok(Math.abs((up-2*base+down)/(h*h)-greeks.gamma) < .0001);
  const sigma = .0001, volUp = blackScholesPrice({ ...input, volatility:input.volatility+sigma }), volDown = blackScholesPrice({ ...input, volatility:input.volatility-sigma });
  assert.ok(Math.abs((volUp-volDown)/(2*sigma)-greeks.vega) < .001);
  const time = .0001, later = blackScholesPrice({ ...input, timeToMaturity:input.timeToMaturity+time }), earlier = blackScholesPrice({ ...input, timeToMaturity:input.timeToMaturity-time });
  assert.ok(Math.abs(-(later-earlier)/(2*time)-greeks.theta) < .001);
});

test('las griegas PUT mantienen referencias y paridad con CALL', () => {
  const input = { spot:100, strike:100, rate:.05, dividendYield:0, volatility:.2, timeToMaturity:1 };
  const call=blackScholesGreeks({ ...input, optionType:'call' }),put=blackScholesGreeks({ ...input, optionType:'put' });
  const expected={delta:-.363169,gamma:.018762,theta:-1.657881,vega:37.524035};
  for(const [name,value] of Object.entries(expected))assert.ok(Math.abs(put[name]-value)<.001,name);
  assert.ok(Math.abs((call.delta-put.delta)-1)<.00001);
  assert.equal(call.gamma,put.gamma);assert.equal(call.vega,put.vega);
});
