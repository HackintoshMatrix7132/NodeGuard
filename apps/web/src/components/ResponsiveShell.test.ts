import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readAppSource } from "../test/sourceInspection";

const appSource = readAppSource();
const mobileCss = readFileSync(new URL("../mobile.css", import.meta.url), "utf8");
const proxmoxCss = readFileSync(new URL("../proxmox.css", import.meta.url), "utf8");
const controlAlignmentCss = readFileSync(new URL("../styles/control-alignment.css", import.meta.url), "utf8");

test("mobile shell keeps route content in the first flow position", () => {
  assert.match(mobileCss, /\.app-shell\.sidebar-collapsed\s*\{[^}]*display:\s*block/s);
  assert.match(mobileCss, /\.workspace,[\s\S]*?\.app-shell\.sidebar-collapsed \.workspace\s*\{[^}]*grid-area:\s*auto/s);
  assert.match(mobileCss, /min-height:\s*100svh/);
  assert.match(mobileCss, /min-height:\s*100dvh/);
  assert.match(mobileCss, /env\(safe-area-inset-top/);
  assert.match(mobileCss, /env\(safe-area-inset-bottom/);
});

test("mobile navigation is an integrated accessible drawer", () => {
  assert.match(appSource, /workspace-topbar[\s\S]*?className="sidebar-reveal"/);
  assert.match(appSource, /className="sidebar-backdrop"/);
  assert.match(appSource, /aria-modal=\{isMobileNavigation/);
  assert.match(appSource, /inert=\{isMobileNavigation && !sidebarCollapsed/);
  assert.match(appSource, /document\.body\.style\.overflow = "hidden"/);
  assert.match(appSource, /event\.key === "Escape"/);
  assert.match(appSource, /event\.key !== "Tab"/);
  assert.match(mobileCss, /\.sidebar-slot,[\s\S]*?position:\s*fixed/s);
  assert.match(mobileCss, /\.workspace-topbar[\s\S]*?position:\s*sticky/s);
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
