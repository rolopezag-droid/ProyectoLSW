const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const express=require('express');
const {evaluateVerticalSpread}=require('../../quant-service/src/services/vertical-spread');
async function until(predicate) { for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setImmediate(r));}throw Error('La interfaz no completó la acción.'); }
function page(register, intercept) {
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const dom=new JSDOM(html,{url:'http://localhost:3005',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.structuredClone=structuredClone;Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});
 w.fetch=async(url,opts={})=>{
  calls.push({url:String(url),opts});let body={};const u=new URL(url,'http://localhost:3005');
  if(intercept){const response=intercept(u,opts);if(response)return response;}
  if(u.pathname==='/api/supabase/register' && register)return register(opts);
  if(u.pathname==='/api/services/status')return {ok:true,status:200,json:async()=>({})};
  if(u.pathname.endsWith('/broker/quotes'))return {ok:true,status:200,json:async()=>({symbol:u.searchParams.get('symbol'),bid:190,ask:190.4,timestamp:'2026-11-07T08:00:00Z'})};
  if(u.pathname.endsWith('/options-chain/strikes'))return {ok:true,status:200,json:async()=>({provider:'alpaca',symbol:u.searchParams.get('symbol'),expiration:u.searchParams.get('expiration'),type:u.searchParams.get('type'),strikes:[190,195],count:2})};
  if(u.pathname.endsWith('/options-chain')) {const type=u.searchParams.get('type'),letter=type==='call'?'C':'P';body={contracts:[{type,underlyingSymbol:'AAPL',expiration:'2026-12-18',contractSymbol:'AAPL261218'+letter+'00190000',strike:190,bid:type==='call'?4:2,ask:type==='call'?4.2:2.2},{type,underlyingSymbol:'AAPL',expiration:'2026-12-18',contractSymbol:'AAPL261218'+letter+'00195000',strike:195,bid:type==='call'?2:4,ask:type==='call'?2.2:4.2}],nextPageToken:null};}
  else if(u.pathname.endsWith('/strategies/evaluate'))body=evaluateVerticalSpread(JSON.parse(opts.body));
  else if(u.pathname.endsWith('/broker/spreads'))body={id:'fake-order',status:'accepted'};
  else if(u.pathname==='/api/supabase/session')body={accessToken:'fake-session',expiresAt:9999999999};
  else if(u.pathname==='/api/v1/spreads')body={id:'11111111-1111-4111-8111-111111111111'};
  else if(u.pathname.endsWith('/evaluations'))body={evaluation:{id:'fake-evaluation'}};
  else if(u.pathname.endsWith('/implied-volatility'))return {ok:false,status:422,json:async()=>({message:'Precio fuera de límites',converged:false})};
  else if(u.pathname.endsWith('/candles'))body={symbol:'AAPL',timeframe:u.searchParams.get('timeframe'),bars:[{timestamp:'2026-11-06T15:00:00Z',open:100,high:102,low:99,close:101,volume:123}]};
  return {ok:true,status:200,json:async()=>body};
 };
 for(const script of w.document.querySelectorAll('script')){if(script.src)w.eval(fs.readFileSync(path.join(__dirname,'../public',new URL(script.src).pathname.replace(/^\//,'')),'utf8'));else w.eval(script.textContent);}
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {dom,w,calls};
}
for(const strategy of ['BULL_CALL_SPREAD','BEAR_CALL_SPREAD','BULL_PUT_SPREAD','BEAR_PUT_SPREAD']) {
 test('UI evalúa '+strategy+' con selección automática y muestra resultado',async()=>{
  const {dom,w,calls}=page();try{w.document.querySelector('[data-strategy="'+strategy+'"]').click();w.document.getElementById('chkAutoStrikes').checked=true;w.document.getElementById('btnEvaluate').click();await until(()=>w.document.getElementById('resultsCard').style.display==='block');assert.ok(calls.some(c=>c.url.includes('/strategies/evaluate')));assert.ok(w.document.getElementById('resultsGrid').textContent.includes(strategy));assert.equal(w.document.getElementById('saveSpot').value,'190.20');assert.match(w.document.getElementById('saveSpotSource').textContent,/promedio Bid\/Ask/);}finally{dom.window.close();}
 });
}
test('UI Paper evita doble envío, usa fecha OCC correcta y orden límite',async()=>{
 const {dom,w,calls}=page();try{
  w.document.getElementById('chkAutoStrikes').checked=true;w.document.getElementById('btnExecutePaper').click();w.document.getElementById('btnExecutePaper').click();
  await until(()=>w.document.getElementById('executionNote').textContent.includes('Orden enviada'));
  const orders=calls.filter(c=>c.url.endsWith('/broker/spreads'));assert.equal(orders.length,1);const order=JSON.parse(orders[0].opts.body);assert.equal(order.qty,1);assert.equal(order.type,'limit');assert.match(order.legs[0].symbol,/^AAPL261218C/);assert.equal(order.clientOrderId.length>0,true);assert.equal(w.document.getElementById('chkStopLoss').disabled,true);
 }finally{dom.window.close();}
});

for(const [name,reply,expected] of [
 ['sesión creada',()=>({ok:true,status:201,json:async()=>({status:'registered',message:'Cuenta creada. Ya puedes guardar.',accessToken:'fake-session'})}),/Cuenta creada/],
 ['confirmación de correo',()=>({ok:true,status:202,json:async()=>({status:'confirmation_required',message:'Revisa tu correo para confirmar la cuenta.'})}),/Revisa tu correo/],
 ['registro rechazado',()=>({ok:false,status:400,json:async()=>({message:'El registro está deshabilitado.'})}),/deshabilitado/],
 ['servidor anterior',()=>({ok:false,status:404}),/ruta de registro/],
 ['respuesta HTML',()=>({ok:true,status:200,json:async()=>{throw new SyntaxError();}}),/respuesta inesperada/],
 ['red interrumpida',()=>{throw new TypeError('fetch failed');},/servicios estén encendidos/],
 ['tiempo agotado',()=>{const error=new Error();error.name='AbortError';throw error;},/tiempo de espera/],
 ['respuesta incompleta',()=>({ok:true,status:200,json:async()=>({})}),/no confirmó/]
])test('UI registro muestra resultado visible: '+name,async()=>{
 const {dom,w}=page(reply);try{
  w.document.getElementById('saveEmail').value='test@example.com';w.document.getElementById('savePassword').value='fake-password-123';
  const btn=w.document.getElementById('btnRegisterAccount');btn.click();await until(()=>!btn.disabled);
  assert.match(w.document.getElementById('saveStatus').textContent,expected);assert.match(w.document.getElementById('alertContainer').textContent,expected);assert.equal(btn.textContent,'Crear cuenta');
  if(name==='sesión creada'||name==='confirmación de correo')assert.equal(w.document.getElementById('savePassword').value,'');
 }finally{dom.window.close();}
});

test('UI registro valida antes de enviar y muestra carga sin duplicar solicitudes',async()=>{
 let resolve;const {dom,w,calls}=page(()=>new Promise(r=>{resolve=r;}));try{
  const btn=w.document.getElementById('btnRegisterAccount');btn.click();assert.match(w.document.getElementById('saveStatus').textContent,/correo válido/);assert.equal(calls.filter(c=>c.url.includes('/register')).length,0);
  w.document.getElementById('saveEmail').value='test@example.com';w.document.getElementById('savePassword').value='fake-password-123';btn.click();btn.click();
  assert.equal(btn.disabled,true);assert.match(btn.textContent,/Creando/);assert.match(w.document.getElementById('saveStatus').textContent,/Registrando/);assert.equal(calls.filter(c=>c.url.includes('/register')).length,1);
  resolve({ok:true,status:202,json:async()=>({status:'confirmation_required',message:'Confirma tu correo.'})});await until(()=>!btn.disabled);
 }finally{dom.window.close();}
});
test('UI análisis de investigación lee tasas del workbench y completa sin errores de IDs removidos',async()=>{
 const {dom,w}=page();try{
  assert.ok(w.document.getElementById('qwRate'),'el workbench debe existir en el DOM');
  const btn=w.document.getElementById('btnResearchAnalyze');btn.click();
  await until(()=>!btn.disabled);
  const status=w.document.getElementById('researchStatus').textContent;
  assert.doesNotMatch(status,/Cannot read properties|null/);
  assert.match(status,/Análisis listo/);
  await new Promise(r=>setImmediate(r));
 }finally{dom.window.close();}
});
test('UI IV recupera botón tras 422 y gráfica inspecciona una vela sin mover avisos',async()=>{
 const {dom,w}=page();try{
  w.document.querySelector('#quantMethodGrid [data-method="iv"]').click();
  assert.equal(w.document.getElementById('qwIvExtras').hidden,false);
  const btn=w.document.getElementById('btnCalcQuant');btn.click();
  await until(()=>!btn.disabled);
  assert.ok(!w.document.getElementById('quantResult').textContent.includes('NaN'));
  assert.match(w.document.getElementById('quantResult').textContent,/no convergió/i);
  assert.match(btn.textContent,/volatilidad implícita/i);
  w.document.getElementById('btnLoadCandles').click();await until(()=>w.document.querySelector('[data-candle]'));
  w.document.querySelector('[data-candle]').dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:100,clientY:100}));
  assert.ok(w.document.getElementById('candleTooltip').textContent.includes('Apertura'));assert.equal(w.getComputedStyle(w.document.getElementById('alertContainer')).position,'fixed');
 }finally{dom.window.close();}
});

test('UI distingue el periodo sin velas del periodo con 250 velas',async()=>{
 const bars=Array.from({length:250},(_,i)=>({timestamp:new Date(Date.UTC(2026,0,i+1)).toISOString(),open:100,high:102,low:99,close:101,volume:123}));
 let fail=false;
 const {dom,w}=page(null,u=>u.pathname.endsWith('/candles')?(fail?{ok:false,status:502,json:async()=>({message:'Error real de velas'})}:{ok:true,status:200,json:async()=>({symbol:'TSLA',timeframe:u.searchParams.get('timeframe'),bars:u.searchParams.get('timeframe')==='15Min'?[]:bars})}):null);try{
  const symbol=w.document.getElementById('chSymbol'),period=w.document.getElementById('chTimeframe'),btn=w.document.getElementById('btnLoadCandles');
  symbol.value='TSLA';symbol.dispatchEvent(new w.Event('change'));btn.click();await until(()=>!btn.disabled);
  assert.match(w.document.querySelector('.alert-error').textContent,/TSLA/);
  period.value='12Month';period.dispatchEvent(new w.Event('change'));await until(()=>!btn.disabled);
  assert.match(w.document.getElementById('candlesMeta').textContent,/TSLA.*1 Año.*250 velas/);
  assert.match(w.document.querySelector('.alert-error').textContent,/TSLA.*1 Día/);
  fail=true;btn.click();await until(()=>!btn.disabled);assert.match(w.document.getElementById('alertContainer').textContent,/Error real de velas/);
 }finally{await new Promise(r=>setImmediate(r));dom.window.close();}
});

test('UI explica una resistencia histórica bajo el cierre hasta su ruptura',async()=>{
 const {dom,w}=page();try{
  const bars=Array.from({length:25},(_,i)=>({timestamp:new Date(Date.UTC(2026,0,i+1)).toISOString(),open:374,high:384,low:364,close:374,volume:100}));
  bars[10].high=385.58;Object.assign(bars.at(-1),{high:391,low:371,close:390.24});
  const zone=w.ResearchAnalysis.supportResistance(bars).resistances.find(item=>item.level===385.58);assert.equal(zone.status,'active');
  w.renderCandles({symbol:'TSLA',timeframe:'1Day',bars});
  const svg=w.document.getElementById('candlesChart'),note=w.document.getElementById('candlesLevelsNote');
  assert.ok(svg.querySelector('[data-level-kind="resistance"]'));assert.match(note.textContent,/último cierre.*390\.24/i);assert.match(note.textContent,/385\.58.*zona.*margen/i);
  const inverted=bars.map(bar=>({...bar,open:800-bar.open,high:800-bar.low,low:800-bar.high,close:800-bar.close}));
  w.renderCandles({symbol:'TSLA',timeframe:'1Day',bars:inverted});assert.ok(svg.querySelector('[data-level-kind="support"]'));assert.match(note.textContent,/414\.42.*zona.*margen/i);
  Object.assign(bars.at(-1),{high:392,low:372,close:391});
  assert.equal(w.ResearchAnalysis.supportResistance(bars).resistances.find(item=>item.level===385.58).status,'breached');
  w.renderCandles({symbol:'TSLA',timeframe:'1Day',bars});assert.equal(svg.querySelectorAll('[data-level-kind="resistance"]').length,0);
 }finally{await new Promise(r=>setImmediate(r));dom.window.close();}
});

test('UI guarda una evaluación con sesión y estado draft, conservando contratos reales',async()=>{
 const {dom,w,calls}=page();try{
  w.document.getElementById('chkAutoStrikes').checked=true;w.document.getElementById('btnEvaluate').click();await until(()=>w.document.getElementById('resultsCard').style.display==='block');
  w.document.getElementById('saveSpot').value='190';w.document.getElementById('saveEmail').value='test@example.com';w.document.getElementById('savePassword').value='fake-test-password';
  w.document.getElementById('btnSaveSpread').click();await until(()=>w.document.getElementById('saveStatus').textContent.includes('guardados'));
  const sent=JSON.parse(calls.find(c=>c.url==='/api/v1/spreads').opts.body);assert.equal(sent.status,'draft');assert.match(sent.legs[0].contractSymbol,/AAPL261218C/);assert.equal(sent.legs[0].ask,4.2);
  assert.equal(w.document.getElementById('savePassword').value,'');assert.ok(calls.some(c=>c.url.endsWith('/evaluations')));
 }finally{dom.window.close();}
});

test('UI exige precio del subyacente antes de iniciar sesión',async()=>{
 const {dom,w,calls}=page();try{
  w.document.getElementById('chkAutoStrikes').checked=true;w.document.getElementById('btnEvaluate').click();await until(()=>w.document.getElementById('resultsCard').style.display==='block');
  w.document.getElementById('saveSpot').value='';w.document.getElementById('btnSaveSpread').click();assert.match(w.document.getElementById('saveStatus').textContent,/precio del subyacente/);assert.match(w.document.getElementById('alertContainer').textContent,/precio del subyacente/);assert.equal(calls.some(c=>c.url==='/api/supabase/session'),false);
 }finally{dom.window.close();}
});

for(const [quote,alertPattern] of [
 [{symbol:'AAPL',bid:null,ask:190},/Cotizaciones para/],
 [{symbol:'AAPL',bid:200,ask:190},/Cotizaciones para/],
 [{symbol:'MSFT',bid:190,ask:191},/no corresponde/],
 [{symbol:'MSFT',referencePrice:191,referenceSource:'latest_trade',referenceTimestamp:'2026-11-06T20:59:00Z'},/no corresponde/],
])test('UI no reutiliza precio anterior ante cotización inválida '+JSON.stringify(quote),async()=>{
 const {dom,w}=page(null,u=>u.pathname.endsWith('/broker/quotes')?{ok:true,status:200,json:async()=>quote}:null);try{
  w.document.getElementById('saveSpot').value='999';const btn=w.document.getElementById('btnFetchQuotes');btn.click();await until(()=>!btn.disabled);
  assert.equal(w.document.getElementById('saveSpot').value,'');assert.match(w.document.getElementById('saveSpotSource').textContent,/referencia manual/);assert.match(w.document.getElementById('alertContainer').textContent,alertPattern);
 }finally{dom.window.close();}
});

test('UI descarta precio de otra empresa si cambia durante la consulta',async()=>{
 let finish;const {dom,w}=page(null,u=>u.pathname.endsWith('/broker/quotes')?new Promise(r=>{finish=r;}):null);try{
  const btn=w.document.getElementById('btnFetchQuotes');btn.click();await until(()=>!!finish);
  const symbol=w.document.getElementById('symbol');symbol.value='MSFT';symbol.dispatchEvent(new w.Event('change'));
  finish({ok:true,status:200,json:async()=>({symbol:'AAPL',bid:190,ask:191})});await until(()=>!btn.disabled);
  assert.equal(w.document.getElementById('saveSpot').value,'');assert.equal(w.document.getElementById('priceLong').value,'');
 }finally{dom.window.close();}
});

test('UI usa última operación con fecha cuando Ask es cero y la identifica como referencia',async()=>{
 const {dom,w}=page(null,u=>u.pathname.endsWith('/broker/quotes')?{ok:true,status:200,json:async()=>({symbol:'AAPL',bid:328.06,ask:0,referencePrice:328.5,referenceSource:'latest_trade',referenceTimestamp:'2026-11-06T20:59:00Z'})}:null);try{
  const btn=w.document.getElementById('btnFetchQuotes');btn.click();await until(()=>!btn.disabled);assert.equal(w.document.getElementById('saveSpot').value,'328.50');assert.match(w.document.getElementById('saveSpotSource').textContent,/última operación/);assert.match(w.document.getElementById('saveSpotSource').textContent,/2026-11-06/);
 }finally{dom.window.close();}
});

test('UI permite mostrar y ocultar contraseña y enlaza recuperación sin perder la estrategia',async()=>{
 const {dom,w}=page();try{const input=w.document.getElementById('savePassword'),button=w.document.getElementById('toggleSavePassword');input.value='fake-password';button.click();assert.equal(input.type,'text');assert.equal(input.value,'fake-password');assert.equal(button.getAttribute('aria-pressed'),'true');button.click();assert.equal(input.type,'password');assert.ok(w.document.querySelector('a[href="/auth/recuperar.html"][target="_blank"]'));await new Promise(r=>setImmediate(r));}finally{dom.window.close();}
});

test('UI muestra credenciales rechazadas y no guarda el spread',async()=>{
 const {dom,w,calls}=page(null,u=>u.pathname==='/api/supabase/session'?{ok:false,status:401,json:async()=>({message:'Correo o contraseña incorrectos.'})}:null);try{
  w.document.getElementById('chkAutoStrikes').checked=true;w.document.getElementById('btnEvaluate').click();await until(()=>w.document.getElementById('resultsCard').style.display==='block');
  w.document.getElementById('saveSpot').value='190';w.document.getElementById('saveEmail').value='test@example.com';w.document.getElementById('savePassword').value='fake-password';
  const btn=w.document.getElementById('btnSaveSpread');btn.click();await until(()=>!btn.disabled);assert.match(w.document.getElementById('saveStatus').textContent,/contraseña incorrectos/);assert.match(w.document.getElementById('alertContainer').textContent,/contraseña incorrectos/);assert.equal(calls.some(c=>c.url==='/api/v1/spreads'),false);assert.equal(w.document.getElementById('savePassword').value,'');
 }finally{dom.window.close();}
});

test('UI conserva padre si falla evaluación y reintenta sin duplicarlo',async()=>{
 let evaluations=0;const {dom,w,calls}=page(null,u=>u.pathname.endsWith('/evaluations')&&++evaluations===1?{ok:false,status:502,json:async()=>({message:'Evaluación no disponible.'})}:null);try{
  w.document.getElementById('chkAutoStrikes').checked=true;w.document.getElementById('btnEvaluate').click();await until(()=>w.document.getElementById('resultsCard').style.display==='block');
  w.document.getElementById('saveSpot').value='190';w.document.getElementById('saveEmail').value='test@example.com';w.document.getElementById('savePassword').value='fake-password';
  const btn=w.document.getElementById('btnSaveSpread');btn.click();await until(()=>!btn.disabled);assert.match(w.document.getElementById('saveStatus').textContent,/no se confirmó su evaluación/);
  btn.click();await until(()=>w.document.getElementById('saveStatus').textContent.includes('guardados'));assert.equal(calls.filter(c=>c.url==='/api/v1/spreads').length,1);assert.equal(calls.filter(c=>c.url.endsWith('/evaluations')).length,2);assert.equal(btn.disabled,true);
 }finally{dom.window.close();}
});
test('UI sincroniza la candidata con niveles y señales orientativas sin enviar órdenes',async()=>{
 const fresh=new Date().toISOString();
 const {dom,w,calls}=page(null,(u,opts)=>{
  if(u.pathname.endsWith('/broker/quotes'))return {ok:true,status:200,json:async()=>({symbol:u.searchParams.get('symbol'),referencePrice:190.2,referenceSource:'midpoint',referenceTimestamp:fresh})};
  if(u.pathname.endsWith('/options-chain')){
   const type=u.searchParams.get('type'),letter=type==='call'?'C':'P';
   return {ok:true,status:200,json:async()=>({contracts:[
    {type,underlyingSymbol:'AAPL',expiration:'2026-12-18',contractSymbol:'AAPL261218'+letter+'00190000',strike:190,bid:type==='call'?4:2,ask:type==='call'?4.2:2.2,timestamp:fresh},
    {type,underlyingSymbol:'AAPL',expiration:'2026-12-18',contractSymbol:'AAPL261218'+letter+'00195000',strike:195,bid:type==='call'?2:4,ask:type==='call'?2.2:4.2,timestamp:fresh}
   ],nextPageToken:null})};
  }
  return null;
 });try{
  const analyze=w.document.getElementById('btnResearchAnalyze');analyze.click();
  await until(()=>!analyze.disabled&&!w.document.getElementById('researchEvidence').hidden);
  const rowCount=w.document.querySelectorAll('#researchCandidates tr[data-candidate]').length;
  assert.ok(rowCount>=1&&rowCount<=20,'debe haber candidatas visibles para aplicar el método');
  w.__candlesChartState={symbol:'AAPL',timeframe:'1Day',periodLabel:'test',candles:[{timestamp:'2026-11-06T15:00:00Z',open:100,high:102,low:99,close:101,volume:123}]};
  const candidateSelect=w.document.getElementById('chTriggerStrategy');
  candidateSelect.value=[...candidateSelect.options].find(option=>option.textContent.includes('BULL CALL')).value;
  w.document.getElementById('chTriggerStrategy').dispatchEvent(new w.Event('change'));
  assert.match(w.document.getElementById('candidateSignalStatus').textContent,/AAPL.*BULL CALL/);
  w.document.getElementById('researchMinProb').dispatchEvent(new w.Event('change'));
  assert.ok(w.document.querySelector('#researchCandidates tr.is-selected'),'la selección sigue visible después de actualizar los filtros');
  w.document.getElementById('chShowTriggers').checked=true;
  const withCandidate=w.__candleOverlaySource();
  assert.ok(withCandidate.levels,'se conservan niveles de la candidata');
  const chartBars=Array.from({length:100},(_,i)=>{const close=i<60?100:i<75?100+i-59:115-(i-74)*2;return {timestamp:new Date(Date.UTC(2020,0,i+1,5)).toISOString(),open:close,high:close+1,low:close-1,close,volume:10};});
  w.renderCandles({symbol:'AAPL',timeframe:'1Day',bars:chartBars});
  const candidateEvents=w.__candleOverlaySource();
  assert.ok(candidateEvents.entries.some(event=>event.category==='candidate'));
  assert.ok(candidateEvents.exits.some(event=>event.type==='salida'));
  assert.match(w.document.getElementById('signalTableBody').textContent,/Candidata: entrada\/salida orientativa/);
  const exitRow=[...w.document.querySelectorAll('#signalTableBody tr[data-signal-timestamp]')].find(row=>row.textContent.includes('Candidata:')&&row.cells[3].textContent==='salida');
  const exitButton=exitRow.querySelector('button[data-signal-detail]');exitButton.click();
  const exitDetail=w.document.getElementById(exitButton.getAttribute('aria-controls'));
  assert.equal(exitDetail.hidden,false);assert.match(exitDetail.textContent,/SMA20 anterior.*SMA20/i);
  assert.equal(calls.some(c=>/\/broker\/(orders|spreads)$/.test(new URL(c.url,'http://localhost').pathname)),false);
  await new Promise(r=>setImmediate(r));
 }finally{dom.window.close();}
});

test('UI aplica el método del workbench a la tabla y lo combina con señales y niveles',async()=>{
 const fresh=new Date().toISOString();
 let deferPrices=false;const pendingPrices=[];
 const {dom,w,calls}=page(null,(u,opts)=>{
  if(u.pathname.endsWith('/broker/quotes'))return {ok:true,status:200,json:async()=>({symbol:u.searchParams.get('symbol'),referencePrice:190.2,referenceSource:'midpoint',referenceTimestamp:fresh})};
  if(u.pathname.endsWith('/options-chain')){
   const type=u.searchParams.get('type'),letter=type==='call'?'C':'P';
   return {ok:true,status:200,json:async()=>({contracts:[
    {type,underlyingSymbol:'AAPL',expiration:'2026-12-18',contractSymbol:'AAPL261218'+letter+'00190000',strike:190,bid:type==='call'?4:2,ask:type==='call'?4.2:2.2,timestamp:fresh,multiplier:100},
    {type,underlyingSymbol:'AAPL',expiration:'2026-12-18',contractSymbol:'AAPL261218'+letter+'00195000',strike:195,bid:type==='call'?2:4,ask:type==='call'?2.2:4.2,timestamp:fresh,multiplier:100}
   ],nextPageToken:null})};
  }
  if(u.pathname.endsWith('/quant/prices')){
   const response={ok:true,status:200,json:async()=>({model:'black-scholes',symbol:JSON.parse(opts.body||'{}').symbol,price:12.3456,currency:'USD',assumptions:{timeToMaturityYears:0.25},calculatedAt:'2026-11-15T00:00:00Z'})};
   return deferPrices?new Promise(resolve=>pendingPrices.push(()=>resolve(response))):response;
  }
  return null;
 });try{
  const analyze=w.document.getElementById('btnResearchAnalyze');analyze.click();
  await until(()=>!analyze.disabled&&!w.document.getElementById('researchEvidence').hidden);
  const rowCount=w.document.querySelectorAll('#researchCandidates tr[data-candidate]').length;
  assert.ok(rowCount>=1&&rowCount<=20);
  w.document.getElementById('btnCalcQuant').click();
  await until(()=>w.document.getElementById('quantResult').textContent.includes('Precio teórico'));
  assert.ok(w.__workbenchContext);
  const before=calls.filter(c=>c.url.endsWith('/quant/prices')).length;
  w.document.getElementById('btnApplyQuantToTable').click();
  await until(()=>!w.document.getElementById('researchMethodHead').hidden);
  const applied=calls.filter(c=>c.url.endsWith('/quant/prices')).length-before;
  assert.ok(applied>=1&&applied<=20);
  assert.match(w.document.getElementById('researchMethodHead').textContent,/Precio BS \(pata larga\)/);
  assert.match(w.document.querySelector('#researchCandidates tr[data-candidate] td:last-child').textContent,/12\.35/);
  assert.match(w.document.getElementById('researchStatus').textContent,/aplicado a \d+ candidata/);
  const select=w.document.getElementById('chTriggerStrategy');
  select.value=[...select.options].find(option=>option.textContent.includes('BULL CALL')).value;
  select.dispatchEvent(new w.Event('change'));
  await until(()=>w.document.getElementById('researchCandidateValidation').dataset.state==='verified');
  assert.match(w.document.getElementById('researchCandidateCalculations').textContent,/POST \/api\/v1\/strategies\/evaluate/);
  w.document.getElementById('chShowTriggers').checked=true;
  const bars=Array.from({length:120},(_,i)=>{const close=100+15*Math.sin(i/8);return {timestamp:new Date(Date.UTC(2020,0,i+1,5)).toISOString(),open:close,high:200,low:5,close,volume:100};});
  w.renderCandles({symbol:'AAPL',timeframe:'1Day',bars});
  const overlays=w.__candleOverlaySource();
  assert.ok(overlays.levels&&overlays.method?.lines.length===1);
  assert.match(overlays.method.lines[0].label,/BS pata larga/);
  assert.match(overlays.note,/Método Workbench/);
  assert.ok(w.document.querySelector('[data-method-level]'),'se dibuja el método en la gráfica');
  assert.ok(w.document.querySelector('[data-trigger-mark="technical"]'),'las señales técnicas siguen visibles');
  assert.ok(w.document.querySelector('[data-trigger-level]'),'se dibujan los niveles de la candidata');
  assert.equal(calls.some(c=>/\/broker\/(orders|spreads)$/.test(new URL(c.url,'http://localhost').pathname)),false);
  const token=w.__workbenchContext.token;
  w.document.getElementById('btnCalcQuant').click();
  await until(()=>w.__workbenchContext&&w.__workbenchContext.token!==token);
  assert.equal(w.document.getElementById('researchMethodHead').hidden,true,'un nuevo cálculo retira la columna obsoleta');
  w.document.querySelector('#quantMethodGrid [data-method="greeks"]').click();
  w.document.getElementById('btnApplyQuantToTable').click();
  assert.match(w.document.getElementById('alertContainer').textContent,/Calcula el método seleccionado/);
  w.document.querySelector('#quantMethodGrid [data-method="prices"]').click();
  deferPrices=true;w.document.getElementById('btnApplyQuantToTable').click();
  await until(()=>pendingPrices.length>0);
  const symbols=w.document.getElementById('researchSymbols');symbols.value='MSFT';symbols.dispatchEvent(new w.Event('input'));
  pendingPrices.forEach(resolve=>resolve());
  await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
  assert.equal(w.document.getElementById('researchEvidence').hidden,true);
  assert.equal(w.__workbenchTableMetrics,null,'un resultado tardío no se aplica al análisis invalidado');
  await new Promise(r=>setImmediate(r));
 }finally{dom.window.close();}
});

test('UI muestra historial completo y filtra marcadores, fecha e indicador sin enviar órdenes',async()=>{
 const {dom,w,calls}=page();try{
  const bars=Array.from({length:1200},(_,i)=>{const close=100+15*Math.sin(i/12);return {timestamp:new Date(Date.UTC(2020,0,i+1,5)).toISOString(),open:close,high:close+1,low:close-1,close,volume:100};});
  w.document.getElementById('chMarkerLimit').value='10';
  w.renderCandles({symbol:'AAPL',timeframe:'1Day',bars,provider:'alpaca',feed:'iex',complete:true,requestedBars:1200,retrievedBars:1200});
  const rows=[...w.document.querySelectorAll('#signalTableBody tr[data-signal-timestamp]')];
  assert.ok(rows.length>12,'la tabla no recorta a 12');
  assert.equal(w.document.querySelectorAll('[data-trigger-mark="technical"]').length,10);
  assert.match(w.document.getElementById('signalSummary').textContent,new RegExp(rows.length+' señal'));
  assert.match(w.document.getElementById('signalSummary').textContent,/10 marcadores más recientes/);
  const marker=w.document.querySelector('[data-trigger-mark="technical"]');
  const timestamp=marker.getAttribute('data-signal-time');
  const index=bars.findIndex(bar=>bar.timestamp===timestamp);
  assert.ok(index>=0,'el marcador corresponde exactamente al timestamp de una vela');
  w.document.querySelector(`[data-candle="${index}"]`).dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true}));
  assert.match(w.document.getElementById('candleTooltip').textContent,/RSI14.*cierre/i);
  assert.match(rows[0].textContent,/RSI14.*Técnica independiente/i);
  assert.match(rows[0].textContent,/\d{2}\/\d{2}\/\d{4}.*UTC/);
  const toggle=rows[0].querySelector('button[data-signal-detail]');
  const detail=w.document.getElementById(toggle.getAttribute('aria-controls'));
  assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(detail.hidden,true);
  toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(detail.hidden,false);
  assert.match(detail.textContent,/Condición:.*RSI14 anterior/i);
  assert.match(detail.textContent,/Valores en la condición:.*RSI anterior/i);
  assert.ok(detail.textContent.includes(rows[0].dataset.signalTimestamp),'se conserva el timestamp original');
  const firstIndex=bars.findIndex(bar=>bar.timestamp===rows[0].dataset.signalTimestamp);
  const rsi=w.ResearchAnalysis.relativeStrengthIndexSeries(bars,14);
  assert.ok(detail.textContent.includes(String(rsi[firstIndex-1].value)),'valor anterior completo, sin truncar');
  assert.ok(detail.textContent.includes(String(rsi[firstIndex].value)),'valor actual completo, sin truncar');
  toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(detail.hidden,true);
  const checkbox=w.document.querySelector('.technical-indicator');
  assert.equal(w.getComputedStyle(checkbox).width,'16px');assert.equal(w.getComputedStyle(checkbox.closest('label')).display,'flex');
  assert.match(w.document.getElementById('candidateSignalStatus').textContent,/Ninguna candidata.*técnico independiente/i);
  const candidateToggle=w.document.getElementById('chShowTriggers');candidateToggle.checked=true;candidateToggle.dispatchEvent(new w.Event('change'));
  assert.equal(w.document.querySelectorAll('#signalTableBody tr[data-signal-timestamp]').length,rows.length,'activar candidata vacía no altera señales técnicas');
  const date=w.document.getElementById('chSignalDate');date.value=rows[0].dataset.signalTimestamp.slice(0,10);date.dispatchEvent(new w.Event('change'));
  assert.ok([...w.document.querySelectorAll('#signalTableBody tr[data-signal-timestamp]')].every(row=>row.dataset.signalTimestamp.startsWith(date.value)));
  w.document.getElementById('btnClearSignalDate').click();
  assert.equal(w.document.querySelectorAll('#signalTableBody tr[data-signal-timestamp]').length,rows.length);
  for(const input of w.document.querySelectorAll('.technical-indicator')){input.checked=false;input.dispatchEvent(new w.Event('change'));}
  assert.match(w.document.getElementById('signalTableBody').textContent,/Sin señales para el periodo y las reglas seleccionadas/);
  assert.equal(calls.some(c=>/\/broker\/(orders|spreads)$/.test(new URL(c.url,'http://localhost').pathname)),false);
 }finally{await new Promise(r=>setImmediate(r));dom.window.close();}
});

test('UI no ubica señales diarias por coincidencia de fecha en gráficas intradía',async()=>{
 const {dom,w}=page();try{
  const bars=[{timestamp:'2020-01-02T15:00:00.000Z',open:100,high:102,low:99,close:101,volume:10}];
  w.renderCandles({symbol:'AAPL',timeframe:'15Min',bars});
  assert.match(w.document.getElementById('candlesTriggersNote').textContent,/Señales desactivadas/);
  const fake={timestamp:'2020-01-02T05:00:00.000Z',price:101,side:'bullish',type:'alcista',indicator:'SMA50',rule:'sma_cross'};
  w.renderCandlesChart(bars,'15Min',{visibleSignals:[fake]});
  assert.equal(w.document.querySelectorAll('[data-trigger-mark]').length,0);
 }finally{await new Promise(r=>setImmediate(r));dom.window.close();}
});

test('UI no ubica un marcador en otra vela con el mismo milisegundo',async()=>{
 const {dom,w}=page();try{
  const bars=[{timestamp:'2020-01-02T05:00:00.123456789Z',open:100,high:102,low:99,close:101,volume:10}];
  w.renderCandles({symbol:'AAPL',timeframe:'1Day',bars});
  const signal={timestamp:'2020-01-02T05:00:00.123999999Z',price:101,side:'bullish',type:'alcista',indicator:'SMA50',rule:'sma_cross'};
  w.renderCandlesChart(bars,'1Day',{visibleSignals:[signal]});
  assert.equal(w.document.querySelectorAll('[data-trigger-mark]').length,0);
  w.renderCandlesChart(bars,'1Day',{visibleSignals:[{...signal,timestamp:bars[0].timestamp}]});
  assert.equal(w.document.querySelector('[data-trigger-mark]').getAttribute('data-signal-time'),bars[0].timestamp);
 }finally{await new Promise(r=>setImmediate(r));dom.window.close();}
});

test('UI explica ruptura con límites, ATR y umbral calculados por la señal real',async()=>{
 const {dom,w}=page();try{
  const bars=Array.from({length:40},(_,i)=>({timestamp:new Date(Date.UTC(2020,0,i+1,5)).toISOString(),open:100,high:101,low:99,close:100,volume:10}));
  bars[18].high=110;bars[18].low=90;
  bars[25]={...bars[25],open:111,high:112,low:110,close:111};
  const expected=w.StrategyTriggers.computeTechnicalSignals(bars,{symbol:'AAPL',indicators:['resistance']}).find(signal=>signal.index===25);
  assert.ok(expected);
  w.renderCandles({symbol:'AAPL',timeframe:'1Day',bars});
  const row=[...w.document.querySelectorAll('#signalTableBody tr[data-signal-timestamp]')].find(item=>item.dataset.signalTimestamp===expected.timestamp&&item.textContent.includes('Resistencia'));
  assert.ok(row);const button=row.querySelector('button[data-signal-detail]');button.click();
  const detail=w.document.getElementById(button.getAttribute('aria-controls'));
  assert.equal(detail.hidden,false);assert.match(detail.textContent,/Límite previo.*margen ATR.*umbral/i);
  for(const value of [expected.values.zoneUpper,expected.values.buffer,expected.values.atr14,expected.values.threshold,expected.values.pivotConfirmedAt,expected.timestamp]) assert.ok(detail.textContent.includes(String(value)));
 }finally{await new Promise(r=>setImmediate(r));dom.window.close();}
});

test('UI conserva el timestamp original y los valores exactos en la explicación de SMA',async()=>{
 const {dom,w}=page();try{
  const bars=Array.from({length:65},(_,i)=>{const close=i<60?100:100+i-59;return {timestamp:new Date(Date.UTC(2020,0,i+1,5)).toISOString().replace('.000Z','.123456789Z'),open:close,high:close+1,low:close-1,close,volume:10};});
  const expected=w.StrategyTriggers.computeTechnicalSignals(bars,{symbol:'AAPL',indicators:['sma_up']})[0];assert.ok(expected);
  w.renderCandles({symbol:'AAPL',timeframe:'1Day',bars});
  const row=[...w.document.querySelectorAll('#signalTableBody tr[data-signal-timestamp]')].find(item=>item.dataset.signalTimestamp===expected.timestamp&&item.textContent.includes('SMA50'));
  assert.ok(row);assert.ok(row.textContent.includes(w.marketPeriod.formatUtc(expected.timestamp)));
  const button=row.querySelector('button[data-signal-detail]');button.click();
  const detail=w.document.getElementById(button.getAttribute('aria-controls'));
  assert.match(detail.textContent,/Cierre anterior.*SMA50 anterior.*SMA20/i);
  assert.ok(detail.textContent.includes(expected.timestamp));
  for(const value of Object.values(expected.values)) assert.ok(detail.textContent.includes(String(value)));
  assert.ok(detail.textContent.includes(String(expected.price)));
 }finally{await new Promise(r=>setImmediate(r));dom.window.close();}
});

test('UI excluye la vela diaria del día bursátil actual de las señales',async()=>{
 const {dom,w}=page();try{
  const bars=Array.from({length:60},(_,i)=>({timestamp:new Date(Date.UTC(2020,0,i+1,5)).toISOString(),open:100,high:101,low:99,close:100,volume:10}));
  bars.push({timestamp:new Date().toISOString(),open:101,high:102,low:100,close:101,volume:10});
  w.renderCandles({symbol:'AAPL',timeframe:'1Day',bars});
  assert.match(w.document.getElementById('signalSummary').textContent,/día bursátil actual se excluye/);
  assert.equal(w.document.querySelectorAll('#signalTableBody tr[data-signal-timestamp]').length,0);
 }finally{await new Promise(r=>setImmediate(r));dom.window.close();}
});

test('UI envía rango personalizado válido y comunica cobertura parcial; rechaza fechas inválidas',async()=>{
 const {dom,w,calls}=page(null,u=>u.pathname.endsWith('/candles')?{ok:true,status:200,json:async()=>({symbol:'AAPL',timeframe:u.searchParams.get('timeframe'),bars:[{timestamp:'2020-01-03T05:00:00Z',open:100,high:102,low:99,close:101,volume:10}],provider:'alpaca',feed:'iex',requestedBars:100,retrievedBars:1,complete:false,partialReason:'provider_error'})}:null);try{
  const period=w.document.getElementById('chTimeframe');period.value='custom';period.dispatchEvent(new w.Event('change'));
  const start=w.document.getElementById('chStart'),end=w.document.getElementById('chEnd');
  assert.equal(start.disabled,false);start.value='2020-01-01';end.value='2020-01-10';
  w.document.getElementById('chCandleTimeframe').value='1Day';w.document.getElementById('chLimit').value='100';
  const btn=w.document.getElementById('btnLoadCandles');btn.click();await until(()=>!btn.disabled);
  const request=new URL(calls.find(c=>c.url.includes('/broker/candles')).url,'http://localhost');
  assert.equal(request.searchParams.get('start'),'2020-01-01T00:00:00.000Z');assert.equal(request.searchParams.get('end'),'2020-01-10T23:59:59.999Z');assert.equal(request.searchParams.get('limit'),'100');
  assert.match(w.document.getElementById('candlesMeta').textContent,/limitada\/parcial.*provider_error/);
  const before=calls.length;end.value='2019-12-31';btn.click();await until(()=>!btn.disabled);
  assert.equal(calls.length,before);assert.match(w.document.getElementById('alertContainer').textContent,/fecha inicial debe ser anterior/);
 }finally{dom.window.close();}
});

test('editar fechas de un periodo activa personalizado y envía exactamente el intervalo elegido',async()=>{
 const {dom,w,calls}=page(null,u=>u.pathname.endsWith('/candles')?{ok:true,status:200,json:async()=>({symbol:'AAPL',timeframe:u.searchParams.get('timeframe'),bars:[{timestamp:'2025-01-03T05:00:00Z',open:100,high:102,low:99,close:101,volume:10}],provider:'alpaca',feed:'iex',complete:true})}:null);try{
  const RealDate=w.Date, fixed=RealDate.parse('2026-11-19T18:00:00.000Z');
  w.Date=class extends RealDate { constructor(...args){super(...(args.length?args:[fixed]));} static now(){return fixed;} };
  const period=w.document.getElementById('chTimeframe'),start=w.document.getElementById('chStart'),end=w.document.getElementById('chEnd'),btn=w.document.getElementById('btnLoadCandles');
  period.value='6Month';period.dispatchEvent(new w.Event('change'));await until(()=>!btn.disabled);
  assert.equal(start.value,'2026-05-19');assert.equal(end.value,'2026-11-19');
  assert.equal(start.disabled,false);assert.match(w.document.getElementById('chRangeStatus').textContent,/Rango enviado a Quant.*19\/05\/2026.*19\/11\/2026/);
  const before=calls.filter(c=>c.url.includes('/broker/candles')).length;
  start.value='2025-01-01';start.dispatchEvent(new w.Event('input',{bubbles:true}));
  end.value='2026-11-18';end.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(period.value,'custom');assert.equal(calls.filter(c=>c.url.includes('/broker/candles')).length,before);
  assert.match(w.document.getElementById('chRangeStatus').textContent,/01\/01\/2025 00:00:00\.000 UTC.*18\/11\/2026 23:59:59\.999 UTC/);
  btn.click();await until(()=>!btn.disabled);
  const requests=calls.filter(c=>c.url.includes('/broker/candles'));
  const query=new URL(requests.at(-1).url,'http://localhost').searchParams;
  assert.equal(query.get('start'),'2025-01-01T00:00:00.000Z');assert.equal(query.get('end'),'2026-11-18T23:59:59.999Z');
  assert.match(w.document.getElementById('candlesMeta').textContent,/Rango solicitado.*01\/01\/2025.*18\/11\/2026/);
  period.value='6Month';period.dispatchEvent(new w.Event('change'));await until(()=>!btn.disabled);
  const preset=new URL(calls.filter(c=>c.url.includes('/broker/candles')).at(-1).url,'http://localhost').searchParams;
  assert.equal(start.value,preset.get('start').slice(0,10));assert.equal(end.value,preset.get('end').slice(0,10));
  assert.equal(preset.get('start'),'2026-05-19T17:44:00.000Z');assert.equal(preset.get('end'),'2026-11-19T17:44:00.000Z');
 }finally{await new Promise(r=>setImmediate(r));dom.window.close();}
});

test('el rango elegido viaja por HTTP hasta el controlador real de Quant',async()=>{
 const received=[];
 const broker={async getCandles(input){received.push(input);return {symbol:input.symbol,timeframe:input.timeframe,provider:'alpaca',feed:'iex',complete:true,bars:[{timestamp:'2020-01-03T05:00:00Z',open:100,high:102,low:99,close:101,volume:10}]};}};
 const filename=path.join(__dirname,'../../quant-service/src/api/v1/controllers/broker.controller.js'), module={exports:{}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,require(name){
  if(name==='../../../brokers')return {createBroker:()=>broker};
  if(name==='../../../config/env')return {};
  if(name==='../../../services/ingestion')return {createIngestor:()=>({})};
  throw Error('Dependencia no esperada: '+name);
 }},{filename});
 const app=express();app.get('/api/v1/broker/candles',(req,res,next)=>{Promise.resolve(module.exports.getCandles(req,res)).catch(next);});
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 const {dom,w}=page();try{
  const fallback=w.fetch,base=`http://127.0.0.1:${server.address().port}`;
  w.fetch=(url,options)=>String(url).startsWith('/api/v1/broker/candles?')?fetch(base+url,options):fallback(url,options);
  const start=w.document.getElementById('chStart'),end=w.document.getElementById('chEnd');
  start.value='2020-01-01';start.dispatchEvent(new w.Event('input',{bubbles:true}));
  end.value='2020-01-10';end.dispatchEvent(new w.Event('change',{bubbles:true}));
  w.document.getElementById('chCandleTimeframe').value='1Day';w.document.getElementById('chLimit').value='100';
  const btn=w.document.getElementById('btnLoadCandles');btn.click();
  for(let i=0;i<200&&btn.disabled;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(btn.disabled,false,'la consulta HTTP debe completarse');
  assert.equal(received.length,1);
  assert.equal(received[0].start,'2020-01-01T00:00:00.000Z');assert.equal(received[0].end,'2020-01-10T23:59:59.999Z');
  assert.equal(received[0].timeframe,'1Day');assert.equal(received[0].limit,100);
  assert.match(w.document.getElementById('candlesMeta').textContent,/Rango personalizado.*01\/01\/2020.*10\/01\/2020/);
 }finally{await new Promise(r=>setImmediate(r));dom.window.close();await new Promise(resolve=>server.close(resolve));}
});

test('UI diferencia consulta parcial vacía y limpia señales al cambiar el ticker',async()=>{
 const {dom,w}=page(null,u=>u.pathname.endsWith('/candles')?{ok:true,status:200,json:async()=>({symbol:'AAPL',timeframe:u.searchParams.get('timeframe'),bars:[],complete:false,partialReason:'invalid_response'})}:null);try{
  const btn=w.document.getElementById('btnLoadCandles');btn.click();await until(()=>!btn.disabled);
  assert.match(w.document.getElementById('signalSummary').textContent,/Consulta incompleta.*invalid_response/);
  assert.doesNotMatch(w.document.getElementById('signalSummary').textContent,/Sin velas para el periodo/);
  const symbol=w.document.getElementById('chSymbol');symbol.value='MSFT';symbol.dispatchEvent(new w.Event('change'));
  assert.equal(w.__candlesChartState.candles.length,0);
  assert.match(w.document.getElementById('signalSummary').textContent,/configuración cambió/);
 }finally{await new Promise(r=>setImmediate(r));dom.window.close();}
});

test('el análisis de spreads no usa silenciosamente velas parciales',async()=>{
 const {dom,w}=page(null,u=>u.pathname.endsWith('/candles')?{ok:true,status:200,json:async()=>({symbol:'AAPL',timeframe:'1Day',bars:[{timestamp:'2020-01-01T05:00:00Z',open:100,high:101,low:99,close:100}],complete:false,partialReason:'provider_error'})}:null);try{
  const btn=w.document.getElementById('btnResearchAnalyze');btn.click();await until(()=>!btn.disabled);
  assert.match(w.document.getElementById('researchStatus').textContent,/consulta de velas quedó incompleta/);
  assert.equal(w.document.getElementById('researchEvidence').hidden,true);
 }finally{await new Promise(r=>setImmediate(r));dom.window.close();}
});
