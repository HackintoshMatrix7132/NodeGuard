import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = ":memory:";
process.env.AGENT_STALE_AFTER_SECONDS = "60";
process.env.AGENT_OFFLINE_AFTER_SECONDS = "180";

const agentService = await import("./agentService.js");
const { getDatabase } = await import("./database.js");
const { getMetricHistory } = await import("./metricHistoryService.js");

function registration(token: string, hostname = "test-host") {
  return agentService.registerAgent({
    enrollmentToken: token,
    hostname,
    agentVersion: "0.1.0",
    osName: "Ubuntu",
    osVersion: "24.04",
    kernel: "6.8.0-test",
    architecture: "amd64"
  });
}

test("agent enrollment, ingestion, rotation, and revocation lifecycle", async (context) => {
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
    const registered = registration(enrollment.token);
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
      agentId, agentVersion: "0.1.0", processUptimeSeconds: 30, timestamp
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
    const rotated = registration(token.token, "docker-main");
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
    for (const table of ["agent_metrics", "agent_containers", "agent_enrollment_tokens"]) {
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
