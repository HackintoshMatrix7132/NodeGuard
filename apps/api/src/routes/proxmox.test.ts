import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

process.env.DATABASE_URL = ":memory:";
process.env.NODEGUARD_INTEGRATION_SECRET = "0123456789abcdef0123456789abcdef";

const { proxmoxRouter } = await import("./proxmox.js");

test("Proxmox keeps Demo Mode read-only while serving its fictional snapshot", async (context) => {
  const app = express();
  app.use(express.json());
  app.use((request, response, next) => {
    const mode = request.header("x-test-mode");
    if (mode === "live" || mode === "demo") response.locals.dataMode = mode;
    const role = request.header("x-test-role");
    if (role) {
      response.locals.authUser = {
        id: `test-${role}`,
        username: role,
        role,
        dataMode: mode === "demo" ? "demo" : "live"
      };
    }
    next();
  });
  app.use("/api/proxmox", proxmoxRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    await context.test("Demo Mode receives the isolated inventory", async () => {
      const response = await fetch(`${baseUrl}/api/proxmox`, { headers: { "x-test-mode": "demo" } });
      assert.equal(response.status, 200);
      const snapshot = await response.json() as { configured: boolean; demoMode?: boolean; connections: Array<{ nodes?: unknown[] }> };
      assert.equal(snapshot.configured, true);
      assert.equal(snapshot.demoMode, true);
      assert.ok(snapshot.connections.length > 0);
      assert.ok((snapshot.connections[0]?.nodes?.length ?? 0) > 0);
    });

    await context.test("Demo Mode cannot read integration credentials", async () => {
      const response = await fetch(`${baseUrl}/api/proxmox/connections`, { headers: { "x-test-mode": "demo" } });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: "Proxmox integration settings are unavailable in Demo Mode." });
    });

    await context.test("Demo Mode cannot trigger synchronization", async () => {
      const response = await fetch(`${baseUrl}/api/proxmox/sync`, { method: "POST", headers: { "x-test-mode": "demo" } });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: "Proxmox integration settings are unavailable in Demo Mode." });
    });

    await context.test("legacy machine authentication retains reads but cannot mutate or synchronize Proxmox", async () => {
      const inventory = await fetch(`${baseUrl}/api/proxmox`, { headers: { "x-test-mode": "live" } });
      assert.equal(inventory.status, 200);
      const connections = await fetch(`${baseUrl}/api/proxmox/connections`, { headers: { "x-test-mode": "live" } });
      assert.equal(connections.status, 200);

      const mutations = [
        { method: "POST", path: "/sync", body: {} },
        { method: "POST", path: "/connections/missing/sync", body: {} },
        { method: "POST", path: "/connections/test", body: {} },
        { method: "POST", path: "/connections", body: {} },
        { method: "PUT", path: "/connections/missing", body: {} },
        { method: "PATCH", path: "/connections/missing/enabled", body: { enabled: true } },
        { method: "DELETE", path: "/connections/missing", body: undefined }
      ];
      for (const mutation of mutations) {
        const response = await fetch(`${baseUrl}/api/proxmox${mutation.path}`, {
          method: mutation.method,
          headers: { "content-type": "application/json", "x-test-mode": "live" },
          ...(mutation.body ? { body: JSON.stringify(mutation.body) } : {})
        });
        assert.equal(response.status, 401, `${mutation.method} ${mutation.path} must reject machine-only authentication`);
        assert.deepEqual(await response.json(), { error: "not_authenticated", message: "Sign in to NodeGuard." });
      }
    });

    await context.test("live viewers cannot mutate Proxmox while owners can synchronize", async () => {
      const viewer = await fetch(`${baseUrl}/api/proxmox/sync`, {
        method: "POST",
        headers: { "x-test-mode": "live", "x-test-role": "viewer" }
      });
      assert.equal(viewer.status, 403);
      assert.deepEqual(await viewer.json(), { error: "owner_required", message: "Owner or admin access is required." });

      const owner = await fetch(`${baseUrl}/api/proxmox/sync`, {
        method: "POST",
        headers: { "x-test-mode": "live", "x-test-role": "owner" }
      });
      assert.equal(owner.status, 200);
    });

    await context.test("Demo Mode serves isolated node detail and all allowlisted RRD ranges", async () => {
      const detail = await fetch(`${baseUrl}/api/proxmox/connections/demo-pve-main/nodes/pve-a`, {
        headers: { "x-test-mode": "demo" },
      });
      assert.equal(detail.status, 200);
      const detailBody = await detail.json() as Record<string, unknown>;
      assert.equal(detailBody.node, "pve-a");
      assert.equal(detailBody.connectionName, "Primary cluster");
      assert.doesNotMatch(JSON.stringify(detailBody), /tokenSecret|fixture-secret/i);

      for (const range of ["1h", "6h", "12h", "24h", "7d", "30d", "90d"]) {
        const response = await fetch(`${baseUrl}/api/proxmox/connections/demo-pve-main/nodes/pve-a/history?range=${range}`, {
          headers: { "x-test-mode": "demo" },
        });
        assert.equal(response.status, 200);
        const body = await response.json() as { range: string; points: unknown[] };
        assert.equal(body.range, range);
        assert.ok(body.points.length > 0);
      }
    });

    await context.test("node routes reject arbitrary ranges and identifiers", async () => {
      const invalidRange = await fetch(`${baseUrl}/api/proxmox/connections/demo-pve-main/nodes/pve-a/history?range=forever`, {
        headers: { "x-test-mode": "demo" },
      });
      assert.equal(invalidRange.status, 400);
      assert.deepEqual(await invalidRange.json(), { error: "invalid_range", message: "Unsupported Proxmox history range." });

      const missing = await fetch(`${baseUrl}/api/proxmox/connections/demo-pve-main/nodes/missing`, {
        headers: { "x-test-mode": "demo" },
      });
      assert.equal(missing.status, 404);
      assert.deepEqual(await missing.json(), { error: "node_not_found", message: "Proxmox node was not found." });
    });

    await context.test("an unknown data mode fails closed", async () => {
      const inventory = await fetch(`${baseUrl}/api/proxmox`);
      assert.equal(inventory.status, 403);
      assert.deepEqual(await inventory.json(), { error: "Proxmox inventory requires an authenticated data mode." });

      const settings = await fetch(`${baseUrl}/api/proxmox/connections`);
      assert.equal(settings.status, 403);
      assert.deepEqual(await settings.json(), { error: "Proxmox integration settings require an authenticated Live Mode session." });
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
