# NodeGuard

**Monitor your servers. Protect your stack.**

NodeGuard is a cross-platform, read-only infrastructure monitoring app for web, iOS, and Android. The current web client combines a polished Vite React frontend with a Node.js TypeScript API that checks host metrics, Docker container state, domain and reverse-proxy reachability, SSL expiry, software updates, and alert history.

The project is designed for a real self-hosted deployment at `nodeguard.muthu.eu`, while still being portfolio-friendly for screenshots and demos.

## Current Status

- Active frontend: `apps/web`
- Active backend: `apps/api`
- Linux agent: `agent`
- Runtime data: SQLite
- Deployment target: one Docker container behind HTTPS at `nodeguard.muthu.eu`
- React Native / Expo files are no longer part of the active project.

## Features

- Password login screen backed by secure HTTP-only sessions.
- Modern dark dashboard UI with sidebar navigation, sidebar collapse, subtle professional motion, and screenshot-friendly styling.
- Dashboard overview with overall status, main issue, active issues, real status breakdowns, recent alerts, and domain reachability.
- Server page with clickable CPU, RAM, disk, and swap summaries plus persistent per-resource history across 1-hour to 30-day ranges.
- NodeGuard Agent v0.1 for secure outbound-only Linux and Docker monitoring across multiple hosts, with one-time enrollment, per-agent credentials, heartbeats, bounded retry buffering, and systemd packaging.
- Agents page with online/stale/offline status, host inventory, resources, Docker summary, enrollment commands, rename, credential rotation, and revocation.
- Monitored server support for internal NodeGuard backends or health URLs.
- Per-monitor self-signed HTTPS option for internal services such as Proxmox.
- Docker containers page with a searchable, filterable, sortable read-only table for runtime state, Docker health, Compose/Swarm stack, image, container IP, published ports, uptime, responsive mobile cards, detail inspection, limited log preview, and monitored container checks.
- Domains / services page for public domains, internal URLs, reverse-proxy routes, paths, expected HTTP status codes, latency trends, rolling 30-day uptime, SSL state, expanded diagnostics, edit/delete/duplicate, and manual checks.
- Update Center with a shared source model, search and filters, responsive update inventory, Dashboard/sidebar totals, release-note links, and deduplicated update alerts.
- Home Assistant update discovery through backend-only long-lived access tokens. V1 is read-only and never installs updates.
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

Agent:

- Go 1.23+
- Linux `/proc`, `/etc/os-release`, filesystem, and network collectors
- Read-only Docker Engine HTTP API over `/var/run/docker.sock`
- Static Linux amd64 and arm64 builds

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

Remote Linux/Docker hosts
  |
  | outbound HTTPS + unique per-agent credential
  v
NodeGuard agent ingestion API + SQLite history
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
NODEGUARD_DEMO_USERNAME=demo
NODEGUARD_DEMO_PASSWORD=demo
NODEGUARD_INTEGRATION_SECRET=generate_a_long_random_secret
SESSION_DURATION_DAYS=7
REMEMBERED_SESSION_DURATION_DAYS=30
SESSION_COOKIE_SECURE=auto
NODEGUARD_API_KEY=optional_legacy_machine_key
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

Login as the live owner:

```txt
Username: value of NODEGUARD_ADMIN_USERNAME from apps/api/.env
Password: value of NODEGUARD_ADMIN_PASSWORD from apps/api/.env
```

Login to the isolated fictional environment:

```txt
Username: value of NODEGUARD_DEMO_USERNAME from apps/api/.env
Password: value of NODEGUARD_DEMO_PASSWORD from apps/api/.env
```

If `NODEGUARD_ADMIN_PASSWORD` changes later, restart the backend to rotate the owner password and clear existing sessions for that account.

`SESSION_COOKIE_SECURE=auto` follows the request protocol: direct HTTP access on a private LAN receives a non-Secure development cookie, while HTTPS requests through a trusted reverse proxy receive a Secure cookie. Set it explicitly to `true` only when NodeGuard is always accessed over HTTPS.

The API always permits requests from its own origin, so direct access such as `http://NODEGUARD_VM_IP:3000` works even when `ALLOWED_ORIGINS` contains only the production HTTPS domain. `ALLOWED_ORIGINS` remains the allowlist for separate cross-origin frontends.

The authenticated account fixes the data mode: the admin account is always Live, while the demo account is always restricted to isolated fictional data. Users cannot switch modes from Settings.

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
NODEGUARD_DEMO_USERNAME=demo
NODEGUARD_DEMO_PASSWORD=demo
NODEGUARD_INTEGRATION_SECRET=use_a_separate_long_random_secret
SESSION_DURATION_DAYS=7
REMEMBERED_SESSION_DURATION_DAYS=30
SESSION_COOKIE_SECURE=auto
NODEGUARD_API_KEY=optional_legacy_machine_key
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

Compose refuses to start a production deployment without both `NODEGUARD_ADMIN_PASSWORD` and `NODEGUARD_DEMO_PASSWORD`. On an existing deployment, changing either value and recreating the container rotates that account password while preserving monitoring data:

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

For public access, put NodeGuard behind HTTPS plus Cloudflare Access, VPN-only access, or another real authentication layer. Human users sign in with username/password sessions. Agents use their own dedicated credentials and never use human passwords or the legacy global API key.

## Environment Variables

```env
NODE_ENV=development
PORT=3000
NODEGUARD_ADMIN_USERNAME=admin
NODEGUARD_ADMIN_PASSWORD=replace_me
NODEGUARD_INTEGRATION_SECRET=replace_with_at_least_32_random_bytes
SESSION_DURATION_DAYS=7
REMEMBERED_SESSION_DURATION_DAYS=30
SESSION_COOKIE_NAME=nodeguard_session
SESSION_COOKIE_SECURE=auto
NODEGUARD_API_KEY=optional_legacy_machine_key
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
DATABASE_URL=file:data/nodeguard.sqlite
TRUST_PROXY=false
REQUEST_JSON_LIMIT=512kb
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=1200
WEB_DIST_DIR=apps/web/dist
MONITORED_DOMAINS=https://bit.muthu.eu,https://cloud.muthu.eu,https://status.muthu.eu
SERVER_DISPLAY_NAME=local-nodeguard-host
LOG_PREVIEW_LINES=80
DOMAIN_CHECK_TIMEOUT_MS=5000
UPDATE_CHECK_TIMEOUT_MS=10000
UPDATE_REFRESH_INTERVAL_MINUTES=15
AGENT_ENROLLMENT_TTL_MINUTES=10
AGENT_HEARTBEAT_INTERVAL_SECONDS=20
AGENT_METRICS_INTERVAL_SECONDS=30
AGENT_DOCKER_INTERVAL_SECONDS=60
AGENT_INVENTORY_INTERVAL_SECONDS=21600
AGENT_STALE_AFTER_SECONDS=75
AGENT_OFFLINE_AFTER_SECONDS=180
AGENT_TIMESTAMP_TOLERANCE_SECONDS=900
AGENT_MAX_CONTAINERS=500
AGENT_RATE_LIMIT_MAX=600
AGENT_ENROLLMENT_RATE_LIMIT_MAX=10
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
GET /api/updates
POST /api/updates/refresh
GET /api/updates/settings/home-assistant
PUT /api/updates/settings/home-assistant
POST /api/updates/settings/home-assistant/test
POST /api/checks/run
```

Owner/admin agent-management endpoints use the human session and never return stored credentials:

```txt
GET /api/agents
GET /api/agents/:id
PUT /api/agents/:id
GET /api/agents/enrollment-tokens
POST /api/agents/enrollment-tokens
DELETE /api/agents/enrollment-tokens/:id
POST /api/agents/:id/rotate-credential
POST /api/agents/:id/revoke
```

The Go agent uses a separate machine API and a unique bearer credential:

```txt
POST /api/agent/register
GET /api/agent/status
POST /api/agent/heartbeat
POST /api/agent/inventory
POST /api/agent/metrics
POST /api/agent/docker
```

## NodeGuard Agent Quick Start

See [`agent/README.md`](agent/README.md) for complete build, installation, registration, systemd, troubleshooting, uninstallation, buffering, and Docker-socket security guidance.

Build and install on the Linux host:

```bash
cd agent
make test vet build
sudo ./install.sh
```

In NodeGuard, open **Agents**, choose **Add agent**, and copy the short-lived registration command. After registration:

```bash
sudo systemctl enable --now nodeguard-agent
sudo systemctl status nodeguard-agent
sudo journalctl -u nodeguard-agent -f
```

Enrollment tokens expire after 10 minutes by default and are invalid after one use. Every agent receives a different long-term credential, stored only in root-owned mode-`0600` configuration and as a hash in NodeGuard. Credential rotation and revocation are available from the agent detail view.

Agent v0.1 is strictly read-only. It has no inbound listener, remote shell, command execution, package/update installation, reboot, or Docker lifecycle endpoints. Reports buffered during outages are kept only in a bounded in-memory queue (100 reports, 15 minutes), so a process restart discards unsent reports.

Access to the Docker socket remains highly privileged even though the agent uses only fixed read-only API requests. Review the agent source and disable Docker collection when it is not needed.

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

### Update Center and Home Assistant

NodeGuard V1 discovers Home Assistant `update.*` entities and normalizes them into a shared update model that can later support Ubuntu, Docker, Proxmox, FRITZ!Box, and NodeGuard Agent sources. It shows installed and available versions, category, status, source links, and release notes where Home Assistant provides them. Installation remains in the source system.

Create a Home Assistant long-lived access token from **Profile > Security > Long-Lived Access Tokens**. In NodeGuard, open **Settings > Update sources**, enter the Home Assistant URL and token, test the connection, and save it. The token is encrypted at rest in SQLite with `NODEGUARD_INTEGRATION_SECRET`, is never returned to the browser, and must not be committed or logged.

Generate the encryption secret with:

```bash
openssl rand -hex 32
```

Changing `NODEGUARD_INTEGRATION_SECRET` after credentials have been saved makes those encrypted credentials unreadable; reconnect the integration after a deliberate rotation. Update checks run every 15 minutes by default and can also be triggered manually. Ordinary optional updates do not affect infrastructure health. Explicit security-critical metadata is surfaced separately.

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
- Production first-run setup requires environment-backed admin and demo passwords; both are stored only as scrypt hashes in the database.
- Account identity enforces the data boundary: admin sessions are Live-only and demo sessions are Demo-only.
- Demo sessions are rejected at the backend boundary for live infrastructure, configuration, integration, and diagnostic APIs.
- Raw backend error messages are hidden in production.
- Docker metadata is read by the backend only.
- The frontend never receives Docker socket, shell, SSH, or privileged host access.
- Use HTTPS and Cloudflare Access, VPN-only access, or another real auth layer before public exposure.
- SQLite database files, `.env` files, logs, and generated output are ignored by git.

## Known Limits

- SQLite is intended for a single homelab deployment.
- Local-backend per-container CPU usage remains unavailable; agents report it where the Docker Engine exposes a valid one-shot sample.
- Push/email notifications are not implemented yet.
- Server monitors check other NodeGuard backends or plain health URLs; public websites and reverse proxies belong in Domains / Services.
- Agent buffering is memory-only in v0.1, so queued reports do not survive an agent restart.
- Multi-user roles, password reset, and 2FA are future improvements.

## Portfolio Demo Flow

1. Open NodeGuard.
2. Show dashboard overview and main issue.
3. Open server metrics.
4. Open Agents and inspect the fictional multi-host fleet.
5. Open Docker containers, filter by host, and inspect read-only details.
6. Open Domains / Services.
7. Open Alerts and alert detail.
8. Show Settings, screenshot privacy, diagnostics, and logout.

Screenshots: TODO List
Demo video: TODO List
