'use strict';
// Run only after explicitly linking this checkout to the intended Vercel project.
// Values travel over stdin; no secret is included in command arguments or stdout.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const project = JSON.parse(fs.readFileSync(path.join(root,'.vercel/project.json'),'utf8'));
if (project.projectName !== 'proyectolsw') throw new Error('Confirma el proyecto Vercel antes de configurar variables.');
const local = require('dotenv').parse(fs.readFileSync(path.join(root,'.env'),'utf8'));
const values = {
  ALPACA_API_KEY_ID: local.ALPACA_API_KEY_ID || local.ClientID,
  ALPACA_API_SECRET_KEY: local.ALPACA_API_SECRET_KEY || local.ClientSecret,
  ALPACA_TRADING_BASE_URL: local.ALPACA_TRADING_BASE_URL || local.AlpacaEndpoint || 'https://paper-api.alpaca.markets',
  SUPABASE_URL: local.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: local.SUPABASE_PUBLISHABLE_KEY || local.SUPABASE_KEY || local.SUPABASE_ANON_KEY,
  FMP_API_KEY: local.FMP_API_KEY,
  MONGODB_DATABASE: local.MONGODB_DATABASE,
};
if (local.MONGODB_URI && !['localhost','127.0.0.1','::1','[::1]'].includes(new URL(local.MONGODB_URI).hostname)) values.MONGODB_URI = local.MONGODB_URI;
else console.log('MONGODB_URI omitida: la dirección local no es accesible desde Vercel.');
for (const [name,value] of Object.entries(values)) {
  if (!value) { console.log(name+': sin configurar'); continue; }
  const command = 'npx --yes vercel@66.6.0 env add '+name+' --environment production --type secret --yes --non-interactive --scope brujin';
  const run = spawnSync('cmd.exe',['/d','/s','/c',command],{cwd:root,input:value,encoding:'utf8',windowsHide:true,timeout:60000});
  if (run.status !== 0) { console.error(name+': no se pudo configurar (salida omitida para proteger secretos).'); process.exitCode=1; break; }
  console.log(name+': configurada en producción');
}
