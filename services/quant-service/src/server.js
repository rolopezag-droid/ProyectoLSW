const app = require('./app');
const { port } = require('./config/env');

app.listen(port, '127.0.0.1', () => {
  console.log(`quant-service listening on port ${port}`);
});
