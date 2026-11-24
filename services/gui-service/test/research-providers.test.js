const test=require('node:test');
const assert=require('node:assert/strict');
const {loadFundamentals,loadSp500,normalize,csvRows}=require('../src/fmp-fundamentals');
const response=(body,status=200)=>({ok:status===200,status,json:async()=>body,text:async()=>body});

test('402 del plan no bloquea el catálogo público completo y conserva procedencia',async()=>{
 const calls=[];
 const result=await loadSp500('test-universe',{fetchImpl:async url=>{
  calls.push(String(url));return String(url).includes('financialmodelingprep')?response('',402):response('Symbol,Security\n'+Array.from({length:403},(_,i)=>`T${i},"Empresa, ${i}"`).join('\n'));
 }});
 assert.equal(result.constituents.length,403);assert.equal(result.constituents[0].name,'Empresa, 0');
 assert.match(result.warning,/402/);assert.match(result.sourceUrl,/githubusercontent/);assert.equal(calls.length,2);
 const cached=await loadSp500('test-universe',{fetchImpl:()=>{throw new Error('No debe repetir la red');}});assert.equal(cached,result);
});
test('CSV respeta comas y comillas escapadas y rechaza un registro sin cerrar',()=>{
 assert.deepEqual(csvRows('a,b\nX,"A, ""B"""'),[['a','b'],['X','A, "B"']]);assert.throws(()=>csvRows('a,"sin cerrar'),/incompleto/);
});
test('endpoint restringido conserva perfil y métricas de endpoints exitosos',async()=>{
 const result=await loadFundamentals(['DELL'],'partial-test',{fetchImpl:async url=>{
  const endpoint=new URL(url).pathname.split('/').at(-1);
  if(endpoint==='key-metrics')return response([{returnOnEquity:.2}]);
  if(endpoint==='profile')return response([{companyName:'Dell Technologies',marketCap:1e10}]);
  return response('',402);
 }});
 const row=result.rows[0];assert.equal(row.status,'available');assert.equal(row.metrics.roe,.2);assert.equal(row.metrics.marketCap,1e10);
 assert.equal(row.metrics.revenueGrowth,null);assert.equal(row.metrics.pe,null);assert.equal(row.warnings.length,1);assert.match(row.warnings[0],/plan contratado/);
});
test('sin estados ni ratios no inventa fundamentales a partir de capitalización',async()=>{
 const result=await loadFundamentals(['IBM'],'profile-test',{fetchImpl:async url=>new URL(url).pathname.endsWith('/profile')?response([{marketCap:100}]):response('',402)});
 const row=result.rows[0];assert.equal(row.coverage,'1/10 métricas');assert.equal(row.metrics.netMargin,null);
 const score=require('../public/research-analysis').scoreFundamentals(row.metrics);assert.equal(score.status,'unavailable');assert.equal(score.score,null);
});
test('crecimiento no convierte ausencias en cero y una pérdida menor representa mejora',()=>{
 const empty=normalize('X',[],[],[{revenue:null},{revenue:20}]);assert.equal(empty.metrics.revenueGrowth,null);
 const loss=normalize('X',[],[],[{netIncome:-10},{netIncome:-20}]);assert.equal(loss.metrics.netIncomeGrowth,50);
});
