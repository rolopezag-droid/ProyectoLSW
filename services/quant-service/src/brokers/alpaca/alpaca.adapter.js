const BrokerAdapter = require('../broker-adapter');

class AlpacaAdapter extends BrokerAdapter {
  constructor({
    keyId,
    secretKey,
    tradingBaseUrl,
    dataBaseUrl,
    optionsFeed = 'indicative',
    fetchImplementation = fetch,
  }) {
    super();
    this.keyId = keyId;
    this.secretKey = secretKey;
    this.tradingBaseUrl = tradingBaseUrl.replace(/\/$/, '');
    this.dataBaseUrl = dataBaseUrl.replace(/\/$/, '');
    this.optionsFeed = optionsFeed;
    this.fetch = fetchImplementation;
  }

  async request(baseUrl, path, options = {}) {
    const response = await this.fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
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
    return {
      provider: 'alpaca',
      symbol: symbol.toUpperCase(),
      bid: quote.quote?.bp ?? null,
      ask: quote.quote?.ap ?? null,
      bidSize: quote.quote?.bs ?? null,
      askSize: quote.quote?.as ?? null,
      timestamp: quote.quote?.t ?? null,
    };
  }

  async getCandles({ symbol, timeframe = '1Day', limit = 100, start, end, sort } = {}) {
    if (!symbol || !/^[A-Z0-9.-]+$/i.test(symbol)) {
      const error = new Error('symbol debe ser un ticker válido.');
      error.status = 400;
      throw error;
    }
    const params = new URLSearchParams({
      timeframe,
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
      bars,
      nextPageToken: response.next_page_token ?? null,
      capturedAt: new Date().toISOString(),
    };
  }

  async createOrder({ symbol, qty, side, type = 'market', timeInForce = 'day', limitPrice, stopLossPrice } = {}) {
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

  async createSpread({ symbol, qty = 1, legs, type = 'market', timeInForce = 'day', limitPrice, positionIntent } = {}) {
    if (!symbol || !Array.isArray(legs) || legs.length < 2) {
      const error = new Error('createSpread requiere symbol y legs con al menos dos patas.');
      error.status = 400;
      throw error;
    }
    const spreadLegs = legs.map((leg) => {
      const side = String(leg.side || '').toLowerCase();
      const normalized = {
        symbol: leg.symbol,
        side,
        ratio_qty: String(leg.ratioQty ?? leg.qty ?? 1),
      };
      // Alpaca MLEG: position_intent por pata ayuda a abrir spreads correctamente (buy_to_open/sell_to_open).
      const intent = leg.positionIntent || positionIntent;
      if (intent) normalized.position_intent = intent;
      else if (['buy', 'sell'].includes(side)) normalized.position_intent = side === 'buy' ? 'buy_to_open' : 'sell_to_open';
      return normalized;
    });

    const order = {
      order_class: 'mleg',
      qty: String(qty),
      type,
      time_in_force: timeInForce,
      legs: spreadLegs,
    };
    if ((type === 'limit' || type === 'stop_limit') && limitPrice != null) order.limit_price = String(limitPrice);

    const created = await this.request(this.tradingBaseUrl, '/v2/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    });
    return { provider: 'alpaca', ...created, legs: created.legs || spreadLegs };
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
