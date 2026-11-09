'use strict';
const {ResearchJournalService}=require('../services/research-journal.service');
const handle=fn=>async(req,res,next)=>{try{res.json(await fn(new ResearchJournalService(req.db,req.userId),req));}catch(e){next(e);}};
module.exports={
 list:handle((s,req)=>s.list(req.query)),
 create:async(req,res,next)=>{try{res.status(201).json(await new ResearchJournalService(req.db,req.userId).create(req.body));}catch(e){next(e);}},
};
