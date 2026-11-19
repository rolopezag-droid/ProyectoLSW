/**
 * Seed de catálogos maestros para catalog-service (MongoDB, base market_signal).
 *
 * Idempotente: hace upsert por `key`; si el catálogo ya existe, actualiza
 * label/description/section y reemplaza el arreglo `values`. No duplica.
 *
 * Uso:  node scripts/seed-catalogs.js
 * Lee MONGODB_URI y MONGODB_DATABASE del .env de la raíz del repositorio.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Catalog = require('../services/catalog-service/src/api/v1/models/Catalog');

const CREATED_BY = 'SEED_SCRIPT';

/**
 * Catálogos alineados con el dominio del proyecto (F3, spreads verticales sobre
 * Alpaca). Estructura según catalogs-mongodb.md: documento embebido con values[],
 * codes en UPPER_SNAKE, labels en español.
 */
const catalogs = [
  {
    key: 'brokers',
    label: 'Brokers',
    description: 'Corredoras disponibles para operar y consultar market data.',
    collection: 'trading',
    section: 'Operación',
    sequence: 1,
    route: '/config/brokers',
    values: [
      { id: 'ALPACA', code: 'ALPACA', value: 'Alpaca', alias: 'ALP', sequence: 1, description: 'Broker API usado por el proyecto (cuenta Paper para órdenes).' },
      { id: 'ALPACA_PAPER', code: 'ALPACA_PAPER', value: 'Alpaca Paper', alias: 'ALPP', parentId: 'ALPACA', sequence: 1, description: 'Cuenta de práctica de Alpaca; el proyecto solo envía órdenes aquí.' },
      { id: 'ALPACA_LIVE', code: 'ALPACA_LIVE', value: 'Alpaca Live', alias: 'ALPL', parentId: 'ALPACA', sequence: 2, description: 'Cuenta real de Alpaca; no habilitada en este proyecto.' },
    ],
  },
  {
    key: 'strategies',
    label: 'Estrategias',
    description: 'Estrategias de opciones del equipo (nivel 1: opciones; nivel 2: spreads verticales F3).',
    collection: 'trading',
    section: 'Operación',
    sequence: 2,
    route: '/config/strategies',
    values: [
      { id: 'OPTIONS', code: 'OPTIONS', value: 'Opciones', alias: 'OPT', sequence: 1, description: 'Contratos de opciones sobre acciones.' },
      { id: 'BULL_CALL_SPREAD', code: 'BULL_CALL_SPREAD', value: 'Bull Call Spread', alias: 'BCS', parentId: 'OPTIONS', sequence: 1, description: 'Spread vertical alcista de débito con riesgo limitado.' },
      { id: 'BULL_PUT_SPREAD', code: 'BULL_PUT_SPREAD', value: 'Bull Put Spread', alias: 'BPS', parentId: 'OPTIONS', sequence: 2, description: 'Spread vertical alcista de crédito con riesgo limitado.' },
      { id: 'BEAR_CALL_SPREAD', code: 'BEAR_CALL_SPREAD', value: 'Bear Call Spread', alias: 'XCS', parentId: 'OPTIONS', sequence: 3, description: 'Spread vertical bajista de crédito con riesgo limitado.' },
      { id: 'BEAR_PUT_SPREAD', code: 'BEAR_PUT_SPREAD', value: 'Bear Put Spread', alias: 'XPS', parentId: 'OPTIONS', sequence: 4, description: 'Spread vertical bajista de débito con riesgo limitado.' },
    ],
  },
  {
    key: 'indicators',
    label: 'Indicadores',
    description: 'Indicadores técnicos calculados por Quant Service sobre velas de Alpaca.',
    collection: 'trading',
    section: 'Análisis',
    sequence: 3,
    route: '/config/indicators',
    values: [
      { code: 'SMA_20', value: 'Media móvil simple 20', alias: 'SMA20', sequence: 1, description: 'Promedio de cierres de 20 velas.' },
      { code: 'SMA_50', value: 'Media móvil simple 50', alias: 'SMA50', sequence: 2, description: 'Promedio de cierres de 50 velas.' },
      { code: 'SMA_200', value: 'Media móvil simple 200', alias: 'SMA200', sequence: 3, description: 'Promedio de cierres de 200 velas.' },
      { code: 'RSI_14', value: 'Índice de fuerza relativa 14', alias: 'RSI14', sequence: 4, description: 'Momentum de 14 periodos (0 a 100).' },
      { code: 'ATR_14', value: 'Rango verdadero promedio 14', alias: 'ATR14', sequence: 5, description: 'Volatilidad por vela; usada para tolerancia de niveles.' },
      { code: 'HV', value: 'Volatilidad histórica', alias: 'HV', sequence: 6, description: 'Desviación estándar anualizada de retornos.' },
      { code: 'PIVOT_LEVELS', value: 'Niveles por pivotes', alias: 'PIV', sequence: 7, description: 'Soportes/resistencias confirmados con tres velas posteriores.' },
      { code: 'FUNDAMENTAL_SCORE', value: 'Score fundamental', alias: 'FSCORE', sequence: 8, description: 'Heurística 0-100 con ocho indicadores de FMP.' },
    ],
  },
  {
    key: 'temporalidades',
    label: 'Temporalidades',
    description: 'Intervalos de velas soportados por la consulta de market data.',
    collection: 'trading',
    section: 'Análisis',
    sequence: 4,
    route: '/config/temporalidades',
    values: [
      { code: 'TF_1MIN', value: '1 minuto', alias: '1M', sequence: 1 },
      { code: 'TF_5MIN', value: '5 minutos', alias: '5M', sequence: 2 },
      { code: 'TF_15MIN', value: '15 minutos', alias: '15M', sequence: 3 },
      { code: 'TF_1HOUR', value: '1 hora', alias: '1H', sequence: 4 },
      { code: 'TF_1DAY', value: '1 día', alias: '1D', sequence: 5, description: 'Intervalo por defecto del análisis.' },
      { code: 'TF_1WEEK', value: '1 semana', alias: '1W', sequence: 6 },
      { code: 'TF_1MONTH', value: '1 mes', alias: '1MO', sequence: 7 },
    ],
  },
  {
    key: 'order_types',
    label: 'Tipos de orden',
    description: 'Tipos de orden admitidos por el adaptador de broker.',
    collection: 'trading',
    section: 'Operación',
    sequence: 5,
    route: '/config/order-types',
    values: [
      { code: 'MARKET', value: 'A mercado', alias: 'MKT', sequence: 1, description: 'Ejecución inmediata al precio disponible; no la usa F3.' },
      { code: 'LIMIT', value: 'Limitada', alias: 'LMT', sequence: 2, description: 'Orden con precio límite; es la que construye order-builder para spreads.' },
      { code: 'STOP', value: 'Stop', alias: 'STP', sequence: 3, description: 'Disparo por precio; no soportada por pata en multileg.' },
      { code: 'STOP_LIMIT', value: 'Stop limitada', alias: 'STPL', sequence: 4 },
    ],
  },
  {
    key: 'time_in_force',
    label: 'Vigencia de la orden',
    description: 'Instrucciones de vigencia (time in force) del broker.',
    collection: 'trading',
    section: 'Operación',
    sequence: 6,
    route: '/config/time-in-force',
    values: [
      { code: 'DAY', value: 'Del día', alias: 'DAY', sequence: 1, description: 'Vigente solo la sesión del día; valor por defecto de F3.' },
      { code: 'GTC', value: 'Válida hasta cancelar', alias: 'GTC', sequence: 2 },
      { code: 'OPG', value: 'Apertura de mercado', alias: 'OPG', sequence: 3, description: 'Ejecutable en la subasta de apertura.' },
      { code: 'CLS', value: 'Cierre de mercado', alias: 'CLS', sequence: 4, description: 'Ejecutable en la subasta de cierre.' },
      { code: 'IOC', value: 'Inmediata o cancela', alias: 'IOC', sequence: 5 },
      { code: 'FOK', value: 'Llena o cancela', alias: 'FOK', sequence: 6 },
    ],
  },
  {
    key: 'spread_status',
    label: 'Estados del spread',
    description: 'Estados del ciclo de vida de un spread guardado en Supabase.',
    collection: 'trading',
    section: 'Operación',
    sequence: 7,
    route: '/config/spread-status',
    values: [
      { code: 'DRAFT', value: 'Borrador', alias: 'DRF', sequence: 1, description: 'Puede tener cero, una o dos piernas.' },
      { code: 'EVALUATED', value: 'Evaluado', alias: 'EVL', sequence: 2, description: 'Tiene una instantánea de evaluación guardada.' },
      { code: 'ACTIVE', value: 'Activo', alias: 'ACT', sequence: 3, description: 'Alias de entrada hacia evaluated; requiere dos piernas.' },
      { code: 'CLOSED', value: 'Cerrado', alias: 'CLS', sequence: 4, description: 'Alias de entrada hacia archived.' },
      { code: 'ARCHIVED', value: 'Archivado', alias: 'ARC', sequence: 5 },
    ],
  },
];

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DATABASE || 'market_signal';
  if (!uri) {
    console.error('❌ MONGODB_URI no está definida en el .env de la raíz.');
    process.exit(1);
  }

  await mongoose.connect(uri, { dbName });
  console.log(`📡 Conectado a MongoDB (base: ${dbName})`);

  let created = 0;
  let updated = 0;
  for (const catalog of catalogs) {
    const { key, values, ...fields } = catalog;
    const now = new Date();
    const doc = await Catalog.findOneAndUpdate(
      { key },
      {
        $set: { ...fields, values: values.map((v) => ({ ...v, createdBy: CREATED_BY, updatedBy: CREATED_BY })), updatedBy: CREATED_BY },
        $setOnInsert: { key, active: true, deletedAt: null, createdBy: CREATED_BY },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    const wasNew = doc.createdAt && doc.createdAt.getTime() >= now.getTime() - 2000;
    if (wasNew) created++; else updated++;
    console.log(`  ${wasNew ? '➕ creado' : '♻️  actualizado'}: ${key} (${values.length} valores)`);
  }

  // Índices del modelo de datos (catalogs-mongodb.md: mon-2, mon-3, mon-4).
  const collection = mongoose.connection.collection('catalogs');
  await collection.createIndex({ 'values.parentId': 1 });
  await collection.createIndex({ key: 1, 'values.code': 1 }, { unique: true });
  await collection.createIndex({ key: 1, 'values.sequence': 1 });
  console.log('🗂️  Índices verificados (parentId, key+code, key+sequence).');

  console.log(`\n✅ Seed terminado: ${created} creados, ${updated} actualizados de ${catalogs.length}.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('❌ Error en el seed:', error);
  process.exit(1);
});
