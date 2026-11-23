const { Router } = require('express');
const brokerController = require('../controllers/broker.controller');

const router = Router();

router.get('/account', brokerController.getAccount);
router.get('/quotes', brokerController.getQuote);
router.get('/options-chain', brokerController.getOptionChain);
router.get('/options-chain/strikes', brokerController.getOptionStrikes);
router.get('/options-chain/expirations', brokerController.getOptionExpirations);
router.get('/options-chain/quote', brokerController.getOptionQuote);
router.get('/candles', brokerController.getCandles);
router.get('/news', brokerController.getNews);
router.post('/orders', brokerController.createOrder);
router.post('/spreads', brokerController.createSpread);

module.exports = router;
