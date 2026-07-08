import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CreateMonitoredServerInput, MonitoredServer, MonitoredServerStatus } from "../types/nodeguard.js";

const dataDir = path.resolve(process.cwd(), "data");
const dataFile = path.join(dataDir, "server-monitors.json");

function normalizeBackendUrl(value: string) {
  const parsed = new URL(value.trim());
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Use http:// or https:// for the backend URL.");
  }

  return parsed.toString().replace(/\/$/, "");
}

function createId(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "server"}-${Date.now().toString(36)}`;
}

function apiKeyPreview(apiKey?: string) {
  if (!apiKey) {
    return null;
  }

  return apiKey.length <= 4 ? "••••" : `••••${apiKey.slice(-4)}`;
}

async function readStoredServers(): Promise<MonitoredServer[]> {
  try {
    const raw = await readFile(dataFile, "utf8");
    return JSON.parse(raw) as MonitoredServer[];
  } catch {
    return [];
  }
}

async function writeStoredServers(servers: MonitoredServer[]) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, `${JSON.stringify(servers, null, 2)}\n`, "utf8");
}

async function checkServer(server: MonitoredServer): Promise<MonitoredServerStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const now = new Date().toISOString();

  try {
    const checkUrl = server.apiKey ? `${server.backendUrl}/api/overview` : server.backendUrl;
    const response = await fetch(checkUrl, {
      signal: controller.signal,
      headers: server.apiKey ? { Authorization: `Bearer ${server.apiKey}` } : undefined
    });
    const isHealthy = response.status >= 200 && response.status < 400;
    const isWarning = response.status >= 400 && response.status < 500;

    return {
      id: server.id,
      name: server.name,
      backendUrl: server.backendUrl,
      apiKeyPreview: apiKeyPreview(server.apiKey),
      status: isHealthy ? "healthy" : isWarning ? "warning" : "offline",
      lastCheckedAt: now,
      lastError: isHealthy ? null : `Check returned HTTP ${response.status}.`
    };
  } catch (error) {
    return {
      id: server.id,
      name: server.name,
      backendUrl: server.backendUrl,
      apiKeyPreview: apiKeyPreview(server.apiKey),
      status: "offline",
      lastCheckedAt: now,
      lastError: error instanceof Error && error.name === "AbortError" ? "Health check timed out." : "Server is unreachable."
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function listMonitoredServers() {
  return readStoredServers();
}

export async function listMonitoredServerStatuses() {
  const servers = await readStoredServers();
  return Promise.all(servers.map(checkServer));
}

export async function addMonitoredServer(input: CreateMonitoredServerInput) {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Server name is required.");
  }

  const backendUrl = normalizeBackendUrl(input.backendUrl);
  const servers = await readStoredServers();
  const server: MonitoredServer = {
    id: createId(name),
    name,
    backendUrl,
    apiKey: input.apiKey?.trim() || undefined,
    createdAt: new Date().toISOString()
  };
  await writeStoredServers([...servers, server]);
  return checkServer(server);
}

export async function updateMonitoredServer(id: string, input: CreateMonitoredServerInput) {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Server name is required.");
  }

  const backendUrl = normalizeBackendUrl(input.backendUrl);
  const servers = await readStoredServers();
  const existingServer = servers.find((server) => server.id === id);
  if (!existingServer) {
    return null;
  }

  const updatedServer: MonitoredServer = {
    ...existingServer,
    name,
    backendUrl,
    apiKey: input.apiKey?.trim() || existingServer.apiKey
  };
  await writeStoredServers(servers.map((server) => (server.id === id ? updatedServer : server)));
  return checkServer(updatedServer);
}

export async function removeMonitoredServer(id: string) {
  const servers = await readStoredServers();
  const nextServers = servers.filter((server) => server.id !== id);
  await writeStoredServers(nextServers);
  return { removed: nextServers.length !== servers.length };
}
