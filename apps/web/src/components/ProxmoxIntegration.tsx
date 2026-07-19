import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Box,
  Check,
  CheckCircle2,
  CloudCog,
  Cpu,
  Database,
  HardDrive,
  Eye,
  LoaderCircle,
  LockKeyhole,
  MemoryStick,
  Network,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Server,
  ShieldCheck,
  Thermometer,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { apiFetch, getDefaultBackendUrl } from "../api/client";
import { ApiError } from "../api/errors";
import { useSettingsStore } from "../store/settingsStore";
import { useProxmoxNodeDetail, useProxmoxNodeHistory } from "../hooks/useNodeGuardQueries";
import type { ProxmoxNodeDetail, ProxmoxNodeHistory, ProxmoxNodeHistoryPoint, ProxmoxNodeHistoryRange, ProxmoxNodeTab } from "../types/nodeguard";
import { MonitoredExternalLink } from "./MonitoredExternalLink";
import { NodeGuardSelect } from "./NodeGuardSelect";

export type ProxmoxStatus =
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
  tokenUser?: string;
  tokenId?: string;
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

export type ProxmoxGuest = {
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

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asOptionalNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function inventoryIdentity(
  value: Record<string, unknown>,
  parent?: Record<string, unknown>,
): { connectionId: string; connectionName?: string; id?: string } {
  const connectionId = asString(value.connectionId ?? parent?.id);
  const connectionName = asString(value.connectionName ?? parent?.name) || undefined;
  const rawId = asString(value.id);
  const id = rawId && connectionId && !rawId.startsWith(`${connectionId}:`)
    ? `${connectionId}:${rawId}`
    : rawId || undefined;
  return { connectionId, connectionName, id };
}

function normalizeNode(value: unknown, parent?: Record<string, unknown>): ProxmoxNode {
  const node = asRecord(value);
  return {
    ...inventoryIdentity(node, parent),
    name: asString(node.name) || undefined,
    node: asString(node.node) || undefined,
    status: asString(node.status, "unknown") as ProxmoxStatus,
    uptimeSeconds: asOptionalNumber(node.uptimeSeconds),
    uptime: asOptionalNumber(node.uptime),
    cpuUsagePercent: asOptionalNumber(node.cpuUsagePercent),
    cpuUsage: asOptionalNumber(node.cpuUsage),
    memoryUsedBytes: asOptionalNumber(node.memoryUsedBytes ?? node.memoryUsed),
    memoryTotalBytes: asOptionalNumber(node.memoryTotalBytes ?? node.memoryTotal),
    rootUsedBytes: asOptionalNumber(node.rootUsedBytes ?? node.diskUsed),
    rootTotalBytes: asOptionalNumber(node.rootTotalBytes ?? node.diskTotal),
    version: asString(node.version) || null,
    lastSyncAt: asString(node.lastSyncAt ?? node.lastSyncedAt) || null,
  };
}

function normalizeGuest(value: unknown, parent?: Record<string, unknown>): ProxmoxGuest {
  const guest = asRecord(value);
  const vmid = typeof guest.vmid === "number" || typeof guest.vmid === "string"
    ? guest.vmid
    : undefined;
  return {
    ...inventoryIdentity(guest, parent),
    node: asString(guest.node) || null,
    kind: asString(guest.kind) || undefined,
    type: asString(guest.type) || undefined,
    vmid,
    name: asString(guest.name) || null,
    status: normalizeProxmoxStatus(asString(guest.status, "unknown")),
    cpuUsagePercent: asOptionalNumber(guest.cpuUsagePercent),
    cpuUsage: asOptionalNumber(guest.cpuUsage),
    memoryUsedBytes: asOptionalNumber(guest.memoryUsedBytes ?? guest.memoryUsed),
    memoryTotalBytes: asOptionalNumber(guest.memoryTotalBytes ?? guest.memoryTotal),
    uptimeSeconds: asOptionalNumber(guest.uptimeSeconds),
    uptime: asOptionalNumber(guest.uptime),
    lastSyncAt: asString(guest.lastSyncAt ?? guest.lastSyncedAt) || null,
  };
}

function normalizeStorage(value: unknown, parent?: Record<string, unknown>): ProxmoxStorage {
  const storage = asRecord(value);
  const rawUtilization = asOptionalNumber(storage.utilization);
  const utilizationPercent = asOptionalNumber(storage.utilizationPercent)
    ?? (typeof rawUtilization === "number"
      ? (rawUtilization <= 1 ? rawUtilization * 100 : rawUtilization)
      : rawUtilization);
  const content = Array.isArray(storage.content)
    ? storage.content.filter((item): item is string => typeof item === "string")
    : asString(storage.content) || null;
  return {
    ...inventoryIdentity(storage, parent),
    storage: asString(storage.storage) || undefined,
    name: asString(storage.name) || undefined,
    node: asString(storage.node) || null,
    type: asString(storage.type) || null,
    status: asString(storage.status, "unknown") as ProxmoxStatus,
    usedBytes: asOptionalNumber(storage.usedBytes ?? storage.used),
    totalBytes: asOptionalNumber(storage.totalBytes ?? storage.total),
    utilizationPercent,
    content,
    lastSyncAt: asString(storage.lastSyncAt ?? storage.lastSyncedAt) || null,
  };
}

function normalizeConnection(value: unknown): ProxmoxConnection {
  const connection = asRecord(value);
  return {
    ...connection,
    id: asString(connection.id),
    name: asString(connection.name),
    endpoint: asString(connection.endpoint ?? connection.baseUrl),
    tokenUser: asString(connection.tokenUser) || undefined,
    tokenId: asString(connection.tokenId) || undefined,
    enabled: connection.enabled !== false,
    status: asString(connection.status, "unknown") as ProxmoxStatus,
    lastSuccessfulSyncAt:
      asString(connection.lastSuccessfulSyncAt ?? connection.lastSuccessAt) || null,
    errorMessage: asString(connection.errorMessage ?? connection.lastError) || null,
    nodeCount: asNumber(connection.nodeCount, asArray(connection.nodes).length),
    guestCount: asNumber(connection.guestCount, asArray(connection.guests).length),
    storageCount: asNumber(connection.storageCount, asArray(connection.storage).length),
  };
}

function normalizeSnapshot(value: unknown): ProxmoxSnapshot {
  const wrapped = asRecord(value);
  const body = asRecord(wrapped.data ?? wrapped);
  const summary = asRecord(body.summary);
  const rawConnections = asArray<unknown>(body.connections);
  const rawEnabledConnections = rawConnections.filter((connection) => asRecord(connection).enabled !== false);
  const connections = rawConnections.map(normalizeConnection);
  const nodes = asArray<unknown>(body.nodes).length
    ? asArray<unknown>(body.nodes).map((node) => normalizeNode(node))
    : rawEnabledConnections.flatMap((connection) => {
      const parent = asRecord(connection);
      return asArray<unknown>(parent.nodes).map((node) => normalizeNode(node, parent));
    });
  const guests = asArray<unknown>(body.guests).length
    ? asArray<unknown>(body.guests).map((guest) => normalizeGuest(guest))
    : rawEnabledConnections.flatMap((connection) => {
      const parent = asRecord(connection);
      return asArray<unknown>(parent.guests).map((guest) => normalizeGuest(guest, parent));
    });
  const storage = asArray<unknown>(body.storage).length
    ? asArray<unknown>(body.storage).map((item) => normalizeStorage(item))
    : rawEnabledConnections.flatMap((connection) => {
      const parent = asRecord(connection);
      return asArray<unknown>(parent.storage).map((item) => normalizeStorage(item, parent));
    });

  return {
    configured: Boolean(body.configured ?? connections.length > 0),
    demoMode: Boolean(body.demoMode),
    enabledConnections: asNumber(
      body.enabledConnections ?? body.enabledCount,
      connections.filter((connection) => connection.enabled).length,
    ),
    connections,
    nodes,
    guests,
    storage,
    lastSyncAt: asString(body.lastSyncAt ?? body.lastCheckedAt) || null,
    summary: {
      connections: asNumber(summary.connections, connections.length),
      enabledConnections: asNumber(
        summary.enabledConnections,
        connections.filter((connection) => connection.enabled).length,
      ),
      availableConnections: asNumber(
        summary.availableConnections ?? summary.connectionsAvailable,
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
  if (Array.isArray(body)) return body.map(normalizeConnection);
  return asArray<unknown>(asRecord(body).connections).map(normalizeConnection);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const backendUrl = useSettingsStore.getState().backendConfig?.backendUrl ?? getDefaultBackendUrl();
    return await apiFetch<T>({ backendUrl }, path, init);
  } catch (caught) {
    // Older Proxmox endpoints return a human-readable `error` string rather
    // than the standard `{ error: code, message }` envelope. Keep that useful
    // text while still using the configured, timeout-aware API client.
    if (caught instanceof ApiError && caught.message === "Request failed." && caught.code) {
      throw new Error(caught.code);
    }
    throw caught;
  }
}

const PROXMOX_AUTO_REFRESH_MS = 30_000;

function useVisibleAutoRefresh(
  refresh: () => void | Promise<void>,
  enabled = true,
): void {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshRef.current();
      }
    };
    const interval = window.setInterval(
      refreshWhenVisible,
      PROXMOX_AUTO_REFRESH_MS,
    );
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [enabled]);
}

function useProxmoxSnapshot(enabled = true) {
  const backendUrl = useSettingsStore((state) => state.backendConfig?.backendUrl) ?? getDefaultBackendUrl();
  const demoMode = useSettingsStore((state) => state.demoMode);
  const { data, error: queryError, isFetching, isPending, refetch } = useQuery({
    queryKey: ["proxmox", "snapshot", backendUrl, demoMode],
    queryFn: async () => normalizeSnapshot(await requestJson<unknown>("/api/proxmox")),
    enabled,
    refetchInterval: enabled ? PROXMOX_AUTO_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: PROXMOX_AUTO_REFRESH_MS / 2,
  });

  const reload = useCallback(async () => {
    await refetch({ cancelRefetch: false });
  }, [refetch]);

  return {
    snapshot: data ?? emptySnapshot,
    hasData: data !== undefined,
    loading: isPending && data === undefined,
    refreshing: isFetching && data !== undefined,
    error: queryError instanceof Error
      ? queryError.message
      : queryError
        ? "Unable to load Proxmox data."
        : null,
    reload,
  };
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

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export type ProxmoxStatusTone = "success" | "warning" | "danger" | "neutral";

const successStatuses = new Set(["available", "online", "running", "ok", "healthy", "enabled"]);
const warningStatuses = new Set(["warning", "stale", "pending"]);
const dangerStatuses = new Set(["critical", "offline", "unavailable", "error", "stopped"]);

export function normalizeProxmoxStatus(status: unknown): ProxmoxStatus {
  if (typeof status !== "string") return "unknown";
  const normalized = status.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return (normalized || "unknown") as ProxmoxStatus;
}

export function getProxmoxStatusPresentation(status: unknown): {
  normalized: ProxmoxStatus;
  label: string;
  tone: ProxmoxStatusTone;
} {
  const normalized = normalizeProxmoxStatus(status);
  const tone = successStatuses.has(normalized)
    ? "success"
    : warningStatuses.has(normalized)
      ? "warning"
      : dangerStatuses.has(normalized)
        ? "danger"
        : "neutral";
  return { normalized, label: titleCase(normalized), tone };
}

export function StatusBadge({ status }: { status: ProxmoxStatus | string }) {
  const presentation = getProxmoxStatusPresentation(status);
  return (
    <span
      className={`proxmox-status proxmox-status--${presentation.tone}`}
      data-status={presentation.normalized}
    >
      <span aria-hidden="true" className="proxmox-status__dot" />
      {presentation.label}
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
        <span className="proxmox-summary-card__label">Connections available</span>
        <strong className="proxmox-summary-card__value">
          {summaryValue(summary.availableConnections, summary.enabledConnections)}
        </strong>
        <small className="proxmox-summary-card__detail">{snapshot.connections.length} configured</small>
      </article>
      <article className="proxmox-summary-card proxmox-summary-card--green">
        <span className="proxmox-summary-card__label">Nodes online</span>
        <strong className="proxmox-summary-card__value">{summaryValue(summary.nodesOnline, summary.nodesTotal)}</strong>
        <small className="proxmox-summary-card__detail">Across all enabled connections</small>
      </article>
      <article className="proxmox-summary-card proxmox-summary-card--blue">
        <span className="proxmox-summary-card__label">Guests running</span>
        <strong className="proxmox-summary-card__value">{summaryValue(summary.guestsRunning, summary.guestsTotal)}</strong>
        <small className="proxmox-summary-card__detail">
          {summary.vmRunning ?? 0}/{summary.vmTotal ?? 0} VMs, {summary.lxcRunning ?? 0}/
          {summary.lxcTotal ?? 0} LXCs
        </small>
      </article>
      <article
        className={`proxmox-summary-card ${
          storageIssues > 0 ? "proxmox-summary-card--amber" : "proxmox-summary-card--green"
        }`}
      >
        <span className="proxmox-summary-card__label">Storage issues</span>
        <strong className="proxmox-summary-card__value">{storageIssues}</strong>
        <small className="proxmox-summary-card__detail">
          {summary.storageCritical ?? 0} critical, {summary.storageWarnings ?? 0} warning, {summary.storageUnavailable ?? 0} unavailable
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
              <MonitoredExternalLink
                href={connection.endpoint}
                label={`Open ${connection.name} at ${connection.endpoint}`}
                text={connection.endpoint}
              />
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

export function NodesTable({
  nodes,
  onViewNode,
}: {
  nodes: ProxmoxNode[];
  onViewNode?: (connectionId: string, node: string) => void;
}) {
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
      <table className="proxmox-table proxmox-node-table">
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
            <th className="proxmox-actions-heading">Actions</th>
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
                <td data-label="Actions" className="proxmox-node-row-actions">
                  <button
                    aria-label={`View details for ${node.node ?? node.name ?? "Proxmox node"}`}
                    className="proxmox-icon-button"
                    disabled={!node.connectionId || !(node.node ?? node.name)}
                    onClick={() => onViewNode?.(node.connectionId, node.node ?? node.name ?? "")}
                    title="View node details"
                    type="button"
                  >
                    <Eye size={16} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function filterProxmoxGuests(
  guests: ProxmoxGuest[],
  typeFilter: "all" | "qemu" | "lxc",
  statusFilter: "all" | "running" | "stopped",
): ProxmoxGuest[] {
  return guests.filter((guest) => {
    const kind = (guest.kind ?? guest.type ?? "").toLowerCase();
    const normalizedStatus = normalizeProxmoxStatus(guest.status);
    const typeMatches = typeFilter === "all" || kind === typeFilter;
    const statusMatches = statusFilter === "all" || normalizedStatus === statusFilter;
    return typeMatches && statusMatches;
  });
}

export function GuestsTable({ guests }: { guests: ProxmoxGuest[] }) {
  const [typeFilter, setTypeFilter] = useState<"all" | "qemu" | "lxc">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "stopped">("all");
  const filtered = useMemo(
    () => filterProxmoxGuests(guests, typeFilter, statusFilter),
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
          <table className="proxmox-table proxmox-guest-table">
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

export function ProxmoxPage({
  onViewNode,
}: {
  onViewNode?: (connectionId: string, node: string) => void;
}) {
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

  if (loading) {
    return (
      <div className="proxmox-page">
        <LoadingState label="Loading Proxmox inventory..." />
      </div>
    );
  }

  if (error && !snapshot.configured) {
    return (
      <div className="proxmox-page proxmox-page--enter">
        <Panel
          title="Proxmox VE"
          icon={<CloudCog size={18} />}
          actions={
            <button className="proxmox-button proxmox-button--secondary" onClick={reload} type="button">
              <RefreshCw size={16} />
              Retry
            </button>
          }
        >
          <ErrorBanner message={error} />
        </Panel>
      </div>
    );
  }

  return (
    <div className="proxmox-page proxmox-page--enter">
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
            <NodesTable nodes={snapshot.nodes} onViewNode={onViewNode} />
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

export const PROXMOX_NODE_HISTORY_RANGES: ReadonlyArray<{
  value: ProxmoxNodeHistoryRange;
  label: string;
}> = [
  { value: "1h", label: "1 hour" },
  { value: "6h", label: "6 hours" },
  { value: "12h", label: "12 hours" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

export function nextProxmoxNodeTab(
  current: ProxmoxNodeTab,
  key: string,
): ProxmoxNodeTab | null {
  if (key === "Home") return "overview";
  if (key === "End") return "history";
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  return current === "overview" ? "history" : "overview";
}

function availableText(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "Not available" : String(value);
}

function detailBytes(value: number | null): string {
  return value === null ? "Not available" : formatBytes(value);
}

function detailPercent(value: number | null): string {
  return value === null ? "Not available" : `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function detailDate(value: string | null): string {
  return value ? formatDate(value) : "Not available";
}

function formatRate(value: number | null): string {
  return value === null ? "Not available" : `${formatBytes(value)}/s`;
}

function DetailRows({
  rows,
}: {
  rows: Array<{ label: string; value: ReactNode; title?: string; long?: boolean }>;
}) {
  return (
    <dl className="proxmox-node-detail-list">
      {rows.map((row) => (
        <div className={row.long ? "proxmox-node-detail-row--long" : undefined} key={row.label}>
          <dt>{row.label}</dt>
          <dd title={row.title ?? (typeof row.value === "string" ? row.value : undefined)}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function NodeDetailCard({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`proxmox-node-detail-card ${className}`.trim()}>
      <header className="proxmox-node-detail-card__header">
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

function NodeResourceUsage({
  label,
  percent,
  used,
  total,
  tone,
}: {
  label: string;
  percent: number | null;
  used: number | null;
  total: number | null;
  tone: "cyan" | "amber";
}) {
  const hasCapacity = used !== null && total !== null;
  return (
    <div className="proxmox-node-resource-usage">
      <div className="proxmox-node-resource-usage__heading">
        <span>{label}</span>
        <strong>{detailPercent(percent)}</strong>
      </div>
      {percent !== null ? <ProgressBar tone={tone} value={percent} /> : null}
      <span className="proxmox-node-resource-usage__summary">
        {hasCapacity ? `${detailBytes(used)} / ${detailBytes(total)}` : "Not available"}
      </span>
    </div>
  );
}

export function ProxmoxNodeOverview({ detail }: { detail: ProxmoxNodeDetail }) {
  return (
    <div className="proxmox-node-overview-grid">
      <NodeDetailCard icon={<Server size={15} />} title="System">
        <DetailRows rows={[
          { label: "Display name", value: availableText(detail.displayName), title: detail.displayName },
          { label: "Node", value: availableText(detail.node), title: detail.node },
          { label: "Status", value: <StatusBadge status={detail.status as ProxmoxStatus} /> },
          { label: "Uptime", value: detail.uptimeSeconds === null ? "Not available" : formatUptime(detail.uptimeSeconds) },
          { label: "Last sync", value: detailDate(detail.lastSyncAt) },
        ]} />
      </NodeDetailCard>
      <NodeDetailCard icon={<Database size={15} />} title="Platform">
        <DetailRows rows={[
          { label: "Proxmox VE", value: availableText(detail.platform.pveVersion), title: detail.platform.pveVersion ?? undefined, long: true },
          { label: "Kernel", value: availableText(detail.platform.kernelVersion), title: detail.platform.kernelVersion ?? undefined, long: true },
          { label: "Cluster", value: availableText(detail.platform.cluster), title: detail.platform.cluster ?? undefined },
          { label: "Connection", value: availableText(detail.platform.connection), title: detail.platform.connection ?? undefined },
        ]} />
      </NodeDetailCard>
      <NodeDetailCard icon={<Cpu size={15} />} title="Hardware">
        <DetailRows rows={[
          { label: "CPU model", value: availableText(detail.hardware.cpuModel), title: detail.hardware.cpuModel ?? undefined, long: true },
          { label: "CPU cores", value: availableText(detail.hardware.cpuCores) },
          { label: "CPU sockets", value: availableText(detail.hardware.cpuSockets) },
          { label: "Architecture", value: availableText(detail.hardware.architecture) },
        ]} />
      </NodeDetailCard>
      <NodeDetailCard icon={<MemoryStick size={15} />} title="Memory">
        <NodeResourceUsage label="Usage" percent={detail.memory.usagePercent} used={detail.memory.usedBytes} total={detail.memory.totalBytes} tone="amber" />
        <DetailRows rows={[
          { label: "Free", value: detailBytes(detail.memory.freeBytes) },
          { label: "Reclaimable / cache", value: detailBytes(detail.memory.reclaimableBytes) },
        ]} />
      </NodeDetailCard>
      <NodeDetailCard icon={<HardDrive size={15} />} title="Storage">
        <NodeResourceUsage label="Root usage" percent={detail.storage.usagePercent} used={detail.storage.usedBytes} total={detail.storage.totalBytes} tone="cyan" />
        <DetailRows rows={[
          { label: "Root free", value: detailBytes(detail.storage.freeBytes) },
          { label: "Disk read", value: formatRate(detail.storage.readBytesPerSecond) },
          { label: "Disk write", value: formatRate(detail.storage.writeBytesPerSecond) },
        ]} />
      </NodeDetailCard>
      <NodeDetailCard icon={<Network size={15} />} title="Telemetry">
        <DetailRows rows={[
          { label: "Connection health", value: <StatusBadge status={detail.connectionStatus as ProxmoxStatus} /> },
          { label: "Network input", value: formatRate(detail.telemetry.networkInBytesPerSecond) },
          { label: "Network output", value: formatRate(detail.telemetry.networkOutBytesPerSecond) },
          { label: "Monitoring state", value: titleCase(detail.telemetry.state) },
          { label: "Source", value: detail.telemetry.source, title: detail.telemetry.source },
          { label: "Last telemetry", value: detailDate(detail.lastTelemetryAt) },
        ]} />
      </NodeDetailCard>
      <NodeDetailCard icon={<Thermometer size={15} />} title="Thermals">
        {detail.thermals.sensors.length ? (
          <DetailRows rows={[
            ...detail.thermals.sensors.map((sensor) => ({ label: sensor.name, value: `${sensor.celsius.toFixed(1)}°C` })),
            { label: "Last updated", value: detailDate(detail.thermals.lastUpdatedAt) },
          ]} />
        ) : (
          <div className="proxmox-node-unavailable">
            <Thermometer aria-hidden="true" size={18} />
            <strong>Not available</strong>
            <span>Temperature telemetry is not exposed by this node.</span>
          </div>
        )}
      </NodeDetailCard>
    </div>
  );
}

type HistorySeries = {
  key: keyof Omit<ProxmoxNodeHistoryPoint, "timestamp" | "temperaturesCelsius">;
  label: string;
  color: string;
};

const PROXMOX_CHART_WIDTH = 640;
const PROXMOX_CHART_HEIGHT = 230;
const PROXMOX_CHART_PLOT = { left: 72, right: 14, top: 16, bottom: 30 };

function chartPath(
  points: ProxmoxNodeHistoryPoint[],
  key: HistorySeries["key"],
  width: number,
  height: number,
  max: number,
): string {
  const plot = PROXMOX_CHART_PLOT;
  let path = "";
  points.forEach((point, index) => {
    const value = point[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const x = plot.left + (index / Math.max(1, points.length - 1)) * (width - plot.left - plot.right);
    const y = plot.top + (1 - Math.max(0, Math.min(max, value)) / max) * (height - plot.top - plot.bottom);
    const previous = index > 0 ? points[index - 1]?.[key] : null;
    path += `${typeof previous === "number" ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)} `;
  });
  return path.trim();
}

function compactAxisTime(timestamp: string, range: ProxmoxNodeHistoryRange): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat(undefined, range.endsWith("h")
    ? { hour: "2-digit", minute: "2-digit" }
    : { month: "short", day: "numeric" }).format(date);
}

function ProxmoxHistoryChart({
  title,
  icon,
  points,
  series,
  range,
  percent = false,
}: {
  title: string;
  icon: ReactNode;
  points: ProxmoxNodeHistoryPoint[];
  series: HistorySeries[];
  range: ProxmoxNodeHistoryRange;
  percent?: boolean;
}) {
  const usable = points.filter((point) => series.some((item) => typeof point[item.key] === "number"));
  const [activeIndex, setActiveIndex] = useState(Math.max(0, usable.length - 1));
  const width = PROXMOX_CHART_WIDTH;
  const height = PROXMOX_CHART_HEIGHT;
  const values = usable.flatMap((point) => series.map((item) => point[item.key])).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const max = percent ? 100 : Math.max(1, ...values) * 1.08;
  const active = usable[Math.min(activeIndex, Math.max(0, usable.length - 1))];
  const valueFormatter = percent ? (value: number) => `${value.toFixed(1)}%` : (value: number) => formatRate(value);

  useEffect(() => {
    setActiveIndex(Math.max(0, usable.length - 1));
  }, [usable.length]);

  if (!usable.length) {
    return (
      <HistoryUnavailableCard description="No usable samples were returned for this metric." icon={icon} title={title} />
    );
  }

  const updateFromPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    setActiveIndex(Math.round(ratio * (usable.length - 1)));
  };

  return (
    <section className="proxmox-history-chart-card">
      <header className="proxmox-history-chart-card__header">
        <div className="proxmox-history-chart-card__title">
          <span aria-hidden="true">{icon}</span>
          <h2>{title}</h2>
        </div>
        <div className="proxmox-chart-legend" aria-label={`${title} legend`}>
          {series.map((item) => {
            const latest = active?.[item.key];
            return <span key={item.key}><i style={{ backgroundColor: item.color }} />{item.label} <strong>{typeof latest === "number" ? valueFormatter(latest) : "Not available"}</strong></span>;
          })}
        </div>
      </header>
      <div className="proxmox-history-chart-wrap">
        <svg
          aria-label={`${title} history. Use left and right arrow keys to inspect samples.`}
          className="proxmox-history-chart"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") { event.preventDefault(); setActiveIndex((value) => Math.max(0, value - 1)); }
            if (event.key === "ArrowRight") { event.preventDefault(); setActiveIndex((value) => Math.min(usable.length - 1, value + 1)); }
          }}
          onPointerMove={updateFromPointer}
          role="img"
          tabIndex={0}
          viewBox={`0 0 ${width} ${height}`}
        >
          {[0, 0.5, 1].map((ratio) => {
            const y = PROXMOX_CHART_PLOT.top + ratio * (height - PROXMOX_CHART_PLOT.top - PROXMOX_CHART_PLOT.bottom);
            const value = max * (1 - ratio);
            return <g key={ratio}><line className="proxmox-chart-grid-line" x1={PROXMOX_CHART_PLOT.left} x2={width - PROXMOX_CHART_PLOT.right} y1={y} y2={y} /><text className="proxmox-chart-axis" x={PROXMOX_CHART_PLOT.left - 7} y={y + 4} textAnchor="end">{percent ? `${Math.round(value)}%` : formatRate(value)}</text></g>;
          })}
          {series.map((item) => <path className="proxmox-chart-line" d={chartPath(usable, item.key, width, height, max)} key={item.key} style={{ stroke: item.color }} />)}
          {active ? (() => {
            const x = PROXMOX_CHART_PLOT.left + (activeIndex / Math.max(1, usable.length - 1)) * (width - PROXMOX_CHART_PLOT.left - PROXMOX_CHART_PLOT.right);
            return <line className="proxmox-chart-cursor" x1={x} x2={x} y1={PROXMOX_CHART_PLOT.top} y2={height - PROXMOX_CHART_PLOT.bottom} />;
          })() : null}
          <text className="proxmox-chart-axis" x={PROXMOX_CHART_PLOT.left} y={height - 8}>{compactAxisTime(usable[0]!.timestamp, range)}</text>
          <text className="proxmox-chart-axis" x={width - PROXMOX_CHART_PLOT.right} y={height - 8} textAnchor="end">{compactAxisTime(usable.at(-1)!.timestamp, range)}</text>
        </svg>
      </div>
      <div className="proxmox-chart-current" aria-live="polite">
        <span>Selected sample</span>
        <strong>{active ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(active.timestamp)) : "Not available"}</strong>
      </div>
    </section>
  );
}

function HistoryUnavailableCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <section className="proxmox-history-chart-card proxmox-history-chart-card--unavailable">
      <header className="proxmox-history-chart-card__header">
        <div className="proxmox-history-chart-card__title">
          <span aria-hidden="true">{icon}</span>
          <h2>{title}</h2>
        </div>
      </header>
      <div className="proxmox-node-unavailable">
        <span aria-hidden="true" className="proxmox-node-unavailable__icon">{icon}</span>
        <strong>Not available</strong>
        <span>{description}</span>
      </div>
    </section>
  );
}

export function ProxmoxNodeHistoryView({
  history,
}: {
  history: ProxmoxNodeHistory;
}) {
  return (
    <div className="proxmox-node-history-grid">
      <ProxmoxHistoryChart
        icon={<Activity size={15} />}
        percent
        points={history.points}
        range={history.range}
        series={[
          { key: "cpuUsagePercent", label: "CPU", color: "#8b5cf6" },
          { key: "memoryUsagePercent", label: "Memory", color: "#f59e0b" },
          { key: "rootUsagePercent", label: "Root", color: "#22c55e" },
        ]}
        title="Utilization"
      />
      <ProxmoxHistoryChart
        icon={<Network size={15} />}
        points={history.points}
        range={history.range}
        series={[
          { key: "networkInBytesPerSecond", label: "Inbound", color: "#10b981" },
          { key: "networkOutBytesPerSecond", label: "Outbound", color: "#fb923c" },
        ]}
        title="Network I/O"
      />
      <ProxmoxHistoryChart
        icon={<HardDrive size={15} />}
        points={history.points}
        range={history.range}
        series={[
          { key: "diskReadBytesPerSecond", label: "Read", color: "#3b82f6" },
          { key: "diskWriteBytesPerSecond", label: "Write", color: "#f59e0b" },
        ]}
        title="Disk I/O"
      />
      <HistoryUnavailableCard description="Temperature history is not exposed by this node." icon={<Thermometer size={15} />} title="Thermals" />
    </div>
  );
}

function ProxmoxNodeSkeleton({ view }: { view: ProxmoxNodeTab }) {
  const count = view === "history" ? 4 : 7;
  return (
    <div aria-label={view === "history" ? "Loading history" : "Loading node overview"} className={`proxmox-node-skeleton proxmox-node-skeleton--${view}`} role="status">
      {Array.from({ length: count }, (_, index) => (
        <div className="proxmox-node-skeleton__card" key={index}>
          <span />
          <i />
          <i />
          <i />
        </div>
      ))}
    </div>
  );
}

export function ProxmoxNodeDetailPage({
  connectionId,
  node,
  tab,
  range,
  onBack,
  onTabChange,
  onRangeChange,
}: {
  connectionId: string;
  node: string;
  tab: ProxmoxNodeTab;
  range: ProxmoxNodeHistoryRange;
  onBack: () => void;
  onTabChange: (tab: ProxmoxNodeTab) => void;
  onRangeChange: (range: ProxmoxNodeHistoryRange) => void;
}) {
  const detail = useProxmoxNodeDetail(connectionId, node);
  const history = useProxmoxNodeHistory(connectionId, node, range, tab === "history");
  const tabs: ProxmoxNodeTab[] = ["overview", "history"];

  const handleTabKey = (event: React.KeyboardEvent<HTMLButtonElement>, current: ProxmoxNodeTab) => {
    const next = nextProxmoxNodeTab(current, event.key);
    if (!next) return;
    event.preventDefault();
    onTabChange(next);
    window.requestAnimationFrame(() => document.getElementById(`proxmox-node-tab-${next}`)?.focus());
  };

  return (
    <div className="proxmox-page proxmox-node-page">
      <header className="proxmox-node-heading">
        <button aria-label="Back to Proxmox" className="proxmox-icon-button" onClick={onBack} title="Back to Proxmox" type="button"><ArrowLeft size={16} /></button>
        <div className="proxmox-node-heading__identity">
          <h2>{detail.data?.displayName ?? node}</h2>
          <p>{detail.data ? `${detail.data.node} · ${detail.data.connectionName}` : node}</p>
        </div>
        <div className="proxmox-node-heading__state">
          {detail.data ? <StatusBadge status={detail.data.status as ProxmoxStatus} /> : null}
          <span className="proxmox-node-heading__sync">Last sync {detailDate(detail.data?.lastSyncAt ?? null)}</span>
        </div>
      </header>

      <div className="proxmox-node-tabs">
        <div className="proxmox-node-tabs__list" role="tablist" aria-label="Proxmox node details">
          {tabs.map((value) => (
            <button aria-controls={`proxmox-node-${value}`} aria-selected={tab === value} id={`proxmox-node-tab-${value}`} key={value} onClick={() => onTabChange(value)} onKeyDown={(event) => handleTabKey(event, value)} role="tab" tabIndex={tab === value ? 0 : -1} type="button">{titleCase(value)}</button>
          ))}
        </div>
        {tab === "history" ? (
          <div className="proxmox-history-controls">
            {history.isFetching && history.data ? <span className="proxmox-history-controls__refresh" role="status"><LoaderCircle className="proxmox-spin" size={13} />Refreshing</span> : null}
            <span aria-hidden="true" className="proxmox-history-controls__label">Range</span>
            <NodeGuardSelect
              className="proxmox-history-range-select"
              label="History range"
              labelPosition="hidden"
              onChange={(value) => onRangeChange(value as ProxmoxNodeHistoryRange)}
              options={PROXMOX_NODE_HISTORY_RANGES}
              value={range}
            />
          </div>
        ) : null}
      </div>

      {detail.isPending && !detail.data ? <ProxmoxNodeSkeleton view={tab} /> : null}
      {detail.error && !detail.data ? (
        <Panel title="Node unavailable" icon={<AlertTriangle size={18} />} actions={<button className="proxmox-button proxmox-button--secondary" onClick={() => void detail.refetch()} type="button"><RefreshCw size={16} />Retry</button>}>
          <ErrorBanner message={detail.error instanceof Error ? detail.error.message : "Unable to load the Proxmox node."} />
        </Panel>
      ) : null}
      {detail.error && detail.data ? <div className="proxmox-node-stale-notice">Showing the last available node details. Refresh failed.</div> : null}
      {detail.data?.stale ? <div className="proxmox-node-stale-notice">This node is showing stale Proxmox telemetry from the last successful synchronization.</div> : null}

      {tab === "overview" && detail.data ? (
        <div aria-labelledby="proxmox-node-tab-overview" id="proxmox-node-overview" role="tabpanel"><ProxmoxNodeOverview detail={detail.data} /></div>
      ) : null}

      {tab === "history" && !detail.isPending ? (
        <div aria-labelledby="proxmox-node-tab-history" id="proxmox-node-history" role="tabpanel">
          {history.isPending && !history.data ? <ProxmoxNodeSkeleton view="history" /> : null}
          {history.error && !history.data ? (
            <Panel title="History unavailable" icon={<AlertTriangle size={18} />} actions={<button className="proxmox-button proxmox-button--secondary" onClick={() => void history.refetch()} type="button"><RefreshCw size={16} />Retry</button>}>
              <ErrorBanner message={history.error instanceof Error ? history.error.message : "Unable to load Proxmox history."} />
            </Panel>
          ) : null}
          {history.error && history.data ? <div className="proxmox-node-stale-notice">Showing the last available history. Refresh failed.</div> : null}
          {history.data && history.data.points.length === 0 ? <EmptyState title="No history available" description="Proxmox returned no RRD samples for this node and range." icon={<Activity size={20} />} /> : null}
          {history.data && history.data.points.length > 0 ? <ProxmoxNodeHistoryView history={history.data} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function Dialog({
  title,
  description,
  icon,
  children,
  onClose,
  returnFocus,
  closeDisabled = false,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: (close: () => void) => ReactNode;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
  closeDisabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef(returnFocus);
  const closeDisabledRef = useRef(closeDisabled);
  const closeTimerRef = useRef<number | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const reactId = useId().replace(/:/g, "");
  const titleId = `proxmox-dialog-title-${reactId}`;
  const descriptionId = description ? `proxmox-dialog-description-${reactId}` : undefined;

  useEffect(() => {
    onCloseRef.current = onClose;
    returnFocusRef.current = returnFocus;
    closeDisabledRef.current = closeDisabled;
  }, [closeDisabled, onClose, returnFocus]);

  const close = useCallback(() => {
    if (closeTimerRef.current !== null) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), 170);
  }, []);

  const requestClose = useCallback(() => {
    if (!closeDisabledRef.current) close();
  }, [close]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = document.body;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const computedPaddingRight = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${computedPaddingRight + scrollbarWidth}px`;

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusInitialControl = () => {
      const dialog = dialogRef.current;
      const initial = dialog?.querySelector<HTMLElement>("[data-autofocus]")
        ?? dialog?.querySelector<HTMLElement>(focusableSelector);
      (initial ?? dialog)?.focus();
    };
    const animationFrame = window.requestAnimationFrame(focusInitialControl);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      document.removeEventListener("keydown", handleKeyDown);
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
      (returnFocusRef.current ?? previous)?.focus();
    };
  }, [requestClose]);

  return createPortal(
    <div
      className={`proxmox-dialog-backdrop${isClosing ? " is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      role="presentation"
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="proxmox-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="proxmox-dialog__header">
          {icon ? <span className="proxmox-dialog__icon" aria-hidden="true">{icon}</span> : null}
          <div className="proxmox-dialog__heading">
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            aria-label="Close dialog"
            className="proxmox-icon-button"
            disabled={closeDisabled}
            onClick={requestClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        {children(close)}
      </div>
    </div>,
    document.body,
  );
}

function ConnectionFormDialog({
  initial,
  onClose,
  onSaved,
  returnFocus,
}: {
  initial: ConnectionForm;
  onClose: () => void;
  onSaved: () => Promise<void>;
  returnFocus?: HTMLElement | null;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const update = <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage(null);
  };

  const payload = () => ({
    name: form.name.trim(),
    baseUrl: form.endpoint.trim(),
    tokenUser: form.tokenUser.trim(),
    tokenId: form.tokenId.trim(),
    ...(form.tokenSecret ? { tokenSecret: form.tokenSecret } : {}),
    ...(form.customCa ? { customCa: form.customCa } : {}),
    enabled: form.enabled,
  });

  const testConnection = async () => {
    if (saving || testing || !formRef.current?.reportValidity()) return;
    setTesting(true);
    setMessage(null);
    try {
      await requestJson("/api/proxmox/connections/test", {
        method: "POST",
        body: JSON.stringify({ ...payload(), ...(form.id ? { id: form.id } : {}) }),
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

  const submit = async (event: FormEvent, closeDialog: () => void) => {
    event.preventDefault();
    if (saving || testing) return;
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
      closeDialog();
    } catch (caught) {
      setMessage({
        tone: "error",
        text: caught instanceof Error ? caught.message : "Unable to save the Proxmox connection.",
      });
      setSaving(false);
    }
  };

  const busy = saving || testing;
  return (
    <Dialog
      title={form.id ? "Edit Proxmox connection" : "Add Proxmox connection"}
      description="Connect a Proxmox VE cluster using a read-only PVEAuditor API token. Credentials are encrypted and stored only by the NodeGuard backend."
      icon={<CloudCog size={20} />}
      onClose={onClose}
      returnFocus={returnFocus}
      closeDisabled={busy}
    >
      {(closeDialog) => <form className="proxmox-connection-form" onSubmit={(event) => void submit(event, closeDialog)} ref={formRef}>
        <div className="proxmox-dialog__body">
          <div className="proxmox-form-grid">
            <label className="proxmox-form-grid__wide">
              <span>Connection name</span>
              <input
                autoComplete="off"
                data-autofocus
                onChange={(event) => update("name", event.target.value)}
                placeholder="Primary cluster"
                required
                value={form.name}
              />
            </label>
            <label className="proxmox-form-grid__wide">
              <span>Proxmox API URL</span>
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
                value={form.customCa}
              />
              <small>Paste the trusted PEM certificate chain for private PKI. TLS verification is never disabled.</small>
            </label>
          </div>
          <label className="proxmox-checkbox-row">
            <input
              checked={form.enabled}
              onChange={(event) => update("enabled", event.target.checked)}
              type="checkbox"
            />
            <span className="proxmox-checkbox" aria-hidden="true"><Check size={13} /></span>
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
        </div>
        <footer className="proxmox-dialog__actions">
          <button className="proxmox-button proxmox-button--secondary" disabled={busy} onClick={closeDialog} type="button">
            Cancel
          </button>
          <button
            className="proxmox-button proxmox-button--secondary"
            disabled={busy}
            onClick={() => void testConnection()}
            type="button"
          >
            {testing ? <LoaderCircle className="proxmox-spin" size={16} /> : <ShieldCheck size={16} />}
            {testing ? "Testing…" : "Test connection"}
          </button>
          <button className="proxmox-button proxmox-button--primary" disabled={busy} type="submit">
            {saving ? <LoaderCircle className="proxmox-spin" size={16} /> : <LockKeyhole size={16} />}
            {saving ? (form.id ? "Saving…" : "Adding…") : (form.id ? "Save changes" : "Add connection")}
          </button>
        </footer>
      </form>}
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
  const remove = async (closeDialog: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/proxmox/connections/${encodeURIComponent(connection.id)}`, {
        method: "DELETE",
      });
      await onDeleted();
      closeDialog();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove the connection.");
      setBusy(false);
    }
  };
  return (
    <Dialog title="Remove Proxmox connection" onClose={onClose} closeDisabled={busy}>
      {(closeDialog) => <div className="proxmox-delete-dialog">
        <div className="proxmox-dialog__body">
          <AlertTriangle size={22} />
          <p>
            Remove <strong>{connection.name}</strong> and its cached Proxmox inventory from NodeGuard?
          </p>
          <p>This does not change anything in Proxmox VE. This action cannot be undone.</p>
          {error ? <ErrorBanner message={error} /> : null}
        </div>
        <footer className="proxmox-dialog__actions">
          <button className="proxmox-button proxmox-button--secondary" disabled={busy} onClick={closeDialog} type="button">
            Cancel
          </button>
          <button className="proxmox-button proxmox-button--danger" disabled={busy} onClick={() => void remove(closeDialog)} type="button">
            {busy ? <LoaderCircle className="proxmox-spin" size={16} /> : <Trash2 size={16} />}
            {busy ? "Removing…" : "Remove connection"}
          </button>
        </footer>
      </div>}
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
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<Promise<void> | null>(null);

  const load = useCallback((): Promise<void> => {
    if (requestRef.current) return requestRef.current;

    const request = (async () => {
      try {
        const payload = await requestJson<unknown>("/api/proxmox/connections");
        setConnections(normalizeConnections(payload));
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load Proxmox connections.");
      } finally {
        setLoading(false);
      }
    })();

    requestRef.current = request;
    void request.finally(() => {
      if (requestRef.current === request) requestRef.current = null;
    });
    return request;
  }, []);

  const reloadConnections = useCallback(async () => {
    const activeRequest = requestRef.current;
    if (activeRequest) await activeRequest;
    await load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const autoRefresh = useCallback(() => load(), [load]);
  useVisibleAutoRefresh(autoRefresh);

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
      await reloadConnections();
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
      tokenUser: connection.tokenUser ?? "",
      tokenId: connection.tokenId ?? "",
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
        <button className="proxmox-button proxmox-button--primary" onClick={() => setEditing(emptyForm)} ref={addButtonRef} type="button">
          <Plus size={16} />
          Add Proxmox connection
        </button>
      </header>
      <div className="proxmox-settings-section__body">
        <div className="proxmox-integration-heading">
          <span className="proxmox-integration-heading__icon"><CloudCog size={19} /></span>
          <div className="proxmox-integration-heading__copy">
            <strong>Proxmox VE</strong>
            <p>Monitor clusters, nodes, VMs, LXC containers, and storage using a PVEAuditor token.</p>
          </div>
          <span className={`proxmox-configuration-badge${connections.length ? " is-configured" : ""}`}>
            {loading ? "Checking…" : error && connections.length === 0 ? "Unavailable" : connections.length ? "Configured" : "Not configured"}
          </span>
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
        ) : error && connections.length === 0 ? null : connections.length === 0 ? (
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
                    <div className="proxmox-settings-row__details">
                      <MonitoredExternalLink
                        href={connection.endpoint}
                        label={`Open ${connection.name} at ${connection.endpoint}`}
                        text={connection.endpoint}
                      />
                      <span className="proxmox-settings-row__sync">
                        <span aria-hidden="true" className="proxmox-settings-row__separator">•</span>
                        <span>Last successful sync {formatDate(connection.lastSuccessfulSyncAt)}{connection.errorMessage ? ` - ${connection.errorMessage}` : ""}</span>
                      </span>
                    </div>
                  </div>
                  <div className="proxmox-settings-row__counts">
                    <span>{formatCount(connection.nodeCount ?? 0, "node")}</span>
                    <span>{formatCount(connection.guestCount ?? 0, "guest")}</span>
                    <span>{formatCount(connection.storageCount ?? 0, "storage", "storage")}</span>
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
        <ConnectionFormDialog initial={editing} onClose={() => setEditing(null)} onSaved={reloadConnections} returnFocus={editing.id ? undefined : addButtonRef.current} />
      ) : null}
      {deleting ? (
        <DeleteConnectionDialog connection={deleting} onClose={() => setDeleting(null)} onDeleted={reloadConnections} />
      ) : null}
    </section>
  );
}

export type ProxmoxDashboardCardView = {
  state: "loading" | "unconfigured" | "disabled" | "unavailable" | "stale" | "healthy" | "warning";
  value: string;
  label: string;
  primaryDetail: string;
  secondaryDetail: string;
  issueCount: number;
};

export function getProxmoxDashboardCardView({
  snapshot,
  loading,
  error,
  hasData,
}: {
  snapshot: ProxmoxSnapshot;
  loading: boolean;
  error: string | null;
  hasData: boolean;
}): ProxmoxDashboardCardView {
  if (loading && !hasData) {
    return {
      state: "loading",
      value: "—",
      label: "Checking Proxmox",
      primaryDetail: "Loading inventory",
      secondaryDetail: "Updates automatically",
      issueCount: 0,
    };
  }

  if (error && !hasData) {
    return {
      state: "unavailable",
      value: "—",
      label: "Inventory unavailable",
      primaryDetail: "Proxmox API unavailable",
      secondaryDetail: "Open for details",
      issueCount: 1,
    };
  }

  if (!snapshot.configured) {
    return {
      state: "unconfigured",
      value: "—",
      label: "Not configured",
      primaryDetail: "No connection configured",
      secondaryDetail: "Set up in Settings",
      issueCount: 0,
    };
  }

  if (snapshot.enabledConnections === 0) {
    return {
      state: "disabled",
      value: "—",
      label: "Monitoring disabled",
      primaryDetail: `${snapshot.connections.length} configured`,
      secondaryDetail: "Enable in Settings",
      issueCount: 0,
    };
  }

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
  return {
    state: error ? "stale" : issueCount > 0 ? "warning" : "healthy",
    value: summaryValue(snapshot.summary.nodesOnline, snapshot.summary.nodesTotal),
    label: "Nodes online",
    primaryDetail: `${snapshot.summary.guestsRunning ?? 0}/${snapshot.summary.guestsTotal ?? 0} guests running`,
    secondaryDetail: error ? "Refresh failed" : issueCount > 0 ? `${issueCount} issues` : "Healthy",
    issueCount,
  };
}

export function ProxmoxDashboardCard({
  snapshot: providedSnapshot,
  onOpen,
}: {
  snapshot?: unknown;
  onOpen?: () => void;
}) {
  const shouldFetch = providedSnapshot === undefined;
  const { snapshot: fetchedSnapshot, hasData: fetchedHasData, loading, error } = useProxmoxSnapshot(shouldFetch);
  const snapshot = providedSnapshot === undefined ? fetchedSnapshot : normalizeSnapshot(providedSnapshot);
  const hasData = providedSnapshot !== undefined || fetchedHasData;
  const view = getProxmoxDashboardCardView({ snapshot, loading, error, hasData });

  const content = (
    <>
      <div className="proxmox-dashboard-card__heading">
        <span>Proxmox</span>
        <CloudCog size={18} />
      </div>
      <strong className="proxmox-dashboard-card__value">
        {view.value}
      </strong>
      <div className="proxmox-dashboard-card__label">{view.label}</div>
      <div className="proxmox-dashboard-card__details">
        <span>
          {view.state === "loading" ? <LoaderCircle className="proxmox-spin" size={14} /> : <Box size={14} />}
          {view.primaryDetail}
        </span>
        <span className={view.state === "healthy" ? "is-healthy" : view.state === "warning" || view.state === "unavailable" || view.state === "stale" ? "has-warning" : ""}>
          {view.state === "healthy" ? <CheckCircle2 size={14} /> : view.state === "warning" || view.state === "unavailable" || view.state === "stale" ? <AlertTriangle size={14} /> : <CloudCog size={14} />}
          {view.secondaryDetail}
        </span>
      </div>
    </>
  );

  return onOpen ? (
    <button aria-busy={view.state === "loading"} aria-label={`Open Proxmox: ${view.label}`} className={`proxmox-dashboard-card is-${view.state}`} onClick={onOpen} type="button">
      {content}
    </button>
  ) : (
    <article aria-busy={view.state === "loading"} className={`proxmox-dashboard-card is-${view.state}`}>{content}</article>
  );
}
