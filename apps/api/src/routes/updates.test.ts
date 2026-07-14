import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

process.env.DATABASE_URL = ":memory:";

const { agentIngestRouter } = await import("./agentIngest.js");
const { updatesRouter } = await import("./updates.js");
const { requireLiveDataAccess } = await import("../middleware/auth.js");
const { errorHandler } = await import("../middleware/errorHandler.js");
const agentService = await import("../services/agentService.js");

function updatePayload() {
  const checkedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    provider: "apt",
    supported: true,
    status: "ok",
    os: { id: "debian", versionId: "12", prettyName: "Debian GNU/Linux 12" },
    checkedAt,
    lastSuccessfulAt: checkedAt,
    updateCount: 1,
    securityUpdateCount: 1,
    rebootRequired: false,
    truncated: false,
    packages: [{ name: "openssl", installedVersion: "1", candidateVersion: "2", security: true, source: "debian-security" }]
  };
}

test("Agent update ingestion and owner update reads enforce their separate trust boundaries", async (context) => {
  const enrollment = agentService.createAgentEnrollmentToken("Route update machine");
  const registered = agentService.registerAgent({
    enrollmentToken: enrollment.token,
    hostname: "route-update-machine",
    agentVersion: "0.2.0",
    osName: "Debian GNU/Linux",
    osVersion: "12",
    kernel: "6.1.0-test",
    architecture: "amd64"
  });

  const app = express();
  app.use(express.json({ limit: "512kb" }));
  app.use("/api/agent", agentIngestRouter);
  app.use("/api/updates", (request, response, next) => {
    const mode = request.header("x-test-mode");
    if (mode === "live") {
      response.locals.authUser = { id: "owner", username: "admin", role: "owner", dataMode: "live" };
      response.locals.dataMode = "live";
    } else if (mode === "demo") {
      response.locals.authUser = { id: "demo", username: "demo", role: "viewer", dataMode: "demo" };
      response.locals.dataMode = "demo";
    }
    next();
  }, requireLiveDataAccess, updatesRouter);
  app.use(errorHandler);

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    await context.test("invalid credentials and malformed reports are rejected", async () => {
      const invalid = await fetch(`${baseUrl}/api/agent/updates`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer wrong",
          "x-nodeguard-agent-id": registered.agentId
        },
        body: JSON.stringify(updatePayload())
      });
      assert.equal(invalid.status, 401);

      const malformed = await fetch(`${baseUrl}/api/agent/updates`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${registered.credential}`,
          "x-nodeguard-agent-id": registered.agentId
        },
        body: JSON.stringify({ ...updatePayload(), schemaVersion: 2 })
      });
      assert.equal(malformed.status, 400);
      assert.equal((await malformed.json() as { error: string }).error, "invalid_agent_payload");
    });

    await context.test("an authenticated Agent can report a validated inventory", async () => {
      const response = await fetch(`${baseUrl}/api/agent/updates`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${registered.credential}`,
          "x-nodeguard-agent-id": registered.agentId
        },
        body: JSON.stringify(updatePayload())
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json() as { accepted: boolean }).accepted, true);
    });

    await context.test("unauthenticated and Demo users cannot read Live inventories", async () => {
      assert.equal((await fetch(`${baseUrl}/api/updates`)).status, 401);
      const demo = await fetch(`${baseUrl}/api/updates`, { headers: { "x-test-mode": "demo" } });
      assert.equal(demo.status, 403);
      assert.equal((await demo.json() as { error: string }).error, "demo_data_only");
    });

    await context.test("an owner can search summaries and read bounded package details", async () => {
      const list = await fetch(`${baseUrl}/api/updates?search=openssl&status=security`, { headers: { "x-test-mode": "live" } });
      assert.equal(list.status, 200);
      const snapshot = await list.json() as { totalMachineCount: number; machines: Array<{ agentId: string }> };
      assert.equal(snapshot.totalMachineCount, 1);
      assert.deepEqual(snapshot.machines.map((machine) => machine.agentId), [registered.agentId]);

      const detail = await fetch(`${baseUrl}/api/updates/machines/${registered.agentId}`, { headers: { "x-test-mode": "live" } });
      assert.equal(detail.status, 200);
      assert.deepEqual((await detail.json() as { packages: Array<{ name: string }> }).packages.map((entry) => entry.name), ["openssl"]);
      assert.equal((await fetch(`${baseUrl}/api/updates/settings/home-assistant`, { headers: { "x-test-mode": "live" } })).status, 404);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
