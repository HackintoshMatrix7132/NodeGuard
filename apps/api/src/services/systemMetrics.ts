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
  const [osInfo, cpu, currentLoad, mem, fsSize, time, networkStats, networkInterfaces] = await Promise.all([
    safe(si.osInfo(), null),
    safe(si.cpu(), null),
    safe(si.currentLoad(), null),
    safe(si.mem(), null),
    safe(si.fsSize(), []),
    Promise.resolve(si.time()),
    safe(si.networkStats(), []),
    safe(si.networkInterfaces(), [])
  ]);

  const rootDisk = fsSize.find((disk) => disk.mount === "/") ?? fsSize[0];
  const network = networkStats[0];
  const externalInterfaces = networkInterfaces.filter((item) => !item.internal && item.ip4);
  const primaryInterface = externalInterfaces.find((item) => item.default) ?? externalInterfaces[0];
  const ipAddresses = externalInterfaces.map((item) => item.ip4).filter(Boolean);
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
      architecture: osInfo?.arch ?? os.arch(),
      platform: osInfo?.platform ?? os.platform(),
      cpuManufacturer: cpu?.manufacturer ?? null,
      cpuModel: cpu?.brand ?? null,
      cpuCores: typeof cpu?.cores === "number" ? cpu.cores : null,
      cpuPhysicalCores: typeof cpu?.physicalCores === "number" ? cpu.physicalCores : null,
      cpuSpeedGhz: typeof cpu?.speed === "number" ? Number(cpu.speed.toFixed(2)) : null,
      totalMemoryGb: metrics.memory.totalGb,
      totalDiskGb: metrics.disk.totalGb,
      swapTotalGb: metrics.swap.totalGb,
      primaryIp: primaryInterface?.ip4 ?? null,
      ipAddresses,
      uptimeSeconds: metrics.uptimeSeconds,
      lastCheckedAt: now
    },
    metrics,
    metricsAvailable: Boolean(currentLoad && mem)
  };
}
