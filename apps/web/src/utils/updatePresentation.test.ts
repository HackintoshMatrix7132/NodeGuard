import assert from "node:assert/strict";
import test from "node:test";

import type { MachineUpdateSummary, UpdateCenterSnapshot } from "../types/nodeguard";
import {
  currentUpdateCoverage,
  formatUpdateCount,
  getMachineUpdateCondition,
  hasRetainedUpdateInventory,
  updateSummaryHasCurrentData,
  updateSummaryUsesRetainedData,
} from "./updatePresentation";

const machine: MachineUpdateSummary = {
  agentId: "agent-test",
  displayName: "Test machine",
  hostname: "test-machine",
  agentStatus: "online",
  provider: "apt",
  supported: true,
  status: "ok",
  freshness: "current",
  os: { id: "debian", versionId: "12", prettyName: "Debian 12" },
  checkedAt: "2026-07-16T08:00:00.000Z",
  lastSuccessfulAt: "2026-07-16T08:00:00.000Z",
  updateCount: 0,
  securityUpdateCount: 0,
  rebootRequired: false,
  truncated: false,
  lastError: null,
  lastErrorCode: null,
};

function snapshot(overrides: Partial<UpdateCenterSnapshot> = {}): UpdateCenterSnapshot {
  return {
    availableCount: null,
    securityCriticalCount: null,
    reportingMachineCount: 0,
    currentReportingMachineCount: 0,
    retainedMachineCount: 0,
    totalMachineCount: 1,
    lastCheckedAt: null,
    lastSuccessfulAt: null,
    summaryState: "waiting",
    machines: [],
    ...overrides,
  };
}

test("nullable totals never become a false zero", () => {
  assert.equal(formatUpdateCount(null), "—");
  assert.equal(formatUpdateCount(undefined), "—");
  assert.equal(formatUpdateCount(0), "0");
  assert.equal(formatUpdateCount(17), "17");
});

test("current coverage remains separate from retained reporting history", () => {
  const retained = snapshot({
    availableCount: 4,
    securityCriticalCount: 1,
    reportingMachineCount: 3,
    currentReportingMachineCount: 2,
    retainedMachineCount: 1,
    totalMachineCount: 4,
    summaryState: "partial",
  });
  assert.equal(currentUpdateCoverage(retained), "2/4");
  assert.equal(updateSummaryHasCurrentData(retained), true);
  assert.equal(updateSummaryUsesRetainedData(retained), true);
  assert.equal(updateSummaryHasCurrentData(snapshot()), false);
});

test("machine conditions distinguish waiting, failures, retained, stale, and current inventories", () => {
  assert.deepEqual(getMachineUpdateCondition({ ...machine, supported: null, status: "waiting", freshness: "waiting", lastSuccessfulAt: null, updateCount: null, securityUpdateCount: null }), { label: "Waiting", tone: "unknown" });
  assert.deepEqual(getMachineUpdateCondition({ ...machine, supported: false, status: "unsupported", freshness: "waiting", lastSuccessfulAt: null, updateCount: null, securityUpdateCount: null }), { label: "Unsupported", tone: "unknown" });
  assert.deepEqual(getMachineUpdateCondition({ ...machine, status: "package_manager_busy", freshness: "waiting", lastSuccessfulAt: null, updateCount: null, securityUpdateCount: null }), { label: "Check delayed", tone: "warning" });
  assert.deepEqual(getMachineUpdateCondition({ ...machine, status: "check_failed", freshness: "waiting", lastSuccessfulAt: null, updateCount: null, securityUpdateCount: null }), { label: "Check failed", tone: "critical" });
  assert.deepEqual(getMachineUpdateCondition({ ...machine, status: "package_manager_busy", freshness: "retained" }), { label: "Check delayed", tone: "warning" });
  assert.deepEqual(getMachineUpdateCondition({ ...machine, status: "check_failed", freshness: "retained" }), { label: "Check failed", tone: "critical" });
  assert.deepEqual(getMachineUpdateCondition({ ...machine, freshness: "stale" }), { label: "Stale data", tone: "unknown" });
  assert.deepEqual(getMachineUpdateCondition({ ...machine, freshness: "retained" }), { label: "Last known", tone: "unknown" });
  assert.deepEqual(getMachineUpdateCondition({ ...machine, updateCount: 2 }), { label: "Updates available", tone: "warning" });
  assert.deepEqual(getMachineUpdateCondition({ ...machine, updateCount: 2, securityUpdateCount: 1 }), { label: "Security updates", tone: "critical" });
  assert.deepEqual(getMachineUpdateCondition(machine), { label: "Up to date", tone: "healthy" });
  assert.equal(hasRetainedUpdateInventory({ ...machine, freshness: "retained" }), true);
  assert.equal(hasRetainedUpdateInventory(machine), false);
});
