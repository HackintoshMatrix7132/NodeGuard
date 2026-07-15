import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

process.env.DATABASE_URL = ":memory:";

const { agentsRouter } = await import("./agents.js");
const agentService = await import("../services/agentService.js");
const { errorHandler } = await import("../middleware/errorHandler.js");

function registerAgent() {
  const enrollment = agentService.createAgentEnrollmentToken("Route test agent");
  return agentService.registerAgent({
    enrollmentToken: enrollment.token,
    machineIdentity: "f502dcfa-e1de-4c21-aae2-ff4059d1fd2b",
    replaceExisting: false,
    hostname: "route-test-host",
    agentVersion: "0.1.0",
    osName: "Ubuntu",
    osVersion: "24.04",
    kernel: "6.8.0-test",
    architecture: "amd64"
  });
}

test("Agent deletion route requires an owner and returns safe results", async (context) => {
  const app = express();
  app.use(express.json());
  app.use((request, response, next) => {
    if (request.header("x-test-owner") === "true") {
      response.locals.authUser = { id: "owner", username: "admin", role: "owner", dataMode: "live" };
      response.locals.dataMode = "live";
    }
    next();
  });
  app.use("/api/agents", agentsRouter);
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const registered = registerAgent();

    await context.test("unauthenticated deletion is rejected", async () => {
      const response = await fetch(`${baseUrl}/api/agents/${registered.agentId}`, { method: "DELETE" });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "not_authenticated", message: "Sign in to NodeGuard." });
      assert.ok(agentService.getAgent(registered.agentId));
    });

    await context.test("an owner can delete an Agent", async () => {
      const response = await fetch(`${baseUrl}/api/agents/${registered.agentId}`, {
        method: "DELETE",
        headers: { "x-test-owner": "true" }
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { deleted: true });
      assert.equal(agentService.getAgent(registered.agentId), null);
    });

    await context.test("repeated deletion returns a safe not-found response", async () => {
      const response = await fetch(`${baseUrl}/api/agents/${registered.agentId}`, {
        method: "DELETE",
        headers: { "x-test-owner": "true" }
      });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "agent_not_found", message: "Agent not found." });
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
