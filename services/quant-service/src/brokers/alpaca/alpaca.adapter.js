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
    readIntervalMs = fetchImplementation === global.fetch ? 400 : 0,
  }) {
    super();
    this.keyId = keyId;
    this.secretKey = secretKey;
    this.tradingBaseUrl = tradingBaseUrl.replace(/\/$/, '');
    this.dataBaseUrl = dataBaseUrl.replace(/\/$/, '');
    this.stockFeed = stockFeed;
    this.optionsFeed = optionsFeed;
    this.fetch = fetchImplementation;
    this.readIntervalMs = readIntervalMs;
    this.nextReadAt = 0;
  }

  async request(baseUrl, path, options = {}) {
    // Un recorrido del índice no debe agotar de golpe la cuota de lecturas.
    // Reservar el turno ANTES de esperar mantiene el límite con llamadas paralelas.
    // Las órdenes nunca se reintentan ni se mezclan con esta cola de lecturas.
    if ((!options.method || options.method === 'GET') && this.readIntervalMs > 0) {
      const turn = Math.max(Date.now(), this.nextReadAt);
      this.nextReadAt = turn + this.readIntervalMs;
      if (turn > Date.now()) await new Promise(resolve => setTimeout(resolve, turn - Date.now()));
    }
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

  async getSnapshots({ symbols } = {}) {
    const normalized = [...new Set((Array.isArray(symbols) ? symbols : []).map(value => String(value).trim().toUpperCase()))];
    if (!normalized.length || normalized.length > 600 || normalized.some(value => !/^[A-Z0-9.-]{1,12}$/.test(value))) {
      const error = new Error('symbols debe incluir entre 1 y 600 tickers válidos.'); error.status = 400; throw error;
    }
    const snapshots = {};
    for (let offset = 0; offset < normalized.length; offset += 100) {
      const batch = normalized.slice(offset, offset + 100);
      const params = new URLSearchParams({ symbols: batch.join(','), feed: this.stockFeed });
      const response = await this.request(this.dataBaseUrl, `/v2/stocks/snapshots?${params}`);
      if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Alpaca devolvió snapshots no válidos.');
      for (const [symbol, snapshot] of Object.entries(response)) {
        if (batch.includes(symbol) && snapshot && typeof snapshot === 'object') snapshots[symbol] = snapshot;
      }
    }
    return { provider: 'alpaca', feed: this.stockFeed, snapshots, capturedAt: new Date().toISOString() };
  }

  async getCandles({ symbol, timeframe = '1Day', limit = 100, start, end, sort, pageToken } = {}) {
    if (!symbol || !/^[A-Z0-9.-]+$/i.test(symbol)) {
      const error = new Error('symbol debe ser un ticker válido.');
      error.status = 400;
      throw error;
    }
    const requestedBars = Math.min(Math.max(Number(limit) || 100, 1), 10000);
    const params = new URLSearchParams({
      timeframe,
      feed: this.stockFeed,
      limit: String(Math.min(requestedBars, 1000)),
    });
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    if (sort) params.set('sort', sort);
    const bars = [], seen = new Set(), timestamps = new Set();
    let token = pageToken || null, pages = 0, partialReason = null;
    if (token) seen.add(token);
    do {
      if (token) params.set('page_token', token);
      params.set('limit', String(Math.min(1000, requestedBars - bars.length)));
      let response;
      try {
        response = await this.request(this.dataBaseUrl, `/v2/stocks/${encodeURIComponent(symbol.toUpperCase())}/bars?${params.toString()}`);
      } catch (error) {
        if (!pages) throw error;
        partialReason = 'provider_error';
        break;
      }
      pages += 1;
      if (!response || !Object.prototype.hasOwnProperty.call(response, 'bars') || (response.bars !== null && !Array.isArray(response.bars))) {
        partialReason = 'invalid_response';
        break;
      }
      for (const bar of response.bars || []) {
        const time = bar && Date.parse(bar.t);
        if (!bar || !Number.isFinite(time) || time > Date.now() || (start && time < Date.parse(start)) || (end && time > Date.parse(end)) || ![bar.o, bar.h, bar.l, bar.c].every(value => Number.isFinite(value) && value > 0) || !Number.isFinite(bar.v) || bar.v < 0 || bar.h < bar.l || bar.o > bar.h || bar.o < bar.l || bar.c > bar.h || bar.c < bar.l || timestamps.has(time)) {
          partialReason = 'invalid_bars';
          continue;
        }
        if (bars.length >= requestedBars) { partialReason = 'provider_limit_exceeded'; break; }
        timestamps.add(time);
        bars.push({ timestamp: bar.t, open: bar.o, high: bar.h, low: bar.l, close: bar.c,
          volume: bar.v, tradeCount: bar.n ?? null, vwap: bar.vw ?? null });
      }
      if (!Object.prototype.hasOwnProperty.call(response, 'next_page_token')) { partialReason = 'invalid_response'; token = null; break; }
      const next = response.next_page_token ?? null;
      if (next !== null && (typeof next !== 'string' || !next || next.length > 4096)) { partialReason = 'invalid_token'; token = null; break; }
      token = next;
      if (partialReason || !token) break;
      if (seen.has(token)) { partialReason = 'repeated_token'; break; }
      seen.add(token);
      if (bars.length >= requestedBars) { partialReason = 'limit_reached'; break; }
      if (pages >= 100) { partialReason = 'page_limit'; break; }
    } while (token);
    const dates = bars.map(bar => bar.timestamp).sort((a, b) => Date.parse(a) - Date.parse(b));

    return {
      provider: 'alpaca',
      symbol: symbol.toUpperCase(),
      timeframe,
      feed: this.stockFeed,
      bars,
      nextPageToken: token,
      requestedBars,
      retrievedBars: bars.length,
      firstTimestamp: dates[0] || null,
      lastTimestamp: dates.at(-1) || null,
      complete: !partialReason,
      limited: !!partialReason,
      partialReason,
      pages,
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

  async getOptionExpirations({ symbol }) {
    if (typeof symbol !== 'string' || !/^[A-Z0-9.-]{1,12}$/i.test(symbol)) {
      const error = new Error('symbol debe ser un ticker válido.'); error.status = 400; throw error;
    }
    const today = new Date().toISOString().slice(0,10);
    const upper = new Date(); upper.setUTCFullYear(upper.getUTCFullYear()+10);
    const dates = new Set(), seen = new Set(); let token;
    // Solo metadatos: obtener vencimientos no requiere cotizar miles de contratos.
    for (let page=0;page<50;page++) {
      const params=new URLSearchParams({underlying_symbols:symbol.toUpperCase(),status:'active',limit:'1000',expiration_date_gte:today,expiration_date_lte:upper.toISOString().slice(0,10)});
      if(token)params.set('page_token',token);
      const data=await this.request(this.tradingBaseUrl,`/v2/options/contracts?${params}`);
      const contracts=data.option_contracts||data.contracts;
      if(!Array.isArray(contracts))throw new Error('Respuesta de vencimientos incompleta.');
      for(const contract of contracts)if(contract.underlying_symbol===symbol.toUpperCase()&&/^\d{4}-\d{2}-\d{2}$/.test(contract.expiration_date)&&contract.expiration_date>=today)dates.add(contract.expiration_date);
      token=data.next_page_token;
      if(!token)return {provider:'alpaca',symbol:symbol.toUpperCase(),expirations:[...dates].sort(),complete:true,capturedAt:new Date().toISOString()};
      if(typeof token!=='string'||seen.has(token))throw new Error('Paginación de vencimientos inválida.');
      seen.add(token);
    }
    throw new Error('Demasiadas páginas de vencimientos; no se mostrará un catálogo parcial.');
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
