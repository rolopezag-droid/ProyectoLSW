const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { catalogServiceUrl, quantServiceUrl, spreadServiceUrl } = require('./config/env');
const app = express();

// Compatibilidad con el Site URL local anterior. El navegador conserva el fragmento
// de autenticación en el redirect HTTP; no se transmite ni registra en el servidor.
app.get('/', (_request, response) => {
  const destination = new URL(process.env.APP_PUBLIC_URL || `http://localhost:${Number(process.env.GUI_PORT || 3005)}`);
  response.set({ 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' });
  response.redirect(303, destination.origin + '/auth/restablecer.html');
});

app.get('/health', (_request, response) => {
  response.json({ service: 'api-gateway', status: 'ok' });
});

app.use(
  createProxyMiddleware({
    target: catalogServiceUrl,
    changeOrigin: true,
    pathFilter: (path) => path.startsWith('/api/v1/catalogs'),
    on: {
      error: (err, req, res) => {
        console.error('❌ Error de proxy hacia catalog-service:', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({
          message: 'No se pudo contactar al catalog-service.',
          detail: err.message,
        }));
      },
    },
  }),
);

app.use(
  createProxyMiddleware({
    target: quantServiceUrl,
    changeOrigin: true,
    pathFilter: (path) => (
      path.startsWith('/api/v1/quant') ||
      path.startsWith('/api/v1/strategies') ||
      path.startsWith('/api/v1/market-data') ||
      path.startsWith('/api/v1/broker')
    ),
    on: {
      error: (err, req, res) => {
        console.error('❌ Error de proxy hacia quant-service:', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({
          message: 'No se pudo contactar al quant-service.',
          detail: err.message,
        }));
      },
    },
  }),
);

app.use(createProxyMiddleware({
  target: spreadServiceUrl,
  changeOrigin: true,
  pathFilter: path => path === '/api/v1/spreads' || path.startsWith('/api/v1/spreads/'),
  on: { error: (_error, _req, res) => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'No se pudo contactar al spread-service.' }));
  } },
}));

app.use((req, res) => {
  res.status(404).json({ message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

module.exports = app;
