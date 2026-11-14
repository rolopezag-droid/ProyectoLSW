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
    const { symbol, timeframe, limit, start, end, sort } = request.query;

    if (!symbol || !/^[A-Z0-9.-]+$/i.test(symbol)) {
      return response.status(400).json({ message: 'symbol debe ser un ticker válido.' });
    }

    if (timeframe !== undefined && (typeof timeframe !== 'string' || !ALLOWED_TIMEFRAMES.includes(timeframe))) {
      return response.status(400).json({
        message: `timeframe debe ser uno de: ${ALLOWED_TIMEFRAMES.join(', ')}.`,
      });
    }
    const normalizedTimeframe = timeframe === undefined ? '1Day' : timeframe;
    const normalizedLimit = Math.min(Math.max(Number(limit) || 100, 1), 10000);

    const bars = await broker.getCandles({
      symbol,
      timeframe: normalizedTimeframe,
      limit: normalizedLimit,
      start,
      end,
      sort,
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
module.exports = { ingestOptions, readIngestion, getAccount, getQuote, getOptionChain, getOptionStrikes, getCandles, getNews, createOrder, createSpread };
