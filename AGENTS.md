# AGENTS.md

## Scope

NodeGuard is a web-only infrastructure monitoring dashboard. Keep work inside this folder unless the user explicitly asks otherwise.

React Native / Expo is no longer part of the active project.

## Active Structure

- `apps/web` - Vite React TypeScript frontend.
- `apps/api` - Node.js TypeScript backend API.
- `Dockerfile` - production image for web + API.
- `docker-compose.yml` - single-container homelab deployment.
- `.env.example` - safe local/production environment template.
- `data/` - local SQLite/runtime data, ignored by git.

## Product Direction

- Target deployment: `nodeguard.muthu.eu`.
- Target user: homelab and self-hosting users who monitor Linux hosts, Docker containers, and public/internal services.
- Keep the MVP read-only.
- Prefer real working monitoring over fake screens.
- Keep the browser isolated from Docker, SSH, shell access, and the Docker socket.
- Use username/password session authentication for human dashboard access.
- Keep API keys only for machine-to-machine access such as future agents or integrations.
- Use Cloudflare Access, VPN-only access, or another real auth layer before public exposure.

## Stack

Frontend:

- React
- Vite
- TypeScript
- TanStack Query
- Zustand
- Lucide icons

Backend:

- Node.js
- TypeScript
- Express
- SQLite with `better-sqlite3`
- `systeminformation`
- `dockerode`
- `helmet`
- `express-rate-limit`

## Commands

Run from the project root:

```bash
npm install
npm run dev
npm run dev:api
npm run dev:web
npm run build
npm run typecheck
npm run lint
npm test
docker compose up -d --build
docker compose logs -f nodeguard
docker compose down
```

## Backend API

Public:

```txt
GET /health
```

Protected:

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

Use `Authorization: Bearer <api-key>`. `x-api-key` is also accepted.

## Persistence

SQLite stores:

- Server monitors.
- Container monitors.
- Domain monitors with path, expected status codes, last success/failure, and minute-sampled 30-day check history.
- Minute-sampled CPU, RAM, disk, and swap history with configurable retention of at least 30 days.
- Alert history with first seen, last seen, occurrence count, active/resolved status, troubleshooting detail, and persistent active-alert dismissal.

Legacy JSON monitor files may be imported once if they still exist, but SQLite is authoritative.

## UI Notes

- Keep the dark Grafana-inspired visual direction: compact bordered panels, dense metrics, square corners, bright status accents, and dark controls.
- Do not copy Grafana branding.
- Preserve realistic `muthu.eu` demo data for portfolio screenshots.
- Domain/service rows should show URL/path, HTTP status, latency trend, rolling uptime, SSL state, expected status codes, health, and expandable diagnostics.
- Docker containers should use real metadata in a dense read-only table on desktop and compact cards on mobile; keep runtime state separate from Docker health and never imply lifecycle controls.
- Server resource-history charts must use persisted real samples outside Demo Mode, open individually from their summary cards, and remain responsive without horizontal scrolling.
- Server monitors may allow self-signed HTTPS per monitor for internal homelab tools such as Proxmox; do not disable TLS verification globally.
- Alerts should use the dense searchable table, support persisted deletion/dismissal, and provide toggleable detail explaining what happened, first/last seen, occurrence count, likely cause, failed checks, and suggested next steps.
- Keep UI elements aligned and prevent status pills/actions from overflowing panel boundaries.

## Do

- Read `README.md`, `AGENTS.md`, and package files before changes.
- Keep changes small and scoped.
- Preserve read-only behavior.
- Handle Docker unavailable, metrics unavailable, domain timeout, invalid login/session, invalid API key, and backend unreachable states.
- Keep API errors safe and useful.
- Update docs when setup, commands, API endpoints, env vars, deployment, or architecture change.
- Run typecheck/build/test where relevant.
- Keep `.env`, SQLite data, logs, and generated output out of git.

## Do Not

- Do not add mobile/Expo code.
- Do not expose Docker socket, SSH, shell access, or privileged controls to the frontend.
- Do not add restart, stop, delete, prune, reboot, exec, or volume actions.
- Do not hardcode private IPs, real API keys, passwords, or infrastructure secrets.
- Do not commit `.env` files.
- Do not rewrite the whole frontend unnecessarily.
- Do not build Kubernetes, SaaS billing, team accounts, SSH terminal, or enterprise features for v1.

## Known Limits

- SQLite is intended for one homelab deployment.
- Per-container CPU usage is not implemented yet.
- Alert history is persisted, but push/email notifications are not implemented yet.
- Server monitors check other NodeGuard backends or plain health URLs. Public sites and reverse proxies belong in Domains / Services.
- Full remote metrics aggregation is a future improvement.
