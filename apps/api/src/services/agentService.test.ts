import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.DATABASE_URL = ":memory:";
process.env.AGENT_STALE_AFTER_SECONDS = "60";
process.env.AGENT_OFFLINE_AFTER_SECONDS = "180";
process.env.METRIC_HISTORY_RETENTION_DAYS = "30";

const agentService = await import("./agentService.js");
const { getDatabase } = await import("./database.js");
const { getMetricHistory } = await import("./metricHistoryService.js");
const { recordAgentUpdates } = await import("./updateService.js");

function registration(
  token: string,
  hostname = "test-host",
  machineIdentity = crypto.randomUUID(),
  replaceExisting = false,
  requestedCredential?: string
) {
  return agentService.registerAgent({
    enrollmentToken: token,
    requestedCredential,
    machineIdentity,
    replaceExisting,
    hostname,
    agentVersion: "0.1.0",
    osName: "Ubuntu",
    osVersion: "24.04",
    kernel: "6.8.0-test",
    architecture: "amd64"
  });
}

function newRequestedCredential() {
  return `ng_agent_${crypto.randomBytes(32).toString("base64url")}`;
}

test("agent enrollment, ingestion, rotation, and revocation lifecycle", async (context) => {
  const primaryMachineIdentity = crypto.randomUUID();
  await context.test("expired enrollment tokens are rejected", () => {
    const enrollment = agentService.createAgentEnrollmentToken("Expired agent");
    getDatabase().prepare("UPDATE agent_enrollment_tokens SET expires_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 1000).toISOString(), enrollment.id);
    assert.equal(agentService.getAgentEnrollmentProgress(enrollment.id)?.state, "expired");
    assert.throws(() => registration(enrollment.token), (error: unknown) =>
      error instanceof agentService.AgentServiceError && error.code === "invalid_enrollment_token");
  });

  await context.test("revoked enrollment progress never exposes a secret", () => {
    const enrollment = agentService.createAgentEnrollmentToken("Revoked enrollment");
    assert.equal(agentService.revokeEnrollmentToken(enrollment.id).revoked, true);
    const progress = agentService.getAgentEnrollmentProgress(enrollment.id);
    assert.equal(progress?.state, "revoked");
    assert.equal("token" in (progress ?? {}), false);
  });

  let agentId = "";
  let credential = "";
  await context.test("a token creates one uniquely authenticated agent and is single use", () => {
    const enrollment = agentService.createAgentEnrollmentToken("Docker main");
    assert.equal(agentService.getAgentEnrollmentProgress(enrollment.id)?.state, "waiting");
    const registered = registration(enrollment.token, "test-host", primaryMachineIdentity);
    agentId = registered.agentId;
    credential = registered.credential;
    assert.match(credential, /^ng_agent_/);
    assert.equal(agentService.authenticateAgent(agentId, credential)?.id, agentId);
    assert.equal(agentService.authenticateAgent(agentId, "wrong"), null);
    assert.throws(() => registration(enrollment.token), (error: unknown) =>
      error instanceof agentService.AgentServiceError && error.code === "invalid_enrollment_token");
    const registrationProgress = agentService.getAgentEnrollmentProgress(enrollment.id);
    assert.equal(registrationProgress?.state, "registered");
    assert.equal(registrationProgress?.agent?.id, agentId);
    assert.equal("token" in (registrationProgress ?? {}), false);
    assert.equal("credential" in (registrationProgress?.agent ?? {}), false);
    const stored = getDatabase().prepare("SELECT credential_hash FROM agents WHERE id = ?").get(agentId) as { credential_hash: string };
    assert.notEqual(stored.credential_hash, credential);
  });

  await context.test("heartbeat, inventory, metrics, and Docker reports are persisted", () => {
    const timestamp = new Date().toISOString();
    assert.equal(agentService.recordAgentHeartbeat(agentId, {
      agentId, machineIdentity: primaryMachineIdentity, agentVersion: "0.1.0", processUptimeSeconds: 30, timestamp
    }).ok, true);
    const enrollmentId = (getDatabase().prepare("SELECT id FROM agent_enrollment_tokens WHERE agent_id = ? AND purpose = 'enroll'").get(agentId) as { id: string }).id;
    assert.equal(agentService.getAgentEnrollmentProgress(enrollmentId)?.state, "online");
    agentService.recordAgentInventory(agentId, {
      timestamp,
      hostname: "docker-main",
      osName: "Ubuntu",
      osVersion: "24.04",
      kernel: "6.8.0-test",
      architecture: "amd64",
      cpuModel: "Test CPU",
      physicalCoreCount: 4,
      logicalCpuCount: 8,
      totalMemoryBytes: 16 * 1024 ** 3,
      totalSwapBytes: null,
      filesystems: [{ device: "/dev/vda1", mount: "/", filesystem: "ext4", totalBytes: 100 * 1024 ** 3 }],
      ipAddresses: ["192.0.2.10"],
      bootTime: new Date(Date.now() - 3600_000).toISOString(),
      systemUptimeSeconds: 3600,
      agentVersion: "0.1.0"
    });
    agentService.recordAgentMetrics(agentId, { samples: [{
      timestamp,
      cpuUsagePercent: 24.5,
      memoryUsedBytes: 8 * 1024 ** 3,
      memoryTotalBytes: 16 * 1024 ** 3,
      memoryUsagePercent: 50,
      diskUsedBytes: 20 * 1024 ** 3,
      diskTotalBytes: 100 * 1024 ** 3,
      diskUsagePercent: 20,
      swapUsedBytes: null,
      swapTotalBytes: null,
      swapUsagePercent: null,
      loadAverage1: 0.5,
      loadAverage5: 0.4,
      loadAverage15: 0.3,
      systemUptimeSeconds: 3600
    }] });
    agentService.recordAgentDocker(agentId, {
      timestamp,
      available: true,
      version: "27.5.1",
      inventoryHash: "test-hash",
      containers: [{
        id: "abcdef1234567890",
        name: "web",
        image: "nginx:1.27",
        runtimeState: "running",
        health: "healthy",
        createdAt: timestamp,
        startedAt: timestamp,
        uptimeSeconds: 60,
        restartCount: 1,
        stack: "edge",
        ipAddresses: ["172.18.0.2"],
        networks: ["edge"],
        publishedPorts: ["8080:80/tcp"],
        containerPorts: ["80/tcp"],
        labels: { "com.docker.compose.project": "edge" },
        cpuPercent: 1.2,
        memoryUsedBytes: 64 * 1024 ** 2,
        memoryLimitBytes: 512 * 1024 ** 2
      }]
    });
    recordAgentUpdates(agentId, {
      schemaVersion: 1,
      provider: "apt",
      supported: true,
      status: "ok",
      os: { id: "ubuntu", versionId: "24.04", prettyName: "Ubuntu 24.04 LTS" },
      checkedAt: timestamp,
      lastSuccessfulAt: timestamp,
      updateCount: 1,
      securityUpdateCount: 1,
      rebootRequired: false,
      truncated: false,
      packages: [{ name: "openssl", installedVersion: "1", candidateVersion: "2", security: true, source: "noble-security" }],
      errorCode: null
    });

    const detail = agentService.getAgent(agentId);
    assert.equal(detail?.hostname, "docker-main");
    assert.equal(detail?.latestMetrics?.cpu.usagePercent, 24.5);
    assert.equal(detail?.containers[0]?.hostName, "Docker main");
    assert.equal(detail?.containers[0]?.restartCount, 1);
    assert.equal(getMetricHistory(agentId, "1h").points.length, 1);
  });

  await context.test("status uses grace periods rather than one missed heartbeat", () => {
    const now = Date.now();
    assert.equal(agentService.calculateAgentStatus(new Date(now - 30_000).toISOString(), null, now), "online");
    assert.equal(agentService.calculateAgentStatus(new Date(now - 90_000).toISOString(), null, now), "stale");
    assert.equal(agentService.calculateAgentStatus(new Date(now - 240_000).toISOString(), null, now), "offline");
  });

  await context.test("rotation invalidates the old credential without exposing it to the UI later", () => {
    const token = agentService.createAgentEnrollmentToken("Docker main", "rotate", agentId);
    const rotated = registration(token.token, "docker-main", primaryMachineIdentity);
    assert.equal(rotated.agentId, agentId);
    assert.equal(agentService.authenticateAgent(agentId, credential), null);
    assert.equal(agentService.authenticateAgent(agentId, rotated.credential)?.id, agentId);
    credential = rotated.credential;
  });

  await context.test("revoked agents are rejected", () => {
    assert.equal(agentService.revokeAgent(agentId).revoked, true);
    assert.throws(() => agentService.authenticateAgent(agentId, credential), (error: unknown) =>
      error instanceof agentService.AgentServiceError && error.code === "agent_revoked");
  });

  await context.test("deleting a revoked agent removes only its owned data", () => {
    const unrelatedEnrollment = agentService.createAgentEnrollmentToken("Unrelated agent");
    const unrelated = registration(unrelatedEnrollment.token, "unrelated-host");
    const timestamp = new Date().toISOString();
    const agentAlertId = `agent-${agentId}-offline`;
    const containerAlertId = `agent-container-${agentId}-abcdef1234567890`;
    const unrelatedAlertId = `agent-${unrelated.agentId}-offline`;
    const insertAlert = getDatabase().prepare(`
      INSERT INTO alert_history (
        id, severity, title, message, affected_resource, status, created_at, first_seen_at,
        last_seen_at, resolved_at, occurrence_count, failed_checks, possible_cause, suggested_next_steps
      ) VALUES (?, 'warning', 'Agent test alert', 'Test', 'Agent', 'resolved', ?, ?, ?, ?, 1, '[]', NULL, '[]')
    `);
    insertAlert.run(agentAlertId, timestamp, timestamp, timestamp, timestamp);
    insertAlert.run(containerAlertId, timestamp, timestamp, timestamp, timestamp);
    insertAlert.run(unrelatedAlertId, timestamp, timestamp, timestamp, timestamp);
    getDatabase().prepare("INSERT INTO alert_deletions (id, deleted_at) VALUES (?, ?)").run(agentAlertId, timestamp);

    assert.deepEqual(agentService.deleteAgent(agentId), { deleted: true });
    assert.equal(agentService.getAgent(agentId), null);
    assert.equal(agentService.authenticateAgent(agentId, credential), null);
    for (const table of ["agent_metrics", "agent_containers", "agent_enrollment_tokens", "agent_update_inventories", "agent_package_updates"]) {
      const row = getDatabase().prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE agent_id = ?`).get(agentId) as { count: number };
      assert.equal(row.count, 0, `${table} should be deleted`);
    }
    assert.equal((getDatabase().prepare("SELECT COUNT(*) AS count FROM metric_history WHERE server_id = ?").get(agentId) as { count: number }).count, 0);
    assert.equal((getDatabase().prepare("SELECT COUNT(*) AS count FROM alert_history WHERE id IN (?, ?)").get(agentAlertId, containerAlertId) as { count: number }).count, 0);
    assert.equal((getDatabase().prepare("SELECT COUNT(*) AS count FROM alert_deletions WHERE id = ?").get(agentAlertId) as { count: number }).count, 0);
    assert.equal(agentService.getAgent(unrelated.agentId)?.displayName, "Unrelated agent");
    assert.equal((getDatabase().prepare("SELECT COUNT(*) AS count FROM agent_enrollment_tokens WHERE agent_id = ?").get(unrelated.agentId) as { count: number }).count, 1);
    assert.equal((getDatabase().prepare("SELECT COUNT(*) AS count FROM alert_history WHERE id = ?").get(unrelatedAlertId) as { count: number }).count, 1);
    assert.throws(() => agentService.deleteAgent(agentId), (error: unknown) =>
      error instanceof agentService.AgentServiceError && error.code === "agent_not_found" && error.status === 404);

    assert.deepEqual(agentService.deleteAgent(unrelated.agentId), { deleted: true });
    assert.equal(agentService.authenticateAgent(unrelated.agentId, unrelated.credential), null);
  });

  await context.test("a failed deletion rolls back credential invalidation and data removal", () => {
    const enrollment = agentService.createAgentEnrollmentToken("Rollback agent");
    const registered = registration(enrollment.token, "rollback-host");
    const database = getDatabase();
    database.exec(`
      CREATE TRIGGER prevent_test_agent_delete
      BEFORE DELETE ON agents
      WHEN OLD.id = '${registered.agentId}'
      BEGIN
        SELECT RAISE(ABORT, 'simulated deletion failure');
      END;
    `);

    try {
      assert.throws(() => agentService.deleteAgent(registered.agentId), /simulated deletion failure/);
    } finally {
      database.exec("DROP TRIGGER prevent_test_agent_delete");
    }

    const stored = database.prepare("SELECT revoked_at FROM agents WHERE id = ?").get(registered.agentId) as { revoked_at: string | null };
    assert.equal(stored.revoked_at, null);
    assert.equal(agentService.authenticateAgent(registered.agentId, registered.credential)?.id, registered.agentId);
    assert.deepEqual(agentService.deleteAgent(registered.agentId), { deleted: true });
  });
});

test("stable machine identity prevents duplicates and supports safe re-enrollment", async (context) => {
  const database = getDatabase();

  await context.test("normal enrollment cannot silently replace an existing machine", () => {
    const machineIdentity = crypto.randomUUID();
    const initialToken = agentService.createAgentEnrollmentToken("Identity machine");
    const initial = registration(initialToken.token, "identity-host", machineIdentity);
    const conflictingToken = agentService.createAgentEnrollmentToken("Identity machine duplicate");

    assert.throws(
      () => registration(conflictingToken.token, "renamed-host", machineIdentity),
      (error: unknown) => error instanceof agentService.AgentServiceError
        && error.code === "machine_identity_conflict"
        && error.status === 409
    );
    assert.equal(
      (database.prepare("SELECT used_at FROM agent_enrollment_tokens WHERE id = ?").get(conflictingToken.id) as { used_at: string | null }).used_at,
      null,
      "a rejected replacement must not consume its enrollment token"
    );
    assert.equal(
      (database.prepare("SELECT COUNT(*) AS count FROM agents WHERE machine_identity = ?").get(machineIdentity) as { count: number }).count,
      1
    );
    assert.equal(agentService.authenticateAgent(initial.agentId, initial.credential)?.id, initial.agentId);

    assert.deepEqual(agentService.deleteAgent(initial.agentId), { deleted: true });
    agentService.revokeEnrollmentToken(conflictingToken.id);
  });

  await context.test("explicit same-identity replacement rotates credentials and preserves owned history", () => {
    const machineIdentity = crypto.randomUUID();
    const firstToken = agentService.createAgentEnrollmentToken("Preserved machine");
    const first = registration(firstToken.token, "preserved-host", machineIdentity);
    const checkedAt = new Date().toISOString();
    recordAgentUpdates(first.agentId, {
      schemaVersion: 1,
      provider: "apt",
      supported: true,
      status: "ok",
      os: { id: "debian", versionId: "12", prettyName: "Debian 12" },
      checkedAt,
      lastSuccessfulAt: checkedAt,
      updateCount: 1,
      securityUpdateCount: 1,
      rebootRequired: false,
      truncated: false,
      packages: [{ name: "openssl", installedVersion: "1", candidateVersion: "2", security: true, source: "security" }],
      errorCode: null
    });
    const unusedRotation = agentService.createAgentEnrollmentToken("Preserved machine", "rotate", first.agentId);
    const replacementToken = agentService.createAgentEnrollmentToken("Preserved machine");
    const replacement = registration(replacementToken.token, "preserved-host-new", machineIdentity, true);

    assert.equal(replacement.agentId, first.agentId);
    assert.equal(agentService.authenticateAgent(first.agentId, first.credential), null);
    assert.equal(agentService.authenticateAgent(first.agentId, replacement.credential)?.id, first.agentId);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM agents WHERE machine_identity = ?").get(machineIdentity) as { count: number }).count, 1);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM agent_package_updates WHERE agent_id = ?").get(first.agentId) as { count: number }).count, 1);
    const stored = database.prepare(`
      SELECT status, last_seen_at, revoked_at FROM agents WHERE id = ?
    `).get(first.agentId) as { status: string; last_seen_at: string | null; revoked_at: string | null };
    assert.deepEqual(stored, { status: "offline", last_seen_at: null, revoked_at: null });
    assert.ok((database.prepare("SELECT revoked_at FROM agent_enrollment_tokens WHERE id = ?").get(unusedRotation.id) as { revoked_at: string | null }).revoked_at);
    assert.equal("machineIdentity" in (agentService.getAgent(first.agentId) ?? {}), false, "raw identity must not be exposed by public Agent models");

    assert.deepEqual(agentService.deleteAgent(first.agentId), { deleted: true });
  });

  await context.test("a revoked registration is reactivated only by an explicit exact-identity replacement", () => {
    const machineIdentity = crypto.randomUUID();
    const firstToken = agentService.createAgentEnrollmentToken("Revoked identity machine");
    const first = registration(firstToken.token, "revoked-host", machineIdentity);
    assert.equal(agentService.revokeAgent(first.agentId).revoked, true);

    const replacementToken = agentService.createAgentEnrollmentToken("Revoked identity machine");
    const replacement = registration(replacementToken.token, "revoked-host", machineIdentity, true);
    assert.equal(replacement.agentId, first.agentId);
    assert.equal(agentService.authenticateAgent(first.agentId, first.credential), null);
    assert.equal(agentService.authenticateAgent(first.agentId, replacement.credential)?.id, first.agentId);
    assert.equal((database.prepare("SELECT revoked_at FROM agents WHERE id = ?").get(first.agentId) as { revoked_at: string | null }).revoked_at, null);

    assert.deepEqual(agentService.deleteAgent(first.agentId), { deleted: true });
  });

  await context.test("hard deletion permits one fresh registration with the preserved local identity", () => {
    const machineIdentity = crypto.randomUUID();
    const firstToken = agentService.createAgentEnrollmentToken("Deleted machine");
    const first = registration(firstToken.token, "deleted-host", machineIdentity);
    assert.deepEqual(agentService.deleteAgent(first.agentId), { deleted: true });

    const reinstallToken = agentService.createAgentEnrollmentToken("Reinstalled machine");
    const reinstalled = registration(reinstallToken.token, "deleted-host", machineIdentity);
    assert.notEqual(reinstalled.agentId, first.agentId);
    assert.equal(agentService.authenticateAgent(first.agentId, first.credential), null);
    assert.equal(agentService.authenticateAgent(reinstalled.agentId, reinstalled.credential)?.id, reinstalled.agentId);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM agents WHERE machine_identity = ?").get(machineIdentity) as { count: number }).count, 1);

    assert.deepEqual(agentService.deleteAgent(reinstalled.agentId), { deleted: true });
  });

  await context.test("matching hostnames never replace unrelated machine identities", () => {
    const firstToken = agentService.createAgentEnrollmentToken("Same hostname A");
    const secondToken = agentService.createAgentEnrollmentToken("Same hostname B");
    const first = registration(firstToken.token, "shared-hostname", crypto.randomUUID());
    const second = registration(secondToken.token, "shared-hostname", crypto.randomUUID(), true);

    assert.notEqual(first.agentId, second.agentId);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM agents WHERE hostname = ?").get("shared-hostname") as { count: number }).count, 2);
    assert.equal(agentService.authenticateAgent(first.agentId, first.credential)?.id, first.agentId);
    assert.equal(agentService.authenticateAgent(second.agentId, second.credential)?.id, second.agentId);

    assert.deepEqual(agentService.deleteAgent(first.agentId), { deleted: true });
    assert.deepEqual(agentService.deleteAgent(second.agentId), { deleted: true });
  });

  await context.test("rotation tokens cannot be moved to another machine identity", () => {
    const machineIdentity = crypto.randomUUID();
    const firstToken = agentService.createAgentEnrollmentToken("Rotation identity");
    const first = registration(firstToken.token, "rotation-host", machineIdentity);
    const rotation = agentService.createAgentEnrollmentToken("Rotation identity", "rotate", first.agentId);

    assert.throws(
      () => registration(rotation.token, "rotation-host", crypto.randomUUID()),
      (error: unknown) => error instanceof agentService.AgentServiceError && error.code === "machine_identity_mismatch"
    );
    assert.equal((database.prepare("SELECT used_at FROM agent_enrollment_tokens WHERE id = ?").get(rotation.id) as { used_at: string | null }).used_at, null);
    const rotated = registration(rotation.token, "rotation-host", machineIdentity);
    assert.equal(rotated.agentId, first.agentId);
    assert.equal(agentService.authenticateAgent(first.agentId, first.credential), null);
    assert.equal(agentService.authenticateAgent(first.agentId, rotated.credential)?.id, first.agentId);

    assert.deepEqual(agentService.deleteAgent(first.agentId), { deleted: true });
  });

  await context.test("legacy rotation may omit identity only until that record is identity-bound", () => {
    const machineIdentity = crypto.randomUUID();
    const firstToken = agentService.createAgentEnrollmentToken("Legacy rotation");
    const first = registration(firstToken.token, "legacy-rotation", machineIdentity);
    database.prepare("UPDATE agents SET machine_identity = NULL WHERE id = ?").run(first.agentId);
    const legacyRotation = agentService.createAgentEnrollmentToken("Legacy rotation", "rotate", first.agentId);
    const rotated = agentService.registerAgent({
      enrollmentToken: legacyRotation.token,
      replaceExisting: false,
      hostname: "legacy-rotation",
      agentVersion: "0.1.0"
    });
    assert.equal(rotated.agentId, first.agentId);
    assert.equal(agentService.authenticateAgent(first.agentId, first.credential), null);
    assert.equal(agentService.authenticateAgent(first.agentId, rotated.credential)?.id, first.agentId);
    assert.equal((database.prepare("SELECT machine_identity FROM agents WHERE id = ?").get(first.agentId) as { machine_identity: string | null }).machine_identity, null);

    const timestamp = new Date().toISOString();
    agentService.recordAgentHeartbeat(first.agentId, {
      machineIdentity,
      agentVersion: "0.2.0",
      processUptimeSeconds: 1,
      timestamp
    });
    const boundRotation = agentService.createAgentEnrollmentToken("Legacy rotation", "rotate", first.agentId);
    assert.throws(() => agentService.registerAgent({
      enrollmentToken: boundRotation.token,
      replaceExisting: false,
      hostname: "legacy-rotation",
      agentVersion: "0.1.0"
    }), (error: unknown) => error instanceof agentService.AgentServiceError && error.code === "machine_identity_required");
    assert.equal((database.prepare("SELECT used_at FROM agent_enrollment_tokens WHERE id = ?").get(boundRotation.id) as { used_at: string | null }).used_at, null);

    assert.deepEqual(agentService.deleteAgent(first.agentId), { deleted: true });
    agentService.revokeEnrollmentToken(boundRotation.id);
  });

  await context.test("authenticated legacy heartbeats bind identity once and reject reassignment or collision", () => {
    const firstIdentity = crypto.randomUUID();
    const firstToken = agentService.createAgentEnrollmentToken("Legacy first");
    const first = registration(firstToken.token, "legacy-first", firstIdentity);
    database.prepare("UPDATE agents SET machine_identity = NULL WHERE id = ?").run(first.agentId);
    const timestamp = new Date().toISOString();
    assert.equal(agentService.recordAgentHeartbeat(first.agentId, {
      agentId: first.agentId,
      machineIdentity: firstIdentity,
      agentVersion: "0.2.0",
      processUptimeSeconds: 10,
      timestamp
    }).ok, true);
    assert.equal((database.prepare("SELECT machine_identity FROM agents WHERE id = ?").get(first.agentId) as { machine_identity: string }).machine_identity, firstIdentity);
    assert.throws(() => agentService.recordAgentHeartbeat(first.agentId, {
      machineIdentity: crypto.randomUUID(),
      agentVersion: "0.2.0",
      processUptimeSeconds: 10,
      timestamp
    }), (error: unknown) => error instanceof agentService.AgentServiceError && error.code === "machine_identity_mismatch");

    const secondIdentity = crypto.randomUUID();
    const secondToken = agentService.createAgentEnrollmentToken("Legacy second");
    const second = registration(secondToken.token, "legacy-second", secondIdentity);
    database.prepare("UPDATE agents SET machine_identity = NULL WHERE id = ?").run(second.agentId);
    assert.throws(() => agentService.recordAgentHeartbeat(second.agentId, {
      machineIdentity: firstIdentity,
      agentVersion: "0.2.0",
      processUptimeSeconds: 10,
      timestamp
    }), (error: unknown) => error instanceof agentService.AgentServiceError && error.code === "machine_identity_conflict");
    assert.equal((database.prepare("SELECT machine_identity FROM agents WHERE id = ?").get(second.agentId) as { machine_identity: string | null }).machine_identity, null);

    assert.deepEqual(agentService.deleteAgent(first.agentId), { deleted: true });
    assert.deepEqual(agentService.deleteAgent(second.agentId), { deleted: true });
  });
});

test("client-nominated credentials make registration response loss safely retryable", async (context) => {
  const database = getDatabase();

  await context.test("an exact retry returns the committed registration without mutating it again", () => {
    const machineIdentity = crypto.randomUUID();
    const requestedCredential = newRequestedCredential();
    const enrollment = agentService.createAgentEnrollmentToken("Retry machine");
    const first = registration(enrollment.token, "retry-host", machineIdentity, false, requestedCredential);
    const storedBefore = database.prepare(`
      SELECT credential_hash, registered_at, last_seen_at, updated_at FROM agents WHERE id = ?
    `).get(first.agentId);

    database.exec(`
      CREATE TRIGGER reject_retry_agent_mutation
      BEFORE UPDATE ON agents
      WHEN OLD.id = '${first.agentId}'
      BEGIN
        SELECT RAISE(ABORT, 'retry mutated Agent');
      END;
      CREATE TRIGGER reject_retry_token_mutation
      BEFORE UPDATE ON agent_enrollment_tokens
      WHEN OLD.id = '${enrollment.id}'
      BEGIN
        SELECT RAISE(ABORT, 'retry mutated token');
      END;
    `);
    let retry: ReturnType<typeof registration>;
    try {
      retry = registration(enrollment.token, "retry-host", machineIdentity, false, requestedCredential);
    } finally {
      database.exec("DROP TRIGGER reject_retry_agent_mutation; DROP TRIGGER reject_retry_token_mutation;");
    }

    assert.deepEqual(retry, first);
    assert.equal(retry.credential, requestedCredential);
    assert.deepEqual(database.prepare(`
      SELECT credential_hash, registered_at, last_seen_at, updated_at FROM agents WHERE id = ?
    `).get(first.agentId), storedBefore);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM agents WHERE machine_identity = ?").get(machineIdentity) as { count: number }).count, 1);

    assert.deepEqual(agentService.deleteAgent(first.agentId), { deleted: true });
  });

  await context.test("used-token retries reject identity, credential, and legacy omissions without exposing secrets", () => {
    const machineIdentity = crypto.randomUUID();
    const requestedCredential = newRequestedCredential();
    const enrollment = agentService.createAgentEnrollmentToken("Mismatch machine");
    const first = registration(enrollment.token, "mismatch-host", machineIdentity, false, requestedCredential);
    const wrongCredential = newRequestedCredential();

    for (const retry of [
      () => registration(enrollment.token, "mismatch-host", crypto.randomUUID(), false, requestedCredential),
      () => registration(enrollment.token, "mismatch-host", machineIdentity, false, wrongCredential),
      () => registration(enrollment.token, "mismatch-host", machineIdentity)
    ]) {
      assert.throws(retry, (error: unknown) => {
        assert.ok(error instanceof agentService.AgentServiceError);
        assert.equal(error.code, "invalid_enrollment_token");
        assert.equal(error.status, 401);
        assert.equal(error.message.includes(enrollment.token), false);
        assert.equal(error.message.includes(requestedCredential), false);
        assert.equal(error.message.includes(wrongCredential), false);
        return true;
      });
    }
    assert.equal(agentService.authenticateAgent(first.agentId, requestedCredential)?.id, first.agentId);

    assert.deepEqual(agentService.deleteAgent(first.agentId), { deleted: true });
  });

  await context.test("a credential and identity from another token cannot replay a used enrollment", () => {
    const firstIdentity = crypto.randomUUID();
    const secondIdentity = crypto.randomUUID();
    const firstCredential = newRequestedCredential();
    const secondCredential = newRequestedCredential();
    const firstToken = agentService.createAgentEnrollmentToken("Token isolation A");
    const secondToken = agentService.createAgentEnrollmentToken("Token isolation B");
    const first = registration(firstToken.token, "token-a", firstIdentity, false, firstCredential);
    const second = registration(secondToken.token, "token-b", secondIdentity, false, secondCredential);

    assert.throws(
      () => registration(firstToken.token, "token-a", firstIdentity, false, secondCredential),
      (error: unknown) => error instanceof agentService.AgentServiceError && error.code === "invalid_enrollment_token"
    );
    assert.throws(
      () => registration(firstToken.token, "token-b", secondIdentity, false, firstCredential),
      (error: unknown) => error instanceof agentService.AgentServiceError && error.code === "invalid_enrollment_token"
    );
    assert.equal(registration(secondToken.token, "token-b", secondIdentity, false, secondCredential).agentId, second.agentId);
    assert.equal(agentService.authenticateAgent(first.agentId, firstCredential)?.id, first.agentId);
    assert.equal(agentService.authenticateAgent(second.agentId, secondCredential)?.id, second.agentId);

    assert.deepEqual(agentService.deleteAgent(first.agentId), { deleted: true });
    assert.deepEqual(agentService.deleteAgent(second.agentId), { deleted: true });
  });
});

test("credential rotation remains offline through replay until the new Agent heartbeats", () => {
  const database = getDatabase();
  const machineIdentity = crypto.randomUUID();
  const firstCredential = newRequestedCredential();
  const firstToken = agentService.createAgentEnrollmentToken("Rotation presence");
  const first = registration(firstToken.token, "rotation-presence", machineIdentity, false, firstCredential);
  const firstHeartbeatAt = new Date().toISOString();
  agentService.recordAgentHeartbeat(first.agentId, {
    agentId: first.agentId,
    machineIdentity,
    agentVersion: "0.2.0",
    processUptimeSeconds: 10,
    timestamp: firstHeartbeatAt
  });
  assert.equal(agentService.getAgent(first.agentId)?.status, "online");

  const requestedCredential = newRequestedCredential();
  const rotationToken = agentService.createAgentEnrollmentToken("Rotation presence", "rotate", first.agentId);
  const rotated = registration(rotationToken.token, "rotation-presence", machineIdentity, false, requestedCredential);
  assert.equal(rotated.agentId, first.agentId);
  assert.equal(agentService.authenticateAgent(first.agentId, firstCredential), null);
  assert.equal(agentService.authenticateAgent(first.agentId, requestedCredential)?.id, first.agentId);
  assert.deepEqual(
    database.prepare("SELECT status, last_seen_at FROM agents WHERE id = ?").get(first.agentId),
    { status: "offline", last_seen_at: null }
  );

  const replay = registration(rotationToken.token, "rotation-presence", machineIdentity, false, requestedCredential);
  assert.deepEqual(replay, rotated);
  assert.deepEqual(
    database.prepare("SELECT status, last_seen_at FROM agents WHERE id = ?").get(first.agentId),
    { status: "offline", last_seen_at: null },
    "idempotent replay must not imply a successful connection"
  );

  const authenticated = agentService.authenticateAgent(first.agentId, requestedCredential);
  assert.ok(authenticated);
  const newHeartbeatAt = new Date().toISOString();
  agentService.recordAgentHeartbeat(authenticated.id, {
    agentId: authenticated.id,
    machineIdentity,
    agentVersion: "0.2.0",
    processUptimeSeconds: 1,
    timestamp: newHeartbeatAt
  });
  const connected = database.prepare("SELECT status, last_seen_at FROM agents WHERE id = ?").get(first.agentId) as {
    status: string;
    last_seen_at: string | null;
  };
  assert.equal(connected.status, "online");
  assert.ok(connected.last_seen_at);

  assert.deepEqual(agentService.deleteAgent(first.agentId), { deleted: true });
});

test("raw Agent metrics are pruned to the configured history retention window", () => {
  const enrollment = agentService.createAgentEnrollmentToken("Retention agent");
  const registered = registration(enrollment.token, "retention-host");
  const staleTimestamp = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const currentTimestamp = new Date().toISOString();
  const database = getDatabase();

  database.prepare(`
    INSERT INTO agent_metrics (agent_id, sample_epoch, sampled_at)
    VALUES (?, ?, ?)
  `).run(registered.agentId, Math.floor(Date.parse(staleTimestamp) / 1000), staleTimestamp);
  agentService.recordAgentMetrics(registered.agentId, { samples: [{
    timestamp: currentTimestamp,
    cpuUsagePercent: 12,
    memoryUsedBytes: null,
    memoryTotalBytes: null,
    memoryUsagePercent: null,
    diskUsedBytes: null,
    diskTotalBytes: null,
    diskUsagePercent: null,
    swapUsedBytes: null,
    swapTotalBytes: null,
    swapUsagePercent: null,
    loadAverage1: null,
    loadAverage5: null,
    loadAverage15: null,
    systemUptimeSeconds: 60
  }] });

  const rows = database.prepare(`
    SELECT sampled_at FROM agent_metrics WHERE agent_id = ? ORDER BY sampled_at
  `).all(registered.agentId) as Array<{ sampled_at: string }>;
  assert.deepEqual(rows, [{ sampled_at: currentTimestamp }]);
  assert.deepEqual(agentService.deleteAgent(registered.agentId), { deleted: true });
});
