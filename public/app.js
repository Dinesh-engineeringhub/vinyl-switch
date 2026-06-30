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

// ---------------------------------------------------------------- QR SCAN ---
let qrScanner = null;
let torchOn = false;

function startScanner() {
  show('view-scan');
  document.getElementById('scanMsg').textContent = '';
  document.getElementById('scanMsg').className = 'msg';
  document.getElementById('torchBtn').style.display = 'none';
  torchOn = false;

  qrScanner = new Html5Qrcode('qr-reader');
  qrScanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 240, height: 240 } },
    async (decodedText) => {
      await stopScanner();
      // Extract ?c= code from the scanned URL
      let code = null;
      try {
        const u = new URL(decodedText);
        code = u.searchParams.get('c');
      } catch {
        code = decodedText.trim(); // fallback: raw code
      }
      if (!code) {
        const msg = document.getElementById('activateMsg');
        msg.textContent = '⚠️ Invalid QR code. Please scan the machine display.';
        msg.className = 'msg err';
        show('view-home', { push: false });
        return;
      }
      handleScannedCode(code);
    },
    () => {} // frame decode errors are normal — ignore them
  ).then(() => {
    // Show the flashlight button only if the device's camera supports torch.
    try {
      const caps = qrScanner.getRunningTrackCapabilities();
      const torchBtn = document.getElementById('torchBtn');
      if (caps && caps.torch) {
        torchBtn.textContent = '🔦 Flashlight: Off';
        torchBtn.style.display = 'block';
      }
    } catch (_) {}
  }).catch((err) => {
    document.getElementById('scanMsg').textContent = '⚠️ Camera error: ' + err;
    document.getElementById('scanMsg').className = 'msg err';
  });
}

async function stopScanner() {
  if (qrScanner) {
    await qrScanner.stop().catch(() => {});
    qrScanner.clear();
    qrScanner = null;
  }
  torchOn = false;
  document.getElementById('torchBtn').style.display = 'none';
}

document.getElementById('scanQRBtn').addEventListener('click', startScanner);
document.getElementById('stopScanBtn').addEventListener('click', async () => {
  await stopScanner();
  show('view-home', { push: false });
});

document.getElementById('torchBtn').addEventListener('click', async () => {
  if (!qrScanner) return;
  const torchBtn = document.getElementById('torchBtn');
  const next = !torchOn;
  try {
    await qrScanner.applyVideoConstraints({ advanced: [{ torch: next }] });
    torchOn = next;
    torchBtn.textContent = torchOn ? '🔦 Flashlight: On' : '🔦 Flashlight: Off';
  } catch (_) {
    document.getElementById('scanMsg').textContent = 'Flashlight not available on this device.';
    document.getElementById('scanMsg').className = 'msg err';
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
  state.activationCode = booking.activation_code;

  document.getElementById('confirmDetails').innerHTML = `
    <p><b>${booking.machine_name}</b> · ${booking.location_name}<br>
    <span class="muted">${fmtDay(booking.start_time)}, ${fmtTime(booking.start_time)} – ${fmtTime(booking.end_time)}</span></p>`;

  // Save session to localStorage so the device QR scan can auto-activate.
  localStorage.setItem('vinyl_session', JSON.stringify({
    code: booking.activation_code,
    deviceId: booking.device_id,
    startTime: booking.start_time,
    endTime: booking.end_time,
    machineName: booking.machine_name,
    locationName: booking.location_name,
  }));

  document.getElementById('activateNowMsg').textContent = '';
  document.getElementById('activateNowMsg').className = 'msg';
  document.getElementById('detailsForm').reset();
  document.getElementById('bookingMsg').textContent = '';
}

// Device-bound activation: a scanned code only activates if it matches the
// booking saved on THIS phone. A machine's QR carries the code the server sent
// to that machine, so a matching code proves the scanner booked that machine.
async function handleScannedCode(scannedCode) {
  const msg = document.getElementById('activateMsg');
  const raw = localStorage.getItem('vinyl_session');

  if (!raw) {
    msg.textContent = '⚠️ No booking found on this phone. Please book a session on this phone first.';
    msg.className = 'msg err';
    show('view-home', { push: false });
    return;
  }

  const sess = JSON.parse(raw);
  if (sess.code !== scannedCode) {
    msg.textContent = `⚠️ This isn't your machine. You booked ${sess.machineName} (${sess.locationName}). Please scan the machine you booked.`;
    msg.className = 'msg err';
    show('view-home', { push: false });
    return;
  }

  // It's their own booking on their own machine → activate, then clear the
  // saved session so the code can't be reused.
  try {
    await activateWithCode(scannedCode, { fromQR: true });
    localStorage.removeItem('vinyl_session');
  } catch (_) {
    /* activateWithCode already displayed the error */
  }
}

async function activateWithCode(code, { fromQR = false } = {}) {
  try {
    const res = await api.post('/activate', { code });
    const mins = Math.round(res.runningForSeconds / 60);
    if (fromQR) {
      const name = (res.booking.customer_name || '').trim();
      document.getElementById('activeWelcome').textContent = name ? `Welcome, ${name}!` : 'Welcome!';
      document.getElementById('activeMachineName').textContent = res.booking.machine_name + ' is ON 🎵';
      document.getElementById('activeSessionInfo').textContent = `Your ${mins}-minute session has started. Enjoy!`;
      show('view-active', { push: false });
    }
    return res;
  } catch (err) {
    if (fromQR) {
      const msgEl = document.getElementById('activateMsg');
      msgEl.textContent = '⚠️ ' + err.message;
      msgEl.className = 'msg err';
      show('view-home', { push: false });
    }
    throw err;
  }
}

document.getElementById('activeHomeBtn').addEventListener('click', () => {
  history.length = 0;
  show('view-home', { push: false });
});

// Stop scanner if user navigates away via browser back
window.addEventListener('popstate', () => stopScanner());

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

// Customer scans the permanent QR sticker on a device (?device=vinyl-001).
// Reads their saved session from localStorage and activates if it matches.
async function handleDeviceScan(deviceId) {
  const msgEl = document.getElementById('activateMsg');
  const raw = localStorage.getItem('vinyl_session');

  if (!raw) {
    msgEl.textContent = 'No booking found. Please book a session first.';
    msgEl.className = 'msg err';
    return;
  }

  const sess = JSON.parse(raw);

  if (sess.deviceId !== deviceId) {
    let machineName = deviceId;
    try {
      const m = await api.get(`/machines/by-device/${encodeURIComponent(deviceId)}`);
      machineName = m.name;
    } catch (_) {}
    msgEl.textContent = `Your booking is for ${sess.machineName}, not ${machineName}. Please go to the correct machine.`;
    msgEl.className = 'msg err';
    return;
  }

  await activateWithCode(sess.code, msgEl);
  // Clear saved session once activated so it can't be reused.
  if (msgEl.className.includes('ok')) localStorage.removeItem('vinyl_session');
}

// Auto-activate when opened via saved link (?c=XXXXXX)
const urlParams = new URLSearchParams(location.search);
const urlCode = urlParams.get('c');
const urlDevice = urlParams.get('device');

if (urlCode) {
  history.replaceState({}, '', location.pathname);
  handleScannedCode(urlCode);
} else if (urlDevice) {
  history.replaceState({}, '', location.pathname);
  handleDeviceScan(urlDevice);
}

// Register service worker (PWA / installable).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
