# NodeGuard

**Monitor your servers. Protect your stack.**

NodeGuard is a web-only, read-only infrastructure monitoring dashboard for homelab Linux and Docker services. It combines a polished Vite React frontend with a Node.js TypeScript API that checks host metrics, Docker container state, domain and reverse-proxy reachability, SSL expiry, and alert history.

The project is designed for a real self-hosted deployment at `nodeguard.muthu.eu`, while still being portfolio-friendly for screenshots and demos.

## Current Status

- Active frontend: `apps/web`
- Active backend: `apps/api`
- Runtime data: SQLite
- Deployment target: one Docker container behind HTTPS at `nodeguard.muthu.eu`
- React Native / Expo files are no longer part of the active project.

## Features

- Password login screen backed by secure HTTP-only sessions.
- Modern dark dashboard UI with sidebar navigation, sidebar collapse, subtle professional motion, and screenshot-friendly styling.
- Dashboard overview with overall status, main issue, active issues, real status breakdowns, recent alerts, and domain reachability.
- Server page with clickable CPU, RAM, disk, and swap summaries plus persistent per-resource history across 1-hour to 30-day ranges.
- Monitored server support for internal NodeGuard backends or health URLs.
- Per-monitor self-signed HTTPS option for internal services such as Proxmox.
- Docker containers page with a searchable, filterable, sortable read-only table for runtime state, Docker health, Compose/Swarm stack, image, container IP, published ports, uptime, responsive mobile cards, detail inspection, limited log preview, and monitored container checks.
- Domains / services page for public domains, internal URLs, reverse-proxy routes, paths, expected HTTP status codes, latency trends, rolling 30-day uptime, SSL state, expanded diagnostics, edit/delete/duplicate, and manual checks.
- Alerts page with active/resolved/all views, search, pagination, dense operational columns, toggleable alert detail, persisted history, and alert deletion/dismissal.
- Settings page with refresh interval, screenshot privacy, diagnostics export, demo mode, session details, and logout.
- Fully isolated Demo Mode with a populated multi-server homelab, varied Docker/runtime health, endpoint states, resource trends, and active/resolved alert history.
- Production Docker image that serves the web UI and API from one container.

## Tech Stack

Frontend:

- React
- Vite
- TypeScript
- TanStack Query
- Zustand
- Lucide icons
- CSS with a custom dark SaaS/cyber visual system

Backend:

- Node.js
- TypeScript
- Express
- SQLite via `better-sqlite3`
- `systeminformation`
- `dockerode`
- `helmet`
- `express-rate-limit`

## Architecture

```txt
Browser
  |
  | HTTPS + password session
  v
NodeGuard Web/API container
  |
  | systeminformation + dockerode + HTTP/TLS checks + SQLite
  v
Linux host + Docker containers + domains/services
```

The browser never talks directly to Docker, SSH, the host shell, or the Docker socket. The backend performs read-only monitoring and exposes safe API responses.

## Local Setup

Install dependencies:

```bash
npm install
```

Create the backend environment file:

```bash
cp .env.example apps/api/.env
```

Edit `apps/api/.env`:

```env
NODE_ENV=development
PORT=3000
NODEGUARD_ADMIN_USERNAME=admin
NODEGUARD_ADMIN_PASSWORD=change_this_local_password
SESSION_DURATION_DAYS=7
SESSION_COOKIE_SECURE=auto
NODEGUARD_API_KEY=optional_machine_key_for_future_agents
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
DATABASE_URL=file:data/nodeguard.sqlite
MONITORED_DOMAINS=https://bit.muthu.eu,https://cloud.muthu.eu,https://status.muthu.eu
```

Start the backend:

```bash
npm run dev:api
```

Start the frontend in another terminal:

```bash
npm run dev:web
```

Open:

```txt
http://localhost:5173
```

Login:

```txt
Username: value of NODEGUARD_ADMIN_USERNAME from apps/api/.env
Password: value of NODEGUARD_ADMIN_PASSWORD from apps/api/.env
```

If `NODEGUARD_ADMIN_PASSWORD` changes later, restart the backend to rotate the owner password and clear existing sessions for that account.

`SESSION_COOKIE_SECURE=auto` follows the request protocol: direct HTTP access on a private LAN receives a non-Secure development cookie, while HTTPS requests through a trusted reverse proxy receive a Secure cookie. Set it explicitly to `true` only when NodeGuard is always accessed over HTTPS.

The API always permits requests from its own origin, so direct access such as `http://NODEGUARD_VM_IP:3000` works even when `ALLOWED_ORIGINS` contains only the production HTTPS domain. `ALLOWED_ORIGINS` remains the allowlist for separate cross-origin frontends.

Demo mode can be enabled later from Settings for portfolio screenshots.

## Running Both Dev Servers

The root script starts both workspaces:

```bash
npm run dev
```

If port `3000` is already in use, stop the existing API process or change `PORT` in `apps/api/.env`.

## Production Docker Setup

Create a root `.env`:

```bash
cp .env.example .env
```

Example production values:

```env
NODE_ENV=production
PORT=3000
NODEGUARD_ADMIN_USERNAME=admin
NODEGUARD_ADMIN_PASSWORD=use_a_long_random_password
SESSION_DURATION_DAYS=7
SESSION_COOKIE_SECURE=auto
NODEGUARD_API_KEY=optional_machine_key_for_future_agents
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

Compose now refuses to start a production deployment without `NODEGUARD_ADMIN_PASSWORD`. On an existing deployment, changing that value and recreating the container rotates the owner password while preserving monitoring data:

```bash
docker compose up -d --build --force-recreate
```

View logs:

```bash
docker compose logs -f nodeguard
```

Stop:

```bash
docker compose down
```

The compose setup mounts:

- `/data` for SQLite persistence.
- `/var/run/docker.sock:ro` for read-only Docker metadata.

For public access, put NodeGuard behind HTTPS plus Cloudflare Access, VPN-only access, or another real authentication layer. Human users sign in with username/password sessions; API keys are reserved for future agents and integrations.

## Environment Variables

```env
NODE_ENV=development
PORT=3000
NODEGUARD_ADMIN_USERNAME=admin
NODEGUARD_ADMIN_PASSWORD=replace_me
SESSION_DURATION_DAYS=7
SESSION_COOKIE_NAME=nodeguard_session
SESSION_COOKIE_SECURE=auto
NODEGUARD_API_KEY=optional_machine_key_for_future_agents
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
DATABASE_URL=file:data/nodeguard.sqlite
TRUST_PROXY=false
REQUEST_JSON_LIMIT=64kb
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=1200
WEB_DIST_DIR=apps/web/dist
MONITORED_DOMAINS=https://bit.muthu.eu,https://cloud.muthu.eu,https://status.muthu.eu
SERVER_DISPLAY_NAME=local-nodeguard-host
LOG_PREVIEW_LINES=80
DOMAIN_CHECK_TIMEOUT_MS=5000
METRIC_SAMPLE_INTERVAL_SECONDS=60
METRIC_HISTORY_RETENTION_DAYS=30
CPU_WARNING_PERCENT=80
CPU_CRITICAL_PERCENT=90
MEMORY_WARNING_PERCENT=80
MEMORY_CRITICAL_PERCENT=90
DISK_WARNING_PERCENT=80
DISK_CRITICAL_PERCENT=90
```

Never commit `.env` files, API keys, private IPs, passwords, or other secrets.

## API

Public:

```txt
GET /health
```

Auth endpoints:

```txt
GET /api/auth/me
POST /api/auth/login
POST /api/auth/logout
```

Protected endpoints require a signed-in session cookie. `Authorization: Bearer <api-key>` or `x-api-key: <api-key>` is still supported for future machine-to-machine callers:

```txt
GET /api/overview
GET /api/servers
GET /api/servers/monitors
POST /api/servers/monitors
PUT /api/servers/monitors/:id
DELETE /api/servers/monitors/:id
GET /api/servers/:id
GET /api/servers/:id/metrics
GET /api/servers/:id/metrics/history?range=1h|6h|24h|7d|30d
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
DELETE /api/alerts/:id
POST /api/checks/run
```

## Monitoring Concepts

### Servers

The main local host is monitored through `systeminformation`. Extra monitored servers can be added from the Server page. These are intended for:

- Other NodeGuard backends.
- Plain health URLs.
- Internal services where reachability alone is useful.

For internal HTTPS services with self-signed certificates, enable **Allow self-signed HTTPS** on that server monitor instead of disabling TLS verification globally.

### Docker Containers

Docker data is read by the backend using Docker metadata. Container monitors let you mark important containers that should exist and be running, such as `vaultwarden`, `nextcloud`, `postgres`, or `pihole`.

Docker actions are intentionally not implemented. NodeGuard does not restart, stop, delete, exec into, prune, or modify containers.

### Domains / Services

Domains / services can monitor:

- Public HTTPS domains such as `https://bit.muthu.eu`
- Internal URLs such as `http://10.0.0.20:5000`
- Specific paths such as `/health`, `/login`, or `/api/status`
- Expected HTTP codes such as `200,301,302,401`

A `404` usually means the service is reachable but NodeGuard checked a path that does not exist. Edit the monitor path or expected status codes if that response is normal for the service.

### Alerts

Alerts are generated from server, Docker, domain, and monitored-service state. Alert history is persisted with:

- Active/resolved state
- First seen
- Last seen
- Occurrence count
- Failed checks
- Possible cause
- Suggested next steps

Resolved alerts can be permanently removed from history. Deleting an active alert dismisses that occurrence while its underlying condition remains active; the dismissal expires after recovery so a future recurrence can alert again.

Domain checks retain one history sample per minute for a rolling 30-day window. This powers observed uptime and latency comparisons without allowing one-second UI refreshes to create excessive database growth.

## UI Notes

NodeGuard currently uses a polished dark dashboard style inspired by modern SaaS and technical monitoring tools:

- Sidebar navigation with collapse/reveal rail.
- Larger screenshot-friendly text.
- Glassy dark panels with blue, purple, and cyan accents.
- Health colors for healthy, warning, critical, offline, and unknown states.
- Subtle professional motion for dashboard panels, rows, modals, meters, and interactions.
- `prefers-reduced-motion` support for accessibility.
- Login screen remains stable without background/card movement.

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

Docker:

```bash
docker compose up -d --build
docker compose logs -f nodeguard
docker compose down
```

## Security Notes

- NodeGuard is read-only.
- Human users authenticate with username/password and an HTTP-only session cookie.
- Production first-run setup requires `NODEGUARD_ADMIN_PASSWORD`.
- `/api/*` is protected by session authentication or optional API-key authentication for future agents/integrations.
- Raw backend error messages are hidden in production.
- Docker metadata is read by the backend only.
- The frontend never receives Docker socket, shell, SSH, or privileged host access.
- Use HTTPS and Cloudflare Access, VPN-only access, or another real auth layer before public exposure.
- SQLite database files, `.env` files, logs, and generated output are ignored by git.

## Known Limits

- SQLite is intended for a single homelab deployment.
- Per-container CPU usage is not implemented yet.
- Push/email notifications are not implemented yet.
- Server monitors check other NodeGuard backends or plain health URLs; public websites and reverse proxies belong in Domains / Services.
- Full remote metrics aggregation is a future improvement.
- Multi-user roles, password reset, and 2FA are future improvements.

## Portfolio Demo Flow

1. Open NodeGuard.
2. Show dashboard overview and main issue.
3. Open server metrics.
4. Open Docker containers and monitored containers.
5. Open Domains / Services.
6. Open Alerts and alert detail.
7. Show Settings, screenshot privacy, diagnostics, and logout.

Screenshots: TODO  
Demo video: TODO
