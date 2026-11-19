const { createBroker } = require('../../../brokers');
const {
  brokerProvider,
  alpacaKeyId,
  alpacaSecretKey,
  alpacaTradingBaseUrl,
  alpacaDataBaseUrl,
  alpacaStocksFeed,
  alpacaOptionsFeed,
} = require('../../../config/env');

const broker = createBroker({
  provider: brokerProvider,
  keyId: alpacaKeyId,
  secretKey: alpacaSecretKey,
  tradingBaseUrl: alpacaTradingBaseUrl,
  dataBaseUrl: alpacaDataBaseUrl,
  stockFeed: alpacaStocksFeed,
  optionsFeed: alpacaOptionsFeed,
});

const ALLOWED_TIMEFRAMES = ['15Min', '1Hour', '1Day', '1Week', '1Month', '3Month', '6Month', '12Month'];
const MAX_CANDLES = 10000;

function validMarketDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false;
  const datePart = value.slice(0, 10);
  const calendarDate = new Date(datePart + 'T00:00:00Z');
  return Number.isFinite(calendarDate.getTime()) && calendarDate.toISOString().slice(0, 10) === datePart && Number.isFinite(Date.parse(value));
}

const getAccount = async (_request, response) => {
  try {
    return response.json(await broker.getAccount());
  } catch (error) {
    return response.status(error.status || 502).json({
      message: 'No se pudo consultar la cuenta del broker.',
      detail: error.message,
    });
  }
};

const getQuote = async (request, response) => {
  try {
    return response.json(await broker.getQuote(request.query.symbol));
  } catch (error) {
    return response.status(error.status || 502).json({
      message: 'No se pudo consultar la cotización.',
      detail: error.message,
    });
  }
};

const getOptionChain = async (request, response) => {
  try {
    const { symbol, expiration, minStrike, maxStrike, limit, type, pageToken } = request.query;
    const strikeRange = minStrike !== undefined && maxStrike !== undefined
      ? [minStrike, maxStrike]
      : undefined;
    return response.json(await broker.getOptionChain({
      symbol,
      expiration,
      strikeRange,
      limit,
      type,
      pageToken,
    }));
  } catch (error) {
    return response.status(error.status || 502).json({
      message: 'No se pudo consultar la cadena de opciones.',
      detail: error.message,
    });
  }
};

const getCandles = async (request, response) => {
  try {
    const { symbol, timeframe, limit, start, end, sort, pageToken } = request.query;

    if (typeof symbol !== 'string' || !/^[A-Z0-9.-]{1,12}$/i.test(symbol)) {
      return response.status(400).json({ message: 'symbol debe ser un ticker válido.' });
    }

    if (timeframe !== undefined && (typeof timeframe !== 'string' || !ALLOWED_TIMEFRAMES.includes(timeframe))) {
      return response.status(400).json({
        message: `timeframe debe ser uno de: ${ALLOWED_TIMEFRAMES.join(', ')}.`,
      });
    }
    const normalizedTimeframe = timeframe === undefined ? '1Day' : timeframe;
    if (limit !== undefined && (typeof limit !== 'string' || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > MAX_CANDLES)) {
      return response.status(400).json({ message: `limit debe ser un entero entre 1 y ${MAX_CANDLES}.` });
    }
    for (const [name, value] of [['start', start], ['end', end]]) {
      if (value !== undefined && (!validMarketDate(value) || Date.parse(value) > Date.now())) {
        return response.status(400).json({ message: `${name} debe ser una fecha válida no futura.` });
      }
    }
    if (start !== undefined && end !== undefined && Date.parse(start) >= Date.parse(end)) {
      return response.status(400).json({ message: 'start debe ser anterior a end.' });
    }
    if (sort !== undefined && !['asc', 'desc'].includes(sort)) return response.status(400).json({ message: 'sort debe ser asc o desc.' });
    if (pageToken !== undefined && (typeof pageToken !== 'string' || !pageToken || pageToken.length > 4096)) return response.status(400).json({ message: 'pageToken no es válido.' });
    const normalizedLimit = limit === undefined ? 100 : Number(limit);

    const bars = await broker.getCandles({
      symbol,
      timeframe: normalizedTimeframe,
      limit: normalizedLimit,
      start,
      end,
      sort,
      ...(pageToken ? { pageToken } : {}),
    });

    return response.json(bars);
  } catch (error) {
    return response.status(error.status || 502).json({
      message: 'No se pudo obtener las velas del ticker.',
      detail: error.message,
    });
  }
};

const getNews = async (request, response) => {
  try {
    const { symbols, start, end, limit, sort } = request.query;
    return response.json(await broker.getNews({ symbols, start, end, limit, sort }));
  } catch (error) {
    return response.status(error.status || 502).json({
      message: 'No se pudieron consultar noticias de Alpaca.',
      detail: error.message,
    });
  }
};

const createOrder = async (request, response) => {
  try {
    const { symbol, qty, side, type = 'market', timeInForce = 'day', limitPrice, stopLossPrice } = request.body || {};

    if (!symbol || !qty || !side) {
      return response.status(400).json({ message: 'Se requiere symbol, qty y side (buy|sell) para crear la orden.' });
    }

    if (!['buy', 'sell'].includes(String(side).toLowerCase())) {
      return response.status(400).json({ message: 'side debe ser buy o sell.' });
    }

    const order = await broker.createOrder({
      symbol,
      qty,
      side,
      type,
      timeInForce,
      limitPrice,
      stopLossPrice,
    });

    return response.status(201).json(order);
  } catch (error) {
    return response.status(error.status || 502).json({
      message: 'No se pudo crear la orden en el broker.',
      detail: error.message,
    });
  }
};

const createSpread = async (request, response) => {
  try {
    const { symbol, legs, qty, quantity, type, limitPrice, clientOrderId } = request.body || {};
    if (!symbol || !Array.isArray(legs) || legs.length !== 2) {
      return response.status(400).json({ message: 'Se requiere symbol y legs con exactamente dos patas para crear el spread F3.' });
    }
    const spread = await broker.createSpread({ symbol, legs, qty, quantity, type, limitPrice, clientOrderId });
    return response.status(201).json(spread);
  } catch (error) {
    return response.status(error.status || 502).json({
      message: 'No se pudo crear el spread en el broker.',
      detail: error.message,
    });
  }
};

const ingestor=require('../../../services/ingestion').createIngestor(broker);
const ingestOptions=async(req,res)=>{try{return res.status(201).json(await ingestor.run(req.body));}catch(error){return res.status(error.status||502).json({message:'No se pudo completar la ingestión.',detail:error.message});}};
const readIngestion=async(req,res)=>{try{return res.json(await ingestor.read(req.params.id));}catch(error){return res.status(error.status||502).json({message:error.message});}};
const getOptionStrikes = async (request, response) => {
  try {
    const { symbol, expiration, type } = request.query;
    if (!symbol || !/^[A-Z0-9.-]+$/i.test(symbol)) {
      return response.status(400).json({ message: 'symbol debe ser un ticker válido.' });
    }
    if (expiration && !/^\d{4}-\d{2}-\d{2}$/.test(expiration)) {
      return response.status(400).json({ message: 'expiration debe usar YYYY-MM-DD.' });
    }
    if (type !== undefined && !['call', 'put'].includes(type)) {
      return response.status(400).json({ message: 'type debe ser call o put.' });
    }
    const contracts = await broker.getOptionChain({ symbol, expiration, type, limit: 1000 });
    const strikes = [...new Set((contracts.contracts || []).map(c => Number(c.strike)).filter(s => Number.isFinite(s)))].sort((a, b) => a - b);
    return response.json({ provider: 'alpaca', symbol: symbol.toUpperCase(), expiration: expiration || null, type: type || null, strikes, count: strikes.length });
  } catch (error) {
    return response.status(error.status || 502).json({ message: 'No se pudo consultar los strikes.', detail: error.message });
  }
};

const getOptionQuote = async (request, response) => {
  try {
    const { symbol, expiration, type, strike } = request.query;
    if (!symbol || !/^[A-Z0-9.-]+$/i.test(symbol)) {
      return response.status(400).json({ message: 'symbol debe ser un ticker válido.' });
    }
    if (expiration && !/^\d{4}-\d{2}-\d{2}$/.test(expiration)) {
      return response.status(400).json({ message: 'expiration debe usar YYYY-MM-DD.' });
    }
    if (type !== undefined && !['call', 'put'].includes(type)) {
      return response.status(400).json({ message: 'type debe ser call o put.' });
    }
    if (strike === undefined || strike === null || strike === '') {
      return response.status(400).json({ message: 'strike es obligatorio.' });
    }
    const strikeNum = Number(strike);
    if (!Number.isFinite(strikeNum) || strikeNum <= 0) {
      return response.status(400).json({ message: 'strike debe ser un número positivo.' });
    }

    const contracts = await broker.getOptionChain({ symbol, expiration, type, limit: 1000 });
    const contract = (contracts.contracts || []).find(c => Number(c.strike) === strikeNum);
    if (!contract) {
      return response.status(404).json({ message: `No se encontró contrato para strike ${strikeNum}.` });
    }
    return response.json({
      provider: 'alpaca',
      symbol: symbol.toUpperCase(),
      expiration: contract.expiration_date,
      type: contract.type,
      strike: Number(contract.strike),
      contractSymbol: contract.contractSymbol,
      bid: contract.bid ?? null,
      ask: contract.ask ?? null,
      bidSize: contract.bidSize ?? null,
      askSize: contract.askSize ?? null,
      timestamp: contract.timestamp ?? null,
    });
  } catch (error) {
    return response.status(error.status || 502).json({
      message: 'No se pudo consultar la cotización del contrato.',
      detail: error.message,
    });
  }
};

module.exports = { ingestOptions, readIngestion, getAccount, getQuote, getOptionChain, getOptionStrikes, getOptionQuote, getCandles, getNews, createOrder, createSpread };
