import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Bell, Boxes, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, Eye, EyeOff, FileText, Gauge, Globe2, Github, Heart, KeyRound, LoaderCircle, LogOut, PackageOpen, PanelLeftClose, PanelLeftOpen, Pencil, Plus, RadioTower, RefreshCcw, Search, Server, Settings, ShieldAlert, ShieldCheck, Trash2, X } from "lucide-react";
import { type CSSProperties, type TransitionEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { getDefaultBackendUrl, normalizeBackendUrl } from "./api/client";
import { getCurrentSession, logout as logoutSession } from "./api/endpoints";
import { normalizeApiError } from "./api/errors";
import { MonitoredExternalLink } from "./components/MonitoredExternalLink";
import { NodeGuardSelect } from "./components/NodeGuardSelect";
import { ProxmoxIcon } from "./components/ProxmoxIcon";
import { ProxmoxDashboardCard, ProxmoxPage, ProxmoxSettingsPanel } from "./components/ProxmoxIntegration";
import { appConfig } from "./config/appConfig";
import {
  useAddContainerMonitor,
  useAddDomain,
  useAddServerMonitor,
  useAgent,
  useAgentEnrollmentProgress,
  useAgentEnrollmentTokens,
  useAgents,
  useAlert,
  useAlerts,
  useContainer,
  useContainers,
  useDomains,
  useMachineUpdates,
  useOverview,
  useCreateAgentEnrollmentToken,
  useCreateAgentRotationToken,
  useDeleteAgent,
  useRemoveAlert,
  useRemoveContainerMonitor,
  useRemoveDomain,
  useRemoveServerMonitor,
  useRenameAgent,
  useRevokeAgent,
  useRevokeAgentEnrollmentToken,
  useRunChecks,
  useServer,
  useServers,
  useServerMetricHistory,
  useServerMetrics,
  useServerMonitors,
  useUpdateContainerMonitor,
  useUpdateDomain,
  useUpdateServerMonitor,
  useUpdates,
  useLogin
} from "./hooks/useNodeGuardQueries";
import { useSettingsStore } from "./store/settingsStore";
import type { AgentEnrollmentProgress, AgentStatus, AgentSummary, Alert, Container, ContainerMonitorStatus, CreatedAgentEnrollmentToken, DomainCheck, HealthStatus, MachinePackageUpdate, MachineUpdateSummary, MetricHistory, MetricHistoryPoint, MetricHistoryRange, MetricHistorySummary, MonitoredServerStatus, Server as NodeGuardServer } from "./types/nodeguard";
import { getContainerImageRepositoryUrl } from "./utils/containerImage";
import { buildAgentCommand } from "./utils/agentCommand";
import { formatBytes, formatDateTime, formatPercentage, formatRelativeTime, formatResponseTime, formatUptime } from "./utils/format";
import { getStatusLabel, getStatusTone } from "./utils/status";
import { currentUpdateCoverage, formatUpdateCount, getMachineUpdateCondition, hasRetainedUpdateInventory, updateSummaryHasCurrentData, updateSummaryUsesRetainedData } from "./utils/updatePresentation";

type View = "dashboard" | "server" | "proxmox" | "agents" | "containers" | "domains" | "updates" | "alerts" | "settings";
type MetricTone = "blue" | "green" | "orange" | "red" | "purple";
type BreakdownItem = { label: string; value: string; tone?: MetricTone };
type HistoricalResource = "cpu" | "memory" | "disk" | "swap";
type HistoricalMetricKey = "cpuUsagePercent" | "memoryUsagePercent" | "diskUsagePercent" | "swapUsagePercent";

function LogoMark({ className, label }: { className: string; label?: string }) {
  return (
    <svg
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      viewBox="0 0 128 128"
    >
      <defs>
        <linearGradient id="nodeguardMarkGradient" x1="25" y1="20" x2="103" y2="111" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38d9ff" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <path
        d="M64 10C48 20.6 33.1 27 19 30.1v33.1c0 27.9 17.8 43.6 45 54.8 27.2-11.2 45-26.9 45-54.8V30.1C94.9 27 80 20.6 64 10Z"
        fill="none"
        stroke="url(#nodeguardMarkGradient)"
        strokeWidth="4.8"
        strokeLinejoin="round"
      />
      <path
        d="M41 52.5V74.5M47 50L58 61M71 71.9L80 78.1M87 52.5V74.5"
        fill="none"
        stroke="url(#nodeguardMarkGradient)"
        strokeWidth="4.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="41" cy="44" r="8.5" fill="transparent" stroke="url(#nodeguardMarkGradient)" strokeWidth="4.8" />
      <circle cx="41" cy="83" r="8.5" fill="transparent" stroke="url(#nodeguardMarkGradient)" strokeWidth="4.8" />
      <circle cx="64" cy="67" r="8.5" fill="transparent" stroke="url(#nodeguardMarkGradient)" strokeWidth="4.8" />
      <circle cx="87" cy="44" r="8.5" fill="transparent" stroke="url(#nodeguardMarkGradient)" strokeWidth="4.8" />
      <circle cx="87" cy="83" r="8.5" fill="transparent" stroke="url(#nodeguardMarkGradient)" strokeWidth="4.8" />
    </svg>
  );
}

function StatusPill({ status }: { status: HealthStatus | Alert["severity"] }) {
  return <span className={`pill ${getStatusTone(status)}`}>{getStatusLabel(status)}</span>;
}

function Panel({ title, children, action, className = "" }: { title: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`.trim()}>
      <div className="panel-header">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = "blue",
  onClick,
  selected = false,
  subdued = false,
  indicator
}: {
  label: string;
  value: string;
  detail: string;
  tone?: MetricTone;
  onClick?: () => void;
  selected?: boolean;
  subdued?: boolean;
  indicator?: React.ReactNode;
}) {
  const content = (
    <>
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${subdued ? "subdued-value" : ""}`}>{value}</div>
      {indicator}
      <div className="metric-detail">{detail}</div>
    </>
  );

  if (onClick) {
    return <button className={`metric-card metric-button ${tone} ${selected ? "selected" : ""}`} onClick={onClick} aria-pressed={selected} aria-expanded={selected}>{content}</button>;
  }

  return (
    <div className={`metric-card ${tone}`}>
      {content}
    </div>
  );
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function percentage(part: number, total: number) {
  if (total <= 0) return 0;
  return clampPercent((part / total) * 100);
}

function MetricMeter({ value, tone = "blue", label, rows = [] }: { value: number; tone?: MetricTone; label: string; rows?: BreakdownItem[] }) {
  const width = clampPercent(value);
  return (
    <div className="metric-indicator">
      <div className="meter-head">
        <span>{label}</span>
        <strong>{width}%</strong>
      </div>
      <div className="meter-track" aria-hidden="true">
        <span className={`meter-fill ${tone}`} style={{ "--meter-width": `${width}%` } as CSSProperties} />
      </div>
      {rows.length ? <MetricBreakdown rows={rows} /> : null}
    </div>
  );
}

function MetricBreakdown({ rows }: { rows: BreakdownItem[] }) {
  return (
    <div className="metric-breakdown">
      {rows.map((item) => (
        <div className="breakdown-item" key={item.label}>
          <span>{item.label}</span>
          <strong className={item.tone ?? ""}>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function MetricDiagnostic({ rows }: { rows: BreakdownItem[] }) {
  return (
    <div className="metric-indicator diagnostic">
      <MetricBreakdown rows={rows} />
    </div>
  );
}

type StateBlockTone = "empty" | "loading" | "error";

function StateBlock({ title, message, tone = "empty", icon }: { title: string; message: string; tone?: StateBlockTone; icon?: React.ReactNode }) {
  const Icon = tone === "loading" ? LoaderCircle : tone === "error" ? AlertTriangle : PackageOpen;
  return (
    <div className={`state-block state-block--${tone}`} role={tone === "error" ? "alert" : "status"} aria-live={tone === "loading" ? "polite" : undefined}>
      {icon ?? <Icon className={tone === "loading" ? "is-spinning" : undefined} size={18} aria-hidden="true" />}
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}

function StaleNotice({ isError, dataUpdatedAt }: { isError: boolean; dataUpdatedAt: number }) {
  if (!isError || !dataUpdatedAt) return null;
  if (Date.now() - dataUpdatedAt < 15000) return null;
  return <div className="stale-notice" role="status">Showing last known status from {formatDateTime(new Date(dataUpdatedAt).toISOString())}. Live refresh failed.</div>;
}

function SuccessNotice({ message, onDismiss }: { message: string; onDismiss: (value: null) => void }) {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const closeTimer = window.setTimeout(() => setIsClosing(true), 3900);
    const dismissTimer = window.setTimeout(() => onDismiss(null), 4140);
    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [message, onDismiss]);

  return (
    <div className={`stale-notice success operation-success-message ${isClosing ? "is-closing" : ""}`} role="status">
      {message}
    </div>
  );
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function summarizeIssues(alerts: Alert[]) {
  if (alerts.length === 0) {
    return "No active issues detected.";
  }

  const dockerIssue = alerts.find((alert) => alert.id.includes("docker") || alert.affectedResource === "docker");
  const domainIssues = alerts.filter((alert) => alert.affectedResource.startsWith("http"));
  const issueNames = [
    dockerIssue ? "Docker unavailable" : null,
    domainIssues.length ? countLabel(domainIssues.length, "domain unreachable", "domains unreachable") : null
  ].filter(Boolean);

  return `${countLabel(alerts.length, "issue")} need attention${issueNames.length ? `: ${issueNames.join(" and ")}.` : "."}`;
}

function mainIssue(alerts: Alert[]) {
  const alert = alerts.find((item) => item.severity === "critical") ?? alerts[0];
  if (!alert) {
    return "All monitored checks are currently healthy.";
  }

  return alert.possibleCause ? `${alert.title}. ${alert.possibleCause}` : `${alert.title}. ${alert.message}`;
}

function statusTrend(status: HealthStatus | Alert["severity"]) {
  if (status === "healthy" || status === "resolved") return "Healthy";
  if (status === "warning") return "Needs attention";
  if (status === "critical" || status === "offline") return "Action required";
  return "Unknown";
}

function sslLabel(domain: DomainCheck) {
  if (!domain.https) return "No SSL";
  if (domain.sslExpiresInDays === null) return "SSL unknown";
  if (domain.sslExpiresInDays < 0) return "SSL expired";
  return `SSL expires in ${domain.sslExpiresInDays}d`;
}

function compactSslLabel(domain: DomainCheck) {
  if (!domain.https) return "No SSL";
  if (domain.sslExpiresInDays === null) return "SSL unknown";
  if (domain.sslExpiresInDays < 0) return "SSL expired";
  return `SSL ${domain.sslExpiresInDays}d`;
}

function compactUptimeLabel(domain: DomainCheck) {
  return domain.uptimePercent === null ? "Uptime pending" : `${domain.uptimePercent.toFixed(2)}% uptime`;
}

function latencyTrend(domain: DomainCheck) {
  if (domain.latencyTrendPercent === null || Math.abs(domain.latencyTrendPercent) < 2) {
    return { symbol: "→", label: "Latency is stable", tone: "stable" };
  }

  if (domain.latencyTrendPercent > 0) {
    return { symbol: "↑", label: `Latency increased by ${domain.latencyTrendPercent.toFixed(1)}%`, tone: "slower" };
  }

  return { symbol: "↓", label: `Latency decreased by ${Math.abs(domain.latencyTrendPercent).toFixed(1)}%`, tone: "faster" };
}

function fullDomainUrl(domain: DomainCheck) {
  return `${domain.domain}${domain.path === "/" ? "" : domain.path}`;
}

function parseExpectedStatusCodes(value: string) {
  const codes = [...new Set(
    value
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item >= 100 && item <= 599)
  )].sort((a, b) => a - b);

  if (codes.length === 0) {
    throw new Error("Enter at least one valid HTTP status code.");
  }

  return codes;
}

function duplicateName(name: string) {
  return `${name.trim() || "Monitor"} copy`;
}

function domainTargetKey(domain: string, path: string) {
  const value = domain.trim();
  const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  const normalizedPath = path.trim() || "/";
  return `${parsed.origin}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
}

function maskSensitiveUrl(value: string, hide: boolean) {
  if (!hide) return value;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.hostname.includes(".") ? "service.example.com" : "10.x.x.x"}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return "hidden";
  }
}

function Modal({ title, children, onClose, isClosing = false, closeDisabled = false, descriptionId }: { title: string; children: React.ReactNode; onClose: () => void; isClosing?: boolean; closeDisabled?: boolean; descriptionId?: string }) {
  const modalRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  const titleId = `modal-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  }, [closeDisabled, onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = modalRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    const focusableSelector = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
    const firstFocusable = modal?.querySelector<HTMLElement>("[data-autofocus]")
      ?? modal?.querySelector<HTMLElement>('input:not(:disabled), textarea:not(:disabled)')
      ?? modal?.querySelector<HTMLElement>(focusableSelector);
    window.requestAnimationFrame(() => firstFocusable?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeDisabledRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !modal) return;
      const focusable = [...modal.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }
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
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.paddingRight = previousBodyPaddingRight;
      window.requestAnimationFrame(() => {
        if (previouslyFocused?.isConnected) previouslyFocused.focus();
        else document.getElementById("main-content")?.focus();
      });
    };
  }, []);

  return createPortal(
    <div
      className={`modal-backdrop ${isClosing ? "is-closing" : ""}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose();
      }}
    >
      <section ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="modal-close" type="button" onClick={onClose} disabled={closeDisabled} aria-label="Close dialog"><X size={15} /></button>
        </div>
        {children}
      </section>
    </div>,
    document.body
  );
}

function DeleteConfirmationDialog({ title, resource, description, confirmLabel, busy, error, onClose, onConfirm }: { title: string; resource: string; description: string; confirmLabel: string; busy: boolean; error?: string | null; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal title={title} onClose={onClose} closeDisabled={busy}>
      <div className="confirmation-dialog compact-confirmation">
        <p>{description}</p>
        <p className="confirmation-resource"><strong>{resource}</strong></p>
        <p>This action cannot be undone.</p>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <div>
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="danger-button" type="button" onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {busy ? <LoaderCircle className="is-spinning" size={15} /> : <Trash2 size={15} />}
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ConnectScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveSession = useSettingsStore((state) => state.saveSession);
  const login = useLogin();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      const backendUrl = getDefaultBackendUrl();
      if (!username.trim() || !password) {
        setError("Enter your username and password.");
        return;
      }
      const session = await login.mutateAsync({
        config: { backendUrl },
        input: { username: username.trim(), password, rememberMe }
      });
      if (!session.authenticated || !session.user) {
        setError("Invalid username or password.");
        return;
      }
      saveSession(backendUrl, session.user);
    } catch (caught) {
      const apiError = normalizeApiError(caught);
      setError(apiError.code === "missing_api_key"
        ? "Your backend is still running the old API-key build. Stop the API server and start it again so the new username/password login routes are active."
        : apiError.message);
    }
  };

  return (
    <main className="login-shell">
      <div className="orbital-bg" />
      <form className="login-card" onSubmit={submit}>
        <div className="logo-mark"><LogoMark className="logo-mark-img" label="NodeGuard logo" /></div>
        <h1>Welcome to NodeGuard</h1>
        <p>Enter your credentials to continue.</p>
        <aside className="demo-login-card" aria-label="Demo Mode credentials">
          <span className="demo-login-icon"><KeyRound size={17} /></span>
          <span><strong>Demo Mode</strong><small>Login with <code>demo</code> / <code>demo</code></small></span>
        </aside>
        {error ? <div className="login-error" id="login-error" role="alert"><strong>Sign in failed</strong><span>{error}</span></div> : null}
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Username" aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} />
        </label>
        <label>
          Password
          <span className={`password-field ${showPassword ? "is-visible" : ""}`}>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter password"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              <span key={showPassword ? "hide" : "show"} className="password-toggle-icon">
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </span>
            </button>
          </span>
        </label>
        <label className="remember-option">
          <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
          <span>Remember me</span>
        </label>
        <button type="submit" disabled={login.isPending}>{login.isPending ? "Signing in..." : "Sign in to NodeGuard"}</button>
      </form>
    </main>
  );
}

function Dashboard({ setView }: { setView: (view: View) => void }) {
  const [refreshMessage, setRefreshMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const overview = useOverview();
  const server = useServer("local-node");
  const containers = useContainers();
  const domains = useDomains();
  const updates = useUpdates();
  const alerts = useAlerts();
  const runChecks = useRunChecks();
  const refreshIntervalSeconds = useSettingsStore((state) => state.refreshIntervalSeconds);
  const activeAlerts = alerts.data?.slice(0, 4) ?? [];
  const allAlerts = alerts.data ?? [];
  const healthAlerts = allAlerts.filter((alert) => alert.affectedResource !== "Update Center");
  const dockerUnavailable = containers.data && !containers.data.dockerAvailable;
  const domainItems = domains.data ?? [];
  const healthyDomains = domainItems.filter((domain) => domain.status === "healthy").length;
  const offlineDomains = domainItems.filter((domain) => domain.status === "offline" || domain.status === "critical").length;
  const warningDomains = Math.max(domainItems.length - healthyDomains - offlineDomains, 0);
  const containersRunning = overview.data?.containersRunning ?? 0;
  const containersTotal = overview.data?.containersTotal ?? 0;
  const containersStopped = Math.max(containersTotal - containersRunning, 0);
  const serversNeedAttention = Math.max(
    (overview.data?.serversTotal ?? 0) - (overview.data?.serversOnline ?? 0),
    0,
  );
  const serverTone: MetricTone = !server.data || !overview.data?.serversTotal
    ? "blue"
    : overview.data.serversOnline === overview.data.serversTotal
      ? "green"
      : overview.data.serversOnline === 0
        ? "red"
        : "orange";
  const serverDetail = server.data
    ? `${server.data.hostname} · ${statusTrend(server.data.status)}`
    : server.isError
      ? "Machine details unavailable"
      : "Checking machine details";
  const activeCriticalAlerts = allAlerts.filter((alert) => alert.status === "active" && alert.severity === "critical").length;
  const activeWarningAlerts = allAlerts.filter((alert) => alert.status === "active" && alert.severity === "warning").length;
  const domainTone: MetricTone = domains.data
    ? offlineDomains > 0 ? "red" : warningDomains > 0 ? "orange" : "green"
    : overview.data && overview.data.domainsOnline < overview.data.domainsTotal ? "orange" : "blue";
  const alertTone: MetricTone = overview.data?.criticalAlerts ? "red" : overview.data?.warnings ? "orange" : "green";
  const alertDataUnavailable = !alerts.data;
  const domainDataUnavailable = !domains.data;
  const updateDataUnavailable = !updates.data;
  const updateHasCurrentData = updateSummaryHasCurrentData(updates.data);
  const updateUsesRetainedData = updateSummaryUsesRetainedData(updates.data);
  const updateDetail = updateDataUnavailable
    ? "Update inventory unavailable"
    : updates.data.summaryState === "retained"
      ? `Last known ${updates.data.lastSuccessfulAt ? formatRelativeTime(updates.data.lastSuccessfulAt) : "inventory"} · no current reports`
      : updates.data.summaryState === "partial"
        ? `${currentUpdateCoverage(updates.data)} current · ${updates.data.retainedMachineCount} retained`
        : updates.data.lastCheckedAt
          ? `Last checked ${formatRelativeTime(updates.data.lastCheckedAt)}`
          : updates.data.totalMachineCount > 0
            ? "Waiting for first update inventory"
            : "No Agent update inventory";
  const updateTone: MetricTone = updateDataUnavailable || updates.data.availableCount === null
    ? "blue"
    : (updates.data.securityCriticalCount ?? 0) > 0
      ? "orange"
      : updates.data.availableCount > 0
        ? "blue"
        : updateUsesRetainedData ? "blue" : "green";
  const staleSupplementalSections = [
    server.isError && server.data ? "server" : null,
    alerts.isError && alerts.data ? "alerts" : null,
    containers.isError && containers.data ? "containers" : null,
    domains.isError && domains.data ? "domains" : null,
    updates.isError && updates.data ? "updates" : null,
  ].filter((section): section is string => Boolean(section));

  const refresh = async () => {
    setRefreshMessage(null);
    try {
      await runChecks.mutateAsync();
      setRefreshMessage({ text: `Refresh successful at ${formatDateTime(new Date().toISOString())}`, tone: "success" });
    } catch (error) {
      setRefreshMessage({ text: normalizeApiError(error).message, tone: "error" });
    }
  };

  if (overview.isLoading) return <StateBlock tone="loading" title="Loading dashboard" message="Reading live backend checks." />;
  if (!overview.data) return <StateBlock tone="error" title="Dashboard unavailable" message={normalizeApiError(overview.error).message} />;

  return (
    <div className="page-stack">
      <StaleNotice isError={overview.isError} dataUpdatedAt={overview.dataUpdatedAt} />
      {staleSupplementalSections.length > 0 ? (
        <div className="stale-notice" role="status">
          {staleSupplementalSections.join(", ")} could not refresh. Showing the last available data.
        </div>
      ) : null}
      <section className={`hero-panel ${getStatusTone(overview.data.status)}`}>
        <div>
          <span className="eyebrow">NodeGuard</span>
          <div className="hero-status" role="status" aria-live="polite">{getStatusLabel(overview.data.status)}</div>
          <p className="hero-summary">{alerts.data ? summarizeIssues(healthAlerts) : overview.data.criticalAlerts || overview.data.warnings ? `${countLabel(overview.data.criticalAlerts + overview.data.warnings, "issue")} need attention.` : "No active issues detected."}</p>
          {alerts.data && healthAlerts.length > 0 ? <p className="hero-main-issue"><span>Main issue</span>{mainIssue(healthAlerts)}</p> : null}
          <small>Last checked {formatDateTime(overview.data.lastCheckedAt)} · Live refresh every {refreshIntervalSeconds}s</small>
        </div>
        <button className="icon-button" onClick={refresh} disabled={runChecks.isPending}><RefreshCcw size={17} /> {runChecks.isPending ? "Refreshing..." : "Refresh"}</button>
      </section>
      {refreshMessage ? <div className={`stale-notice ${refreshMessage.tone === "success" ? "success" : ""}`} role={refreshMessage.tone === "error" ? "alert" : "status"}>{refreshMessage.text}</div> : null}
      <Panel title="Active issues" action={<button className="dashboard-panel-action" onClick={() => setView("alerts")}>View details</button>}>
        {alerts.isLoading && !alerts.data ? <StateBlock tone="loading" title="Loading active issues" message="Reading the latest alert state." /> : alerts.isError && !alerts.data ? <StateBlock tone="error" title="Active issues unavailable" message={normalizeApiError(alerts.error).message} /> : healthAlerts.length === 0 ? <StateBlock icon={<ShieldCheck size={18} aria-hidden="true" />} title="No active issues" message="All monitored checks are currently healthy." /> : (
          <div className="issue-list">
            {healthAlerts.slice(0, 3).map((alert) => <button className="issue-row" key={alert.id} onClick={() => setView("alerts")}><StatusPill status={alert.severity} /><span>{alert.title}</span></button>)}
          </div>
        )}
      </Panel>
      <div className="metric-grid dashboard-metric-grid">
        <MetricCard
          label="Machines online"
          value={`${overview.data.serversOnline}/${overview.data.serversTotal}`}
          detail={serverDetail}
          tone={serverTone}
          onClick={() => setView("server")}
          subdued={!server.data}
          indicator={<MetricMeter value={percentage(overview.data.serversOnline, overview.data.serversTotal)} tone={serverTone} label="Reachability" rows={[
            { label: "Online", value: String(overview.data.serversOnline), tone: "green" },
            { label: "Needs attention", value: String(serversNeedAttention), tone: serversNeedAttention === 0 ? "green" : overview.data.serversOnline === 0 ? "red" : "orange" }
          ]} />}
        />
        <MetricCard
          label="Agents online"
          value={`${overview.data.agentsOnline}/${overview.data.agentsTotal}`}
          detail={overview.data.agentsTotal === 0 ? "No remote agents registered" : `${overview.data.agentsTotal - overview.data.agentsOnline} need attention`}
          tone={overview.data.agentsOnline === overview.data.agentsTotal ? "green" : "orange"}
          onClick={() => setView("agents")}
          indicator={<MetricMeter value={percentage(overview.data.agentsOnline, overview.data.agentsTotal)} tone={overview.data.agentsOnline === overview.data.agentsTotal ? "green" : "orange"} label="Connected agents" rows={[
            { label: "Online", value: String(overview.data.agentsOnline), tone: "green" },
            { label: "Stale or offline", value: String(Math.max(overview.data.agentsTotal - overview.data.agentsOnline, 0)), tone: overview.data.agentsOnline === overview.data.agentsTotal ? "green" : "orange" }
          ]} />}
        />
        <MetricCard
          label="Docker"
          value={dockerUnavailable ? "Unavailable" : `${overview.data.containersRunning}/${overview.data.containersTotal}`}
          detail={dockerUnavailable ? "Backend could not read Docker state." : `${containersStopped} stopped or exited`}
          tone={dockerUnavailable ? "red" : "blue"}
          onClick={() => setView("containers")}
          subdued={Boolean(dockerUnavailable)}
          indicator={dockerUnavailable ? (
            <MetricDiagnostic rows={[
              { label: "Docker API", value: "Unavailable", tone: "red" },
              { label: "Container checks", value: "Paused", tone: "orange" }
            ]} />
          ) : (
            <MetricMeter value={percentage(overview.data.containersRunning, overview.data.containersTotal)} tone="blue" label="Running containers" rows={[
              { label: "Running", value: String(overview.data.containersRunning), tone: "green" },
              { label: "Stopped", value: String(containersStopped), tone: containersStopped > 0 ? "red" : "green" }
            ]} />
          )}
        />
        <MetricCard
          label="Domains online"
          value={`${overview.data.domainsOnline}/${overview.data.domainsTotal}`}
          detail={domains.data ? `${domainItems.length} services configured · SSL checked` : "Detailed domain checks unavailable"}
          tone={domainTone}
          onClick={() => setView("domains")}
          indicator={domainDataUnavailable ? <MetricDiagnostic rows={[
            { label: "Domain details", value: domains.isLoading ? "Checking" : "Unavailable", tone: domains.isError ? "red" : "blue" },
            { label: "Overview total", value: String(overview.data.domainsTotal), tone: "blue" }
          ]} /> : <MetricMeter value={percentage(overview.data.domainsOnline, overview.data.domainsTotal)} tone={domainTone} label="Reachable services" rows={[
            { label: "Healthy", value: String(healthyDomains), tone: "green" },
            { label: "Warnings", value: String(warningDomains), tone: warningDomains > 0 ? "orange" : "green" },
            { label: "Offline", value: String(offlineDomains), tone: offlineDomains > 0 ? "red" : "green" }
          ]} />}
        />
        <MetricCard
          label="Critical alerts"
          value={`${overview.data.criticalAlerts}`}
          detail={`${overview.data.warnings} warnings · ${statusTrend(overview.data.status)}`}
          tone={alertTone}
          onClick={() => setView("alerts")}
          indicator={<MetricDiagnostic rows={[
            { label: "Critical", value: String(alertDataUnavailable ? overview.data.criticalAlerts : activeCriticalAlerts), tone: (alertDataUnavailable ? overview.data.criticalAlerts : activeCriticalAlerts) > 0 ? "red" : "green" },
            { label: "Warning", value: String(alertDataUnavailable ? overview.data.warnings : activeWarningAlerts), tone: (alertDataUnavailable ? overview.data.warnings : activeWarningAlerts) > 0 ? "orange" : "green" },
            { label: "Active total", value: alertDataUnavailable ? "Unavailable" : String(allAlerts.length), tone: alertDataUnavailable ? "orange" : allAlerts.length > 0 ? "red" : "green" }
          ]} />}
        />
        <MetricCard
          label="Updates"
          value={updateDataUnavailable ? updates.isLoading ? "Checking" : "Unavailable" : formatUpdateCount(updates.data.availableCount)}
          detail={updateDetail}
          tone={updateTone}
          onClick={() => setView("updates")}
          subdued={updateDataUnavailable || !updateHasCurrentData || updateUsesRetainedData}
          indicator={<MetricDiagnostic rows={[
            { label: "Available", value: updateDataUnavailable ? "Unavailable" : formatUpdateCount(updates.data.availableCount), tone: updateDataUnavailable ? "orange" : (updates.data.availableCount ?? 0) > 0 ? "blue" : updates.data.availableCount === null ? "blue" : "green" },
            { label: "Security-critical", value: updateDataUnavailable ? "Unavailable" : formatUpdateCount(updates.data.securityCriticalCount), tone: updateDataUnavailable ? "orange" : (updates.data.securityCriticalCount ?? 0) > 0 ? "orange" : updates.data.securityCriticalCount === null ? "blue" : "green" },
            { label: "Current machines", value: updateDataUnavailable ? "Unavailable" : currentUpdateCoverage(updates.data), tone: updateDataUnavailable ? "orange" : updateHasCurrentData ? "green" : "blue" }
          ]} />}
        />
        <ProxmoxDashboardCard onOpen={() => setView("proxmox")} />
      </div>
      <div className="two-col">
        <Panel title="Recent alerts" action={<button className="dashboard-panel-action" onClick={() => setView("alerts")}>View all</button>} className={activeAlerts.length === 0 ? "recent-alerts-card" : undefined}>
          {alerts.isLoading && !alerts.data ? <div className="recent-alerts-body"><StateBlock tone="loading" title="Loading alerts" message="Reading recent alerts." /></div> : alerts.isError && !alerts.data ? <div className="recent-alerts-body"><StateBlock tone="error" title="Recent alerts unavailable" message={normalizeApiError(alerts.error).message} /></div> : activeAlerts.length === 0 ? <div className="recent-alerts-body"><StateBlock icon={<Bell size={18} aria-hidden="true" />} title="No alerts" message="No active alerts were generated." /></div> : activeAlerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)}
        </Panel>
        <Panel title="Domain reachability" action={<button className="dashboard-panel-action" onClick={() => setView("domains")}>Open</button>}>
          {domains.isLoading && !domains.data ? <StateBlock tone="loading" title="Loading domains" message="Reading recent reachability checks." /> : domains.isError && !domains.data ? <StateBlock tone="error" title="Domain reachability unavailable" message={normalizeApiError(domains.error).message} /> : domainItems.length === 0 ? <StateBlock icon={<Globe2 size={18} aria-hidden="true" />} title="No domains configured" message="Add a domain or service to begin reachability monitoring." /> : domainItems.slice(0, 4).map((domain) => <DomainRow key={domain.id} domain={domain} />)}
        </Panel>
      </div>
    </div>
  );
}

function formatCpuModel(server: NodeGuardServer) {
  const model = [server.cpuManufacturer, server.cpuModel].filter(Boolean).join(" ").trim();
  return model || "Unavailable";
}

function formatCpuCores(server: NodeGuardServer) {
  const logical = server.cpuCores === null ? "Unavailable" : `${server.cpuCores} logical`;
  const physical = server.cpuPhysicalCores === null ? null : `${server.cpuPhysicalCores} physical`;
  const speed = server.cpuSpeedGhz === null ? null : `${server.cpuSpeedGhz.toFixed(2)} GHz`;
  return [logical, physical, speed].filter(Boolean).join(" / ");
}

function formatIpAddresses(server: NodeGuardServer) {
  if (server.ipAddresses.length === 0) {
    return server.primaryIp ?? "Unavailable";
  }

  const visibleAddresses = server.ipAddresses.slice(0, 3);
  const remainingCount = server.ipAddresses.length - visibleAddresses.length;
  return `${visibleAddresses.join(", ")}${remainingCount > 0 ? ` +${remainingCount} more` : ""}`;
}

function ServerPage() {
  const [selectedHostId, setSelectedHostId] = useState("local-node");
  const [historyRange, setHistoryRange] = useState<MetricHistoryRange>("1h");
  const [selectedResource, setSelectedResource] = useState<HistoricalResource | null>(null);
  const [monitorName, setMonitorName] = useState("");
  const [monitorUrl, setMonitorUrl] = useState("");
  const [monitorApiKey, setMonitorApiKey] = useState("");
  const [allowInsecureTls, setAllowInsecureTls] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState<MonitoredServerStatus | null>(null);
  const [duplicatingMonitor, setDuplicatingMonitor] = useState<MonitoredServerStatus | null>(null);
  const [isMonitorModalOpen, setIsMonitorModalOpen] = useState(false);
  const [isMonitorModalClosing, setIsMonitorModalClosing] = useState(false);
  const [removingMonitor, setRemovingMonitor] = useState<MonitoredServerStatus | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const resourceHistoryRef = useRef<HTMLDivElement | null>(null);
  const servers = useServers();
  const serverHosts = (servers.data ?? []).filter((item): item is NodeGuardServer => "hostname" in item);
  const server = useServer(selectedHostId);
  const metrics = useServerMetrics(selectedHostId);
  const metricHistory = useServerMetricHistory(selectedHostId, historyRange, selectedResource !== null);
  const serverMonitors = useServerMonitors();
  const addServerMonitor = useAddServerMonitor();
  const updateServerMonitor = useUpdateServerMonitor();
  const removeServerMonitor = useRemoveServerMonitor();
  const toggleResourceHistory = (resource: HistoricalResource) => {
    setSelectedResource((current) => current === resource ? null : resource);
  };

  useEffect(() => {
    if (serverHosts.length > 0 && !serverHosts.some((host) => host.id === selectedHostId)) {
      setSelectedHostId(serverHosts[0].id);
      setSelectedResource(null);
    }
  }, [selectedHostId, serverHosts]);

  useEffect(() => {
    if (!selectedResource) return;

    const frame = window.requestAnimationFrame(() => {
      resourceHistoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedResource]);

  const resetMonitorForm = () => {
    setMonitorName("");
    setMonitorUrl("");
    setMonitorApiKey("");
    setAllowInsecureTls(false);
    setEditingMonitor(null);
    setDuplicatingMonitor(null);
    setIsMonitorModalOpen(false);
    setIsMonitorModalClosing(false);
    setFormError(null);
  };

  const closeMonitorModal = () => {
    if (isMonitorModalClosing) return;
    setIsMonitorModalClosing(true);
    window.setTimeout(resetMonitorForm, 190);
  };

  const openAddMonitor = () => {
    setMonitorName("");
    setMonitorUrl("");
    setMonitorApiKey("");
    setAllowInsecureTls(false);
    setEditingMonitor(null);
    setDuplicatingMonitor(null);
    setIsMonitorModalClosing(false);
    setFormError(null);
    setIsMonitorModalOpen(true);
  };

  const editMonitor = (monitor: MonitoredServerStatus) => {
    setMonitorName(monitor.name);
    setMonitorUrl(monitor.backendUrl);
    setMonitorApiKey("");
    setAllowInsecureTls(monitor.allowInsecureTls);
    setEditingMonitor(monitor);
    setDuplicatingMonitor(null);
    setIsMonitorModalClosing(false);
    setFormError(null);
    setIsMonitorModalOpen(true);
  };

  const duplicateMonitor = (monitor: MonitoredServerStatus) => {
    setMonitorName(duplicateName(monitor.name));
    setMonitorUrl(monitor.backendUrl);
    setMonitorApiKey("");
    setAllowInsecureTls(monitor.allowInsecureTls);
    setEditingMonitor(null);
    setDuplicatingMonitor(monitor);
    setIsMonitorModalClosing(false);
    setFormError(null);
    setIsMonitorModalOpen(true);
  };

  const saveMonitor = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const input = {
        name: monitorName,
        backendUrl: monitorUrl,
        apiKey: monitorApiKey || undefined,
        allowInsecureTls
      };

      if (editingMonitor) {
        await updateServerMonitor.mutateAsync({ id: editingMonitor.id, input });
        setSuccessMessage(`${monitorName.trim() || "Server"} was successfully updated.`);
      } else {
        await addServerMonitor.mutateAsync(input);
        setSuccessMessage(`${monitorName.trim() || "Server"} was successfully ${duplicatingMonitor ? "duplicated" : "added"}.`);
      }

      closeMonitorModal();
    } catch (error) {
      setFormError(normalizeApiError(error).message);
    }
  };

  const removeMonitor = async (monitor: MonitoredServerStatus) => {
    setActionError(null);
    setSuccessMessage(null);

    try {
      await removeServerMonitor.mutateAsync(monitor.id);
      setSuccessMessage(`${monitor.name} was successfully deleted.`);
      setRemovingMonitor(null);
    } catch (error) {
      setActionError(normalizeApiError(error).message);
    }
  };

  if (server.isLoading || metrics.isLoading) return <StateBlock tone="loading" title="Loading machine" message="Reading system metrics." />;
  if (!server.data || !metrics.data) return <StateBlock tone="error" title="Machine unavailable" message={normalizeApiError(server.error ?? metrics.error).message} />;
  return (
    <div className="page-stack">
      <StaleNotice isError={server.isError || metrics.isError} dataUpdatedAt={Math.max(server.dataUpdatedAt, metrics.dataUpdatedAt)} />
      <Panel title={server.data.name} action={(
        <div className="host-selector-actions">
          {serverHosts.length > 1 ? (
            <NodeGuardSelect
              className="host-selector"
              label="Host"
              labelPosition="inline"
              value={selectedHostId}
              options={serverHosts.map((host) => ({ value: host.id, label: host.name }))}
              onChange={(value) => { setSelectedHostId(value); setSelectedResource(null); }}
            />
          ) : null}
          <StatusPill status={server.data.status} />
        </div>
      )}>
        <div className="server-info-groups">
          <InfoGroup title="System">
            <Info label="Hostname" value={server.data.hostname} />
            <Info label="OS" value={server.data.os ?? "Unavailable"} />
            <Info label="Kernel" value={server.data.kernel ?? "Unavailable"} />
            <Info label="Architecture" value={[server.data.platform, server.data.architecture].filter(Boolean).join(" / ") || "Unavailable"} />
            <Info label="Uptime" value={formatUptime(server.data.uptimeSeconds)} />
          </InfoGroup>
          <InfoGroup title="Hardware">
            <Info label="CPU model" value={formatCpuModel(server.data)} />
            <Info label="CPU cores" value={formatCpuCores(server.data)} />
            <Info label="RAM installed" value={formatBytes(server.data.totalMemoryGb)} />
            <Info label="Root disk" value={formatBytes(server.data.totalDiskGb)} />
            <Info label="Swap" value={server.data.swapTotalGb === null || server.data.swapTotalGb === 0 ? "Not configured" : formatBytes(server.data.swapTotalGb)} />
          </InfoGroup>
          <InfoGroup title="Network & Runtime">
            <Info label="Primary IP" value={server.data.primaryIp ?? "Unavailable"} />
            <Info label="IP addresses" value={formatIpAddresses(server.data)} />
            <Info label="Docker" value={server.data.dockerAvailable ? server.data.dockerVersion ?? "Available" : "Unavailable"} />
            <Info label="Containers" value={server.data.dockerAvailable ? `${server.data.runningContainers} running / ${server.data.stoppedContainers} stopped` : "Not checked"} />
            <Info label="Monitoring source" value={server.data.source === "agent" ? `NodeGuard Agent${server.data.agentStatus ? ` · ${server.data.agentStatus}` : ""}` : "Local backend"} />
          </InfoGroup>
        </div>
      </Panel>
      <div className="metric-grid">
        <MetricCard
          label="CPU"
          value={formatPercentage(metrics.data.cpu.usagePercent)}
          detail={`Load ${metrics.data.cpu.loadAverage ?? "Unavailable"} · Last checked ${formatDateTime(metrics.data.createdAt)}`}
          tone="blue"
          onClick={() => toggleResourceHistory("cpu")}
          selected={selectedResource === "cpu"}
          indicator={<MetricMeter value={metrics.data.cpu.usagePercent ?? 0} tone="blue" label="Current usage" rows={[
            { label: "Load average", value: String(metrics.data.cpu.loadAverage ?? "Unavailable"), tone: "blue" }
          ]} />}
        />
        <MetricCard
          label="RAM"
          value={formatPercentage(metrics.data.memory.usagePercent)}
          detail={`${formatBytes(metrics.data.memory.usedGb)} / ${formatBytes(metrics.data.memory.totalGb)} used`}
          tone="green"
          onClick={() => toggleResourceHistory("memory")}
          selected={selectedResource === "memory"}
          indicator={<MetricMeter value={metrics.data.memory.usagePercent ?? 0} tone="green" label="Memory used" rows={[
            { label: "Used", value: formatBytes(metrics.data.memory.usedGb), tone: "green" },
            { label: "Total", value: formatBytes(metrics.data.memory.totalGb) }
          ]} />}
        />
        <MetricCard
          label="Disk"
          value={formatPercentage(metrics.data.disk.usagePercent)}
          detail={`${formatBytes(metrics.data.disk.usedGb)} / ${formatBytes(metrics.data.disk.totalGb)} used`}
          tone="orange"
          onClick={() => toggleResourceHistory("disk")}
          selected={selectedResource === "disk"}
          indicator={<MetricMeter value={metrics.data.disk.usagePercent ?? 0} tone="orange" label="Disk used" rows={[
            { label: "Used", value: formatBytes(metrics.data.disk.usedGb), tone: "orange" },
            { label: "Total", value: formatBytes(metrics.data.disk.totalGb) }
          ]} />}
        />
        <MetricCard
          label="Swap"
          value={metrics.data.swap.usagePercent === null ? "Not available" : formatPercentage(metrics.data.swap.usagePercent)}
          detail={metrics.data.swap.usagePercent === null ? "Not available on this host" : `${formatBytes(metrics.data.swap.usedGb)} / ${formatBytes(metrics.data.swap.totalGb)} used`}
          tone="purple"
          onClick={() => toggleResourceHistory("swap")}
          selected={selectedResource === "swap"}
          subdued={metrics.data.swap.usagePercent === null}
          indicator={metrics.data.swap.usagePercent === null ? (
            <MetricDiagnostic rows={[
              { label: "Swap", value: "Not configured", tone: "purple" },
              { label: "Host report", value: "No usage data" }
            ]} />
          ) : (
            <MetricMeter value={metrics.data.swap.usagePercent} tone="purple" label="Swap used" rows={[
              { label: "Used", value: formatBytes(metrics.data.swap.usedGb), tone: "purple" },
              { label: "Total", value: formatBytes(metrics.data.swap.totalGb) }
            ]} />
          )}
        />
      </div>
      {selectedResource ? (
        <div ref={resourceHistoryRef} className="resource-history-anchor">
          <ResourceHistory
            resource={selectedResource}
            range={historyRange}
            onRangeChange={setHistoryRange}
            history={metricHistory.data}
            isLoading={metricHistory.isLoading}
            error={metricHistory.error}
          />
        </div>
      ) : null}
      <Panel title="Monitored machines" action={<button className="primary-button" onClick={openAddMonitor}><Plus size={16} /> Add machine</button>}>
        {actionError ? <div className="form-error" role="alert">{actionError}</div> : null}
        {successMessage ? <SuccessNotice key={successMessage} message={successMessage} onDismiss={setSuccessMessage} /> : null}
        {serverMonitors.isLoading && !serverMonitors.data ? <StateBlock tone="loading" title="Loading monitors" message="Checking configured machine monitors." /> : serverMonitors.isError && !serverMonitors.data ? <StateBlock tone="error" title="Machine monitors unavailable" message={normalizeApiError(serverMonitors.error).message} /> : (serverMonitors.data ?? []).length === 0 ? (
          <StateBlock icon={<Server size={18} aria-hidden="true" />} title="No extra machines" message="Add another NodeGuard backend to monitor machine-level health from this dashboard." />
        ) : (
          <div className="monitor-list">
            {(serverMonitors.data ?? []).map((monitor) => (
              <ServerMonitorRow
                key={monitor.id}
                monitor={monitor}
                onDuplicate={() => duplicateMonitor(monitor)}
                onEdit={() => editMonitor(monitor)}
                onRemove={() => { setActionError(null); setRemovingMonitor(monitor); }}
              />
            ))}
          </div>
        )}
      </Panel>
      {isMonitorModalOpen ? (
        <Modal title={editingMonitor ? "Edit monitored machine" : duplicatingMonitor ? "Duplicate monitored machine" : "Add monitored machine"} onClose={closeMonitorModal} isClosing={isMonitorModalClosing}>
          <form className="inline-form modal-form" onSubmit={saveMonitor}>
          <label>
            Display name
            <input value={monitorName} onChange={(event) => setMonitorName(event.target.value)} placeholder="Homelab node" aria-invalid={Boolean(formError)} aria-describedby={formError ? "server-monitor-error" : undefined} />
          </label>
          <label>
            Backend URL
            <input value={monitorUrl} onChange={(event) => setMonitorUrl(event.target.value)} placeholder="http://192.168.1.20:3000" aria-invalid={Boolean(formError)} aria-describedby={formError ? "server-monitor-error" : undefined} />
          </label>
          <label>
            API key
            <input
              value={monitorApiKey}
              onChange={(event) => setMonitorApiKey(event.target.value)}
              type="password"
              placeholder={editingMonitor ? "Leave blank to keep current key" : duplicatingMonitor?.apiKeyPreview ? "Re-enter key for this copy" : "Optional for /health only"}
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? "server-monitor-error" : undefined}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={allowInsecureTls}
              onChange={(event) => setAllowInsecureTls(event.target.checked)}
            />
            Allow self-signed HTTPS
          </label>
          <button className="modal-submit" type="submit" disabled={addServerMonitor.isPending || updateServerMonitor.isPending}>
            {editingMonitor ? "Save edits" : duplicatingMonitor ? "Create duplicate" : "Add machine"}
          </button>
        </form>
        {formError ? <div className="form-error" id="server-monitor-error" role="alert">{formError}</div> : null}
        </Modal>
      ) : null}
      {removingMonitor ? <DeleteConfirmationDialog
        title="Delete monitored machine"
        resource={removingMonitor.name}
        description="Delete this machine monitor and its saved connection metadata from NodeGuard? The remote machine is not changed."
        confirmLabel="Delete monitor"
        busy={removeServerMonitor.isPending}
        error={actionError}
        onClose={() => { setRemovingMonitor(null); setActionError(null); }}
        onConfirm={() => void removeMonitor(removingMonitor)}
      /> : null}
    </div>
  );
}

const historyRangeOptions: Array<{ value: MetricHistoryRange; label: string }> = [
  { value: "1h", label: "1H" },
  { value: "6h", label: "6H" },
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" }
];

const historicalResourceConfig: Record<HistoricalResource, { title: string; metricKey: HistoricalMetricKey; tone: "cyan" | "green" | "blue" | "purple" }> = {
  cpu: { title: "CPU usage", metricKey: "cpuUsagePercent", tone: "cyan" },
  memory: { title: "RAM usage", metricKey: "memoryUsagePercent", tone: "green" },
  disk: { title: "Disk usage", metricKey: "diskUsagePercent", tone: "blue" },
  swap: { title: "Swap usage", metricKey: "swapUsagePercent", tone: "purple" }
};

function ResourceHistory({ resource, range, onRangeChange, history, isLoading, error }: { resource: HistoricalResource; range: MetricHistoryRange; onRangeChange: (range: MetricHistoryRange) => void; history?: MetricHistory; isLoading: boolean; error: unknown }) {
  const config = historicalResourceConfig[resource];
  return (
    <Panel
      title={`${config.title} history`}
      action={(
        <div className="history-ranges" role="group" aria-label="Metric history time range">
          {historyRangeOptions.map((option) => (
            <button
              key={option.value}
              className={range === option.value ? "active" : ""}
              onClick={() => onRangeChange(option.value)}
              aria-pressed={range === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    >
      {isLoading ? <StateBlock tone="loading" title="Loading resource history" message={`Reading persisted ${config.title.toLowerCase()} samples.`} /> : null}
      {!isLoading && error && !history ? <StateBlock tone="error" title="History unavailable" message={normalizeApiError(error).message} /> : null}
      {!isLoading && error && history ? <div className="stale-notice">Showing the last available resource history. Live history refresh failed.</div> : null}
      {!isLoading && history && history.points.length === 0 ? (
        <StateBlock icon={<FileText size={18} aria-hidden="true" />} title="No historical samples yet" message="NodeGuard has started collecting metrics. History will appear as samples are recorded." />
      ) : null}
      {!isLoading && history && history.points.length > 0 ? (
        <div className="history-chart-grid">
          <MetricHistoryChart key={`${resource}-${range}`} title={config.title} metricKey={config.metricKey} tone={config.tone} history={history} summary={history.summary[resource]} />
        </div>
      ) : null}
    </Panel>
  );
}

function formatHistoryAxisTime(timestamp: string, range: MetricHistoryRange) {
  const date = new Date(timestamp);
  if (range === "7d" || range === "30d") {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatHistoryTooltipTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestamp));
}

function availableMetricPoints(points: MetricHistoryPoint[], metricKey: HistoricalMetricKey) {
  return points.filter((point): point is MetricHistoryPoint & Record<HistoricalMetricKey, number> => typeof point[metricKey] === "number");
}

function MetricHistoryChart({ title, metricKey, tone, history, summary }: { title: string; metricKey: HistoricalMetricKey; tone: "cyan" | "green" | "blue" | "purple"; history: MetricHistory; summary: MetricHistorySummary }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const points = availableMetricPoints(history.points, metricKey);
  const width = 800;
  const height = 250;
  const plot = { left: 48, right: 16, top: 18, bottom: 34 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const fromMs = new Date(history.from).getTime();
  const toMs = new Date(history.to).getTime();
  const durationMs = Math.max(toMs - fromMs, 1);
  const pointPosition = (point: MetricHistoryPoint) => ({
    x: plot.left + ((new Date(point.timestamp).getTime() - fromMs) / durationMs) * plotWidth,
    y: plot.top + (1 - (point[metricKey] as number) / 100) * plotHeight
  });
  const path = points.map((point, index) => {
    const position = pointPosition(point);
    return `${index === 0 ? "M" : "L"}${position.x.toFixed(2)} ${position.y.toFixed(2)}`;
  }).join(" ");
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const activePosition = activePoint ? pointPosition(activePoint) : null;
  const xTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return { x: plot.left + ratio * plotWidth, timestamp: new Date(fromMs + ratio * durationMs).toISOString() };
  });

  const selectNearestPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const pointer = event.currentTarget.createSVGPoint();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const svgX = pointer.matrixTransform(matrix.inverse()).x;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    points.forEach((point, index) => {
      const distance = Math.abs(pointPosition(point).x - svgX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setActiveIndex(nearestIndex);
  };

  return (
    <article className={`history-chart-card ${tone}`}>
      <div className="history-chart-heading">
        <h3>{title}</h3>
        <div className="history-stat-row">
          <span>Current <strong>{formatPercentage(summary.current)}</strong></span>
          <span>Average <strong>{formatPercentage(summary.average)}</strong></span>
          <span>Peak <strong>{formatPercentage(summary.peak)}</strong></span>
        </div>
      </div>
      {points.length === 0 ? (
        <StateBlock tone="error" title={`${title} unavailable`} message="This metric was unavailable in the selected period." />
      ) : (
        <div className="history-chart-wrap">
          <svg
            className="history-chart"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${title} from ${formatHistoryTooltipTime(history.from)} to ${formatHistoryTooltipTime(history.to)}`}
            onPointerMove={selectNearestPoint}
            onPointerDown={selectNearestPoint}
            onPointerLeave={() => setActiveIndex(null)}
          >
            {[0, 25, 50, 75, 100].map((value) => {
              const y = plot.top + (1 - value / 100) * plotHeight;
              return (
                <g key={value}>
                  <line className="history-grid-line" x1={plot.left} x2={width - plot.right} y1={y} y2={y} />
                  <text className="history-axis-label" x={plot.left - 9} y={y + 4} textAnchor="end">{value}%</text>
                </g>
              );
            })}
            {xTicks.map((tick, index) => (
              <text key={tick.timestamp} className="history-axis-label" x={tick.x} y={height - 8} textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"}>
                {formatHistoryAxisTime(tick.timestamp, history.range)}
              </text>
            ))}
            <path className="history-line" d={path} pathLength={1} />
            {points.length === 1 ? (() => {
              const position = pointPosition(points[0]);
              return <circle className="history-point" cx={position.x} cy={position.y} r="4" />;
            })() : null}
            {activePoint && activePosition ? (
              <g className="history-tooltip">
                <line x1={activePosition.x} x2={activePosition.x} y1={plot.top} y2={height - plot.bottom} />
                <circle cx={activePosition.x} cy={activePosition.y} r="5" />
                <g transform={`translate(${Math.min(Math.max(activePosition.x - 76, plot.left), width - 168)}, ${Math.max(activePosition.y - 57, 4)})`}>
                  <rect width="152" height="44" rx="4" />
                  <text x="9" y="17">{formatHistoryTooltipTime(activePoint.timestamp)}</text>
                  <text className="history-tooltip-value" x="9" y="35">{formatPercentage(activePoint[metricKey])}</text>
                </g>
              </g>
            ) : null}
          </svg>
        </div>
      )}
    </article>
  );
}

type ContainerSortKey = "name" | "state" | "health" | "stack" | "image" | "ipAddress" | "publishedPorts" | "uptime";
type SortDirection = "asc" | "desc";

function containerSortValue(container: Container, key: ContainerSortKey): string | number {
  if (key === "state") return container.status;
  if (key === "stack") return container.stack ?? "";
  if (key === "ipAddress") return container.ipAddress ?? "";
  if (key === "publishedPorts") return container.publishedPorts.join(", ");
  if (key === "uptime") {
    return container.startedAt ? Date.now() - new Date(container.startedAt).getTime() : -1;
  }
  return container[key];
}

function ContainersPage({ initialHostId, onHostFilterApplied }: { initialHostId?: string | null; onHostFilterApplied?: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [hostFilter, setHostFilter] = useState("all");
  const [isContainerDetailClosing, setIsContainerDetailClosing] = useState(false);
  const [stateFilter, setStateFilter] = useState<"all" | Container["status"]>("all");
  const [healthFilter, setHealthFilter] = useState<"all" | Container["health"]>("all");
  const [sortKey, setSortKey] = useState<ContainerSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [monitorName, setMonitorName] = useState("");
  const [containerRef, setContainerRef] = useState("");
  const [editingMonitor, setEditingMonitor] = useState<ContainerMonitorStatus | null>(null);
  const [duplicatingMonitor, setDuplicatingMonitor] = useState<ContainerMonitorStatus | null>(null);
  const [editMonitorName, setEditMonitorName] = useState("");
  const [editContainerRef, setEditContainerRef] = useState("");
  const [isMonitorModalOpen, setIsMonitorModalOpen] = useState(false);
  const [isMonitorModalClosing, setIsMonitorModalClosing] = useState(false);
  const [removingContainerMonitor, setRemovingContainerMonitor] = useState<ContainerMonitorStatus | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const containerDetailRef = useRef<HTMLDivElement | null>(null);
  const containerDetailTimerRef = useRef<number | null>(null);
  const containers = useContainers();
  const container = useContainer(selected, selectedServerId);
  const addContainerMonitor = useAddContainerMonitor();
  const updateContainerMonitor = useUpdateContainerMonitor();
  const removeContainerMonitor = useRemoveContainerMonitor();
  const containerHosts = useMemo(() => {
    const hosts = new Map<string, string>();
    for (const item of containers.data?.containers ?? []) {
      hosts.set(item.serverId, item.hostName ?? (item.serverId === "local-node" ? "Local NodeGuard host" : item.serverId));
    }
    return [...hosts.entries()].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name));
  }, [containers.data]);

  useEffect(() => {
    if (!initialHostId) return;
    setHostFilter(initialHostId);
    setSelected(null);
    setSelectedServerId(null);
    onHostFilterApplied?.();
  }, [initialHostId, onHostFilterApplied]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (containers.data?.containers ?? [])
      .filter((item) => stateFilter === "all" || item.status === stateFilter)
      .filter((item) => healthFilter === "all" || item.health === healthFilter)
      .filter((item) => hostFilter === "all" || item.serverId === hostFilter)
      .filter((item) => !normalizedQuery || [
        item.name,
        item.image,
        item.stack,
        item.ipAddress,
        item.status,
        item.health,
        item.publishedPorts.join(" "),
        item.hostName
      ].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery))
      .sort((left, right) => {
        const leftValue = containerSortValue(left, sortKey);
        const rightValue = containerSortValue(right, sortKey);
        const comparison = typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" });
        return sortDirection === "asc" ? comparison : -comparison;
      });
  }, [containers.data, healthFilter, hostFilter, query, sortDirection, sortKey, stateFilter]);

  const changeSort = (key: ContainerSortKey) => {
    if (sortKey === key) {
      setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const toggleContainerDetail = (containerId: string, serverId: string) => {
    if (selected === containerId && selectedServerId === serverId) {
      if (isContainerDetailClosing) return;
      setIsContainerDetailClosing(true);
      containerDetailTimerRef.current = window.setTimeout(() => {
        setSelected(null);
        setSelectedServerId(null);
        setIsContainerDetailClosing(false);
        containerDetailTimerRef.current = null;
      }, 240);
      return;
    }

    if (containerDetailTimerRef.current !== null) {
      window.clearTimeout(containerDetailTimerRef.current);
      containerDetailTimerRef.current = null;
    }
    setIsContainerDetailClosing(false);
    setSelected(containerId);
    setSelectedServerId(serverId);
  };

  useEffect(() => {
    if (selected && !filtered.some((item) => item.id === selected && item.serverId === selectedServerId)) {
      setIsContainerDetailClosing(false);
      setSelected(null);
      setSelectedServerId(null);
    }
  }, [filtered, selected, selectedServerId]);

  useEffect(() => {
    if (selected && containerDetailRef.current) {
      containerDetailRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selected]);

  useEffect(() => () => {
    if (containerDetailTimerRef.current !== null) {
      window.clearTimeout(containerDetailTimerRef.current);
    }
  }, []);

  const resetAddForm = () => {
    setMonitorName("");
    setContainerRef("");
    setFormError(null);
  };

  const resetEditModal = () => {
    setEditingMonitor(null);
    setDuplicatingMonitor(null);
    setEditMonitorName("");
    setEditContainerRef("");
    setIsMonitorModalOpen(false);
    setIsMonitorModalClosing(false);
    setEditFormError(null);
  };

  const closeEditModal = () => {
    if (isMonitorModalClosing) return;
    setIsMonitorModalClosing(true);
    window.setTimeout(resetEditModal, 190);
  };

  const editMonitor = (monitor: ContainerMonitorStatus) => {
    setEditingMonitor(monitor);
    setDuplicatingMonitor(null);
    setEditMonitorName(monitor.name);
    setEditContainerRef(monitor.containerRef);
    setIsMonitorModalClosing(false);
    setEditFormError(null);
    setIsMonitorModalOpen(true);
  };

  const duplicateMonitor = (monitor: ContainerMonitorStatus) => {
    setEditingMonitor(null);
    setDuplicatingMonitor(monitor);
    setEditMonitorName(duplicateName(monitor.name));
    setEditContainerRef(monitor.containerRef);
    setIsMonitorModalClosing(false);
    setEditFormError(null);
    setIsMonitorModalOpen(true);
  };

  const saveMonitor = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    const input = { name: monitorName, containerRef };

    try {
      await addContainerMonitor.mutateAsync(input);
      setSuccessMessage(`${monitorName.trim() || "Container"} was successfully added.`);
      resetAddForm();
    } catch (error) {
      setFormError(normalizeApiError(error).message);
    }
  };

  const saveMonitorEdits = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingMonitor && !duplicatingMonitor) return;
    setEditFormError(null);
    setSuccessMessage(null);

    try {
      const input = { name: editMonitorName, containerRef: editContainerRef };
      if (editingMonitor) {
        await updateContainerMonitor.mutateAsync({ id: editingMonitor.id, input });
        setSuccessMessage(`${editMonitorName.trim() || "Container"} was successfully updated.`);
      } else {
        await addContainerMonitor.mutateAsync(input);
        setSuccessMessage(`${editMonitorName.trim() || "Container"} was successfully duplicated.`);
      }
      closeEditModal();
    } catch (error) {
      setEditFormError(normalizeApiError(error).message);
    }
  };

  const removeMonitor = async (monitor: ContainerMonitorStatus) => {
    setDeleteError(null);
    setSuccessMessage(null);

    try {
      await removeContainerMonitor.mutateAsync(monitor.id);
      setSuccessMessage(`${monitor.name} was successfully deleted.`);
      setRemovingContainerMonitor(null);
    } catch (error) {
      setDeleteError(normalizeApiError(error).message);
    }
  };

  if (containers.isLoading) return <StateBlock tone="loading" title="Loading containers" message="Reading Docker status." />;
  if (!containers.data) return <StateBlock tone="error" title="Docker unavailable" message={normalizeApiError(containers.error).message} />;
  return (
    <div className="page-stack">
      <StaleNotice isError={containers.isError} dataUpdatedAt={containers.dataUpdatedAt} />
      {!containers.data.dockerAvailable ? <DockerUnavailable message={containers.data.message ?? "Docker is not available on this host."} /> : null}
      <Panel
        title="Docker containers"
        action={(
          <div className="container-table-tools">
            <div className="search container-search">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search containers" aria-label="Search containers" />
            </div>
            <NodeGuardSelect
              className="container-filter"
              label="State"
              labelPosition="inline"
              value={stateFilter}
              options={[
                { value: "all", label: "All states" },
                { value: "running", label: "Running" },
                { value: "restarting", label: "Restarting" },
                { value: "stopped", label: "Stopped" },
                { value: "exited", label: "Exited" }
              ]}
              onChange={(value) => setStateFilter(value as "all" | Container["status"])}
            />
            {containerHosts.length > 1 ? (
              <NodeGuardSelect
                className="container-filter container-host-filter"
                label="Host"
                labelPosition="inline"
                value={hostFilter}
                options={[{ value: "all", label: "All hosts" }, ...containerHosts.map((host) => ({ value: host.id, label: host.name }))]}
                onChange={(value) => { setHostFilter(value); setSelected(null); setSelectedServerId(null); }}
              />
            ) : null}
            <NodeGuardSelect
              className="container-filter"
              label="Health"
              labelPosition="inline"
              value={healthFilter}
              options={[
                { value: "all", label: "All health" },
                { value: "healthy", label: "Healthy" },
                { value: "unhealthy", label: "Unhealthy" },
                { value: "starting", label: "Starting" },
                { value: "none", label: "No healthcheck" }
              ]}
              onChange={(value) => setHealthFilter(value as "all" | Container["health"])}
            />
            <button className="icon-only" onClick={() => containers.refetch()} disabled={containers.isFetching} aria-label="Refresh containers" title="Refresh containers">
              <RefreshCcw className={containers.isFetching ? "is-spinning" : ""} size={15} />
            </button>
          </div>
        )}
      >
        {filtered.length === 0 ? <StateBlock icon={<Boxes size={18} aria-hidden="true" />} title="No containers found" message={containers.data.dockerAvailable ? "No containers matched the current search and filters." : "Docker data is currently unavailable. Check Docker access on the backend."} /> : (
          <div className="container-results">
            <div className="container-card-sort" aria-label="Container card sorting">
              <NodeGuardSelect
                className="container-filter"
                label="Sort by"
                labelPosition="inline"
                value={sortKey}
                options={[
                  { value: "name", label: "Name" },
                  { value: "state", label: "State" },
                  { value: "health", label: "Health" },
                  { value: "stack", label: "Stack" },
                  { value: "image", label: "Image" },
                  { value: "ipAddress", label: "IP address" },
                  { value: "publishedPorts", label: "Published ports" },
                  { value: "uptime", label: "Uptime" },
                ]}
                onChange={(value) => {
                  if (value !== sortKey) setSortDirection("asc");
                  setSortKey(value as ContainerSortKey);
                }}
              />
              <button
                className="icon-only"
                onClick={() => setSortDirection((direction) => direction === "asc" ? "desc" : "asc")}
                aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
                title={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
                type="button"
              >
                {sortDirection === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
              </button>
            </div>
            <div className="container-table-scroll">
              <div className="container-table" role="table" aria-label="Docker containers">
                <ContainerTableHeader sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} />
                {filtered.map((item) => (
                  <ContainerTableRow
                    key={`${item.serverId}-${item.id}`}
                    container={item}
                    selected={selected === item.id && selectedServerId === item.serverId}
                    onSelect={() => toggleContainerDetail(item.id, item.serverId)}
                  />
                ))}
              </div>
            </div>
            <div className="container-mobile-list">
              {filtered.map((item) => (
                <ContainerMobileCard
                  key={`${item.serverId}-${item.id}`}
                  container={item}
                  selected={selected === item.id && selectedServerId === item.serverId}
                  onSelect={() => toggleContainerDetail(item.id, item.serverId)}
                />
              ))}
            </div>
          </div>
        )}
      </Panel>
      {selected ? (
        <div ref={containerDetailRef} className={`container-detail-collapse ${isContainerDetailClosing ? "is-closing" : ""}`}>
          <div className="container-detail-target">
            <Panel title={container.data?.name ?? "Container detail"} action={<span className="read-only-label">Read-only details</span>}>
              {container.isLoading ? <StateBlock tone="loading" title="Loading detail" message="Reading container inspection data." /> : null}
              {container.isError ? <StateBlock tone="error" title="Container detail unavailable" message={normalizeApiError(container.error).message} /> : null}
              {container.data ? <ContainerDetail container={container.data} /> : null}
            </Panel>
          </div>
        </div>
      ) : null}
      <Panel title="Monitored containers">
        <form className="inline-form compact-form" onSubmit={saveMonitor}>
          <label>
            Display name
            <input value={monitorName} onChange={(event) => setMonitorName(event.target.value)} placeholder="Vaultwarden" aria-invalid={Boolean(formError)} aria-describedby={formError ? "container-monitor-error" : undefined} />
          </label>
          <label>
            Container name or ID
            <input value={containerRef} onChange={(event) => setContainerRef(event.target.value)} placeholder="vaultwarden" aria-invalid={Boolean(formError)} aria-describedby={formError ? "container-monitor-error" : undefined} />
          </label>
          <button className="primary-button" type="submit" disabled={addContainerMonitor.isPending}>
            <Plus size={16} />
            Add container
          </button>
        </form>
        {formError ? <div className="form-error" id="container-monitor-error" role="alert">{formError}</div> : null}
        {successMessage ? <SuccessNotice key={successMessage} message={successMessage} onDismiss={setSuccessMessage} /> : null}
        {(containers.data.containerMonitors ?? []).length === 0 ? (
          <StateBlock icon={<Boxes size={18} aria-hidden="true" />} title="No monitored containers" message="Add container names or IDs that should be present and running." />
        ) : (
          <div className="monitor-list">
            {containers.data.containerMonitors.map((monitor) => (
              <ContainerMonitorRow
                key={monitor.id}
                monitor={monitor}
                onDuplicate={() => duplicateMonitor(monitor)}
                onEdit={() => editMonitor(monitor)}
                onRemove={() => { setDeleteError(null); setRemovingContainerMonitor(monitor); }}
              />
            ))}
          </div>
        )}
      </Panel>
      {isMonitorModalOpen && (editingMonitor || duplicatingMonitor) ? (
        <Modal title={editingMonitor ? "Edit monitored container" : "Duplicate monitored container"} onClose={closeEditModal} isClosing={isMonitorModalClosing}>
          <form className="inline-form modal-form" onSubmit={saveMonitorEdits}>
            <label>
              Display name
              <input value={editMonitorName} onChange={(event) => setEditMonitorName(event.target.value)} placeholder="Vaultwarden" aria-invalid={Boolean(editFormError)} aria-describedby={editFormError ? "container-monitor-edit-error" : undefined} />
            </label>
            <label>
              Container name or ID
              <input value={editContainerRef} onChange={(event) => setEditContainerRef(event.target.value)} placeholder="vaultwarden" aria-invalid={Boolean(editFormError)} aria-describedby={editFormError ? "container-monitor-edit-error" : undefined} />
            </label>
            <button className="modal-submit" type="submit" disabled={updateContainerMonitor.isPending || addContainerMonitor.isPending}>
              {editingMonitor ? "Save edits" : "Create duplicate"}
            </button>
          </form>
          {editFormError ? <div className="form-error" id="container-monitor-edit-error" role="alert">{editFormError}</div> : null}
        </Modal>
      ) : null}
      {removingContainerMonitor ? <DeleteConfirmationDialog
        title="Delete monitored container"
        resource={removingContainerMonitor.name}
        description="Delete this expected-container monitor from NodeGuard? The Docker container itself is not changed."
        confirmLabel="Delete monitor"
        busy={removeContainerMonitor.isPending}
        error={deleteError}
        onClose={() => { setRemovingContainerMonitor(null); setDeleteError(null); }}
        onConfirm={() => void removeMonitor(removingContainerMonitor)}
      /> : null}
    </div>
  );
}

function DomainsPage() {
  const [domainValue, setDomainValue] = useState("");
  const [domainPath, setDomainPath] = useState("/");
  const [expectedStatusCodes, setExpectedStatusCodes] = useState("200,301,302,401");
  const [editingDomain, setEditingDomain] = useState<DomainCheck | null>(null);
  const [duplicatingDomain, setDuplicatingDomain] = useState<DomainCheck | null>(null);
  const [removingDomain, setRemovingDomain] = useState<DomainCheck | null>(null);
  const [isDomainModalOpen, setIsDomainModalOpen] = useState(false);
  const [isDomainModalClosing, setIsDomainModalClosing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const domains = useDomains();
  const addDomain = useAddDomain();
  const updateDomain = useUpdateDomain();
  const removeDomain = useRemoveDomain();

  const resetDomainForm = () => {
    setDomainValue("");
    setDomainPath("/");
    setExpectedStatusCodes("200,301,302,401");
    setEditingDomain(null);
    setDuplicatingDomain(null);
    setIsDomainModalOpen(false);
    setIsDomainModalClosing(false);
    setFormError(null);
  };

  const closeDomainModal = () => {
    if (isDomainModalClosing) return;
    setIsDomainModalClosing(true);
    window.setTimeout(resetDomainForm, 190);
  };

  const openAddDomain = () => {
    setDomainValue("");
    setDomainPath("/");
    setExpectedStatusCodes("200,301,302,401");
    setEditingDomain(null);
    setDuplicatingDomain(null);
    setIsDomainModalClosing(false);
    setFormError(null);
    setIsDomainModalOpen(true);
  };

  const editDomain = (domain: DomainCheck) => {
    setDomainValue(domain.domain);
    setDomainPath(domain.path);
    setExpectedStatusCodes(domain.expectedStatusCodes.join(","));
    setEditingDomain(domain);
    setDuplicatingDomain(null);
    setIsDomainModalClosing(false);
    setFormError(null);
    setIsDomainModalOpen(true);
  };

  const duplicateDomain = (domain: DomainCheck) => {
    setDomainValue(domain.domain);
    setDomainPath(domain.path);
    setExpectedStatusCodes(domain.expectedStatusCodes.join(","));
    setEditingDomain(null);
    setDuplicatingDomain(domain);
    setIsDomainModalClosing(false);
    setFormError(null);
    setIsDomainModalOpen(true);
  };

  const saveDomain = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const input = {
        domain: domainValue,
        path: domainPath,
        expectedStatusCodes: parseExpectedStatusCodes(expectedStatusCodes)
      };

      if (duplicatingDomain && domainTargetKey(input.domain, input.path) === domainTargetKey(duplicatingDomain.domain, duplicatingDomain.path)) {
        throw new Error("Change the domain URL or path before creating the duplicate.");
      }

      if (editingDomain) {
        await updateDomain.mutateAsync({ id: editingDomain.id, input });
        setSuccessMessage(`${fullDomainUrl({ ...editingDomain, domain: input.domain, path: input.path })} was successfully updated.`);
      } else {
        await addDomain.mutateAsync(input);
        if (duplicatingDomain) {
          setSuccessMessage(`${fullDomainUrl({ ...duplicatingDomain, domain: input.domain, path: input.path })} was successfully duplicated.`);
        }
      }
      closeDomainModal();
    } catch (error) {
      setFormError(normalizeApiError(error).message);
    }
  };

  const removeStoredDomain = async (domain: DomainCheck) => {
    setActionError(null);
    setSuccessMessage(null);

    try {
      await removeDomain.mutateAsync(domain.id);
      setSuccessMessage(`${fullDomainUrl(domain)} was successfully deleted.`);
      setRemovingDomain(null);
    } catch (error) {
      setActionError(normalizeApiError(error).message);
    }
  };

  if (domains.isLoading) return <StateBlock tone="loading" title="Loading domains" message="Checking configured domains." />;
  if (!domains.data) return <StateBlock tone="error" title="Domains unavailable" message={normalizeApiError(domains.error).message} />;
  return (
    <div className="page-stack">
      <Panel title="Domains / services" action={<div className="button-row"><button className="secondary-button" onClick={() => domains.refetch()}><RefreshCcw size={16} /> Check now</button><button className="primary-button" onClick={openAddDomain}><Plus size={16} /> Add domain</button></div>}>
        {actionError ? <div className="form-error" role="alert">{actionError}</div> : null}
        {successMessage ? <SuccessNotice key={successMessage} message={successMessage} onDismiss={setSuccessMessage} /> : null}
        {domains.data.length === 0 ? (
          <StateBlock icon={<Globe2 size={18} aria-hidden="true" />} title="No services configured" message="Add a public domain, internal URL, or set MONITORED_DOMAINS in the backend environment." />
        ) : (
          <div className="domain-list">
            {domains.data.map((domain) => (
              <DomainRow
                key={domain.id}
                domain={domain}
                onCheck={() => domains.refetch()}
                onDuplicate={domain.editable ? () => duplicateDomain(domain) : undefined}
                onEdit={domain.editable ? () => editDomain(domain) : undefined}
                onRemove={domain.editable ? () => { setActionError(null); setRemovingDomain(domain); } : undefined}
              />
            ))}
          </div>
        )}
      </Panel>
      {isDomainModalOpen ? (
        <Modal title={editingDomain ? "Edit domain / service" : duplicatingDomain ? "Duplicate domain / service" : "Add domain / service"} onClose={closeDomainModal} isClosing={isDomainModalClosing}>
          <form className="inline-form modal-form" onSubmit={saveDomain}>
            <label>
              Domain URL
              <input value={domainValue} onChange={(event) => setDomainValue(event.target.value)} placeholder="https://status.example.com" />
            </label>
            <label>
              Path
              <input value={domainPath} onChange={(event) => setDomainPath(event.target.value)} placeholder="/" />
            </label>
            <label>
              Expected HTTP codes
              <input value={expectedStatusCodes} onChange={(event) => setExpectedStatusCodes(event.target.value)} placeholder="200,301,302,401" />
            </label>
            <button className="modal-submit" type="submit" disabled={addDomain.isPending || updateDomain.isPending}>
              {editingDomain ? null : duplicatingDomain ? <Copy size={16} /> : <Plus size={16} />}
              {editingDomain ? "Save edits" : duplicatingDomain ? "Create duplicate" : "Add domain"}
            </button>
          </form>
          {formError ? <div className="form-error" role="alert">{formError}</div> : null}
        </Modal>
      ) : null}
      {removingDomain ? <DeleteConfirmationDialog
        title="Delete domain monitor"
        resource={fullDomainUrl(removingDomain)}
        description="Delete this domain or service monitor and its stored check history from NodeGuard? The remote service is not changed."
        confirmLabel="Delete monitor"
        busy={removeDomain.isPending}
        error={actionError}
        onClose={() => { setRemovingDomain(null); setActionError(null); }}
        onConfirm={() => void removeStoredDomain(removingDomain)}
      /> : null}
    </div>
  );
}

type AlertView = "active" | "resolved" | "all";

function alertSource(alert: Alert) {
  const resource = alert.affectedResource.toLowerCase();
  if (resource === "update center") return "Updates";
  if (resource === "docker" || resource.includes("container")) return "Docker";
  if (resource.startsWith("http://") || resource.startsWith("https://")) return "Domain";
  if (resource.includes("server") || resource.includes("node") || resource.includes("host")) return "Server";
  return "NodeGuard";
}

function AlertMobileCard({ item, selected, onToggle, onDelete, deleting }: { item: Alert; selected: boolean; onToggle: () => void; onDelete: () => void; deleting: boolean }) {
  return (
    <article className={`alert-mobile-card ${selected ? "selected" : ""}`}>
      <div className="alert-mobile-heading">
        <strong>{item.title}</strong>
        <StatusPill status={item.severity} />
      </div>
      <div className="alert-mobile-state-row">
        <span className={`alert-state ${item.status}`}>{item.status === "active" ? "Active" : "Resolved"}</span>
        <span>{alertSource(item)}</span>
      </div>
      <p>{item.message}</p>
      <dl className="alert-mobile-meta">
        <div><dt>Instance</dt><dd>{item.affectedResource}</dd></div>
        <div><dt>Started</dt><dd><time dateTime={item.firstSeenAt}>{formatDateTime(item.firstSeenAt)}</time></dd></div>
        <div><dt>Last updated</dt><dd><time dateTime={item.lastSeenAt} title={formatDateTime(item.lastSeenAt)}>{formatRelativeTime(item.lastSeenAt)}</time></dd></div>
      </dl>
      <div className="alert-mobile-actions">
        <button className="secondary-button" onClick={onToggle} aria-expanded={selected} aria-label={`${selected ? "Hide" : "View"} details for ${item.title}`}>
          <ChevronRight className={selected ? "is-open" : ""} size={15} />
          {selected ? "Hide details" : "View details"}
        </button>
        <button className="danger-soft" onClick={onDelete} disabled={deleting} aria-label={`Delete ${item.title}`}>
          <Trash2 size={15} />
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </article>
  );
}

function AlertsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const [view, setView] = useState<AlertView>("active");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deletingAlert, setDeletingAlert] = useState<Alert | null>(null);
  const detailCloseTimer = useRef<number | null>(null);
  const alerts = useAlerts("all");
  const alert = useAlert(selected);
  const removeAlert = useRemoveAlert();
  const allAlerts = alerts.data ?? [];
  const activeCount = allAlerts.filter((item) => item.status === "active").length;
  const resolvedCount = allAlerts.filter((item) => item.status === "resolved").length;
  const viewAlerts = allAlerts.filter((item) => view === "all" || item.status === view);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredAlerts = viewAlerts
    .filter((item) => !normalizedQuery || [item.title, item.message, item.affectedResource, item.severity, item.status, alertSource(item)].join(" ").toLowerCase().includes(normalizedQuery))
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / pageSize));
  const visiblePage = Math.min(page, totalPages);
  const pageStart = (visiblePage - 1) * pageSize;
  const pagedAlerts = filteredAlerts.slice(pageStart, pageStart + pageSize);

  useEffect(() => setPage(1), [view, query, pageSize]);

  useEffect(() => () => {
    if (detailCloseTimer.current !== null) {
      window.clearTimeout(detailCloseTimer.current);
    }
  }, []);

  useEffect(() => {
    if (selected && !filteredAlerts.some((item) => item.id === selected)) {
      setSelected(null);
      setIsDetailClosing(false);
    }
  }, [filteredAlerts, selected]);

  const closeAlertDetail = () => {
    if (!selected || isDetailClosing) return;
    setIsDetailClosing(true);
    detailCloseTimer.current = window.setTimeout(() => {
      setSelected(null);
      setIsDetailClosing(false);
      detailCloseTimer.current = null;
    }, 250);
  };

  const toggleAlertDetail = (id: string) => {
    if (selected === id) {
      closeAlertDetail();
      return;
    }

    if (detailCloseTimer.current !== null) {
      window.clearTimeout(detailCloseTimer.current);
      detailCloseTimer.current = null;
    }
    setIsDetailClosing(false);
    setSelected(id);
  };

  const deleteAlert = async (item: Alert) => {
    setActionError(null);
    setSuccessMessage(null);

    try {
      await removeAlert.mutateAsync(item.id);
      if (selected === item.id) {
        if (detailCloseTimer.current !== null) {
          window.clearTimeout(detailCloseTimer.current);
          detailCloseTimer.current = null;
        }
        setSelected(null);
        setIsDetailClosing(false);
      }
      setSuccessMessage(`${item.title} was successfully deleted.`);
      setDeletingAlert(null);
    } catch (error) {
      setActionError(normalizeApiError(error).message);
    }
  };

  if (alerts.isLoading) return <StateBlock tone="loading" title="Loading alerts" message="Generating current alerts." />;
  if (!alerts.data) return <StateBlock tone="error" title="Alerts unavailable" message={normalizeApiError(alerts.error).message} />;

  const tabItems: { id: AlertView; label: string; count: number }[] = [
    { id: "active", label: "Active alerts", count: activeCount },
    { id: "resolved", label: "Resolved alerts", count: resolvedCount },
    { id: "all", label: "All alerts", count: allAlerts.length }
  ];
  const panelTitle = tabItems.find((item) => item.id === view)?.label ?? "Alerts";

  const selectAlertView = (nextView: AlertView, focus = false) => {
    setView(nextView);
    if (focus) {
      window.requestAnimationFrame(() => document.getElementById(`alert-tab-${nextView}`)?.focus());
    }
  };

  const handleAlertTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabItems.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabItems.length) % tabItems.length;
    selectAlertView(tabItems[nextIndex].id, true);
  };

  return (
    <div className="page-stack alerts-page">
      <div className="alert-view-tabs" role="tablist" aria-label="Alert views">
        {tabItems.map((item, index) => (
          <button
            key={item.id}
            id={`alert-tab-${item.id}`}
            role="tab"
            aria-selected={view === item.id}
            aria-controls="alert-panel"
            tabIndex={view === item.id ? 0 : -1}
            className={view === item.id ? "active" : ""}
            onClick={() => selectAlertView(item.id)}
            onKeyDown={(event) => handleAlertTabKeyDown(event, index)}
          >
            {item.label}
            <span className={`alert-count ${item.id === "active" && item.count > 0 ? "has-active" : ""}`}>{item.count}</span>
          </button>
        ))}
      </div>

      <div id="alert-panel" role="tabpanel" aria-labelledby={`alert-tab-${view}`}>
        <Panel
          title={panelTitle}
          action={(
            <div className="alert-table-tools">
              <div className="search alert-search">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search alerts" aria-label="Search alerts" />
              </div>
              <button className="icon-only" onClick={() => alerts.refetch()} aria-label="Refresh alerts" title="Refresh alerts">
                <RefreshCcw size={15} />
              </button>
            </div>
          )}
        >
        {actionError ? <div className="form-error" role="alert">{actionError}</div> : null}
        {successMessage ? <SuccessNotice key={successMessage} message={successMessage} onDismiss={setSuccessMessage} /> : null}
        {filteredAlerts.length === 0 ? (
          <StateBlock icon={<Bell size={18} aria-hidden="true" />} title="No alerts" message={query ? "No alerts match the current search." : `No ${view === "all" ? "" : `${view} `}alerts are available.`} />
        ) : (
          <>
            <div className="alert-table-scroll">
            <div className="alert-table" role="table" aria-label={panelTitle}>
              <div className="alert-table-header" role="row">
                <span role="columnheader">Alert name</span>
                <span role="columnheader">State</span>
                <span role="columnheader">Severity</span>
                <span role="columnheader">Message</span>
                <span role="columnheader">Source</span>
                <span role="columnheader">Instance</span>
                <span role="columnheader">Started</span>
                <span role="columnheader">Last updated</span>
                <span role="columnheader">Actions</span>
              </div>
              {pagedAlerts.map((item) => (
                <div
                  className={`alert-table-row ${selected === item.id ? "selected" : ""}`}
                  key={item.id}
                  role="row"
                >
                  <strong role="cell">{item.title}</strong>
                  <span role="cell"><span className={`alert-state ${item.status}`}>{item.status === "active" ? "Active" : "Resolved"}</span></span>
                  <span role="cell"><StatusPill status={item.severity} /></span>
                  <span className="alert-message-cell" role="cell" title={item.message}>{item.message}</span>
                  <span role="cell">{alertSource(item)}</span>
                  <span className="alert-instance-cell" role="cell" title={item.affectedResource}>{item.affectedResource}</span>
                  <time role="cell" dateTime={item.firstSeenAt}>{formatDateTime(item.firstSeenAt)}</time>
                  <time role="cell" dateTime={item.lastSeenAt}>{formatRelativeTime(item.lastSeenAt)}</time>
                  <div className="alert-row-actions" role="cell">
                    <button
                      className={`icon-only alert-detail-toggle ${selected === item.id ? "is-open" : ""}`}
                      onClick={() => toggleAlertDetail(item.id)}
                      aria-expanded={selected === item.id && !isDetailClosing}
                      aria-label={`${selected === item.id && !isDetailClosing ? "Hide" : "View"} details for ${item.title}`}
                      title={selected === item.id && !isDetailClosing ? "Hide details" : "View details"}
                    >
                      <ChevronRight size={15} />
                    </button>
                    <button className="icon-only danger-soft" onClick={() => { setActionError(null); setDeletingAlert(item); }} disabled={removeAlert.isPending} aria-label={`Delete ${item.title}`} title="Delete alert">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            </div>
            <div className="alerts-mobile-list">
              {pagedAlerts.map((item) => (
                <AlertMobileCard
                  key={item.id}
                  item={item}
                  selected={selected === item.id && !isDetailClosing}
                  onToggle={() => toggleAlertDetail(item.id)}
                  onDelete={() => { setActionError(null); setDeletingAlert(item); }}
                  deleting={removeAlert.isPending}
                />
              ))}
            </div>
          </>
        )}

        <div className="alert-table-footer">
          <span>
            {filteredAlerts.length === 0 ? "0" : `${pageStart + 1}-${Math.min(pageStart + pageSize, filteredAlerts.length)}`} of {filteredAlerts.length}
          </span>
          <NodeGuardSelect
            className="alert-page-size"
            label="Rows"
            labelPosition="inline"
            value={String(pageSize)}
            options={[10, 25, 50].map((value) => ({ value: String(value), label: String(value) }))}
            onChange={(value) => setPageSize(Number(value))}
          />
          <div className="alert-pagination">
            <button className="icon-only" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={visiblePage === 1} aria-label="Previous alert page">
              <ChevronLeft size={15} />
            </button>
            <span>{visiblePage} / {totalPages}</span>
            <button className="icon-only" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={visiblePage === totalPages} aria-label="Next alert page">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
        </Panel>
      </div>

      {selected ? (
        <div className={`alert-detail-collapse ${isDetailClosing ? "is-closing" : ""}`}>
          <Panel title="Alert detail">
            {!alert.data ? <StateBlock tone={alert.isError ? "error" : "loading"} title={alert.isError ? "Alert unavailable" : "Loading alert"} message={alert.isError ? normalizeApiError(alert.error).message : "Reading alert detail."} /> : <AlertDetail alert={alert.data} />}
          </Panel>
        </div>
      ) : null}
      {deletingAlert ? <DeleteConfirmationDialog
        title="Delete alert"
        resource={deletingAlert.title}
        description="Permanently delete this alert record from NodeGuard? This does not change the monitored resource."
        confirmLabel="Delete alert"
        busy={removeAlert.isPending}
        error={actionError}
        onClose={() => { setDeletingAlert(null); setActionError(null); }}
        onConfirm={() => void deleteAlert(deletingAlert)}
      /> : null}
    </div>
  );
}

type MachineUpdateFilter = "all" | "updates" | "security" | "up_to_date" | "reboot" | "unsupported" | "check_failed" | "stale_offline";

function MachineUpdateConditionPill({ machine }: { machine: MachineUpdateSummary }) {
  const condition = getMachineUpdateCondition(machine);
  return <span className={`pill ${condition.tone}`}>{condition.label}</span>;
}

function MachineCheckTime({ machine, successfulOnly = false }: { machine: MachineUpdateSummary; successfulOnly?: boolean }) {
  const value = successfulOnly ? machine.lastSuccessfulAt : machine.checkedAt ?? machine.lastSuccessfulAt;
  if (!value) return <>Never</>;
  return <time dateTime={value} title={formatDateTime(value)}>{formatRelativeTime(value)}</time>;
}

function RebootState({ machine }: { machine: MachineUpdateSummary }) {
  if (machine.rebootRequired === null) return <>—</>;
  return machine.rebootRequired
    ? <span className="reboot-required"><RefreshCcw size={13} aria-hidden="true" /> Required</span>
    : <>No</>;
}

function MachineUpdateStatusNote({ machine }: { machine: MachineUpdateSummary }) {
  if (machine.supported === false || machine.status === "unsupported" || machine.freshness === "unsupported") return <span>Update discovery is not available for this operating system yet.</span>;
  if (machine.status === "package_manager_busy") return <span>The package manager is busy. NodeGuard will retry automatically.{machine.lastSuccessfulAt ? <> Showing data from the last successful check <MachineCheckTime machine={machine} successfulOnly />.</> : null}</span>;
  if (machine.status === "metadata_refresh_failed" || machine.status === "check_failed") return <span>The latest update check failed.{machine.lastSuccessfulAt ? <> Showing data from the last successful check <MachineCheckTime machine={machine} successfulOnly />.</> : null}{machine.lastError ? <> {machine.lastError}</> : null}</span>;
  if (machine.status === "waiting" || machine.supported === null || machine.freshness === "waiting") return <span>Waiting for the first scheduled update inventory.</span>;
  if (machine.freshness === "stale" && machine.lastSuccessfulAt) return <span>The retained update inventory is stale. Last successful check <MachineCheckTime machine={machine} successfulOnly />.</span>;
  if (machine.freshness === "retained" && machine.lastSuccessfulAt) return <span>Showing retained data from the last successful check <MachineCheckTime machine={machine} successfulOnly /> because a current report is unavailable.</span>;
  if (!machine.lastSuccessfulAt) return <span>Waiting for the first scheduled update inventory.</span>;
  return null;
}

function MachinePackageEmptyState({ machine, securityOnly }: { machine: MachineUpdateSummary; securityOnly: boolean }) {
  const currentInventoryUnavailable = machine.freshness !== "current";
  const retainedInventory = hasRetainedUpdateInventory(machine);

  if (machine.status === "waiting" && machine.lastSuccessfulAt === null) {
    return <StateBlock
      icon={<PackageOpen size={18} aria-hidden="true" />}
      title="Waiting for first update inventory"
      message="Package details will appear after this Agent completes its first successful update check."
    />;
  }

  if (retainedInventory) {
    return <StateBlock
      icon={<PackageOpen size={18} aria-hidden="true" />}
      title={securityOnly ? "No security updates in retained data" : "No package updates in retained data"}
      message={securityOnly
        ? "The retained inventory from the last successful check contains no security-classified package updates."
        : "The retained inventory from the last successful check contains no package updates. A current result is unavailable."}
    />;
  }

  if (currentInventoryUnavailable) {
    return <StateBlock
      icon={<PackageOpen size={18} aria-hidden="true" />}
      title={securityOnly ? "Security inventory unavailable" : "Package inventory unavailable"}
      message="No current package inventory is available for this machine."
    />;
  }

  return <StateBlock
    icon={<PackageOpen size={18} aria-hidden="true" />}
    title={securityOnly ? "No security updates" : "No package updates"}
    message={securityOnly ? "This machine has no security-classified package updates." : "This machine is currently up to date."}
  />;
}

function MachineUpdateRow({ machine, onView }: { machine: MachineUpdateSummary; onView: () => void }) {
  return <tr>
    <td><span className="machine-update-name"><strong>{machine.displayName}</strong><small title={machine.hostname}>{machine.hostname}</small></span></td>
    <td><span className="machine-update-os"><span title={machine.os.prettyName ?? undefined}>{machine.os.prettyName ?? "Unavailable"}</span><MachineUpdateStatusNote machine={machine} /></span></td>
    <td className="number-cell"><strong>{formatUpdateCount(machine.updateCount)}</strong></td>
    <td className={`number-cell ${(machine.securityUpdateCount ?? 0) > 0 ? "security-value" : ""}`}><strong>{formatUpdateCount(machine.securityUpdateCount)}</strong></td>
    <td><RebootState machine={machine} /></td>
    <td><MachineCheckTime machine={machine} /></td>
    <td><AgentStatusPill status={machine.agentStatus} /></td>
    <td><button className="small-action-button" onClick={onView} aria-label={`View updates for ${machine.displayName}`}>View</button></td>
  </tr>;
}

function MachineUpdateCard({ machine, onView }: { machine: MachineUpdateSummary; onView: () => void }) {
  return <article className="update-mobile-card machine-update-card">
    <div className="update-mobile-head"><div><strong>{machine.displayName}</strong><span title={machine.hostname}>{machine.hostname}</span></div><AgentStatusPill status={machine.agentStatus} /></div>
    <div className="machine-update-card-state"><MachineUpdateConditionPill machine={machine} /><span>{machine.os.prettyName ?? "Operating system unavailable"}</span></div>
    <dl>
      <div><dt>Updates</dt><dd>{formatUpdateCount(machine.updateCount)}</dd></div>
      <div><dt>Security</dt><dd className={(machine.securityUpdateCount ?? 0) > 0 ? "security-value" : ""}>{formatUpdateCount(machine.securityUpdateCount)}</dd></div>
      <div><dt>Reboot</dt><dd><RebootState machine={machine} /></dd></div>
      <div><dt>Last checked</dt><dd><MachineCheckTime machine={machine} /></dd></div>
    </dl>
    <MachineUpdateStatusNote machine={machine} />
    <button className="secondary-button" onClick={onView} aria-label={`View updates for ${machine.displayName}`}>View updates</button>
  </article>;
}

function PackageUpdateTable({ packages }: { packages: MachinePackageUpdate[] }) {
  return <>
    <div className="package-updates-table-wrap">
      <table className="package-updates-table">
        <thead><tr><th scope="col">Package</th><th scope="col">Installed version</th><th scope="col">Available version</th><th scope="col">Type</th><th scope="col">Source</th></tr></thead>
        <tbody>{packages.map((item) => <tr key={item.name}>
          <td><strong title={item.name}>{item.name}</strong></td>
          <td className="mono-cell" title={item.installedVersion}>{item.installedVersion}</td>
          <td className="mono-cell" title={item.candidateVersion}>{item.candidateVersion}</td>
          <td>{item.security ? <span className="security-flag"><ShieldAlert size={13} aria-hidden="true" /> Security</span> : "Standard"}</td>
          <td title={item.source ?? undefined}>{item.source ?? "Unknown"}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="package-updates-mobile-list">{packages.map((item) => <article className="package-update-card" key={item.name}>
      <div><strong title={item.name}>{item.name}</strong>{item.security ? <span className="pill critical">Security</span> : <span className="pill unknown">Standard</span>}</div>
      <dl><div><dt>Installed</dt><dd>{item.installedVersion}</dd></div><div><dt>Available</dt><dd>{item.candidateVersion}</dd></div><div><dt>Source</dt><dd>{item.source ?? "Unknown"}</dd></div></dl>
    </article>)}</div>
  </>;
}

function MachineUpdatesDialog({ machineId, fallback, onClose }: { machineId: string; fallback?: MachineUpdateSummary; onClose: () => void }) {
  const detail = useMachineUpdates(machineId);
  const [packageFilter, setPackageFilter] = useState<"all" | "security">("all");
  const machine = detail.data ?? fallback;
  const packages = (detail.data?.packages ?? []).filter((item) => packageFilter === "all" || item.security);
  const title = machine?.displayName ?? "Machine updates";

  return <Modal title={title} onClose={onClose} descriptionId="machine-updates-description">
    <div className="machine-updates-detail">
      {!machine ? <StateBlock tone={detail.isError ? "error" : "loading"} title={detail.isError ? "Update inventory unavailable" : "Loading update inventory"} message={detail.isError ? normalizeApiError(detail.error).message : "Reading the latest stored machine inventory."} /> : <>
        <div className="machine-updates-intro" id="machine-updates-description">
          <div><span>{machine.os.prettyName ?? "Operating system unavailable"}</span><small>{machine.hostname}</small></div>
          <div><MachineUpdateConditionPill machine={machine} /><AgentStatusPill status={machine.agentStatus} /></div>
        </div>
        <dl className="machine-update-detail-summary">
          <div><dt>Available updates</dt><dd>{formatUpdateCount(machine.updateCount)}</dd></div>
          <div><dt>Security updates</dt><dd className={(machine.securityUpdateCount ?? 0) > 0 ? "security-value" : ""}>{formatUpdateCount(machine.securityUpdateCount)}</dd></div>
          <div><dt>Reboot</dt><dd><RebootState machine={machine} /></dd></div>
          <div><dt>Last successful check</dt><dd><MachineCheckTime machine={machine} successfulOnly /></dd></div>
        </dl>
        <MachineUpdateStatusNote machine={machine} />
        {detail.isError ? <div className="stale-notice" role={fallback?.lastSuccessfulAt ? "status" : "alert"}>{fallback?.lastSuccessfulAt ? "Latest detail refresh failed. Showing the last available machine summary." : "Package details are currently unavailable. Try again when the Agent inventory service is reachable."}</div> : null}
        {machine.truncated ? <div className="stale-notice" role="status">Showing the first {detail.data?.packages.length ?? 0} package updates.</div> : null}
        {detail.data ? <>
          <div className="package-update-toolbar">
            <h3>Package updates</h3>
            <div className="segmented" aria-label="Filter package updates">
              <button className={packageFilter === "all" ? "active" : ""} onClick={() => setPackageFilter("all")} aria-pressed={packageFilter === "all"}>All</button>
              <button className={packageFilter === "security" ? "active" : ""} onClick={() => setPackageFilter("security")} aria-pressed={packageFilter === "security"}>Security</button>
            </div>
          </div>
          {packages.length ? <PackageUpdateTable packages={packages} /> : <MachinePackageEmptyState machine={machine} securityOnly={packageFilter === "security"} />}
        </> : detail.isLoading ? <StateBlock tone="loading" title="Loading package details" message="Reading the stored package inventory." /> : null}
      </>}
    </div>
  </Modal>;
}

function UpdatesPage({ initialMachineId, onInitialMachineApplied }: { initialMachineId?: string | null; onInitialMachineApplied?: () => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MachineUpdateFilter>("all");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(initialMachineId ?? null);
  const updates = useUpdates(debouncedSearch, status);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!initialMachineId) return;
    setSelectedMachineId(initialMachineId);
    onInitialMachineApplied?.();
  }, [initialMachineId, onInitialMachineApplied]);

  const machines = updates.data?.machines ?? [];

  if (updates.isLoading && !updates.data) return <StateBlock tone="loading" title="Loading updates" message="Reading stored Agent update inventories." />;
  if (!updates.data) return <StateBlock tone="error" title="Updates unavailable" message={normalizeApiError(updates.error).message} />;

  const isDefaultView = status === "all" && search.trim() === "" && debouncedSearch === "";
  const waitingForInventory = isDefaultView && updates.data.summaryState === "waiting";
  const allUpToDate = isDefaultView
    && updates.data.summaryState === "current"
    && updates.data.totalMachineCount > 0
    && updates.data.availableCount === 0;
  const retainedOnly = isDefaultView && updates.data.summaryState === "retained";
  const partialInventory = isDefaultView && updates.data.summaryState === "partial";
  const selectedMachine = updates.data.machines.find((machine) => machine.agentId === selectedMachineId);

  return (
    <div className="page-stack updates-page">
      <StaleNotice isError={updates.isError} dataUpdatedAt={updates.dataUpdatedAt} />
      <dl className="update-summary-strip" aria-label="Machine update summary">
        <div><dt>Available updates</dt><dd>{formatUpdateCount(updates.data.availableCount)}</dd></div>
        <div><dt>Security-critical</dt><dd className={(updates.data.securityCriticalCount ?? 0) > 0 ? "security-value" : ""}>{formatUpdateCount(updates.data.securityCriticalCount)}</dd></div>
        <div><dt>Reporting machines</dt><dd title={`${updates.data.currentReportingMachineCount} current, ${updates.data.retainedMachineCount} retained`}>{currentUpdateCoverage(updates.data)}</dd></div>
        <div>
          <dt>{updates.data.lastCheckedAt ? "Last checked" : updates.data.lastSuccessfulAt ? "Last known" : "Last checked"}</dt>
          <dd className={!updates.data.lastCheckedAt && !updates.data.lastSuccessfulAt ? "update-summary-status" : undefined}>
            {updates.data.lastCheckedAt
              ? <time dateTime={updates.data.lastCheckedAt} title={formatDateTime(updates.data.lastCheckedAt)}>{formatRelativeTime(updates.data.lastCheckedAt)}</time>
              : updates.data.lastSuccessfulAt
                ? <time dateTime={updates.data.lastSuccessfulAt} title={`Last successful report ${formatDateTime(updates.data.lastSuccessfulAt)}`}>{formatRelativeTime(updates.data.lastSuccessfulAt)}</time>
                : updates.data.machines.length > 0 ? "No current reports" : "No reports yet"}
          </dd>
        </div>
      </dl>
      <Panel title="Update Center">
        <div className="update-toolbar machine-update-toolbar">
          <label className="search-field"><Search size={16} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search machines or packages" aria-label="Search machines or packages" /></label>
          <NodeGuardSelect label="Status" value={status} options={[
            { value: "all", label: "All statuses" },
            { value: "updates", label: "Updates available" },
            { value: "security", label: "Security updates" },
            { value: "up_to_date", label: "Up to date" },
            { value: "reboot", label: "Reboot required" },
            { value: "unsupported", label: "Unsupported" },
            { value: "check_failed", label: "Check failed" },
            { value: "stale_offline", label: "Stale or offline" }
          ]} onChange={(value) => setStatus(value as MachineUpdateFilter)} />
        </div>
        {waitingForInventory ? <div className="update-state-banner" role="status"><RadioTower size={17} aria-hidden="true" /><span><strong>Waiting for update inventory</strong> Connected Agents will report operating-system updates after their first scheduled check.</span></div> : null}
        {retainedOnly ? <div className="update-state-banner warning" role="status"><AlertTriangle size={17} aria-hidden="true" /><span><strong>Showing retained inventory</strong> No machine has a current report. Counts come from the last successful inventories.</span></div> : null}
        {partialInventory ? <div className="update-state-banner warning" role="status"><AlertTriangle size={17} aria-hidden="true" /><span><strong>Some inventories are retained</strong> {currentUpdateCoverage(updates.data)} machines are current; counts include {updates.data.retainedMachineCount} retained {updates.data.retainedMachineCount === 1 ? "inventory" : "inventories"}.</span></div> : null}
        {allUpToDate ? <div className="update-state-banner success" role="status"><ShieldCheck size={17} aria-hidden="true" /><span><strong>All machines are up to date</strong> No operating-system updates are currently available.</span></div> : null}
        {machines.length === 0 ? <StateBlock
          icon={isDefaultView ? <RadioTower size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
          title={isDefaultView ? "No machines reporting updates" : "No matching machines"}
          message={isDefaultView ? "Install and connect a NodeGuard Agent to discover operating-system updates." : "Adjust the search or status filter."}
        /> : <>
          <div className="updates-table-wrap">
            <table className="updates-table machine-updates-table">
              <thead><tr><th scope="col">Machine</th><th scope="col">Operating system</th><th scope="col">Updates</th><th scope="col">Security</th><th scope="col">Reboot</th><th scope="col">Last checked</th><th scope="col">Agent status</th><th scope="col">Action</th></tr></thead>
              <tbody>{machines.map((machine) => <MachineUpdateRow machine={machine} key={machine.agentId} onView={() => setSelectedMachineId(machine.agentId)} />)}</tbody>
            </table>
          </div>
          <div className="updates-mobile-list">{machines.map((machine) => <MachineUpdateCard machine={machine} key={machine.agentId} onView={() => setSelectedMachineId(machine.agentId)} />)}</div>
        </>}
      </Panel>
      {selectedMachineId ? <MachineUpdatesDialog machineId={selectedMachineId} fallback={selectedMachine} onClose={() => setSelectedMachineId(null)} /> : null}
    </div>
  );
}

function SettingsPage() {
  const [connectionMessage, setConnectionMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const backendConfig = useSettingsStore((state) => state.backendConfig);
  const refreshIntervalSeconds = useSettingsStore((state) => state.refreshIntervalSeconds);
  const setRefreshIntervalSeconds = useSettingsStore((state) => state.setRefreshIntervalSeconds);
  const demoMode = backendConfig?.user.dataMode === "demo";
  const hideSensitiveValues = useSettingsStore((state) => state.hideSensitiveValues);
  const setHideSensitiveValues = useSettingsStore((state) => state.setHideSensitiveValues);
  const testConnection = async () => {
    setConnectionMessage(null);
    if (!backendConfig) {
      setConnectionMessage({ text: "No backend is configured.", tone: "error" });
      return;
    }

    try {
      const session = await getCurrentSession({ backendUrl: backendConfig.backendUrl });
      setConnectionMessage(session.authenticated
        ? { text: `Signed in as ${session.user?.username ?? "NodeGuard user"}.`, tone: "success" }
        : { text: "Session expired. Sign in again.", tone: "error" });
    } catch (error) {
      setConnectionMessage({ text: normalizeApiError(error).message, tone: "error" });
    }
  };

  const exportDiagnostics = () => {
    const diagnostics = {
      generatedAt: new Date().toISOString(),
      backendUrl: backendConfig ? maskSensitiveUrl(backendConfig.backendUrl, hideSensitiveValues) : null,
      username: backendConfig?.user.username ?? null,
      role: backendConfig?.user.role ?? null,
      connectedAt: backendConfig?.connectedAt ?? null,
      refreshIntervalSeconds,
      dataMode: "live",
      hideSensitiveValues
    };
    const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nodeguard-diagnostics.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-stack settings-page">
      <Panel title={demoMode ? "Session" : "Connection"} action={!demoMode ? <button className="secondary-button" onClick={testConnection}><RefreshCcw size={16} /> Test connection</button> : undefined}>
        <div className="settings-content">
          <p className="muted settings-description">{demoMode ? "This account is restricted to isolated fictional Demo Mode data." : "View and verify the active NodeGuard session."}</p>
          <div className="info-grid">
            {!demoMode ? <Info label="Backend URL" value={backendConfig ? maskSensitiveUrl(backendConfig.backendUrl, hideSensitiveValues) : "Not connected"} /> : null}
            <Info label="Signed in as" value={backendConfig?.user.username ?? "Not signed in"} />
            <Info label="Role" value={backendConfig?.user.role ?? "Unavailable"} />
            <Info label="Data mode" value={demoMode ? "Demo only" : "Live only"} />
            <Info label="Session started" value={formatDateTime(backendConfig?.connectedAt ?? null)} />
          </div>
          {connectionMessage ? <div className={`stale-notice ${connectionMessage.tone === "success" ? "success" : ""}`} role={connectionMessage.tone === "error" ? "alert" : "status"}>{connectionMessage.text}</div> : null}
        </div>
      </Panel>
      <Panel title="Monitoring">
        <div className="settings-content">
          <p className="muted settings-description">Choose how often NodeGuard refreshes health checks and live status data.</p>
          <div className="settings-control">
            <h3 className="settings-subheading">Live refresh interval</h3>
            <div className="segmented">
              {[1, 5, 10, 30, 60].map((value) => <button key={value} className={value === refreshIntervalSeconds ? "active" : ""} onClick={() => setRefreshIntervalSeconds(value)}>{value}s</button>)}
            </div>
          </div>
        </div>
      </Panel>
      {!demoMode ? <ProxmoxSettingsPanel /> : null}
      {demoMode ? <Panel title="Demo environment">
        <div className="settings-content"><p className="muted settings-description">Demo Mode is enforced for this account. All pages use isolated fictional infrastructure and cannot switch to Live Mode.</p></div>
      </Panel> : null}
      <Panel title={demoMode ? "Privacy" : "Privacy & Security"}>
        <div className="settings-content">
          <p className="muted settings-description">{demoMode ? "Live backend configuration and production diagnostics are hidden for this account." : "Control what is visible when sharing screenshots of NodeGuard."}</p>
          {!demoMode ? <div className="settings-list"><label><input type="checkbox" checked={hideSensitiveValues} onChange={(event) => setHideSensitiveValues(event.target.checked)} /> Hide backend URL in screenshots</label></div> : null}
        </div>
      </Panel>
      {!demoMode ? <Panel title="Diagnostics">
        <div className="settings-content">
          <div className="settings-inline-action">
            <p className="muted settings-description">Export a sanitized snapshot of this app's local configuration for troubleshooting.</p>
            <button onClick={exportDiagnostics}>Export diagnostics</button>
          </div>
        </div>
      </Panel> : null}
      <Panel title="About NodeGuard">
        <div className="settings-content about-content">
          <p className="muted settings-description">NodeGuard is a self-hosted, read-only infrastructure monitoring platform for Linux servers, Docker containers, domains, updates, alerts, and Proxmox infrastructure. It combines a React dashboard, TypeScript API, SQLite persistence, and a lightweight Go monitoring agent.</p>
          <div className="about-actions">
            <a className="secondary-button" href="https://github.com/HackintoshMatrix7132/NodeGuard" target="_blank" rel="noreferrer" title="Open NodeGuard on GitHub"><Github size={15} /> GitHub</a>
            {appConfig.supportUrl ? <a
              className="secondary-button about-support-link"
              href={appConfig.supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Support NodeGuard development on Ko-fi"
              title="Help support NodeGuard development and hosting."
            >
              <Heart size={15} aria-hidden="true" />
              <span>Support NodeGuard</span>
              <ExternalLink size={13} aria-hidden="true" />
            </a> : null}
          </div>
        </div>
      </Panel>
    </div>
  );
}


function ContainerSortHeader({ label, column, sortKey, sortDirection, onSort }: { label: string; column: ContainerSortKey; sortKey: ContainerSortKey; sortDirection: SortDirection; onSort: (key: ContainerSortKey) => void }) {
  const active = sortKey === column;
  const Icon = !active ? ArrowUpDown : sortDirection === "asc" ? ArrowUp : ArrowDown;
  return (
    <span role="columnheader" aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
      <button className={active ? "active" : ""} onClick={() => onSort(column)}>
        {label}
        <Icon size={13} />
      </button>
    </span>
  );
}

function ContainerTableHeader({ sortKey, sortDirection, onSort }: { sortKey: ContainerSortKey; sortDirection: SortDirection; onSort: (key: ContainerSortKey) => void }) {
  return (
    <div className="container-table-header" role="row">
      <ContainerSortHeader label="Name" column="name" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
      <ContainerSortHeader label="State" column="state" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
      <ContainerSortHeader label="Health" column="health" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
      <ContainerSortHeader label="Stack" column="stack" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
      <ContainerSortHeader label="Image" column="image" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
      <ContainerSortHeader label="IP address" column="ipAddress" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
      <ContainerSortHeader label="Published ports" column="publishedPorts" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
      <ContainerSortHeader label="Uptime" column="uptime" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
      <span role="columnheader">Actions</span>
    </div>
  );
}

function ContainerStateBadge({ container }: { container: Container }) {
  const labels: Record<Container["status"], string> = {
    running: "Running",
    restarting: "Restarting",
    stopped: "Stopped",
    exited: "Exited"
  };
  return <span className={`container-badge state-${container.status}`}>{labels[container.status]}</span>;
}

function ContainerHealthBadge({ health }: { health: Container["health"] }) {
  const label = health === "none" ? "None" : health.charAt(0).toUpperCase() + health.slice(1);
  return <span className={`container-badge health-${health}`}>{label}</span>;
}

function ContainerImageLink({ image }: { image: string }) {
  const repositoryUrl = getContainerImageRepositoryUrl(image);
  if (!repositoryUrl) {
    return <span className="container-truncate" title={image}>{image}</span>;
  }

  return (
    <a
      className="container-image-link"
      href={repositoryUrl}
      target="_blank"
      rel="noreferrer"
      title={image}
      aria-label={`Open image repository for ${image}`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <span>{image}</span>
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}

function ContainerTableRow({ container, selected, onSelect }: { container: Container; selected: boolean; onSelect: () => void }) {
  return (
    <div
      className={`container-table-row ${selected ? "selected" : ""}`}
      role="row"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      aria-label={`${selected ? "Hide" : "View"} details for ${container.name}`}
    >
      <span className="container-name-cell" role="cell" title={container.name}><strong>{container.name}</strong><small>{container.id}</small></span>
      <span role="cell"><ContainerStateBadge container={container} /></span>
      <span role="cell"><ContainerHealthBadge health={container.health} /></span>
      <span className="container-truncate" role="cell" title={container.stack ?? "Standalone"}>{container.stack ?? "Standalone"}</span>
      <span className="container-image-cell" role="cell"><ContainerImageLink image={container.image} /></span>
      <span className="container-mono" role="cell">{container.ipAddress ?? "Unavailable"}</span>
      <span className="container-truncate container-mono" role="cell" title={container.publishedPorts.join(", ") || "None"}>{container.publishedPorts.join(", ") || "None"}</span>
      <span role="cell">{container.uptime}</span>
      <span className="container-row-actions" role="cell">
        <button className="icon-only" onClick={(event) => { event.stopPropagation(); onSelect(); }} aria-label={`${selected ? "Hide" : "View"} details for ${container.name}`} title={selected ? "Hide details" : "View details"}>
          {selected ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </span>
    </div>
  );
}

function ContainerMobileCard({ container, selected, onSelect }: { container: Container; selected: boolean; onSelect: () => void }) {
  return (
    <article
      className={`container-mobile-card ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <div className="container-mobile-head">
        <div>
          <strong>{container.name}</strong>
          <small><ContainerImageLink image={container.image} /></small>
        </div>
        <button className="icon-only" onClick={(event) => { event.stopPropagation(); onSelect(); }} aria-label={`${selected ? "Hide" : "View"} details for ${container.name}`} title={selected ? "Hide details" : "View details"}>
          {selected ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      <div className="container-mobile-badges">
        <ContainerStateBadge container={container} />
        <ContainerHealthBadge health={container.health} />
      </div>
      <dl className="container-mobile-meta">
        <div><dt>Stack</dt><dd>{container.stack ?? "Standalone"}</dd></div>
        <div><dt>IP address</dt><dd>{container.ipAddress ?? "Unavailable"}</dd></div>
        <div><dt>Published ports</dt><dd>{container.publishedPorts.join(", ") || "None"}</dd></div>
        <div><dt>Uptime</dt><dd>{container.uptime}</dd></div>
      </dl>
    </article>
  );
}

function ContainerDetail({ container }: { container: Container }) {
  return (
    <div className="page-stack compact">
      <div className="info-grid">
        <Info label="Host" value={container.hostName ?? container.serverId} />
        <Info label="Image" value={container.image} />
        <Info label="Runtime state" value={container.state} />
        <Info label="Docker health" value={container.health === "none" ? "No healthcheck" : container.health} />
        <Info label="Stack" value={container.stack ?? "Standalone"} />
        <Info label="IP address" value={container.ipAddress ?? "Unavailable"} />
        <Info label="Restart policy" value={container.restartPolicy ?? "Unavailable"} />
        <Info label="Published ports" value={container.publishedPorts.join(", ") || "None"} />
        <Info label="Container ports" value={container.ports.join(", ") || "None"} />
        <Info label="Uptime" value={container.uptime} />
        <Info label="Restart count" value={container.restartCount === null || container.restartCount === undefined ? "Unavailable" : String(container.restartCount)} />
        <Info label="Memory" value={container.memoryLimitMb ? `${container.memoryLimitMb} MB limit` : "Unavailable"} />
      </div>
      <section className="container-logs" aria-labelledby={`container-logs-${container.id}`}>
        <h3 id={`container-logs-${container.id}`}>Logs</h3>
        <pre className="logs">{container.logs.length ? container.logs.join("\n") : "No limited log preview available."}</pre>
      </section>
    </div>
  );
}

function DockerUnavailable({ message }: { message: string }) {
  return (
    <section className="diagnostic-panel">
      <AlertTriangle size={18} />
      <div>
        <strong>Docker unavailable</strong>
        <p>NodeGuard could not read Docker container data from this host.</p>
        <small>{message}</small>
        <ul>
          <li>Docker is not installed.</li>
          <li>Docker daemon is not running.</li>
          <li>The backend does not have permission to access Docker metadata.</li>
          <li>The Docker socket is not mounted or readable.</li>
        </ul>
        <strong>How to fix</strong>
        <p>Check that Docker is running and that the NodeGuard backend has read-only access to Docker metadata.</p>
      </div>
    </section>
  );
}

function DomainRow({ domain, onCheck, onDuplicate, onEdit, onRemove }: { domain: DomainCheck; onCheck?: () => void; onDuplicate?: () => void; onEdit?: () => void; onRemove?: () => void }) {
  const hasActions = Boolean(onCheck || onDuplicate || onEdit || onRemove);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDetailsClosing, setIsDetailsClosing] = useState(false);
  const displayUrl = fullDomainUrl(domain);
  const trend = latencyTrend(domain);

  const toggleDetails = () => {
    if (isDetailsClosing) return;
    if (!isExpanded) {
      setIsExpanded(true);
      return;
    }

    setIsDetailsClosing(true);
    window.setTimeout(() => {
      setIsExpanded(false);
      setIsDetailsClosing(false);
    }, 210);
  };

  if (!hasActions) {
    return (
      <div className="data-row domain-summary-row">
        <span className="resource-cell">
          <span className="resource-title">
            <MonitoredExternalLink
              emphasis="strong"
              href={displayUrl}
              label={`Open ${displayUrl}`}
              text={displayUrl}
            />
          </span>
          <small>{domain.error ?? `${domain.https ? "HTTPS" : "HTTP"} · Expected ${domain.expectedStatusCodes.join(", ")} · Last checked ${formatRelativeTime(domain.lastCheckedAt)}`}</small>
        </span>
        <span>{domain.statusCode ? `HTTP ${domain.statusCode}` : "No status"}</span>
        <span>{formatResponseTime(domain.responseTimeMs)}</span>
        <span>{sslLabel(domain)}</span>
        <StatusPill status={domain.status} />
      </div>
    );
  }

  return (
    <div className={`domain-entry ${isExpanded ? "is-expanded" : ""}`}>
      <div className="data-row domain-action-row">
        <span className="resource-cell">
          <span className="resource-title">
            <MonitoredExternalLink
              emphasis="strong"
              href={displayUrl}
              label={`Open ${displayUrl}`}
              text={displayUrl}
            />
          </span>
          <small>{domain.error ?? `${domain.https ? "HTTPS" : "HTTP"} · Expected ${domain.expectedStatusCodes.join(", ")} · Last checked ${formatRelativeTime(domain.lastCheckedAt)}`}</small>
        </span>
        <div className="domain-compact-metrics" aria-label={`HTTP ${domain.statusCode ?? "unavailable"}, response time ${formatResponseTime(domain.responseTimeMs)}, ${compactUptimeLabel(domain)}, ${compactSslLabel(domain)}`}>
          <span>{domain.statusCode ? `HTTP ${domain.statusCode}` : "No status"}</span>
          <span className={`latency-trend ${trend.tone}`} title={trend.label}>
            {formatResponseTime(domain.responseTimeMs)} <span aria-hidden="true">{trend.symbol}</span>
          </span>
          <span>{compactUptimeLabel(domain)}</span>
          <span>{compactSslLabel(domain)}</span>
        </div>
        <StatusPill status={domain.status} />
        <div className="domain-row-actions">
          <button
            className="domain-details-toggle"
            onClick={toggleDetails}
            aria-expanded={isExpanded && !isDetailsClosing}
            aria-label={`${isExpanded && !isDetailsClosing ? "Hide" : "Show"} details for ${domain.domain}`}
          >
            <span>Details</span>
            <ChevronDown size={15} />
          </button>
          {onCheck ? (
            <button className="icon-only" onClick={onCheck} aria-label={`Check ${domain.domain}`} title={`Check ${domain.domain}`}>
              <RefreshCcw size={15} />
            </button>
          ) : null}
          {onDuplicate ? (
            <button className="icon-only" onClick={onDuplicate} aria-label={`Duplicate ${domain.domain}`} title={`Duplicate ${domain.domain}`}>
              <Copy size={15} />
            </button>
          ) : null}
          {onEdit ? (
            <button className="icon-only" onClick={onEdit} aria-label={`Edit ${domain.domain}`} title={`Edit ${domain.domain}`}>
              <Pencil size={15} />
            </button>
          ) : null}
          {onRemove ? (
            <button className="icon-only danger-soft" onClick={onRemove} aria-label={`Remove ${domain.domain}`} title={`Remove ${domain.domain}`}>
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      </div>
      {isExpanded ? (
        <div className={`domain-expanded-details ${isDetailsClosing ? "is-closing" : ""}`}>
          <div className="info-grid domain-detail-grid">
            <Info label="Current status" value={getStatusLabel(domain.status)} />
            <Info label="HTTP response" value={domain.statusCode ? `HTTP ${domain.statusCode}` : "No response"} />
            <Info label="Current latency" value={formatResponseTime(domain.responseTimeMs)} />
            <Info label="Previous latency" value={domain.previousResponseTimeMs === null ? "Collecting baseline" : formatResponseTime(domain.previousResponseTimeMs)} />
            <Info label="Latency trend" value={trend.label} />
            <Info label="30-day uptime" value={domain.uptimePercent === null ? "Collecting data" : `${domain.uptimePercent.toFixed(2)}%`} />
            <Info label="History samples" value={domain.checkSamples.toLocaleString()} />
            <Info label="Expected HTTP codes" value={domain.expectedStatusCodes.join(", ")} />
            <Info label="Protocol" value={domain.https ? "HTTPS" : "HTTP"} />
            <Info label="SSL expiration" value={domain.sslExpiresAt ? formatDateTime(domain.sslExpiresAt) : domain.https ? "Unavailable" : "Not applicable"} />
            <Info label="Last checked" value={formatDateTime(domain.lastCheckedAt)} />
            <Info label="Last successful" value={formatDateTime(domain.lastSuccessfulAt)} />
            <Info label="Last failed" value={formatDateTime(domain.lastFailedAt)} />
            <Info label="Latest result" value={domain.error ?? "Expected response received"} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  return (
    <div className="data-row alert-row">
      <span><strong>{alert.title}</strong><small>{alert.affectedResource} · Last seen {formatRelativeTime(alert.lastSeenAt)}</small></span>
      <StatusPill status={alert.status === "resolved" ? "resolved" : alert.severity} />
    </div>
  );
}

function ServerMonitorRow({ monitor, onDuplicate, onEdit, onRemove }: { monitor: MonitoredServerStatus; onDuplicate: () => void; onEdit: () => void; onRemove: () => void }) {
  return (
    <div className="data-row monitor-row">
      <span className="resource-cell">
        <strong>{monitor.name}</strong>
        <small className="resource-meta">
          <MonitoredExternalLink
            href={monitor.backendUrl}
            label={`Open ${monitor.backendUrl}`}
            text={monitor.backendUrl}
          />
          <span className="resource-context" title={monitor.lastError ?? `Checked ${formatDateTime(monitor.lastCheckedAt)}`}>· {monitor.lastError ?? `checked ${formatRelativeTime(monitor.lastCheckedAt)}`}</span>
        </small>
      </span>
      <StatusPill status={monitor.status} />
      <button className="icon-only" onClick={onDuplicate} aria-label={`Duplicate ${monitor.name}`} title={`Duplicate ${monitor.name}`}>
        <Copy size={15} />
      </button>
      <button className="icon-only" onClick={onEdit} aria-label={`Edit ${monitor.name}`}>
        <Pencil size={15} />
      </button>
      <button className="icon-only danger-soft" onClick={onRemove} aria-label={`Remove ${monitor.name}`}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function ContainerMonitorRow({ monitor, onDuplicate, onEdit, onRemove }: { monitor: ContainerMonitorStatus; onDuplicate: () => void; onEdit: () => void; onRemove: () => void }) {
  const summary = `${monitor.containerRef}${monitor.matchedContainerName ? ` · matched ${monitor.matchedContainerName}` : ""} · ${monitor.lastError ?? `checked ${formatRelativeTime(monitor.lastCheckedAt)}`}`;
  return (
    <div className="data-row monitor-row">
      <span>
        <strong>{monitor.name}</strong>
        <small title={summary}>{summary}</small>
      </span>
      <StatusPill status={monitor.status} />
      <button className="icon-only" onClick={onDuplicate} aria-label={`Duplicate ${monitor.name}`} title={`Duplicate ${monitor.name}`}>
        <Copy size={15} />
      </button>
      <button className="icon-only" onClick={onEdit} aria-label={`Edit ${monitor.name}`}>
        <Pencil size={15} />
      </button>
      <button className="icon-only danger-soft" onClick={onRemove} aria-label={`Remove ${monitor.name}`}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function AlertDetail({ alert }: { alert: Alert }) {
  return (
    <div className="alert-detail page-stack compact">
      <div className="detail-title">
        <div>
          <h3>{alert.title}</h3>
          <p>{alert.message}</p>
        </div>
        <StatusPill status={alert.severity} />
      </div>
      <div className="info-grid">
        <Info label="Affected service" value={alert.affectedResource} />
        <Info label="First seen" value={formatDateTime(alert.firstSeenAt)} />
        <Info label="Last seen" value={formatDateTime(alert.lastSeenAt)} />
        <Info label="Occurrences" value={String(alert.occurrenceCount)} />
        <Info label="Status" value={alert.status} />
        <Info label="Resolved" value={formatDateTime(alert.resolvedAt)} />
      </div>
      <section>
        <h3>What happened</h3>
        <p>{alert.message}</p>
      </section>
      <section>
        <h3>Possible cause</h3>
        <p>{alert.possibleCause ?? "NodeGuard could not determine a likely cause yet."}</p>
      </section>
      <section>
        <h3>Failed checks</h3>
        <ul>{alert.failedChecks.map((check) => <li key={check}>{check}</li>)}</ul>
      </section>
      <section>
        <h3>Suggested next steps</h3>
        <ol>{alert.suggestedNextSteps.map((step) => <li key={step}>{step}</li>)}</ol>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info"><span>{label}</span><strong>{value}</strong></div>;
}

function InfoGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="server-info-group">
    <h3>{title}</h3>
    <div className="info-grid">{children}</div>
  </section>;
}

function agentStatusTone(status: AgentStatus) {
  if (status === "online") return "healthy";
  if (status === "stale") return "warning";
  if (status === "offline" || status === "revoked") return "critical";
  return "unknown";
}

function AgentStatusPill({ status }: { status: AgentStatus }) {
  return <span className={`pill ${agentStatusTone(status)}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

function formatReportedBytes(value: number | null) {
  return value === null ? "Unavailable" : formatBytes(value / 1024 / 1024 / 1024);
}

function shortAgentId(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function enrollmentCountdown(expiresAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return seconds === 0 ? "Expired" : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function EnrollmentProgress({ progress }: { progress: AgentEnrollmentProgress | undefined }) {
  const state = progress?.state ?? "waiting";
  const registered = ["registered", "connected", "online"].includes(state);
  const connected = ["connected", "online"].includes(state);
  const online = state === "online";
  const terminalError = state === "expired" || state === "revoked";
  const steps = [
    { label: "Agent registered", complete: registered, current: state === "waiting" || state === "registered" },
    { label: "Agent connected", complete: connected, current: state === "connected" },
    { label: "Online", complete: online, current: state === "online" }
  ];

  return (
    <div className={`agent-enrollment-progress ${terminalError ? "has-error" : ""}`} aria-live="polite">
      <strong>{terminalError ? `Enrollment ${state}` : state === "waiting" ? "Waiting for Agent..." : online ? "Agent is online" : "Connecting Agent..."}</strong>
      <div>{steps.map((step) => <span key={step.label} className={step.complete ? "complete" : step.current ? "current" : ""}>{step.complete ? <Check size={13} /> : step.current && !online ? <LoaderCircle className="is-spinning" size={13} /> : <span className="progress-dot" />}{step.label}</span>)}</div>
    </div>
  );
}

function RegistrationCommand({ enrollment, serverUrl, progress, onCopyError, onViewAgent }: {
  enrollment: CreatedAgentEnrollmentToken;
  serverUrl: string;
  progress?: AgentEnrollmentProgress;
  onCopyError: (message: string) => void;
  onViewAgent?: (agentId: string) => void;
}) {
  const [copiedValue, setCopiedValue] = useState<"command" | "token" | null>(null);
  const [now, setNow] = useState(Date.now());
  const copyTimer = useRef<number | null>(null);
  const isRotation = enrollment.purpose === "rotate";
  const command = buildAgentCommand({
    serverUrl,
    displayName: enrollment.displayName,
    rotation: isRotation,
  });
  const countdown = enrollmentCountdown(enrollment.expiresAt, now);
  const expired = countdown === "Expired" || progress?.state === "expired" || progress?.state === "revoked";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
  }, []);

  const copy = async (value: string, kind: "command" | "token") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(kind);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedValue(null), 2200);
    } catch {
      onCopyError(`The browser could not copy the ${kind}.`);
    }
  };

  return (
    <div className="agent-command-block">
      <div className="agent-command-heading">
        <span><strong>{isRotation ? "Rotate this agent credential" : "Installation command"}</strong><small>{isRotation ? "Run once on the registered host." : "Run this command on the Linux host you want to monitor."}</small></span>
        <span className={expired ? "expired" : ""}>{expired ? "Expired" : `Expires in ${countdown}`}</span>
      </div>
      <code>{command}</code>
      <div className="agent-enrollment-token">
        <span><strong>One-time enrollment token</strong><small>Paste this token at the secure prompt. It is never added to the command or process arguments.</small></span>
        <code>{enrollment.token}</code>
        <button className="secondary-button" type="button" onClick={() => void copy(enrollment.token, "token")} disabled={expired}>
          <span key={copiedValue === "token" ? "copied" : "copy"} className="copy-state-icon">{copiedValue === "token" ? <Check size={15} /> : <Copy size={15} />}</span>
          {copiedValue === "token" ? "Token copied" : "Copy token"}
        </button>
      </div>
      {!isRotation ? <div className="agent-installer-checklist">
        <span><Check size={13} /> Download the correct Agent</span>
        <span><ShieldCheck size={13} /> Verify the binary</span>
        <span><KeyRound size={13} /> Register the host</span>
        <span><FileText size={13} /> Install the system service</span>
        <span><RadioTower size={13} /> Start monitoring automatically</span>
      </div> : null}
      <div className="agent-command-actions">
        <button className="secondary-button" type="button" onClick={() => void copy(command, "command")} disabled={expired}><span key={copiedValue === "command" ? "copied" : "copy"} className="copy-state-icon">{copiedValue === "command" ? <Check size={15} /> : <Copy size={15} />}</span>{copiedValue === "command" ? "Command copied" : "Copy command"}</button>
        {!isRotation ? <a className="secondary-button" href={`${serverUrl}/install-agent.sh`} target="_blank" rel="noreferrer"><FileText size={15} /> View installation script</a> : null}
      </div>
      {!isRotation ? <details className="agent-manual-install">
        <summary><Download size={14} /> Manual installation</summary>
        <p>Download the matching release binary and <code>checksums.txt</code>, verify SHA-256, install the binary at <code>/usr/local/bin/nodeguard-agent</code>, then enroll it with this one-time token.</p>
        <a href="https://github.com/HackintoshMatrix7132/NodeGuard/tree/main/agent" target="_blank" rel="noreferrer">Open the manual installation guide <ExternalLink size={13} /></a>
      </details> : null}
      {!isRotation ? <EnrollmentProgress progress={progress} /> : null}
      {progress?.state === "online" && progress.agent && onViewAgent ? <button className="primary-button agent-view-button" type="button" onClick={() => onViewAgent(progress.agent!.id)}><RadioTower size={15} /> View online Agent</button> : null}
    </div>
  );
}

function AgentListRow({ agent, selected, onSelect }: { agent: AgentSummary; selected: boolean; onSelect: () => void }) {
  return (
    <tr className={selected ? "selected" : ""} onClick={onSelect} tabIndex={0} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect();
      }
    }}>
      <td><strong>{agent.displayName}</strong><small>{agent.hostname}</small></td>
      <td><AgentStatusPill status={agent.status} /></td>
      <td>{agent.osName ?? "Unavailable"}</td>
      <td className="mono-cell">{agent.agentVersion}</td>
      <td>{formatPercentage(agent.cpuUsagePercent)}</td>
      <td>{formatPercentage(agent.memoryUsagePercent)}</td>
      <td>{agent.containerCount}</td>
      <td>{formatRelativeTime(agent.lastSeenAt)}</td>
      <td>{formatDateTime(agent.registeredAt)}</td>
      <td><button className="icon-only" onClick={(event) => { event.stopPropagation(); onSelect(); }} aria-label={`${selected ? "Hide" : "View"} ${agent.displayName} details`}>{selected ? <EyeOff size={15} /> : <Eye size={15} />}</button></td>
    </tr>
  );
}

function AgentMobileCard({ agent, selected, onSelect }: { agent: AgentSummary; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`agent-mobile-card ${selected ? "selected" : ""}`} onClick={onSelect}>
      <span className="agent-mobile-heading"><span><strong>{agent.displayName}</strong><small>{agent.hostname}</small></span><AgentStatusPill status={agent.status} /></span>
      <span className="agent-mobile-metrics"><span>CPU <strong>{formatPercentage(agent.cpuUsagePercent)}</strong></span><span>RAM <strong>{formatPercentage(agent.memoryUsagePercent)}</strong></span><span>Containers <strong>{agent.containerCount}</strong></span></span>
      <small>{agent.osName ?? "OS unavailable"} · Seen {formatRelativeTime(agent.lastSeenAt)}</small>
    </button>
  );
}

function AgentUpdateSummary({ machine, loading, unavailable, refreshFailed, onOpen }: { machine?: MachineUpdateSummary; loading: boolean; unavailable: boolean; refreshFailed: boolean; onOpen: () => void }) {
  const retainedAt = machine && hasRetainedUpdateInventory(machine) ? machine.lastSuccessfulAt : null;
  const checkLabel = retainedAt ? "Last known" : "Last checked";
  const checkValue = retainedAt
    ? formatRelativeTime(retainedAt)
    : machine?.checkedAt
      ? formatRelativeTime(machine.checkedAt)
      : machine?.lastSuccessfulAt
        ? formatRelativeTime(machine.lastSuccessfulAt)
        : "No report yet";

  return <section className="server-info-group agent-update-summary">
    <h3>System updates</h3>
    {machine ? <>
      <div className="info-grid">
        <Info label="Available" value={formatUpdateCount(machine.updateCount)} />
        <Info label="Security" value={formatUpdateCount(machine.securityUpdateCount)} />
        <Info label="Reboot" value={machine.rebootRequired === null ? "Unavailable" : machine.rebootRequired ? "Required" : "Not required"} />
        <Info label={checkLabel} value={checkValue} />
      </div>
      {refreshFailed ? <div className="stale-notice" role="status">Latest refresh failed. Showing the last available update inventory.</div> : null}
      <div className="agent-update-summary-footer"><MachineUpdateConditionPill machine={machine} /><button className="secondary-button" onClick={onOpen}><PackageOpen size={15} aria-hidden="true" /> View in Update Center</button></div>
    </> : <div className="agent-update-empty"><span>{loading ? "Loading the latest update inventory..." : unavailable ? "Update inventory is currently unavailable." : "Waiting for this Agent's first scheduled update check."}</span><button className="secondary-button" onClick={onOpen}><PackageOpen size={15} aria-hidden="true" /> View Update Center</button></div>}
  </section>;
}

function AgentsPage({ onOpenContainers, onOpenUpdates }: { onOpenContainers: (agentId: string) => void; onOpenUpdates: (agentId: string) => void }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AgentStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<"add" | "rename" | "rotate" | "revoke" | "delete" | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [enrollment, setEnrollment] = useState<CreatedAgentEnrollmentToken | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const agents = useAgents();
  const detail = useAgent(selectedId);
  const updates = useUpdates();
  const enrollmentProgress = useAgentEnrollmentProgress(enrollment?.purpose === "enroll" ? enrollment.id : null);
  const enrollmentTokens = useAgentEnrollmentTokens();
  const createEnrollment = useCreateAgentEnrollmentToken();
  const revokeEnrollment = useRevokeAgentEnrollmentToken();
  const renameAgent = useRenameAgent();
  const createRotation = useCreateAgentRotationToken();
  const revokeAgent = useRevokeAgent();
  const deleteAgentMutation = useDeleteAgent();
  const backendConfig = useSettingsStore((state) => state.backendConfig);
  const demoMode = useSettingsStore((state) => state.demoMode);
  const serverUrl = backendConfig?.backendUrl ?? window.location.origin;
  const selectedMachineUpdates = updates.data?.machines.find((machine) => machine.agentId === selectedId);
  const visibleAgents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (agents.data?.agents ?? []).filter((agent) => statusFilter === "all" || agent.status === statusFilter).filter((agent) =>
      !normalized || [agent.displayName, agent.hostname, agent.osName, agent.agentVersion].filter(Boolean).join(" ").toLowerCase().includes(normalized));
  }, [agents.data, query, statusFilter]);

  const closeModal = (force = false) => {
    if (deleteAgentMutation.isPending && !force) return;
    setModal(null);
    setEnrollment(null);
    setDisplayName("");
    setDeleteConfirmation("");
    setFormError(null);
  };

  const generateEnrollment = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    try {
      setEnrollment(await createEnrollment.mutateAsync({ displayName: displayName.trim() || undefined }));
    } catch (error) {
      setFormError(normalizeApiError(error).message);
    }
  };

  const saveRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    setFormError(null);
    try {
      await renameAgent.mutateAsync({ id: selectedId, displayName });
      setSuccessMessage(`${displayName.trim()} was successfully renamed.`);
      closeModal();
    } catch (error) {
      setFormError(normalizeApiError(error).message);
    }
  };

  const startRotation = async () => {
    if (!selectedId) return;
    setFormError(null);
    setModal("rotate");
    try {
      setEnrollment(await createRotation.mutateAsync(selectedId));
    } catch (error) {
      setFormError(normalizeApiError(error).message);
    }
  };

  const confirmRevoke = async () => {
    if (!selectedId) return;
    setFormError(null);
    try {
      await revokeAgent.mutateAsync(selectedId);
      setSuccessMessage(`${detail.data?.displayName ?? "Agent"} was successfully revoked.`);
      setSelectedId(null);
      closeModal(true);
    } catch (error) {
      setFormError(normalizeApiError(error).message);
    }
  };

  const confirmDelete = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId || deleteConfirmation !== "DELETE" || deleteAgentMutation.isPending) return;
    const agentName = detail.data?.displayName ?? "Agent";
    setFormError(null);
    try {
      await deleteAgentMutation.mutateAsync(selectedId);
      setSelectedId(null);
      setSuccessMessage(`${agentName} was deleted successfully.`);
      closeModal(true);
    } catch (error) {
      const apiError = normalizeApiError(error);
      setFormError(apiError.code === "agent_not_found"
        ? "Agent not found. It may already have been deleted."
        : "Unable to delete the Agent. No changes were completed. Please try again.");
    }
  };

  return (
    <div className="page-stack agents-page">
      {successMessage ? <SuccessNotice key={successMessage} message={successMessage} onDismiss={setSuccessMessage} /> : null}
      <Panel title="Linux agents" action={(
        <div className="agent-toolbar">
          <div className="search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search agents" aria-label="Search agents" /></div>
          <NodeGuardSelect
            className="agent-status-filter"
            label="Status"
            labelPosition="inline"
            value={statusFilter}
            options={[{ value: "all", label: "All statuses" }, { value: "online", label: "Online" }, { value: "stale", label: "Stale" }, { value: "offline", label: "Offline" }, { value: "revoked", label: "Revoked" }]}
            onChange={(value) => setStatusFilter(value as "all" | AgentStatus)}
          />
          <button className="icon-only" onClick={() => agents.refetch()} disabled={agents.isFetching} title="Refresh agents" aria-label="Refresh agents"><RefreshCcw className={agents.isFetching ? "is-spinning" : ""} size={15} /></button>
          {!demoMode ? <button className="primary-button" onClick={() => { setModal("add"); setDisplayName(""); setEnrollment(null); }}><Plus size={16} /> Add agent</button> : null}
        </div>
      )}>
        {agents.isLoading ? <StateBlock tone="loading" title="Loading agents" message="Reading registered Linux hosts." /> : null}
        {agents.isError && !agents.data ? <StateBlock tone="error" title="Agents unavailable" message={normalizeApiError(agents.error).message} /> : null}
        {agents.data && visibleAgents.length === 0 ? <StateBlock icon={<RadioTower size={18} aria-hidden="true" />} title="No agents found" message={agents.data.agents.length === 0 ? "Generate an enrollment token to register the first Linux host." : "No agents matched the current search and status filter."} /> : null}
        {visibleAgents.length > 0 ? (
          <>
            <div className="agents-table-wrap"><table className="agents-table"><thead><tr><th>Agent</th><th>Status</th><th>Operating system</th><th>Version</th><th>CPU</th><th>RAM</th><th>Containers</th><th>Last seen</th><th>Registered</th><th>Actions</th></tr></thead><tbody>{visibleAgents.map((agent) => <AgentListRow key={agent.id} agent={agent} selected={selectedId === agent.id} onSelect={() => setSelectedId((current) => current === agent.id ? null : agent.id)} />)}</tbody></table></div>
            <div className="agents-mobile-list">{visibleAgents.map((agent) => <AgentMobileCard key={agent.id} agent={agent} selected={selectedId === agent.id} onSelect={() => setSelectedId((current) => current === agent.id ? null : agent.id)} />)}</div>
          </>
        ) : null}
      </Panel>
      {selectedId ? (
        <Panel title={detail.data?.displayName ?? "Agent detail"} action={detail.data ? <AgentStatusPill status={detail.data.status} /> : undefined}>
          {detail.isLoading ? <StateBlock tone="loading" title="Loading agent" message="Reading the latest inventory and metrics." /> : null}
          {detail.isError ? <StateBlock tone="error" title="Agent detail unavailable" message={normalizeApiError(detail.error).message} /> : null}
          {detail.data ? (
            <div className="agent-detail">
              <InfoGroup title="Overview"><Info label="Display name" value={detail.data.displayName} /><Info label="Hostname" value={detail.data.hostname} /><Info label="OS" value={[detail.data.osName, detail.data.osVersion].filter(Boolean).join(" ") || "Unavailable"} /><Info label="Kernel" value={detail.data.kernel ?? "Unavailable"} /><Info label="Architecture" value={detail.data.architecture ?? "Unavailable"} /><Info label="IP addresses" value={detail.data.ipAddresses.join(", ") || "Unavailable"} /><Info label="Agent version" value={detail.data.agentVersion} /><Info label="Registered" value={formatDateTime(detail.data.registeredAt)} /><Info label="Last seen" value={formatDateTime(detail.data.lastSeenAt)} /></InfoGroup>
              <InfoGroup title="Resources"><Info label="CPU" value={formatPercentage(detail.data.latestMetrics?.cpu.usagePercent ?? null)} /><Info label="CPU model" value={detail.data.cpuModel ?? "Unavailable"} /><Info label="CPU cores" value={[detail.data.physicalCoreCount === null ? null : `${detail.data.physicalCoreCount} physical`, detail.data.logicalCpuCount === null ? null : `${detail.data.logicalCpuCount} logical`].filter(Boolean).join(" / ") || "Unavailable"} /><Info label="RAM" value={formatPercentage(detail.data.latestMetrics?.memory.usagePercent ?? null)} /><Info label="Disk" value={formatPercentage(detail.data.latestMetrics?.disk.usagePercent ?? null)} /><Info label="Swap" value={formatPercentage(detail.data.latestMetrics?.swap.usagePercent ?? null)} /><Info label="Load averages" value={[detail.data.latestMetrics?.cpu.loadAverage, detail.data.latestMetrics?.cpu.loadAverage5, detail.data.latestMetrics?.cpu.loadAverage15].map((value) => value ?? "-").join(" / ")} /><Info label="Uptime" value={formatUptime(detail.data.systemUptimeSeconds)} /><Info label="Installed RAM" value={formatReportedBytes(detail.data.totalMemoryBytes)} /><Info label="Installed swap" value={formatReportedBytes(detail.data.totalSwapBytes)} /></InfoGroup>
              <InfoGroup title="Docker"><Info label="Availability" value={detail.data.dockerAvailable ? "Available" : "Unavailable"} /><Info label="Version" value={detail.data.dockerVersion ?? "Unavailable"} /><Info label="Containers" value={String(detail.data.containerCount)} /><Info label="Last inventory" value={formatDateTime(detail.data.lastDockerAt)} /></InfoGroup>
              <AgentUpdateSummary machine={selectedMachineUpdates} loading={updates.isLoading} unavailable={updates.isError && !updates.data} refreshFailed={updates.isError && Boolean(updates.data)} onOpen={() => onOpenUpdates(detail.data.id)} />
              <InfoGroup title="Connection"><Info label="Last heartbeat" value={formatDateTime(detail.data.lastSeenAt)} /><Info label="Last metrics report" value={formatDateTime(detail.data.lastMetricsAt)} /><Info label="Last host inventory" value={formatDateTime(detail.data.lastInventoryAt)} /><Info label="Agent ID" value={shortAgentId(detail.data.id)} /><Info label="Credential" value={detail.data.credentialStatus === "active" ? "Active" : "Revoked"} /></InfoGroup>
              <div className="agent-detail-actions">
                <button onClick={() => onOpenContainers(detail.data.id)}><Boxes size={15} /> View host containers</button>
                <button onClick={() => void navigator.clipboard.writeText(detail.data.id).then(() => setSuccessMessage("Agent ID copied to the clipboard.")).catch(() => setFormError("The browser could not copy the agent ID."))}><Copy size={15} /> Copy agent ID</button>
                {!demoMode ? <button onClick={() => { setDisplayName(detail.data.displayName); setModal("rename"); }}><Pencil size={15} /> Rename</button> : null}
                {!demoMode ? <button onClick={() => void startRotation()}><KeyRound size={15} /> Rotate credential</button> : null}
              </div>
              {!demoMode ? <div className="agent-lifecycle-actions" aria-label="Agent access and deletion actions">
                <div>
                  <span><strong>Revoke</strong><small>Disable this Agent's access while preserving its data and history.</small></span>
                  {detail.data.status !== "revoked" ? <button className="danger-button secondary-danger" onClick={() => { setFormError(null); setModal("revoke"); }}><ShieldAlert size={15} /> Revoke agent</button> : <AgentStatusPill status="revoked" />}
                </div>
                <div>
                  <span><strong>Delete</strong><small>Permanently remove this Agent and its stored data.</small></span>
                  <button className="danger-button" onClick={() => { setFormError(null); setDeleteConfirmation(""); setModal("delete"); }}><Trash2 size={15} /> Delete Agent</button>
                </div>
              </div> : null}
            </div>
          ) : null}
        </Panel>
      ) : null}
      {modal === "add" ? <Modal title="Install NodeGuard Agent" onClose={closeModal}><p className="agent-install-description">Run this command on the Linux host you want to monitor.</p><form className="modal-form agent-install-form" onSubmit={generateEnrollment}>{enrollment ? <RegistrationCommand enrollment={enrollment} serverUrl={serverUrl} progress={enrollmentProgress.data} onCopyError={setFormError} onViewAgent={(agentId) => { setSelectedId(agentId); closeModal(); }} /> : <div className="agent-enrollment-form-row"><label>Display name (optional)<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Docker main" maxLength={120} /></label><button className="primary-button agent-generate-button" type="submit" disabled={createEnrollment.isPending} aria-busy={createEnrollment.isPending}>{createEnrollment.isPending ? <LoaderCircle className="is-spinning" size={16} /> : <KeyRound size={16} />}{createEnrollment.isPending ? "Generating..." : "Generate enrollment token"}</button></div>}</form>{formError ? <div className="form-error" role="alert">{formError}</div> : null}{(enrollmentTokens.data?.tokens.length ?? 0) > 0 ? <div className="active-enrollments"><strong>Active enrollment tokens</strong>{enrollmentTokens.data?.tokens.map((token) => <div key={token.id}><span>{token.displayName ?? "Unnamed agent"} · expires {formatDateTime(token.expiresAt)}</span><button className="icon-only danger-button" onClick={() => revokeEnrollment.mutate(token.id)} title="Revoke enrollment token" aria-label="Revoke enrollment token"><Trash2 size={14} /></button></div>)}</div> : null}</Modal> : null}
      {modal === "rename" ? <Modal title="Rename agent" onClose={closeModal}><form className="modal-form" onSubmit={saveRename}><label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={120} /></label><button className="modal-submit" disabled={renameAgent.isPending}>Save name</button></form>{formError ? <div className="form-error" role="alert">{formError}</div> : null}</Modal> : null}
      {modal === "rotate" ? <Modal title="Rotate agent credential" onClose={closeModal}>{createRotation.isPending ? <StateBlock tone="loading" title="Creating rotation token" message="Preparing a single-use credential rotation command." /> : null}{enrollment ? <RegistrationCommand enrollment={enrollment} serverUrl={serverUrl} onCopyError={setFormError} /> : null}{formError ? <div className="form-error" role="alert">{formError}</div> : null}</Modal> : null}
      {modal === "revoke" ? <Modal title="Revoke agent" onClose={() => closeModal()} closeDisabled={revokeAgent.isPending}><div className="confirmation-dialog"><p>Revoke <strong>{detail.data?.displayName}</strong>? Its credential will stop working immediately.</p><p>Revoking disables this Agent's access but keeps its data and history. It does not uninstall the Agent from the remote Linux host.</p><div><button type="button" onClick={() => closeModal()} disabled={revokeAgent.isPending}>Cancel</button><button className="danger-button" type="button" onClick={() => void confirmRevoke()} disabled={revokeAgent.isPending} aria-busy={revokeAgent.isPending}>{revokeAgent.isPending ? <LoaderCircle className="is-spinning" size={15} /> : <ShieldAlert size={15} />}{revokeAgent.isPending ? "Revoking..." : "Revoke agent"}</button></div></div>{formError ? <div className="form-error" role="alert">{formError}</div> : null}</Modal> : null}
      {modal === "delete" ? <Modal title="Delete Agent" onClose={() => closeModal()} closeDisabled={deleteAgentMutation.isPending} descriptionId="delete-agent-description"><form className="confirmation-dialog agent-delete-confirmation" onSubmit={confirmDelete}><p id="delete-agent-description">Permanently delete this Agent and its stored monitoring data from NodeGuard.</p><p>You are about to permanently delete:<strong className="agent-delete-name">{detail.data?.displayName ?? "Agent"}</strong></p><p>This will permanently remove:</p><ul><li>Agent registration</li><li>Stored credentials</li><li>Heartbeat and metrics history</li><li>Host and Docker inventory</li><li>Related Agent monitoring data</li></ul>{detail.data?.status !== "revoked" ? <p className="agent-delete-warning"><ShieldAlert size={16} /> The Agent credential will be invalidated as part of deletion.</p> : null}<p>Deleting the Agent from NodeGuard does not uninstall the NodeGuard Agent from the remote Linux host.</p><p><strong>This action cannot be undone.</strong></p><label className="agent-delete-field">Type <code>DELETE</code> to confirm<input data-autofocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" spellCheck={false} disabled={deleteAgentMutation.isPending} /></label><div><button type="button" onClick={() => closeModal()} disabled={deleteAgentMutation.isPending}>Cancel</button><button className="danger-button" type="submit" disabled={deleteConfirmation !== "DELETE" || deleteAgentMutation.isPending} aria-busy={deleteAgentMutation.isPending}>{deleteAgentMutation.isPending ? <LoaderCircle className="is-spinning" size={15} /> : <Trash2 size={15} />}{deleteAgentMutation.isPending ? "Deleting..." : "Delete Agent"}</button></div></form>{formError ? <div className="form-error" role="alert">{formError}</div> : null}</Modal> : null}
    </div>
  );
}

function UpdatesNavLabel() {
  const updates = useUpdates();
  const count = updates.data?.availableCount ?? 0;
  return <><span>Updates</span>{count > 0 ? <span className="nav-count" aria-label={`${count} updates available`}>{count > 99 ? "99+" : count}</span> : null}</>;
}

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [containerHostFilter, setContainerHostFilter] = useState<string | null>(null);
  const [pendingUpdateMachineId, setPendingUpdateMachineId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 980px)").matches);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutTimer = useRef<number | null>(null);
  const sidebarRevealRef = useRef<HTMLButtonElement>(null);
  const focusRevealAfterClose = useRef(false);
  const backendConfig = useSettingsStore((state) => state.backendConfig);
  const demoMode = useSettingsStore((state) => state.demoMode);
  const load = useSettingsStore((state) => state.load);
  const disconnect = useSettingsStore((state) => state.disconnect);

  useEffect(() => {
    load();

    return () => {
      if (logoutTimer.current) {
        window.clearTimeout(logoutTimer.current);
      }
    };
  }, [load]);

  if (!backendConfig && !demoMode) return <ConnectScreen />;

  const nav = [
    ["dashboard", Gauge, "Dashboard"],
    ["server", Server, "Machines"],
    ["proxmox", ProxmoxIcon, "Proxmox"],
    ["agents", RadioTower, "Agents"],
    ["containers", Boxes, "Containers"],
    ["domains", Globe2, "Domains"],
    ["updates", PackageOpen, "Updates"],
    ["alerts", Bell, "Alerts"],
    ["settings", Settings, "Settings"]
  ] as const;
  const activeNavItem = nav.find(([key]) => key === view);
  const ActiveIcon = activeNavItem?.[1] ?? Gauge;
  const activeLabel = activeNavItem?.[2] ?? "Dashboard";

  const logout = () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    logoutTimer.current = window.setTimeout(() => {
      if (backendConfig) {
        void logoutSession({ backendUrl: backendConfig.backendUrl }).catch(() => null);
      }
      disconnect();
      setIsLoggingOut(false);
    }, 260);
  };

  const selectView = (nextView: View) => {
    setView(nextView);
    if (window.matchMedia("(max-width: 980px)").matches) {
      focusRevealAfterClose.current = true;
      setSidebarCollapsed(true);
    }
  };

  const openSidebar = () => {
    focusRevealAfterClose.current = false;
    setSidebarCollapsed(false);
  };

  const closeSidebar = () => {
    focusRevealAfterClose.current = true;
    setSidebarCollapsed(true);
  };

  const handleSidebarTransitionEnd = (event: TransitionEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== "opacity") return;
    if (!sidebarCollapsed || !focusRevealAfterClose.current) return;

    focusRevealAfterClose.current = false;
    sidebarRevealRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${isLoggingOut ? "logging-out" : ""}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <button
        ref={sidebarRevealRef}
        className="sidebar-reveal"
        onClick={openSidebar}
        aria-label="Open navigation"
        title="Open navigation"
        aria-controls="primary-sidebar"
        aria-expanded={!sidebarCollapsed}
        aria-hidden={!sidebarCollapsed}
        tabIndex={sidebarCollapsed ? 0 : -1}
      >
        <PanelLeftOpen size={18} aria-hidden="true" />
      </button>
      <div className="sidebar-slot">
        <aside
          id="primary-sidebar"
          className="sidebar"
          aria-hidden={sidebarCollapsed}
          inert={sidebarCollapsed}
          onTransitionEnd={handleSidebarTransitionEnd}
        >
        <div className="sidebar-top">
          <div className="brand"><LogoMark className="brand-logo" /><span>NodeGuard</span></div>
          <button
            className="sidebar-toggle"
            onClick={closeSidebar}
            aria-label="Close navigation"
            title="Close navigation"
            aria-controls="primary-sidebar"
            aria-expanded={!sidebarCollapsed}
          >
            <PanelLeftClose size={18} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Primary navigation">{nav.map(([key, Icon, label]) => <button key={key} className={view === key ? "active" : ""} aria-current={view === key ? "page" : undefined} onClick={() => selectView(key)}><Icon size={18} aria-hidden="true" /><span className="sidebar-nav-label">{key === "updates" ? <UpdatesNavLabel /> : label}</span></button>)}</nav>
        <button className="sidebar-logout" onClick={logout} disabled={isLoggingOut}><LogOut size={18} aria-hidden="true" /><span className="sidebar-action-label">{isLoggingOut ? "Logging out" : "Logout"}</span></button>
        </aside>
      </div>
      <main className="workspace" id="main-content" tabIndex={-1}>
        <header className="workspace-topbar">
          <div className="topbar-title">
            <span><ActiveIcon size={16} aria-hidden="true" /></span>
            <h1>{activeLabel}</h1>
          </div>
          <div className="topbar-status">
            <span>{demoMode ? "Environment" : backendConfig ? "Connected" : "Local"}</span>
            <span className={`environment-badge ${demoMode ? "is-demo" : "is-live"}`}>{demoMode ? "Demo" : "Live"}</span>
          </div>
        </header>
        {view === "dashboard" && <Dashboard setView={setView} />}
        {view === "server" && <ServerPage />}
        {view === "proxmox" && <ProxmoxPage />}
        {view === "agents" && <AgentsPage onOpenContainers={(agentId) => { setContainerHostFilter(agentId); setView("containers"); }} onOpenUpdates={(agentId) => { setPendingUpdateMachineId(agentId); setView("updates"); }} />}
        {view === "containers" && <ContainersPage initialHostId={containerHostFilter} onHostFilterApplied={() => setContainerHostFilter(null)} />}
        {view === "domains" && <DomainsPage />}
        {view === "updates" && <UpdatesPage initialMachineId={pendingUpdateMachineId} onInitialMachineApplied={() => setPendingUpdateMachineId(null)} />}
        {view === "alerts" && <AlertsPage />}
        {view === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
