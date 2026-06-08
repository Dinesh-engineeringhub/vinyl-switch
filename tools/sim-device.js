// Virtual ESP32 — lets you test the whole system WITHOUT real hardware.
// It connects to the MQTT broker exactly like the firmware does: reports
// itself online, listens for relay commands, and prints the relay state.
//
// Usage:
//   npm run sim                 (simulates device "vinyl-001")
//   node tools/sim-device.js vinyl-002
//
// Make sure the server is running first (npm start).

import mqtt from 'mqtt';
import { config } from '../src/config.js';

const deviceId = process.argv[2] || 'vinyl-001';
const url = `mqtt://localhost:${config.mqttPort}`;
const topicCmd = `machine/${deviceId}/cmd`;
const topicStatus = `machine/${deviceId}/status`;

let relayOn = false;
let offTimer = null;

const client = mqtt.connect(url, {
  username: 'device',
  password: config.devicePassword,
  clientId: deviceId,
  will: { topic: topicStatus, payload: '{"online":false,"relay":"off"}', qos: 1, retain: true },
});

function publishStatus() {
  client.publish(topicStatus, JSON.stringify({ online: true, relay: relayOn ? 'on' : 'off' }), {
    qos: 1,
    retain: true,
  });
}

client.on('connect', () => {
  console.log(`[sim ${deviceId}] connected to ${url}`);
  client.subscribe(topicCmd, () => publishStatus());
  setInterval(publishStatus, 20000); // heartbeat, like the firmware
});

client.on('message', (topic, payload) => {
  let msg = {};
  try { msg = JSON.parse(payload.toString()); } catch { return; }
  if (msg.action === 'on') {
    relayOn = true;
    const secs = msg.seconds || 0;
    console.log(`[sim ${deviceId}] 🔴 RELAY ON for ${secs}s  (machine powered)`);
    clearTimeout(offTimer);
    if (secs > 0) {
      offTimer = setTimeout(() => {
        relayOn = false;
        console.log(`[sim ${deviceId}] ⚪ relay OFF (safety timer)`);
        publishStatus();
      }, secs * 1000);
    }
  } else if (msg.action === 'off') {
    relayOn = false;
    clearTimeout(offTimer);
    console.log(`[sim ${deviceId}] ⚪ relay OFF (commanded)`);
  }
  publishStatus();
});

client.on('error', (e) => console.error(`[sim ${deviceId}] error:`, e.message));
