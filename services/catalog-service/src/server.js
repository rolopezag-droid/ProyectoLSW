
const app = require('./app');
const { port } = require('./config/env');
const connectMongoDB = require('./database/mongodb');

const startServer = async () => {
  await connectMongoDB();

  app.listen(port, '127.0.0.1', () => {
    console.log(`catalog-service listening on port ${port}`);
  });
};

startServer();
