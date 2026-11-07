const { Router } = require('express');
const {getOptionChain,ingestOptions,readIngestion}=require('../controllers/broker.controller');
const router=Router();
router.get('/options-chains',getOptionChain);
router.post('/options-chains/ingestions',ingestOptions);
router.get('/options-chains/ingestions/:id',readIngestion);
module.exports=router;
