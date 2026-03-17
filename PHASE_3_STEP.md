# Phase 3: Python AI Backend & Predictive Engine

This document describes the InfraPulse **Phase 3** deliverables: the Python AI backend (`backend-python`), predictive worker pipeline, and the `/api/chat` natural-language interface.

---

## 1. Overview and Goals

| Goal | Description |
|------|-------------|
| **Predictive analysis** | Use Prometheus time-series (CPU, memory, disk) + OpenAI to forecast failures (OOM, disk full, saturation). |
| **Cross-layer alerts** | Write AI findings into the same `Alert` table used by the Node backend, preserving `deviceId` and `clerkOrgId`. |
| **Telegram notifications** | Forward critical/predictive alerts to a configured Telegram chat. |
| **NL query endpoint** | `POST /api/chat` allows humans to ask free-form questions about infrastructure state. |

---

## 2. Component Summary (`backend-python/app`)

| File | Role |
|------|------|
| `config.py` | Env-driven configuration (DB URL, Prometheus URL, OpenAI key, Telegram, worker interval, lookback hours). |
| `database.py` | PostgreSQL access to `Device` and `Alert` tables (shared schema with Prisma). |
| `prometheus_fetcher.py` | Queries Prometheus for last N hours of CPU/memory/disk per device and downsamples to 15-minute points. |
| `ai_engine.py` | Builds JSON payload per device and calls OpenAI with a diagnostic system prompt, returning structured findings. |
| `alerts.py` | Writes findings as `Alert` rows and sends Telegram for critical/predictive findings. |
| `worker.py` | Background loop that orchestrates fetch → analyze → persist → notify. |
| `chat.py` | Builds context from current devices, recent metrics, and alerts; uses OpenAI to answer NL questions. |
| `main.py` | FastAPI entrypoint: `/health` and `POST /api/chat`, starts worker on startup. |

---

## 3. Data Model Reuse (Devices & Alerts)

The Python backend reuses the **same PostgreSQL tables** created by Prisma:

- **Device**: used to enumerate targets (`id`, `hostname`, `ip`, `status`, `clerkOrgId`).
- **Alert**: AI findings inserted with `deviceId`, `clerkOrgId`, `message`, `severity`, `isPredictive`, `timestamp`.

**`database.py`** helpers:

- `fetch_devices()` – all non-`down` devices, ordered by `updatedAt`.
- `fetch_recent_alerts(limit=50)` – latest alerts with `hostname` and `ip`.
- `insert_alert(device_id, clerk_org_id, message, severity, is_predictive)` – single-row insert into `Alert`.

---

## 4. Metrics Ingestion from Prometheus

**File:** `app/prometheus_fetcher.py`

For each device:

- Build `instance="<ip>:9100"` selector.
- Query **last N hours** (`METRICS_LOOKBACK_HOURS`, default 6) with **15-minute** step.

PromQL queries:

- **CPU usage**:

```promql
1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle",instance="<ip>:9100"}[5m]))
```

- **Memory usage**:

```promql
1 - (node_memory_MemAvailable_bytes{instance="<ip>:9100"} / node_memory_MemTotal_bytes{instance="<ip>:9100"})
```

- **Disk usage** (root FS):

```promql
1 - (node_filesystem_avail_bytes{instance="<ip>:9100",mountpoint="/"} /
     node_filesystem_size_bytes{instance="<ip>:9100",mountpoint="/"})
```

Values are converted to percentage (`0–100`, rounded to 2 decimals) and returned as:

```python
{
  device_id: {
    "hostname": "...",
    "ip": "...",
    "cpu":   [(ts, pct), ...],
    "memory": [(ts, pct), ...],
    "disk":  [(ts, pct), ...],
  },
  ...
}
```

Only the **last ~24 points** (~6 hours at 15-minute resolution) are sent to the LLM to keep prompts compact.

---

## 5. AI Diagnostic Engine (OpenAI)

**File:** `app/ai_engine.py`

### 5.1 System prompt

The LLM is instructed to behave as a **senior infrastructure diagnostic engineer**:

- Look at **trends** (rate of change), not just snapshots.
- Detect **anomalies** (sudden spikes, sustained high).
- Forecast **future problems** (e.g. disk full in X hours, OOM risk).
- Return **JSON only**, of the form:

```json
{
  "summary": "One paragraph overall assessment.",
  "findings": [
    {
      "device_id": "<id>",
      "hostname": "<hostname>",
      "severity": "info" | "warning" | "critical",
      "message": "Human-readable finding.",
      "is_predictive": true | false
    }
  ]
}
```

### 5.2 Call & parsing

- Uses `gpt-4o-mini` via `OpenAI` client and `chat.completions`.
- Strips optional ```json code fences and parses the JSON.
- Returns `(summary, findings)` to the worker.

---

## 6. Alert Writing and Telegram Notifications

**File:** `app/alerts.py`

### 6.1 DB writes

`process_findings(findings, device_id_to_org)`:

- For each finding:
  - Maps `device_id` → `clerkOrgId` via `device_id_to_org`.
  - Calls `insert_alert(...)` to create a row in the `Alert` table.
- Returns list of new `alert_id`s.

### 6.2 Telegram

- `send_telegram(message)`:
  - Uses `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` from env.
  - Sends formatted HTML text via `sendMessage` API.
- Trigger policy:
  - Alerts with `severity in {"critical", "warning"}` **and** `is_predictive` **or** any `critical` alert cause a Telegram send.

---

## 7. Background Worker Loop

**File:** `app/worker.py`

### 7.1 One cycle

```python
devices = fetch_devices()
metrics = fetch_cpu_memory_disk_for_devices(devices, settings.metrics_lookback_hours)
summary, findings = analyze_and_predict(metrics, device_id_to_org)
process_findings(findings, device_id_to_org)
```

### 7.2 Loop

- Interval: `max(60, WORKER_INTERVAL_SECONDS)` (default 900 seconds = 15 min).
- Runs in a **daemon thread** started on FastAPI `startup` when `RUN_WORKER != 0`.

**Startup wiring (`main.py`):**

```python
@app.on_event("startup")
def startup() -> None:
    if os.environ.get("RUN_WORKER", "1") == "1":
        run_worker_loop()
```

---

## 8. Natural Language Chat (`POST /api/chat`)

**File:** `app/chat.py`, `app/main.py`

### 8.1 Context building

`build_context()`:

- Devices (id, hostname, ip, status).
- Recent metrics (last 1 hour; last value per device for CPU/memory/disk).
- Recent alerts (up to 50, with hostname, message, severity, timestamp).

All rendered as plain text / JSON snippets in a single string:

```text
=== Registered devices ===
[ { id, hostname, ip, status }, ... ]

=== Recent metrics (last 1h, sample) ===
  edge-1: cpu_last=(ts, pct), mem_last=(ts, pct), disk_last=(ts, pct)

=== Recent alerts (last 50) ===
[ { hostname, message, severity, timestamp }, ... ]
```

### 8.2 LLM call

`chat(user_message)`:

- System: infrastructure assistant that must answer based only on provided context.
- User: includes context + question.
- Returns concise plain-text answer.

**FastAPI route:**

- `POST /api/chat` with body:

```json
{ "message": "Which servers are at risk of running out of disk?" }
```

- Response:

```json
{ "reply": "..." }
```

---

## 9. Docker Integration (Phase 3)

**`docker-compose.yml` – `backend-python`**

- Built from `./backend-python/Dockerfile`.
- Env:
  - `DATABASE_URL` – same DB as Node backend.
  - `PROMETHEUS_URL` – `http://prometheus:9090`.
  - `LOKI_URL` – `http://loki:3100` (reserved for future log-based analysis).
  - `BACKEND_NODE_URL` – `http://backend-node:3000`.
  - `OPENAI_API_KEY` – required for predictions and chat.
  - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` – for notifications.
  - `RUN_WORKER`, `WORKER_INTERVAL_SECONDS`, `METRICS_LOOKBACK_HOURS` – worker behavior.

The container exposes port **8000** (mapped to `BACKEND_PYTHON_PORT` on the host).

---

## 10. Quick Start (Phase 3)

1. Ensure Phase 1 + 2 stack is running (`postgres`, `prometheus`, `backend-node`, etc.).
2. Set in `.env`:
   - `OPENAI_API_KEY`
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (optional but recommended)
3. Start/refresh the stack:

```bash
docker compose up -d backend-python
```

4. Verify:

```bash
curl http://localhost:8000/health
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Which node has the highest CPU usage right now?"}'
```

This completes Phase 3: AI-driven predictive analysis and a chat-based interface over your observability data.

