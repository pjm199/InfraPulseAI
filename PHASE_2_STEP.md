# Phase 2: Node.js API, Prisma Metadata & Clerk Multi-Tenancy

This document describes the InfraPulse **Phase 2** deliverables: the Node.js metadata API (`backend-node`), Prisma schema, Clerk-based multi-tenant auth, and secure edge registration with organization API keys.

---

## 1. Overview and Goals

| Goal | Description |
|------|-------------|
| **Tenant-aware metadata API** | Node.js service that exposes device and alert metadata per Clerk Organization (tenant). |
| **Secure edge enrollment** | Headless edge devices register using long-lived Clerk Organization API keys (no JWTs, no passwords on devices). |
| **Single source of truth** | PostgreSQL models for `Device`, `Alert`, and `ApiKey`, reused by both Node and Python backends. |
| **Prometheus target management** | API automatically maintains `edge_nodes.json` file_sd targets so new nodes are scraped without manual edits. |

---

## 2. Prisma Schema (PostgreSQL)

**File:** `backend-node/prisma/schema.prisma`

### 2.1 Models

| Model | Fields (key) | Purpose |
|-------|--------------|---------|
| **Device** | `id`, `hostname`, `ip`, `status`, `tags`, **`clerkOrgId`**, timestamps | Registered node (edge or central) belonging to a Clerk Organization. |
| **Alert** | `id`, `deviceId`, `message`, `severity`, `timestamp`, `isPredictive`, **`clerkOrgId`** | AI or rule-based alerts attached to devices and scoped to an org. |
| **ApiKey** | `id`, `clerkOrgId`, `keyHash`, `name`, `createdAt` | Long-lived API key per org; used by edge devices via `x-api-key`. |

Key decisions:

- **No `User`/`Tenant` tables**: Clerk manages identities and organizations. We store only the **`clerkOrgId`** string on domain models.
- **`ApiKey.keyHash` unique**: Raw API keys are never stored; only SHA-256 hashes. Multiple keys can map to the same `clerkOrgId`.

---

## 3. Node.js API Service (`backend-node`)

### 3.1 Tech stack

- **Runtime**: Node 20, TypeScript
- **Framework**: Express
- **ORM**: Prisma
- **Auth**: `@clerk/express`

### 3.2 Auth model

There are **two auth paths**, depending on the caller:

- **Frontend / dashboard (browser)**  
  - Uses Clerk session JWT; `@clerk/express` sets `req.auth`.  
  - Middleware `withClerkOrg` reads `auth.orgId` and sets `req.authContext = { clerkOrgId, authMethod: "clerk" }`.  
  - All **GET** endpoints filter by `clerkOrgId`.

- **Edge devices (install.sh, headless)**  
  - Use **Organization API Keys** provided as `TENANT_API_KEY` on the host running `install.sh`.  
  - Script sends HTTP header `x-api-key: TENANT_API_KEY` to the API.  
  - Middleware `requireApiKey` hashes the key and looks it up in `ApiKey`. If found, sets `req.authContext = { clerkOrgId, authMethod: "api_key" }`.

### 3.3 Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/health` | none | Service liveness. |
| **POST** | `/api/devices/register` | `x-api-key` | Edge/device registration; updates Prometheus file_sd targets. |
| **GET** | `/api/devices` | Clerk JWT | List devices for current `clerkOrgId`. |
| **GET** | `/api/alerts` | Clerk JWT | List alerts (with device info) for current `clerkOrgId`. |

#### 3.3.1 Device registration (edge ingestion)

**Flow:**

1. Client seeds an API key per org (`ApiKey`) using:

```bash
cd backend-node
npx prisma db push
CLERK_ORG_ID=org_xxx TENANT_API_KEY=your-secret-key npm run db:seed
```

2. On each edge node, run:

```bash
INFRA_PULSE_URL=http://central:3000 TENANT_API_KEY=your-secret-key \
  curl -sSL http://central/scripts/install.sh | bash
```

3. `install.sh`:
   - Installs Node Exporter + Promtail.
   - Builds payload: `{ hostname, ip, nodeExporterPort: 9100, clerkOrgId? }`.
   - Sends `POST ${API_URL}/api/devices/register` with:
     - **Header**: `x-api-key: TENANT_API_KEY`.
     - **Body**: JSON payload; if `CLERK_ORG_ID` env is set, `clerkOrgId` is included and validated.

4. `backend-node`:
   - `requireApiKey` resolves key to `clerkOrgId` and sets `req.authContext`.
   - `registerDevice`:
     - Looks for existing `Device` with same `hostname`, `ip`, `clerkOrgId`.
     - If found: updates `updatedAt`.
     - Else: creates a new `Device` with status `unknown`.
   - Calls `updatePrometheusTargets(prisma)` to regenerate `observability/prometheus_targets/edge_nodes.json`.

Resulting `edge_nodes.json` sample:

```json
[
  {
    "targets": ["192.168.1.10:9100"],
    "labels": {
      "job": "node-exporter",
      "host": "edge-1",
      "instance": "edge-1"
    }
  }
]
```

Prometheus (Phase 1) already uses this file via `file_sd_configs`, so new nodes start being scraped automatically.

#### 3.3.2 Tenant-scoped listing (frontend)

- **GET `/api/devices`**:
  - `requireAuth()` → `withClerkOrg` (injects `authContext.clerkOrgId`).
  - Returns devices for that org only, ordered by `updatedAt`.

- **GET `/api/alerts`**:
  - Same Clerk org resolution as devices.
  - Returns latest alerts for that org (with embedded device hostname/ip/status).

---

## 4. Edge Installer Relationships (Phase 1 + Phase 2)

**File:** `scripts/install.sh`

Key changes in Phase 2:

- Requires `TENANT_API_KEY` env var for registration (but still installs exporters without it).
- Supports optional `CLERK_ORG_ID` env var; if present, includes `clerkOrgId` in request body and enforces org match.
- Sends header `x-api-key: TENANT_API_KEY` for `POST /api/devices/register`.

**Diagram (edge → API → Prometheus):**

```mermaid
flowchart LR
    subgraph EDGE[Edge node]
        SH[install.sh]\n(TENANT_API_KEY, CLERK_ORG_ID?)
        NE[Node Exporter :9100]
        PT[Promtail]
    end

    subgraph API[backend-node]
        AUTH[requireApiKey]\n(x-api-key → clerkOrgId)
        REG[registerDevice]\n(Device + updatePrometheusTargets)
    end

    PROM[Prometheus]\nfile_sd: edge_nodes.json

    SH -->|POST /api/devices/register\nx-api-key| AUTH --> REG
    REG -->|write targets| PROM
    PROM -->|scrape metrics| NE
    PT -->|logs| Loki
```

---

## 5. Docker Integration (Phase 2)

**`docker-compose.yml` – `backend-node`**

- Built from `./backend-node/Dockerfile`.
- Env:
  - `DATABASE_URL` → PostgreSQL (shared DB).
  - `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` → Clerk.
  - `PROMETHEUS_TARGETS_FILE=/app/prometheus_targets/edge_nodes.json`.
- Volume:

```yaml
backend-node:
  volumes:
    - ./observability/prometheus_targets:/app/prometheus_targets
```

So the Node API writes `edge_nodes.json` into the same directory Prometheus mounts.

---

## 6. Quick Start (Phase 2)

1. **Configure env** (`.env`):
   - Set PostgreSQL, Clerk keys, and (optionally) `CLERK_ORG_ID`/`TENANT_API_KEY` for seeding.
2. **Build & run**:
   ```bash
   docker compose up -d backend-node postgres
   ```
3. **Seed an API key** (inside `backend-node` container or locally):
   ```bash
   npx prisma db push
   CLERK_ORG_ID=org_xxx TENANT_API_KEY=your-secret-key npm run db:seed
   ```
4. **Enroll an edge node** with `install.sh` as described above.

This completes the Phase 2 architecture: a tenant-aware, Clerk-integrated Node.js API with secure edge registration and automatic Prometheus target management.

