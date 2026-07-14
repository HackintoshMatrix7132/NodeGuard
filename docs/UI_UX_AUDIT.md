# NodeGuard final UI/UX audit

## Audit context

- **Audit date:** 2026-07-14
- **Environment:** isolated local NodeGuard API and Vite web app using a temporary SQLite database, fictional Demo Mode inventory, and a temporary local Live account for dialog-only checks. No production data or private infrastructure was read or changed.
- **Browser tooling:** Firefox WebDriver/BiDi was used because Chrome DevTools MCP and Playwright MCP were unavailable. It provided real-browser DOM geometry, computed layout, exact viewport emulation, keyboard input, focus inspection, console/network events, and screenshots.
- **Artifacts:** temporary evidence is under `/tmp/nodeguard-ui-audit-final`, `/tmp/ng-desktop-dense-final`, and `/tmp/nodeguard-final-mobile`. It is intentionally not tracked by Git.
- **Source reviewed:** `AGENTS.md`, README and deployment configuration, app shell/navigation, TanStack Query hooks, shared controls and overlays, global and Proxmox CSS, every page renderer, API Proxmox routing/normalization/encryption, and existing tests.

## Coverage

The login screen and every major authenticated route were browser-reviewed: Dashboard, Server, Proxmox, Agents, Containers, Domains, Updates, Alerts, and Settings. Exercised states included expanded/collapsed/mobile navigation, populated and empty surfaces available in Demo Mode, server history, agent and container detail, expanded domain diagnostics, all alert tabs and alert detail, custom selects, generic dialogs, the complete Proxmox form, validation/error feedback, background-refresh presentation, and logout/login.

The browser automation ran all nine authenticated routes at all seven target viewports (63 route/viewport checks), plus the login screen at all seven sizes.

## Viewport matrix

| Viewport | Final result | Notable coverage |
| --- | --- | --- |
| 1600 × 900 | Pass | Expanded/collapsed shell, full desktop tables, dialogs |
| 1440 × 900 | Pass | Expanded shell; responsive Containers and Alerts cards |
| 1280 × 800 | Pass | Two-column dense cards where tables no longer fit |
| 1024 × 768 | Pass | Expanded shell, dense cards, Proxmox inventory cards/modal |
| 768 × 1024 | Pass | Collapsed tablet shell, single-column secondary panels |
| 390 × 844 | Pass | Phone navigation, dialogs, forms, cards, keyboard flows |
| 360 × 800 | Pass | Small-phone text resilience, controls, tabs, no overflow |

Every final page had `document.scrollWidth === document.clientWidth`. No visible interactive target was outside the viewport. The geometry scanner's only apparent out-of-bounds nodes were intentionally clipped one-pixel Proxmox table headers used by the responsive card presentation; their wrappers and visible rows had no overflow.

## Observed design system

NodeGuard uses a compact dark technical/SaaS language: near-black workspace, slate panels, subdued one-pixel borders, blue/cyan operational emphasis, and status pills that combine text, shape, and color. The observed working scale is:

- spacing primarily at 4, 6, 8, 10, 12, 14, 16, 18, and 24px;
- 11–13px metadata, 14–16px operational text and headings, and large tabular metric values;
- 238px expanded sidebar, 56px collapsed tablet rail, and a non-reserving phone reveal control;
- 6–8px card/control radii with restrained shadows;
- 34–38px compact desktop controls and 44px mobile controls;
- semantic green, amber, red, blue, purple, and neutral status treatments;
- responsive decisions at approximately 460, 640, 760, 820, 980, 1100, 1300, and 1500px;
- short 140–200ms control/overlay transitions with reduced-motion coverage;
- overlay layering at 1200, navigation reveal at 1100, and the skip link at 5000.

The stylesheet contains overlapping historical layers. This pass used bounded overrides and shared patterns instead of attempting a high-risk rewrite.

## Findings and implementation ledger

Completed count: **3 P0, 16 P1, 3 P2**. No known P0 or P1 finding remains open.

| ID | Severity | Page/component | Issue and user impact | Root cause | Implemented fix | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| NG-UI-001 | P0 | Proxmox frontend | Proxmox requests hit the Vite origin and returned 404 in the documented split dev workflow. | The feature bypassed NodeGuard's configured API client. | Routed every Proxmox request through `apiFetch`, preserving credentials, timeout handling, backend configuration, and payloads. | Browser: populated Demo route, no failed requests; typecheck/build pass. |
| NG-UI-002 | P0 | Demo/Live Proxmox boundary | Demo users received 403 instead of the existing fictional snapshot. | The global live guard ran before the read-only Proxmox route. | Mounted authenticated Proxmox reads before the global live guard, retained live-only mutation guards, and made unknown modes fail closed. | API tests cover Demo read, Demo mutation 403, and unknown-mode 403. |
| NG-UI-003 | P1 | Global top bar | Demo displayed contradictory “Demo mode” and “Live” labels and used `<kbd>`. | Badge content was hard-coded. | Added a semantic `Environment · Demo` / `Connected · Live` badge. | All routes in Demo and local Live browser checks. |
| NG-UI-004 | P1 | Shared modal | Generic dialogs were inline, did not lock scroll or close on backdrop, and could overflow short screens. | Older overlay implementation predated the Proxmox dialog. | Portal to `document.body`, body scroll lock/restoration, internal scroll, backdrop/Escape/Cancel close, focus trap/restoration, correct ARIA, and 180ms motion. | Desktop and mobile keyboard/browser checks pass. |
| NG-UI-005 | P1 | Mobile shell/navigation | Navigation consumed most of a phone screen and the closed state reserved a narrow rail. | Desktop/tablet grid behavior survived at phone widths. | Added a full-width closed phone shell, fixed reveal control, route auto-close, `aria-current`, and skip link. | 360/390 keyboard and geometry checks pass. |
| NG-UI-006 | P1 | Alerts responsive view | A 1220px table and tabs forced horizontal panning and hid actions. | No alert card alternative existed. | Added responsive alert cards with the same data/actions, compact tabs, roving keyboard focus, and tabpanel semantics. | 1440/1280/1024/768/390/360 checks; Arrow keys verified. |
| NG-UI-007 | P1 | Shared async state | Loading, empty, and error states shared one warning appearance and inconsistent announcements. | `StateBlock` had one undifferentiated presentation. | Added explicit loading/empty/error tones, icons, and status/alert live semantics. | Source and browser checks across routes. |
| NG-UI-008 | P1 | Dashboard partial data | Failed/loading supplemental queries could appear as healthy zero values, an offline server count inherited a green card, and cached refresh failure was silent. | Undefined query data was normalized to empty collections and the server metric tone was hard-coded. | Added query-specific loading/unavailable states, count-derived server tone, overview-aware fallback tone, and a cached-data refresh notice without inventing timestamps. | Demo route and source-state review; no fake health or freshness values. |
| NG-UI-009 | P1 | Proxmox error state | Request failure appeared beside “not configured,” and raw transport errors could leak host details. | Failure reused an empty snapshot and transport errors were passed through. | Separated unavailable/empty states and normalized network/TLS errors to user-facing guidance. | Browser failure presentation; transport unit tests. |
| NG-UI-010 | P1 | Semantics/keyboard | Pages lacked an H1, current navigation state, complete alert tabs, and safe mobile-card semantics. | Visual hierarchy had incomplete document semantics. | Top-bar H1, `aria-current`, complete tab pattern, explicit card actions, and resource-specific accessible labels. | 63 route checks: one H1/current nav each; keyboard checks pass. |
| NG-UI-011 | P1 | Touch links | External links were hover-only and too small on touch screens. | Precise-pointer reveal behavior applied to coarse pointers. | Made links persistent and enlarged their hit area for coarse/no-hover input. | Phone visible-control/target scan passes. |
| NG-UI-012 | P1 | Motion | Several status and shell effects animated continuously. | Decorative animation layers accumulated over time. | Removed continuous grid/status/sidebar motion, retained short state transitions, and preserved reduced-motion overrides. | CSS/source and browser animation review. |
| NG-UI-013 | P1 | Proxmox inventory/summary | Metrics and timestamps rendered unavailable, identities/details ran together, disabled inventory polluted tables, capacity warnings were absent from summary totals, counts were inaccurate, and multi-cluster IDs could collide. | Backend field names and nested parent context were flattened by type-cast rather than normalized; storage summary ignored the existing warning/critical thresholds; compact details had no flex gap. | Mapped every node/guest/storage field, attached parent identity, composed IDs, filtered enabled inventory, derived complete storage issue counts from the alert thresholds, returned real settings counts, and restored label/value/subtitle/detail hierarchy. | Demo browser visually shows separated details and real CPU/memory/disk/uptime/sync data; threshold unit test, typecheck, and build pass. |
| NG-UI-014 | P1 | Settings / legacy update source | Loading/error could be mistaken for “Not configured”; feedback was not consistently announced. | Query state and data state shared one fallback. | Separated loading/error/configured states and added alert/status semantics. | Settings browser/source review. |
| NG-UI-015 | P1 | Privacy-safe examples | Example UI included deployment-style host naming. | Placeholder text had been copied from a deployment. | Replaced it with neutral `example.com` examples. | Source scan and Demo screenshots. |
| NG-UI-016 | P2 | Dashboard metrics | Six cards could leave an orphan on a second row. | A generic auto-fit grid served unrelated surfaces. | Added bounded Dashboard 6/4/3/2/1 layouts for configured and unconfigured Proxmox states. | Desktop matrix visually checked. |
| NG-UI-017 | P2 | Mobile targets | Login and compact icon/link targets were below the preferred mobile size. | Desktop dimensions survived into phone CSS. | Enlarged mobile targets while retaining compact glyphs. | 360/390 visible-target scan passes. |
| NG-UI-018 | P2 | CSS maintainability | Shell, panel, breakpoint, and motion rules overlap across stylesheet layers. | Multiple historical polish passes appended overrides. | Documented the debt and confined changes to a final owned layer; no risky wholesale rewrite. | Diff review and `git diff --check`. |
| NG-UI-019 | P0 | Integration encryption configuration | A normal `.env.example` deployment could test Proxmox but fail while encrypting a saved connection. | Proxmox crypto did not recognize the project's standard `NODEGUARD_INTEGRATION_SECRET`. | Added the standard secret as a compatibility fallback while preserving existing key priority and documented the optional dedicated key. | Encryption fallback test passes. |
| NG-UI-020 | P1 | Destructive actions | Several deletes were immediate; failed deletes displayed behind the modal. | Shared confirmation/error handling was incomplete. | Added reusable confirmations for server/container/domain/alert deletion and dialog-local error feedback. | Dialog browser checks and source review. |
| NG-UI-021 | P1 | Proxmox dialog mutations | Save/delete controls briefly re-enabled during the exit animation. | Pending state reset before the 170ms unmount. | Keep mutation state busy until successful dialog unmount; failures re-enable controls with an alert. | Source review, typecheck, modal browser checks. |
| NG-UI-022 | P1 | Dense responsive data | Containers/Alerts controls clipped at 1440; other dense tables failed at 1280/1024; Proxmox scrolled at tablet width. | Tables were selected by viewport rather than usable shell content, and card sorting was hidden with the table header. | Use measured card breakpoints, preserve two-column density where space allows, add card-mode container sort/direction controls, and convert Proxmox rows through 1100px. | Every target viewport has no page or visible component overflow. |

## Accessibility findings

Completed improvements include one semantic H1 per page, a skip link, current-page navigation state, keyboard-complete alert tabs, resource-specific action names, visible touch links, explicit async announcements, and accessible destructive confirmations. Both dialog implementations now portal to the body, lock background scroll, trap focus, close by Escape/backdrop/Cancel/close button, and restore focus. The phone navigation is labeled, keyboard reachable, and closes after selection.

Manual keyboard checks covered skip navigation, mobile navigation, alert tabs, custom selects, generic dialogs, and the Proxmox dialog. Automated DOM checks across the final matrix found no visible unnamed button/link and no visible unlabeled input/select/textarea. The mobile target scan found no unexplained sub-24px target; primary phone actions are 44px. Status is communicated with text/shape in addition to color. Reduced-motion styles remain in place.

This is a practical WCAG 2.2 AA-oriented audit, not a claim of formal certification. A maintained axe/browser suite remains recommended.

## Responsive findings

- There is no known document-level horizontal overflow at any target viewport.
- Containers and Alerts use two-column cards at 1440 where the expanded sidebar makes their tables unusable; Agents and Updates retain tables there.
- At 1280 and 1024 all four dense list surfaces use two-column cards. At 820 and below they use one column.
- Proxmox inventory becomes labeled cards through 1100px, avoiding tablet horizontal scrollers while retaining desktop tables.
- Container sorting remains available in card mode.
- Dashboard secondary panels stack at tablet width, preventing clipped reachability statuses.
- The phone shell no longer reserves a navigation rail; long names, image references, URLs, ports, causes, and action rows wrap or truncate with the full value available through title/link context.

## Loading, empty, stale, and error states

First loads use stable state blocks; cached content remains visible during background refetch. Supplemental Dashboard queries no longer imply healthy zeros when unavailable and now disclose failed cached refreshes. Integration surfaces distinguish loading, unavailable, unconfigured, and populated states. Proxmox connection failures are sanitized and actionable. No freshness, uptime, health, or timestamp was invented.

Empty states remain compact and consistent. The Recent Alerts card keeps its unchanged header and stretches the dotted empty state through the remaining body using flex layout. That state was source-verified and compared with the supplied empty-state reference; the isolated live fixture accurately produced an alert and therefore was not manipulated to fabricate a browser-empty result.

## Items intentionally not changed

- Database schema, authentication/session behavior, monitoring/agent protocols, query intervals, legacy update-source semantics, Proxmox token format, credential cryptography, sponsor/payment flow, and existing operational APIs.
- Production data, deployment state, commits, pushes, or deployments.
- URL-backed client routing, a new UI library, a design-system rewrite, and wholesale stylesheet consolidation.
- Destructive mutations were not submitted during browser QA. Their dialogs were fully exercised, while API/unit tests and typechecking cover the changed boundaries.
- The only intentional data-shape additions are accurate Proxmox inventory/storage-issue counts and the existing Demo snapshot marker; they present already-stored information and do not change persistence.

## Remaining recommendations

These are follow-up recommendations, not incomplete acceptance items:

1. Consolidate the historical stylesheet layers after beta, protected by browser regression tests.
2. Add maintained Playwright and axe smoke coverage for route headings, navigation, dialogs, overflow, empty/error states, and keyboard focus.
3. Add deterministic network fixtures for slow first load, cached refetch failure, and every empty state; do not use production monitoring data.
4. Consider URL-backed navigation and keyboard-accessible chart data summaries in a separately scoped change.
5. Review a few remaining legacy desktop-only 18–25px quiet links and >200ms entry/meter transitions during the stylesheet consolidation; touch variants and reduced motion are already safe.

## Verification results

```text
npm run typecheck    PASS
npm run lint         PASS
npm test             PASS — 45 tests
npm run build        PASS
git diff --check     PASS
```

The production build emitted only Rollup's existing informational warnings about TanStack Query's `"use client"` directives being ignored; it completed successfully.

Browser verification:

- 63 authenticated route/viewport checks plus seven login viewport checks;
- zero document-level horizontal overflows;
- zero application console warnings/errors in stable final runs;
- zero failed route requests in stable final runs;
- one visible H1 and correct active navigation state on every authenticated route;
- no visible unnamed controls or unlabeled fields;
- alert keyboard tabs, skip link, mobile navigation, generic dialog, and Proxmox dialog passed;
- expanded and collapsed shell states passed;
- Demo Proxmox read access and populated metrics passed while all mutation/settings boundaries remained Live-only.

Chrome DevTools MCP, Playwright MCP, and an existing frontend axe/E2E project were unavailable, so equivalent Firefox WebDriver checks were used and that limitation is retained in the recommendations.
