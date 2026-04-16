require('dotenv').config();
const App = require('./App');

const application = new App();

// Start the server
application.start();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  await application.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  await application.stop();
  process.exit(0);
});

module.exports = application;