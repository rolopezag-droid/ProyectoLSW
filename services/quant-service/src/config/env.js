const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(__dirname, '../../../../.env'),
});

const port = Number(process.env.QUANT_PORT || 3002);
const brokerProvider = process.env.BROKER_PROVIDER || 'alpaca';
const alpacaKeyId = process.env.ALPACA_API_KEY_ID || process.env.ClientID;
const alpacaSecretKey = process.env.ALPACA_API_SECRET_KEY || process.env.ClientSecret;
const alpacaTradingBaseUrl = (
  process.env.ALPACA_TRADING_BASE_URL
  || process.env.AlpacaEndpoint
  || 'https://paper-api.alpaca.markets'
).replace(/\/v2\/?$/, '');
const alpacaDataBaseUrl = process.env.ALPACA_DATA_BASE_URL || 'https://data.alpaca.markets';
const alpacaStocksFeed = process.env.ALPACA_STOCKS_FEED || 'iex';
const alpacaOptionsFeed = process.env.ALPACA_OPTIONS_FEED || 'indicative';

if (!['iex', 'sip', 'delayed_sip'].includes(alpacaStocksFeed)) {
  throw new Error('ALPACA_STOCKS_FEED debe ser iex, sip o delayed_sip.');
}

if (!alpacaKeyId || !alpacaSecretKey) {
  throw new Error('Faltan credenciales de Alpaca: ALPACA_API_KEY_ID y ALPACA_API_SECRET_KEY.');
}

module.exports = {
  port,
  brokerProvider,
  alpacaKeyId,
  alpacaSecretKey,
  alpacaTradingBaseUrl,
  alpacaDataBaseUrl,
  alpacaStocksFeed,
  alpacaOptionsFeed,
};
