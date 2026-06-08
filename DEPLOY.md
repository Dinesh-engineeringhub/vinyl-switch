# Deploying Vinyl Switch to a cloud server

This puts the booking app + MQTT broker on a server with a **fixed public address**, so
ESP32 devices on **any network, anywhere** can connect — no tunnels, no re-flashing.

```
   ESP32 (Booth A, Network 1) ─┐
   ESP32 (Pod 1, Network 2) ───┼──► Cloud server :1883 (MQTT)  +  :3000 (booking app)
   ESP32 (Booth B, Network 3) ─┘          (fixed public IP / domain)
```

## What you need
A small **Linux VM with a public IP** where you can open TCP ports **1883** (MQTT) and **3000**
(web). A website-only host (Vercel/Netlify/Render web) will **not** work — we need a raw TCP port.

| Provider | Notes |
|----------|-------|
| **Oracle Cloud — Always Free** | Free ARM VM, generous. Signup needs a card (not charged). |
| **AWS EC2 / Google Cloud** | 12-month / always-free micro VMs. Card required. |
| **Hetzner / DigitalOcean / Vultr** | Cheap & simple (~$4–6/mo), instant. |

Pick **Ubuntu 22.04/24.04**. Note the VM's **public IP** (e.g. `203.0.113.45`).

---

## Step 1 — Open the firewall ports
In your provider's **security group / firewall** (and the VM's own firewall), allow **inbound**:
- TCP **22** (SSH), TCP **3000** (web), TCP **1883** (MQTT)

```bash
# On the VM (Ubuntu UFW example):
sudo ufw allow 22/tcp && sudo ufw allow 3000/tcp && sudo ufw allow 1883/tcp && sudo ufw enable
```

## Step 2 — Install Docker
```bash
curl -fsSL https://get.docker.com | sudo sh
```

## Step 3 — Copy the server folder to the VM
From your PC (or `git clone` if it's in a repo):
```bash
scp -r software/server  user@<PUBLIC_IP>:~/vinyl-switch
```

## Step 4 — Set secrets and launch
```bash
cd ~/vinyl-switch
cp .env.production.example .env
nano .env          # set DEVICE_PASSWORD and ADMIN_TOKEN to long random values
                   # (generate with:  openssl rand -hex 24)
docker compose up -d --build
docker compose logs -f      # should show "broker listening" + "booking app + API"
```

Your server is now live:
- Booking app: `http://<PUBLIC_IP>:3000/`
- Admin: `http://<PUBLIC_IP>:3000/admin.html`  (token = your `ADMIN_TOKEN`)
- MQTT broker: `<PUBLIC_IP>:1883`

## Step 5 — Add your machines
On the admin page, add each location + machine, giving every ESP32 a **unique `device_id`**
(e.g. `vinyl-001`, `vinyl-002`, …).

## Step 6 — Point each ESP32 at the cloud server
In `firmware/vinyl_switch_esp32/vinyl_switch_esp32.ino`, set per device:
```cpp
const char* MQTT_HOST = "<PUBLIC_IP>";      // or your domain
const int   MQTT_PORT = 1883;
const char* DEVICE_ID = "vinyl-001";        // unique per device
const char* MQTT_PASS = "<your DEVICE_PASSWORD>";
// WIFI_SSID / WIFI_PASS = whatever local 2.4 GHz Wi-Fi that device is on
```
Flash each board. They'll connect from any network and appear **online**.

---

## Recommended hardening (public server)
- Use **long random** `DEVICE_PASSWORD` and `ADMIN_TOKEN` (done in Step 4).
- Add a **domain + HTTPS** for the web app via a reverse proxy (Caddy/Nginx) — Caddy auto-TLS:
  one line `your.domain { reverse_proxy localhost:3000 }`.
- For encrypted device traffic, run **MQTT over TLS (port 8883)** behind the proxy and update the
  firmware to use a secure client. (Optional — the broker is already password-protected.)
- Take periodic backups of the `vinyl-data` volume (the SQLite DB).
