const test=require('node:test'),assert=require('node:assert/strict');
const Catalog=require('../src/api/v1/models/Catalog');
test('modelo de catálogo valida campos y evita secuencias negativas',()=>{
 assert.ok(new Catalog({}).validateSync());assert.ok(new Catalog({key:'invalid key',label:'Test',collection:'tests'}).validateSync());assert.ok(new Catalog({key:'test',label:'Test',collection:'tests',sequence:-1}).validateSync());assert.equal(new Catalog({key:'test',label:'Test',collection:'tests'}).validateSync(),undefined);
});
test('actualización de catálogo rechaza operadores antes de llamar a Mongo',async()=>{
 const service=require('../src/api/v1/services/catalogs.service');await assert.rejects(service.putCatalogService('test',{$set:{active:false}}),{status:400});await assert.rejects(service.putCatalogService('test',{_id:'override'}),{status:400});
});
