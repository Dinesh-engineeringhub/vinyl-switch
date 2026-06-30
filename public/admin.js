// Staff dashboard. All admin API calls send the x-admin-token header.
// The token is kept only in memory (and sessionStorage for convenience).

let token = sessionStorage.getItem('adminToken') || '';

async function adminApi(method, path, body) {
  const r = await fetch('/api/admin' + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

const $ = (id) => document.getElementById(id);
const fmt = (iso) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '';

async function login() {
  token = $('tokenInput').value.trim();
  try {
    await adminApi('GET', '/overview'); // verifies the token
    sessionStorage.setItem('adminToken', token);
    $('gate').style.display = 'none';
    $('dash').style.display = 'block';
    await Promise.all([loadOverview(), loadLocationsIntoSelect()]);
  } catch (err) {
    $('gateMsg').textContent = '⚠️ ' + err.message;
    $('gateMsg').className = 'msg err';
  }
}

async function loadOverview() {
  const box = $('overview');
  box.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const machines = await adminApi('GET', '/overview');
    if (!machines.length) {
      box.innerHTML = '<p class="muted">No machines yet — add one below.</p>';
      return;
    }
    box.innerHTML = '';
    for (const m of machines) {
      const el = document.createElement('div');
      el.className = 'tile';
      const status = m.online ? 'online' : 'offline';

      // A machine in an active session is running until its booked end time,
      // even if the device briefly loses internet (the ESP32's safety timer
      // keeps the relay on). Trust the booking, not the last relay report —
      // otherwise an offline device wrongly shows "off" mid-session.
      const inSession = m.current && new Date(m.current.end_time).getTime() > Date.now();
      const relayOn = inSession || m.relay_state === 'on';
      const relay = relayOn ? '🔴 ON' : '⚪ off';

      let activity = '<span class="muted">idle</span>';
      if (m.current) {
        activity = `▶️ <b>${m.current.customer_name}</b> until ${fmt(m.current.end_time)}`;
        if (!m.online) activity += ' <span class="badge offline">device offline — still running</span>';
      } else if (m.next) {
        activity = `next: ${m.next.customer_name} @ ${fmt(m.next.start_time)}`;
      }
      const deviceUrl = `${location.origin}/?device=${encodeURIComponent(m.device_id)}`;
      el.innerHTML = `
        <div>
          <div class="title">${m.name} <span class="muted">(${m.device_id})</span></div>
          <div class="sub">${m.location_name} · relay ${relay}</div>
          <div class="sub">${activity}</div>
        </div>
        <div class="meta">
          <span class="badge ${status}">${m.online ? 'Online' : 'Offline'}</span>
          <button class="ghost-btn off-btn" data-id="${m.id}" style="margin-top:8px">Force off</button>
        </div>`;

      // Device QR code for printing and sticking on the machine.
      const qrWrap = document.createElement('div');
      qrWrap.style.cssText = 'margin-top:12px;padding:12px;background:#fff;border-radius:8px;display:inline-block;text-align:center';
      const qrDiv = document.createElement('div');
      qrWrap.appendChild(qrDiv);
      const qrLabel = document.createElement('p');
      qrLabel.style.cssText = 'margin:6px 0 0;font-size:11px;color:#444';
      qrLabel.textContent = m.name + ' — scan to activate';
      qrWrap.appendChild(qrLabel);
      const printBtn = document.createElement('button');
      printBtn.className = 'ghost-btn';
      printBtn.textContent = 'Print QR';
      printBtn.style.cssText = 'margin-top:6px;font-size:12px';
      printBtn.onclick = () => {
        const win = window.open('', '_blank');
        win.document.write(`<html><body style="text-align:center;font-family:sans-serif">
          <h2>${m.name}</h2><p>${m.location_name}</p>
          <img src="${qrDiv.querySelector('img').src}" style="width:200px;height:200px"/>
          <p style="font-size:12px;color:#666">Scan with your phone to start your session</p>
          <script>window.onload=()=>window.print()<\/script></body></html>`);
        win.document.close();
      };
      qrWrap.appendChild(printBtn);
      el.appendChild(qrWrap);
      box.appendChild(el);

      new QRCode(qrDiv, { text: deviceUrl, width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M });
    }
    box.querySelectorAll('.off-btn').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        try {
          await adminApi('POST', `/machines/${b.dataset.id}/off`);
          await loadOverview();
        } catch (err) {
          alert(err.message);
          b.disabled = false;
        }
      };
    });
  } catch (err) {
    box.innerHTML = `<p class="msg err">${err.message}</p>`;
  }
}

async function loadLocationsIntoSelect() {
  const locations = await fetch('/api/locations').then((r) => r.json());
  const sel = $('machLoc');
  sel.innerHTML = locations
    .map((l) => `<option value="${l.id}">${l.name}</option>`)
    .join('');
}

async function addLocation() {
  try {
    await adminApi('POST', '/locations', {
      name: $('locName').value,
      address: $('locAddr').value,
    });
    $('locMsg').textContent = '✅ Location added';
    $('locMsg').className = 'msg ok';
    $('locName').value = $('locAddr').value = '';
    await loadLocationsIntoSelect();
  } catch (err) {
    $('locMsg').textContent = '⚠️ ' + err.message;
    $('locMsg').className = 'msg err';
  }
}

async function addMachine() {
  try {
    await adminApi('POST', '/machines', {
      location_id: $('machLoc').value,
      name: $('machName').value,
      device_id: $('machDevice').value,
    });
    $('machMsg').textContent = '✅ Machine added';
    $('machMsg').className = 'msg ok';
    $('machName').value = $('machDevice').value = '';
    await loadOverview();
  } catch (err) {
    $('machMsg').textContent = '⚠️ ' + err.message;
    $('machMsg').className = 'msg err';
  }
}

$('loginBtn').onclick = login;
$('refreshBtn').onclick = loadOverview;
$('addLocBtn').onclick = addLocation;
$('addMachBtn').onclick = addMachine;
$('tokenInput').addEventListener('keydown', (e) => e.key === 'Enter' && login());

// Auto-login if we already have a saved token.
if (token) {
  $('tokenInput').value = token;
  login();
}
// Auto-refresh the overview every 10s while open.
setInterval(() => {
  if ($('dash').style.display !== 'none') loadOverview();
}, 10000);
