require('dotenv').config();
const WebSocket = require('ws');

const url = 'wss://neovision-relay.onrender.com/ws';
console.log('Connecting to:', url);

const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('Connected successfully!');
  ws.close();
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('Connection failed:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('Timeout — relay did not respond in 10 seconds');
  process.exit(1);
}, 10000);