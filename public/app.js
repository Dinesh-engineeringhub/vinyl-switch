// Vinyl Switch — public booking PWA.
// Plain JS, no framework. Switches between <section class="view"> screens.

const api = {
  async get(path) {
    const r = await fetch('/api' + path);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch('/api' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  },
};

// Booking state as the user moves through the steps.
const state = { location: null, machine: null, slot: null, sessionMinutes: 60 };
const history = []; // simple back-stack of view ids

function show(viewId, { push = true } = {}) {
  const current = document.querySelector('.view.active');
  if (push && current && current.id !== viewId) history.push(current.id);
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  window.scrollTo(0, 0);
}

function goBack() {
  const prev = history.pop();
  show(prev || 'view-home', { push: false });
}

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) =>
  new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

// ---------------------------------------------------------------- ACTIVATE --
document.getElementById('activateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('activateMsg');
  const code = document.getElementById('codeInput').value.trim();
  if (code.length !== 6) {
    msg.textContent = 'Enter your 6-digit code.';
    msg.className = 'msg err';
    return;
  }
  msg.textContent = 'Starting…';
  msg.className = 'msg';
  try {
    const res = await api.post('/activate', { code });
    const mins = Math.round(res.runningForSeconds / 60);
    msg.innerHTML = `✅ <b>${res.booking.machine_name}</b> is on for ${mins} min. Enjoy!`;
    msg.className = 'msg ok';
    document.getElementById('codeInput').value = '';
  } catch (err) {
    msg.textContent = '⚠️ ' + err.message;
    msg.className = 'msg err';
  }
});

// ---------------------------------------------------------------- BOOKING ---
async function startBooking() {
  show('view-location');
  const list = document.getElementById('locationList');
  list.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const locations = await api.get('/locations');
    if (!locations.length) {
      list.innerHTML = '<p class="muted">No locations yet. Ask staff to add one.</p>';
      return;
    }
    list.innerHTML = '';
    for (const loc of locations) {
      const el = tile(loc.name, loc.address || '');
      el.onclick = () => chooseLocation(loc);
      list.appendChild(el);
    }
  } catch (err) {
    list.innerHTML = `<p class="msg err">${err.message}</p>`;
  }
}

async function chooseLocation(loc) {
  state.location = loc;
  show('view-machine');
  document.getElementById('machineTitle').textContent = loc.name;
  const list = document.getElementById('machineList');
  list.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const machines = await api.get(`/locations/${loc.id}/machines`);
    if (!machines.length) {
      list.innerHTML = '<p class="muted">No machines at this location yet.</p>';
      return;
    }
    list.innerHTML = '';
    for (const m of machines) {
      const el = tile(m.name, '');
      const badge = document.createElement('span');
      badge.className = 'badge ' + (m.online ? 'online' : 'offline');
      badge.textContent = m.online ? 'Online' : 'Offline';
      el.querySelector('.meta').appendChild(badge);
      el.onclick = () => chooseMachine(m);
      list.appendChild(el);
    }
  } catch (err) {
    list.innerHTML = `<p class="msg err">${err.message}</p>`;
  }
}

async function chooseMachine(m) {
  state.machine = m;
  show('view-slot');
  document.getElementById('slotTitle').textContent = m.name;
  const list = document.getElementById('slotList');
  list.innerHTML = '<p class="muted">Loading times…</p>';
  try {
    const { slots, sessionMinutes } = await api.get(`/machines/${m.id}/availability`);
    state.sessionMinutes = sessionMinutes;
    document.getElementById('sessionLen').textContent = sessionMinutes;
    renderSlots(slots);
  } catch (err) {
    list.innerHTML = `<p class="msg err">${err.message}</p>`;
  }
}

function renderSlots(slots) {
  const list = document.getElementById('slotList');
  list.innerHTML = '';
  if (!slots.length) {
    list.innerHTML = '<p class="muted">No upcoming slots.</p>';
    return;
  }
  // Group by day for readability.
  const byDay = {};
  for (const s of slots) (byDay[fmtDay(s.start)] ??= []).push(s);

  for (const [day, daySlots] of Object.entries(byDay)) {
    const group = document.createElement('div');
    group.className = 'day-group';
    group.innerHTML = `<h3>${day}</h3>`;
    const grid = document.createElement('div');
    grid.className = 'slots';
    for (const s of daySlots) {
      const el = document.createElement('div');
      el.className = 'slot' + (s.available ? '' : ' taken');
      el.innerHTML = `<span class="time">${fmtTime(s.start)}</span>`;
      if (s.available) el.onclick = () => chooseSlot(s);
      grid.appendChild(el);
    }
    group.appendChild(grid);
    list.appendChild(group);
  }
}

function chooseSlot(slot) {
  state.slot = slot;
  show('view-details');
  document.getElementById('slotSummary').innerHTML = `
    <div><b>${state.machine.name}</b> · ${state.location.name}</div>
    <div class="muted">${fmtDay(slot.start)}, ${fmtTime(slot.start)} – ${fmtTime(slot.end)}</div>`;
}

document.getElementById('detailsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('bookingMsg');
  msg.textContent = 'Booking…';
  msg.className = 'msg';
  try {
    const booking = await api.post('/bookings', {
      machine_id: state.machine.id,
      customer_name: document.getElementById('nameInput').value,
      customer_phone: document.getElementById('phoneInput').value,
      start_time: state.slot.start,
    });
    showConfirmation(booking);
  } catch (err) {
    msg.textContent = '⚠️ ' + err.message;
    msg.className = 'msg err';
  }
});

function showConfirmation(booking) {
  show('view-confirm');
  document.getElementById('confirmDetails').innerHTML = `
    <p><b>${booking.machine_name}</b> · ${booking.location_name}<br>
    <span class="muted">${fmtDay(booking.start_time)}, ${fmtTime(booking.start_time)} – ${fmtTime(booking.end_time)}</span></p>`;
  document.getElementById('confirmCode').textContent = booking.activation_code;
  // reset the form for next time
  document.getElementById('detailsForm').reset();
  document.getElementById('bookingMsg').textContent = '';
}

// Reusable tile element with a .meta container on the right.
function tile(title, sub) {
  const el = document.createElement('div');
  el.className = 'tile';
  el.innerHTML = `<div><div class="title">${title}</div>${
    sub ? `<div class="sub">${sub}</div>` : ''
  }</div><div class="meta"></div>`;
  return el;
}

// ------------------------------------------------------------------ NAV -----
document.getElementById('startBookingBtn').onclick = startBooking;
document.getElementById('navBookBtn').onclick = startBooking;
document.getElementById('doneBtn').onclick = () => {
  history.length = 0;
  show('view-home', { push: false });
};
document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = goBack));

// Register service worker (PWA / installable).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
