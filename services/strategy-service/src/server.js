const app=require('./app');
const {port}=require('./config/env');
// Los setups se persisten mediante Spread Service y Supabase; no se abre MongoDB aquí.
const server=app.listen(port, '127.0.0.1', ()=>console.log('strategy-service listening on port '+port));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
