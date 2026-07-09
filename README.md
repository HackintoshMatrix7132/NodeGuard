# NodeGuard

Monitor your servers. Protect your stack.

NodeGuard is a web-based, read-only infrastructure monitoring dashboard for homelab Linux/Docker services. It has a Vite React frontend and a Node.js TypeScript backend that reads host metrics, Docker container state, domain/reverse-proxy health, SSL expiry, and alert history.

## Status

- Active frontend: `apps/web`
- Active backend: `apps/api`
- Deployment target: `nodeguard.muthu.eu`
- React Native / Expo files have been removed from the active project.
- Runtime monitor configuration and alert history are stored in SQLite.

## Features

- Backend URL + API key connect screen.
- Dashboard overview with overall health, root-cause summary, active issues, metrics, and recent alerts.
- Server page with CPU, RAM, disk, swap, uptime, OS, kernel, Docker availability, and monitored backend checks.
- Monitored server URLs can allow self-signed HTTPS for internal homelab services such as Proxmox.
- Docker containers page with live container status, health, image, uptime, ports, logs preview, and monitored container checks.
- Domains / services page for public domains, internal URLs, reverse-proxy routes, paths, expected HTTP status codes, latency, and SSL expiry.
- Alerts page with active and resolved alert history, occurrence count, first seen, last seen, likely cause, failed checks, and suggested next steps.
- Settings page with refresh interval, screenshot privacy, diagnostics export, demo mode, and disconnect.
- Demo mode with realistic `muthu.eu` data for portfolio screenshots.
- Production Docker image that serves the web UI and API from one container.

## Architecture

```txt
Browser
  |
  | HTTPS + API key
  v
NodeGuard Web/API container
  |
  | systeminformation + dockerode + HTTP/TLS checks + SQLite
  v
Linux host + Docker containers + domains/services
```

The browser never talks directly to Docker, SSH, the host shell, or the Docker socket.

## Local Setup

Install dependencies:

```bash
npm install
```

Create a backend environment file:

```bash
cp .env.example apps/api/.env
```

Edit `apps/api/.env`:

```env
NODE_ENV=development
PORT=3000
NODEGUARD_API_KEY=change_this_local_key
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
DATABASE_URL=file:data/nodeguard.sqlite
MONITORED_DOMAINS=https://bit.muthu.eu,https://cloud.muthu.eu
```

Start the backend:

```bash
npm run dev:api
```

Start the frontend:

```bash
npm run dev:web
```

Open:

```txt
http://localhost:5173
```

Login details:

```txt
Backend URL: http://localhost:3000
API key: value of NODEGUARD_API_KEY
```

## Production Docker Setup

Create a root `.env` for Docker Compose:

```bash
cp .env.example .env
```

Edit `.env` for `nodeguard.muthu.eu`:

```env
NODE_ENV=production
PORT=3000
NODEGUARD_API_KEY=use_a_long_random_secret
ALLOWED_ORIGINS=https://nodeguard.muthu.eu
DATABASE_URL=file:/data/nodeguard.sqlite
TRUST_PROXY=true
WEB_DIST_DIR=apps/web/dist
MONITORED_DOMAINS=https://bit.muthu.eu,https://cloud.muthu.eu,https://status.muthu.eu
```

Build and run:

```bash
docker compose up -d --build
```

View logs:

```bash
docker compose logs -f nodeguard
```

Stop:

```bash
docker compose down
```

The compose file mounts:

- `/data` for SQLite persistence.
- `/var/run/docker.sock:ro` for read-only Docker metadata.

Put Cloudflare Access, a VPN, or another real authentication layer in front of `https://nodeguard.muthu.eu`. The API key protects `/api/*`, but browser storage is not a full user-auth system.

## Environment Variables

```env
NODE_ENV=development
PORT=3000
NODEGUARD_API_KEY=replace_me
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
DATABASE_URL=file:data/nodeguard.sqlite
TRUST_PROXY=false
REQUEST_JSON_LIMIT=64kb
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
WEB_DIST_DIR=apps/web/dist
MONITORED_DOMAINS=https://bit.muthu.eu,https://cloud.muthu.eu,https://status.muthu.eu
SERVER_DISPLAY_NAME=local-nodeguard-host
LOG_PREVIEW_LINES=80
DOMAIN_CHECK_TIMEOUT_MS=5000
CPU_WARNING_PERCENT=80
CPU_CRITICAL_PERCENT=90
MEMORY_WARNING_PERCENT=80
MEMORY_CRITICAL_PERCENT=90
DISK_WARNING_PERCENT=80
DISK_CRITICAL_PERCENT=90
```

Do not commit `.env` files, API keys, private IPs, or secrets.

## API

Public:

```txt
GET /health
```

Protected endpoints require `Authorization: Bearer <api-key>` or `x-api-key: <api-key>`:

```txt
GET /api/overview
GET /api/servers
GET /api/servers/monitors
POST /api/servers/monitors
PUT /api/servers/monitors/:id
DELETE /api/servers/monitors/:id
GET /api/servers/:id
GET /api/servers/:id/metrics
GET /api/servers/:id/containers
GET /api/containers
GET /api/containers/monitors
POST /api/containers/monitors
PUT /api/containers/monitors/:id
DELETE /api/containers/monitors/:id
GET /api/containers/:id
GET /api/domains
POST /api/domains
PUT /api/domains/:id
DELETE /api/domains/:id
GET /api/alerts
GET /api/alerts?status=all
GET /api/alerts?status=resolved
GET /api/alerts/:id
POST /api/checks/run
```

## Domain Checks

Domains / services can monitor:

- Public HTTPS domains such as `https://bit.muthu.eu`
- Internal URLs such as `http://10.0.0.20:5000`
- Specific paths such as `/health`, `/login`, or `/api/status`
- Expected HTTP codes such as `200,301,302,401`

A `404` usually means the service is reachable but NodeGuard checked a path that does not exist. Edit the monitor path or expected codes if that response is normal for the service.

## Scripts

```bash
npm run dev
npm run dev:api
npm run dev:web
npm run build
npm run typecheck
npm run lint
npm test
```

## Security Notes

- NodeGuard is read-only.
- No restart, stop, delete, prune, reboot, SSH, shell, Docker exec, or volume actions are implemented.
- Docker metadata is read only by the backend.
- `/api/*` is protected by API key auth and rate limiting.
- Production mode requires `NODEGUARD_API_KEY`.
- Raw backend error messages are hidden in production.
- Use HTTPS and Cloudflare Access, VPN-only access, or another real auth layer for public deployments.
- SQLite database and runtime monitor data are ignored by git.

## Known Limits

- SQLite is suitable for a single homelab deployment. Multi-user/cloud deployments would need stronger auth and database planning.
- Per-container CPU usage is not implemented yet.
- Alerts are persisted, but notification delivery is not implemented yet.
- Server monitors check other NodeGuard backends or plain health URLs. For internal services with self-signed certificates, enable `Allow self-signed HTTPS` on that monitor. Public websites and reverse-proxy routes belong in Domains / Services.

## Portfolio

Suggested demo flow:

1. Dashboard overview.
2. Server metrics.
3. Docker containers.
4. Domains / services.
5. Alerts and alert detail.
6. Settings and screenshot privacy.

Screenshots: TODO  
Demo video: TODO
