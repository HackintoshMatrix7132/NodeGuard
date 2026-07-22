import https from "node:https";
import type { ClientRequest } from "node:http";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MIN_REQUEST_TIMEOUT_MS = 2_000;
const MAX_REQUEST_TIMEOUT_MS = 60_000;
const activeRequests = new Set<ClientRequest>();
let rejectNewRequestsForShutdown = false;

export type ProxmoxRrdTimeframe = "hour" | "day" | "week" | "month" | "year";

export class ProxmoxApiRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null = null,
  ) {
    super(message);
    this.name = "ProxmoxApiRequestError";
  }
}

export class ProxmoxRequestAbortedError extends Error {
  constructor() {
    super("Proxmox request was cancelled during NodeGuard shutdown.");
    this.name = "ProxmoxRequestAbortedError";
  }
}

export function abortActiveProxmoxRequests(): void {
  rejectNewRequestsForShutdown = true;
  for (const request of [...activeRequests]) {
    request.destroy(new ProxmoxRequestAbortedError());
  }
}

export interface ProxmoxCredentials {
  baseUrl: string;
  tokenUser: string;
  tokenId: string;
  tokenSecret: string;
  customCa?: string | null;
}

export interface ProxmoxNodeRecord {
  id: string;
  name: string;
  status: string;
  uptime: number | null;
  cpuUsage: number | null;
  memoryUsed: number | null;
  memoryTotal: number | null;
  diskUsed: number | null;
  diskTotal: number | null;
  version: string | null;
}

export interface ProxmoxGuestRecord {
  id: string;
  type: "qemu" | "lxc";
  vmid: number;
  name: string;
  node: string;
  status: string;
  uptime: number | null;
  cpuUsage: number | null;
  memoryUsed: number | null;
  memoryTotal: number | null;
}

export interface ProxmoxStorageRecord {
  id: string;
  name: string;
  node: string;
  type: string;
  status: string;
  used: number | null;
  total: number | null;
  utilization: number | null;
  content: string | null;
}

export interface ProxmoxCollectedSnapshot {
  version: string | null;
  checkedAt: string;
  nodes: ProxmoxNodeRecord[];
  guests: ProxmoxGuestRecord[];
  storage: ProxmoxStorageRecord[];
}

export interface ProxmoxNodeStatusRecord {
  uptime: number | null;
  cpuUsage: number | null;
  cpuModel: string | null;
  cpuCores: number | null;
  cpuSockets: number | null;
  architecture: string | null;
  memoryUsed: number | null;
  memoryTotal: number | null;
  memoryFree: number | null;
  memoryAvailable: number | null;
  rootUsed: number | null;
  rootTotal: number | null;
  rootFree: number | null;
  pveVersion: string | null;
  kernelVersion: string | null;
}

export interface ProxmoxNodeRrdRecord {
  timestamp: number;
  cpuUsage: number | null;
  memoryUsed: number | null;
  memoryTotal: number | null;
  rootUsed: number | null;
  rootTotal: number | null;
  networkIn: number | null;
  networkOut: number | null;
  diskRead: number | null;
  diskWrite: number | null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown, fallback = "Unknown"): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeProxmoxBaseUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "https:") {
    throw new Error("Proxmox connections must use HTTPS.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("The Proxmox URL must not contain credentials, query parameters, or fragments.");
  }
  parsed.pathname = parsed.pathname.replace(/\/(?:api2\/json)?\/?$/, "") || "/";
  return parsed.toString().replace(/\/$/, "");
}

export function normalizeProxmoxTransportError(error: Error & { code?: string }): Error {
  if (error instanceof ProxmoxRequestAbortedError) return error;
  if (
    error.message === "Proxmox response exceeded the allowed size."
    || error.message === "Proxmox API request timed out."
  ) {
    return error;
  }

  const tlsCodes = new Set([
    "CERT_HAS_EXPIRED",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  ]);
  if (error.code && tlsCodes.has(error.code)) {
    return new Error("Unable to verify the Proxmox TLS certificate. Check the API URL and custom CA certificate.");
  }

  return new Error("Unable to reach the Proxmox API. Check the URL, network access, and TLS configuration.");
}

export function parseProxmoxRequestTimeoutMs(raw: string | undefined): number {
  if (!raw) return DEFAULT_REQUEST_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_REQUEST_TIMEOUT_MS;
  return Math.min(MAX_REQUEST_TIMEOUT_MS, Math.max(MIN_REQUEST_TIMEOUT_MS, Math.floor(parsed)));
}

function requestJson(credentials: ProxmoxCredentials, path: string, signal?: AbortSignal): Promise<unknown> {
  if (rejectNewRequestsForShutdown) {
    return Promise.reject(new ProxmoxRequestAbortedError());
  }
  const baseUrl = normalizeProxmoxBaseUrl(credentials.baseUrl);
  const endpoint = new URL(`${baseUrl}/api2/json${path}`);
  const timeoutMs = parseProxmoxRequestTimeoutMs(process.env.NODEGUARD_PROXMOX_REQUEST_TIMEOUT_MS);

  return new Promise((resolve, reject) => {
    const request = https.request(
      endpoint,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `PVEAPIToken=${credentials.tokenUser}!${credentials.tokenId}=${credentials.tokenSecret}`,
          "User-Agent": "NodeGuard-Proxmox/0.1"
        },
        signal,
        ...(credentials.customCa?.trim() ? { ca: credentials.customCa.trim() } : {})
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;

        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > MAX_RESPONSE_BYTES) {
            request.destroy(new Error("Proxmox response exceeded the allowed size."));
            return;
          }
          chunks.push(buffer);
        });

        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            const statusCode = response.statusCode ?? null;
            const message = statusCode === 401 || statusCode === 403
              ? "Proxmox API permission denied. Verify the token has PVEAuditor access."
              : statusCode === 404
                ? "The requested Proxmox node was not found."
                : "Proxmox API request failed. Try again after checking the connection.";
            reject(new ProxmoxApiRequestError(message, statusCode));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error("Proxmox API returned invalid JSON."));
          }
        });
      }
    );
    activeRequests.add(request);

    // ClientRequest#setTimeout measures socket inactivity, so a peer that
    // trickles bytes could otherwise keep synchronization alive indefinitely.
    const timeout = setTimeout(
      () => request.destroy(new Error("Proxmox API request timed out.")),
      timeoutMs
    );
    timeout.unref();
    request.once("close", () => {
      activeRequests.delete(request);
      clearTimeout(timeout);
    });
    request.on("error", (error) => {
      clearTimeout(timeout);
      reject(normalizeProxmoxTransportError(error));
    });
    request.end();
  });
}

function extractData(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    throw new Error("Proxmox API response did not contain a data field.");
  }
  return (payload as { data: unknown }).data;
}

export function normalizeProxmoxNodeStatus(payload: unknown): ProxmoxNodeStatusRecord {
  const data = extractData(payload);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Proxmox node status response was malformed.");
  }

  const status = data as Record<string, unknown>;
  const cpu = status.cpuinfo && typeof status.cpuinfo === "object"
    ? status.cpuinfo as Record<string, unknown>
    : {};
  const memory = status.memory && typeof status.memory === "object"
    ? status.memory as Record<string, unknown>
    : {};
  const root = status.rootfs && typeof status.rootfs === "object"
    ? status.rootfs as Record<string, unknown>
    : {};
  const kernel = status["current-kernel"] && typeof status["current-kernel"] === "object"
    ? status["current-kernel"] as Record<string, unknown>
    : {};

  return {
    uptime: asNumber(status.uptime),
    cpuUsage: asNumber(status.cpu),
    cpuModel: asOptionalString(cpu.model),
    cpuCores: asNumber(cpu.cores ?? cpu.cpus),
    cpuSockets: asNumber(cpu.sockets),
    architecture: asOptionalString(kernel.machine ?? status.architecture),
    memoryUsed: asNumber(memory.used),
    memoryTotal: asNumber(memory.total),
    memoryFree: asNumber(memory.free),
    memoryAvailable: asNumber(memory.available),
    rootUsed: asNumber(root.used),
    rootTotal: asNumber(root.total),
    rootFree: asNumber(root.free ?? root.avail),
    pveVersion: asOptionalString(status.pveversion),
    kernelVersion: asOptionalString(status.kversion ?? kernel.release),
  };
}

export function normalizeProxmoxNodeRrd(payload: unknown): ProxmoxNodeRrdRecord[] {
  const data = extractData(payload);
  if (!Array.isArray(data)) {
    throw new Error("Proxmox node history response was malformed.");
  }

  return data
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item) => ({
      timestamp: asNumber(item.time) ?? Number.NaN,
      cpuUsage: asNumber(item.cpu),
      memoryUsed: asNumber(item.memused ?? item.mem),
      memoryTotal: asNumber(item.memtotal ?? item.maxmem),
      rootUsed: asNumber(item.rootused),
      rootTotal: asNumber(item.roottotal),
      networkIn: asNumber(item.netin),
      networkOut: asNumber(item.netout),
      diskRead: asNumber(item.diskread),
      diskWrite: asNumber(item.diskwrite),
    }))
    .filter((item) => Number.isFinite(item.timestamp));
}

export async function collectProxmoxNodeStatus(
  credentials: ProxmoxCredentials,
  node: string,
): Promise<ProxmoxNodeStatusRecord> {
  return normalizeProxmoxNodeStatus(
    await requestJson(credentials, `/nodes/${encodeURIComponent(node)}/status`),
  );
}

export async function collectProxmoxNodeRrd(
  credentials: ProxmoxCredentials,
  node: string,
  timeframe: ProxmoxRrdTimeframe,
): Promise<ProxmoxNodeRrdRecord[]> {
  return normalizeProxmoxNodeRrd(
    await requestJson(
      credentials,
      `/nodes/${encodeURIComponent(node)}/rrddata?timeframe=${timeframe}&cf=AVERAGE`,
    ),
  );
}

export async function collectProxmoxClusterName(
  credentials: ProxmoxCredentials,
): Promise<string | null> {
  const data = extractData(await requestJson(credentials, "/cluster/status"));
  if (!Array.isArray(data)) return null;
  const cluster = data.find(
    (item): item is Record<string, unknown> => Boolean(
      item && typeof item === "object" && !Array.isArray(item)
      && (item as Record<string, unknown>).type === "cluster",
    ),
  );
  return cluster ? asOptionalString(cluster.name) : null;
}

export async function collectProxmoxSnapshot(
  credentials: ProxmoxCredentials,
  signal?: AbortSignal
): Promise<ProxmoxCollectedSnapshot> {
  const [versionPayload, resourcesPayload] = await Promise.all([
    requestJson(credentials, "/version", signal),
    requestJson(credentials, "/cluster/resources", signal)
  ]);
  const versionData = extractData(versionPayload);
  const resourceData = extractData(resourcesPayload);
  if (!Array.isArray(resourceData)) {
    throw new Error("Proxmox cluster resources response was not an array.");
  }

  const versionObject =
    versionData && typeof versionData === "object"
      ? (versionData as Record<string, unknown>)
      : {};
  const version =
    typeof versionObject.version === "string"
      ? [versionObject.version, versionObject.release].filter(Boolean).join("-")
      : null;

  const resources = resourceData.filter(
    (item): item is Record<string, unknown> => Boolean(item && typeof item === "object")
  );

  const nodes = resources
    .filter((item) => item.type === "node")
    .map((item) => ({
      id: asString(item.id, `node/${asString(item.node)}`),
      name: asString(item.node),
      status: asString(item.status, "unknown").toLowerCase(),
      uptime: asNumber(item.uptime),
      cpuUsage: asNumber(item.cpu),
      memoryUsed: asNumber(item.mem),
      memoryTotal: asNumber(item.maxmem),
      diskUsed: asNumber(item.disk),
      diskTotal: asNumber(item.maxdisk),
      version
    }));

  const guests = resources
    .filter((item) => item.type === "qemu" || item.type === "lxc")
    .map((item) => {
      const type = item.type as "qemu" | "lxc";
      const vmid = asNumber(item.vmid) ?? 0;
      return {
        id: asString(item.id, `${type}/${vmid}`),
        type,
        vmid,
        name: asString(item.name, `${type.toUpperCase()} ${vmid}`),
        node: asString(item.node),
        status: asString(item.status, "unknown").toLowerCase(),
        uptime: asNumber(item.uptime),
        cpuUsage: asNumber(item.cpu),
        memoryUsed: asNumber(item.mem),
        memoryTotal: asNumber(item.maxmem)
      };
    });

  const storage = resources
    .filter((item) => item.type === "storage")
    .map((item) => {
      const used = asNumber(item.disk) ?? asNumber(item.used);
      const total = asNumber(item.maxdisk) ?? asNumber(item.total);
      return {
        id: asString(item.id, `storage/${asString(item.node)}/${asString(item.storage)}`),
        name: asString(item.storage),
        node: asString(item.node),
        type: asString(item.plugintype ?? item.storageType ?? item.content, "storage"),
        status: asString(item.status, "available").toLowerCase(),
        used,
        total,
        utilization: used !== null && total && total > 0 ? used / total : null,
        content: typeof item.content === "string" ? item.content : null
      };
    });

  return {
    version,
    checkedAt: new Date().toISOString(),
    nodes,
    guests,
    storage
  };
}
