import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProxmoxBaseUrl, normalizeProxmoxTransportError } from "./proxmoxClient.js";

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

test("Proxmox transport errors do not expose raw network details", () => {
  const refusal = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8006"), { code: "ECONNREFUSED" });
  assert.equal(
    normalizeProxmoxTransportError(refusal).message,
    "Unable to reach the Proxmox API. Check the URL, network access, and TLS configuration.",
  );

  const certificate = Object.assign(new Error("certificate has expired for private-host"), { code: "CERT_HAS_EXPIRED" });
  assert.equal(
    normalizeProxmoxTransportError(certificate).message,
    "Unable to verify the Proxmox TLS certificate. Check the API URL and custom CA certificate.",
  );
});
