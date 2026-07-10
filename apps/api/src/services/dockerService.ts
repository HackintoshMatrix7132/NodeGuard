import Docker from "dockerode";

import { env } from "../config/env.js";
import type { Container, ContainerHealth, ContainerStatus, DockerSnapshot } from "../types/nodeguard.js";
import { mb, uptimeLabel } from "./format.js";

const docker = new Docker();

function normalizeName(names?: string[]) {
  const first = names?.[0] ?? "container";
  return first.replace(/^\//, "");
}

function normalizeStatus(state?: string): ContainerStatus {
  if (state === "running") {
    return "running";
  }

  if (state === "restarting") {
    return "restarting";
  }

  if (state === "exited" || state === "dead") {
    return "exited";
  }

  return "stopped";
}

function normalizeHealth(value: unknown): ContainerHealth {
  if (value === "healthy" || value === "unhealthy" || value === "starting") {
    return value;
  }

  return "none";
}

function formatPorts(ports: Docker.ContainerInfo["Ports"]) {
  return ports
    .map((port) => {
      const privatePort = port.PrivatePort ? `${port.PrivatePort}` : "";
      if (port.PublicPort) {
        return `${port.PublicPort}:${privatePort}`;
      }

      return privatePort ? `${privatePort}/${port.Type ?? "tcp"}` : "";
    })
    .filter(Boolean);
}

function formatPublishedPorts(ports: Docker.ContainerInfo["Ports"]) {
  return ports
    .filter((port) => Boolean(port.PublicPort))
    .map((port) => `${port.PublicPort}:${port.PrivatePort}${port.Type && port.Type !== "tcp" ? `/${port.Type}` : ""}`);
}

function composeStack(labels: Record<string, string> | undefined) {
  return labels?.["com.docker.compose.project"] ?? labels?.["com.docker.stack.namespace"] ?? null;
}

function primaryIpAddress(details: Docker.ContainerInspectInfo | null) {
  const networks = details?.NetworkSettings?.Networks;
  if (!networks) {
    return null;
  }

  for (const network of Object.values(networks)) {
    if (network.IPAddress) {
      return network.IPAddress;
    }
  }

  return null;
}

async function inspectContainer(id: string) {
  try {
    return await docker.getContainer(id).inspect();
  } catch {
    return null;
  }
}

async function readLogs(id: string) {
  try {
    const logBuffer = await docker.getContainer(id).logs({
      stdout: true,
      stderr: true,
      tail: env.logPreviewLines,
      timestamps: true
    });

    return logBuffer
      .toString("utf8")
      .split("\n")
      .map((line) => line.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim())
      .filter(Boolean)
      .slice(-env.logPreviewLines);
  } catch {
    return [];
  }
}

export async function getDockerSnapshot(): Promise<DockerSnapshot> {
  try {
    const [version, listedContainers] = await Promise.all([
      docker.version(),
      docker.listContainers({ all: true })
    ]);

    const containers = await Promise.all(
      listedContainers.map(async (item): Promise<Container> => {
        const details = await inspectContainer(item.Id);
        const health = normalizeHealth(details?.State?.Health?.Status);
        const startedAt = details?.State?.StartedAt && !details.State.StartedAt.startsWith("0001-")
          ? details.State.StartedAt
          : null;

        return {
          id: item.Id.slice(0, 12),
          serverId: "local-node",
          name: normalizeName(item.Names),
          image: item.Image,
          stack: composeStack(details?.Config?.Labels ?? item.Labels),
          ipAddress: primaryIpAddress(details),
          status: normalizeStatus(item.State),
          state: item.State,
          health,
          uptime: normalizeStatus(item.State) === "running" ? uptimeLabel(startedAt) : item.Status,
          cpuPercent: null,
          memoryMb: mb(details?.HostConfig?.Memory && details.HostConfig.Memory > 0 ? details.HostConfig.Memory : null),
          memoryLimitMb: mb(details?.HostConfig?.Memory && details.HostConfig.Memory > 0 ? details.HostConfig.Memory : null),
          ports: formatPorts(item.Ports),
          publishedPorts: formatPublishedPorts(item.Ports),
          restartPolicy: details?.HostConfig?.RestartPolicy?.Name || null,
          startedAt,
          logs: await readLogs(item.Id)
        };
      })
    );

    return {
      dockerAvailable: true,
      dockerVersion: version.Version ?? null,
      containers,
      containerMonitors: []
    };
  } catch (error) {
    return {
      dockerAvailable: false,
      dockerVersion: null,
      containers: [],
      containerMonitors: [],
      message: error instanceof Error ? "Docker is not available on this host." : "Docker status is unavailable."
    };
  }
}
