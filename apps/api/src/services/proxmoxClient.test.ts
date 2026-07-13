import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProxmoxBaseUrl } from "./proxmoxClient.js";

test("Proxmox base URLs are normalized without changing the endpoint", () => {
  assert.equal(
    normalizeProxmoxBaseUrl("https://pve.example.test:8006/"),
    "https://pve.example.test:8006",
  );
});

test("Proxmox base URLs require HTTPS", () => {
  assert.throws(
    () => normalizeProxmoxBaseUrl("http://pve.example.test:8006"),
    /HTTPS/i,
  );
});

test("Proxmox base URLs reject embedded credentials", () => {
  assert.throws(() =>
    normalizeProxmoxBaseUrl("https://user:secret@pve.example.test:8006"),
  );
});
