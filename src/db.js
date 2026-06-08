// SQLite data layer. Uses better-sqlite3 (synchronous, simple, fast).
// The schema is created automatically on first run.

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

// Make sure the data/ folder exists before opening the file.
const dir = dirname(config.dbFile);
if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL'); // better concurrency for a small web app
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS locations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    address    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS machines (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    -- device_id must match the DEVICE_ID flashed into the ESP32 firmware
    device_id   TEXT NOT NULL UNIQUE,
    -- connectivity, updated from MQTT: 'online' | 'offline'
    online      INTEGER NOT NULL DEFAULT 0,
    -- relay state reported by the device: 'on' | 'off'
    relay_state TEXT NOT NULL DEFAULT 'off',
    last_seen   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id    INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    -- ISO timestamps (UTC) for the 1-hour slot
    start_time    TEXT NOT NULL,
    end_time      TEXT NOT NULL,
    -- 6-digit code the customer uses to start the machine on arrival
    activation_code TEXT NOT NULL,
    -- 'booked' | 'active' | 'completed' | 'cancelled' | 'no_show'
    status        TEXT NOT NULL DEFAULT 'booked',
    activated_at  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_machine_time
    ON bookings (machine_id, start_time);
  CREATE INDEX IF NOT EXISTS idx_bookings_status
    ON bookings (status);
`);

export default db;
