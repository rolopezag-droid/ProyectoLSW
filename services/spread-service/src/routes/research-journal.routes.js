'use strict';
const router=require('express').Router();
const controller=require('../controllers/research-journal.controller');
router.get('/',controller.list);
router.post('/',controller.create);
module.exports=router;
