import {
  Activity,
  AlertTriangle,
  Box,
  Check,
  CheckCircle2,
  CloudCog,
  Database,
  ExternalLink,
  HardDrive,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ProxmoxStatus =
  | "available"
  | "online"
  | "running"
  | "stale"
  | "warning"
  | "unavailable"
  | "offline"
  | "critical"
  | "disabled"
  | "pending"
  | "stopped"
  | "unknown";

type ProxmoxConnection = {
  id: string;
  name: string;
  endpoint: string;
  enabled: boolean;
  status: ProxmoxStatus;
  version?: string | null;
  hasCustomCa?: boolean;
  lastCheckedAt?: string | null;
  lastSuccessfulSyncAt?: string | null;
  consecutiveFailures?: number;
  errorMessage?: string | null;
  nodeCount?: number;
  guestCount?: number;
  storageCount?: number;
};

type ProxmoxNode = {
  id?: string;
  connectionId: string;
  connectionName?: string;
  name?: string;
  node?: string;
  status: ProxmoxStatus;
  uptimeSeconds?: number | null;
  uptime?: number | null;
  cpuUsagePercent?: number | null;
  cpuUsage?: number | null;
  memoryUsedBytes?: number | null;
  memoryTotalBytes?: number | null;
  rootUsedBytes?: number | null;
  rootTotalBytes?: number | null;
  version?: string | null;
  lastSyncAt?: string | null;
};

type ProxmoxGuest = {
  id?: string;
  connectionId: string;
  connectionName?: string;
  node?: string | null;
  kind?: "qemu" | "lxc" | string;
  type?: "qemu" | "lxc" | string;
  vmid?: number | string;
  name?: string | null;
  status: ProxmoxStatus;
  cpuUsagePercent?: number | null;
  cpuUsage?: number | null;
  memoryUsedBytes?: number | null;
  memoryTotalBytes?: number | null;
  uptimeSeconds?: number | null;
  uptime?: number | null;
  lastSyncAt?: string | null;
};

type ProxmoxStorage = {
  id?: string;
  connectionId: string;
  connectionName?: string;
  storage?: string;
  name?: string;
  node?: string | null;
  type?: string | null;
  status: ProxmoxStatus;
  usedBytes?: number | null;
  totalBytes?: number | null;
  utilizationPercent?: number | null;
  content?: string | string[] | null;
  lastSyncAt?: string | null;
};

export type ProxmoxSnapshot = {
  configured: boolean;
  demoMode?: boolean;
  enabledConnections: number;
  connections: ProxmoxConnection[];
  nodes: ProxmoxNode[];
  guests: ProxmoxGuest[];
  storage: ProxmoxStorage[];
  lastSyncAt?: string | null;
  summary: {
    connections?: number;
    enabledConnections?: number;
    availableConnections?: number;
    nodesOnline?: number;
    nodesTotal?: number;
    guestsRunning?: number;
    guestsTotal?: number;
    vmRunning?: number;
    vmTotal?: number;
    lxcRunning?: number;
    lxcTotal?: number;
    storageWarnings?: number;
    storageCritical?: number;
    storageUnavailable?: number;
  };
};

type ConnectionForm = {
  id?: string;
  name: string;
  endpoint: string;
  tokenUser: string;
  tokenId: string;
  tokenSecret: string;
  customCa: string;
  enabled: boolean;
};

const emptyForm: ConnectionForm = {
  name: "",
  endpoint: "",
  tokenUser: "",
  tokenId: "",
  tokenSecret: "",
  customCa: "",
  enabled: true,
};

const emptySnapshot: ProxmoxSnapshot = {
  configured: false,
  enabledConnections: 0,
  connections: [],
  nodes: [],
  guests: [],
  storage: [],
  summary: {},
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeSnapshot(value: unknown): ProxmoxSnapshot {
  const wrapped = asRecord(value);
  const body = asRecord(wrapped.data ?? wrapped);
  const summary = asRecord(body.summary);
  const connections = asArray<ProxmoxConnection>(body.connections);
  const nodes = asArray<ProxmoxNode>(body.nodes);
  const guests = asArray<ProxmoxGuest>(body.guests);
  const storage = asArray<ProxmoxStorage>(body.storage);

  return {
    configured: Boolean(body.configured ?? connections.length > 0),
    demoMode: Boolean(body.demoMode),
    enabledConnections: asNumber(
      body.enabledConnections,
      connections.filter((connection) => connection.enabled).length,
    ),
    connections,
    nodes,
    guests,
    storage,
    lastSyncAt: typeof body.lastSyncAt === "string" ? body.lastSyncAt : null,
    summary: {
      connections: asNumber(summary.connections, connections.length),
      enabledConnections: asNumber(
        summary.enabledConnections,
        connections.filter((connection) => connection.enabled).length,
      ),
      availableConnections: asNumber(
        summary.availableConnections,
        connections.filter((connection) => connection.status === "available").length,
      ),
      nodesOnline: asNumber(
        summary.nodesOnline,
        nodes.filter((node) => ["online", "available"].includes(node.status)).length,
      ),
      nodesTotal: asNumber(summary.nodesTotal, nodes.length),
      guestsRunning: asNumber(
        summary.guestsRunning,
        guests.filter((guest) => guest.status === "running").length,
      ),
      guestsTotal: asNumber(summary.guestsTotal, guests.length),
      vmRunning: asNumber(
        summary.vmRunning,
        guests.filter(
          (guest) => (guest.kind ?? guest.type) === "qemu" && guest.status === "running",
        ).length,
      ),
      vmTotal: asNumber(
        summary.vmTotal,
        guests.filter((guest) => (guest.kind ?? guest.type) === "qemu").length,
      ),
      lxcRunning: asNumber(
        summary.lxcRunning,
        guests.filter(
          (guest) => (guest.kind ?? guest.type) === "lxc" && guest.status === "running",
        ).length,
      ),
      lxcTotal: asNumber(
        summary.lxcTotal,
        guests.filter((guest) => (guest.kind ?? guest.type) === "lxc").length,
      ),
      storageWarnings: asNumber(
        summary.storageWarnings,
        storage.filter((item) => item.status === "warning").length,
      ),
      storageCritical: asNumber(
        summary.storageCritical,
        storage.filter((item) => item.status === "critical").length,
      ),
      storageUnavailable: asNumber(
        summary.storageUnavailable,
        storage.filter((item) => ["unavailable", "offline"].includes(item.status)).length,
      ),
    },
  };
}

function normalizeConnections(value: unknown): ProxmoxConnection[] {
  const wrapped = asRecord(value);
  const body = wrapped.data ?? wrapped;
  if (Array.isArray(body)) return body as ProxmoxConnection[];
  return asArray<ProxmoxConnection>(asRecord(body).connections);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}.`);
  }

  if (!response.ok) {
    const record = asRecord(payload);
    const nestedError = asRecord(record.error);
    const message =
      (typeof record.message === "string" && record.message) ||
      (typeof nestedError.message === "string" && nestedError.message) ||
      `Request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return payload as T;
}

function useProxmoxSnapshot(refreshKey = 0) {
  const [snapshot, setSnapshot] = useState<ProxmoxSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const payload = await requestJson<unknown>("/api/proxmox");
      setSnapshot(normalizeSnapshot(payload));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Proxmox data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return { snapshot, loading, refreshing, error, reload: () => load(true) };
}

function formatPercent(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(normalized >= 10 ? 1 : 2)}%`;
}

function formatBytes(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) {
    return "Unavailable";
  }
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** unit;
  return `${amount.toFixed(amount >= 10 || unit === 0 ? 1 : 2)} ${units[unit]}`;
}

function formatUptime(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) {
    return "Unavailable";
  }
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(value?: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusBadge({ status }: { status: ProxmoxStatus }) {
  const normalized = status || "unknown";
  return (
    <span className={`proxmox-status proxmox-status--${normalized}`}>
      <span aria-hidden="true" className="proxmox-status__dot" />
      {titleCase(normalized)}
    </span>
  );
}

function ProgressBar({ value, tone = "cyan" }: { value: number; tone?: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div
      aria-label={`${safeValue.toFixed(1)} percent used`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={safeValue}
      className="proxmox-progress"
      role="progressbar"
    >
      <span
        className={`proxmox-progress__fill proxmox-progress__fill--${tone}`}
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}

function Panel({
  title,
  icon,
  actions,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`proxmox-panel ${className}`}>
      <header className="proxmox-panel__header">
        <div className="proxmox-panel__title">
          {icon}
          <h2>{title}</h2>
        </div>
        {actions ? <div className="proxmox-panel__actions">{actions}</div> : null}
      </header>
      <div className="proxmox-panel__body">{children}</div>
    </section>
  );
}

function EmptyState({
  title,
  description,
  icon = <CloudCog size={20} />,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
}) {
  return (
    <div className="proxmox-empty">
      <span className="proxmox-empty__icon" aria-hidden="true">
        {icon}
      </span>
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="proxmox-notice proxmox-notice--error" role="alert">
      <AlertTriangle size={17} />
      <span>{message}</span>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="proxmox-loading" role="status">
      <LoaderCircle className="proxmox-spin" size={20} />
      <span>{label}</span>
    </div>
  );
}

function summaryValue(value: number | undefined, total: number | undefined) {
  return `${value ?? 0}/${total ?? 0}`;
}

function SummaryCards({ snapshot }: { snapshot: ProxmoxSnapshot }) {
  const { summary } = snapshot;
  const storageIssues =
    (summary.storageWarnings ?? 0) +
    (summary.storageCritical ?? 0) +
    (summary.storageUnavailable ?? 0);
  return (
    <div className="proxmox-summary-grid">
      <article className="proxmox-summary-card proxmox-summary-card--cyan">
        <span>Connections available</span>
        <strong>
          {summaryValue(summary.availableConnections, summary.enabledConnections)}
        </strong>
        <small>{summary.connections ?? snapshot.connections.length} configured</small>
      </article>
      <article className="proxmox-summary-card proxmox-summary-card--green">
        <span>Nodes online</span>
        <strong>{summaryValue(summary.nodesOnline, summary.nodesTotal)}</strong>
        <small>Across all enabled connections</small>
      </article>
      <article className="proxmox-summary-card proxmox-summary-card--blue">
        <span>Guests running</span>
        <strong>{summaryValue(summary.guestsRunning, summary.guestsTotal)}</strong>
        <small>
          {summary.vmRunning ?? 0}/{summary.vmTotal ?? 0} VMs, {summary.lxcRunning ?? 0}/
          {summary.lxcTotal ?? 0} LXCs
        </small>
      </article>
      <article
        className={`proxmox-summary-card ${
          storageIssues > 0 ? "proxmox-summary-card--amber" : "proxmox-summary-card--green"
        }`}
      >
        <span>Storage issues</span>
        <strong>{storageIssues}</strong>
        <small>
          {summary.storageCritical ?? 0} critical, {summary.storageWarnings ?? 0} warning
        </small>
      </article>
    </div>
  );
}

function ConnectionsOverview({ connections }: { connections: ProxmoxConnection[] }) {
  if (connections.length === 0) {
    return (
      <EmptyState
        title="No Proxmox connections"
        description="Add a read-only Proxmox VE API token in Settings."
      />
    );
  }

  return (
    <div className="proxmox-connection-list">
      {connections.map((connection) => (
        <article className="proxmox-connection-row" key={connection.id}>
          <div className="proxmox-connection-row__identity">
            <Server size={18} />
            <div>
              <strong>{connection.name}</strong>
              <a href={connection.endpoint} rel="noreferrer" target="_blank">
                {connection.endpoint}
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
          <div className="proxmox-connection-row__meta">
            <span>{connection.version || "Version unavailable"}</span>
            <span>Last sync {formatDate(connection.lastSuccessfulSyncAt)}</span>
          </div>
          <StatusBadge status={connection.enabled ? connection.status : "disabled"} />
        </article>
      ))}
    </div>
  );
}

function NodesTable({ nodes }: { nodes: ProxmoxNode[] }) {
  if (nodes.length === 0) {
    return (
      <EmptyState
        title="No node inventory"
        description="Node data will appear after the first successful Proxmox sync."
      />
    );
  }

  return (
    <div className="proxmox-table-wrap">
      <table className="proxmox-table">
        <thead>
          <tr>
            <th>Node</th>
            <th>Status</th>
            <th>CPU</th>
            <th>Memory</th>
            <th>Root filesystem</th>
            <th>Uptime</th>
            <th>Version</th>
            <th>Last sync</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => {
            const cpu = node.cpuUsagePercent ?? node.cpuUsage;
            const memoryPercent = node.memoryTotalBytes
              ? ((node.memoryUsedBytes ?? 0) / node.memoryTotalBytes) * 100
              : null;
            const rootPercent = node.rootTotalBytes
              ? ((node.rootUsedBytes ?? 0) / node.rootTotalBytes) * 100
              : null;
            return (
              <tr key={node.id ?? `${node.connectionId}-${node.node ?? node.name}`}>
                <td data-label="Node">
                  <strong>{node.node ?? node.name ?? "Unknown node"}</strong>
                  <small>{node.connectionName}</small>
                </td>
                <td data-label="Status">
                  <StatusBadge status={node.status} />
                </td>
                <td data-label="CPU">{formatPercent(cpu)}</td>
                <td data-label="Memory">
                  <div className="proxmox-resource-cell">
                    <span>{memoryPercent === null ? "Unavailable" : formatPercent(memoryPercent)}</span>
                    {memoryPercent !== null ? <ProgressBar value={memoryPercent} tone="green" /> : null}
                    <small>
                      {formatBytes(node.memoryUsedBytes)} / {formatBytes(node.memoryTotalBytes)}
                    </small>
                  </div>
                </td>
                <td data-label="Root filesystem">
                  <div className="proxmox-resource-cell">
                    <span>{rootPercent === null ? "Unavailable" : formatPercent(rootPercent)}</span>
                    {rootPercent !== null ? <ProgressBar value={rootPercent} tone="amber" /> : null}
                    <small>
                      {formatBytes(node.rootUsedBytes)} / {formatBytes(node.rootTotalBytes)}
                    </small>
                  </div>
                </td>
                <td data-label="Uptime">
                  {formatUptime(node.uptimeSeconds ?? node.uptime)}
                </td>
                <td data-label="Version">{node.version || "Unavailable"}</td>
                <td data-label="Last sync">{formatDate(node.lastSyncAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GuestsTable({ guests }: { guests: ProxmoxGuest[] }) {
  const [typeFilter, setTypeFilter] = useState<"all" | "qemu" | "lxc">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "stopped">("all");
  const filtered = useMemo(
    () =>
      guests.filter((guest) => {
        const kind = guest.kind ?? guest.type;
        const typeMatches = typeFilter === "all" || kind === typeFilter;
        const statusMatches = statusFilter === "all" || guest.status === statusFilter;
        return typeMatches && statusMatches;
      }),
    [guests, statusFilter, typeFilter],
  );

  if (guests.length === 0) {
    return (
      <EmptyState
        title="No VM or LXC inventory"
        description="Guest data will appear after the first successful Proxmox sync."
      />
    );
  }

  return (
    <>
      <div className="proxmox-filter-row" aria-label="Guest filters">
        <div className="proxmox-segmented" role="group" aria-label="Guest type">
          {(["all", "qemu", "lxc"] as const).map((value) => (
            <button
              aria-pressed={typeFilter === value}
              className={typeFilter === value ? "is-active" : ""}
              key={value}
              onClick={() => setTypeFilter(value)}
              type="button"
            >
              {value === "all" ? "All guests" : value === "qemu" ? "Virtual machines" : "LXC"}
            </button>
          ))}
        </div>
        <div className="proxmox-segmented" role="group" aria-label="Guest status">
          {(["all", "running", "stopped"] as const).map((value) => (
            <button
              aria-pressed={statusFilter === value}
              className={statusFilter === value ? "is-active" : ""}
              key={value}
              onClick={() => setStatusFilter(value)}
              type="button"
            >
              {titleCase(value)}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No matching guests" description="Adjust the guest filters to see more results." />
      ) : (
        <div className="proxmox-table-wrap">
          <table className="proxmox-table">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Type</th>
                <th>VMID</th>
                <th>Node</th>
                <th>Status</th>
                <th>CPU</th>
                <th>Memory</th>
                <th>Uptime</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((guest) => {
                const kind = guest.kind ?? guest.type ?? "unknown";
                const memoryPercent = guest.memoryTotalBytes
                  ? ((guest.memoryUsedBytes ?? 0) / guest.memoryTotalBytes) * 100
                  : null;
                return (
                  <tr key={guest.id ?? `${guest.connectionId}-${kind}-${guest.vmid}`}>
                    <td data-label="Guest">
                      <strong>{guest.name || `Guest ${guest.vmid ?? "unknown"}`}</strong>
                      <small>{guest.connectionName}</small>
                    </td>
                    <td data-label="Type">{kind === "qemu" ? "VM" : kind.toUpperCase()}</td>
                    <td data-label="VMID">{guest.vmid ?? "Unavailable"}</td>
                    <td data-label="Node">{guest.node || "Unavailable"}</td>
                    <td data-label="Status">
                      <StatusBadge status={guest.status} />
                    </td>
                    <td data-label="CPU">
                      {formatPercent(guest.cpuUsagePercent ?? guest.cpuUsage)}
                    </td>
                    <td data-label="Memory">
                      <div className="proxmox-resource-cell">
                        <span>
                          {memoryPercent === null ? "Unavailable" : formatPercent(memoryPercent)}
                        </span>
                        <small>
                          {formatBytes(guest.memoryUsedBytes)} / {formatBytes(guest.memoryTotalBytes)}
                        </small>
                      </div>
                    </td>
                    <td data-label="Uptime">
                      {formatUptime(guest.uptimeSeconds ?? guest.uptime)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function StorageTable({ storage }: { storage: ProxmoxStorage[] }) {
  if (storage.length === 0) {
    return (
      <EmptyState
        title="No storage inventory"
        description="Storage data will appear after the first successful Proxmox sync."
      />
    );
  }

  return (
    <div className="proxmox-table-wrap">
      <table className="proxmox-table">
        <thead>
          <tr>
            <th>Storage</th>
            <th>Node</th>
            <th>Type</th>
            <th>Status</th>
            <th>Usage</th>
            <th>Used / total</th>
            <th>Content</th>
            <th>Last sync</th>
          </tr>
        </thead>
        <tbody>
          {storage.map((item) => {
            const utilization =
              item.utilizationPercent ??
              (item.totalBytes ? ((item.usedBytes ?? 0) / item.totalBytes) * 100 : null);
            const tone = utilization !== null && utilization >= 90 ? "red" : "amber";
            return (
              <tr key={item.id ?? `${item.connectionId}-${item.node}-${item.storage ?? item.name}`}>
                <td data-label="Storage">
                  <strong>{item.storage ?? item.name ?? "Unknown storage"}</strong>
                  <small>{item.connectionName}</small>
                </td>
                <td data-label="Node">{item.node || "Cluster"}</td>
                <td data-label="Type">{item.type || "Unavailable"}</td>
                <td data-label="Status">
                  <StatusBadge status={item.status} />
                </td>
                <td data-label="Usage">
                  <div className="proxmox-resource-cell">
                    <span>{utilization === null ? "Unavailable" : formatPercent(utilization)}</span>
                    {utilization !== null ? <ProgressBar value={utilization} tone={tone} /> : null}
                  </div>
                </td>
                <td data-label="Used / total">
                  {formatBytes(item.usedBytes)} / {formatBytes(item.totalBytes)}
                </td>
                <td data-label="Content">
                  {Array.isArray(item.content) ? item.content.join(", ") : item.content || "Unavailable"}
                </td>
                <td data-label="Last sync">{formatDate(item.lastSyncAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ProxmoxPage() {
  const { snapshot, loading, refreshing, error, reload } = useProxmoxSnapshot();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncNow = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await requestJson("/api/proxmox/sync", { method: "POST" });
      await reload();
    } catch (caught) {
      setSyncError(caught instanceof Error ? caught.message : "Unable to start Proxmox sync.");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <LoadingState label="Loading Proxmox inventory..." />;

  return (
    <div className="proxmox-page">
      {error ? <ErrorBanner message={error} /> : null}
      {syncError ? <ErrorBanner message={syncError} /> : null}
      {!snapshot.configured ? (
        <Panel
          title="Proxmox VE"
          icon={<CloudCog size={18} />}
          actions={
            <button className="proxmox-button proxmox-button--secondary" onClick={reload} type="button">
              <RefreshCw size={16} />
              Refresh
            </button>
          }
        >
          <EmptyState
            title="Proxmox is not configured"
            description="Add a read-only Proxmox VE API token in Settings to begin monitoring."
          />
        </Panel>
      ) : (
        <>
          <SummaryCards snapshot={snapshot} />
          <Panel
            title="Connections"
            icon={<CloudCog size={18} />}
            actions={
              <>
                <span className="proxmox-last-sync">Last sync {formatDate(snapshot.lastSyncAt)}</span>
                <button
                  className="proxmox-button proxmox-button--secondary"
                  disabled={refreshing}
                  onClick={reload}
                  type="button"
                >
                  <RefreshCw className={refreshing ? "proxmox-spin" : ""} size={16} />
                  Refresh
                </button>
                {!snapshot.demoMode ? (
                  <button
                    className="proxmox-button proxmox-button--primary"
                    disabled={syncing}
                    onClick={syncNow}
                    type="button"
                  >
                    {syncing ? <LoaderCircle className="proxmox-spin" size={16} /> : <Activity size={16} />}
                    {syncing ? "Syncing" : "Sync now"}
                  </button>
                ) : null}
              </>
            }
          >
            <ConnectionsOverview connections={snapshot.connections} />
          </Panel>
          <Panel title="Nodes" icon={<Server size={18} />}>
            <NodesTable nodes={snapshot.nodes} />
          </Panel>
          <Panel title="Virtual machines and containers" icon={<Box size={18} />}>
            <GuestsTable guests={snapshot.guests} />
          </Panel>
          <Panel title="Storage" icon={<Database size={18} />}>
            <StorageTable storage={snapshot.storage} />
          </Panel>
        </>
      )}
    </div>
  );
}

function Dialog({
  title,
  children,
  onClose,
  closeDisabled = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("input, button, textarea")?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeDisabled) onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href]',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [closeDisabled, onClose]);

  return (
    <div className="proxmox-dialog-backdrop" onMouseDown={() => !closeDisabled && onClose()}>
      <div
        aria-labelledby="proxmox-dialog-title"
        aria-modal="true"
        className="proxmox-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header className="proxmox-dialog__header">
          <h2 id="proxmox-dialog-title">{title}</h2>
          <button
            aria-label="Close"
            className="proxmox-icon-button"
            disabled={closeDisabled}
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function ConnectionFormDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: ConnectionForm;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const update = <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage(null);
  };

  const payload = () => ({
    name: form.name.trim(),
    endpoint: form.endpoint.trim(),
    tokenUser: form.tokenUser.trim(),
    tokenId: form.tokenId.trim(),
    ...(form.tokenSecret ? { tokenSecret: form.tokenSecret } : {}),
    ...(form.customCa ? { customCa: form.customCa } : {}),
    enabled: form.enabled,
  });

  const testConnection = async () => {
    setTesting(true);
    setMessage(null);
    try {
      await requestJson("/api/proxmox/connections/test", {
        method: "POST",
        body: JSON.stringify({ ...payload(), ...(form.id ? { connectionId: form.id } : {}) }),
      });
      setMessage({ tone: "success", text: "Connection test succeeded." });
    } catch (caught) {
      setMessage({
        tone: "error",
        text: caught instanceof Error ? caught.message : "Connection test failed.",
      });
    } finally {
      setTesting(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await requestJson(
        form.id ? `/api/proxmox/connections/${encodeURIComponent(form.id)}` : "/api/proxmox/connections",
        {
          method: form.id ? "PUT" : "POST",
          body: JSON.stringify(payload()),
        },
      );
      await onSaved();
      onClose();
    } catch (caught) {
      setMessage({
        tone: "error",
        text: caught instanceof Error ? caught.message : "Unable to save the Proxmox connection.",
      });
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || testing;
  return (
    <Dialog title={form.id ? "Edit Proxmox connection" : "Add Proxmox connection"} onClose={onClose} closeDisabled={busy}>
      <form className="proxmox-connection-form" onSubmit={submit}>
        <p className="proxmox-form-intro">
          Use a dedicated, read-only Proxmox API token with the PVEAuditor role. Secrets are encrypted by
          the NodeGuard backend and are never returned to this browser.
        </p>
        <div className="proxmox-form-grid">
          <label>
            <span>Display name</span>
            <input
              autoComplete="off"
              onChange={(event) => update("name", event.target.value)}
              placeholder="Primary cluster"
              required
              value={form.name}
            />
          </label>
          <label>
            <span>Proxmox URL</span>
            <input
              autoComplete="url"
              inputMode="url"
              onChange={(event) => update("endpoint", event.target.value)}
              placeholder="https://proxmox.example.net:8006"
              required
              type="url"
              value={form.endpoint}
            />
          </label>
          <label>
            <span>Token user</span>
            <input
              autoComplete="off"
              onChange={(event) => update("tokenUser", event.target.value)}
              placeholder="nodeguard@pve"
              required
              value={form.tokenUser}
            />
          </label>
          <label>
            <span>Token ID</span>
            <input
              autoComplete="off"
              onChange={(event) => update("tokenId", event.target.value)}
              placeholder="monitoring"
              required
              value={form.tokenId}
            />
          </label>
          <label className="proxmox-form-grid__wide">
            <span>Token secret</span>
            <input
              autoComplete="new-password"
              onChange={(event) => update("tokenSecret", event.target.value)}
              placeholder={form.id ? "Leave blank to keep the current secret" : "Paste token secret"}
              required={!form.id}
              type="password"
              value={form.tokenSecret}
            />
          </label>
          <label className="proxmox-form-grid__wide">
            <span>Custom CA certificate (optional)</span>
            <textarea
              onChange={(event) => update("customCa", event.target.value)}
              placeholder="-----BEGIN CERTIFICATE-----"
              rows={4}
              value={form.customCa}
            />
            <small>Use a trusted PEM certificate chain for private PKI. TLS verification is never disabled.</small>
          </label>
        </div>
        <label className="proxmox-checkbox-row">
          <input
            checked={form.enabled}
            onChange={(event) => update("enabled", event.target.checked)}
            type="checkbox"
          />
          <span className="proxmox-checkbox" aria-hidden="true">
            <Check size={13} />
          </span>
          <span>Enable scheduled monitoring</span>
        </label>
        {message ? (
          <div
            className={`proxmox-notice proxmox-notice--${message.tone}`}
            role={message.tone === "error" ? "alert" : "status"}
          >
            {message.tone === "success" ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
            <span>{message.text}</span>
          </div>
        ) : null}
        <div className="proxmox-dialog__actions">
          <button className="proxmox-button proxmox-button--secondary" disabled={busy} onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="proxmox-button proxmox-button--secondary"
            disabled={busy || !form.endpoint || !form.tokenUser || !form.tokenId || (!form.id && !form.tokenSecret)}
            onClick={testConnection}
            type="button"
          >
            {testing ? <LoaderCircle className="proxmox-spin" size={16} /> : <ShieldCheck size={16} />}
            {testing ? "Testing" : "Test connection"}
          </button>
          <button className="proxmox-button proxmox-button--primary" disabled={busy} type="submit">
            {saving ? <LoaderCircle className="proxmox-spin" size={16} /> : <LockKeyhole size={16} />}
            {saving ? "Saving" : "Save connection"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteConnectionDialog({
  connection,
  onClose,
  onDeleted,
}: {
  connection: ProxmoxConnection;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/proxmox/connections/${encodeURIComponent(connection.id)}`, {
        method: "DELETE",
      });
      await onDeleted();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove the connection.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Remove Proxmox connection" onClose={onClose} closeDisabled={busy}>
      <div className="proxmox-delete-dialog">
        <AlertTriangle size={22} />
        <p>
          Remove <strong>{connection.name}</strong> and its cached Proxmox inventory from NodeGuard?
        </p>
        <p>This does not change anything in Proxmox VE. This action cannot be undone.</p>
        {error ? <ErrorBanner message={error} /> : null}
        <div className="proxmox-dialog__actions">
          <button className="proxmox-button proxmox-button--secondary" disabled={busy} onClick={onClose} type="button">
            Cancel
          </button>
          <button className="proxmox-button proxmox-button--danger" disabled={busy} onClick={remove} type="button">
            {busy ? <LoaderCircle className="proxmox-spin" size={16} /> : <Trash2 size={16} />}
            {busy ? "Removing" : "Remove connection"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function ProxmoxSettingsPanel() {
  const [connections, setConnections] = useState<ProxmoxConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<ConnectionForm | null>(null);
  const [deleting, setDeleting] = useState<ProxmoxConnection | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await requestJson<unknown>("/api/proxmox/connections");
      setConnections(normalizeConnections(payload));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Proxmox connections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const runAction = async (connection: ProxmoxConnection, action: "sync" | "toggle") => {
    setBusyId(connection.id);
    setError(null);
    try {
      if (action === "sync") {
        await requestJson(`/api/proxmox/connections/${encodeURIComponent(connection.id)}/sync`, {
          method: "POST",
        });
        setNotice(`${connection.name} sync completed.`);
      } else {
        await requestJson(`/api/proxmox/connections/${encodeURIComponent(connection.id)}/enabled`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: !connection.enabled }),
        });
        setNotice(`${connection.name} was ${connection.enabled ? "disabled" : "enabled"}.`);
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the connection.");
    } finally {
      setBusyId(null);
    }
  };

  const editConnection = (connection: ProxmoxConnection) =>
    setEditing({
      id: connection.id,
      name: connection.name,
      endpoint: connection.endpoint,
      tokenUser: "",
      tokenId: "",
      tokenSecret: "",
      customCa: "",
      enabled: connection.enabled,
    });

  return (
    <section className="proxmox-settings-section">
      <header className="proxmox-settings-section__header">
        <div>
          <h2>Integrations</h2>
          <p>Connect read-only infrastructure APIs. Credentials are encrypted and stored only by the NodeGuard backend.</p>
        </div>
        <button className="proxmox-button proxmox-button--primary" onClick={() => setEditing(emptyForm)} type="button">
          <Plus size={16} />
          Add Proxmox connection
        </button>
      </header>
      <div className="proxmox-settings-section__body">
        <div className="proxmox-integration-heading">
          <span className="proxmox-integration-heading__icon"><CloudCog size={19} /></span>
          <div>
            <strong>Proxmox VE</strong>
            <span>Monitors clusters, nodes, VMs, LXC containers, and storage using a PVEAuditor token.</span>
          </div>
        </div>
        {notice ? (
          <div className="proxmox-notice proxmox-notice--success" role="status">
            <CheckCircle2 size={17} />
            <span>{notice}</span>
          </div>
        ) : null}
        {error ? <ErrorBanner message={error} /> : null}
        {loading ? (
          <LoadingState label="Loading Proxmox connections..." />
        ) : connections.length === 0 ? (
          <EmptyState
            title="No Proxmox connections"
            description="Add a read-only Proxmox API token to start monitoring."
          />
        ) : (
          <div className="proxmox-settings-list">
            {connections.map((connection) => {
              const busy = busyId === connection.id;
              return (
                <article className="proxmox-settings-row" key={connection.id}>
                  <div className="proxmox-settings-row__identity">
                    <strong>{connection.name}</strong>
                    <a href={connection.endpoint} rel="noreferrer" target="_blank">
                      {connection.endpoint}<ExternalLink size={13} />
                    </a>
                    <span>
                      Last successful sync {formatDate(connection.lastSuccessfulSyncAt)}
                      {connection.errorMessage ? ` - ${connection.errorMessage}` : ""}
                    </span>
                  </div>
                  <div className="proxmox-settings-row__counts">
                    <span>{connection.nodeCount ?? 0} nodes</span>
                    <span>{connection.guestCount ?? 0} guests</span>
                    <span>{connection.storageCount ?? 0} storage</span>
                  </div>
                  <StatusBadge status={connection.enabled ? connection.status : "disabled"} />
                  <div className="proxmox-settings-row__actions">
                    <button
                      aria-label={`Sync ${connection.name}`}
                      className="proxmox-icon-button"
                      disabled={busy || !connection.enabled}
                      onClick={() => runAction(connection, "sync")}
                      title="Sync now"
                      type="button"
                    >
                      <RefreshCw className={busy ? "proxmox-spin" : ""} size={16} />
                    </button>
                    <button
                      aria-label={`${connection.enabled ? "Disable" : "Enable"} ${connection.name}`}
                      className="proxmox-icon-button"
                      disabled={busy}
                      onClick={() => runAction(connection, "toggle")}
                      title={connection.enabled ? "Disable monitoring" : "Enable monitoring"}
                      type="button"
                    >
                      <Power size={16} />
                    </button>
                    <button
                      aria-label={`Edit ${connection.name}`}
                      className="proxmox-icon-button"
                      disabled={busy}
                      onClick={() => editConnection(connection)}
                      title="Edit connection"
                      type="button"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      aria-label={`Remove ${connection.name}`}
                      className="proxmox-icon-button proxmox-icon-button--danger"
                      disabled={busy}
                      onClick={() => setDeleting(connection)}
                      title="Remove connection"
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      {editing ? (
        <ConnectionFormDialog initial={editing} onClose={() => setEditing(null)} onSaved={load} />
      ) : null}
      {deleting ? (
        <DeleteConnectionDialog connection={deleting} onClose={() => setDeleting(null)} onDeleted={load} />
      ) : null}
    </section>
  );
}

export function ProxmoxDashboardCard({
  snapshot: providedSnapshot,
  onOpen,
}: {
  snapshot?: unknown;
  onOpen?: () => void;
}) {
  const shouldFetch = providedSnapshot === undefined;
  const { snapshot: fetchedSnapshot, loading } = useProxmoxSnapshot(shouldFetch ? 0 : -1);
  const snapshot = providedSnapshot === undefined ? fetchedSnapshot : normalizeSnapshot(providedSnapshot);

  if ((shouldFetch && loading) || !snapshot.configured || snapshot.enabledConnections === 0) return null;

  const nodeIssues = Math.max(
    0,
    (snapshot.summary.nodesTotal ?? 0) - (snapshot.summary.nodesOnline ?? 0),
  );
  const storageIssues =
    (snapshot.summary.storageWarnings ?? 0) +
    (snapshot.summary.storageCritical ?? 0) +
    (snapshot.summary.storageUnavailable ?? 0);
  const connectionIssues = Math.max(
    0,
    (snapshot.summary.enabledConnections ?? snapshot.enabledConnections) -
      (snapshot.summary.availableConnections ?? 0),
  );
  const issueCount = nodeIssues + storageIssues + connectionIssues;

  const content = (
    <>
      <div className="proxmox-dashboard-card__heading">
        <span>Proxmox</span>
        <CloudCog size={18} />
      </div>
      <strong className="proxmox-dashboard-card__value">
        {summaryValue(snapshot.summary.nodesOnline, snapshot.summary.nodesTotal)}
      </strong>
      <div className="proxmox-dashboard-card__label">Nodes online</div>
      <div className="proxmox-dashboard-card__details">
        <span>
          <Box size={14} />
          {snapshot.summary.guestsRunning ?? 0}/{snapshot.summary.guestsTotal ?? 0} guests running
        </span>
        <span className={issueCount > 0 ? "has-warning" : "is-healthy"}>
          {issueCount > 0 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
          {issueCount > 0 ? `${issueCount} issues` : "Healthy"}
        </span>
      </div>
    </>
  );

  return onOpen ? (
    <button className="proxmox-dashboard-card" onClick={onOpen} type="button">
      {content}
    </button>
  ) : (
    <article className="proxmox-dashboard-card">{content}</article>
  );
}

