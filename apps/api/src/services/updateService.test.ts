import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.DATABASE_URL = ":memory:";

const agentService = await import("./agentService.js");
const updateService = await import("./updateService.js");
const { parseAgentUpdates } = await import("./agentValidation.js");
const { getDatabase } = await import("./database.js");

function register(displayName: string, hostname: string) {
  const enrollment = agentService.createAgentEnrollmentToken(displayName);
  return agentService.registerAgent({
    enrollmentToken: enrollment.token,
    machineIdentity: crypto.randomUUID(),
    replaceExisting: false,
    hostname,
    agentVersion: "0.2.0",
    osName: "Debian GNU/Linux",
    osVersion: "12",
    kernel: "6.1.0-test",
    architecture: "amd64"
  });
}

function payload(checkedAt: string, overrides: Record<string, unknown> = {}) {
  return parseAgentUpdates({
    schemaVersion: 1,
    provider: "apt",
    supported: true,
    status: "ok",
    os: { id: "debian", versionId: "12", prettyName: "Debian GNU/Linux 12" },
    checkedAt,
    lastSuccessfulAt: checkedAt,
    updateCount: 2,
    securityUpdateCount: 1,
    rebootRequired: false,
    truncated: false,
    packages: [
      { name: "curl", installedVersion: "8.0.0-1", candidateVersion: "8.0.0-2", security: false, source: "bookworm-updates" },
      { name: "openssl", installedVersion: "3.0.0-1", candidateVersion: "3.0.0-2", security: true, source: "bookworm-security" }
    ],
    ...overrides
  });
}

test("machine update inventories are bounded, transactional, idempotent, and preserve last successful data", async (context) => {
  const first = register("NodeGuard machine", "nodeguard-test");
  agentService.recordAgentHeartbeat(first.agentId, {
    agentId: first.agentId,
    agentVersion: "0.2.0",
    processUptimeSeconds: 30,
    timestamp: new Date().toISOString()
  });
  assert.equal(first.updateIntervalSeconds, 21600);

  const firstCheck = new Date().toISOString();
  await context.test("stores one latest package inventory and exposes global totals", () => {
    assert.equal(updateService.recordAgentUpdates(first.agentId, payload(firstCheck)).accepted, true);
    assert.equal(updateService.recordAgentUpdates(first.agentId, payload(firstCheck)).accepted, false);

    const detail = updateService.getMachineUpdateDetail(first.agentId);
    assert.equal(detail?.updateCount, 2);
    assert.equal(detail?.securityUpdateCount, 1);
    assert.deepEqual(detail?.packages.map((entry) => entry.name), ["openssl", "curl"]);
    assert.equal((getDatabase().prepare("SELECT COUNT(*) AS count FROM agent_package_updates WHERE agent_id = ?").get(first.agentId) as { count: number }).count, 2);

    const snapshot = updateService.getUpdateCenterSnapshot();
    assert.equal(snapshot.availableCount, 2);
    assert.equal(snapshot.securityCriticalCount, 1);
    assert.equal(snapshot.reportingMachineCount, 1);
    assert.equal(snapshot.totalMachineCount, 1);
    assert.equal(snapshot.lastCheckedAt, firstCheck);
    assert.deepEqual(updateService.getUpdateAlerts().map((alert) => alert.count), [1, 1]);
  });

  await context.test("a newer failed check retains successful counts and package rows", () => {
    const failedAt = new Date(Date.parse(firstCheck) + 1000).toISOString();
    const failed = payload(failedAt, {
      status: "package_manager_busy",
      lastSuccessfulAt: firstCheck,
      updateCount: 0,
      securityUpdateCount: 0,
      rebootRequired: null,
      truncated: false,
      packages: []
    });
    assert.equal(updateService.recordAgentUpdates(first.agentId, failed).accepted, true);
    const detail = updateService.getMachineUpdateDetail(first.agentId);
    assert.equal(detail?.status, "package_manager_busy");
    assert.equal(detail?.checkedAt, failedAt);
    assert.equal(detail?.lastSuccessfulAt, firstCheck);
    assert.equal(detail?.updateCount, 2);
    assert.equal(detail?.packages.length, 2);
    assert.match(detail?.lastError ?? "", /package manager is currently busy/i);
    assert.equal(updateService.recordAgentUpdates(first.agentId, payload(firstCheck)).accepted, false);

    const snapshot = updateService.getUpdateCenterSnapshot();
    assert.equal(snapshot.availableCount, 0);
    assert.equal(snapshot.securityCriticalCount, 0);
    assert.equal(snapshot.reportingMachineCount, 0);
    assert.equal(snapshot.totalMachineCount, 1);
    assert.equal(snapshot.lastCheckedAt, null);
    assert.deepEqual(updateService.getUpdateAlerts(), []);
  });

  const unsupported = register("Appliance", "appliance-test");
  const waiting = register("Waiting machine", "waiting-test");
  const offline = register("Offline cached machine", "offline-test");
  const stale = register("Stale cached machine", "stale-test");

  await context.test("unsupported, waiting, offline, and stale Agents remain explicit without invented current totals", () => {
    const checkedAt = new Date(Date.parse(firstCheck) + 2000).toISOString();
    updateService.recordAgentUpdates(unsupported.agentId, payload(checkedAt, {
      supported: false,
      status: "unsupported",
      lastSuccessfulAt: null,
      updateCount: 0,
      securityUpdateCount: 0,
      rebootRequired: null,
      truncated: false,
      packages: []
    }));
    updateService.recordAgentUpdates(offline.agentId, payload(new Date(Date.parse(firstCheck) + 3000).toISOString(), {
      updateCount: 1,
      securityUpdateCount: 0,
      packages: [{
        name: "offline-package",
        installedVersion: "1",
        candidateVersion: "2",
        security: false,
        source: "bookworm-updates"
      }]
    }));
    agentService.recordAgentHeartbeat(stale.agentId, {
      agentId: stale.agentId,
      agentVersion: "0.2.0",
      processUptimeSeconds: 30,
      timestamp: new Date().toISOString()
    });
    getDatabase().prepare("UPDATE agents SET last_seen_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 90_000).toISOString(), stale.agentId);
    updateService.recordAgentUpdates(stale.agentId, payload(new Date(Date.parse(firstCheck) + 4000).toISOString(), {
      updateCount: 1,
      securityUpdateCount: 1,
      packages: [{
        name: "stale-package",
        installedVersion: "1",
        candidateVersion: "2",
        security: true,
        source: "bookworm-security"
      }]
    }));

    const snapshot = updateService.getUpdateCenterSnapshot();
    assert.equal(snapshot.availableCount, 0);
    assert.equal(snapshot.securityCriticalCount, 0);
    assert.equal(snapshot.reportingMachineCount, 0);
    assert.equal(snapshot.totalMachineCount, 4);
    assert.equal(snapshot.lastCheckedAt, null);
    assert.equal(snapshot.machines.find((machine) => machine.agentId === unsupported.agentId)?.status, "unsupported");
    assert.equal(snapshot.machines.find((machine) => machine.agentId === waiting.agentId)?.status, "waiting");
    assert.equal(snapshot.machines.find((machine) => machine.agentId === offline.agentId)?.agentStatus, "offline");
    assert.equal(snapshot.machines.find((machine) => machine.agentId === stale.agentId)?.agentStatus, "stale");
    assert.equal(updateService.getMachineUpdateDetail(offline.agentId)?.updateCount, 1);
    assert.equal(updateService.getMachineUpdateDetail(stale.agentId)?.securityUpdateCount, 1);
  });

  await context.test("search can match package names and status filters preserve global totals", () => {
    const packageSearch = updateService.getUpdateCenterSnapshot({ search: "openssl", status: "all" });
    assert.deepEqual(packageSearch.machines.map((machine) => machine.agentId), [first.agentId]);
    assert.equal(packageSearch.availableCount, 0);
    assert.equal(packageSearch.totalMachineCount, 4);

    const failures = updateService.getUpdateCenterSnapshot({ status: "check_failed" });
    assert.deepEqual(failures.machines.map((machine) => machine.agentId), [first.agentId]);
    const unsupportedOnly = updateService.getUpdateCenterSnapshot({ status: "unsupported" });
    assert.deepEqual(unsupportedOnly.machines.map((machine) => machine.agentId), [unsupported.agentId]);
  });
});
