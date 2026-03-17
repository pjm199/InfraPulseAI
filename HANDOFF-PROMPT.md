# InfraPulse — Handoff Prompt (Project State + Next Steps)

**Use this document as a prompt to give to a colleague or to another AI.** It describes the current level of the project, what is missing, and what improvements or extras can be done next. Copy or adapt the sections below as needed.

---

## How to use this prompt

- **For a human:** Send this file (or the content below) to your friend/colleague so they understand exactly where InfraPulse stands and what could be done next.
- **For another AI:** Paste the **"Prompt for another AI"** section (or the full document) into a new chat so the AI has full context and can suggest or implement next steps.

---

## Prompt for another AI (copy from here)

```
You are continuing work on **InfraPulse**, a distributed observability and predictive AI platform for 1–100 nodes (servers, workstations). It targets MSPs and IT ops: single dashboard, 3D digital twin, live metrics (Prometheus), predictive AI (OpenAI), and multi-tenant auth (Clerk). Stack: React (Vite, Tailwind, React Three Fiber, Clerk) frontend; Node.js (Express, Prisma, PostgreSQL) API; Python (FastAPI, Pandas, OpenAI) for metrics, AI worker, and chat; Docker Compose for Postgres, Prometheus, Loki, Grafana, backend-node, backend-python.

---

## CURRENT LEVEL ACHIEVED (what is done and working)

### Infrastructure & observability
- Docker Compose runs: Postgres, Prometheus, Loki, Grafana, backend-node, backend-python.
- Prometheus is configured to scrape: itself, Node Exporter (Linux, port 9100), Windows Exporter (Windows, port 9182). Targets are file_sd from `observability/prometheus_targets/edge_nodes.json`, which is written by the Node API when devices register.
- Relabel configs separate node-exporter and windows-exporter jobs from the same file.
- Loki and Grafana are present; Grafana can use Prometheus and Loki as datasources (manual setup).

### Backend Node (API & device management)
- Prisma schema: Device (id, hostname, ip, status, tags, clerkOrgId, timestamps), Alert (id, deviceId, message, severity, isPredictive, clerkOrgId, timestamp), ApiKey (for edge registration, keyHash → clerkOrgId).
- POST /api/devices/register: requires x-api-key header; body hostname, ip, optional tags (e.g. ["windows"]); creates/updates device and triggers Prometheus targets file update. Devices with tag "windows" are written as port 9182 and job windows-exporter.
- GET /api/devices and GET /api/alerts: require Clerk auth; return only data for the authenticated org (clerkOrgId from session).
- Middleware: API key validation for register; Clerk JWT validation for devices/alerts. No custom User/Tenant tables; Clerk Organizations = tenants.
- Optional env PROMETHEUS_DOCKER_HOST_IP: when set to a device IP, that device’s target is written as host.docker.internal:port so Prometheus in Docker can scrape the host (e.g. Windows Exporter on the same machine as Docker).
- Script backend-node/scripts/register-device.js: npm run register-device -- HOSTNAME IP [windows] to register a device (e.g. Windows PC) with optional "windows" tag.

### Backend Python (AI & metrics)
- GET /api/metrics?hostname=&ip=&tags=: returns latest CPU %, Memory %, Disk % for one device. Queries Prometheus; supports Node Exporter (Linux) and Windows Exporter (Windows). When tags include "windows", Windows metrics are tried first (windows_cpu_time_total, windows_memory_*, windows_logical_disk_* for C:).
- POST /api/chat: natural language question; backend fetches devices, recent metrics, and alerts from DB/Prometheus, sends to OpenAI, returns answer. Used by frontend AI assistant.
- Background worker (RUN_WORKER=1): on interval (WORKER_INTERVAL_SECONDS), fetches devices from Postgres, gets CPU/memory/disk time-series from Prometheus for all devices, sends structured prompt to OpenAI for trend analysis and forecasting, writes Alert rows to Postgres, optionally sends Telegram notifications for critical/predictive findings.
- Python reads devices from Postgres (including tags) so Windows devices get Windows Exporter metrics. Database module fetch_devices() returns tags.

### Frontend (React)
- Clerk: ClerkProvider, Sign In/Out, OrganizationSwitcher in header. Dashboard and main app behind Clerk auth.
- Dashboard: sidebar device list (from GET /api/devices); alerts panel (GET /api/alerts); 3D digital twin (React Three Fiber); device details panel; AI chat (POST to Python /api/chat).
- 3D twin: one cube per device; color by status/alert (green/yellow/red); left-click selects device (no camera spin), right-drag rotates, scroll zooms; selected cube scales 1.3x; OrbitControls use RIGHT for rotate so left-click is reserved for selection. Subtle idle animation (bob + rotation) on cubes.
- Device details: hostname, IP, status, tags; "Live metrics (Prometheus)" with CPU %, Memory %, Disk % from GET /api/metrics (frontend passes device tags so backend can use Windows Exporter for Windows devices). Recent AI alerts for that device. First device auto-selected when list loads.
- Metrics request includes tags (e.g. tags=windows) when device has tags; response only applied if still the selected device (race fix).

### Edge enrollment
- Linux: install.sh installs Node Exporter and Promtail, configures them to point to central (INFRA_PULSE_URL, LOKI_URL), registers via POST /api/devices/register with TENANT_API_KEY. Supports arm/amd64, correct Node Exporter and Promtail download URLs.
- Windows: no install script; user installs Windows Exporter (e.g. MSI from prometheus-community/windows_exporter), registers with npm run register-device -- HOSTNAME IP windows. Docs in docs/windows-exporter-setup.md.

### Documentation
- README.md: quick start, config, Clerk, frontend, edge enrollment, manual device registration (Windows), links to phase docs.
- PRESENTATION.md: elevator pitch, architecture, tech stack, features, security, demo flow, Q&A for stakeholder presentation.
- docs/windows-exporter-setup.md: install Windows Exporter, firewall, register with "windows" tag, PROMETHEUS_DOCKER_HOST_IP, verify targets.

---

## WHAT IS MISSING OR INCOMPLETE

- **Grafana:** Not preconfigured with dashboards or datasources; user must add Prometheus/Loki and create panels manually.
- **Loki in the product:** Logs are collected (Promtail → Loki) but the InfraPulse dashboard does not show logs or log-based alerts; only metrics (CPU/memory/disk) and AI-generated alerts are surfaced. No log search UI in the React app.
- **AI worker without OpenAI key:** If OPENAI_API_KEY is not set, the worker logs "OpenAI API key not configured" and does not create alerts; no fallback (e.g. rule-based only).
- **Telegram:** Optional; if TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set, Telegram is simply not used. No in-app configuration for Telegram.
- **Device status (healthy/warning/critical):** Status is stored (default "unknown") but there is no automatic update of device status from metrics (e.g. set critical when CPU > 95%). Status could be driven by the AI worker or by a separate rules engine.
- **Alert management:** No "acknowledge" or "resolve" for alerts; no alert history view or filtering by device/severity in the UI beyond the list.
- **3D twin:** Single grid layout; no physical layout (racks, rooms, sites). No labels on cubes (hostname on hover exists only via selection in device details).
- **Tests:** No automated test suite (unit, integration, e2e) described or committed.
- **Production hardening:** No rate limiting, CORS is per-env, no explicit security headers; secrets in .env (no vault/manager). No health-check endpoints documented for load balancers.
- **Windows log shipper:** Windows has only Windows Exporter (metrics); no Promtail or equivalent for Windows logs to Loki.

---

## IMPROVEMENTS AND EXTRAS WE CAN DO

### High value / quick wins
- **Auto-update device status:** From AI worker or a small rules engine: set device status to warning/critical based on latest metrics (e.g. CPU > 90% → warning, disk > 95% → critical). Persist in Device table and reflect in 3D color.
- **Grafana bootstrap:** Script or Compose init container that adds Prometheus and Loki datasources and one default dashboard (e.g. Node/Windows Exporter overview).
- **Alert acknowledge/resolve:** Add fields or table for ack/resolve and show in UI; optional filter "show only unacknowledged."
- **Health endpoints:** GET /health on Node and Python that return 200 and optionally DB/Prometheus reachability for load balancers and monitoring.

### Medium effort / high impact
- **Logs in the dashboard:** Frontend section or page to query Loki (e.g. by device/hostname); or at least "last N log lines" per device from Loki API via Python/Node proxy.
- **Log-aware AI:** Feed recent log snippets (from Loki) into the AI worker prompt so predictions consider both metrics and log patterns.
- **3D improvements:** Hostname or small label on/near each cube; optional camera presets (front, top); simple "room" or "rack" grouping (still one grid per group if needed).
- **Real-time updates:** WebSockets or Server-Sent Events from backend so device list, metrics, or alerts update without full refresh (e.g. when a new alert is written).
- **RBAC / roles:** Use Clerk roles or custom roles per org (e.g. viewer vs admin) and restrict who can register devices or acknowledge alerts.

### Larger / strategic
- **Rule-based alerts in addition to AI:** Configurable thresholds (e.g. CPU > X%) that create alerts even when OpenAI is not configured; AI adds predictive layer on top.
- **Windows log shipper:** Integrate Promtail for Windows or Grafana Agent for Windows so Windows logs also flow to Loki and can be queried/alerted on.
- **Multi-region / scale:** Document or prototype scaling (e.g. multiple Prometheus, read replicas for Postgres, worker replicas) for >100 nodes.
- **On-prem / air-gap:** Document which components need external access (Clerk, OpenAI) and options (e.g. self-hosted auth, local LLM) for locked-down environments.
- **E2E and integration tests:** Playwright (or similar) for login, device list, 3D click, device details; pytest for Python API and worker with mocked Prometheus/OpenAI.
- **API versioning and docs:** e.g. /api/v1/devices and OpenAPI/Swagger for Node and Python so external integrations are stable and documented.
```

---

## Short version (one paragraph for a message)

If you only need a short summary to send in a message:

**InfraPulse current state:** We have a working end-to-end observability platform: Docker stack (Postgres, Prometheus, Loki, Grafana, Node + Python backends), Clerk multi-tenant auth, device registration for Linux (install.sh with Node Exporter + Promtail) and Windows (Windows Exporter + register-device script with "windows" tag). Frontend: dashboard with device list, 3D digital twin (click to select, right-drag to rotate), device details with live CPU/memory/disk from Prometheus, alerts panel, and AI chat. Python provides /api/metrics (Node + Windows exporters) and /api/chat; background worker uses OpenAI for predictive alerts and optional Telegram. What’s missing: Grafana not preconfigured, no logs in the dashboard, no auto-update of device status from metrics, no alert ack/resolve, no tests or production hardening. Next improvements: auto device status from metrics, Grafana bootstrap, alert ack/resolve, health endpoints, then logs in UI and log-aware AI, 3D labels/presets, real-time updates, and optional RBAC.

---

## File locations (for reference)

| Topic | File |
|-------|------|
| Full setup & run | README.md |
| Presentation / demo | PRESENTATION.md |
| Windows PC monitoring | docs/windows-exporter-setup.md |
| This handoff | HANDOFF-PROMPT.md |
| Phase details | PHASE_1_STEP.md, PHASE_2_STEP.md, PHASE_3_STEP.md |
| Load simulation | scripts/simulate_load.py |
| Linux edge install | install.sh (root) |
| Windows device register | backend-node: npm run register-device -- HOSTNAME IP windows |

---

**End of handoff prompt.**
