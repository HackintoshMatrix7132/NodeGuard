import https from "node:https";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

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

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown, fallback = "Unknown"): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

function requestJson(credentials: ProxmoxCredentials, path: string): Promise<unknown> {
  const baseUrl = normalizeProxmoxBaseUrl(credentials.baseUrl);
  const endpoint = new URL(`${baseUrl}/api2/json${path}`);
  const timeoutMs = Math.max(
    2_000,
    Number(process.env.NODEGUARD_PROXMOX_REQUEST_TIMEOUT_MS ?? 10_000)
  );

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
            reject(new Error(`Proxmox API returned HTTP ${response.statusCode ?? "unknown"}.`));
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

    request.setTimeout(timeoutMs, () => request.destroy(new Error("Proxmox API request timed out.")));
    request.on("error", (error) => reject(error));
    request.end();
  });
}

function extractData(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    throw new Error("Proxmox API response did not contain a data field.");
  }
  return (payload as { data: unknown }).data;
}

export async function collectProxmoxSnapshot(
  credentials: ProxmoxCredentials
): Promise<ProxmoxCollectedSnapshot> {
  const [versionPayload, resourcesPayload] = await Promise.all([
    requestJson(credentials, "/version"),
    requestJson(credentials, "/cluster/resources")
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
