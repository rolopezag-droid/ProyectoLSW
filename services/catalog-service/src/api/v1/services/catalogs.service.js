const Catalog=require('../models/Catalog');
const getCatalogsService=async()=>Catalog.find({active:true,deletedAt:null});
const getCatalogByKeyService=async key=>Catalog.findOne({key,active:true,deletedAt:null});
const postCatalogService=async data=>new Catalog(data).save();
const putCatalogService=async(key,data)=>{
 if(!data||typeof data!=='object'||Array.isArray(data)||!Object.keys(data).length||Object.keys(data).some(k=>k.startsWith('$')||k.includes('.')||['_id','__v','deletedAt','createdAt'].includes(k))){const e=new Error('Campos de actualización inválidos.');e.status=400;throw e;}
 return Catalog.findOneAndUpdate({key,active:true,deletedAt:null},data,{new:true,runValidators:true});
};
const deleteCatalogService=async key=>Catalog.findOneAndUpdate({key,active:true,deletedAt:null},{active:false,deletedAt:new Date()},{new:true});
const hardDeleteCatalogService=async key=>Catalog.findOneAndDelete({key});
module.exports={getCatalogsService,getCatalogByKeyService,postCatalogService,putCatalogService,deleteCatalogService,hardDeleteCatalogService};
