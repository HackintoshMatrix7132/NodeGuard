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
    assert.throws(() => registration(enrollment.token), (error: unknown) =>
      error instanceof agentService.AgentServiceError && error.code === "invalid_enrollment_token");
  });

  let agentId = "";
  let credential = "";
  await context.test("a token creates one uniquely authenticated agent and is single use", () => {
    const enrollment = agentService.createAgentEnrollmentToken("Docker main");
    const registered = registration(enrollment.token);
    agentId = registered.agentId;
    credential = registered.credential;
    assert.match(credential, /^ng_agent_/);
    assert.equal(agentService.authenticateAgent(agentId, credential)?.id, agentId);
    assert.equal(agentService.authenticateAgent(agentId, "wrong"), null);
    assert.throws(() => registration(enrollment.token), (error: unknown) =>
      error instanceof agentService.AgentServiceError && error.code === "invalid_enrollment_token");
    const stored = getDatabase().prepare("SELECT credential_hash FROM agents WHERE id = ?").get(agentId) as { credential_hash: string };
    assert.notEqual(stored.credential_hash, credential);
  });

  await context.test("heartbeat, inventory, metrics, and Docker reports are persisted", () => {
    const timestamp = new Date().toISOString();
    assert.equal(agentService.recordAgentHeartbeat(agentId, {
      agentId, agentVersion: "0.1.0", processUptimeSeconds: 30, timestamp
    }).ok, true);
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
});
