import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Bell, Boxes, ChevronDown, ChevronLeft, ChevronRight, Copy, ExternalLink, Eye, EyeOff, Gauge, Globe2, LogOut, PanelLeftClose, PanelLeftOpen, Pencil, Plus, RefreshCcw, Search, Server, Settings, Trash2, X } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import { getDefaultBackendUrl, normalizeBackendUrl } from "./api/client";
import { getCurrentSession, logout as logoutSession } from "./api/endpoints";
import { normalizeApiError } from "./api/errors";
import {
  useAddContainerMonitor,
  useAddDomain,
  useAddServerMonitor,
  useAlert,
  useAlerts,
  useContainer,
  useContainers,
  useDomains,
  useOverview,
  useRemoveAlert,
  useRemoveContainerMonitor,
  useRemoveDomain,
  useRemoveServerMonitor,
  useRunChecks,
  useServer,
  useServerMetricHistory,
  useServerMetrics,
  useServerMonitors,
  useUpdateContainerMonitor,
  useUpdateDomain,
  useUpdateServerMonitor,
  useLogin
} from "./hooks/useNodeGuardQueries";
import { useSettingsStore } from "./store/settingsStore";
import type { Alert, Container, ContainerMonitorStatus, DomainCheck, HealthStatus, MetricHistory, MetricHistoryPoint, MetricHistoryRange, MetricHistorySummary, MonitoredServerStatus, Server as NodeGuardServer } from "./types/nodeguard";
import { getContainerImageRepositoryUrl } from "./utils/containerImage";
import { formatBytes, formatDateTime, formatPercentage, formatRelativeTime, formatResponseTime, formatUptime } from "./utils/format";
import { getStatusLabel, getStatusTone } from "./utils/status";

type View = "dashboard" | "server" | "containers" | "domains" | "alerts" | "settings";
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

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="panel">
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

function StateBlock({ title, message }: { title: string; message: string }) {
  return (
    <div className="state-block">
      <AlertTriangle size={18} />
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}

function StaleNotice({ isError, dataUpdatedAt }: { isError: boolean; dataUpdatedAt: number }) {
  if (!isError || !dataUpdatedAt) return null;
  if (Date.now() - dataUpdatedAt < 15000) return null;
  return <div className="stale-notice">Showing last known status from {formatDateTime(new Date(dataUpdatedAt).toISOString())}. Live refresh failed.</div>;
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

function launchHref(value: string) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `http://${trimmed}`;
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
    return `${parsed.protocol}//${parsed.hostname.includes(".") ? "service.muthu.eu" : "10.x.x.x"}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return "hidden";
  }
}

function Modal({ title, children, onClose, isClosing = false }: { title: string; children: React.ReactNode; onClose: () => void; isClosing?: boolean }) {
  return (
    <div className={`modal-backdrop ${isClosing ? "is-closing" : ""}`} role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close dialog"><X size={15} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ConnectScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      const session = await login.mutateAsync({ config: { backendUrl }, input: { username: username.trim(), password } });
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
        <h1>Welcome back</h1>
        <p>Monitor everything. Miss nothing.</p>
        <p>Sign in to access your infrastructure dashboard.</p>
        <ol className="setup-list">
          <li>Connect your monitoring backend</li>
          <li>Add servers, services, and domains</li>
          <li>Track health and respond to alerts</li>
        </ol>
        {error ? <div className="login-error"><strong>Sign in failed</strong><span>{error}</span></div> : null}
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Username" />
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
        <button type="submit" disabled={login.isPending}>{login.isPending ? "Signing in..." : "Sign in to NodeGuard"}</button>
      </form>
    </main>
  );
}

function Dashboard({ setView }: { setView: (view: View) => void }) {
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const overview = useOverview();
  const server = useServer("local-node");
  const containers = useContainers();
  const domains = useDomains();
  const alerts = useAlerts();
  const runChecks = useRunChecks();
  const refreshIntervalSeconds = useSettingsStore((state) => state.refreshIntervalSeconds);
  const activeAlerts = alerts.data?.slice(0, 4) ?? [];
  const allAlerts = alerts.data ?? [];
  const dockerUnavailable = containers.data && !containers.data.dockerAvailable;
  const domainItems = domains.data ?? [];
  const healthyDomains = domainItems.filter((domain) => domain.status === "healthy").length;
  const offlineDomains = domainItems.filter((domain) => domain.status === "offline" || domain.status === "critical").length;
  const warningDomains = Math.max(domainItems.length - healthyDomains - offlineDomains, 0);
  const containersRunning = overview.data?.containersRunning ?? 0;
  const containersTotal = overview.data?.containersTotal ?? 0;
  const containersStopped = Math.max(containersTotal - containersRunning, 0);
  const activeCriticalAlerts = allAlerts.filter((alert) => alert.status === "active" && alert.severity === "critical").length;
  const activeWarningAlerts = allAlerts.filter((alert) => alert.status === "active" && alert.severity === "warning").length;
  const domainTone: MetricTone = offlineDomains > 0 ? "red" : warningDomains > 0 ? "orange" : "green";
  const alertTone: MetricTone = overview.data?.criticalAlerts ? "red" : overview.data?.warnings ? "orange" : "green";

  const refresh = async () => {
    setRefreshMessage(null);
    try {
      await runChecks.mutateAsync();
      setRefreshMessage(`Refresh successful at ${formatDateTime(new Date().toISOString())}`);
    } catch (error) {
      setRefreshMessage(normalizeApiError(error).message);
    }
  };

  if (overview.isLoading) return <StateBlock title="Loading dashboard" message="Reading live backend checks." />;
  if (!overview.data) return <StateBlock title="Dashboard unavailable" message={normalizeApiError(overview.error).message} />;

  return (
    <div className="page-stack">
      <StaleNotice isError={overview.isError} dataUpdatedAt={overview.dataUpdatedAt} />
      <section className={`hero-panel ${getStatusTone(overview.data.status)}`}>
        <div>
          <span className="eyebrow">NodeGuard</span>
          <h1>{getStatusLabel(overview.data.status)}</h1>
          <p>{summarizeIssues(allAlerts)}</p>
          <small>Last checked {formatDateTime(overview.data.lastCheckedAt)} · Live refresh every {refreshIntervalSeconds}s</small>
        </div>
        <button className="icon-button" onClick={refresh} disabled={runChecks.isPending}><RefreshCcw size={17} /> {runChecks.isPending ? "Refreshing..." : "Refresh"}</button>
      </section>
      {refreshMessage ? <div className="stale-notice success">{refreshMessage}</div> : null}
      <section className="root-cause">
        <span>Main issue</span>
        <strong>{mainIssue(allAlerts)}</strong>
      </section>
      <Panel title="Active issues" action={<button onClick={() => setView("alerts")}>View details</button>}>
        {allAlerts.length === 0 ? <StateBlock title="No active issues" message="All monitored checks are currently healthy." /> : (
          <div className="issue-list">
            {allAlerts.slice(0, 3).map((alert) => <button className="issue-row" key={alert.id} onClick={() => setView("alerts")}><StatusPill status={alert.severity} /><span>{alert.title}</span></button>)}
          </div>
        )}
      </Panel>
      <div className="metric-grid">
        <MetricCard
          label="Servers online"
          value={`${overview.data.serversOnline}/${overview.data.serversTotal}`}
          detail={`${server.data?.hostname ?? "local-node"} · ${statusTrend(server.data?.status ?? "unknown")}`}
          tone="green"
          onClick={() => setView("server")}
          indicator={<MetricMeter value={percentage(overview.data.serversOnline, overview.data.serversTotal)} tone="green" label="Reachability" rows={[
            { label: "Online", value: String(overview.data.serversOnline), tone: "green" },
            { label: "Needs attention", value: String(Math.max(overview.data.serversTotal - overview.data.serversOnline, 0)), tone: overview.data.serversOnline === overview.data.serversTotal ? "green" : "red" }
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
          detail={`${domainItems.length} services configured · SSL checked`}
          tone={domainTone}
          onClick={() => setView("domains")}
          indicator={<MetricMeter value={percentage(overview.data.domainsOnline, overview.data.domainsTotal)} tone={domainTone} label="Reachable services" rows={[
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
            { label: "Critical", value: String(activeCriticalAlerts), tone: activeCriticalAlerts > 0 ? "red" : "green" },
            { label: "Warning", value: String(activeWarningAlerts), tone: activeWarningAlerts > 0 ? "orange" : "green" },
            { label: "Active total", value: String(allAlerts.length), tone: allAlerts.length > 0 ? "red" : "green" }
          ]} />}
        />
      </div>
      <div className="two-col">
        <Panel title="Recent alerts" action={<button onClick={() => setView("alerts")}>View all</button>}>
          {activeAlerts.length === 0 ? <StateBlock title="No alerts" message="No active alerts were generated." /> : activeAlerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)}
        </Panel>
        <Panel title="Domain reachability" action={<button onClick={() => setView("domains")}>Open</button>}>
          {(domains.data ?? []).slice(0, 4).map((domain) => <DomainRow key={domain.id} domain={domain} />)}
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
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const server = useServer("local-node");
  const metrics = useServerMetrics("local-node");
  const metricHistory = useServerMetricHistory("local-node", historyRange, selectedResource !== null);
  const serverMonitors = useServerMonitors();
  const addServerMonitor = useAddServerMonitor();
  const updateServerMonitor = useUpdateServerMonitor();
  const removeServerMonitor = useRemoveServerMonitor();
  const toggleResourceHistory = (resource: HistoricalResource) => {
    setSelectedResource((current) => current === resource ? null : resource);
  };

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
    } catch (error) {
      setActionError(normalizeApiError(error).message);
    }
  };

  if (server.isLoading || metrics.isLoading) return <StateBlock title="Loading server" message="Reading system metrics." />;
  if (!server.data || !metrics.data) return <StateBlock title="Server unavailable" message={normalizeApiError(server.error ?? metrics.error).message} />;
  return (
    <div className="page-stack">
      <StaleNotice isError={server.isError || metrics.isError} dataUpdatedAt={Math.max(server.dataUpdatedAt, metrics.dataUpdatedAt)} />
      <Panel title={server.data.name} action={<StatusPill status={server.data.status} />}>
        <div className="info-grid">
          <Info label="Hostname" value={server.data.hostname} />
          <Info label="OS" value={server.data.os ?? "Unavailable"} />
          <Info label="Kernel" value={server.data.kernel ?? "Unavailable"} />
          <Info label="Architecture" value={[server.data.platform, server.data.architecture].filter(Boolean).join(" / ") || "Unavailable"} />
          <Info label="Uptime" value={formatUptime(server.data.uptimeSeconds)} />
          <Info label="CPU model" value={formatCpuModel(server.data)} />
          <Info label="CPU cores" value={formatCpuCores(server.data)} />
          <Info label="RAM installed" value={formatBytes(server.data.totalMemoryGb)} />
          <Info label="Root disk" value={formatBytes(server.data.totalDiskGb)} />
          <Info label="Swap" value={server.data.swapTotalGb === null || server.data.swapTotalGb === 0 ? "Not configured" : formatBytes(server.data.swapTotalGb)} />
          <Info label="Primary IP" value={server.data.primaryIp ?? "Unavailable"} />
          <Info label="IP addresses" value={formatIpAddresses(server.data)} />
          <Info label="Docker" value={server.data.dockerAvailable ? server.data.dockerVersion ?? "Available" : "Unavailable"} />
          <Info label="Containers" value={server.data.dockerAvailable ? `${server.data.runningContainers} running / ${server.data.stoppedContainers} stopped` : "Not checked"} />
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
        <ResourceHistory
          resource={selectedResource}
          range={historyRange}
          onRangeChange={setHistoryRange}
          history={metricHistory.data}
          isLoading={metricHistory.isLoading}
          error={metricHistory.error}
        />
      ) : null}
      <Panel title="Monitored servers" action={<button onClick={openAddMonitor}><Plus size={16} /> Add server</button>}>
        {actionError ? <div className="form-error">{actionError}</div> : null}
        {successMessage ? <SuccessNotice key={successMessage} message={successMessage} onDismiss={setSuccessMessage} /> : null}
        {serverMonitors.isLoading ? <StateBlock title="Loading monitors" message="Checking configured server monitors." /> : null}
        {(serverMonitors.data ?? []).length === 0 ? (
          <StateBlock title="No extra servers" message="Add another NodeGuard backend to monitor host-level health from this dashboard." />
        ) : (
          <div className="monitor-list">
            {(serverMonitors.data ?? []).map((monitor) => (
              <ServerMonitorRow
                key={monitor.id}
                monitor={monitor}
                onDuplicate={() => duplicateMonitor(monitor)}
                onEdit={() => editMonitor(monitor)}
                onRemove={() => void removeMonitor(monitor)}
              />
            ))}
          </div>
        )}
      </Panel>
      {isMonitorModalOpen ? (
        <Modal title={editingMonitor ? "Edit monitored server" : duplicatingMonitor ? "Duplicate monitored server" : "Add monitored server"} onClose={closeMonitorModal} isClosing={isMonitorModalClosing}>
          <form className="inline-form modal-form" onSubmit={saveMonitor}>
          <label>
            Display name
            <input value={monitorName} onChange={(event) => setMonitorName(event.target.value)} placeholder="Homelab node" />
          </label>
          <label>
            Backend URL
            <input value={monitorUrl} onChange={(event) => setMonitorUrl(event.target.value)} placeholder="http://192.168.1.20:3000" />
          </label>
          <label>
            API key
            <input
              value={monitorApiKey}
              onChange={(event) => setMonitorApiKey(event.target.value)}
              type="password"
              placeholder={editingMonitor ? "Leave blank to keep current key" : duplicatingMonitor?.apiKeyPreview ? "Re-enter key for this copy" : "Optional for /health only"}
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
            {editingMonitor ? "Save edits" : duplicatingMonitor ? "Create duplicate" : "Add server"}
          </button>
        </form>
        {formError ? <div className="form-error">{formError}</div> : null}
        </Modal>
      ) : null}
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
      {isLoading ? <StateBlock title="Loading resource history" message={`Reading persisted ${config.title.toLowerCase()} samples.`} /> : null}
      {!isLoading && error && !history ? <StateBlock title="History unavailable" message={normalizeApiError(error).message} /> : null}
      {!isLoading && error && history ? <div className="stale-notice">Showing the last available resource history. Live history refresh failed.</div> : null}
      {!isLoading && history && history.points.length === 0 ? (
        <StateBlock title="No historical samples yet" message="NodeGuard has started collecting metrics. History will appear as samples are recorded." />
      ) : null}
      {!isLoading && history && history.points.length > 0 ? (
        <div className="history-chart-grid">
          <MetricHistoryChart title={config.title} metricKey={config.metricKey} tone={config.tone} history={history} summary={history.summary[resource]} />
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
        <StateBlock title={`${title} unavailable`} message="This metric was unavailable in the selected period." />
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
            <path className="history-line" d={path} />
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

function ContainersPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
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
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const containerDetailRef = useRef<HTMLDivElement | null>(null);
  const containerDetailTimerRef = useRef<number | null>(null);
  const containers = useContainers();
  const container = useContainer(selected);
  const addContainerMonitor = useAddContainerMonitor();
  const updateContainerMonitor = useUpdateContainerMonitor();
  const removeContainerMonitor = useRemoveContainerMonitor();
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (containers.data?.containers ?? [])
      .filter((item) => stateFilter === "all" || item.status === stateFilter)
      .filter((item) => healthFilter === "all" || item.health === healthFilter)
      .filter((item) => !normalizedQuery || [
        item.name,
        item.image,
        item.stack,
        item.ipAddress,
        item.status,
        item.health,
        item.publishedPorts.join(" ")
      ].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery))
      .sort((left, right) => {
        const leftValue = containerSortValue(left, sortKey);
        const rightValue = containerSortValue(right, sortKey);
        const comparison = typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" });
        return sortDirection === "asc" ? comparison : -comparison;
      });
  }, [containers.data, healthFilter, query, sortDirection, sortKey, stateFilter]);

  const changeSort = (key: ContainerSortKey) => {
    if (sortKey === key) {
      setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const toggleContainerDetail = (containerId: string) => {
    if (selected === containerId) {
      if (isContainerDetailClosing) return;
      setIsContainerDetailClosing(true);
      containerDetailTimerRef.current = window.setTimeout(() => {
        setSelected(null);
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
  };

  useEffect(() => {
    if (selected && !filtered.some((item) => item.id === selected)) {
      setIsContainerDetailClosing(false);
      setSelected(null);
    }
  }, [filtered, selected]);

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
    setFormError(null);
    setSuccessMessage(null);

    try {
      await removeContainerMonitor.mutateAsync(monitor.id);
      setSuccessMessage(`${monitor.name} was successfully deleted.`);
    } catch (error) {
      setFormError(normalizeApiError(error).message);
    }
  };

  if (containers.isLoading) return <StateBlock title="Loading containers" message="Reading Docker status." />;
  if (!containers.data) return <StateBlock title="Docker unavailable" message={normalizeApiError(containers.error).message} />;
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
            <label className="container-filter">
              <span>State</span>
              <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as "all" | Container["status"])}>
                <option value="all">All states</option>
                <option value="running">Running</option>
                <option value="restarting">Restarting</option>
                <option value="stopped">Stopped</option>
                <option value="exited">Exited</option>
              </select>
            </label>
            <label className="container-filter">
              <span>Health</span>
              <select value={healthFilter} onChange={(event) => setHealthFilter(event.target.value as "all" | Container["health"])}>
                <option value="all">All health</option>
                <option value="healthy">Healthy</option>
                <option value="unhealthy">Unhealthy</option>
                <option value="starting">Starting</option>
                <option value="none">No healthcheck</option>
              </select>
            </label>
            <button className="icon-only" onClick={() => containers.refetch()} disabled={containers.isFetching} aria-label="Refresh containers" title="Refresh containers">
              <RefreshCcw className={containers.isFetching ? "is-spinning" : ""} size={15} />
            </button>
          </div>
        )}
      >
        {filtered.length === 0 ? <StateBlock title="No containers found" message={containers.data.dockerAvailable ? "No containers matched the current search and filters." : "Docker data is currently unavailable. Check Docker access on the backend."} /> : (
          <div className="container-results">
            <div className="container-table-scroll">
              <div className="container-table" role="table" aria-label="Docker containers">
                <ContainerTableHeader sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} />
                {filtered.map((item) => (
                  <ContainerTableRow
                    key={item.id}
                    container={item}
                    selected={selected === item.id}
                    onSelect={() => toggleContainerDetail(item.id)}
                  />
                ))}
              </div>
            </div>
            <div className="container-mobile-list">
              {filtered.map((item) => (
                <ContainerMobileCard
                  key={item.id}
                  container={item}
                  selected={selected === item.id}
                  onSelect={() => toggleContainerDetail(item.id)}
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
              {container.isLoading ? <StateBlock title="Loading detail" message="Reading container inspection data." /> : null}
              {container.isError ? <StateBlock title="Container detail unavailable" message={normalizeApiError(container.error).message} /> : null}
              {container.data ? <ContainerDetail container={container.data} /> : null}
            </Panel>
          </div>
        </div>
      ) : null}
      <Panel title="Monitored containers">
        <form className="inline-form compact-form" onSubmit={saveMonitor}>
          <label>
            Display name
            <input value={monitorName} onChange={(event) => setMonitorName(event.target.value)} placeholder="Vaultwarden" />
          </label>
          <label>
            Container name or ID
            <input value={containerRef} onChange={(event) => setContainerRef(event.target.value)} placeholder="vaultwarden" />
          </label>
          <button type="submit" disabled={addContainerMonitor.isPending}>
            <Plus size={16} />
            Add container
          </button>
        </form>
        {formError ? <div className="form-error">{formError}</div> : null}
        {successMessage ? <SuccessNotice key={successMessage} message={successMessage} onDismiss={setSuccessMessage} /> : null}
        {(containers.data.containerMonitors ?? []).length === 0 ? (
          <StateBlock title="No monitored containers" message="Add container names or IDs that should be present and running." />
        ) : (
          <div className="monitor-list">
            {containers.data.containerMonitors.map((monitor) => (
              <ContainerMonitorRow
                key={monitor.id}
                monitor={monitor}
                onDuplicate={() => duplicateMonitor(monitor)}
                onEdit={() => editMonitor(monitor)}
                onRemove={() => void removeMonitor(monitor)}
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
              <input value={editMonitorName} onChange={(event) => setEditMonitorName(event.target.value)} placeholder="Vaultwarden" />
            </label>
            <label>
              Container name or ID
              <input value={editContainerRef} onChange={(event) => setEditContainerRef(event.target.value)} placeholder="vaultwarden" />
            </label>
            <button className="modal-submit" type="submit" disabled={updateContainerMonitor.isPending || addContainerMonitor.isPending}>
              {editingMonitor ? "Save edits" : "Create duplicate"}
            </button>
          </form>
          {editFormError ? <div className="form-error">{editFormError}</div> : null}
        </Modal>
      ) : null}
    </div>
  );
}

function DomainsPage() {
  const [domainValue, setDomainValue] = useState("");
  const [domainPath, setDomainPath] = useState("/");
  const [expectedStatusCodes, setExpectedStatusCodes] = useState("200,301,302,401");
  const [editingDomain, setEditingDomain] = useState<DomainCheck | null>(null);
  const [duplicatingDomain, setDuplicatingDomain] = useState<DomainCheck | null>(null);
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
    } catch (error) {
      setActionError(normalizeApiError(error).message);
    }
  };

  if (domains.isLoading) return <StateBlock title="Loading domains" message="Checking configured domains." />;
  if (!domains.data) return <StateBlock title="Domains unavailable" message={normalizeApiError(domains.error).message} />;
  return (
    <div className="page-stack">
      <Panel title="Domains / services" action={<div className="button-row"><button onClick={() => domains.refetch()}><RefreshCcw size={16} /> Check now</button><button onClick={openAddDomain}><Plus size={16} /> Add domain</button></div>}>
        {actionError ? <div className="form-error">{actionError}</div> : null}
        {successMessage ? <SuccessNotice key={successMessage} message={successMessage} onDismiss={setSuccessMessage} /> : null}
        {domains.data.length === 0 ? (
          <StateBlock title="No services configured" message="Add a public domain, internal URL, or set MONITORED_DOMAINS in the backend environment." />
        ) : (
          <div className="domain-list">
            {domains.data.map((domain) => (
              <DomainRow
                key={domain.id}
                domain={domain}
                onCheck={() => domains.refetch()}
                onDuplicate={domain.editable ? () => duplicateDomain(domain) : undefined}
                onEdit={domain.editable ? () => editDomain(domain) : undefined}
                onRemove={domain.editable ? () => void removeStoredDomain(domain) : undefined}
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
              <input value={domainValue} onChange={(event) => setDomainValue(event.target.value)} placeholder="https://bit.muthu.eu" />
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
          {formError ? <div className="form-error">{formError}</div> : null}
        </Modal>
      ) : null}
    </div>
  );
}

type AlertView = "active" | "resolved" | "all";

function alertSource(alert: Alert) {
  const resource = alert.affectedResource.toLowerCase();
  if (resource === "docker" || resource.includes("container")) return "Docker";
  if (resource.startsWith("http://") || resource.startsWith("https://")) return "Domain";
  if (resource.includes("server") || resource.includes("node") || resource.includes("host")) return "Server";
  return "NodeGuard";
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
    } catch (error) {
      setActionError(normalizeApiError(error).message);
    }
  };

  if (alerts.isLoading) return <StateBlock title="Loading alerts" message="Generating current alerts." />;
  if (!alerts.data) return <StateBlock title="Alerts unavailable" message={normalizeApiError(alerts.error).message} />;

  const tabItems: { id: AlertView; label: string; count: number }[] = [
    { id: "active", label: "Active alerts", count: activeCount },
    { id: "resolved", label: "Resolved alerts", count: resolvedCount },
    { id: "all", label: "All alerts", count: allAlerts.length }
  ];
  const panelTitle = tabItems.find((item) => item.id === view)?.label ?? "Alerts";

  return (
    <div className="page-stack alerts-page">
      <div className="alert-view-tabs" role="tablist" aria-label="Alert views">
        {tabItems.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={view === item.id}
            className={view === item.id ? "active" : ""}
            onClick={() => setView(item.id)}
          >
            {item.label}
            <span className={`alert-count ${item.id === "active" && item.count > 0 ? "has-active" : ""}`}>{item.count}</span>
          </button>
        ))}
      </div>

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
        {actionError ? <div className="form-error">{actionError}</div> : null}
        {successMessage ? <SuccessNotice key={successMessage} message={successMessage} onDismiss={setSuccessMessage} /> : null}
        {filteredAlerts.length === 0 ? (
          <StateBlock title="No alerts" message={query ? "No alerts match the current search." : `No ${view === "all" ? "" : `${view} `}alerts are available.`} />
        ) : (
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
                    <button className="icon-only danger-soft" onClick={() => void deleteAlert(item)} disabled={removeAlert.isPending} aria-label={`Delete ${item.title}`} title="Delete alert">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="alert-table-footer">
          <span>
            {filteredAlerts.length === 0 ? "0" : `${pageStart + 1}-${Math.min(pageStart + pageSize, filteredAlerts.length)}`} of {filteredAlerts.length}
          </span>
          <label>
            Rows
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {[10, 25, 50].map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
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

      {selected ? (
        <div className={`alert-detail-collapse ${isDetailClosing ? "is-closing" : ""}`}>
          <Panel title="Alert detail">
            {!alert.data ? <StateBlock title="Loading alert" message="Reading alert detail." /> : <AlertDetail alert={alert.data} />}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

function SettingsPage() {
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const backendConfig = useSettingsStore((state) => state.backendConfig);
  const refreshIntervalSeconds = useSettingsStore((state) => state.refreshIntervalSeconds);
  const setRefreshIntervalSeconds = useSettingsStore((state) => state.setRefreshIntervalSeconds);
  const demoMode = useSettingsStore((state) => state.demoMode);
  const setDemoMode = useSettingsStore((state) => state.setDemoMode);
  const hideSensitiveValues = useSettingsStore((state) => state.hideSensitiveValues);
  const setHideSensitiveValues = useSettingsStore((state) => state.setHideSensitiveValues);
  const disconnect = useSettingsStore((state) => state.disconnect);

  const testConnection = async () => {
    setConnectionMessage(null);
    if (!backendConfig) {
      setConnectionMessage(demoMode ? "Demo mode is enabled. No backend connection is required." : "No backend is configured.");
      return;
    }

    try {
      const session = await getCurrentSession({ backendUrl: backendConfig.backendUrl });
      setConnectionMessage(session.authenticated ? `Signed in as ${session.user?.username ?? "NodeGuard user"}.` : "Session expired. Sign in again.");
    } catch (error) {
      setConnectionMessage(normalizeApiError(error).message);
    }
  };

  const signOut = async () => {
    if (backendConfig) {
      await logoutSession({ backendUrl: backendConfig.backendUrl }).catch(() => null);
    }

    disconnect();
    setDemoMode(false);
  };

  const exportDiagnostics = () => {
    const diagnostics = {
      generatedAt: new Date().toISOString(),
      backendUrl: backendConfig ? maskSensitiveUrl(backendConfig.backendUrl, hideSensitiveValues) : null,
      username: backendConfig?.user.username ?? null,
      role: backendConfig?.user.role ?? null,
      connectedAt: backendConfig?.connectedAt ?? null,
      refreshIntervalSeconds,
      demoMode,
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
    <div className="page-stack">
      <Panel title="Connection" action={<button onClick={testConnection}><RefreshCcw size={16} /> Test connection</button>}>
        <div className="info-grid">
          <Info label="Backend URL" value={backendConfig ? maskSensitiveUrl(backendConfig.backendUrl, hideSensitiveValues) : demoMode ? "Demo data" : "Not connected"} />
          <Info label="Signed in as" value={backendConfig?.user.username ?? "Not signed in"} />
          <Info label="Role" value={backendConfig?.user.role ?? "Unavailable"} />
          <Info label="Session started" value={formatDateTime(backendConfig?.connectedAt ?? null)} />
        </div>
        {connectionMessage ? <div className="stale-notice success">{connectionMessage}</div> : null}
      </Panel>
      <Panel title="Live refresh interval">
        <div className="segmented">
          {[1, 5, 10, 30, 60].map((value) => <button key={value} className={value === refreshIntervalSeconds ? "active" : ""} onClick={() => setRefreshIntervalSeconds(value)}>{value}s</button>)}
        </div>
      </Panel>
      <Panel title="Security">
        <div className="settings-list">
          <label><input type="checkbox" checked={hideSensitiveValues} onChange={(event) => setHideSensitiveValues(event.target.checked)} /> Hide backend URL in screenshots</label>
          <label><input type="checkbox" checked={demoMode} onChange={(event) => setDemoMode(event.target.checked)} /> Enable demo mode</label>
        </div>
        <div className="button-row">
          <button onClick={exportDiagnostics}>Export diagnostics</button>
          <button onClick={signOut}>Sign out</button>
        </div>
      </Panel>
      <Panel title="About NodeGuard">
        <p className="muted">Web-only, read-only infrastructure monitoring for local homelab hosts, containers, and services. Human users sign in with a password-backed session; API keys remain reserved for future agents and integrations.</p>
        <button className="danger" onClick={signOut}><LogOut size={16} /> Sign out</button>
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
      title="Open image repository"
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
      role="button"
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
      <div className="container-mobile-head">
        <div>
          <strong>{container.name}</strong>
          <small><ContainerImageLink image={container.image} /></small>
        </div>
        <button className="icon-only" onClick={(event) => { event.stopPropagation(); onSelect(); }} aria-label={`${selected ? "Hide" : "View"} details for ${container.name}`}>
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
        <Info label="Image" value={container.image} />
        <Info label="Runtime state" value={container.state} />
        <Info label="Docker health" value={container.health === "none" ? "No healthcheck" : container.health} />
        <Info label="Stack" value={container.stack ?? "Standalone"} />
        <Info label="IP address" value={container.ipAddress ?? "Unavailable"} />
        <Info label="Restart policy" value={container.restartPolicy ?? "Unavailable"} />
        <Info label="Published ports" value={container.publishedPorts.join(", ") || "None"} />
        <Info label="Container ports" value={container.ports.join(", ") || "None"} />
        <Info label="Uptime" value={container.uptime} />
        <Info label="Memory" value={container.memoryLimitMb ? `${container.memoryLimitMb} MB limit` : "Unavailable"} />
      </div>
      <pre className="logs">{container.logs.length ? container.logs.join("\n") : "No limited log preview available."}</pre>
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

function LaunchLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="launch-link"
      href={launchHref(href)}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      onClick={(event) => event.stopPropagation()}
    >
      <ExternalLink size={14} />
    </a>
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
            <strong>{displayUrl}</strong>
            <LaunchLink href={displayUrl} label={`Open ${displayUrl}`} />
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
            <strong>{displayUrl}</strong>
            <LaunchLink href={displayUrl} label={`Open ${displayUrl}`} />
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
          <span className="resource-url">{monitor.backendUrl}</span>
          <span className="resource-context">· {monitor.lastError ?? `checked ${formatRelativeTime(monitor.lastCheckedAt)}`}</span>
          <LaunchLink href={monitor.backendUrl} label={`Open ${monitor.backendUrl}`} />
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
  return (
    <div className="data-row monitor-row">
      <span>
        <strong>{monitor.name}</strong>
        <small>
          {monitor.containerRef}
          {monitor.matchedContainerName ? ` · matched ${monitor.matchedContainerName}` : ""}
          {" · "}
          {monitor.lastError ?? `checked ${formatRelativeTime(monitor.lastCheckedAt)}`}
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

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutTimer = useRef<number | null>(null);
  const backendConfig = useSettingsStore((state) => state.backendConfig);
  const demoMode = useSettingsStore((state) => state.demoMode);
  const load = useSettingsStore((state) => state.load);
  const disconnect = useSettingsStore((state) => state.disconnect);
  const setDemoMode = useSettingsStore((state) => state.setDemoMode);

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
    ["server", Server, "Server"],
    ["containers", Boxes, "Containers"],
    ["domains", Globe2, "Domains"],
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
      setDemoMode(false);
      setIsLoggingOut(false);
    }, 260);
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${isLoggingOut ? "logging-out" : ""}`}>
      {sidebarCollapsed ? (
        <button className="sidebar-reveal" onClick={() => setSidebarCollapsed(false)} aria-label="Show sidebar">
          <PanelLeftOpen size={18} />
        </button>
      ) : null}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand"><LogoMark className="brand-logo" /><span>NodeGuard</span></div>
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(true)} aria-label="Hide sidebar">
            <PanelLeftClose size={18} />
          </button>
        </div>
        <nav>{nav.map(([key, Icon, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><Icon size={18} /> {label}</button>)}</nav>
        <button className="sidebar-logout" onClick={logout} disabled={isLoggingOut}><LogOut size={18} /> {isLoggingOut ? "Logging out" : "Logout"}</button>
      </aside>
      <main className="workspace">
        <header className="workspace-topbar">
          <div className="topbar-title">
            <span><ActiveIcon size={16} /></span>
            <strong>{activeLabel}</strong>
          </div>
          <div className="topbar-status">
            <span>{demoMode ? "Demo mode" : backendConfig ? "Connected" : "Local"}</span>
            <kbd>Live</kbd>
          </div>
        </header>
        {view === "dashboard" && <Dashboard setView={setView} />}
        {view === "server" && <ServerPage />}
        {view === "containers" && <ContainersPage />}
        {view === "domains" && <DomainsPage />}
        {view === "alerts" && <AlertsPage />}
        {view === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
