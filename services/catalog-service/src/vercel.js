'use strict';
const express = require('express');
const mongoose = require('mongoose');
const { mongodbUri, mongodbDatabase } = require('./config/env');
const { requireSession } = require('../../shared/cloud-authorization');
const app = express();
let connecting;
async function connect() {
  if (!mongodbUri || /(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/)/i.test(mongodbUri)) {
    throw new Error('Configura una conexión MongoDB remota para el catálogo.');
  }
  if (mongoose.connection.readyState === 1) return;
  if (!connecting) connecting = mongoose.connect(mongodbUri, {
    dbName: mongodbDatabase, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000,
    maxPoolSize: 5, bufferCommands: false,
  }).catch(error => { connecting = null; throw error; });
  await connecting;
}
app.use(async (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return requireSession(req, res, () => ready(req, res, next));
  }
  return ready(req, res, next);
});
async function ready(req, res, next) {
  try { await connect(); next(); }
  catch { res.status(503).json({ service: 'catalog-service', status: 'unavailable', database: 'unavailable', message: 'Configura y habilita MongoDB remoto para el catálogo.' }); }
}
app.use(require('./app'));
module.exports = app;
