require('dotenv').config();

// Start the Telegram bot
const botExports = require('./bot');

// Start the web admin panel
const { startServer } = require('./server');
startServer(botExports);
