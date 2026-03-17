# InfraPulse – Distributed Predictive Observability Platform

InfraPulse is a containerized observability and AI platform for **1–100 nodes**:

- **Metrics & logs**: Prometheus, Loki, Grafana, Node Exporter, Promtail.
- **Metadata & API**: Node.js + Prisma backend with **Clerk Organizations** (multi-tenant).
- **AI backend**: Python + FastAPI using OpenAI to detect anomalies and forecast failures.
- **Frontend**: React + Vite + Tailwind + React Three Fiber (3D digital twin) + Clerk React.
- **Alerting**: Telegram notifications for critical/predictive alerts.

This repo is organized in five phases. Each phase has a detailed `PHASE_X_STEP.md` document.  
**→ For a minimal path to a running dashboard, see [§3. Quick start (perfect startup)](#3-quick-start-perfect-startup).**

---

## 1. Repository Layout

```text
InfraPulseAI/
├── docker-compose.yml               # All core services
├── .env.example                     # Copy to .env and edit
├── frontend/                        # React + Vite + TS + Tailwind + Clerk + 3D twin
├── backend-node/                    # Node.js API + Prisma + Clerk auth
├── backend-python/                  # FastAPI AI backend + worker + /api/chat
├── observability/
│   ├── prometheus.yml               # Prometheus config (self + file_sd edge nodes)
│   ├── loki-config.yml              # Loki config
│   └── prometheus_targets/
│       └── edge_nodes.json          # file_sd targets for edge Node Exporters
└── scripts/
    ├── install.sh                   # Edge node auto-enrollment (Node Exporter + Promtail)
    └── simulate_load.py             # Phase 5: load simulator (CPU/disk)

PHASE_1_STEP.md, PHASE_2_STEP.md, PHASE_3_STEP.md describe each backend phase in detail.
```

---

## 2. Prerequisites

- Docker + Docker Compose
- Node.js 20+ (for local dev of backend-node/frontend)
- Python 3.11+ (for running `simulate_load.py` directly)
- OpenAI API key (for AI backend + chat)
- Clerk application with Organizations enabled (for auth and multi-tenancy)

---

## 3. Quick start (perfect startup)

Follow these steps **in order** from the **project root** (`InfraPulseAI/`).

| Step | What | Where |
|------|------|--------|
| 1 | Copy env and set Clerk + API key | Root and `backend-node/` |
| 2 | Start the stack | Project root |
| 3 | Push DB schema and seed tenant API key | `backend-node/` |
| 4 | Run the frontend | `frontend/` |
| 5 | Open dashboard and sign in | Browser |
| 6 | (Optional) Enroll edge nodes | Raspberry Pi / Linux |

**Step 1 – Configuration**

```bash
cp .env.example .env
# Edit .env: set CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, VITE_CLERK_PUBLISHABLE_KEY,
# OPENAI_API_KEY, and optionally TELEGRAM_* and ports.
```

Create `backend-node/.env` (copy from `backend-node/.env.example`) and set at least:

- `DATABASE_URL` – same Postgres as root (e.g. `postgresql://infrapulse:infrapulse_secret@localhost:5432/infrapulse`)
- Optionally `CLERK_ORG_ID` and `TENANT_API_KEY` for the seed step (or pass them on the command line in Step 3).

**Step 2 – Start the stack**

```bash
docker compose up -d
```

Wait until Postgres, Node API, and Python API are up (e.g. `docker compose ps`).

**Step 3 – Database and tenant API key**

```bash
cd backend-node
npm install
npx prisma generate
npx prisma db push
CLERK_ORG_ID=org_YOUR_ORG_ID TENANT_API_KEY=your-secret-key npm run db:seed
cd ..
```

Get `org_YOUR_ORG_ID` from [Clerk Dashboard](https://dashboard.clerk.com) → your app → Organizations. Use the same `TENANT_API_KEY` when you run `install.sh` on edge nodes.

**Step 4 – Frontend**

```bash
cd frontend
npm install
npm run dev
```

**Step 5 – Dashboard**

- Open **http://localhost:5173**
- Sign in with Clerk and select the **same organization** as the one you used for `CLERK_ORG_ID` in Step 3.
- You should see the dashboard (device list may be empty until you enroll nodes).

**Step 6 – (Optional) Enroll edge nodes**

On each Raspberry Pi or Linux server:

```bash
INFRA_PULSE_URL=http://YOUR_WINDOWS_OR_SERVER_IP:3000 \
TENANT_API_KEY=your-secret-key \
./install.sh
```

(or download `install.sh` from this repo and run with the same env vars). Devices will appear in the dashboard for the org that owns the API key.

**Add a device manually (e.g. your Windows PC)**

To add a host that doesn’t run the Linux install script (e.g. your Windows 11 PC), register it with the same API:

From **backend-node/** (Node API must be running, and `TENANT_API_KEY` in `.env`):

```bash
# Get your PC hostname: in PowerShell run   $env:COMPUTERNAME
# Get your PC IPv4: in PowerShell run   (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' }).IPAddress

npm run register-device -- YOUR_HOSTNAME YOUR_IP
# For Windows (CPU/memory/disk): add "windows" so Prometheus scrapes Windows Exporter on port 9182:
npm run register-device -- YOUR_HOSTNAME YOUR_IP windows
```

Example: `npm run register-device -- DESKTOP-ABC123 192.168.1.50 windows`. The device appears in the dashboard and 3D twin. For **live CPU, memory, and disk** on Windows, install **Windows Exporter** and register with the `windows` flag — see [Monitor your Windows PC](docs/windows-exporter-setup.md).

For more detail on any step, see the sections below (Configuration, Bring Up the Stack, Clerk setup, Frontend, Enrolling Edge Nodes).

---

## 4. Configuration (`.env`)

1. Copy the example file and edit it:

```bash
cp .env.example .env
```

2. Important variables:

| Area | Key | Notes |
|------|-----|-------|
| PostgreSQL | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Metadata + alerts DB |
| Observability | `PROMETHEUS_PORT`, `LOKI_PORT`, `GRAFANA_PORT` | External ports for core stack |
| Backend ports | `BACKEND_NODE_PORT`, `BACKEND_PYTHON_PORT` | Frontend points to these via `VITE_API_BASE_URL`, `VITE_AI_BASE_URL` |
| Clerk | `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` | Backend-node and frontend auth |
| Tenant API key | `CLERK_ORG_ID`, `TENANT_API_KEY` | Used when seeding `ApiKey` for edge registration |
| AI backend | `OPENAI_API_KEY` | Required for predictions and `/api/chat` |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Optional but recommended for alerts |
| AI worker | `RUN_WORKER`, `WORKER_INTERVAL_SECONDS`, `METRICS_LOOKBACK_HOURS` | Control Python worker behaviour |
| Frontend | `VITE_API_BASE_URL`, `VITE_AI_BASE_URL` | Where React frontend calls Node and Python APIs |

See `PHASE_1_STEP.md`–`PHASE_3_STEP.md` for deeper configuration notes.

---

## 5. Bring Up the Stack

From the project root:

```bash
docker compose up -d
```

Services:

- Postgres: `localhost:5432`
- Prometheus: `http://localhost:9090`
- Loki: `http://localhost:3100`
- Grafana: `http://localhost:3001` (admin/admin by default; see `.env`)
- Node API (`backend-node`): `http://localhost:3000`
- Python AI (`backend-python`): `http://localhost:8000`

---

## 6. Clerk and Tenant API Key Setup (Phase 2)

1. Configure your Clerk app and create an Organization for each tenant.
2. In `backend-node`, install deps & generate Prisma client (if running outside Docker):

```bash
cd backend-node
npm install
npx prisma generate
```

3. Push the schema and seed an API key for a tenant:

```bash
cd backend-node
npx prisma db push
CLERK_ORG_ID=org_xxx TENANT_API_KEY=your-secret-key npm run db:seed
```

This creates an `ApiKey` row for that org. Use the same `TENANT_API_KEY` when running `install.sh` on edge nodes.

---

## 7. Enrolling Edge Nodes (Phase 1 + 2)

On each edge node (Raspberry Pi or Linux server):

```bash
INFRA_PULSE_URL=http://YOUR_CENTRAL_HOST:3000 \
TENANT_API_KEY=your-secret-key \
curl -sSL http://YOUR_CENTRAL_HOST/scripts/install.sh | bash
```

What this does on the edge:

- Installs **Node Exporter** and **Promtail** under `/opt/infrapulse`.
- Configures Promtail to send logs to `LOKI_URL` (port `3100` on central server).
- Registers the node with the Node API:
  - `POST /api/devices/register` with JSON `{hostname, ip, nodeExporterPort, clerkOrgId?}`.
  - Uses header `x-api-key: TENANT_API_KEY` to resolve the **Clerk Organization**.

On the central stack:

- `backend-node` writes the device into the `Device` table and regenerates `observability/prometheus_targets/edge_nodes.json`.
- Prometheus uses file-based discovery to pick up the new node and start scraping `node_exporter` on `:9100`.

See **`PHASE_2_STEP.md`** for detailed diagrams.

---

## 8. AI Backend & Predictive Alerts (Phase 3)

The Python backend (`backend-python`):

- Periodically (every `WORKER_INTERVAL_SECONDS`):
  - Fetches devices from Postgres.
  - Queries Prometheus for last `METRICS_LOOKBACK_HOURS` of CPU/memory/disk data.
  - Sends downsampled metrics to OpenAI with a **diagnostic + forecasting** prompt.
  - Interprets structured JSON findings and writes `Alert` rows (with `deviceId` and `clerkOrgId`).
  - Sends Telegram notifications for critical or predictive warnings/alerts.

- Exposes `POST /api/chat` so the frontend can ask NL questions against current state.

Details and prompt format are in **`PHASE_3_STEP.md`**.

---

## 9. Frontend Dashboard & 3D Digital Twin (Phase 4)

The frontend (Vite + React + TypeScript + Tailwind) lives in `frontend/`:

- Uses **Clerk React** for auth, with `<OrganizationSwitcher />` in the header.
- Wraps the app in `ClerkProvider` using `VITE_CLERK_PUBLISHABLE_KEY` from `.env`.
- Core dashboard (`Dashboard` component):
  - **Device list** (left sidebar) from `GET /api/devices` (scoped to active Clerk org).
  - **Alerts panel** from `GET /api/alerts`.
  - **3D digital twin** using React Three Fiber/Drei:
    - Each device is a glowing cube in a grid.
    - Color encodes health based on latest alert or status:
      - Green – healthy.
      - Yellow – warning.
      - Red – critical/down.
    - Clicking a cube selects the device.
  - **Device details** panel: hostname, IP, status, tags, and recent AI alerts for that node.
  - **AI assistant** chat: `POST` to `VITE_AI_BASE_URL/api/chat`.

Run frontend dev mode:

```bash
cd frontend
npm install
npm run dev
```

Make sure your Clerk frontend settings (URLs) match where you host the app.

---

## 10. Simulating Load (Phase 5)

**File:** `scripts/simulate_load.py`

Run this script **on a target node** (edge or lab VM) to create synthetic load:

```bash
cd scripts
python simulate_load.py --mode cpu --duration 300         # CPU load for 5 minutes
python simulate_load.py --mode disk --size-gb 2           # Write ~2 GiB under /tmp/infrapulse-load
python simulate_load.py --mode both --duration 300 --size-gb 1
```

The script:

- Spawns CPU workers that busy-loop for the specified duration.
- Writes large temporary files to stress disk usage (`--disk-path` customizable).
- Leaves files on disk so that node_exporter sees real disk consumption (clean up the directory when done).

This is ideal for validating:

- Prometheus scraping.
- The Python AI worker’s anomaly & forecast behavior.
- Telegram alerting and the frontend dashboards.

---

## 11. Observability Dashboards

Grafana is available at `http://localhost:3001`:

- Add Prometheus datasource: `http://prometheus:9090` (from within Grafana container).
- Add Loki datasource: `http://loki:3100`.
- Create dashboards for:
  - Node Exporter metrics (CPU, memory, disk, network).
  - Loki log queries from Promtail.

---

## 12. Phase Docs

For deeper design details, refer to:

- `PHASE_1_STEP.md` – Infrastructure & observability foundation.
- `PHASE_2_STEP.md` – Node.js API, Prisma metadata, Clerk orgs, x-api-key edge enrollment.
- `PHASE_3_STEP.md` – Python AI backend, predictive engine, and `/api/chat`.

These include diagrams (Mermaid + ASCII) and data flow breakdowns.

---

## 13. Next Ideas

Possible extensions:

- Add per-tenant dashboards and fine-grained RBAC on top of Clerk Organizations.
- Integrate Loki queries and log-based anomaly detection in the AI backend.
- Support WebSockets or Server-Sent Events for real-time frontend updates.
- Add more detailed 3D layouts (racks, rooms, regions) and camera presets.

InfraPulse is now ready for end-to-end testing: spin up the stack, enroll one or more edge nodes, run `simulate_load.py` to drive stress, and watch the AI predict and surface upcoming issues in the dashboard.

