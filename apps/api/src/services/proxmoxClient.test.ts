import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeProxmoxBaseUrl,
  normalizeProxmoxNodeRrd,
  normalizeProxmoxNodeStatus,
  normalizeProxmoxTransportError,
} from "./proxmoxClient.js";

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

test("Proxmox node status normalization keeps optional hardware and capacity fields nullable", () => {
  assert.deepEqual(normalizeProxmoxNodeStatus({ data: {
    uptime: 90,
    cpu: 0.25,
    cpuinfo: { model: "Example CPU", cores: 8, sockets: 1 },
    memory: { used: 60, total: 100, free: 20, available: 40 },
    rootfs: { used: 30, total: 200, avail: 160 },
    pveversion: "pve-manager/8.3.2",
    kversion: "Linux 6.8.12-pve",
    "current-kernel": { machine: "x86_64" },
  } }), {
    uptime: 90,
    cpuUsage: 0.25,
    cpuModel: "Example CPU",
    cpuCores: 8,
    cpuSockets: 1,
    architecture: "x86_64",
    memoryUsed: 60,
    memoryTotal: 100,
    memoryFree: 20,
    memoryAvailable: 40,
    rootUsed: 30,
    rootTotal: 200,
    rootFree: 160,
    pveVersion: "pve-manager/8.3.2",
    kernelVersion: "Linux 6.8.12-pve",
  });

  const partial = normalizeProxmoxNodeStatus({ data: {} });
  assert.equal(partial.cpuModel, null);
  assert.equal(partial.memoryTotal, null);
  assert.equal(partial.rootFree, null);
});

test("Proxmox RRD normalization accepts sparse samples and rejects malformed envelopes", () => {
  assert.deepEqual(normalizeProxmoxNodeRrd({ data: [
    { time: 3, cpu: 0.2, mem: 50, maxmem: 100, netin: 1200 },
    { time: 4, cpu: null, diskread: 400 },
    { time: 5, memused: 75, memtotal: 150 },
    { time: "bad" },
  ] }), [
    {
      timestamp: 3,
      cpuUsage: 0.2,
      memoryUsed: 50,
      memoryTotal: 100,
      rootUsed: null,
      rootTotal: null,
      networkIn: 1200,
      networkOut: null,
      diskRead: null,
      diskWrite: null,
    },
    {
      timestamp: 4,
      cpuUsage: null,
      memoryUsed: null,
      memoryTotal: null,
      rootUsed: null,
      rootTotal: null,
      networkIn: null,
      networkOut: null,
      diskRead: 400,
      diskWrite: null,
    },
    {
      timestamp: 5,
      cpuUsage: null,
      memoryUsed: 75,
      memoryTotal: 150,
      rootUsed: null,
      rootTotal: null,
      networkIn: null,
      networkOut: null,
      diskRead: null,
      diskWrite: null,
    },
  ]);
  assert.throws(() => normalizeProxmoxNodeRrd({ data: {} }), /malformed/i);
});
