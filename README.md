# NodeGuard

Monitor your servers. Protect your stack.

NodeGuard is a web-based, read-only infrastructure monitoring dashboard for self-hosted Linux/Docker servers. It now has a Vite React web frontend and a Node.js TypeScript backend API that reads live host, Docker, domain, and alert data.

## Project Status

- Web-only app. React Native / Expo is no longer the target direction.
- Existing mobile/Expo files are legacy reference while the project migrates.
- The active app lives in `apps/web`.
- The active backend lives in `apps/api`.
- Mock data is no longer the default data path for the web app.

## Features

- Connect screen for backend URL and API key.
- Dashboard overview with live status, counts, recent alerts, and domain summary.
- Root-cause dashboard summary with active issues and clearer status explanations.
- Server metrics page for CPU, RAM, disk, swap, uptime, network, OS, kernel, and Docker availability.
- Add/edit/remove monitored server profiles from the Server page.
- Docker containers page with status, health, image, uptime, ports, and safe detail view.
- Add/edit/remove monitored Docker containers by name or ID from the Containers page.
- Domain/reverse-proxy checks from `MONITORED_DOMAINS` and user-added domains, including HTTP status, latency, and SSL expiry where available.
- Add/edit/remove user-added domains from the Domains page.
- Demo mode with realistic portfolio data for screenshots and walkthroughs.
- Screenshot privacy setting to hide sensitive backend URLs.
- Alerts generated from metrics, Docker, and domain health.
- Settings page with masked API key, refresh interval, and disconnect.
- Loading, empty, error, and stale cached-data states.

## Architecture

```txt
Web Browser
   |
   | HTTP/HTTPS + API key
   v
NodeGuard Backend API
   |
   | systeminformation + dockerode + HTTP/domain checks
   v
Linux host + Docker containers + public domains
```

The frontend never talks directly to Docker, SSH, the host shell, or the Docker socket.

## Setup

Install dependencies from the project root:

```bash
npm install
```

Create a backend env file:

```bash
cp .env.example apps/api/.env
```

Edit `apps/api/.env` and set at least:

```env
NODEGUARD_API_KEY=replace_me_with_a_real_local_key
MONITORED_DOMAINS=https://bit.muthu.eu
```

## Run Locally

Backend:

```bash
npm run dev:api
```

Frontend:

```bash
npm run dev:web
```

Or run both from the root:

```bash
npm run dev
```

Open the web app at:

```txt
http://localhost:5173
```

Connect with:

```txt
Backend URL: http://localhost:3000
API key: the value of NODEGUARD_API_KEY
```

## Environment Variables

See `.env.example`.

```env
NODE_ENV=development
PORT=3000
NODEGUARD_API_KEY=replace_me
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
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

Do not commit `.env` files or real secrets.

## API Endpoints

`GET /health` is public.

All `/api/*` endpoints require:

```txt
Authorization: Bearer <api-key>
```

Also supported:

```txt
x-api-key: <api-key>
```

Endpoints:

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
GET /api/alerts/:id
POST /api/checks/run
```

The connect screen validates credentials with `GET /api/overview`.

Dashboard server counts refer to actual monitored hosts. Public websites, internal URLs, and reverse-proxy routes belong in Domains / Services, not the host server count.

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

- The app is read-only.
- No restart, stop, delete, prune, reboot, SSH, shell, or Docker exec actions are implemented.
- Docker data is read only by the backend through `dockerode`.
- API keys are required for `/api/*`.
- Missing API keys return `401`; invalid API keys return `403`.
- Backend responses avoid exposing configured secrets.
- The web MVP stores the API key in `localStorage`; do not use shared browsers for real deployments.
- Logs are limited and sanitized before being sent to the frontend.

## Known Limitations

- SSL certificate expiry is checked for HTTPS domains when the backend can read certificate metadata.
- Per-container CPU usage is currently `null`; Docker status, health, ports, restart policy, start time, and limited logs are live.
- Alerts are generated in memory from the current snapshot; there is no persistent incident history yet.
- Added server monitors are stored locally in `apps/api/data/server-monitors.json`, which is ignored by git.
- Added container monitors are stored locally in `apps/api/data/container-monitors.json`, which is ignored by git.
- Added domain monitors are stored locally in `apps/api/data/domain-monitors.json`, which is ignored by git.
- Server monitors with an API key check another NodeGuard backend through `/api/overview`; server monitors without an API key check the exact URL entered. Use the Domains page for public websites and reverse-proxy checks.
- Full remote metrics aggregation is a future step.
- Do not expose NodeGuard publicly without authentication such as Cloudflare Access, basic auth, VPN-only access, or a proper login layer.
- Legacy Expo/mobile files remain in the repo as migration reference and are not the active app.

## Portfolio Notes

Add screenshots and a demo video link after the web UI is captured:

```txt
Screenshots: TODO
Demo video: TODO
```
