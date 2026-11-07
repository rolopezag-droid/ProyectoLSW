const express = require('express');

const apiRoutes = require('./api/v1/routes');

const app = express();

// FIC: Middlewares generales
app.use(express.json());

// FIC: Healthcheck (ya existía desde la sección C)
app.get('/health', (_request, response) => {
  response.json({ service: 'catalog-service', status: 'ok' });
});

// FIC: Montamos todas las rutas de la API bajo /api/v1
app.use('/api/v1', apiRoutes);

// FIC: 404 - ruta no encontrada
app.use((req, res) => {
  res.status(404).json({ message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

// FIC: Middleware para el manejo de errores (siempre al final)
app.use((error, req, res, next) => {
  const status=error.code===11000?409:error.name==='ValidationError'||error.name==='CastError'?400:error.status||500;
  res.status(status).json({message:status===409?'La key del catálogo ya existe.':status>=500?'No se pudo completar la operación de catálogo.':error.message});
});

module.exports = app;
