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
