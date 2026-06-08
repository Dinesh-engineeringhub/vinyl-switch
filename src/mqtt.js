// MQTT client. The server connects OUT to an external broker (e.g. HiveMQ
// Cloud) — the same broker the ESP32 devices connect to. Because both sides
// dial out, this works across any networks with no public IP or tunnel.
//
//   subscribe : machine/+/status   (devices report {"online":true,"relay":"on"})
//   publish   : machine/<id>/cmd   (we send {"action":"on","seconds":3600})

import mqtt from 'mqtt';
import { config } from './config.js';
import { db } from './db.js';
import { nowIso } from './util.js';

const STATUS_RE = /^machine\/([^/]+)\/status$/;
const cmdTopic = (deviceId) => `machine/${deviceId}/cmd`;

let client = null;

// --- Start / connect -------------------------------------------------------
export function startMqttClient() {
  const protocol = config.mqttTls ? 'mqtts' : 'mqtt';
  const url = `${protocol}://${config.mqttHost}:${config.mqttPort}`;

  client = mqtt.connect(url, {
    username: config.mqttUsername,
    password: config.mqttPassword,
    reconnectPeriod: 3000, // auto-reconnect every 3s if the link drops
    clientId: 'vinyl-switch-server-' + Math.random().toString(16).slice(2, 8),
  });

  client.on('connect', () => {
    console.log(`[mqtt] connected to broker ${url}`);
    client.subscribe('machine/+/status', { qos: 1 }, (err) => {
      if (err) console.error('[mqtt] subscribe failed:', err.message);
    });
  });

  client.on('reconnect', () => console.log('[mqtt] reconnecting to broker...'));
  client.on('error', (err) => console.error('[mqtt] error:', err.message));
  client.on('message', onStatusMessage);

  return client;
}

// --- Incoming device status ------------------------------------------------
function onStatusMessage(topic, payload) {
  const m = STATUS_RE.exec(topic);
  if (!m) return;
  const deviceId = m[1];

  let data = {};
  try {
    data = JSON.parse(payload.toString() || '{}');
  } catch {
    return; // ignore malformed payloads
  }

  const online = data.online ? 1 : 0;
  const relay = data.relay === 'on' ? 'on' : 'off';

  db.prepare(
    `UPDATE machines
       SET online = ?, relay_state = ?, last_seen = ?
     WHERE device_id = ?`
  ).run(online, relay, nowIso(), deviceId);

  // Resume an in-progress session. If a device drops and comes back mid-session
  // (e.g. it rebooted or lost power), it boots with the relay OFF — but the
  // booking is still 'active'. Re-send ON for the time remaining so the session
  // continues seamlessly without the customer having to do anything.
  if (online && relay === 'off') {
    const machine = db.prepare(`SELECT id FROM machines WHERE device_id = ?`).get(deviceId);
    if (machine) {
      const active = db
        .prepare(
          `SELECT id, end_time FROM bookings
            WHERE machine_id = ? AND status = 'active' AND end_time > ?
            ORDER BY start_time LIMIT 1`
        )
        .get(machine.id, nowIso());
      if (active) {
        const remainingSec = Math.max(
          60,
          Math.round((new Date(active.end_time).getTime() - Date.now()) / 1000)
        );
        turnRelayOn(deviceId, remainingSec);
        console.log(
          `[mqtt] ${deviceId} reconnected mid-session #${active.id}; re-sent ON (${remainingSec}s left)`
        );
      }
    }
  }
}

// --- Outgoing relay commands ----------------------------------------------
export function sendRelayCommand(deviceId, action, seconds = 0) {
  if (!client) {
    console.error('[mqtt] client not started; cannot send command');
    return;
  }
  const payload = JSON.stringify({ action, seconds });
  client.publish(cmdTopic(deviceId), payload, { qos: 1, retain: false }, (err) => {
    if (err) console.error(`[mqtt] publish to ${deviceId} failed:`, err.message);
  });
}

export function turnRelayOn(deviceId, seconds) {
  sendRelayCommand(deviceId, 'on', seconds);
}

export function turnRelayOff(deviceId) {
  sendRelayCommand(deviceId, 'off', 0);
}
