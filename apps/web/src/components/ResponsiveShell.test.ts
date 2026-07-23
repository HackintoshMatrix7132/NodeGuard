import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readAppSource } from "../test/sourceInspection";

const appSource = readAppSource();
const mobileCss = readFileSync(new URL("../mobile.css", import.meta.url), "utf8");
const proxmoxCss = readFileSync(new URL("../proxmox.css", import.meta.url), "utf8");
const controlAlignmentCss = readFileSync(new URL("../styles/control-alignment.css", import.meta.url), "utf8");
const sidebarSystemCss = readFileSync(new URL("../styles/sidebar-system.css", import.meta.url), "utf8");
const settingsStoreSource = readFileSync(new URL("../store/settingsStore.ts", import.meta.url), "utf8");

test("desktop shell uses a tooltip-free accessible icon rail with shared width and motion tokens", () => {
  const sidebarToggleMarkup = appSource.match(/<button[\s\S]*?className="sidebar-toggle"[\s\S]*?>/)?.[0] ?? "";

  assert.match(appSource, /sidebar-rail/);
  assert.match(appSource, /aria-label=\{label\}/);
  assert.match(appSource, /className="sidebar-logout" aria-label="Logout"/);
  assert.match(appSource, /sidebarDesktopCollapsed \? "Expand sidebar" : "Collapse sidebar"/);
  assert.doesNotMatch(appSource, /data-tooltip/);
  assert.doesNotMatch(sidebarToggleMarkup, /title=/);
  assert.match(sidebarSystemCss, /--ng-sidebar-expanded-width:\s*238px/);
  assert.match(sidebarSystemCss, /--ng-sidebar-collapsed-width:\s*64px/);
  assert.match(sidebarSystemCss, /--ng-sidebar-motion-duration:\s*200ms/);
  assert.match(sidebarSystemCss, /\.app-shell\.sidebar-rail\s*\{[^}]*grid-template-columns:\s*var\(--ng-sidebar-collapsed-width\)/s);
  assert.match(sidebarSystemCss, /\.sidebar-rail \.sidebar-nav-label,[\s\S]*?width:\s*0[^}]*max-width:\s*0[^}]*visibility:\s*hidden/s);
  assert.doesNotMatch(sidebarSystemCss, /data-tooltip|sidebar-nav-item::after|sidebar-logout::after/);
  assert.match(sidebarSystemCss, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test("narrow navigation is an integrated non-persisted drawer", () => {
  assert.match(appSource, /matchMedia\("\(max-width: 980px\)"\)/);
  assert.match(appSource, /has-navigation-drawer/);
  assert.match(appSource, /navigation-drawer-open/);
  assert.match(appSource, /sidebar\?\.contains\(document\.activeElement\)[\s\S]*?document\.activeElement\.blur\(\)/);
  assert.match(appSource, /workspace-topbar[\s\S]*?className="sidebar-reveal"/);
  assert.match(appSource, /className="sidebar-backdrop"/);
  assert.match(appSource, /aria-modal=\{isNavigationDrawer && isNavigationDrawerOpen/);
  assert.match(appSource, /inert=\{isNavigationDrawer && !isNavigationDrawerOpen/);
  assert.match(appSource, /document\.body\.style\.overflow = "hidden"/);
  assert.match(appSource, /event\.key === "Escape"/);
  assert.match(appSource, /event\.key !== "Tab"/);
  assert.match(sidebarSystemCss, /@media \(max-width:\s*980px\)/);
  assert.match(sidebarSystemCss, /\.app-shell\.has-navigation-drawer \.sidebar-slot\s*\{[^}]*position:\s*fixed/s);
  assert.match(sidebarSystemCss, /\.app-shell\.has-navigation-drawer \.workspace\s*\{[^}]*width:\s*100%/s);
  assert.match(sidebarSystemCss, /env\(safe-area-inset-top/);
  assert.match(sidebarSystemCss, /env\(safe-area-inset-bottom/);
});

test("desktop sidebar preference uses the existing validated settings storage", () => {
  assert.match(settingsStoreSource, /sidebarDesktopCollapsed:\s*boolean/);
  assert.match(settingsStoreSource, /typeof initialPreferences\.sidebarDesktopCollapsed === "boolean"/);
  assert.match(settingsStoreSource, /writePreference\("sidebarDesktopCollapsed", sidebarDesktopCollapsed\)/);
  assert.doesNotMatch(settingsStoreSource, /isNavigationDrawerOpen/);
});

test("major routes and responsive inventories use compact shared variants", () => {
  for (const routeClass of [
    "dashboard-page",
    "machines-page",
    "agents-page",
    "containers-page",
    "domains-page",
    "updates-page",
    "alerts-page",
    "settings-page",
  ]) {
    assert.match(appSource, new RegExp(routeClass));
  }
  assert.match(mobileCss, /\.dashboard-metric-grid[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(mobileCss, /\.alert-mobile-card\s*\{[^}]*padding:\s*6px 7px/s);
  assert.match(proxmoxCss, /\.proxmox-node-table tr,[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(proxmoxCss, /\.proxmox-guest-table/);
});

test("domain row actions use scoped compact desktop and touch dimensions", () => {
  assert.match(controlAlignmentCss, /body \.domain-row-actions\s*\{[^}]*gap:\s*4px/s);
  assert.match(controlAlignmentCss, /body \.domain-row-actions \.domain-details-toggle\s*\{[^}]*height:\s*var\(--ng-icon-control-size\)[^}]*gap:\s*4px[^}]*padding-inline:\s*5px/s);
  assert.match(controlAlignmentCss, /body \.domain-row-actions \.icon-only\s*\{[^}]*width:\s*var\(--ng-icon-control-size\)[^}]*height:\s*var\(--ng-icon-control-size\)/s);
  assert.match(controlAlignmentCss, /@media \(max-width:\s*760px\)[\s\S]*?body \.domain-row-actions \.domain-details-toggle\s*\{[^}]*height:\s*36px[^}]*min-height:\s*36px/s);
});
