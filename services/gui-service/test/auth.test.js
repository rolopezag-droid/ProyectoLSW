const test=require('node:test'),assert=require('node:assert/strict');
test('registro y sesión validan entradas y nunca guardan contraseña en disco',async()=>{
 const app=require('../src/server');let signup=0;
 app.locals.databaseFactory=()=>({auth:{signUp:async()=>{signup++;return {data:{user:{id:'fake-user'},session:null},error:null};},signInWithPassword:async()=>({data:{session:{access_token:'fake-session',expires_at:123}},error:null})}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(route,body)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try {
  assert.equal((await post('/api/supabase/register',{email:'bad',password:'short'})).status,400);assert.equal(signup,0);
  const r=await post('/api/supabase/register',{email:'test@example.com',password:'fake-password-123'});assert.equal(r.status,202);const registration=await r.json();assert.equal(registration.status,'confirmation_required');assert.match(registration.message,/correo/);assert.equal(r.headers.get('cache-control'),'no-store');
  const login=await post('/api/supabase/session',{email:'test@example.com',password:'fake-password-123'});assert.equal(login.status,200);const body=await login.json();assert.equal(body.accessToken,'fake-session');assert.equal(body.password,undefined);
 }finally{delete app.locals.databaseFactory;await new Promise(r=>server.close(r));}
});

test('sesión distingue credenciales incorrectas y correo sin confirmar',async()=>{
 const app=require('../src/server');let code='invalid_credentials';
 app.locals.databaseFactory=()=>({auth:{signInWithPassword:async()=>({data:null,error:{status:400,code}})}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{for(const [value,pattern] of [['invalid_credentials',/Correo o contraseña incorrectos/],['email_not_confirmed',/confirmar el correo/]]){code=value;const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/supabase/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'test@example.com',password:'fake-password'})});assert.equal(r.status,401);assert.match((await r.json()).message,pattern);}}
 finally{delete app.locals.databaseFactory;await new Promise(r=>server.close(r));}
});

test('registro distingue sesión, error de correo, proveedor no disponible y respuesta incompleta',async()=>{
 const app=require('../src/server');let outcome;
 app.locals.databaseFactory=()=>({auth:{signUp:async()=>{if(outcome instanceof Error)throw outcome;return outcome;}}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const post=()=>fetch('http://127.0.0.1:'+server.address().port+'/api/supabase/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'test@example.com',password:'fake-password-123'})});
 try{
  outcome={data:{user:{id:'fake-user'},session:{access_token:'fake-session',expires_at:123}},error:null};
  let r=await post(),body=await r.json();assert.equal(r.status,201);assert.equal(body.status,'registered');assert.equal(body.accessToken,'fake-session');assert.equal(body.password,undefined);
  for(const [code,status,pattern] of [['email_address_not_authorized',400,/configuración de correo/],['over_email_send_rate_limit',429,/límite/],['signup_disabled',400,/deshabilitado/],['weak_password',400,/contraseña/],['unknown',503,/No se pudo confirmar/]]){
   outcome={error:{code,status,message:'secret-provider-detail'}};r=await post();body=await r.json();assert.equal(r.status,status);assert.match(body.message,pattern);assert.ok(!JSON.stringify(body).includes('secret-provider-detail'));
  }
  outcome={data:{user:null,session:null},error:null};r=await post();assert.equal(r.status,502);assert.equal((await r.json()).status,'registration_unconfirmed');
  outcome=new Error('sensitive-network-detail');r=await post();assert.equal(r.status,503);assert.match((await r.json()).message,/problema de conexión/);
 }finally{delete app.locals.databaseFactory;await new Promise(r=>server.close(r));}
});
