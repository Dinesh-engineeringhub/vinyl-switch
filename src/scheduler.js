// Periodic housekeeping. Runs every 30s:
//  - sessions past their end_time  -> mark 'completed' and switch relay OFF
//  - bookings never activated past their end_time -> mark 'no_show'
// The ESP32 also auto-stops via its own safety timer, so the relay still
// turns off even if the server is briefly unreachable. This is the backup.

import { db } from './db.js';
import { config } from './config.js';
import { turnRelayOff, sendQRToDevice, clearDeviceQR } from './mqtt.js';
import { nowIso } from './util.js';

function tick() {
  const now = nowIso();

  // 1) End active sessions whose time is up.
  const expired = db
    .prepare(`SELECT * FROM bookings WHERE status = 'active' AND end_time <= ?`)
    .all(now);
  for (const b of expired) {
    db.prepare(`UPDATE bookings SET status = 'completed' WHERE id = ?`).run(b.id);
    const machine = db.prepare(`SELECT device_id FROM machines WHERE id = ?`).get(b.machine_id);
    if (machine) {
      turnRelayOff(machine.device_id);
      clearDeviceQR(machine.device_id); // return the display to idle, drop the stale QR
      console.log(`[scheduler] session #${b.id} completed -> relay off (${machine.device_id})`);
    }
  }

  // 2) Mark no-shows: booked but never started and the slot has fully passed.
  const noShows = db
    .prepare(
      `SELECT b.id, m.device_id FROM bookings b
         JOIN machines m ON m.id = b.machine_id
        WHERE b.status = 'booked' AND b.end_time <= ?`
    )
    .all(now);
  for (const b of noShows) {
    db.prepare(`UPDATE bookings SET status = 'no_show' WHERE id = ?`).run(b.id);
    clearDeviceQR(b.device_id);
    console.log(`[scheduler] booking #${b.id} marked no_show`);
  }

  // 3) When a booking enters the activation window (start_time - grace <= now),
  //    push the unique session QR to the device display so the customer can scan it.
  const graceMs = config.graceMinutes * 60 * 1000;
  const windowOpen = new Date(Date.now() + graceMs).toISOString();
  const upcoming = db
    .prepare(
      `SELECT b.activation_code, m.device_id
         FROM bookings b
         JOIN machines m ON m.id = b.machine_id
        WHERE b.status = 'booked'
          AND b.qr_sent = 0
          AND b.start_time <= ?
          AND b.end_time > ?`
    )
    .all(windowOpen, now);
  for (const b of upcoming) {
    sendQRToDevice(b.device_id, b.activation_code);
    db.prepare(
      `UPDATE bookings SET qr_sent = 1 WHERE activation_code = ?`
    ).run(b.activation_code);
    console.log(`[scheduler] session QR sent to ${b.device_id}`);
  }
}

export function startScheduler() {
  tick(); // run once at startup
  return setInterval(tick, 30 * 1000);
}
