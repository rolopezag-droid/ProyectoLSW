const { blackScholesGreeks, blackScholesPrice, getTimeToMaturity } = require('../../../services/option-pricing');

const normalizePriceRequest = (body) => {
  if(body.model && body.model!=='black-scholes')throw new Error('El modelo disponible es black-scholes.');
  const timeToMaturity = body.timeToMaturity ?? (body.expiration ? getTimeToMaturity(body.expiration) : 0.25);

  return {
    model: body.model || 'black-scholes',
    symbol: body.symbol || 'UNKNOWN',
    spot: Number(body.spot),
    strike: Number(body.strike),
    expiration: body.expiration || null,
    rate: Number(body.rate || 0),
    dividendYield: Number(body.dividendYield || 0),
    volatility: Number(body.volatility),
    optionType: body.optionType || 'call',
    steps: Number(body.steps || 100),
    timeToMaturity,
  };
};

const getPrices = (request, response) => {
  try {
    const payload = normalizePriceRequest(request.body || {});

    const price = blackScholesPrice(payload);
    const greeks = blackScholesGreeks(payload);

    response.status(200).json({
      model: payload.model,
      currency: 'USD',
      symbol: payload.symbol,
      price: Number(price.toFixed(4)),
      greeks,
      assumptions: {
        spot: payload.spot,
        strike: payload.strike,
        rate: payload.rate,
        dividendYield: payload.dividendYield,
        volatility: payload.volatility,
        timeToMaturityYears: Number(payload.timeToMaturity.toFixed(6)),
      },
      calculatedAt: new Date().toISOString(),
    });
  } catch (error) {
    response.status(400).json({
      message: 'No se pudo calcular el precio de la opción.',
      detail: error.message,
    });
  }
};

const getGreeks = (request, response) => {
  try {
    const payload = normalizePriceRequest(request.body || {});
    const greeks = blackScholesGreeks(payload);

    response.status(200).json({
      model: payload.model,
      symbol: payload.symbol,
      greeks,
      assumptions: {
        spot: payload.spot,
        strike: payload.strike,
        rate: payload.rate,
        dividendYield: payload.dividendYield,
        volatility: payload.volatility,
        timeToMaturityYears: Number(payload.timeToMaturity.toFixed(6)),
      },
      calculatedAt: new Date().toISOString(),
    });
  } catch (error) {
    response.status(400).json({
      message: 'No se pudo calcular las griegas.',
      detail: error.message,
    });
  }
};

const getImpliedVolatility = (request, response) => {
  try {
    const body=request.body || {};
    const marketPrice=Number(body.marketPrice), tolerance=Number(body.tolerance ?? 1e-8), maxIterations=Number(body.maxIterations ?? 200);
    const initial=Number(body.initialGuess ?? 0.2);
    if(!Number.isFinite(marketPrice)||marketPrice<0||!Number.isFinite(initial)||initial<=0||initial>10||!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>1000||!Number.isFinite(tolerance)||tolerance<1e-12||tolerance>0.01) throw new Error('marketPrice, initialGuess, tolerance o maxIterations inválidos (iteraciones de 1 a 1000).');
    const payload=normalizePriceRequest({...body,volatility:initial});
    blackScholesPrice(payload);
    const discountedSpot=payload.spot*Math.exp(-payload.dividendYield*payload.timeToMaturity);
    const discountedStrike=payload.strike*Math.exp(-payload.rate*payload.timeToMaturity);
    const minimum=Math.max(0,payload.optionType==='call'?discountedSpot-discountedStrike:discountedStrike-discountedSpot);
    const maximum=payload.optionType==='call'?discountedSpot:discountedStrike;
    if(marketPrice<minimum-tolerance||marketPrice>=maximum) return response.status(422).json({message:'marketPrice está fuera de los límites de no arbitraje del modelo.',converged:false});
    let lo=1e-8,hi=10,volatility=initial,iterations=0,modelPrice,pricingError,converged=false;
    for(iterations=1;iterations<=maxIterations;iterations++) {
      modelPrice=blackScholesPrice({...payload,volatility});pricingError=modelPrice-marketPrice;
      if(Math.abs(pricingError)<=tolerance){converged=true;break;}
      if(pricingError>0)hi=volatility;else lo=volatility;
      const vega=blackScholesGreeks({...payload,volatility}).vega;
      const next=volatility-pricingError/vega;
      volatility=Number.isFinite(next)&&next>lo&&next<hi?next:(lo+hi)/2;
    }
    modelPrice=blackScholesPrice({...payload,volatility});pricingError=modelPrice-marketPrice;
    converged=converged||Math.abs(pricingError)<=tolerance;
    return response.status(converged?200:422).json({impliedVolatility:Number(volatility.toFixed(8)),converged,iterations:Math.min(iterations,maxIterations),method:'newton-raphson-bisection',modelPrice:Number(modelPrice.toFixed(6)),pricingError:Number(pricingError.toFixed(8)),assumptions:{spot:payload.spot,strike:payload.strike,rate:payload.rate,dividendYield:payload.dividendYield,timeToMaturityYears:payload.timeToMaturity,optionType:payload.optionType},calculatedAt:new Date().toISOString()});
  } catch(error) { return response.status(400).json({message:'No se pudo calcular la volatilidad implícita.',detail:error.message}); }
};

module.exports = {
  getPrices,
  getGreeks,
  getImpliedVolatility,
};
