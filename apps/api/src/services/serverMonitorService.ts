import http from "node:http";
import https from "node:https";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { CreateMonitoredServerInput, MonitoredServer, MonitoredServerStatus } from "../types/nodeguard.js";
import { getDatabase } from "./database.js";

type ServerMonitorRow = {
  id: string;
  name: string;
  backend_url: string;
  api_key: string | null;
  allow_insecure_tls: number;
  created_at: string;
};

const database = getDatabase();
const legacyDataFile = path.resolve(process.cwd(), "data", "server-monitors.json");
let legacyImported = false;

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

function apiKeyPreview(apiKey?: string | null) {
  if (!apiKey) {
    return null;
  }

  return apiKey.length <= 4 ? "••••" : `••••${apiKey.slice(-4)}`;
}

function rowToServer(row: ServerMonitorRow): MonitoredServer {
  return {
    id: row.id,
    name: row.name,
    backendUrl: row.backend_url,
    apiKey: row.api_key ?? undefined,
    allowInsecureTls: Boolean(row.allow_insecure_tls),
    createdAt: row.created_at
  };
}

function ensureLegacyImport() {
  if (legacyImported) {
    return;
  }

  legacyImported = true;
  const count = database.prepare("SELECT COUNT(*) AS count FROM server_monitors").get() as { count: number };
  if (count.count > 0 || !existsSync(legacyDataFile)) {
    return;
  }

  try {
    const servers = JSON.parse(readFileSync(legacyDataFile, "utf8")) as MonitoredServer[];
    const insert = database.prepare(`
      INSERT OR IGNORE INTO server_monitors (id, name, backend_url, api_key, allow_insecure_tls, created_at)
      VALUES (@id, @name, @backendUrl, @apiKey, @allowInsecureTls, @createdAt)
    `);
    const importServers = database.transaction((items: MonitoredServer[]) => {
      for (const server of items) {
        insert.run({
          id: server.id,
          name: server.name,
          backendUrl: server.backendUrl,
          apiKey: server.apiKey ?? null,
          allowInsecureTls: server.allowInsecureTls ? 1 : 0,
          createdAt: server.createdAt ?? new Date().toISOString()
        });
      }
    });
    importServers(servers);
  } catch {
    // Ignore unreadable legacy files; the SQLite database is authoritative.
  }
}

function readStoredServers(): MonitoredServer[] {
  ensureLegacyImport();
  const rows = database.prepare("SELECT * FROM server_monitors ORDER BY created_at ASC").all() as ServerMonitorRow[];
  return rows.map(rowToServer);
}

function requestStatus(url: string, options: { apiKey?: string; allowInsecureTls: boolean; timeoutMs: number; redirects?: number }): Promise<number> {
  const parsed = new URL(url);
  const client = parsed.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.request(parsed, {
      method: "GET",
      timeout: options.timeoutMs,
      headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : undefined,
      rejectUnauthorized: parsed.protocol === "https:" ? !options.allowInsecureTls : undefined
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = response.headers.location;

      response.resume();
      if (location && [301, 302, 303, 307, 308].includes(statusCode) && (options.redirects ?? 0) < 5) {
        const nextUrl = new URL(location, parsed).toString();
        requestStatus(nextUrl, { ...options, redirects: (options.redirects ?? 0) + 1 }).then(resolve).catch(reject);
        return;
      }

      resolve(statusCode);
    });

    request.on("timeout", () => {
      request.destroy(new Error("Health check timed out."));
    });
    request.on("error", reject);
    request.end();
  });
}

async function checkServer(server: MonitoredServer): Promise<MonitoredServerStatus> {
  const now = new Date().toISOString();

  try {
    const checkUrl = server.apiKey ? `${server.backendUrl}/api/overview` : server.backendUrl;
    const statusCode = await requestStatus(checkUrl, {
      apiKey: server.apiKey,
      allowInsecureTls: server.allowInsecureTls,
      timeoutMs: 5000
    });
    const isHealthy = statusCode >= 200 && statusCode < 400;
    const isWarning = statusCode >= 400 && statusCode < 500;

    return {
      id: server.id,
      name: server.name,
      backendUrl: server.backendUrl,
      apiKeyPreview: apiKeyPreview(server.apiKey),
      allowInsecureTls: server.allowInsecureTls,
      status: isHealthy ? "healthy" : isWarning ? "warning" : "offline",
      lastCheckedAt: now,
      lastError: isHealthy ? null : `Check returned HTTP ${statusCode}.`
    };
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Server is unreachable.";
    return {
      id: server.id,
      name: server.name,
      backendUrl: server.backendUrl,
      apiKeyPreview: apiKeyPreview(server.apiKey),
      allowInsecureTls: server.allowInsecureTls,
      status: "offline",
      lastCheckedAt: now,
      lastError: message.includes("self-signed") || message.includes("certificate") ? "HTTPS certificate is not trusted. Enable self-signed HTTPS for this internal service." : message
    };
  }
}

export async function listMonitoredServers() {
  return readStoredServers();
}

export async function listMonitoredServerStatuses() {
  return Promise.all(readStoredServers().map(checkServer));
}

export async function addMonitoredServer(input: CreateMonitoredServerInput) {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Server name is required.");
  }

  const backendUrl = normalizeBackendUrl(input.backendUrl);
  const server: MonitoredServer = {
    id: createId(name),
    name,
    backendUrl,
    apiKey: input.apiKey?.trim() || undefined,
    allowInsecureTls: Boolean(input.allowInsecureTls),
    createdAt: new Date().toISOString()
  };
  ensureLegacyImport();
  database.prepare(`
    INSERT INTO server_monitors (id, name, backend_url, api_key, allow_insecure_tls, created_at)
    VALUES (@id, @name, @backendUrl, @apiKey, @allowInsecureTls, @createdAt)
  `).run({
    id: server.id,
    name: server.name,
    backendUrl: server.backendUrl,
    apiKey: server.apiKey ?? null,
    allowInsecureTls: server.allowInsecureTls ? 1 : 0,
    createdAt: server.createdAt
  });
  return checkServer(server);
}

export async function updateMonitoredServer(id: string, input: CreateMonitoredServerInput) {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Server name is required.");
  }

  const backendUrl = normalizeBackendUrl(input.backendUrl);
  ensureLegacyImport();
  const existingRow = database.prepare("SELECT * FROM server_monitors WHERE id = ?").get(id) as ServerMonitorRow | undefined;
  if (!existingRow) {
    return null;
  }

  const updatedServer: MonitoredServer = {
    ...rowToServer(existingRow),
    name,
    backendUrl,
    apiKey: input.apiKey?.trim() || existingRow.api_key || undefined,
    allowInsecureTls: Boolean(input.allowInsecureTls)
  };
  database.prepare(`
    UPDATE server_monitors
    SET name = @name, backend_url = @backendUrl, api_key = @apiKey, allow_insecure_tls = @allowInsecureTls
    WHERE id = @id
  `).run({
    id,
    name: updatedServer.name,
    backendUrl: updatedServer.backendUrl,
    apiKey: updatedServer.apiKey ?? null,
    allowInsecureTls: updatedServer.allowInsecureTls ? 1 : 0
  });
  return checkServer(updatedServer);
}

export async function removeMonitoredServer(id: string) {
  ensureLegacyImport();
  const result = database.prepare("DELETE FROM server_monitors WHERE id = ?").run(id);
  return { removed: result.changes > 0 };
}
