# InfraPulse Node.js API (Phase 2)

Device registration, metadata, and alerts API with Clerk auth and tenant API keys for edge ingestion.

## Setup

1. **Database URL for Prisma**  
   Prisma loads `.env` from `backend-node/`, not the repo root. Create `backend-node/.env` with at least:
   ```bash
   cp .env.example .env
   # Edit .env: set DATABASE_URL (e.g. postgresql://infrapulse:infrapulse_secret@localhost:5432/infrapulse)
   ```
   If Postgres runs via Docker Compose, use `localhost` and port `5432` (or `5433` if you set `POSTGRES_PORT=5433` in root `.env`).

2. **Clerk and root env**  
   For running the API locally you can also set `CLERK_*` in this `.env`, or rely on the root `.env` when running via Docker.

3. Install and generate Prisma client:
   ```bash
   npm install
   npx prisma generate
   ```

4. Push schema and seed an API key for edge registration:
   ```bash
   npx prisma db push
   CLERK_ORG_ID=org_xxx TENANT_API_KEY=your-secret-key npm run db:seed
   ```

5. Run:
   ```bash
   npm run dev
   ```

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | — | Liveness |
| POST | /api/devices/register | `x-api-key` | Register edge device (install.sh) |
| GET | /api/devices | Clerk JWT | List devices for current org |
| GET | /api/alerts | Clerk JWT | List alerts for current org |

## Edge registration (install.sh)

On the edge node, set `TENANT_API_KEY` to the same value used in seed (or another key stored in `ApiKey` for that org). Optional: `CLERK_ORG_ID` in body for validation.

```bash
INFRA_PULSE_URL=http://your-server:3000 TENANT_API_KEY=your-key curl -sSL http://your-server/scripts/install.sh | bash
```

## Docker

Built and run via root `docker compose`. The backend writes Prometheus file_sd targets to the mounted `observability/prometheus_targets` volume so new devices are scraped automatically.
