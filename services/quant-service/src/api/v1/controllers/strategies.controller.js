const { buildVertical } = require('../../../../../strategy-service/src/domain/verticals');
const setupClient = require('../../../services/setup-client').createSetupClient();
const { evaluateVerticalSpread } = require('../../../services/vertical-spread');

const strategyCatalog = [
  {
    code: 'LONG_CALL',
    name: 'Long Call',
    expectedLegs: 1,
    phase: 'F1',
    description: 'Posición direccional alcista con exposición larga a la opción.',
  },
  {
    code: 'BULL_CALL_SPREAD',
    name: 'Bull Call Spread',
    expectedLegs: 2,
    phase: 'F3',
    description: 'Spread vertical alcista con riesgo limitado y beneficio acotado.',
  },
  {
    code: 'BULL_PUT_SPREAD',
    name: 'Bull Put Spread',
    expectedLegs: 2,
    phase: 'F3',
    description: 'Spread vertical alcista de crédito con riesgo limitado.',
  },
  {
    code: 'BEAR_CALL_SPREAD',
    name: 'Bear Call Spread',
    expectedLegs: 2,
    phase: 'F3',
    description: 'Spread vertical bajista de crédito con riesgo limitado.',
  },
  {
    code: 'BEAR_PUT_SPREAD',
    name: 'Bear Put Spread',
    expectedLegs: 2,
    phase: 'F3',
    description: 'Spread vertical bajista de débito con riesgo limitado.',
  },
  {
    code: 'IRON_CONDOR',
    name: 'Iron Condor',
    expectedLegs: 4,
    phase: 'F4',
    description: 'Estrategia neutral con cuatro patas y rangos definidos de riesgo.',
  },
];

const getStrategyTypes = (_request, response) => {
  response.status(200).json({
    phase: 'F3',
    strategies: strategyCatalog.filter(item=>item.phase==='F3'),
  });
};

const getStrategyType = (request, response) => {
  const { strategyType } = request.params;
  const result = strategyCatalog.find((item) => item.phase==='F3' && item.code === strategyType.toUpperCase());

  if (!result) {
    return response.status(404).json({ message: `Tipo de estrategia no encontrado: ${strategyType}` });
  }

  return response.status(200).json(result);
};

const buildStrategyTemplate = (request,response) => {
  try {
    const input=request.body||{};
    if(!Number.isFinite(Number(input.multiplier??100))||Number(input.multiplier??100)<=0) throw new Error('multiplier debe ser mayor que cero.');
    const result=buildVertical({...input,quantity:input.quantity??1});
    return response.json({...result,quantity:input.quantity??1,multiplier:input.multiplier??100,status:'draft',validation:{complete:!result.pendingFields.length,missingFields:result.pendingFields}});
  } catch(error) {return response.status(error.status||400).json({message:'No se pudo construir la estrategia.',detail:error.message});}
};

const evaluateStrategy = (request, response) => {
  try {
    const result = evaluateVerticalSpread(request.body || {});
    const hasBrokerQuotes = (request.body?.legs || []).some((leg) => (
      leg.bid !== undefined || leg.ask !== undefined
    ));
    return response.status(200).json({
      ...result,
      assumptions: {
        underlyingPrice: Number(request.body?.underlyingPrice || 0),
        model: 'vertical-spread',
        dataSource: hasBrokerQuotes ? 'provided-quotes' : 'provided-premiums',
      },
    });
  } catch (error) {
    return response.status(400).json({
      message: 'No se pudo evaluar el spread vertical.',
      detail: error.message,
    });
  }
};

const getSetups = async (request,response) => {
  try{const result=await setupClient.list(request);return response.json({setups:result.data,total:result.total,storage:'supabase'});}
  catch(error){return response.status(error.status||500).json({message:error.message});}
};
const createSetup = async (request,response) => {
  try {
    const body=request.body||{};
    const payload=body.underlyingTicker?body:{strategyType:body.strategyType,underlyingTicker:body.symbol,currentStockPrice:body.underlyingPrice,expirationDate:body.expiration,quantity:body.quantity??1,multiplier:body.multiplier??100,status:body.status||'draft',notes:body.notes??null,legs:(body.legs||[]).map(l=>({optionType:l.type,action:l.side,strike:l.strike,premium:l.price??l.premium,expirationDate:l.expiration||body.expiration,...(l.contractSymbol?{contractSymbol:l.contractSymbol}:{})}))};
    const result=await setupClient.create(request,payload);
    return response.status(201).json({...result,setupId:result.id,storage:'supabase'});
  }catch(error){return response.status(error.status||500).json({message:error.message});}
};

module.exports = {
  getStrategyTypes,
  getStrategyType,
  buildStrategyTemplate,
  evaluateStrategy,
  getSetups,
  createSetup,
};
