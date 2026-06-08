// Periodic housekeeping. Runs every 30s:
//  - sessions past their end_time  -> mark 'completed' and switch relay OFF
//  - bookings never activated past their end_time -> mark 'no_show'
// The ESP32 also auto-stops via its own safety timer, so the relay still
// turns off even if the server is briefly unreachable. This is the backup.

import { db } from './db.js';
import { turnRelayOff } from './mqtt.js';
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
      console.log(`[scheduler] session #${b.id} completed -> relay off (${machine.device_id})`);
    }
  }

  // 2) Mark no-shows: booked but never started and the slot has fully passed.
  const noShows = db
    .prepare(`SELECT id FROM bookings WHERE status = 'booked' AND end_time <= ?`)
    .all(now);
  for (const b of noShows) {
    db.prepare(`UPDATE bookings SET status = 'no_show' WHERE id = ?`).run(b.id);
    console.log(`[scheduler] booking #${b.id} marked no_show`);
  }
}

export function startScheduler() {
  tick(); // run once at startup
  return setInterval(tick, 30 * 1000);
}
