'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');

async function withServer(app, run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await run('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('Vercel conserva seis servicios y declara todos los destinos de routing y bindings', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal(Object.keys(config.services).length, 6);
  for (const service of Object.values(config.services)) {
    assert.ok(fs.existsSync(path.join(root, service.root, service.entrypoint)));
    for (const binding of service.bindings || []) assert.ok(config.services[binding.service]);
  }
  assert.equal(config.rewrites[0].destination.service, 'gateway');
  assert.equal(config.rewrites.at(-1).destination.service, 'gui');
  assert.match(fs.readFileSync(path.join(root, '.vercelignore'), 'utf8'), /^\.env$/m);
});

test('health remoto usa binding, no el puerto localhost', async () => {
  let requested;
  const result = await require('../src/health').checkService({ id:'quant-service', port:3002, healthUrl:'https://quant.internal/health' }, async url => {
    requested = url;
    return {ok:true,json:async()=>({service:'quant-service',status:'ok'})};
  });
  assert.equal(requested, 'https://quant.internal/health');
  assert.equal(result.running, true);
});

test('cloud rechaza órdenes antes del broker y no promete ingestiones durables', async () => {
  process.env.ALPACA_API_KEY_ID = 'fixture-key'; process.env.ALPACA_API_SECRET_KEY = 'fixture-secret';
  delete process.env.PAPER_TRADING_ENABLED;
  const app = require('../../quant-service/src/vercel');
  await withServer(app, async base => {
    for (const resource of ['orders','spreads']) {
      const response = await fetch(base+'/api/v1/broker/'+resource, {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      assert.equal(response.status, 403); assert.match((await response.json()).message,/no está habilitada/);
    }
    assert.equal((await fetch(base+'/api/v1/broker/account')).status,401);
    assert.equal((await fetch(base+'/api/v1/market-data/options-chains/ingestions/test')).status,503);
    const calculated = await fetch(base+'/api/v1/strategies/evaluate', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategyType:'bull_call',symbol:'AAPL',expiration:'2030-12-20',legs:[{type:'call',side:'buy',strike:100,price:4},{type:'call',side:'sell',strike:105,price:2}]})});
    assert.equal(calculated.status,200); assert.equal((await calculated.json()).maxLoss,200);
  });
});

test('cloud no permite iniciar procesos y la recuperación usa URL HTTPS de producción', async () => {
  process.env.VERCEL = '1'; process.env.VERCEL_PROJECT_PRODUCTION_URL = 'fixture-project.vercel.app';
  const oldPublic = process.env.APP_PUBLIC_URL; delete process.env.APP_PUBLIC_URL;
  try {
    assert.equal(require('../src/auth-recovery').applicationUrl(), 'https://fixture-project.vercel.app');
    const app = require('../src/server');
    await withServer(app, async base => {
      const response = await fetch(base+'/api/services/quant-service/start',{method:'POST'});
      assert.equal(response.status,409);
      assert.match((await response.json()).message,/Vercel administra/);
    });
  } finally {
    delete process.env.VERCEL; delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (oldPublic !== undefined) process.env.APP_PUBLIC_URL=oldPublic;
  }
});

test('catálogo cloud informa que falta MongoDB remoto sin esperar el buffering de Mongoose', async () => {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017';
  const app = require('../../catalog-service/src/vercel');
  await withServer(app, async base => {
    const response = await fetch(base+'/health');
    assert.equal(response.status,503);
    assert.equal((await response.json()).database,'unavailable');
    assert.equal((await fetch(base+'/api/v1/catalogs',{method:'POST'})).status,401);
  });
});
