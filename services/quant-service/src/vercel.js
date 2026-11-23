'use strict';
const express = require('express');
const { brokerAccess } = require('../../shared/cloud-authorization');
const app = express();
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1/broker/')) return brokerAccess(req, res, next);
  if (/^\/api\/v1\/market-data\/options-chains\/ingestions(?:\/|$)/.test(req.path)) {
    return res.status(503).json({ message: 'Las ingestiones en archivos locales no están disponibles en nube; requieren almacenamiento durable.' });
  }
  next();
});
app.use(require('./app'));
module.exports = app;
