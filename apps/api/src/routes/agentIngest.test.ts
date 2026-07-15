import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

process.env.DATABASE_URL = ":memory:";

const { agentIngestRouter } = await import("./agentIngest.js");
const agentService = await import("../services/agentService.js");
const { errorHandler } = await import("../middleware/errorHandler.js");

const machineIdentity = "cbac827d-6227-45af-b153-e53f3c551f17";
const firstRequestedCredential = `ng_agent_${"A".repeat(43)}`;
const replacementRequestedCredential = `ng_agent_${"B".repeat(43)}`;

function registrationPayload(
  enrollmentToken: string,
  replaceExisting = false,
  requestedCredential = firstRequestedCredential
) {
  return {
    enrollmentToken,
    requestedCredential,
    machineIdentity,
    replaceExisting,
    hostname: "route-identity-host",
    agentVersion: "0.2.0",
    osName: "Debian GNU/Linux",
    osVersion: "12",
    architecture: "amd64"
  };
}

test("Agent registration route enforces explicit same-identity replacement without leaking secrets", async (context) => {
  const app = express();
  app.use(express.json());
  app.use("/api/agent", agentIngestRouter);
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const invalidToken = agentService.createAgentEnrollmentToken("Invalid identity payload");
    await context.test("missing identity is rejected before enrollment", async () => {
      const response = await fetch(`${baseUrl}/api/agent/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enrollmentToken: invalidToken.token,
          hostname: "route-identity-host",
          agentVersion: "0.2.0"
        })
      });
      assert.equal(response.status, 400);
      const body = await response.json() as Record<string, unknown>;
      assert.equal(body.error, "machine_identity_required");
      assert.equal(JSON.stringify(body).includes(invalidToken.token), false);
    });

    const firstToken = agentService.createAgentEnrollmentToken("Route identity machine");
    const firstResponse = await fetch(`${baseUrl}/api/agent/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(registrationPayload(firstToken.token, false, firstRequestedCredential))
    });
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json() as { agentId: string; credential: string };

    const replacementToken = agentService.createAgentEnrollmentToken("Route identity machine");
    await context.test("implicit replacement is rejected with an actionable conflict", async () => {
      const response = await fetch(`${baseUrl}/api/agent/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(registrationPayload(replacementToken.token, false, replacementRequestedCredential))
      });
      assert.equal(response.status, 409);
      const body = await response.json() as Record<string, unknown>;
      assert.equal(body.error, "machine_identity_conflict");
      assert.equal(String(body.message).includes("replaceExisting"), true);
      assert.equal(JSON.stringify(body).includes(replacementToken.token), false);
    });

    await context.test("explicit replacement reuses the registration and rotates its credential", async () => {
      const response = await fetch(`${baseUrl}/api/agent/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(registrationPayload(replacementToken.token, true, replacementRequestedCredential))
      });
      assert.equal(response.status, 201);
      const replacement = await response.json() as { agentId: string; credential: string };
      assert.equal(replacement.agentId, first.agentId);
      assert.equal(replacement.credential, replacementRequestedCredential);
      assert.equal(agentService.authenticateAgent(first.agentId, first.credential), null);
      assert.equal(agentService.authenticateAgent(replacement.agentId, replacement.credential)?.id, first.agentId);
    });

    await context.test("an exact HTTP retry returns the same committed credential", async () => {
      const response = await fetch(`${baseUrl}/api/agent/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(registrationPayload(replacementToken.token, true, replacementRequestedCredential))
      });
      assert.equal(response.status, 201);
      const retry = await response.json() as { agentId: string; credential: string };
      assert.equal(retry.agentId, first.agentId);
      assert.equal(retry.credential, replacementRequestedCredential);
    });

    assert.deepEqual(agentService.deleteAgent(first.agentId), { deleted: true });
    agentService.revokeEnrollmentToken(invalidToken.id);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("authenticated heartbeat cannot claim another Agent's stable identity", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/agent", agentIngestRouter);
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const database = (await import("../services/database.js")).getDatabase();

  const identityA = "1bfa7bfe-8a85-43fb-a709-dac2c5566bb1";
  const identityB = "bd8a5f1d-6ae3-47bb-9845-b2969edca3ac";
  const credentialA = `ng_agent_${"C".repeat(43)}`;
  const credentialB = `ng_agent_${"D".repeat(43)}`;
  const tokenA = agentService.createAgentEnrollmentToken("Identity owner A");
  const tokenB = agentService.createAgentEnrollmentToken("Identity owner B");
  const agentA = agentService.registerAgent({
    enrollmentToken: tokenA.token,
    requestedCredential: credentialA,
    machineIdentity: identityA,
    replaceExisting: false,
    hostname: "identity-owner-a",
    agentVersion: "0.2.0"
  });
  const agentB = agentService.registerAgent({
    enrollmentToken: tokenB.token,
    requestedCredential: credentialB,
    machineIdentity: identityB,
    replaceExisting: false,
    hostname: "identity-owner-b",
    agentVersion: "0.2.0"
  });
  const replacementToken = agentService.createAgentEnrollmentToken("Safe CLI replacement token");

  const selectAgent = database.prepare(`
    SELECT id, machine_identity, credential_hash, status, last_seen_at, updated_at
    FROM agents WHERE id = ?
  `);
  const selectToken = database.prepare(`
    SELECT agent_id, used_at, revoked_at FROM agent_enrollment_tokens WHERE id = ?
  `);
  const agentABefore = selectAgent.get(agentA.agentId);
  const agentBBefore = selectAgent.get(agentB.agentId);
  const tokenBefore = selectToken.get(replacementToken.id);

  try {
    const response = await fetch(`${baseUrl}/api/agent/heartbeat`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${credentialA}`,
        "content-type": "application/json",
        "x-nodeguard-agent-id": agentA.agentId
      },
      body: JSON.stringify({
        agentId: agentA.agentId,
        machineIdentity: identityB,
        agentVersion: "0.2.0",
        processUptimeSeconds: 30,
        timestamp: new Date().toISOString()
      })
    });

    assert.equal(response.status, 409);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.error, "machine_identity_mismatch");
    assert.equal(JSON.stringify(body).includes(identityA), false);
    assert.equal(JSON.stringify(body).includes(identityB), false);
    assert.equal(JSON.stringify(body).includes(credentialA), false);
    assert.deepEqual(selectAgent.get(agentA.agentId), agentABefore, "Agent A must remain identity- and credential-bound exactly as before");
    assert.deepEqual(selectAgent.get(agentB.agentId), agentBBefore, "Agent B must remain untouched");
    assert.deepEqual(selectToken.get(replacementToken.id), tokenBefore, "the fresh enrollment token must remain unused when identity preflight fails");
    assert.equal(agentService.authenticateAgent(agentA.agentId, credentialA)?.id, agentA.agentId);
    assert.equal(agentService.authenticateAgent(agentB.agentId, credentialB)?.id, agentB.agentId);
  } finally {
    assert.deepEqual(agentService.deleteAgent(agentA.agentId), { deleted: true });
    assert.deepEqual(agentService.deleteAgent(agentB.agentId), { deleted: true });
    agentService.revokeEnrollmentToken(replacementToken.id);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
