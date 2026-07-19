# NodeGuard button, typography, and visual audit

## Executive summary

This focused audit was completed on 2026-07-19 with Chrome DevTools MCP against the local Vite login screen and the authenticated deployment at `https://nodeguard.muthu.eu`. The task fixed the shared action-control scale and the inconsistent application type hierarchy; broader findings were documented for later work rather than folded into this scoped change.

Fourteen findings were recorded: **0 Critical, 3 High, 8 Medium, and 3 Low**. Four findings were fixed in this task. Ten remain as prioritized follow-up or require deterministic test fixtures.

The frontend now uses a shared 32px default action, 30px toolbar action, 32px square icon action, 13px button label, 14px icon, 6px gap, and 6px radius on desktop. Mobile actions remain 34–38px and icon controls 36px to preserve practical touch interaction. The restored login submit remains deliberately unchanged at 44px.

### Sidebar typography follow-up

A focused rendered-sidebar follow-up aligned navigation with the same compact type scale. Before the change, brand text computed to 16px/900 and every navigation/Logout label to 16px/760 with 18px icons, 8px gaps, 38px desktop rows, and 44px phone rows. The final shared sidebar tokens use a 16px/700 brand, 13px/600 inactive labels, 13px/700 active labels, 16px icons, 7px gaps, 34px desktop rows, and 40px phone rows. Active and inactive items retain identical geometry; background, border, cyan inset accent, icon color, and the subtle weight change carry the active hierarchy.

Chrome DevTools MCP verified Dashboard, Machines, Proxmox, Agents, Containers, Domains, Updates, Alerts, Settings, and Logout labels; expanded and collapsed navigation; desktop, tablet, and phone layouts; hover, active, and focus-visible states; accessible current-page indication; zero horizontal overflow; and a clean final console. Collapsed mode intentionally exposes the labeled navigation-reveal control with a shared 12px tooltip because the product uses a closed sidebar, not an icon rail. Focus is released before sidebar visibility changes and restored to the reveal control after closing, preventing focused descendants from being hidden from assistive technology.

### Control-alignment follow-up

A rendered control follow-up found that several 32px actions declared `align-items` and `justify-content` without declaring a flex/grid display. Their 14px Lucide SVGs therefore remained inline and aligned to the text baseline. The isolated Domains `Details` trigger also retained 16px/800 text and an 8px radius, generic panel-hover CSS translated action icons two pixels horizontally, Settings checkbox labels inherited 16px/700 text, and status pills retained 900 weight.

The final shared layer makes text actions `inline-flex`, icon-only actions square `inline-grid` controls, and direct Lucide SVGs fixed 14px block elements. Text, chevrons, and icons use one centered 6px-gap baseline; desktop text actions are 30–32px, icon-only controls are 32px square, compact pills use 11px/700 text, Settings option labels use 13px/600 text, and mobile controls retain 36–38px practical targets. Expanded chevrons keep their existing rotation, while unrelated hover translation is removed from action icons.

## Routes and states inspected

- Login: initial, password visibility control, form fields, and submit control.
- Dashboard: first-load state, populated state, summary grid, Active Issues, Recent Alerts, Domain Reachability, and refresh actions.
- Machines: populated local-machine data, monitor panel, add-machine action, resource sections, and responsive presentation.
- Proxmox: connections, nodes, VM/LXC tabs, guests, storage, refresh/sync actions, populated data, and responsive cards.
- Agents: empty live inventory, toolbar, filters, refresh, add-agent dialog, and responsive empty state.
- Containers: populated table/cards, monitored-container panel, detail view, add-container flow, filters, and responsive states.
- Domains: populated rows/cards, diagnostics expansion, check/add controls, add-domain dialog, and long-page behavior.
- Updates: current empty/waiting live state, search/filter area, and summary presentation.
- Alerts: active empty state, resolved/all populated states, tabs, expanded detail, pagination, and responsive cards.
- Settings: Connection, Monitoring, Integrations, Proxmox configuration, Privacy & Security, Diagnostics, About, actions, labels, values, descriptions, and badges.
- Navigation: expanded, collapsed, and phone reveal behavior.
- Controls: normal, hover, active, focus-visible, disabled, dialog focus, Escape close, and responsive wrapping.

No destructive confirmation was submitted. Slow, stale, offline, unsupported, and request-error variants that were not naturally present were source-reviewed but were not fabricated against live monitoring data.

## Viewport matrix

| Viewport | Coverage | Result |
| --- | --- | --- |
| 1440 × 900 | Full desktop routes, tables, settings typography, representative computed styles | No horizontal page overflow |
| 1024 × 768 | All authenticated routes, responsive tables/cards, controls | No horizontal page overflow or clipped interactive control |
| 768 × 1024 | Tablet shell and all routes | No horizontal page overflow or clipped interactive control |
| 430 × 932 | All routes and phone composition | No horizontal page overflow or clipped interactive control |
| 390 × 844 | All routes, mobile actions, dialog sizing | No horizontal page overflow or clipped interactive control |
| 360 × 800 | Small phone, all routes, add-domain dialog | Dialog fit; no horizontal page overflow or clipped interactive control |

The automated geometry sweep compared `documentElement.scrollWidth` with `clientWidth` and scanned visible buttons, links, inputs, and selects for viewport clipping on every route at each responsive size.

## Finding counts

### By severity

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 3 |
| Medium | 8 |
| Low | 3 |
| **Total** | **14** |

### By primary category

| Category | Count |
| --- | ---: |
| Consistency | 5 |
| Typography | 1 |
| Responsive | 3 |
| Performance | 1 |
| Accessibility | 1 |
| Console/Network | 1 |
| Spacing | 1 |
| Loading | 1 |

## Prioritized issue list

| ID | Route/page | Viewport | Component | State | Severity | Category | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NG-AUD-005 | Shared data layer | 1440 × 900 | Query polling | Populated | High | Performance | Found for later amendment |
| NG-AUD-006 | Proxmox | 360–430px | Guest/storage inventory | Populated | High | Responsive | Found for later amendment |
| NG-AUD-007 | Dashboard | 1440 × 900 | Health/alert summaries | Populated | High | Consistency | Found for later amendment |
| NG-AUD-008 | Login/Settings | Local/live | Form controls | Initial/populated | Medium | Accessibility | Found for later amendment |
| NG-AUD-009 | Shared CSS | All | Historical override layers | All | Medium | Consistency | Found for later amendment |
| NG-AUD-010 | Local development | 1440 × 900 | Vite/API authentication | Login | Medium | Console/Network | Found for later amendment |
| NG-AUD-011 | Domains | 390 × 844 | Domain inventory | Populated | Medium | Responsive | Found for later amendment |
| NG-AUD-012 | Machines | 390 × 844 | Machine detail | Populated | Medium | Responsive | Found for later amendment |
| NG-AUD-014 | Shared states | All | Loading/error fixtures | Non-populated | Medium | Loading | Unable to verify fully |
| NG-AUD-013 | Settings | 390 × 844 | Page composition | Populated | Low | Spacing | Found for later amendment |

## Fixed in this task

### NG-AUD-001 — Shared action buttons were visually oversized

- **Route/page:** Dashboard, Machines, Agents, Containers, Domains, Settings
- **Viewport:** 1440 × 900
- **Component/state:** Primary, secondary, panel-header, and diagnostic actions; normal state
- **Severity/category:** Medium / Consistency
- **What was wrong:** Representative actions used 16px/800 text with differing padding and radius, making compact 32px controls look heavier than surrounding panels.
- **Why it matters:** Actions dominated headers and slowed scanning across information-dense pages.
- **Likely source:** `apps/web/src/styles.css`
- **Fix:** Added shared action tokens and normalized default, toolbar, danger, ghost, link-action, and icon-only sizing.
- **Evidence:** Before: `Test connection` and `Export diagnostics` were 32px high with 16px/800 text and 8px radius. After: 32px or 30px as appropriate, 13px/700, 4px 10px padding, 6px radius, 6px gap.

### NG-AUD-002 — Settings typography hierarchy was inconsistent

- **Route/page:** Settings
- **Viewport:** 1440 × 900
- **Component/state:** Section headings and helper descriptions; populated
- **Severity/category:** Medium / Typography
- **What was wrong:** `Integrations` rendered at 19.2px with 24px line height while equivalent headings rendered at 14px/16.8px. Its description was 16px/24px while equivalent helpers were 12px/15.6px.
- **Why it matters:** One section appeared to be a different hierarchy level and made the page visually uneven.
- **Likely source:** shared and Proxmox-specific heading selectors in `apps/web/src/styles.css` and `apps/web/src/proxmox.css`
- **Fix:** Standardized page titles, panel/section headings, card titles, labels, values, helpers, table text, and badges through shared tokens.
- **Evidence:** After: Connection, Monitoring, Integrations, Privacy & Security, Diagnostics, and About NodeGuard all compute to 14px/700 with 16.8px line height.

### NG-AUD-003 — Equivalent icons and text were not proportionally aligned

- **Route/page:** All action-bearing routes
- **Viewport:** Desktop and mobile
- **Component/state:** Text buttons and icon-only actions; normal/disabled
- **Severity/category:** Low / Consistency
- **What was wrong:** Equivalent Lucide icons inherited different 15–17px sizes and gaps from page-level rules.
- **Why it matters:** Misaligned icon weight made control groups look assembled from different systems.
- **Likely source:** `apps/web/src/styles.css`, `apps/web/src/proxmox.css`
- **Fix:** Shared 14px action icons, 6px icon gap, square 32px desktop icon buttons, square 36px mobile icon buttons, and consistent disabled opacity.
- **Evidence:** Dashboard Refresh now computes to 32px high, 14px icon, and 6px gap; Proxmox Refresh matches the same scale.

### NG-AUD-004 — Link actions could be larger than neighboring buttons

- **Route/page:** Settings/About and shared external actions
- **Viewport:** 1440 × 900
- **Component/state:** Secondary link actions; normal
- **Severity/category:** Low / Consistency
- **What was wrong:** Anchor-based actions inherited different padding from About-specific rules.
- **Why it matters:** Controls with the same visual purpose did not align in a shared action row.
- **Likely source:** `apps/web/src/styles.css`
- **Fix:** Applied the shared button geometry to button and anchor variants while retaining external-link semantics and focus behavior.
- **Evidence:** Shared secondary actions use the same 32px geometry, 13px label, 14px icon, 6px gap, and 6px radius.

## Found for later amendment

### NG-AUD-005 — Background polling generates many repeated requests

- **Route/page:** Dashboard, Machines, Agents, Alerts
- **Viewport:** 1440 × 900
- **Component/state:** TanStack Query polling; populated
- **Severity/category:** High / Performance
- **What is wrong:** The DevTools network log recorded repeated overview, machine, domain, container, agent, alert-list, and open alert-detail requests; many returned 304 and several resource groups repeated at short intervals.
- **Why it matters:** This increases backend/network work and makes duplicate-request or refresh flicker defects harder to distinguish.
- **Likely source:** refresh-interval/query configuration in `apps/web/src/App.tsx`
- **Suggested fix:** Inventory query ownership, deduplicate shared keys, pause detail polling when hidden, and enforce a sensible minimum interval while preserving user-configured freshness.
- **Evidence:** Request sequence included `/api/agents` repeatedly from request IDs 175–203 and repeated `/api/alerts?status=all` plus the open alert-detail endpoint from 220 onward.

### NG-AUD-006 — Proxmox inventory remains extremely long on phones

- **Route/page:** Proxmox
- **Viewport:** 360 × 800, 390 × 844, 430 × 932
- **Component/state:** Nodes, guests, and storage; populated
- **Severity/category:** High / Responsive
- **What is wrong:** Responsive cards prevent horizontal overflow but produce a document height of approximately 6,864–6,925px for the current inventory.
- **Why it matters:** Finding a guest or storage entry requires excessive scrolling and loses cluster context.
- **Likely source:** `apps/web/src/components/ProxmoxIntegration.tsx`, `apps/web/src/proxmox.css`
- **Suggested fix:** Add client-side search, bounded paging or progressive disclosure per node/type, and sticky compact filters without hiding operational status.
- **Evidence:** DevTools geometry sweep measured 6,908px at 390 × 844 and 6,925px at 360 × 800, with zero horizontal overflow.

### NG-AUD-007 — Dashboard summary signals can conflict

- **Route/page:** Dashboard
- **Viewport:** 1440 × 900
- **Component/state:** Overall health, Active Issues, Critical Alerts; populated
- **Severity/category:** High / Consistency
- **What is wrong:** The audited live state displayed Critical overall health while Active Issues reported none and the Critical Alerts summary showed a non-zero historical count.
- **Why it matters:** Operators cannot tell whether the dashboard is describing active incidents, retained history, or infrastructure health.
- **Likely source:** dashboard presentation/aggregation in `apps/web/src/App.tsx` and returned overview semantics
- **Suggested fix:** Label historical counts explicitly and make the overall-health explanation identify the active condition that drives it. Any aggregation-contract change needs separate backend/API scope.
- **Evidence:** Direct visual comparison of the three simultaneously visible dashboard surfaces.

### NG-AUD-008 — Some form controls lack `id` or `name`

- **Route/page:** Login and Settings
- **Viewport:** Local login and authenticated live settings
- **Component/state:** Text/select controls; initial/populated
- **Severity/category:** Medium / Accessibility
- **What is wrong:** Chrome reported form-field issues for two login fields locally and twelve controls across the preserved navigation session.
- **Why it matters:** Labels may still work by nesting, but missing stable form metadata weakens autofill, diagnostics, and automated accessibility tooling.
- **Likely source:** form markup in `apps/web/src/App.tsx` and `apps/web/src/components/ProxmoxIntegration.tsx`
- **Suggested fix:** Add unique `id`/`name` pairs and explicit `htmlFor` without changing submitted payloads.
- **Evidence:** Chrome DevTools Issues: “A form field element should have an id or name attribute.”

### NG-AUD-009 — Historical CSS layers create specificity drift

- **Route/page:** Shared
- **Viewport:** All
- **Component/state:** Buttons, responsive rules, and typography; all
- **Severity/category:** Medium / Consistency
- **What is wrong:** Repeated late stylesheet layers and page-specific selectors can override shared component intent; the Agents primary action was a concrete example before the final specificity-safe shared layer.
- **Why it matters:** Small UI changes require broader regression checking and equivalent controls can diverge silently.
- **Likely source:** `apps/web/src/styles.css`, `apps/web/src/proxmox.css`
- **Suggested fix:** In a separate refactor, consolidate control, type, and responsive layers behind visual regression tests.
- **Evidence:** Source inspection plus computed-style comparison across Dashboard, Agents, Settings, and Proxmox.

### NG-AUD-010 — Authenticated split-development audit is blocked by origin configuration

- **Route/page:** Local development login
- **Viewport:** 1440 × 900
- **Component/state:** Vite frontend to local API; login
- **Severity/category:** Medium / Console/Network
- **What is wrong:** The MCP browser could open the local Vite app but login requests from both loopback and LAN Vite origins were rejected by CORS in this environment.
- **Why it matters:** It prevents an authenticated rendered audit of the split local workflow unless the local API is configured with the exact audit origin.
- **Likely source:** local environment `ALLOWED_ORIGINS`, not the frontend implementation
- **Suggested fix:** Document or script an audit-specific safe local origin configuration; do not weaken production CORS.
- **Evidence:** `POST http://127.0.0.1:3000/api/auth/login` and the LAN equivalent failed with a missing `Access-Control-Allow-Origin` response.

### NG-AUD-011 — Populated Domains remains long on phones

- **Route/page:** Domains
- **Viewport:** 390 × 844
- **Component/state:** Domain cards; populated
- **Severity/category:** Medium / Responsive
- **What is wrong:** The current inventory produces a page around 1,535px tall even before expanding diagnostics.
- **Why it matters:** Reaching a later service or its actions takes substantially more navigation than desktop scanning.
- **Likely source:** domain mobile-card composition in `apps/web/src/App.tsx` and `apps/web/src/styles.css`
- **Suggested fix:** Add a compact search/filter row and consider collapsible secondary diagnostics metadata.
- **Evidence:** DevTools geometry at 390 × 844: 0px horizontal overflow, 1,535px document height.

### NG-AUD-012 — Machine detail remains long on small phones

- **Route/page:** Machines
- **Viewport:** 390 × 844 and 360 × 800
- **Component/state:** Local machine details; populated
- **Severity/category:** Medium / Responsive
- **What is wrong:** The system/resource/detail composition measured approximately 1,669px tall on both small-phone widths.
- **Why it matters:** Important runtime sections are separated by more scrolling than the compact desktop hierarchy implies.
- **Likely source:** machine detail composition in `apps/web/src/App.tsx` and mobile rules in `apps/web/src/styles.css`
- **Suggested fix:** Group secondary key/value fields into denser two-column definition grids and collapse optional history controls until selected.
- **Evidence:** DevTools route/viewport geometry sweep.

### NG-AUD-013 — Settings can still be shortened on phones

- **Route/page:** Settings
- **Viewport:** 390 × 844
- **Component/state:** All settings sections; populated
- **Severity/category:** Low / Spacing
- **What is wrong:** Typography is now consistent, but the live settings page remains approximately 1,416px tall at 390px.
- **Why it matters:** The most frequently inspected connection and integration status is concise, while lower secondary sections still require a long traversal.
- **Likely source:** settings section composition in `apps/web/src/App.tsx` and `apps/web/src/styles.css`
- **Suggested fix:** Consider disclosure for About/Diagnostics details and align more read-only key/value pairs in two columns.
- **Evidence:** DevTools geometry sweep at 390 × 844.

## Unable to verify fully

### NG-AUD-014 — Complete deterministic non-populated state matrix

- **Route/page:** All data routes
- **Viewport:** All
- **Component/state:** Slow first load, cached refresh failure, stale, offline, unsupported, and empty variants
- **Severity/category:** Medium / Loading
- **What is wrong:** Source and naturally occurring live states were inspected, but production data was not manipulated and Chrome request interception fixtures were not available in the project.
- **Why it matters:** Visual regressions can hide in rare state combinations even when populated layouts pass.
- **Likely source:** shared state blocks and per-route query render branches in `apps/web/src/App.tsx`
- **Suggested fix:** Add safe deterministic frontend fixtures or an E2E test mode for state variants, including slow and failed background refetch while retaining cached data.
- **Evidence:** Naturally available loading, empty, populated, and detail states passed; the remaining variants were source-reviewed only.

## Page-by-page findings

- **Login:** Retains its intentionally roomier 44px submit control; local authentication was blocked only by environment CORS. Form metadata warning remains.
- **Dashboard:** Header/panel actions now align with 30–32px controls. Health-history semantics need follow-up.
- **Machines:** Add-machine action follows the shared primary scale; the mobile detail is still long.
- **Proxmox:** Buttons and headings now match the shared system. The populated phone inventory needs navigation/paging rather than further font reduction.
- **Agents:** Toolbar actions and icon controls share the standard geometry; the live empty state was concise.
- **Containers:** Add/filter/detail actions remain aligned and the responsive layout produced no page overflow.
- **Domains:** Check/Add actions align; populated phone pages would benefit from search/filtering.
- **Updates:** Shared headings, labels, filters, and action typography are consistent in the available state.
- **Alerts:** Tabs, icon controls, detail actions, and pagination remain readable with no horizontal overflow; repeated polling should be reviewed.
- **Settings:** All six major headings now share the same computed typography, and Test connection/Export diagnostics/Proxmox actions follow the compact action scale.

## Shared-system findings

The new tokens define page, section, card, body, label, helper, button, and badge text roles plus default, compact, icon, gap, padding, and radius action geometry. Primary, secondary, ghost, danger, icon-only, and compact toolbar roles now share sizing while retaining their existing colors, borders, hover, focus, active, disabled, and loading semantics.

The current CSS remains intentionally additive because a wholesale rewrite would be out of scope and high risk. NG-AUD-009 tracks consolidation work.

## Mobile-specific findings

All audited routes passed the page-overflow and visible-control clipping checks at 430, 390, and 360px. Action groups wrap without page overflow, dialogs fit short phone viewports, and buttons do not grow from inconsistent font metrics. Practical touch sizing is retained rather than reducing every mobile action to its desktop height.

The largest remaining mobile opportunities are navigation within populated Proxmox inventory and denser progressive disclosure for Machines, Domains, and lower-priority Settings sections.

## Accessibility findings

Keyboard-visible focus styles were preserved. The add-domain dialog focused its first input, locked body scrolling, fit within 360 × 800, closed with Escape, and released the body lock. Icon-only controls retained accessible names in the accessibility tree. Status remains expressed with text as well as color. NG-AUD-008 records the remaining form-metadata warning.

## Console and network findings

The stable deployed UI produced no uncaught application exception during route traversal. Local login attempts produced expected CORS errors because the isolated MCP origin was not allowed. The network audit exposed the repeated polling described in NG-AUD-005; ordinary deployed API requests otherwise returned successful 200/304 responses during inspection.

## Recommended amendment order

1. Reconcile Dashboard active-versus-historical health language (NG-AUD-007).
2. Audit and deduplicate query polling ownership (NG-AUD-005).
3. Add Proxmox search/paging or progressive disclosure (NG-AUD-006).
4. Add deterministic state fixtures for slow/error/stale/offline/unsupported rendering (NG-AUD-014).
5. Add missing form `id`/`name` metadata (NG-AUD-008).
6. Improve phone navigation within Machines and Domains (NG-AUD-011/012).
7. Consolidate historical stylesheet layers behind visual tests (NG-AUD-009).
8. Document an audit-safe split-development CORS setup (NG-AUD-010).
9. Apply optional disclosure to secondary Settings content (NG-AUD-013).

## Items not inspected and why

- Destructive actions were opened only to their confirmation boundary and were not submitted against live data.
- Rare stale/offline/unsupported/error combinations not naturally present were not fabricated against production monitoring state.
- Authenticated local routes could not be rendered through the isolated Chrome MCP browser because the audit origin was not in local API CORS; equivalent authenticated checks were performed against the deployed application after the same frontend build was deployed.
- Tooltip positioning was sampled through accessible names/title behavior, but every browser-native tooltip was not screenshot-captured because native tooltip timing is not exposed reliably through the MCP accessibility snapshot.

## Representative computed-style comparison

| Control/type role | Before | After |
| --- | --- | --- |
| Test connection | 32px; 16px/800; 4px 8px; 8px radius | 30px toolbar action; 13px/700; 4px 10px; 6px radius |
| Export diagnostics | 32px; 16px/800; 4px 8px; 8px radius | 32px; 13px/700; 4px 10px; 6px radius |
| Dashboard Refresh | 32px; 16px/800; 17px icon; 8px gap | 32px; 13px/700; 14px icon; 6px gap |
| View details / Open | 32px; 16px/800; 8px radius | 30px; 13px/700; 6px radius |
| Add machine/agent/container/domain | 32px; visually heavy 16px/800 baseline | 32px; 13px/700; 14px icon; consistent padding/gap/radius |
| Domains Details trigger | 32px; 16px/800; normal line-height; 8px radius | 32px; 13px/700/1; inline-flex; 14px centered chevron; 6px radius |
| Domain icon-only actions | 32px square; 14px SVG but generic hover translated it 2px | 32px square; centered grid; 14px block SVG; no positional hover drift |
| Healthy/status pill | 21px; 11px/900 | 20px minimum; 11px/700/1; centered compact padding |
| Settings option label | 16px/700 inherited text | 13px/600/1.3 shared label hierarchy |
| Settings section headings | Integrations 19.2px/24px; peers 14px/16px | All 14px/700 with 16.8px line height |
| Settings helper text | Integrations 16px/24px; peers 12px/15.6px | Shared muted 12px/1.35 hierarchy |
| Login submit | 44px | 44px, intentionally unchanged |

## Validation summary

- `npm run typecheck --workspace apps/web` — pass.
- `npm run lint --workspace apps/web` — pass.
- `npm test --workspace apps/web` — pass, 11 tests.
- `npm test` in the project Node 22 container — pass, 100 tests total (89 API + 11 web); the host Node 24 runtime cannot load the Node 22 `better-sqlite3` binary.
- `npm run build --workspace apps/web -- --outDir /tmp/nodeguard-web-icon-alignment` — pass.
- Docker production build — pass; existing Rollup informational notices about TanStack Query `use client` directives only.
- Deployed container health check and `https://nodeguard.muthu.eu` HTTP check — pass.
- Chrome DevTools MCP post-deployment sweep — pass across all nine authenticated routes at 1440 × 900, 1024 × 768, 768 × 1024, 430 × 932, 390 × 844, and 360 × 800; zero horizontal page overflow, zero clipped visible controls, and zero vertical-center delta for direct action icons.
