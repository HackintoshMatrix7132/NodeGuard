import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

process.env.DATABASE_URL = ":memory:";
process.env.TRUST_PROXY = "0";

const { createApp } = await import("./app.js");

test("createApp returns an unbound Express application with the health route registered", async () => {
  const app = createApp();
  assert.equal(app.get("trust proxy"), 0);

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    const body = await response.json() as { ok: boolean; service: string; checkedAt: string };
    assert.equal(body.ok, true);
    assert.equal(body.service, "nodeguard-api");
    assert.equal(Number.isNaN(Date.parse(body.checkedAt)), false);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
