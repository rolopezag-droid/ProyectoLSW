const { buildSpreadOrder } = require('./order-builder');
const BrokerAdapter = require('../broker-adapter');

class AlpacaAdapter extends BrokerAdapter {
  constructor({
    keyId,
    secretKey,
    tradingBaseUrl,
    dataBaseUrl,
    stockFeed = 'iex',
    optionsFeed = 'indicative',
    fetchImplementation = fetch,
  }) {
    super();
    this.keyId = keyId;
    this.secretKey = secretKey;
    this.tradingBaseUrl = tradingBaseUrl.replace(/\/$/, '');
    this.dataBaseUrl = dataBaseUrl.replace(/\/$/, '');
    this.stockFeed = stockFeed;
    this.optionsFeed = optionsFeed;
    this.fetch = fetchImplementation;
  }

  async request(baseUrl, path, options = {}) {
    const response = await this.fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      signal: AbortSignal.timeout(30000),
      headers: {
        'APCA-API-KEY-ID': this.keyId,
        'APCA-API-SECRET-KEY': this.secretKey,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body ? { body: options.body } : {}),
    });
    const body = await response.json();
    if (!response.ok) {
      const error = new Error(body.message || 'Alpaca rechazó la solicitud.');
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async getAccount() {
    const account = await this.request(this.tradingBaseUrl, '/v2/account');
    return {
      provider: 'alpaca',
      id: account.id,
      status: account.status,
      currency: account.currency,
      buyingPower: account.buying_power,
      cash: account.cash,
      tradingBlocked: account.trading_blocked,
    };
  }

  async getQuote(symbol) {
    if (!symbol || !/^[A-Z0-9.-]+$/i.test(symbol)) {
      const error = new Error('symbol debe ser un ticker válido.');
      error.status = 400;
      throw error;
    }
    const quote = await this.request(
      this.dataBaseUrl,
      `/v2/stocks/${encodeURIComponent(symbol.toUpperCase())}/quotes/latest`,
    );
    const result = {
      provider: 'alpaca', symbol: symbol.toUpperCase(),
      bid: quote.quote?.bp ?? null, ask: quote.quote?.ap ?? null,
      bidSize: quote.quote?.bs ?? null, askSize: quote.quote?.as ?? null,
      timestamp: quote.quote?.t ?? null,
      referencePrice: null, referenceSource: null, referenceTimestamp: null,
    };
    const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
    if (positive(result.bid) && positive(result.ask) && result.ask >= result.bid) {
      result.referencePrice = (result.bid + result.ask) / 2;
      result.referenceSource = 'quote_midpoint';
      result.referenceTimestamp = result.timestamp;
    } else {
      try {
        const { trade } = await this.request(this.dataBaseUrl, `/v2/stocks/${encodeURIComponent(symbol.toUpperCase())}/trades/latest`);
        if (positive(trade?.p) && typeof trade.t === 'string' && Number.isFinite(Date.parse(trade.t))) {
          result.referencePrice = trade.p; result.referenceSource = 'latest_trade'; result.referenceTimestamp = trade.t;
        }
      } catch { /* Conservar cotización incompleta; el cliente informa ausencia de referencia. */ }
    }
    return result;
  }

  async getCandles({ symbol, timeframe = '1Day', limit = 100, start, end, sort } = {}) {
    if (!symbol || !/^[A-Z0-9.-]+$/i.test(symbol)) {
      const error = new Error('symbol debe ser un ticker válido.');
      error.status = 400;
      throw error;
    }
    const params = new URLSearchParams({
      timeframe,
      feed: this.stockFeed,
      limit: String(Math.min(Math.max(Number(limit) || 100, 1), 10000)),
    });
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    if (sort) params.set('sort', sort);
    const response = await this.request(
      this.dataBaseUrl,
      `/v2/stocks/${encodeURIComponent(symbol.toUpperCase())}/bars?${params.toString()}`,
    );
    const bars = (response.bars || []).map((bar) => ({
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      tradeCount: bar.n ?? null,
      vwap: bar.vw ?? null,
    }));

    return {
      provider: 'alpaca',
      symbol: symbol.toUpperCase(),
      timeframe,
      feed: this.stockFeed,
      bars,
      nextPageToken: response.next_page_token ?? null,
      capturedAt: new Date().toISOString(),
    };
  }

  async getNews({ symbols, start, end, limit = 50, sort = 'desc' } = {}) {
    const list = Array.isArray(symbols) ? symbols : String(symbols || '').split(',').filter(Boolean);
    const normalized = [...new Set(list.map(value => String(value).trim().toUpperCase()))];
    if (!normalized.length || normalized.length > 10 || normalized.some(value => !/^[A-Z0-9.-]{1,12}$/.test(value))) {
      const error = new Error('symbols debe incluir entre 1 y 10 tickers válidos.');
      error.status = 400;
      throw error;
    }
    if (sort !== 'asc' && sort !== 'desc') {
      const error = new Error('sort debe ser asc o desc.');
      error.status = 400;
      throw error;
    }
    const pageLimit = Math.min(Math.max(Number(limit) || 50, 1), 50);
    const params = new URLSearchParams({ symbols: normalized.join(','), sort, limit: String(pageLimit), include_content: 'false' });
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const response = await this.request(this.dataBaseUrl, `/v1beta1/news?${params.toString()}`);
    return {
      provider: 'alpaca',
      symbols: normalized,
      articles: response.news || response.articles || [],
      nextPageToken: response.next_page_token ?? null,
      capturedAt: new Date().toISOString(),
    };
  }

  async createOrder({ symbol, qty, side, type = 'market', timeInForce = 'day', limitPrice, stopLossPrice } = {}) {
    this.assertPaper();
    if (typeof symbol !== 'string' || !/^[A-Z0-9.]{1,30}$/i.test(symbol) || !Number.isFinite(Number(qty)) || Number(qty)<=0 || !['market','limit','stop','stop_limit'].includes(type) || !['day','gtc'].includes(timeInForce)) { const e=new Error('Parámetros de orden inválidos.');e.status=400;throw e; }
    if ((['limit','stop_limit'].includes(type)&&!(Number(limitPrice)>0)) || (['stop','stop_limit'].includes(type)&&!(Number(stopLossPrice)>0))) {const e=new Error('Los precios límite/stop deben ser mayores que cero.');e.status=400;throw e;}
    if (!symbol || !qty || !['buy', 'sell'].includes(String(side || '').toLowerCase())) {
      const error = new Error('createOrder requiere symbol, qty y side (buy|sell).');
      error.status = 400;
      throw error;
    }
    const order = {
      symbol: symbol.toUpperCase(),
      qty: String(qty),
      side: String(side).toLowerCase(),
      type,
      time_in_force: timeInForce,
    };
    if (type === 'limit' || type === 'stop_limit') order.limit_price = String(limitPrice ?? 0);
    if (type === 'stop' || type === 'stop_limit') order.stop_price = String(stopLossPrice ?? 0);

    const created = await this.request(this.tradingBaseUrl, '/v2/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    });

    return {
      provider: 'alpaca',
      id: created.id ?? null,
      clientOrderId: created.client_order_id ?? null,
      status: created.status ?? null,
      symbol: created.symbol ?? symbol.toUpperCase(),
      qty: created.qty ?? String(qty),
      side: created.side ?? String(side).toLowerCase(),
      type: created.type ?? type,
      timeInForce: created.time_in_force ?? timeInForce,
      limitPrice: created.limit_price ?? null,
      createdAt: created.created_at ?? new Date().toISOString(),
    };
  }

  assertPaper() {
    if (new URL(this.tradingBaseUrl).hostname !== 'paper-api.alpaca.markets') {
      const error = new Error('La ejecución del proyecto está limitada a Alpaca Paper.');
      error.status = 403;
      throw error;
    }
  }

  async createSpread(input) {
    this.assertPaper();
    const order = buildSpreadOrder(input);
    const created = await this.request(this.tradingBaseUrl, '/v2/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    });
    return { provider: 'alpaca', ...created, legs: created.legs || order.legs };
  }

  async getOptionChain({ symbol, expiration, strikeRange, limit = 100, type, pageToken }) {
    if (!symbol || !/^[A-Z0-9.-]+$/i.test(symbol)) {
      const error = new Error('symbol debe ser un ticker válido.');
      error.status = 400;
      throw error;
    }
    if (expiration && !/^\d{4}-\d{2}-\d{2}$/.test(expiration)) {
      const error = new Error('expiration debe usar el formato YYYY-MM-DD.');
      error.status = 400;
      throw error;
    }

    if (type !== undefined && !['call', 'put'].includes(type)) {
      const error = new Error('type debe ser call o put.'); error.status = 400; throw error;
    }
    if (pageToken !== undefined && (typeof pageToken !== 'string' || pageToken.length > 4096)) {
      const error = new Error('pageToken debe ser una cadena válida.'); error.status = 400; throw error;
    }
    const params = new URLSearchParams({
      underlying_symbols: symbol.toUpperCase(),
      status: 'active',
      limit: String(Math.min(Math.max(Number(limit) || 100, 1), 1000)),
    });
    if (expiration) params.set('expiration_date', expiration);
    if (type) params.set('type', type);
    if (pageToken) params.set('page_token', pageToken);
    if (strikeRange) {
      params.set('strike_price_gte', String(strikeRange[0]));
      params.set('strike_price_lte', String(strikeRange[1]));
    }
    const contractsResponse = await this.request(
      this.tradingBaseUrl,
      `/v2/options/contracts?${params.toString()}`,
    );
    const contracts = contractsResponse.option_contracts || contractsResponse.contracts || [];
    const quoteSymbols = [...new Set(contracts.map((contract) => contract.symbol))];
    let quotes = {};
    for (let offset = 0; offset < quoteSymbols.length; offset += 100) {
      const quoteParams = new URLSearchParams({
        symbols: quoteSymbols.slice(offset, offset + 100).join(','),
        feed: this.optionsFeed,
      });
      const quoteResponse = await this.request(
        this.dataBaseUrl,
        `/v1beta1/options/quotes/latest?${quoteParams.toString()}`,
      );
      Object.assign(quotes, quoteResponse.quotes || {});
    }

    const normalizedContracts = contracts.map((contract) => {
      const symbolValue = contract.symbol;
      const quote = quotes[symbolValue] || {};
      return {
        contractSymbol: symbolValue,
        underlyingSymbol: contract.underlying_symbol,
        type: String(contract.type || '').toLowerCase(),
        strike: Number(contract.strike_price),
        expiration: contract.expiration_date,
        multiplier: Number(contract.size || 100),
        status: contract.status,
        tradable: contract.tradable !== false,
        bid: quote.bp ?? null,
        ask: quote.ap ?? null,
        bidSize: quote.bs ?? null,
        askSize: quote.as ?? null,
        timestamp: quote.t ?? null,
      };
    });

    return {
      provider: 'alpaca',
      symbol: symbol.toUpperCase(),
      expiration: expiration || null,
      contracts: normalizedContracts,
      nextPageToken: contractsResponse.next_page_token || null,
      capturedAt: new Date().toISOString(),
    };
  }
}

module.exports = AlpacaAdapter;
