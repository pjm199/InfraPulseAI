# InfraPulse – Full setup checklist (Docker, Prisma, servers)

Use this when “nothing works” to get back to a working state. Run steps **in order** from the **project root** `e:\InfraPulseAI` unless stated otherwise.

---

## Prerequisites

- **Docker Desktop** running.
- **Node.js 20+** installed.
- **Python 3.11+** with `pip` (and `pydantic-settings`, `uvicorn`, `requests`, `psycopg2-binary`, `openai` for backend-python).
- **Root `.env`** exists (copy from `.env.example` if needed) with at least:
  - `POSTGRES_USER=infrapulse`
  - `POSTGRES_PASSWORD=infrapulse_secret`
  - `POSTGRES_DB=infrapulse`
  - `POSTGRES_PORT=5532`
  - Clerk keys if you use the dashboard.

---

## Step 1: Docker – Postgres and Prometheus

From project root:

```powershell
cd e:\InfraPulseAI
docker compose up -d postgres prometheus
```

Verify Postgres is listening on **5532**:

```powershell
docker port infrapulse-postgres
```

You should see: `5432/tcp -> 0.0.0.0:5532`.  
If you see nothing or a different port, ensure root `.env` has `POSTGRES_PORT=5532` and run again.

---

## Step 2: Prisma – DB schema and API key seed

From **backend-node** (this is where Prisma and the Node API run):

```powershell
cd e:\InfraPulseAI\backend-node
```

Ensure **`backend-node\.env`** contains (no comment on the first line):

```env
DATABASE_URL="postgresql://infrapulse:infrapulse_secret@localhost:5532/infrapulse?schema=public"
```

Then run:

```powershell
npx prisma db push
npm run db:seed
```

- `db push`: applies the schema to the DB (Device, Alert, ApiKey tables).
- `db:seed`: creates the API key for your org so the Pi (or curl) can register.

If you see **“Authentication failed”** or **“Can't reach database”**, check:

- Docker: `docker ps --filter "name=infrapulse-postgres"` (must be Up).
- Port: `docker port infrapulse-postgres` → must show `5532`.
- `DATABASE_URL` in `backend-node\.env` → must use `localhost:5532` and user `infrapulse`, password `infrapulse_secret`.

---

## Step 3: Start Node.js API

Same terminal or a new one, from **backend-node**:

```powershell
cd e:\InfraPulseAI\backend-node
npm run dev
```

Wait for: **`InfraPulse API listening on port 3000`**.

On startup it writes **`observability/prometheus_targets/edge_nodes.json`** from existing devices (so if the DB is empty, the file stays empty until you register a device).

---

## Step 4: (Optional) Start Python API (metrics + chat)

New terminal:

```powershell
cd e:\InfraPulseAI\backend-python
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Wait for Uvicorn to report it’s running.  
Python uses **`config.py`** defaults: Postgres at `localhost:5532`, Prometheus at `localhost:9090`. No `.env` in backend-python is required for that.

---

## Step 5: Start frontend

New terminal:

```powershell
cd e:\InfraPulseAI\frontend
npm run dev
```

Open **http://localhost:5173**, sign in with Clerk, and pick the org that matches `CLERK_ORG_ID` in `backend-node\.env`.

---

## Step 6: Register a device (if the Devices panel is empty)

The dashboard only shows devices that exist in the DB and belong to your Clerk org. If the list is empty, register one.

**From your PC (PowerShell), same org as in `backend-node\.env`:**

```powershell
$apiKey = 'jimmyspritz199!!'
$body = '{"hostname":"pi400","ip":"192.168.1.17"}'
Invoke-RestMethod -Uri "http://localhost:3000/api/devices/register" -Method POST -Headers @{"x-api-key"=$apiKey; "Content-Type"="application/json"} -Body $body
```

Use the Pi’s real IP if different. After this, refresh the dashboard; the device should appear.  
If you prefer to register from the Pi again, run `install.sh` there with `INFRA_PULSE_URL` and `TENANT_API_KEY` set (see README or START-SERVERS.md).

---

## Quick verification

| Check | Command or action |
|-------|--------------------|
| Postgres on 5532 | `docker port infrapulse-postgres` → `5432/tcp -> 0.0.0.0:5532` |
| Node API up | Browser or curl: `http://localhost:3000/health` → `{"status":"ok",...}` |
| Python API up | `http://localhost:8000/health` → `{"status":"ok",...}` |
| Frontend | `http://localhost:5173` loads and you can sign in |
| Devices in DB | After register, dashboard shows the device; or run `npx prisma studio` in backend-node and open **Device** table |
| Prometheus targets | After at least one device is registered and Node has started, open `http://localhost:9090/targets` and confirm the node-exporter target for the Pi |

---

## If something still fails

- **Node: “Can't reach database”**  
  → Postgres not on 5532 or wrong credentials. Re-check Step 1 and `backend-node\.env` `DATABASE_URL`.

- **Node: “Invalid API key” on register**  
  → Run `npm run db:seed` in backend-node again (Step 2).

- **Dashboard: empty device list**  
  → Register a device (Step 6). Ensure you’re signed in with the same org as `CLERK_ORG_ID` in backend-node.

- **Python: “password authentication failed” or connection refused**  
  → Same as Node: Postgres must be on 5532 and `config.py` (or backend-python `.env`) must use `localhost:5532` and `infrapulse` / `infrapulse_secret`.

- **Metrics always “No data”**  
  → Ensure Prometheus is up, Node has run at least once after a device was registered (so `edge_nodes.json` is filled), and in Prometheus targets the Pi is UP.

---

## Summary order

1. **Docker:** `docker compose up -d postgres prometheus`
2. **Prisma:** `cd backend-node` → `npx prisma db push` → `npm run db:seed`
3. **Node:** `cd backend-node` → `npm run dev`
4. **Python:** `cd backend-python` → `uvicorn ... --port 8000`
5. **Frontend:** `cd frontend` → `npm run dev`
6. **Device:** Register via PowerShell or Pi `install.sh`, then refresh dashboard.
