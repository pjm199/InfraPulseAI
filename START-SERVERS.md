# Start InfraPulse servers (step-by-step)

Use **separate terminals** for each server. Check port status between steps with the command at the bottom.

---

## Step 0: Start PostgreSQL (required for the Node backend)

The Node API uses Prisma and expects Postgres at **localhost:5532** (see `backend-node/.env` → `DATABASE_URL`). If Postgres isn’t running, you’ll see:

- **`Can't reach database server at localhost:5532`** when the app handles `/api/devices` or `/api/alerts`.

**Do this first**, from the project root:

1. Start Docker Desktop (or your Docker daemon).
2. Start the Postgres container:

   ```powershell
   cd e:\InfraPulseAI
   docker compose up -d postgres
   ```

3. Wait a few seconds, then check that the container is up and port 5532 is published:

   ```powershell
   docker ps --filter "name=infrapulse-postgres"
   docker port infrapulse-postgres
   ```

   You should see `5432/tcp -> 0.0.0.0:5532`. Then the Node backend can connect.

---

## Step 1: Check that ports are free (optional)

Run this in PowerShell from the project root to see what is listening on the app ports:

```powershell
netstat -ano | findstr "LISTENING" | findstr " 3000 5173 8000 "
```

- **Empty output** = ports 3000, 5173, 8000 are free.
- If you see lines with `3000`, `5173`, or `8000`, something is already using them (stop that process or use another port).

---

## Step 2: Start the Node.js API (backend)

1. Open a **new terminal**.
2. From the project root:

   ```powershell
   cd e:\InfraPulseAI\backend-node
   npm run dev
   ```

3. Wait until you see:

   ```
   InfraPulse API listening on port 3000
   ```

4. Leave this terminal open. The backend is now serving on **port 3000**.

---

## Step 3: Start the frontend (Vite)

1. Open **another** terminal.
2. From the project root:

   ```powershell
   cd e:\InfraPulseAI\frontend
   npm run dev
   ```

3. Wait until you see something like:

   ```
   VITE v... ready in ... ms
   Local:   http://localhost:5173/
   ```

4. Leave this terminal open. The frontend is on **port 5173** and proxies `/api` to the backend on 3000.

---

## Step 4: (Optional) Start the Python AI backend

Only if you need the chat/AI endpoint:

1. Open another terminal.
2. From the project root:

   ```powershell
   cd e:\InfraPulseAI\backend-python
   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

   (Or use `uv run uvicorn app.main:app --reload --port 8000` if you use uv.)

3. It should listen on **port 8000**. The frontend proxies `/api/chat` to this port.

---

## Port status (route check)

From the project root, run:

```powershell
netstat -ano | findstr "LISTENING" | findstr " 3000 5173 8000 "
```

**Expected after everything is running:**

- One line with **3000** → Node API
- One line with **5173** → Vite frontend
- One line with **8000** → Python API (if started)

Last column is the process ID (PID). To stop a server, either press `Ctrl+C` in its terminal or run:

```powershell
Stop-Process -Id <PID> -Force
```

---

## Quick reference

| Service        | Port | Command (from project root)     |
|----------------|------|----------------------------------|
| Node.js API   | 3000 | `cd backend-node; npm run dev`  |
| Frontend      | 5173 | `cd frontend; npm run dev`       |
| Python API    | 8000 | `cd backend-python; python -m uvicorn app.main:app --reload --port 8000` |

**Order:** Start **Postgres** (Step 0), then **backend-node**, then **frontend**, so the API can reach the DB and the proxy can reach the API.

---

## See a device (e.g. Raspberry Pi) on the dashboard

Devices show up only if they are **registered** with the Node API and belong to the **same Clerk organization** you’re signed into in the dashboard.

### 1. Seed the API key (once)

The register endpoint accepts `x-api-key`. That key must exist in the DB for your org. From project root:

```powershell
cd e:\InfraPulseAI\backend-node
npm run db:seed
```

This uses `CLERK_ORG_ID` and `TENANT_API_KEY` from `backend-node/.env`. Sign in to the dashboard with the **same** Clerk organization.

### 2a. Register from the Raspberry Pi (real edge node)

On the Pi (or any Linux machine), run the installer. It will install Node Exporter + Promtail and register the device.

- **Central URL**: Use the machine where the Node API runs. From another machine (e.g. the Pi), that’s your PC’s IP and port 3000, e.g. `http://192.168.1.100:3000`.
- **API key**: Same value as `TENANT_API_KEY` in `backend-node/.env`.

Example (on the Pi, replace with your values):

```bash
export INFRA_PULSE_URL="http://YOUR_PC_IP:3000"
export TENANT_API_KEY="your-tenant-api-key-from-backend-node-.env"
curl -sSL https://raw.githubusercontent.com/.../install.sh | bash
```

Or if you copied the repo onto the Pi:

```bash
cd /path/to/InfraPulseAI
INFRA_PULSE_URL="http://YOUR_PC_IP:3000" TENANT_API_KEY="your-api-key" bash scripts/install.sh
```

Make sure the Pi can reach your PC on port 3000 (firewall, same network).

### 2b. Register a test device from your PC (no Pi needed)

To see a device on the dashboard right away, register one from your machine:

**PowerShell** (replace `YOUR_TENANT_API_KEY` with the value from `backend-node/.env` → `TENANT_API_KEY`):

```powershell
$apiKey = "YOUR_TENANT_API_KEY"   # e.g. from backend-node\.env
$body = '{"hostname":"raspberry-pi","ip":"192.168.1.50"}'   # use your Pi IP or any label
Invoke-RestMethod -Uri "http://localhost:3000/api/devices/register" -Method POST -Headers @{"x-api-key"=$apiKey; "Content-Type"="application/json"} -Body $body
```

**curl** (e.g. from Git Bash or WSL):

```bash
curl -X POST "http://localhost:3000/api/devices/register" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_TENANT_API_KEY" \
  -d "{\"hostname\":\"raspberry-pi\",\"ip\":\"192.168.1.50\"}"
```

Then open the dashboard (http://localhost:5173), sign in with the **same organization** as `CLERK_ORG_ID` in `backend-node/.env`. You should see the device in the list and on the 3D twin.

### Only the fake device shows after running install.sh on a real Pi

The Pi registers by calling your **Node API** from the Pi. If you only see the test "raspberry-pi" device:

1. **INFRA_PULSE_URL** on the Pi must be your PC’s IP and port, e.g. `http://192.168.1.100:3000` (not `localhost` — that would be the Pi itself).
2. **TENANT_API_KEY** on the Pi must be **exactly** the same as in `backend-node/.env`.
3. Your PC must accept connections on port **3000** (firewall or Windows Defender may block it).
4. The Pi and your PC must be on the same network (or reachable).

Re-run on the Pi (replace with your PC’s IP and your key):

```bash
INFRA_PULSE_URL="http://YOUR_PC_IP:3000" TENANT_API_KEY="your-tenant-api-key" bash scripts/install.sh
```

To confirm the Pi registered: open the dashboard, ensure the correct organization is selected (Organization Switcher), and refresh; or run from project root: `cd backend-node && npx prisma studio` and open the `Device` table to see all registered devices and their `clerkOrgId`.

---

## If you see Prisma errors

- **`Can't reach database server at localhost:5532`** → Postgres is not running or not on port 5532. Do **Step 0** (start the container and confirm with `docker port infrapulse-postgres`).
- **`Authentication failed`** → `backend-node/.env` has the wrong user/password. Use the same as the Postgres container: `infrapulse` / `infrapulse_secret` (and port `5532`).
