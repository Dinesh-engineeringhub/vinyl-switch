// Central configuration. Override any of these with environment variables
// or a `.env` file in the server folder (copy .env.example to .env).

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Load .env (in the server root) if present. Real environment variables still
// win, since loadEnvFile only sets vars that aren't already defined elsewhere.
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
try {
  process.loadEnvFile(envPath);
  console.log('[config] loaded settings from .env');
} catch {
  // No .env file — fall back to defaults below / real env vars.
}

export const config = {
  // HTTP API + PWA are served here
  httpPort: Number(process.env.PORT || 3000),

  // External MQTT broker (e.g. HiveMQ Cloud) that the server connects to as a
  // CLIENT. Both the server and the ESP32 devices connect OUT to it, so it works
  // across any networks — no public IP, port-forwarding, or tunnel needed.
  mqttHost: process.env.MQTT_HOST || 'localhost',
  mqttPort: Number(process.env.MQTT_PORT || 8883),
  mqttUsername: process.env.MQTT_USERNAME || '',
  mqttPassword: process.env.MQTT_PASSWORD || '',
  mqttTls: process.env.MQTT_TLS !== 'false', // HiveMQ Cloud requires TLS

  // Each rental session lasts this many minutes.
  sessionMinutes: Number(process.env.SESSION_MINUTES || 60),

  // Bookable time grid (all editable here / in .env):
  //   openHour / closeHour  -> the daily window sessions may run within (24h clock)
  //   slotIntervalMinutes   -> gap between selectable start times (the "step")
  //   bookingDays           -> how many days ahead customers can book
  openHour: Number(process.env.OPEN_HOUR || 9),
  closeHour: Number(process.env.CLOSE_HOUR || 22),
  slotIntervalMinutes: Number(process.env.SLOT_INTERVAL_MINUTES || 10),
  bookingDays: Number(process.env.BOOKING_DAYS || 3),

  // How long after the booked start time a user may still activate
  // before the slot is released as a "no-show" (minutes).
  graceMinutes: Number(process.env.GRACE_MINUTES || 15),

  // Simple shared secret an ESP32 must send to be trusted as a device.
  // Change this in production and put the same value in the firmware.
  devicePassword: process.env.DEVICE_PASSWORD || 'change-me-device',

  // Simple admin token to protect /admin API routes.
  adminToken: process.env.ADMIN_TOKEN || 'change-me-admin',

  // SQLite database file location.
  dbFile: process.env.DB_FILE || 'data/vinylswitch.db',
};
