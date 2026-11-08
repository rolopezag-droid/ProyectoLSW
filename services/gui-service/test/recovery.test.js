const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');

test('recuperación HTTP verifica enlace antes de cambiar contraseña y no filtra credenciales',async()=>{
 const app=require('../src/server');let error=null,verified=true,updated=0,otp=false,redirect;
 app.locals.databaseFactory=()=>({auth:{
  resetPasswordForEmail:async(email,options)=>{redirect=options.redirectTo;return {error};},
  setSession:async()=>verified?{data:{session:{access_token:'fake'},user:{id:'fake-user'}},error:null}:{error:{status:401}},
  verifyOtp:async options=>{otp=options.type==='recovery';return {data:{session:{access_token:'fake'},user:{id:'fake-user'}},error:null};},
  updateUser:async()=>{updated++;return {data:{user:{id:'fake-user'}},error};},
  signOut:async options=>{assert.equal(options.scope,'local');return {error:null};}
 }});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(route,body)=>fetch(base+'/api/supabase/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const credentials={accessToken:'fake-access',refreshToken:'fake-refresh',password:'new-fake-password',confirmPassword:'new-fake-password'};
 try{
  assert.equal((await post('password-reset',{email:'bad'})).status,400);
  let r=await post('password-reset',{email:'test@example.com'});assert.equal(r.status,202);assert.match((await r.json()).message,/Si existe/);assert.equal(redirect,require('../src/auth-recovery').applicationUrl()+'/auth/restablecer.html');assert.equal(r.headers.get('cache-control'),'no-store');
  error={status:429,code:'over_email_send_rate_limit',message:'private-detail'};r=await post('password-reset',{email:'test@example.com'});assert.equal(r.status,429);assert.ok(!JSON.stringify(await r.json()).includes('private-detail'));error=null;
  assert.equal((await post('password-reset/confirm',{password:'password-123',confirmPassword:'password-123'})).status,401);assert.equal(updated,0);
  assert.equal((await post('password-reset/confirm',{...credentials,confirmPassword:'different'})).status,400);assert.equal(updated,0);
  verified=false;assert.equal((await post('password-reset/confirm',credentials)).status,401);assert.equal(updated,0);verified=true;
  r=await post('password-reset/confirm',credentials);assert.equal(r.status,200);const result=await r.json();assert.match(result.message,/Contraseña actualizada/);for(const secret of ['fake-access','fake-refresh','new-fake-password'])assert.ok(!JSON.stringify(result).includes(secret));assert.equal(result.signedOut,true);
  r=await post('password-reset/confirm',{password:'new-fake-password',confirmPassword:'new-fake-password',tokenHash:'fake-hash'});assert.equal(r.status,200);assert.equal(otp,true);
  error={status:422,code:'same_password'};r=await post('password-reset/confirm',credentials);assert.equal(r.status,400);assert.match((await r.json()).message,/distinta/);error=null;
  r=await fetch(base+'/auth/recuperar.html');assert.equal(r.status,200);assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 }finally{delete app.locals.databaseFactory;await new Promise(r=>server.close(r));}
});

function screen(name,fragment='',fetcher=async()=>({ok:true,json:async()=>({message:'Operación completada.'})})){
 const html=fs.readFileSync(path.join(__dirname,'../public/auth',name+'.html'),'utf8');
 const dom=new JSDOM(html,{url:'http://localhost:3005/auth/'+name+'.html'+fragment,runScripts:'outside-only'});dom.window.fetch=fetcher;
 dom.window.eval(fs.readFileSync(path.join(__dirname,'../public/auth/auth.js'),'utf8'));return dom;
}
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setImmediate(r));}throw Error('Pantalla sin resultado');}
test('pantalla de recuperación solicita enlace y muestra resultado sin revelar existencia de cuenta',async()=>{
 let body;const dom=screen('recuperar','',async(url,options)=>{assert.equal(url,'/api/supabase/password-reset');body=JSON.parse(options.body);return {ok:true,json:async()=>({message:'Si existe la cuenta, revisa tu correo.'})};});const w=dom.window;
 try{w.document.getElementById('recoveryEmail').value='test@example.com';w.document.getElementById('recoveryForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await until(()=>!w.document.getElementById('submitRecovery').disabled);assert.equal(body.email,'test@example.com');assert.match(w.document.getElementById('authMessage').textContent,/revisa tu correo/);}finally{w.close();}
});
test('pantalla reset limpia tokens de URL y permite mostrar contraseña, confirmar y finalizar',async()=>{
 let submitted;const dom=screen('restablecer','#type=recovery&access_token=fake-access&refresh_token=fake-refresh',async(url,options)=>{assert.equal(url,'/api/supabase/password-reset/confirm');submitted=JSON.parse(options.body);return {ok:true,json:async()=>({message:'Contraseña actualizada.'})};});const w=dom.window;
 try{
  assert.equal(w.location.hash,'');assert.equal(w.localStorage.length,0);assert.equal(w.document.getElementById('resetForm').hidden,false);
  const password=w.document.getElementById('newPassword'),confirm=w.document.getElementById('confirmPassword'),toggle=w.document.querySelector('[data-password-toggle="newPassword"]');password.value='new-fake-password';toggle.click();assert.equal(password.type,'text');assert.equal(password.value,'new-fake-password');assert.equal(toggle.getAttribute('aria-pressed'),'true');toggle.click();assert.equal(password.type,'password');
  confirm.value='different-password';w.document.getElementById('resetForm').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(submitted,undefined);assert.match(w.document.getElementById('authMessage').textContent,/no coinciden/);
  confirm.value=password.value;w.document.getElementById('resetForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await until(()=>w.document.getElementById('resetForm').hidden);assert.equal(submitted.accessToken,'fake-access');assert.equal(password.value,'');assert.equal(confirm.value,'');assert.match(w.document.getElementById('authMessage').textContent,/actualizada/);assert.equal(w.sessionStorage.length,0);
 }finally{w.close();}
});
for(const fragment of ['', '#error=access_denied&error_code=otp_expired','#type=signup&access_token=fake'])test('pantalla con enlace no recovery ofrece una salida útil '+fragment,()=>{
 const dom=screen('restablecer',fragment);try{assert.equal(dom.window.document.getElementById('resetForm').hidden,true);assert.equal(dom.window.document.getElementById('authMessage').hidden,false);assert.equal(dom.window.location.hash,'');assert.equal(dom.window.document.getElementById('requestAgain').href,'http://localhost:3005/auth/recuperar.html');}finally{dom.window.close();}
});
test('pantalla comunica enlace rechazado y oculta formulario sin repetir petición',async()=>{
 const dom=screen('restablecer','#type=recovery&access_token=fake&refresh_token=fake',async()=>({ok:false,status:401,json:async()=>({message:'El enlace venció.'})}));const w=dom.window;
 try{w.document.getElementById('newPassword').value='new-fake-password';w.document.getElementById('confirmPassword').value='new-fake-password';w.document.getElementById('resetForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await until(()=>w.document.getElementById('resetForm').hidden);assert.match(w.document.getElementById('authMessage').textContent,/venció/);}finally{w.close();}
});
test('gateway redirige la raíz antigua a la pantalla del GUI sin datos sensibles',async()=>{
 const app=require('../../api-gateway/src/app');const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const r=await fetch('http://127.0.0.1:'+server.address().port+'/',{redirect:'manual'});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'http://localhost:'+Number(process.env.GUI_PORT||3005)+'/auth/restablecer.html');assert.equal(r.headers.get('cache-control'),'no-store');}finally{await new Promise(r=>server.close(r));}
});
