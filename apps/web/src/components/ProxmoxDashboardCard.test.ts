import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readStylesheetSource } from "../test/sourceInspection";
import { getProxmoxDashboardCardView, type ProxmoxSnapshot } from "./ProxmoxIntegration";

const emptySnapshot: ProxmoxSnapshot = {
  configured: false,
  enabledConnections: 0,
  connections: [],
  nodes: [],
  guests: [],
  storage: [],
  summary: {},
};

const configuredSnapshot: ProxmoxSnapshot = {
  ...emptySnapshot,
  configured: true,
  enabledConnections: 1,
  connections: [{
    id: "connection-1",
    name: "Primary cluster",
    endpoint: "https://prox.example.test",
    enabled: true,
    status: "available",
  }],
  summary: {
    enabledConnections: 1,
    availableConnections: 1,
    nodesOnline: 1,
    nodesTotal: 1,
    guestsRunning: 8,
    guestsTotal: 17,
    storageWarnings: 0,
    storageCritical: 0,
    storageUnavailable: 0,
  },
};

test("keeps an explicit fixed card state before and after Proxmox data arrives", () => {
  assert.deepEqual(getProxmoxDashboardCardView({ snapshot: emptySnapshot, loading: true, error: null, hasData: false }), {
    state: "loading",
    value: "—",
    label: "Checking Proxmox",
    primaryDetail: "Loading inventory",
    secondaryDetail: "Updates automatically",
    issueCount: 0,
  });
  assert.equal(getProxmoxDashboardCardView({ snapshot: emptySnapshot, loading: false, error: null, hasData: true }).state, "unconfigured");
  assert.equal(getProxmoxDashboardCardView({ snapshot: { ...configuredSnapshot, enabledConnections: 0 }, loading: false, error: null, hasData: true }).state, "disabled");
  assert.equal(getProxmoxDashboardCardView({ snapshot: configuredSnapshot, loading: false, error: null, hasData: true }).state, "healthy");
});

test("distinguishes unavailable, retained, and issue states without dropping the card", () => {
  assert.equal(getProxmoxDashboardCardView({ snapshot: emptySnapshot, loading: false, error: "offline", hasData: false }).state, "unavailable");
  const retained = getProxmoxDashboardCardView({ snapshot: configuredSnapshot, loading: false, error: "refresh failed", hasData: true });
  assert.equal(retained.state, "stale");
  assert.equal(retained.value, "1/1");
  assert.equal(retained.secondaryDetail, "Refresh failed");
  const warning = getProxmoxDashboardCardView({
    snapshot: { ...configuredSnapshot, summary: { ...configuredSnapshot.summary, nodesOnline: 0 } },
    loading: false,
    error: null,
    hasData: true,
  });
  assert.equal(warning.state, "warning");
  assert.equal(warning.issueCount, 1);
});

test("uses one stable dashboard grid and the shared monitored link in both Proxmox surfaces", () => {
  const integration = readFileSync(new URL("./ProxmoxIntegration.tsx", import.meta.url), "utf8");
  const styles = readStylesheetSource();
  const proxmoxStyles = readFileSync(new URL("../proxmox.css", import.meta.url), "utf8");

  assert.doesNotMatch(styles, /dashboard-metric-grid:(?:not\()?has\(\.proxmox-dashboard-card/);
  assert.match(proxmoxStyles, /\.proxmox-dashboard-card\s*\{[^}]*animation:\s*ngSoftRise 180ms cubic-bezier\(0\.2, 0\.8, 0\.2, 1\) both;/s);
  assert.doesNotMatch(integration, /<a href=\{connection\.endpoint\}/);
  assert.equal((integration.match(/<MonitoredExternalLink/g) ?? []).length, 2);
  assert.match(integration, /aria-busy=\{view\.state === "loading"\}/);
});
