// HTTP API. Public routes for the booking PWA + admin routes for managing
// locations/machines. Errors thrown by the service carry a .status code.

import { Router } from 'express';
import { config } from './config.js';
import * as svc from './service.js';

export const api = Router();

// Wrap a handler so thrown errors become clean JSON responses.
const h = (fn) => (req, res) => {
  try {
    fn(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || 'Server error' });
  }
};

// ---------------------------------------------------------------- public ---
api.get('/locations', h((req, res) => {
  res.json(svc.listLocations());
}));

api.get('/locations/:id/machines', h((req, res) => {
  res.json(svc.listMachines(Number(req.params.id)));
}));

api.get('/machines/:id/availability', h((req, res) => {
  const days = Math.min(14, Math.max(1, Number(req.query.days) || config.bookingDays));
  res.json({
    sessionMinutes: config.sessionMinutes,
    slotIntervalMinutes: config.slotIntervalMinutes,
    slots: svc.getAvailability(Number(req.params.id), days),
  });
}));

api.post('/bookings', h((req, res) => {
  const { machine_id, customer_name, customer_phone, start_time } = req.body || {};
  const booking = svc.createBooking({
    machineId: Number(machine_id),
    customerName: customer_name,
    customerPhone: customer_phone,
    startTime: start_time,
  });
  res.status(201).json(booking);
}));

api.get('/bookings/:id', h((req, res) => {
  const booking = svc.getBooking(Number(req.params.id));
  if (!booking) return res.status(404).json({ error: 'Not found' });
  res.json(booking);
}));

api.post('/bookings/:id/cancel', h((req, res) => {
  res.json(svc.cancelBooking(Number(req.params.id)));
}));

// Customer enters their 6-digit code at the machine to start their hour.
api.post('/activate', h((req, res) => {
  const { code } = req.body || {};
  res.json(svc.activateByCode(code));
}));

// ----------------------------------------------------------------- admin ---
// Simple shared-token guard. Send header:  x-admin-token: <ADMIN_TOKEN>
function requireAdmin(req, res, next) {
  if (req.get('x-admin-token') !== config.adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

const admin = Router();
admin.use(requireAdmin);

admin.get('/overview', h((req, res) => res.json(svc.adminOverview())));

admin.post('/locations', h((req, res) => {
  res.status(201).json(svc.createLocation(req.body || {}));
}));

admin.post('/machines', h((req, res) => {
  const { location_id, name, device_id } = req.body || {};
  res.status(201).json(
    svc.createMachine({ locationId: Number(location_id), name, deviceId: device_id })
  );
}));

admin.post('/machines/:id/off', h((req, res) => {
  res.json(svc.forceOff(Number(req.params.id)));
}));

api.use('/admin', admin);
