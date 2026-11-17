const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
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

test('UI aplica el método del workbench a la tabla comparativa (columna dinámica, cap 20)',async()=>{
 const fresh=new Date().toISOString();
 const {dom,w,calls}=page(null,(u,opts)=>{
  if(u.pathname.endsWith('/broker/quotes'))return {ok:true,status:200,json:async()=>({symbol:u.searchParams.get('symbol'),referencePrice:190.2,referenceSource:'midpoint',referenceTimestamp:fresh})};
  if(u.pathname.endsWith('/options-chain/strikes'))return null;
  if(u.pathname.endsWith('/options-chain')){
   const type=u.searchParams.get('type'),letter=type==='call'?'C':'P';
   return {ok:true,status:200,json:async()=>({contracts:[
    {type,underlyingSymbol:'AAPL',expiration:'2026-12-18',contractSymbol:'AAPL261218'+letter+'00190000',strike:190,bid:type==='call'?4:2,ask:type==='call'?4.2:2.2,timestamp:fresh},
    {type,underlyingSymbol:'AAPL',expiration:'2026-12-18',contractSymbol:'AAPL261218'+letter+'00195000',strike:195,bid:type==='call'?2:4,ask:type==='call'?2.2:4.2,timestamp:fresh}
   ],nextPageToken:null})};
  }
  if(u.pathname.endsWith('/quant/prices'))return {ok:true,status:200,json:async()=>({model:'black-scholes',symbol:JSON.parse(opts.body||'{}').symbol,price:12.3456,currency:'USD',assumptions:{timeToMaturityYears:0.25},calculatedAt:'2026-11-15T00:00:00Z'})};
  return null;
 });try{
  const analyze=w.document.getElementById('btnResearchAnalyze');analyze.click();
  await until(()=>!analyze.disabled&&!w.document.getElementById('researchEvidence').hidden);
  const rowCount=w.document.querySelectorAll('#researchCandidates tr[data-candidate]').length;
  assert.ok(rowCount>=1&&rowCount<=20,'debe haber candidatas visibles para aplicar el método');
  // Cálculo exitoso en el workbench (endpoint prices del stub) y luego aplicar.
  w.document.getElementById('btnCalcQuant').click();
  await until(()=>w.document.getElementById('quantResult').textContent.includes('Precio teórico'));
  assert.ok(w.__workbenchContext,'el workbench debe haber publicado el contexto');
  const quantCallsBefore=calls.filter(c=>c.url.endsWith('/quant/prices')).length;
  w.document.getElementById('btnApplyQuantToTable').click();
  await until(()=>!w.document.getElementById('researchMethodHead').hidden);
  const quantCallsApplied=calls.filter(c=>c.url.endsWith('/quant/prices')).length-quantCallsBefore;
  assert.ok(quantCallsApplied>=1&&quantCallsApplied<=20,'una llamada por candidata visible, máximo 20');
  assert.match(w.document.getElementById('researchMethodHead').textContent,/Precio BS \(pata larga\)/);
  const cell=w.document.querySelector('#researchCandidates tr[data-candidate] td:last-child');
  assert.match(cell.textContent,/12\.35/,'la métrica del stub aparece en la columna');
  assert.match(w.document.getElementById('researchStatus').textContent,/aplicado a \d+ candidata/);
  // El overlay del método queda disponible para la gráfica (nota con la fuente).
  w.__candlesChartState={symbol:'AAPL',timeframe:'1Day',periodLabel:'test',candles:[{timestamp:'2026-11-06T15:00:00Z',open:100,high:102,low:99,close:101,volume:123}]};
  const overlays=w.__candleOverlaySource();
  assert.ok(overlays&&overlays.method&&overlays.method.lines.length===1,'overlay del método presente');
  assert.match(overlays.method.lines[0].label,/BS pata larga/);
  assert.match(overlays.note,/Método Workbench/);
  await new Promise(r=>setImmediate(r));
 }finally{dom.window.close();}
});
