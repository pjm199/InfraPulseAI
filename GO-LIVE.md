# InfraPulse — Go Live Checklist

## 0. Security first
- Rotate/revoke every credential that was ever present in the old `.env.example` or any Git commit, especially Clerk secret and Telegram bot token.
- Create a new production `INTERNAL_API_TOKEN`.
- Create strong random PostgreSQL and Grafana passwords.

## 1. Infrastructure
- Linux VPS with Docker Engine + Compose plugin.
- DNS `A`/`AAAA` record for `PUBLIC_HOST` pointing to the VPS.
- Open TCP 80 and 443 only (plus SSH restricted to your administration IP if possible).

## 2. Clerk
- Create/use a Clerk production instance.
- Set `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to production keys.
- Add `https://PUBLIC_HOST` to allowed origins / redirect URLs.
- Enable Organizations because InfraPulse scopes data by Clerk organization.

## 3. Production env
```bash
cp .env.production.example .env.production
openssl rand -hex 32   # INTERNAL_API_TOKEN
openssl rand -base64 32 # database/Grafana passwords
chmod 600 .env.production
```
Fill the values and set:
- `PUBLIC_HOST=app.example.com`
- `PUBLIC_URL=https://app.example.com`
- production Clerk keys
- `INTERNAL_API_TOKEN`
- optional OpenAI/Telegram credentials

## 4. Deploy
```bash
./deploy/bootstrap.sh
```
Caddy terminates TLS automatically for `PUBLIC_HOST` and serves the React application.

## 5. Verify
```bash
curl -fsS https://app.example.com/health
curl -fsS https://app.example.com/ready
```
Then sign in through Clerk and verify the dashboard.

## 6. Edge nodes
Register each edge node with the Node API using the existing installer/API-key flow. Do not manually publish Prometheus ports to the Internet.

## 7. Production follow-ups
- Replace `prisma db push` with versioned Prisma migrations before frequent schema changes.
- Add CI: lint, TypeScript build, Python tests, Docker build.
- Add database backups and restore testing.
- Add Grafana dashboards and alert rules.
- Add rate limiting on public API endpoints.
