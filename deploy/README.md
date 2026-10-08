# Production deployment

InfraPulse production is designed to expose only the frontend on port 80/443. The frontend reverse-proxies `/api/*`, `/health`, and `/ready` to the private Node API. PostgreSQL, Prometheus, Loki, Grafana, and Python remain on the Docker private network.

## Requirements
- Linux VPS with Docker Engine + Docker Compose plugin
- DNS A/AAAA record pointing the domain to the VPS
- Clerk production instance and keys
- Optional OpenAI and Telegram credentials

## Start
1. Copy `.env.production.example` to `.env.production` and fill every value.
2. Ensure `PUBLIC_URL` is the public origin, e.g. `https://app.example.com`.
3. Configure Clerk allowed origins/redirects for the public URL.
4. Point `PUBLIC_HOST` at the hostname only (e.g. `app.example.com`); Caddy obtains HTTPS certificates automatically.
5. Put edge devices on the network reachable by this server and register them with the API; the registration flow regenerates Prometheus targets.
6. Start with `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`.


## Important
- Rotate any credentials that were ever committed to Git history.
- Keep `.env.production` outside Git.
- Do not expose Postgres, Prometheus, Loki, Grafana, or Python directly to the Internet.
- The initial MVP still uses `prisma db push` at Node startup. Before a high-change production environment, replace it with versioned Prisma migrations.
