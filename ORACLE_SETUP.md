# Oracle Cloud "Always Free" — host Vinyl Switch (free, permanent public IP)

You do **Part A** (create the account + VM — only you can). Then I do **Part B** (deploy).

---

## Part A — what YOU do in the Oracle console

### A1. Create the account
1. Go to **https://www.oracle.com/cloud/free/** → **Start for free**.
2. Sign up: email, phone, and a **card for identity verification**.
   - ⚠️ The **Always Free** resources are **never charged**. (Oracle won't charge unless you
     manually "Upgrade to Paid".)
3. **Home Region:** pick the nearest one (e.g. **India South (Hyderabad)** or **India West (Mumbai)**).
   ⚠️ This can't be changed later.

### A2. Create the VM (instance)
1. Console → ☰ menu → **Compute → Instances → Create instance**.
2. **Name:** `vinyl-switch`
3. **Image:** Canonical **Ubuntu 22.04** (Edit → Change image → Canonical Ubuntu).
4. **Shape:** Edit → choose an **"Always Free eligible"** shape:
   - **VM.Standard.E2.1.Micro** (AMD) — simplest, always available. ✅ recommended
5. **Networking:** leave defaults (it creates a VCN, public subnet, **Assign public IPv4 = yes**).
6. **SSH keys:** choose **"Generate a key pair for me"** → **Download private key** AND public key.
   Save the private key somewhere you'll remember, e.g.:
   `C:\vinyal_switch_project\oracle_key.key`
7. Click **Create**. Wait until state = **Running**.
8. **Copy the Public IP address** shown on the instance page.

### A3. Open the ports (Oracle blocks them by default)
1. On the instance page → click the **Virtual Cloud Network** link.
2. → **Security Lists** → **Default Security List**.
3. **Add Ingress Rules** (add two):
   | Source CIDR | IP Protocol | Destination Port |
   |-------------|-------------|------------------|
   | `0.0.0.0/0` | TCP | `3000` |
   | `0.0.0.0/0` | TCP | `1883` |
   (Port 22 / SSH is already allowed.)

### ✅ When done, send me:
- The **Public IP** (e.g. `132.145.x.x`)
- The **path to the private key** you downloaded (e.g. `C:\vinyal_switch_project\oracle_key.key`)
- The **login user** (Ubuntu image = `ubuntu`)

---

## Part B — what I do (after you send the above)
- SSH in, install Docker, copy this `server/` folder up, generate strong secrets (`DEVICE_PASSWORD`,
  `ADMIN_TOKEN`), `docker compose up -d`, and open the VM's OS firewall for 1883 + 3000.
- Re-flash the ESP32 to point at the VM's public IP (with the matching device password).
- Confirm Booth A comes online — permanently, from any network.

Your server will then live at:
- Booking app: `http://<PUBLIC_IP>:3000/`
- MQTT broker: `<PUBLIC_IP>:1883`
