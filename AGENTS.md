# AGENTS.md

## Scope

NodeGuard is now a web-only infrastructure monitoring dashboard. Keep work inside this folder unless the user explicitly asks otherwise.

React Native / Expo is legacy context only. Do not add new mobile app code.

## Active Structure

- `apps/web` - Vite React TypeScript frontend.
- `apps/api` - Node.js TypeScript backend API.
- `app/` and root `src/` - legacy Expo/mobile MVP reference during migration.
- `.env.example` - safe environment template.

## Current Direction

- Preserve the existing visual direction where useful.
- Prioritize dashboard clarity: overall status, active issues, root-cause summary, core metrics, then details.
- Use real backend API data by default.
- Keep mock data only as legacy/reference or an intentional demo fallback.
- Keep the app read-only.
- Keep the browser isolated from Docker, SSH, shell access, and the Docker socket.
- Use API key authentication for all `/api/*` endpoints.

## Stack

Frontend:

- React
- Vite
- TypeScript
- TanStack Query
- Zustand

Backend:

- Node.js
- TypeScript
- Express
- `systeminformation`
- `dockerode`
- `dotenv`

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

Use `Authorization: Bearer <api-key>`. `x-api-key` is also accepted.

## UI Reference Notes

- Login/connect should resemble the supplied Grafana login references: abstract dark monitoring background, centered card, large product mark, welcome heading, stacked inputs, blue primary button, inline error banner, and small footer links.
- Dashboard/app shell should resemble the supplied Grafana dashboard references: near-black workspace, compact bordered panels, thin grid lines, dense metrics, bright status accents, square corners, dark form controls, and chart-like preview strips.
- Do not copy Grafana branding. Keep NodeGuard colors, language, and security-focused identity.
- Domain / service rows should show HTTP status, latency, SSL state, and health when available.
- Alert detail should explain what happened, likely causes, failed checks, and suggested next steps.

## Do

- Read `README.md`, `AGENTS.md`, and `package.json` before changes.
- Keep changes small and scoped.
- Preserve read-only behavior.
- Handle Docker unavailable, metrics unavailable, domain timeout, invalid API key, and backend unreachable states.
- Keep API errors safe and useful.
- Keep last-known cached frontend data clearly labeled as stale when live refresh fails.
- Update docs when setup, commands, API endpoints, env vars, or architecture change.
- Run typecheck/build/test where relevant.

## Do Not

- Do not add mobile app code.
- Do not expose Docker socket, SSH, shell access, or privileged controls to the frontend.
- Do not add restart, stop, delete, prune, reboot, exec, or volume actions.
- Do not hardcode private IPs, real domains, API keys, passwords, or infrastructure details.
- Do not commit `.env` files.
- Do not rewrite the whole frontend unnecessarily.
- Do not build Kubernetes, SaaS billing, team accounts, SSH terminal, or enterprise features for v1.

## Known Limits

- SSL expiry is checked for HTTPS domains when certificate metadata is reachable.
- Per-container CPU is not implemented yet.
- Alerts are current-snapshot/in-memory only.
- Server monitor profiles are persisted in `apps/api/data/server-monitors.json`, ignored by git.
- Container monitor profiles are persisted in `apps/api/data/container-monitors.json`, ignored by git.
- User-added domain monitors are persisted in `apps/api/data/domain-monitors.json`, ignored by git.
- Server monitors with an API key check another NodeGuard backend through `/api/overview`; server monitors without an API key check the exact URL entered. Public sites and reverse proxies belong in the Domains screen.
- Full remote metrics aggregation is not implemented yet.
- Dashboard server counts refer to actual hosts. Public websites, internal URLs, and reverse-proxy routes belong in Domains / Services.
- Do not expose NodeGuard publicly without real authentication such as Cloudflare Access, basic auth, VPN-only access, or a proper login layer.
- Legacy Expo files are still present but are not the target application.
