const test = require('node:test');
const assert = require('node:assert/strict');
const AlpacaAdapter = require('../src/brokers/alpaca/alpaca.adapter');

const createResponse = (body, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
});

for(const [name,trade,valid] of [['válida',{p:328.5,t:'2026-11-06T20:59:00Z'},true],['precio cero',{p:0,t:'2026-11-06T20:59:00Z'},false],['sin fecha',{p:328.5},false],['error',null,false]])test('cotización sin Ask consulta última operación: '+name,async()=>{
 const urls=[];const adapter=new AlpacaAdapter({keyId:'key',secretKey:'secret',tradingBaseUrl:'https://paper.example',dataBaseUrl:'https://data.example',fetchImplementation:async url=>{
  urls.push(url);if(url.endsWith('/quotes/latest'))return createResponse({quote:{bp:328.06,ap:0,t:'2026-11-06T21:00:00Z'}});
  return trade?createResponse({trade}):createResponse({message:'Unavailable'},false,403);
 }});
 const result=await adapter.getQuote('AAPL');assert.equal(urls.length,2);assert.match(urls[1],/\/trades\/latest$/);assert.equal(result.referencePrice,valid?328.5:null);assert.equal(result.referenceSource,valid?'latest_trade':null);assert.equal(result.ask,0);
});

test('normaliza la cuenta de Alpaca sin exponer credenciales', async () => {
  const adapter = new AlpacaAdapter({
    keyId: 'key',
    secretKey: 'secret',
    tradingBaseUrl: 'https://paper-api.alpaca.markets/',
    dataBaseUrl: 'https://data.example/',
    fetchImplementation: async (url, options) => {
      assert.equal(url, 'https://paper-api.alpaca.markets/v2/account');
      assert.equal(options.headers['APCA-API-KEY-ID'], 'key');
      assert.equal(options.headers['APCA-API-SECRET-KEY'], 'secret');
      return createResponse({
        id: 'account-id',
        status: 'ACTIVE',
        currency: 'USD',
        buying_power: '10000',
        cash: '10000',
        trading_blocked: false,
      });
    },
  });

  assert.deepEqual(await adapter.getAccount(), {
    provider: 'alpaca',
    id: 'account-id',
    status: 'ACTIVE',
    currency: 'USD',
    buyingPower: '10000',
    cash: '10000',
    tradingBlocked: false,
  });
});

test('normaliza la última cotización de Alpaca', async () => {
  const adapter = new AlpacaAdapter({
    keyId: 'key',
    secretKey: 'secret',
    tradingBaseUrl: 'https://paper-api.alpaca.markets',
    dataBaseUrl: 'https://data.example',
    fetchImplementation: async (url) => {
      assert.equal(url, 'https://data.example/v2/stocks/AAPL/quotes/latest');
      return createResponse({ quote: { bp: 100, ap: 101, bs: 2, as: 3, t: 'timestamp' } });
    },
  });

  assert.deepEqual(await adapter.getQuote('aapl'), {
    provider: 'alpaca',
    symbol: 'AAPL',
    bid: 100,
    ask: 101,
    bidSize: 2,
    askSize: 3,
    timestamp: 'timestamp',
    referencePrice: 100.5,
    referenceSource: 'quote_midpoint',
    referenceTimestamp: 'timestamp',
  });
});

test('obtiene contratos y cotizaciones reales de una cadena de opciones', async () => {
  const requests = [];
  const adapter = new AlpacaAdapter({
    keyId: 'key',
    secretKey: 'secret',
    tradingBaseUrl: 'https://paper-api.alpaca.markets',
    dataBaseUrl: 'https://data.example',
    fetchImplementation: async (url) => {
      requests.push(url);
      if (url.startsWith('https://paper-api.alpaca.markets/v2/options/contracts?')) {
        return createResponse({
          option_contracts: [{
            symbol: 'AAPL261218C00100000',
            underlying_symbol: 'AAPL',
            type: 'call',
            strike_price: '100',
            expiration_date: '2026-12-18',
            size: '100',
            status: 'active',
          }],
        });
      }
      assert.match(url, /^https:\/\/data\.example\/v1beta1\/options\/quotes\/latest\?/);
      return createResponse({
        quotes: {
          AAPL261218C00100000: { bp: 8, ap: 8.2, bs: 10, as: 12, t: 'timestamp' },
        },
      });
    },
  });

  const result = await adapter.getOptionChain({
    symbol: 'aapl',
    expiration: '2026-12-18',
  });

  assert.equal(requests.length, 2);
  assert.equal(result.contracts[0].contractSymbol, 'AAPL261218C00100000');
  assert.equal(result.contracts[0].bid, 8);
  assert.equal(result.contracts[0].ask, 8.2);
  assert.equal(result.contracts[0].multiplier, 100);
});

test('obtiene velas (candles) historicas de Alpaca para un ticker', async () => {
  const requests = [];
  const adapter = new AlpacaAdapter({
    keyId: 'key',
    secretKey: 'secret',
    tradingBaseUrl: 'https://paper-api.alpaca.markets',
    dataBaseUrl: 'https://data.example',
    fetchImplementation: async (url) => {
      requests.push(url);
      assert.equal(url, 'https://data.example/v2/stocks/AAPL/bars?timeframe=1Day&feed=iex&limit=100&sort=asc');
      return createResponse({
        bars: [
          { t: '2026-10-01T20:00:00Z', o: 178.26, h: 179.1, l: 177.9, c: 178.5, v: 1118, n: 65, vw: 178.23 },
          { t: '2026-10-02T20:00:00Z', o: 178.5, h: 180.2, l: 178.1, c: 179.8, v: 2200, n: 140, vw: 179.6 },
        ],
        next_page_token: null,
        symbol: 'AAPL',
        currency: 'USD',
      });
    },
  });

  const result = await adapter.getCandles({ symbol: 'aapl', timeframe: '1Day', limit: 100, sort: 'asc' });

  assert.equal(requests.length, 1);
  assert.deepEqual(await result.bars[1], {
    timestamp: '2026-10-02T20:00:00Z',
    open: 178.5,
    high: 180.2,
    low: 178.1,
    close: 179.8,
    volume: 2200,
    tradeCount: 140,
    vwap: 179.6,
  });
  assert.equal(result.symbol, 'AAPL');
  assert.equal(result.timeframe, '1Day');
  assert.equal(result.feed, 'iex');
});

test('crea una orden de mercado en la cuenta paper de Alpaca', async () => {
  const adapter = new AlpacaAdapter({
    keyId: 'key',
    secretKey: 'secret',
    tradingBaseUrl: 'https://paper-api.alpaca.markets',
    dataBaseUrl: 'https://data.example',
    fetchImplementation: async (url, options = {}) => {
      assert.equal(url, 'https://paper-api.alpaca.markets/v2/orders');
      assert.equal(options.method, 'POST');
      assert.equal(options.body, JSON.stringify({ symbol: 'AAPL', qty: '1', side: 'buy', type: 'market', time_in_force: 'day' }));
      return createResponse({ id: 'order-id', status: 'pending_new', symbol: 'AAPL', qty: '1', side: 'buy', type: 'market', time_in_force: 'day' });
    },
  });

  const order = await adapter.createOrder({ symbol: 'aapl', qty: 1, side: 'buy', type: 'market', timeInForce: 'day' });

  assert.equal(order.provider, 'alpaca');
  assert.equal(order.id, 'order-id');
  assert.equal(order.status, 'pending_new');
});

test('crea un bull call spread como orden MLEG market (compra y venta) en Alpaca paper', async () => {
  const adapter = new AlpacaAdapter({
    keyId: 'key',
    secretKey: 'secret',
    tradingBaseUrl: 'https://paper-api.alpaca.markets',
    dataBaseUrl: 'https://data.example',
    fetchImplementation: async (url, options = {}) => {
      assert.equal(url, 'https://paper-api.alpaca.markets/v2/orders');
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body);
      assert.equal(body.order_class, 'mleg');
      assert.equal(body.qty, '1');
      assert.equal(body.type, 'market');
      assert.equal(body.limit_price, undefined);
      assert.equal(body.legs.length, 2);
      assert.deepEqual(body.legs[0], { symbol: 'AAPL261218C00190000', side: 'buy', ratio_qty: '1', position_intent: 'buy_to_open' });
      assert.deepEqual(body.legs[1], { symbol: 'AAPL261218C00195000', side: 'sell', ratio_qty: '1', position_intent: 'sell_to_open' });
      return createResponse({ id: 'spread-order-id', status: 'accepted', order_class: 'mleg', legs: body.legs });
    },
  });

  const spread = await adapter.createSpread({
    symbol: 'AAPL',
    qty: 1,
    type: 'market',
    // bull call: compra call strike bajo, vende call strike alto
    legs: [
      { symbol: 'AAPL261218C00190000', side: 'buy', price: 4 },
      { symbol: 'AAPL261218C00195000', side: 'sell', price: 2 },
    ],
  });

  assert.equal(spread.provider, 'alpaca');
  assert.equal(spread.id, 'spread-order-id');
  assert.equal(spread.legs[0].side, 'buy');
  assert.equal(spread.legs[1].side, 'sell');
});

test('envía una orden multileg límite con cantidad del spread y ratios',async()=>{
 const adapter=new AlpacaAdapter({keyId:'key',secretKey:'secret',tradingBaseUrl:'https://paper-api.alpaca.markets',dataBaseUrl:'https://data.example',fetchImplementation:async(url,options)=>{
  const body=JSON.parse(options.body);
  assert.equal(body.order_class,'mleg');assert.equal(body.qty,'1');assert.equal(body.limit_price,'2.00');assert.equal(body.type,'limit');assert.equal(body.legs[0].ratio_qty,'1');assert.equal(body.legs[0].position_intent,'buy_to_open');assert.equal(body.legs[1].position_intent,'sell_to_open');assert.equal(body.symbol,undefined);
  return createResponse({id:'spread-order-id',status:'accepted',legs:body.legs});
 }});
 const result=await adapter.createSpread({symbol:'AAPL',legs:[{symbol:'AAPL261218C00190000',qty:1,side:'buy',type:'limit',limitPrice:4},{symbol:'AAPL261218C00195000',qty:1,side:'sell',type:'limit',limitPrice:2}]});
 assert.equal(result.id,'spread-order-id');
});

test('pagina filtrada consulta 201 contratos en tres lotes y preserva token', async()=>{
 const sizes=[];
 const adapter=new AlpacaAdapter({keyId:'key',secretKey:'secret',tradingBaseUrl:'https://paper-api.alpaca.markets',dataBaseUrl:'https://data.example',fetchImplementation:async(url)=>{
  const u=new URL(url);
  if(u.pathname==='/v2/options/contracts') {
   assert.equal(u.searchParams.get('type'),'put');assert.equal(u.searchParams.get('page_token'),'pagina 2');
   return createResponse({option_contracts:Array.from({length:201},(_,i)=>({symbol:'PUT'+i,type:'put',underlying_symbol:'TSLA',expiration_date:'2026-12-18',strike_price:String(i+1)})),next_page_token:'pagina3'});
  }
  const symbols=u.searchParams.get('symbols').split(',');sizes.push(symbols.length);
  return createResponse({quotes:Object.fromEntries(symbols.map(symbol=>[symbol,{bp:2,ap:3}]))});
 }});
 const d=await adapter.getOptionChain({symbol:'TSLA',expiration:'2026-12-18',type:'put',pageToken:'pagina 2',limit:201});
 assert.deepEqual(sizes,[100,100,1]);assert.equal(d.contracts.length,201);assert.equal(d.contracts[200].bid,2);assert.equal(d.nextPageToken,'pagina3');
});
