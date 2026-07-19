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
  const waitingSnapshot = updateService.getUpdateCenterSnapshot();
  assert.equal(waitingSnapshot.availableCount, null);
  assert.equal(waitingSnapshot.securityCriticalCount, null);
  assert.equal(waitingSnapshot.reportingMachineCount, 0);
  assert.equal(waitingSnapshot.currentReportingMachineCount, 0);
  assert.equal(waitingSnapshot.retainedMachineCount, 0);
  assert.equal(waitingSnapshot.summaryState, "waiting");
  assert.equal(waitingSnapshot.lastCheckedAt, null);
  assert.equal(waitingSnapshot.lastSuccessfulAt, null);
  assert.equal(waitingSnapshot.machines[0]?.freshness, "waiting");

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
    assert.equal(snapshot.currentReportingMachineCount, 1);
    assert.equal(snapshot.retainedMachineCount, 0);
    assert.equal(snapshot.totalMachineCount, 1);
    assert.equal(snapshot.lastCheckedAt, firstCheck);
    assert.equal(snapshot.lastSuccessfulAt, firstCheck);
    assert.equal(snapshot.summaryState, "current");
    assert.deepEqual(updateService.getUpdateAlerts().map((alert) => alert.count), [1, 1]);
  });

  const failedAt = new Date(Date.parse(firstCheck) + 1000).toISOString();
  await context.test("a newer failed check retains successful counts and package rows", () => {
    const failed = payload(failedAt, {
      status: "package_manager_busy",
      lastSuccessfulAt: firstCheck,
      updateCount: 0,
      securityUpdateCount: 0,
      rebootRequired: null,
      truncated: false,
      packages: [],
      errorCode: "package_manager_busy",
      errorMessage: "untrusted Agent text must not be displayed"
    });
    assert.equal(updateService.recordAgentUpdates(first.agentId, failed).accepted, true);
    const detail = updateService.getMachineUpdateDetail(first.agentId);
    assert.equal(detail?.status, "package_manager_busy");
    assert.equal(detail?.freshness, "retained");
    assert.equal(detail?.lastErrorCode, "package_manager_busy");
    assert.equal(detail?.checkedAt, failedAt);
    assert.equal(detail?.lastSuccessfulAt, firstCheck);
    assert.equal(detail?.updateCount, 2);
    assert.equal(detail?.packages.length, 2);
    assert.match(detail?.lastError ?? "", /package manager is currently busy/i);
    assert.doesNotMatch(detail?.lastError ?? "", /untrusted Agent text/i);
    assert.equal(updateService.recordAgentUpdates(first.agentId, payload(firstCheck)).accepted, false);

    const snapshot = updateService.getUpdateCenterSnapshot();
    assert.equal(snapshot.availableCount, 2);
    assert.equal(snapshot.securityCriticalCount, 1);
    assert.equal(snapshot.reportingMachineCount, 1);
    assert.equal(snapshot.currentReportingMachineCount, 0);
    assert.equal(snapshot.retainedMachineCount, 1);
    assert.equal(snapshot.totalMachineCount, 1);
    assert.equal(snapshot.lastCheckedAt, failedAt);
    assert.equal(snapshot.lastSuccessfulAt, firstCheck);
    assert.equal(snapshot.summaryState, "retained");
    assert.deepEqual(updateService.getUpdateAlerts().map((alert) => alert.count), [1, 1]);
  });

  await context.test("only a newer successful zero inventory resolves retained update alerts", () => {
    const resolvedAt = new Date(Date.parse(firstCheck) + 2000).toISOString();
    assert.equal(updateService.recordAgentUpdates(first.agentId, payload(resolvedAt, {
      updateCount: 0,
      securityUpdateCount: 0,
      packages: []
    })).accepted, true);
    const resolved = updateService.getUpdateCenterSnapshot();
    assert.equal(resolved.availableCount, 0);
    assert.equal(resolved.securityCriticalCount, 0);
    assert.equal(resolved.summaryState, "current");
    assert.deepEqual(updateService.getUpdateAlerts(), []);

    const restoredAt = new Date(Date.parse(firstCheck) + 3000).toISOString();
    assert.equal(updateService.recordAgentUpdates(first.agentId, payload(restoredAt)).accepted, true);
    const retainedAgainAt = new Date(Date.parse(firstCheck) + 4000).toISOString();
    assert.equal(updateService.recordAgentUpdates(first.agentId, payload(retainedAgainAt, {
      status: "package_manager_busy",
      lastSuccessfulAt: restoredAt,
      updateCount: 0,
      securityUpdateCount: 0,
      rebootRequired: null,
      truncated: false,
      packages: [],
      errorCode: "package_manager_busy"
    })).accepted, true);
    assert.deepEqual(updateService.getUpdateAlerts().map((alert) => alert.count), [1, 1]);
  });

  const unsupported = register("Appliance", "appliance-test");
  const waiting = register("Waiting machine", "waiting-test");
  const offline = register("Offline cached machine", "offline-test");
  const stale = register("Stale cached machine", "stale-test");

  await context.test("unsupported, waiting, offline, and stale Agents remain explicit without invented current totals", () => {
    const checkedAt = new Date(Date.parse(firstCheck) + 5000).toISOString();
    const offlineCheckedAt = new Date(Date.parse(firstCheck) + 6000).toISOString();
    const staleCheckedAt = new Date(Date.parse(firstCheck) + 7000).toISOString();
    updateService.recordAgentUpdates(unsupported.agentId, payload(checkedAt, {
      supported: false,
      status: "unsupported",
      lastSuccessfulAt: null,
      updateCount: 0,
      securityUpdateCount: 0,
      rebootRequired: null,
      truncated: false,
      packages: [],
      errorCode: "unsupported_os",
      errorMessage: "untrusted unsupported text"
    }));
    updateService.recordAgentUpdates(offline.agentId, payload(offlineCheckedAt, {
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
    updateService.recordAgentUpdates(stale.agentId, payload(staleCheckedAt, {
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
    assert.equal(snapshot.availableCount, 4);
    assert.equal(snapshot.securityCriticalCount, 2);
    assert.equal(snapshot.reportingMachineCount, 3);
    assert.equal(snapshot.currentReportingMachineCount, 0);
    assert.equal(snapshot.retainedMachineCount, 3);
    assert.equal(snapshot.totalMachineCount, 4);
    assert.equal(snapshot.lastCheckedAt, staleCheckedAt);
    assert.equal(snapshot.lastSuccessfulAt, staleCheckedAt);
    assert.equal(snapshot.summaryState, "retained");
    assert.equal(snapshot.machines.find((machine) => machine.agentId === unsupported.agentId)?.status, "unsupported");
    assert.equal(snapshot.machines.find((machine) => machine.agentId === unsupported.agentId)?.freshness, "unsupported");
    assert.equal(snapshot.machines.find((machine) => machine.agentId === waiting.agentId)?.status, "waiting");
    assert.equal(snapshot.machines.find((machine) => machine.agentId === offline.agentId)?.agentStatus, "offline");
    assert.equal(snapshot.machines.find((machine) => machine.agentId === offline.agentId)?.freshness, "retained");
    assert.equal(snapshot.machines.find((machine) => machine.agentId === stale.agentId)?.agentStatus, "stale");
    assert.equal(snapshot.machines.find((machine) => machine.agentId === stale.agentId)?.freshness, "retained");
    assert.equal(updateService.getMachineUpdateDetail(offline.agentId)?.updateCount, 1);
    assert.equal(updateService.getMachineUpdateDetail(stale.agentId)?.securityUpdateCount, 1);

    const staleNow = Date.parse(staleCheckedAt) + 3 * 24 * 60 * 60 * 1000;
    getDatabase().prepare("UPDATE agents SET last_seen_at = ? WHERE id = ?")
      .run(new Date(staleNow).toISOString(), stale.agentId);
    const staleInventory = updateService.getMachineUpdateDetail(stale.agentId, staleNow);
    assert.equal(staleInventory?.agentStatus, "online");
    assert.equal(staleInventory?.freshness, "stale");
    getDatabase().prepare("UPDATE agents SET last_seen_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 90_000).toISOString(), stale.agentId);
  });

  await context.test("a package replacement failure rolls back the inventory and package set", () => {
    const database = getDatabase();
    const beforeInventory = database.prepare("SELECT * FROM agent_update_inventories WHERE agent_id = ?").get(first.agentId);
    const beforePackages = database.prepare("SELECT * FROM agent_package_updates WHERE agent_id = ? ORDER BY package_name").all(first.agentId);
    database.exec(`
      CREATE TRIGGER reject_test_update_package
      BEFORE INSERT ON agent_package_updates
      WHEN NEW.package_name = 'explode'
      BEGIN
        SELECT RAISE(ABORT, 'simulated package replacement failure');
      END;
    `);
    try {
      const checkedAt = new Date(Date.parse(firstCheck) + 8000).toISOString();
      assert.throws(() => updateService.recordAgentUpdates(first.agentId, payload(checkedAt, {
        updateCount: 1,
        securityUpdateCount: 0,
        packages: [{
          name: "explode", installedVersion: "1", candidateVersion: "2", security: false, source: "bookworm-updates"
        }]
      })), /simulated package replacement failure/);
    } finally {
      database.exec("DROP TRIGGER reject_test_update_package");
    }
    assert.deepEqual(database.prepare("SELECT * FROM agent_update_inventories WHERE agent_id = ?").get(first.agentId), beforeInventory);
    assert.deepEqual(database.prepare("SELECT * FROM agent_package_updates WHERE agent_id = ? ORDER BY package_name").all(first.agentId), beforePackages);
  });

  await context.test("search can match package names and status filters preserve global totals", () => {
    const packageSearch = updateService.getUpdateCenterSnapshot({ search: "openssl", status: "all" });
    assert.deepEqual(packageSearch.machines.map((machine) => machine.agentId), [first.agentId]);
    assert.equal(packageSearch.availableCount, 4);
    assert.equal(packageSearch.totalMachineCount, 4);

    const failures = updateService.getUpdateCenterSnapshot({ status: "check_failed" });
    assert.deepEqual(failures.machines.map((machine) => machine.agentId), [first.agentId]);
    const unsupportedOnly = updateService.getUpdateCenterSnapshot({ status: "unsupported" });
    assert.deepEqual(unsupportedOnly.machines.map((machine) => machine.agentId), [unsupported.agentId]);
  });
});
