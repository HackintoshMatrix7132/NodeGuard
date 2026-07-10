import assert from "node:assert/strict";
import test from "node:test";

import { isRequestOriginAllowed } from "./cors.js";

test("CORS accepts requests without an Origin header", () => {
  assert.equal(isRequestOriginAllowed(undefined, "http", "192.168.1.20:3000", []), true);
});

test("CORS accepts the backend's direct LAN origin", () => {
  assert.equal(isRequestOriginAllowed("http://192.168.1.20:3000", "http", "192.168.1.20:3000", []), true);
});

test("CORS accepts configured reverse-proxy origins", () => {
  assert.equal(isRequestOriginAllowed("https://nodeguard.example.com", "http", "nodeguard:3000", ["https://nodeguard.example.com"]), true);
});

test("CORS rejects unrelated browser origins", () => {
  assert.equal(isRequestOriginAllowed("https://untrusted.example", "https", "nodeguard.example.com", ["https://nodeguard.example.com"]), false);
});
