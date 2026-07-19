import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProxmoxNodeDetail, ProxmoxNodeHistory } from "../types/nodeguard";
import { parseProxmoxNodeLocation, proxmoxNodePath } from "../utils/proxmoxNodeRoute";
import {
  filterProxmoxGuests,
  getProxmoxStatusPresentation,
  GuestsTable,
  NodesTable,
  nextProxmoxNodeTab,
  PROXMOX_NODE_HISTORY_RANGES,
  ProxmoxNodeHistoryView,
  ProxmoxNodeOverview,
  StatusBadge,
  type ProxmoxGuest,
} from "./ProxmoxIntegration";

const detail: ProxmoxNodeDetail = {
  connectionId: "connection-a",
  connectionName: "Primary cluster",
  connectionStatus: "available",
  displayName: "pve-a",
  node: "pve-a",
  status: "online",
  uptimeSeconds: 3600,
  lastSyncAt: "2026-07-19T12:00:00.000Z",
  lastTelemetryAt: "2026-07-19T12:00:00.000Z",
  stale: false,
  platform: { pveVersion: "8.3.2", kernelVersion: null, cluster: "Core cluster", connection: "Primary cluster" },
  hardware: { cpuModel: "Example CPU", cpuCores: 8, cpuSockets: 1, architecture: "x86_64" },
  memory: { usagePercent: 50, usedBytes: 50, totalBytes: 100, freeBytes: 40, reclaimableBytes: null },
  storage: { usagePercent: 20, usedBytes: 20, totalBytes: 100, freeBytes: 80, readBytesPerSecond: 1000, writeBytesPerSecond: 500 },
  telemetry: { networkInBytesPerSecond: 1000, networkOutBytesPerSecond: 500, source: "Proxmox API / RRD", state: "available" },
  thermals: { sensors: [], lastUpdatedAt: null },
};

const history: ProxmoxNodeHistory = {
  connectionId: "connection-a",
  node: "pve-a",
  range: "24h",
  sourceTimeframe: "day",
  from: "2026-07-18T12:00:00.000Z",
  to: "2026-07-19T12:00:00.000Z",
  fetchedAt: "2026-07-19T12:00:00.000Z",
  stale: false,
  availableMetrics: { utilization: true, network: true, disk: true, thermals: false },
  points: [
    {
      timestamp: "2026-07-18T12:00:00.000Z",
      cpuUsagePercent: 20,
      memoryUsagePercent: 50,
      rootUsagePercent: 30,
      networkInBytesPerSecond: 1000,
      networkOutBytesPerSecond: 500,
      diskReadBytesPerSecond: 800,
      diskWriteBytesPerSecond: 400,
      temperaturesCelsius: {},
    },
    {
      timestamp: "2026-07-19T12:00:00.000Z",
      cpuUsagePercent: 30,
      memoryUsagePercent: 52,
      rootUsagePercent: 31,
      networkInBytesPerSecond: 1200,
      networkOutBytesPerSecond: 600,
      diskReadBytesPerSecond: 900,
      diskWriteBytesPerSecond: 450,
      temperaturesCelsius: {},
    },
  ],
};

test("each Proxmox node row exposes a compact accessible view action", () => {
  const markup = renderToStaticMarkup(createElement(NodesTable, {
    nodes: [{
      id: "connection-a:node/pve-a",
      connectionId: "connection-a",
      connectionName: "Primary cluster",
      node: "pve-a",
      status: "online",
    }],
  }));
  assert.match(markup, /aria-label="View details for pve-a"/);
  assert.match(markup, /title="View node details"/);
  assert.match(markup, /data-label="Actions"/);
  assert.match(markup, /proxmox-node-table/);
});

test("Proxmox guest statuses use normalized shared semantic badge variants", () => {
  assert.deepEqual(getProxmoxStatusPresentation(" RUNNING "), {
    normalized: "running",
    label: "Running",
    tone: "success",
  });
  assert.deepEqual(getProxmoxStatusPresentation("Stopped"), {
    normalized: "stopped",
    label: "Stopped",
    tone: "danger",
  });
  assert.equal(getProxmoxStatusPresentation("unexpected-state").tone, "neutral");
  assert.equal(getProxmoxStatusPresentation(null).normalized, "unknown");

  const running = renderToStaticMarkup(createElement(StatusBadge, { status: "RUNNING" }));
  const stopped = renderToStaticMarkup(createElement(StatusBadge, { status: "stopped" }));
  assert.match(running, /class="proxmox-status proxmox-status--success"/);
  assert.match(running, /data-status="running"/);
  assert.match(running, />Running<\/span>/);
  assert.match(stopped, /class="proxmox-status proxmox-status--danger"/);
  assert.match(stopped, /data-status="stopped"/);
  assert.match(stopped, />Stopped<\/span>/);
});

test("VM and LXC rows share guest status styling and retain functional filters", () => {
  const guests: ProxmoxGuest[] = [
    { connectionId: "connection-a", connectionName: "Primary", kind: "qemu", vmid: 100, name: "VM running", status: "RUNNING" as ProxmoxGuest["status"] },
    { connectionId: "connection-a", connectionName: "Primary", kind: "qemu", vmid: 101, name: "VM stopped", status: "stopped" },
    { connectionId: "connection-a", connectionName: "Primary", kind: "lxc", vmid: 200, name: "LXC running", status: "running" },
    { connectionId: "connection-a", connectionName: "Primary", kind: "lxc", vmid: 201, name: "LXC stopped", status: "STOPPED" as ProxmoxGuest["status"] },
  ];

  assert.deepEqual(filterProxmoxGuests(guests, "qemu", "running").map((guest) => guest.name), ["VM running"]);
  assert.deepEqual(filterProxmoxGuests(guests, "lxc", "stopped").map((guest) => guest.name), ["LXC stopped"]);
  assert.equal(filterProxmoxGuests(guests, "all", "running").length, 2);
  assert.equal(filterProxmoxGuests(guests, "all", "stopped").length, 2);

  const markup = renderToStaticMarkup(createElement(GuestsTable, { guests }));
  assert.match(markup, /proxmox-guest-table/);
  assert.match(markup, /VM running/);
  assert.match(markup, /LXC running/);
  assert.equal((markup.match(/proxmox-status--success/g) ?? []).length, 2);
  assert.equal((markup.match(/proxmox-status--danger/g) ?? []).length, 2);

  const css = readFileSync(new URL("../proxmox.css", import.meta.url), "utf8");
  assert.match(css, /\.proxmox-status--success/);
  assert.match(css, /\.proxmox-status--danger/);
  assert.match(css, /\.proxmox-status\s*\{[^}]*min-height:\s*1\.6rem/s);
});

test("node detail routes encode identifiers and support direct history loading", () => {
  assert.equal(proxmoxNodePath({ connectionId: "connection a", node: "pve/a", tab: "history", range: "90d" }), "/proxmox/nodes/connection%20a/pve%2Fa?tab=history&range=90d");
  assert.deepEqual(parseProxmoxNodeLocation({ pathname: "/proxmox/nodes/connection-a/pve-a", search: "?tab=history&range=12h" } as Location), {
    connectionId: "connection-a",
    node: "pve-a",
    tab: "history",
    range: "12h",
  });
  assert.equal(parseProxmoxNodeLocation({ pathname: "/proxmox/nodes/bad", search: "" } as Location), null);
});

test("Overview renders all required groups and explicit Not available values", () => {
  const markup = renderToStaticMarkup(createElement(ProxmoxNodeOverview, { detail }));
  for (const heading of ["System", "Platform", "Hardware", "Memory", "Storage", "Telemetry", "Thermals"]) {
    assert.match(markup, new RegExp(`>${heading}<`));
  }
  assert.match(markup, /Reclaimable \/ cache/);
  assert.match(markup, /Not available/);
  assert.match(markup, /Temperature telemetry is not exposed by this node/);
  assert.match(markup, /role="progressbar"/);
  assert.match(markup, /50\.0 B \/ 100\.0 B/);
  assert.match(markup, /title="Example CPU"/);
  assert.match(markup, /title="Primary cluster"/);
});

test("History exposes all seven ranges, responsive accessible charts, and thermal no-data state", () => {
  assert.deepEqual(PROXMOX_NODE_HISTORY_RANGES.map((item) => item.value), ["1h", "6h", "12h", "24h", "7d", "30d", "90d"]);
  const markup = renderToStaticMarkup(createElement(ProxmoxNodeHistoryView, { history }));
  for (const heading of ["Utilization", "Network I/O", "Disk I/O", "Thermals"]) {
    assert.match(markup, new RegExp(`>${heading}<`));
  }
  assert.match(markup, /tabindex="0"/i);
  assert.match(markup, /Use left and right arrow keys/);
  assert.match(markup, /Temperature history is not exposed by this node/);
  assert.match(markup, /Selected sample/);
  assert.match(markup, /proxmox-history-chart-card--unavailable/);

  const css = readFileSync(new URL("../proxmox.css", import.meta.url), "utf8");
  assert.match(css, /\.proxmox-node-history-grid/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /overflow: hidden/);
  assert.match(css, /grid-template-columns: repeat\(12/);
  assert.match(css, /height: 226px/);
  assert.doesNotMatch(css, /var\(--proxmox-(?:border|panel|text|muted)\)/);
});

test("node tabs use roving keyboard navigation", () => {
  assert.equal(nextProxmoxNodeTab("overview", "ArrowRight"), "history");
  assert.equal(nextProxmoxNodeTab("history", "ArrowLeft"), "overview");
  assert.equal(nextProxmoxNodeTab("history", "Home"), "overview");
  assert.equal(nextProxmoxNodeTab("overview", "End"), "history");
  assert.equal(nextProxmoxNodeTab("overview", "Enter"), null);

  const source = readFileSync(new URL("./ProxmoxIntegration.tsx", import.meta.url), "utf8");
  assert.match(source, /tabIndex=\{tab === value \? 0 : -1\}/);
  assert.match(source, /ProxmoxNodeSkeleton view=\{tab\}/);
  assert.match(source, /History unavailable/);
  assert.match(source, /Showing the last available history/);
});
