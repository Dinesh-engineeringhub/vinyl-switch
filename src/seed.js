// Seeds a couple of demo locations and machines so you can try the app
// immediately. Run with:  npm run seed
// Safe to run more than once (it skips if data already exists).

import { db } from './db.js';
import { createLocation, createMachine } from './service.js';

const count = db.prepare(`SELECT COUNT(*) AS n FROM locations`).get().n;
if (count > 0) {
  console.log('Data already present — skipping seed.');
  process.exit(0);
}

const downtown = createLocation({ name: 'Downtown Studio', address: '12 MG Road' });
const mall = createLocation({ name: 'City Mall Kiosk', address: 'Level 2, City Mall' });

createMachine({ locationId: downtown.id, name: 'Booth A', deviceId: 'vinyl-001' });
createMachine({ locationId: downtown.id, name: 'Booth B', deviceId: 'vinyl-002' });
createMachine({ locationId: mall.id, name: 'Pod 1', deviceId: 'vinyl-003' });

console.log('Seeded 2 locations and 3 machines.');
console.log('Device IDs to flash into your ESP32s: vinyl-001, vinyl-002, vinyl-003');
