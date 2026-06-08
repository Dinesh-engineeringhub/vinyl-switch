// Core booking logic, shared by the HTTP routes and the scheduler.
// Keeping it here (not in the routes) means the rules live in one place.

import { db } from './db.js';
import { config } from './config.js';
import { turnRelayOn, turnRelayOff } from './mqtt.js';
import { makeActivationCode, generateSlots, addMinutes, nowIso } from './util.js';

// Statuses that occupy a time slot (so it can't be double-booked).
const ACTIVE_STATUSES = ['booked', 'active'];

export function listLocations() {
  return db.prepare(`SELECT * FROM locations ORDER BY name`).all();
}

export function listMachines(locationId) {
  return db
    .prepare(
      `SELECT id, location_id, name, device_id, online, relay_state, last_seen
         FROM machines
        WHERE location_id = ?
        ORDER BY name`
    )
    .all(locationId);
}

export function getMachine(machineId) {
  return db.prepare(`SELECT * FROM machines WHERE id = ?`).get(machineId);
}

// Returns future slots for a machine, each marked available/booked.
export function getAvailability(machineId, days = 2) {
  const slots = generateSlots({ days });
  const existing = db
    .prepare(
      `SELECT start_time, end_time FROM bookings
        WHERE machine_id = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`
    )
    .all(machineId, ...ACTIVE_STATUSES);

  const overlaps = (s, e) =>
    existing.some((b) => b.start_time < e && b.end_time > s);

  return slots.map((slot) => ({
    ...slot,
    available: !overlaps(slot.start, slot.end),
  }));
}

// Create a booking. Throws if the slot is already taken or the machine
// doesn't exist. Returns the new booking row (including activation_code).
export function createBooking({ machineId, customerName, customerPhone, startTime }) {
  const machine = getMachine(machineId);
  if (!machine) throw httpError(404, 'Machine not found');
  if (!customerName?.trim()) throw httpError(400, 'Name is required');

  const start = new Date(startTime);
  if (isNaN(start.getTime())) throw httpError(400, 'Invalid start time');
  if (start.getTime() <= Date.now()) throw httpError(400, 'Slot is in the past');

  const end = addMinutes(start, config.sessionMinutes);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // Transaction: re-check overlap, then insert, so two people can't grab the
  // same slot at the same instant.
  const tx = db.transaction(() => {
    const clash = db
      .prepare(
        `SELECT 1 FROM bookings
          WHERE machine_id = ?
            AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})
            AND start_time < ? AND end_time > ?
          LIMIT 1`
      )
      .get(machineId, ...ACTIVE_STATUSES, endIso, startIso);
    if (clash) throw httpError(409, 'That slot was just taken. Please pick another.');

    const code = makeActivationCode();
    const info = db
      .prepare(
        `INSERT INTO bookings
           (machine_id, customer_name, customer_phone, start_time, end_time, activation_code)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(machineId, customerName.trim(), customerPhone?.trim() || null, startIso, endIso, code);
    return info.lastInsertRowid;
  });

  const id = tx();
  return getBooking(id);
}

export function getBooking(id) {
  return db
    .prepare(
      `SELECT b.*, m.name AS machine_name, m.device_id, l.name AS location_name
         FROM bookings b
         JOIN machines m ON m.id = b.machine_id
         JOIN locations l ON l.id = m.location_id
        WHERE b.id = ?`
    )
    .get(id);
}

// Customer arrives and enters their code -> validate the time window and
// switch the relay on for the session length.
export function activateByCode(code) {
  const booking = db
    .prepare(`SELECT * FROM bookings WHERE activation_code = ? ORDER BY id DESC LIMIT 1`)
    .get(String(code).trim());

  if (!booking) throw httpError(404, 'Invalid code');
  if (booking.status === 'active') throw httpError(409, 'This session is already running');
  if (booking.status !== 'booked')
    throw httpError(409, `This booking is ${booking.status} and cannot be started`);

  const now = Date.now();
  const start = new Date(booking.start_time).getTime();
  const end = new Date(booking.end_time).getTime();
  const graceMs = config.graceMinutes * 60 * 1000;

  if (now < start - graceMs)
    throw httpError(425, 'Too early — please come back at your booked time');
  if (now > end) throw httpError(410, 'This booking has expired');

  const machine = getMachine(booking.machine_id);
  if (!machine.online)
    throw httpError(503, 'This machine is offline. Please ask staff for help.');

  // Run until the originally booked end time (so a late start doesn't extend
  // past the slot). Minimum 1 minute as a guard.
  const remainingSec = Math.max(60, Math.round((end - now) / 1000));

  db.prepare(
    `UPDATE bookings SET status = 'active', activated_at = ? WHERE id = ?`
  ).run(nowIso(), booking.id);

  turnRelayOn(machine.device_id, remainingSec);
  return { booking: getBooking(booking.id), runningForSeconds: remainingSec };
}

export function cancelBooking(id) {
  const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(id);
  if (!booking) throw httpError(404, 'Booking not found');
  if (booking.status === 'active')
    throw httpError(409, 'Cannot cancel a session that is already running');
  if (booking.status !== 'booked')
    throw httpError(409, `Booking is already ${booking.status}`);
  db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(id);
  return getBooking(id);
}

// --- Admin helpers ---------------------------------------------------------
export function createLocation({ name, address }) {
  if (!name?.trim()) throw httpError(400, 'Location name is required');
  const info = db
    .prepare(`INSERT INTO locations (name, address) VALUES (?, ?)`)
    .run(name.trim(), address?.trim() || null);
  return db.prepare(`SELECT * FROM locations WHERE id = ?`).get(info.lastInsertRowid);
}

export function createMachine({ locationId, name, deviceId }) {
  if (!name?.trim()) throw httpError(400, 'Machine name is required');
  if (!deviceId?.trim()) throw httpError(400, 'device_id is required');
  const loc = db.prepare(`SELECT 1 FROM locations WHERE id = ?`).get(locationId);
  if (!loc) throw httpError(404, 'Location not found');
  try {
    const info = db
      .prepare(`INSERT INTO machines (location_id, name, device_id) VALUES (?, ?, ?)`)
      .run(locationId, name.trim(), deviceId.trim());
    return db.prepare(`SELECT * FROM machines WHERE id = ?`).get(info.lastInsertRowid);
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw httpError(409, 'That device_id is already in use');
    throw e;
  }
}

export function adminOverview() {
  const machines = db
    .prepare(
      `SELECT m.*, l.name AS location_name FROM machines m
         JOIN locations l ON l.id = m.location_id
        ORDER BY l.name, m.name`
    )
    .all();
  const now = nowIso();
  for (const m of machines) {
    m.current = db
      .prepare(
        `SELECT * FROM bookings
          WHERE machine_id = ? AND status = 'active' ORDER BY start_time LIMIT 1`
      )
      .get(m.id);
    m.next = db
      .prepare(
        `SELECT * FROM bookings
          WHERE machine_id = ? AND status = 'booked' AND end_time > ?
          ORDER BY start_time LIMIT 1`
      )
      .get(m.id, now);
  }
  return machines;
}

export function forceOff(machineId) {
  const machine = getMachine(machineId);
  if (!machine) throw httpError(404, 'Machine not found');
  // Complete any active session and switch the relay off.
  db.prepare(
    `UPDATE bookings SET status = 'completed' WHERE machine_id = ? AND status = 'active'`
  ).run(machineId);
  turnRelayOff(machine.device_id);
  return { ok: true };
}

// Small helper to attach an HTTP status code to thrown errors.
export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
