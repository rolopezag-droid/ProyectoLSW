const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const { createProxyMiddleware } = require('http-proxy-middleware');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const app = express();
const PORT = Number(process.env.GUI_PORT || 3005);

app.get('/health',(_req,res)=>res.json({service:'gui-service',status:'ok',pid:process.pid}));

// Middlewares
app.use(createProxyMiddleware({
  target: process.env.GATEWAY_SERVICE_URL || 'http://localhost:3000',
  changeOrigin: true,
  pathFilter: path => path === '/api/v1/spreads' || path.startsWith('/api/v1/spreads/') || path === '/api/v1/research-journal' || path.startsWith('/api/v1/research-journal/'),
  on: { error: (_error, _req, res) => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'No se pudo contactar al Gateway.' }));
  } },
}));
app.use(createProxyMiddleware({
  target:process.env.QUANT_SERVICE_URL||'http://127.0.0.1:3002',changeOrigin:true,
  pathFilter:path=>['quant','strategies','market-data','broker'].some(group=>path==='/api/v1/'+group||path.startsWith('/api/v1/'+group+'/')),
  on:{error:(_error,_req,res)=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'No se pudo contactar a Quant Service.'}));}}
}));
app.use(express.json());
app.use('/api/supabase', require('./auth-recovery').recoveryRouter());
app.use('/auth', (_req, res, next) => {
  res.set({ 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" });
  next();
});
app.use(express.static(path.join(__dirname, '..', 'public')));

// User session is returned to the browser, never saved to disk or logged.
app.post('/api/supabase/session', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) return res.status(400).json({ message: 'Ingresa correo y contraseña de Supabase.' });
  try {
    const db = (app.locals.databaseFactory || require('../../spread-service/src/db').createDatabase)();
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if(error && (!error.status || error.status>=500))return res.status(503).json({message:'Supabase no está disponible. Inténtalo más tarde.'});
    if (error || !data?.session) return res.status(401).json({ message: error?.code==='email_not_confirmed'?'Debes confirmar el correo antes de guardar. Revisa tu bandeja de entrada y spam.':error?.status===429?'Demasiados intentos de inicio de sesión. Espera antes de volver a intentarlo.':'Correo o contraseña incorrectos. Usa la contraseña de tu cuenta de la aplicación.' });
    res.json({ accessToken: data.session.access_token, expiresAt: data.session.expires_at });
  } catch { res.status(503).json({ message: 'No se pudo conectar con Supabase.' }); }
});

app.post('/api/supabase/register',async(req,res)=>{
  res.set('Cache-Control','no-store');
  const {email,password}=req.body||{};
  if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||typeof password!=='string'||password.length<8||password.length>256) return res.status(400).json({message:'Ingresa un correo válido y una contraseña de 8 a 256 caracteres.'});
  try {
    const db=(app.locals.databaseFactory || require('../../spread-service/src/db').createDatabase)();
    const {data,error}=await db.auth.signUp({email,password});
    if (error) {
      const messages = {
        signup_disabled: 'El registro de usuarios está deshabilitado en este proyecto de Supabase.',
        email_provider_disabled: 'El registro por correo está deshabilitado en este proyecto de Supabase.',
        email_address_not_authorized: 'Supabase no permite enviar correos a esa dirección con la configuración de correo actual. Se debe configurar el envío de correo del proyecto.',
        over_email_send_rate_limit: 'Supabase alcanzó el límite de envío de correos. Espera antes de volver a intentar el registro.',
        over_request_rate_limit: 'Hay demasiados intentos. Espera antes de volver a intentarlo.',
        weak_password: 'La contraseña no cumple los requisitos de Supabase. Usa una contraseña más segura.',
        email_address_invalid: 'Supabase no acepta ese correo. Revisa que esté escrito correctamente.',
        user_already_exists: 'No se creó una cuenta nueva. Intenta iniciar sesión con tu cuenta de la aplicación.'
      };
      const status = error.status === 429 ? 429 : (!error.status || error.status >= 500) ? 503 : 400;
      return res.status(status).json({status:'registration_error',message:messages[error.code] || (status===503?'No se pudo confirmar el registro: Supabase no respondió correctamente. Revisa tu correo antes de reintentar.':'Supabase rechazó el registro. Revisa correo, contraseña y configuración de registro del proyecto.')});
    }
    if (!data?.user?.id) return res.status(502).json({status:'registration_unconfirmed',message:'Supabase devolvió una respuesta incompleta. No se pudo confirmar el registro.'});
    const session=data.session;
    return res.status(session?201:202).json({status:session?'registered':'confirmation_required',message:session?'Cuenta creada e inicio de sesión correcto. Ya puedes guardar tu estrategia.':'Solicitud de registro aceptada; todavía no hay sesión iniciada. Revisa tu correo y spam para confirmar la cuenta. Si ya estaba registrada, inicia sesión con la contraseña de la aplicación.',...(session?{accessToken:session.access_token,expiresAt:session.expires_at}:{})});
  }catch{return res.status(503).json({status:'registration_unconfirmed',message:'No se pudo confirmar el registro por un problema de conexión con Supabase. Revisa tu correo antes de reintentar.'});}
});

// ---- Configuración de servicios disponibles ----
const SERVICES = {
  'api-gateway': {
    name: 'API Gateway',
    port: Number(process.env.GATEWAY_PORT || 3000),
    cwd: path.resolve(__dirname, '../../api-gateway'),
    script: 'src/server.js',
    url: process.env.CATALOG_SERVICE_URL || 'http://localhost:3001',
  },
  'catalog-service': {
    name: 'Catalog Service',
    port: Number(process.env.PORT || 3001),
    cwd: path.resolve(__dirname, '../../catalog-service'),
    script: 'src/server.js',
  },
  'quant-service': {
    name: 'Quant Service',
    port: Number(process.env.QUANT_PORT || 3002),
    cwd: path.resolve(__dirname, '../../quant-service'),
    script: 'src/server.js',
  },
  'strategy-service': {
    name: 'Strategy Service',
    port: Number(process.env.STRATEGY_PORT || 3003),
    cwd: path.resolve(__dirname, '../../strategy-service'),
    script: 'src/server.js',
  },
  'spread-service': {
    name: 'Spread Service',
    port: Number(process.env.SPREAD_PORT || 3004),
    cwd: path.resolve(__dirname, '../../spread-service'),
    script: 'src/server.js',
  },
};

// Procesos de servicios en ejecución
const serviceProcesses = {};
const serviceLogs = {};


function startService(name) {
  const svc = SERVICES[name];
  console.log(`🚀 Iniciando ${svc.name} en ${svc.cwd}...`);

  const proc = spawn(process.execPath, [svc.script], {
    cwd: svc.cwd,
    windowsHide: true,
    env: { ...process.env, ...(name === 'catalog-service' ? { PORT: String(svc.port) } : {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serviceProcesses[name] = proc;
  serviceLogs[name]='';
  const remember=data=>{let text=data.toString();for(const key of ['ClientSecret','ALPACA_API_SECRET_KEY','SUPABASE_KEY','ClientID','ALPACA_API_KEY_ID'])if(process.env[key])text=text.split(process.env[key]).join('[redacted]');serviceLogs[name]=(serviceLogs[name]+text).slice(-16384);return text;};



  proc.stdout.on('data', (data) => {
    process.stdout.write('[' + name + '] ' + remember(data));
  });

  proc.stderr.on('data', (data) => {
    process.stderr.write('[' + name + '] ' + remember(data));
  });

  proc.on('close', (code) => {
    console.log(`⏹️  ${svc.name} terminó con código ${code}`);
    if(serviceProcesses[name]===proc) serviceProcesses[name] = null;
  });

  proc.on('error', (err) => {
    console.error(`❌ Error iniciando ${svc.name}:`, err.message);
    serviceProcesses[name] = null;
  });

  return proc;
}

// ---- Rutas de control de servicios ----

// Obtener estado de todos los servicios
app.get('/api/services/status', async (_req,res)=>{
  const {checkService}=require('./health');
  const entries=await Promise.all(Object.entries(SERVICES).map(async([key,svc])=>{
    const proc=serviceProcesses[key];
    return [key,{name:svc.name,port:svc.port,pid:proc?.pid||null,processRunning:!!proc&&proc.exitCode===null&&!proc.killed,...await checkService({...svc,id:key})}];
  }));
  res.json(Object.fromEntries(entries));
});

// Iniciar un servicio
app.post('/api/services/:name/start', (req, res) => {
  const { name } = req.params;
  const svc = SERVICES[name];

  if (!svc) {
    return res.status(404).json({ message: `Servicio "${name}" no encontrado.` });
  }

  if (serviceProcesses[name] && serviceProcesses[name].exitCode === null && !serviceProcesses[name].killed) {
    return res.status(409).json({ message: `El servicio "${name}" ya está en ejecución.` });
  }

  const proc = startService(name);

  res.json({
    message: `Iniciando ${svc.name}...`,
    port: svc.port,
    pid: proc.pid,
  });
});

// Detener un servicio
app.post('/api/services/:name/stop', (req, res) => {
  const { name } = req.params;
  const proc = serviceProcesses[name];

  if (!proc || proc.exitCode !== null || proc.killed) {
    return res.status(409).json({ message: `El servicio "${name}" no está en ejecución.` });
  }

  proc.kill('SIGTERM');
  serviceProcesses[name] = null;

  res.json({ message: `Deteniendo ${SERVICES[name].name}...` });
});

// Obtener logs de un servicio
app.get('/api/services/:name/logs',(req,res)=>{
  if(!SERVICES[req.params.name])return res.status(404).json({message:'Servicio no encontrado.'});
  res.json({logs:serviceLogs[req.params.name]||'',source:'managed-process',maxBytes:16384});
});

// ---- Proxy a servicios remotos (cuando estén levantados) ----

const quantUrl = process.env.QUANT_SERVICE_URL || 'http://localhost:3002';
const strategyUrl = process.env.STRATEGY_SERVICE_URL || 'http://localhost:3003';
const catalogUrl = process.env.CATALOG_SERVICE_URL || 'http://localhost:3001';

const proxyOptions = {
  changeOrigin: true,
  timeout: 30000,
  onError: (err, req, res) => {
    if (!res.headersSent) {
      res.status(502).json({
        message: 'No se pudo contactar al servicio backend.',
        detail: err.message,
      });
    }
  },
};

// Proxy a quant-service
app.use('/api/quant', createProxyMiddleware({
  target: quantUrl,
  pathRewrite: { '^/api/quant': '/api/v1/quant' },
  ...proxyOptions,
}));

// Proxy a quant-service strategies
app.use('/api/strategies', createProxyMiddleware({
  target: quantUrl,
  pathRewrite: { '^/api/strategies': '/api/v1/strategies' },
  ...proxyOptions,
}));

// Proxy a quant-service market-data
app.use('/api/market-data', createProxyMiddleware({
  target: quantUrl,
  pathRewrite: { '^/api/market-data': '/api/v1/market-data' },
  ...proxyOptions,
}));

// Proxy a quant-service broker
app.use('/api/broker', createProxyMiddleware({
  target: quantUrl,
  pathRewrite: { '^/api/broker': '/api/v1/broker' },
  ...proxyOptions,
}));

// Proxy a catalog-service
app.use('/api/catalogs', createProxyMiddleware({
  target: catalogUrl,
  pathRewrite: { '^/api/catalogs': '/api/v1/catalogs' },
  ...proxyOptions,
}));

// ---- Endpoint de evaluación local (fallback si quant-service no está levantado) ----
app.post('/api/evaluate/local', (req, res) => {
  try {
    const { evaluateVerticalSpread } = require('../../quant-service/src/services/vertical-spread');
    const result = evaluateVerticalSpread(req.body || {});
    res.json({ source: 'local-module', ...result });
  } catch (err) {
    res.status(400).json({
      message: 'No se pudo evaluar localmente.',
      detail: err.message,
    });
  }
});

// 404 para API
app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'Endpoint API no encontrado.' });
});

// Ruta principal: sirve el dashboard (catch-all para cualquier ruta no API)
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((error,_req,res,next)=>{
  if(res.headersSent)return next(error);
  res.status(error.status||500).json({message:error.status===400?'El cuerpo JSON no es válido.':'No se pudo completar la solicitud.'});
});

if (require.main === module) {
  const net = require('net');
  const checkPort = port => new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error('El puerto ' + port + ' está ocupado. Detén la versión anterior antes de iniciar.')));
    probe.listen(port, () => probe.close(resolve));
  });
  let server;
  let stopping = false;
  function shutdown(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const proc of Object.values(serviceProcesses)) if (proc && proc.exitCode === null) proc.kill();
    if (server) server.close();
    process.exitCode = code;
  }
  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());
  process.on('exit', () => { for (const proc of Object.values(serviceProcesses)) if (proc && proc.exitCode === null) proc.kill(); });
  (async () => {
    await Promise.all([PORT, ...Object.values(SERVICES).map(svc => svc.port)].map(checkPort));
    server = app.listen(PORT, '127.0.0.1', () => {
      console.log('Mesa de operaciones: http://localhost:' + PORT);
      for (const name of Object.keys(SERVICES)) startService(name);
    });
    server.on('error', error => { console.error(error.message); shutdown(1); });
  })().catch(error => { console.error(error.message); shutdown(1); });
}

module.exports = app;
