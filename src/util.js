// Small helpers: time-slot math and random codes.
import crypto from 'node:crypto';
import { config } from './config.js';

const MS_PER_MIN = 60 * 1000;

// A 6-digit activation code, e.g. "042913".
export function makeActivationCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// Round a Date down to the start of its hour.
export function startOfHour(date) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

// Generate the bookable session slots for the next `days` days.
// Start times step by `slotIntervalMinutes` (the "gap") across each day's
// open->close window. Sessions are `sessionMinutes` long and must finish by
// closing time. Only future slots are returned. All values come from config
// so they can be tuned in .env without code changes.
export function generateSlots({
  fromDate = new Date(),
  days = config.bookingDays,
  openHour = config.openHour,
  closeHour = config.closeHour,
  intervalMinutes = config.slotIntervalMinutes,
} = {}) {
  const slots = [];
  const session = config.sessionMinutes;
  const step = Math.max(5, intervalMinutes) * MS_PER_MIN; // guard against 0
  const now = fromDate.getTime();

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const dayStart = new Date(fromDate);
    dayStart.setDate(dayStart.getDate() + dayOffset);
    dayStart.setHours(openHour, 0, 0, 0);

    const dayClose = new Date(dayStart);
    dayClose.setHours(closeHour, 0, 0, 0); // closeHour=24 rolls to next midnight

    // Latest a session may start so it still ends by closing time.
    const lastStart = dayClose.getTime() - session * MS_PER_MIN;

    for (let t = dayStart.getTime(); t <= lastStart; t += step) {
      if (t <= now) continue; // skip slots already in the past
      slots.push({
        start: new Date(t).toISOString(),
        end: new Date(t + session * MS_PER_MIN).toISOString(),
      });
    }
  }
  return slots;
}

export function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * MS_PER_MIN);
}

export function nowIso() {
  return new Date().toISOString();
}
