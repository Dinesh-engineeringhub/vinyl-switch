// Entry point: starts the HTTP server (API + PWA), connects the MQTT client
// to the external broker, then kicks off the background scheduler.

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import './db.js'; // initialise schema on boot
import { api } from './routes.js';
import { startMqttClient } from './mqtt.js';
import { startScheduler } from './scheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const app = express();
app.use(express.json());

// REST API
app.use('/api', api);

// Serve the PWA (booking app + admin page)
app.use(express.static(publicDir));

// SPA-style fallback: send index.html for any non-API GET.
app.get('*', (req, res) => {
  res.sendFile(join(publicDir, 'index.html'));
});

app.listen(config.httpPort, () => {
  console.log(`[http] booking app + API on http://localhost:${config.httpPort}`);
});

startMqttClient();
startScheduler();

console.log('[ready] Vinyl Switch server is up.');
