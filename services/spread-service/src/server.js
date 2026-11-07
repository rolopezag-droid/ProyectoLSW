const app = require('./app');
const { port } = require('./config/env');
require('./db').createDatabase();
const server = app.listen(port, '127.0.0.1', () => console.log(`spread-service (Supabase) listening on port ${port}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
