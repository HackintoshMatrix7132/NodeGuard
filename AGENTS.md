# AGENTS.md

## Scope

NodeGuard is a cross-platform infrastructure monitoring app with an active web dashboard and planned iOS/Android clients. Keep work inside this folder unless the user explicitly asks otherwise.

React Native / Expo is no longer part of the active project.

## Active Structure

- `apps/web` - Vite React TypeScript frontend.
- `apps/api` - Node.js TypeScript backend API.
- `agent` - standalone Go Linux monitoring agent and systemd packaging.
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
- Require an explicit owner password in production; `SESSION_COOKIE_SECURE=auto` follows Express request security so direct LAN HTTP and reverse-proxied HTTPS both work correctly.
- Give every NodeGuard Agent its own credential. Enrollment tokens are hashed, single-use, short-lived, and revocable; agent credentials are stored as hashes server-side.
- Keep integration credentials encrypted on the backend and never return stored secrets to clients or logs.
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

Agent:

- Go 1.23+
- Standard-library Linux and Docker collectors
- Outbound HTTPS only
- systemd service

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
cd agent && make fmt-check vet test build-linux-amd64 build-linux-arm64
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
GET /api/updates
POST /api/updates/refresh
GET /api/updates/settings/home-assistant
PUT /api/updates/settings/home-assistant
POST /api/updates/settings/home-assistant/test
POST /api/checks/run
```

Owner/admin agent management:

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

Dedicated agent authentication:

```txt
POST /api/agent/register
GET /api/agent/status
POST /api/agent/heartbeat
POST /api/agent/inventory
POST /api/agent/metrics
POST /api/agent/docker
```

Use `Authorization: Bearer <api-key>`. `x-api-key` is also accepted.

## Persistence

SQLite stores:

- Server monitors.
- Container monitors.
- Domain monitors with path, expected status codes, last success/failure, and minute-sampled 30-day check history.
- Minute-sampled CPU, RAM, disk, and swap history with configurable retention of at least 30 days.
- Alert history with first seen, last seen, occurrence count, active/resolved status, troubleshooting detail, and persistent active-alert dismissal.
- Encrypted integration settings and normalized cached update records.
- Agent enrollment records, hashed per-agent credentials, inventory, heartbeats, metrics, and host-scoped Docker inventory.

Legacy JSON monitor files may be imported once if they still exist, but SQLite is authoritative.

## UI Notes

- Keep the dark Grafana-inspired visual direction: compact bordered panels, dense metrics, square corners, bright status accents, and dark controls.
- Do not copy Grafana branding.
- Keep Demo Mode rich, fictional, sanitized, isolated from production data, and internally consistent across all pages.
- Domain/service rows should show URL/path, HTTP status, latency trend, rolling uptime, SSL state, expected status codes, health, and expandable diagnostics.
- Docker containers should use real metadata in a dense read-only table on desktop and compact cards on mobile; keep runtime state separate from Docker health and never imply lifecycle controls.
- Server resource-history charts must use persisted real samples outside Demo Mode, open individually from their summary cards, and remain responsive without horizontal scrolling.
- Server monitors may allow self-signed HTTPS per monitor for internal homelab tools such as Proxmox; do not disable TLS verification globally.
- Alerts should use the dense searchable table, support persisted deletion/dismissal, and provide toggleable detail explaining what happened, first/last seen, occurrence count, likely cause, failed checks, and suggested next steps.
- Updates should use the shared source model, keep availability totals consistent, remain read-only, and never expose Home Assistant tokens to the frontend after submission.
- Keep UI elements aligned and prevent status pills/actions from overflowing panel boundaries.
- Agent hosts must preserve the local-host experience, use host-scoped metrics/containers, and show compact cards on mobile.

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
- Do not add an inbound listener, remote shell, arbitrary commands, package installation, reboot, or Docker lifecycle operations to the agent.
- Do not add restart, stop, delete, prune, reboot, exec, or volume actions.
- Do not install updates or execute remote update commands from NodeGuard V1.
- Do not hardcode private IPs, real API keys, passwords, or infrastructure secrets.
- Do not commit `.env` files.
- Do not rewrite the whole frontend unnecessarily.
- Do not build Kubernetes, SaaS billing, team accounts, SSH terminal, or enterprise features for v1.

## Known Limits

- SQLite is intended for one homelab deployment.
- Local-backend per-container CPU usage is not implemented; agents may report it when Docker supplies a valid one-shot sample.
- Alert history is persisted, but push/email notifications are not implemented yet.
- Server monitors check other NodeGuard backends or plain health URLs. Public sites and reverse proxies belong in Domains / Services.
- Agent v0.1 buffers unsent reports in memory only; reports are lost on process restart.
- Agent v0.1 runs as root in the packaged service so it can read protected configuration and Docker metadata. Docker socket access remains highly privileged and is not claimed to be least-privilege isolation.
