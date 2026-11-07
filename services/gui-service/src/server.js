const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const { createProxyMiddleware } = require('http-proxy-middleware');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const app = express();
const PORT = Number(process.env.GUI_PORT || 3005);

// Middlewares
app.use(createProxyMiddleware({
  target: process.env.GATEWAY_SERVICE_URL || 'http://localhost:3000',
  changeOrigin: true,
  pathFilter: path => path === '/api/v1/spreads' || path.startsWith('/api/v1/spreads/'),
  on: { error: (_error, _req, res) => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'No se pudo contactar al Gateway.' }));
  } },
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// User session is returned to the browser, never saved to disk or logged.
app.post('/api/supabase/session', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) return res.status(400).json({ message: 'Ingresa correo y contraseña de Supabase.' });
  try {
    const db = require('../../spread-service/src/db').createDatabase();
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error || !data.session) return res.status(401).json({ message: 'No se pudo iniciar sesión en Supabase.' });
    res.json({ accessToken: data.session.access_token, expiresAt: data.session.expires_at });
  } catch { res.status(503).json({ message: 'No se pudo conectar con Supabase.' }); }
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

  let stdoutLog = '';
  let stderrLog = '';

  proc.stdout.on('data', (data) => {
    process.stdout.write('[' + name + '] ' + data.toString());
  });

  proc.stderr.on('data', (data) => {
    process.stderr.write('[' + name + '] ' + data.toString());
  });

  proc.on('close', (code) => {
    console.log(`⏹️  ${svc.name} terminó con código ${code}`);
    serviceProcesses[name] = null;
  });

  proc.on('error', (err) => {
    console.error(`❌ Error iniciando ${svc.name}:`, err.message);
    serviceProcesses[name] = null;
  });

  return proc;
}

// ---- Rutas de control de servicios ----

// Obtener estado de todos los servicios
app.get('/api/services/status', (_req, res) => {
  const status = {};
  for (const [key, svc] of Object.entries(SERVICES)) {
    const proc = serviceProcesses[key];
    status[key] = {
      name: svc.name,
      port: svc.port,
      running: !!proc && proc.exitCode === null && proc.signalCode === null && !proc.killed,
      pid: proc ? proc.pid : null,
    };
  }
  res.json(status);
});

// Iniciar un servicio
app.post('/api/services/:name/start', (req, res) => {
  const { name } = req.params;
  const svc = SERVICES[name];

  if (!svc) {
    return res.status(404).json({ message: `Servicio "${name}" no encontrado.` });
  }

  if (serviceProcesses[name] && !serviceProcesses[name].exitCode) {
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

  if (!proc || proc.exitCode || proc.killed) {
    return res.status(409).json({ message: `El servicio "${name}" no está en ejecución.` });
  }

  proc.kill('SIGTERM');
  serviceProcesses[name] = null;

  res.json({ message: `Deteniendo ${SERVICES[name].name}...` });
});

// Obtener logs de un servicio
app.get('/api/services/:name/logs', (req, res) => {
  const { name } = req.params;
  const proc = serviceProcesses[name];
  if (!proc) {
    return res.json({ logs: 'El servicio no está en ejecución.' });
  }
  // Nota: en esta versión simple no almacenamos logs; devolvemos mensaje.
  res.json({ logs: 'Consulta la consola del servidor para ver los logs en tiempo real.' });
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
    server = app.listen(PORT, () => {
      console.log('Mesa de operaciones: http://localhost:' + PORT);
      for (const name of Object.keys(SERVICES)) startService(name);
    });
    server.on('error', error => { console.error(error.message); shutdown(1); });
  })().catch(error => { console.error(error.message); shutdown(1); });
}

module.exports = app;
