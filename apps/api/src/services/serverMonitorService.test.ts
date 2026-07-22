import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

process.env.DATABASE_URL = ":memory:";
process.env.NODEGUARD_INTEGRATION_SECRET = "nodeguard-server-monitor-test-secret";

const { getDatabase } = await import("./database.js");
const {
  addMonitoredServer,
  listMonitoredServerStatuses,
  removeMonitoredServer
} = await import("./serverMonitorService.js");

function listen(handler: http.RequestListener) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  return new Promise<{ server: http.Server; origin: string }>((resolve) => {
    server.once("listening", () => resolve({
      server,
      origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    }));
  });
}

function close(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test("remote server API keys are encrypted and never forwarded across origins", async () => {
  const secret = "remote-monitor-secret";
  let originAuthorization: string | undefined;
  let destinationAuthorization: string | undefined;
  const destination = await listen((request, response) => {
    destinationAuthorization = request.headers.authorization;
    response.writeHead(200).end();
  });
  const origin = await listen((request, response) => {
    originAuthorization = request.headers.authorization;
    response.writeHead(302, { location: `${destination.origin}/healthy` }).end();
  });

  try {
    const status = await addMonitoredServer({
      name: "Remote encrypted monitor",
      backendUrl: origin.origin,
      apiKey: secret,
      allowInsecureTls: false
    });
    assert.equal(status.status, "healthy");
    assert.equal(status.apiKeyPreview, "••••cret");
    assert.equal(originAuthorization, `Bearer ${secret}`);
    assert.equal(destinationAuthorization, undefined);

    const stored = getDatabase().prepare(`
      SELECT api_key, encrypted_api_key, api_key_iv, api_key_tag
      FROM server_monitors WHERE id = ?
    `).get(status.id) as Record<string, string | null>;
    assert.equal(stored.api_key, null);
    assert.ok(stored.encrypted_api_key);
    assert.ok(stored.api_key_iv);
    assert.ok(stored.api_key_tag);
    assert.equal(JSON.stringify(stored).includes(secret), false);

    const reread = await listMonitoredServerStatuses();
    assert.equal(reread[0]?.apiKeyPreview, "••••cret");
    assert.deepEqual(await removeMonitoredServer(status.id), { removed: true });
  } finally {
    await Promise.all([close(origin.server), close(destination.server)]);
  }
});

test("remote server API keys remain available across same-origin redirects", async () => {
  const secret = "same-origin-secret";
  const authorizations: Array<string | undefined> = [];
  const endpoint = await listen((request, response) => {
    authorizations.push(request.headers.authorization);
    if (request.url === "/api/overview") {
      response.writeHead(307, { location: "/redirected-overview" }).end();
      return;
    }
    response.writeHead(200).end();
  });

  try {
    const status = await addMonitoredServer({
      name: "Same-origin monitor",
      backendUrl: endpoint.origin,
      apiKey: secret,
      allowInsecureTls: false
    });
    assert.equal(status.status, "healthy");
    assert.deepEqual(authorizations, [`Bearer ${secret}`, `Bearer ${secret}`]);
    assert.deepEqual(await removeMonitoredServer(status.id), { removed: true });
  } finally {
    await close(endpoint.server);
  }
});
