# InfraPulse — Presentation Brief

**Use this document to present InfraPulse to stakeholders. It summarizes architecture, features, security, and demo flow.**

---

## 1. Elevator Pitch

**InfraPulse** is a **distributed observability and predictive AI platform** for **1–100 nodes** (servers, workstations, IoT). It gives operations teams:

- **Single pane of glass:** All devices (Linux and Windows) in one dashboard with a **3D digital twin**.
- **Live metrics:** CPU, memory, and disk per device, scraped by Prometheus and shown in real time.
- **Predictive AI:** An AI engine (OpenAI) analyzes time-series trends, detects anomalies, and **forecasts** issues (e.g. “disk full in ~4 hours”, “OOM risk”) — not just static thresholds.
- **Multi-tenant, enterprise-ready:** Clerk handles authentication and **Organizations** (one org per client/tenant). MSPs can switch between clients and see only that client’s devices and alerts.
- **Alerting:** Critical and predictive findings can be sent via **Telegram** (or extended to other channels).

**Target users:** Managed Service Providers (MSPs), internal IT ops, and teams managing distributed or hybrid (Linux + Windows) infrastructure.

---

## 2. High-Level Architecture

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                    INFRAPULSE CENTRAL                         │
                    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
  Edge (Linux)      │  │ Postgres │  │ Prometheus│  │   Loki   │  │   Grafana    │ │
  Node Exporter ────┼─►│  (meta,  │  │ (metrics) │  │  (logs)  │  │ (dashboards) │ │
  Promtail ─────────┼─►│  alerts) │  │     ▲     │  │    ▲     │  └──────────────┘ │
                    │  └────┬─────┘  └─────┬─────┘  └────┬─────┘                    │
  Edge (Windows)    │       │             │             │                           │
  Windows Exporter ─┼───────┼─────────────┘             │                           │
                    │       │         ┌────┴────┐  ┌─────┴────┐  ┌─────────────────┐ │
                    │       │         │ Node.js │  │  Python  │  │ React Frontend  │ │
                    │       └────────►│  API    │  │ (FastAPI)│  │ (Clerk + 3D)    │ │
                    │                 │ (Clerk, │  │ AI worker│  │                 │ │
                    │                 │ Prisma) │  │ /api/chat│  │  ← User / MSP   │ │
                    │                 └─────────┘  └──────────┘  └─────────────────┘ │
                    └─────────────────────────────────────────────────────────────┘
```

- **Edge:** Linux runs **Node Exporter** (metrics) + **Promtail** (logs). Windows runs **Windows Exporter** (metrics). No Prometheus on edge.
- **Central:** One **Prometheus** scrapes all edge exporters; **Loki** receives logs; **PostgreSQL** stores devices and alerts; **Node.js** API handles auth and device roster; **Python** does AI analysis and chat; **React** dashboard with 3D twin and Clerk.

---

## 3. Technology Stack

| Layer            | Technology | Role |
|------------------|------------|------|
| **Frontend**     | React, Vite, TypeScript, Tailwind, React Three Fiber, Recharts, Clerk React | Dashboard, 3D digital twin, device list, device details, AI chat |
| **API & metadata** | Node.js (Express), Prisma, PostgreSQL | Device CRUD, alerts list, Clerk auth, org-scoped data, Prometheus targets file |
| **AI & analytics** | Python, FastAPI, Pandas, OpenAI API | Metrics from Prometheus → AI analysis → predictive alerts, NL chat (`/api/chat`), metrics API for dashboard |
| **Observability** | Prometheus, Loki, Grafana | Metrics storage & scrape, log storage, optional dashboards |
| **Edge – Linux**  | Node Exporter, Promtail | Hardware metrics (9100), log shipping to Loki |
| **Edge – Windows**| Windows Exporter | Hardware metrics (9182); same Prometheus scrapes it |
| **Auth & tenants**| Clerk (Organizations) | SSO, org switcher, API keys per org for edge registration |
| **Alerting**      | Telegram Bot API | Notifications for critical/predictive alerts (optional) |
| **Infrastructure**| Docker, Docker Compose | Postgres, Prometheus, Loki, Grafana, backend-node, backend-python |

---

## 4. Key Features (What to Show in the Demo)

### 4.1 Multi-Tenant Dashboard (Clerk)

- Users sign in with **Clerk** (email/social).
- **Organization Switcher** in the header: switch between “clients” (organizations). Each org sees only its own devices and alerts.
- Ideal for **MSPs**: one dashboard, multiple clients; no mixing of data.

### 4.2 Device Roster

- **Device list** (sidebar): all registered devices for the current org (hostname, IP, status).
- Devices are registered either by:
  - **Linux:** `install.sh` on the edge (Node Exporter + Promtail + POST to Node API with API key).
  - **Windows / manual:** `npm run register-device -- HOSTNAME IP [windows]` (script calls same Node API with API key).
- Optional **tags** (e.g. `windows`) so Prometheus and the AI backend know how to scrape and interpret metrics.

### 4.3 3D Digital Twin

- Each device is a **3D cube** in a grid (React Three Fiber).
- **Color:** Green = healthy, Yellow = warning, Red = critical/down (from status + latest alert).
- **Interaction:** Left-click a cube to **select** the device; right-drag to rotate the camera; scroll to zoom.
- Selected device is highlighted (larger) and drives the **Device details** panel.

### 4.4 Device Details & Live Metrics

- **Device details** panel: hostname, IP, status, tags, **Live metrics (Prometheus)**.
- **Live metrics:** CPU %, Memory %, Disk % from the last scrape (Python `/api/metrics` queries Prometheus; supports both Node Exporter and Windows Exporter).
- **Recent AI findings:** Alerts tied to that device (if the AI worker has run).

### 4.5 Alerts Panel

- List of **recent alerts** (all devices in the org). Severity: info / warning / critical.
- Alerts are created by the **AI worker** (and optionally by other rules later). They can be **predictive** (e.g. “disk full in 4h”) not only reactive.

### 4.6 AI Assistant (Chat)

- **Natural language** questions about infrastructure (e.g. “Which nodes are at risk in the next 4h?”).
- Frontend sends the question to Python `POST /api/chat`; backend gathers devices, metrics, and alerts, then uses OpenAI to answer in context.

### 4.7 Predictive AI Worker (Background)

- Python worker runs on an interval (e.g. every 15 minutes).
- Fetches **CPU, memory, disk** time-series from Prometheus for all devices.
- Sends a structured prompt to **OpenAI** to act as a “diagnostic engineer”: trend analysis, anomaly detection, **forecasting** (OOM, disk full, etc.).
- Writes **Alert** rows to PostgreSQL and can send **Telegram** notifications for critical/predictive findings.

---

## 5. Security & Multi-Tenancy

- **No custom user/password DB:** Identity and organizations are handled by **Clerk**. No User/Tenant tables in our DB; we store only **Clerk Organization ID** on Device and Alert.
- **Browser (dashboard):** Users sign in with Clerk; `GET /api/devices` and `GET /api/alerts` require a valid Clerk session and return only data for the **current org**.
- **Edge (headless) registration:** Devices cannot use browser sessions. Registration uses **organization API keys** (stored hashed in DB, validated via `x-api-key`). Example: `install.sh` or `register-device` script sends `x-api-key: TENANT_API_KEY` so the device is registered under the correct org.
- **Scoped data:** All device and alert queries are filtered by `clerkOrgId`; no cross-tenant leakage.

---

## 6. Data Flow (Short)

1. **Edge:** Node Exporter / Windows Exporter expose metrics; Promtail (Linux) sends logs to Loki.
2. **Registration:** Edge or script calls Node API `POST /api/devices/register` with API key → device and org stored; Node API updates **Prometheus file_sd** targets.
3. **Prometheus** scrapes exporters (Linux 9100, Windows 9182) and stores metrics.
4. **Python worker:** Reads devices from DB, pulls metrics from Prometheus, calls OpenAI, writes alerts to DB, optionally sends Telegram.
5. **Frontend:** Fetches devices and alerts from Node API (Clerk-authenticated); fetches live metrics from Python `/api/metrics`; renders 3D twin and device details.
6. **AI chat:** User question → Python aggregates state (devices, metrics, alerts) → OpenAI → answer back to the user.

---

## 7. What Is Implemented (Demo-Ready)

- [x] Docker Compose stack: Postgres, Prometheus, Loki, Grafana, backend-node, backend-python.
- [x] Node API: device registration (API key), device list and alerts list (Clerk), Prometheus targets file (node-exporter + windows-exporter), tags (e.g. `windows`).
- [x] Python API: `/api/metrics` (CPU/memory/disk per device, Node + Windows), `/api/chat` (NL Q&A), background worker (Prometheus → OpenAI → alerts + optional Telegram).
- [x] Frontend: Clerk auth, org switcher, device list, 3D digital twin (click to select, right-drag to rotate), device details with live metrics, alerts panel, AI chat.
- [x] Edge Linux: `install.sh` (Node Exporter + Promtail, register with API key).
- [x] Edge Windows: Windows Exporter; registration via `npm run register-device -- HOSTNAME IP windows`; Prometheus scrapes 9182; dashboard shows CPU/memory/disk for Windows.
- [x] Optional: `PROMETHEUS_DOCKER_HOST_IP` so Prometheus in Docker can scrape the host’s Windows Exporter via `host.docker.internal`.

---

## 8. Quick Setup (For Reference)

- **Config:** Copy `.env.example` to `.env` and set Clerk keys, OpenAI key, DB URL, optional Telegram.
- **Backend-node:** `backend-node/.env` with `DATABASE_URL`, Clerk keys, `TENANT_API_KEY`, `PROMETHEUS_TARGETS_FILE`; optionally `PROMETHEUS_DOCKER_HOST_IP` if Prometheus runs in Docker on the same host as Windows Exporter.
- **Start stack:** `docker compose up -d` (from project root).
- **DB:** From `backend-node`: `npx prisma generate && npx prisma db push && npm run db:seed` (seed API key for one org).
- **Frontend:** From `frontend`: `npm install && npm run dev`; open app URL and sign in with Clerk.
- **Register devices:** Linux → run `install.sh` on the node with `INFRA_PULSE_URL` and `TENANT_API_KEY`. Windows → from `backend-node`: `npm run register-device -- HOSTNAME IP windows`.

Full steps and troubleshooting: **README.md** and **docs/windows-exporter-setup.md**.

---

## 9. Suggested Demo Flow (5–10 Minutes)

1. **Intro (1 min):** “InfraPulse is a single dashboard for all your servers and workstations, with a 3D view and AI that predicts problems before they happen.”
2. **Login & org (1 min):** Sign in with Clerk; show **Organization Switcher** and explain multi-tenant (each org = one client’s devices).
3. **Device list (1 min):** Point out Linux (e.g. pi400) and Windows (e.g. JOHNDEV101) in the sidebar; mention one script for Linux, one command for Windows.
4. **3D twin (2 min):** Rotate the scene (right-drag), zoom (scroll). **Left-click** a cube to select it; show that the same device is highlighted and Device details update.
5. **Device details & metrics (2 min):** Select a device; show hostname, IP, status, and **Live metrics** (CPU %, Memory %, Disk %). Explain that these come from Prometheus (Node Exporter or Windows Exporter).
6. **Alerts (1 min):** Scroll to Alerts panel; explain that alerts are created by the AI worker from trend analysis and forecasting.
7. **AI chat (1–2 min):** Ask a natural language question (e.g. “Summarize the health of my nodes” or “Which device has the highest CPU?”); show the answer.
8. **Closing:** “We can add more alert channels, more metrics, and scale to more nodes; the stack is containerized and org-scoped for security.”

---

## 10. Possible Q&A Points

- **Why two backends (Node + Python)?** Node handles auth, device roster, and API for the frontend; Python handles heavy data (Prometheus/Loki) and AI. Clear separation and language fit (JS for API, Python for data/AI).
- **Why Clerk?** Off-the-shelf auth and Organizations; no custom user DB; fast to demo and production-ready for B2B/MSP.
- **Scalability?** Designed for 1–100 nodes; Prometheus and Postgres can be tuned or scaled for larger deployments.
- **On-prem vs cloud?** Stack runs in Docker; can be deployed on-prem or in a VPC; only external calls are Clerk (auth) and OpenAI (AI), both configurable.
- **Windows support?** Windows Exporter on the PC; register with tag `windows`; Prometheus scrapes 9182; dashboard shows CPU/memory/disk like for Linux.

---

## 11. Repo Layout (Reminder)

```
InfraPulseAI/
├── docker-compose.yml          # Postgres, Prometheus, Loki, Grafana, backend-node, backend-python
├── .env, .env.example
├── frontend/                   # React + Vite + Tailwind + Clerk + 3D (R3F)
├── backend-node/               # Express + Prisma + Clerk; device/alerts API; Prometheus targets
├── backend-python/             # FastAPI; /api/metrics, /api/chat; AI worker
├── observability/
│   ├── prometheus.yml          # Scrape configs (node-exporter, windows-exporter)
│   └── prometheus_targets/
│       └── edge_nodes.json     # Written by backend-node (file_sd)
├── docs/
│   └── windows-exporter-setup.md
├── scripts/
│   ├── install.sh              # Linux edge: Node Exporter + Promtail + register
│   └── register-device.js       # Manual/Windows: register via API (backend-node)
├── README.md
├── PRESENTATION.md             # This file
└── PHASE_*_STEP.md             # Phase docs
```

---

**Good luck with your presentation.**
---
Contents of PRESENTATION.md

Elevator pitch — One-paragraph value proposition (single pane of glass, live metrics, predictive AI, multi-tenant, alerting).
High-level architecture — ASCII diagram: edge (Linux + Windows) → central stack (Postgres, Prometheus, Loki, Grafana, Node API, Python API, React).
Technology stack — Table: frontend, Node API, Python AI, observability, edge Linux/Windows, Clerk, Telegram, Docker.
Features to demo — Multi-tenant dashboard, device roster, 3D digital twin (click/rotate/zoom), device details + live metrics, alerts panel, AI chat, predictive worker.
Security & multi-tenancy — Clerk for auth/orgs, API keys for edge, org-scoped data.
Data flow — Short step-by-step from edge registration → Prometheus → worker → frontend.
What’s implemented — Checklist of what’s demo-ready (including Windows and Docker host).
Quick setup — Condensed reference (env, compose, DB, frontend, register devices).
Suggested demo flow — 5–10 minute script: intro → login/org → device list → 3D twin → device details/metrics → alerts → AI chat → closing.
Q&A — Why two backends, why Clerk, scalability, on-prem vs cloud, Windows support.
Repo layout — Short directory tree.
---