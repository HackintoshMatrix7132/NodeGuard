import os from "node:os";

import si from "systeminformation";

import { env } from "../config/env.js";
import type { MetricSnapshot, Server } from "../types/nodeguard.js";
import { gb, percent } from "./format.js";

type SystemSnapshot = {
  server: Omit<Server, "dockerVersion" | "dockerAvailable" | "runningContainers" | "stoppedContainers" | "status">;
  metrics: MetricSnapshot;
  metricsAvailable: boolean;
};

async function safe<T>(value: Promise<T>, fallback: T) {
  try {
    return await value;
  } catch {
    return fallback;
  }
}

export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  const now = new Date().toISOString();
  const [osInfo, currentLoad, mem, fsSize, time, networkStats] = await Promise.all([
    safe(si.osInfo(), null),
    safe(si.currentLoad(), null),
    safe(si.mem(), null),
    safe(si.fsSize(), []),
    Promise.resolve(si.time()),
    safe(si.networkStats(), [])
  ]);

  const rootDisk = fsSize.find((disk) => disk.mount === "/") ?? fsSize[0];
  const network = networkStats[0];
  const memoryUsed = mem ? mem.total - mem.available : null;
  const swapUsed = mem ? mem.swaptotal - mem.swapfree : null;
  const downloadMbps = network ? Number(((network.rx_sec * 8) / 1000 / 1000).toFixed(2)) : null;
  const uploadMbps = network ? Number(((network.tx_sec * 8) / 1000 / 1000).toFixed(2)) : null;

  const metrics: MetricSnapshot = {
    serverId: "local-node",
    cpu: {
      usagePercent: currentLoad ? Number(currentLoad.currentLoad.toFixed(1)) : null,
      loadAverage: Number(os.loadavg()[0]?.toFixed(2) ?? 0)
    },
    memory: {
      usedGb: gb(memoryUsed),
      totalGb: gb(mem?.total),
      usagePercent: percent(memoryUsed, mem?.total ?? null)
    },
    disk: {
      usedGb: gb(rootDisk?.used),
      totalGb: gb(rootDisk?.size),
      usagePercent: typeof rootDisk?.use === "number" ? Number(rootDisk.use.toFixed(1)) : null
    },
    swap: {
      usedGb: gb(swapUsed),
      totalGb: gb(mem?.swaptotal),
      usagePercent: percent(swapUsed, mem?.swaptotal ?? null)
    },
    network: {
      downloadMbps,
      uploadMbps
    },
    uptimeSeconds: typeof time?.uptime === "number" ? Math.round(time.uptime) : Math.round(os.uptime()),
    createdAt: now
  };

  return {
    server: {
      id: "local-node",
      name: env.serverDisplayName,
      hostname: os.hostname(),
      os: osInfo ? `${osInfo.distro} ${osInfo.release}`.trim() : os.type(),
      kernel: osInfo?.kernel ?? os.release(),
      uptimeSeconds: metrics.uptimeSeconds,
      lastCheckedAt: now
    },
    metrics,
    metricsAvailable: Boolean(currentLoad && mem)
  };
}
