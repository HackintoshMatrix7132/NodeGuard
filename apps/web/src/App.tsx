import { AlertTriangle, Bell, Boxes, Gauge, Globe2, LogOut, Pencil, Plus, RefreshCcw, Search, Server, Settings, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { normalizeBackendUrl } from "./api/client";
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
  useRemoveContainerMonitor,
  useRemoveDomain,
  useRemoveServerMonitor,
  useRunChecks,
  useServer,
  useServerMetrics,
  useServerMonitors,
  useUpdateContainerMonitor,
  useUpdateDomain,
  useUpdateServerMonitor,
  useValidateConnection
} from "./hooks/useNodeGuardQueries";
import { useSettingsStore } from "./store/settingsStore";
import type { Alert, Container, ContainerMonitorStatus, DomainCheck, HealthStatus, MonitoredServerStatus } from "./types/nodeguard";
import { formatBytes, formatDateTime, formatPercentage, formatRelativeTime, formatResponseTime, formatUptime } from "./utils/format";
import { getStatusLabel, getStatusTone } from "./utils/status";

type View = "dashboard" | "server" | "containers" | "domains" | "alerts" | "settings";

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

function MetricCard({ label, value, detail, tone = "blue", onClick, subdued = false }: { label: string; value: string; detail: string; tone?: string; onClick?: () => void; subdued?: boolean }) {
  const content = (
    <>
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${subdued ? "subdued-value" : ""}`}>{value}</div>
      <SparkBars tone={tone} />
      <div className="metric-detail">{detail}</div>
    </>
  );

  if (onClick) {
    return <button className={`metric-card metric-button ${tone}`} onClick={onClick}>{content}</button>;
  }

  return (
    <div className={`metric-card ${tone}`}>
      {content}
    </div>
  );
}

function SparkBars({ tone = "blue" }: { tone?: string }) {
  return (
    <div className="spark-bars">
      {[32, 58, 42, 72, 64, 84, 50, 76, 42, 63, 88, 60].map((height, index) => (
        <span key={index} className={tone} style={{ height }} />
      ))}
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
  return <div className="stale-notice">Showing last known status from {formatDateTime(new Date(dataUpdatedAt).toISOString())}. Live refresh failed.</div>;
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

function maskSensitiveUrl(value: string, hide: boolean) {
  if (!hide) return value;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.hostname.includes(".") ? "service.muthu.eu" : "10.x.x.x"}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return "hidden";
  }
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-only" onClick={onClose} aria-label="Close dialog"><X size={15} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ConnectScreen() {
  const [backendUrl, setBackendUrl] = useState("http://localhost:3000");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const saveConnection = useSettingsStore((state) => state.saveConnection);
  const setDemoMode = useSettingsStore((state) => state.setDemoMode);
  const validateConnection = useValidateConnection();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      const normalizedUrl = normalizeBackendUrl(backendUrl);
      if (!apiKey.trim()) {
        setError("Enter an API key.");
        return;
      }
      await validateConnection.mutateAsync({ backendUrl: normalizedUrl, apiKey: apiKey.trim() });
      saveConnection(normalizedUrl, apiKey.trim());
    } catch (caught) {
      setError(normalizeApiError(caught).message);
    }
  };

  return (
    <main className="login-shell">
      <div className="orbital-bg" />
      <form className="login-card" onSubmit={submit}>
        <div className="logo-mark"><ShieldCheck size={40} /></div>
        <h1>Welcome to NodeGuard</h1>
        <p>Monitor your servers. Protect your stack.</p>
        <ol className="setup-list">
          <li>Connect your NodeGuard backend.</li>
          <li>Add domains and internal services.</li>
          <li>Mark critical containers and review alerts.</li>
        </ol>
        {error ? <div className="login-error"><strong>Connection failed</strong><span>{error}</span></div> : null}
        <label>
          Backend URL
          <input value={backendUrl} onChange={(event) => setBackendUrl(event.target.value)} placeholder="http://localhost:3000" />
        </label>
        <label>
          API key
          <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" placeholder="Paste API key" />
        </label>
        <button type="submit" disabled={validateConnection.isPending}>{validateConnection.isPending ? "Checking..." : "Connect"}</button>
        <button type="button" className="secondary-login" onClick={() => setDemoMode(true)}>Use demo data</button>
        <small>For local MVP testing, the API key is stored in browser storage. Production deployments should use stronger authentication.</small>
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
          <small>Last checked {formatDateTime(overview.data.lastCheckedAt)} · Auto-refresh every {refreshIntervalSeconds}s</small>
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
        <MetricCard label="Servers online" value={`${overview.data.serversOnline}/${overview.data.serversTotal}`} detail={`${server.data?.hostname ?? "local-node"} · ${statusTrend(server.data?.status ?? "unknown")}`} tone="green" onClick={() => setView("server")} />
        <MetricCard label="Docker" value={dockerUnavailable ? "Unavailable" : `${overview.data.containersRunning}/${overview.data.containersTotal}`} detail={dockerUnavailable ? "Container checks could not be loaded." : "Containers running · Last 12 checks"} tone={dockerUnavailable ? "red" : "blue"} onClick={() => setView("containers")} subdued={Boolean(dockerUnavailable)} />
        <MetricCard label="Domains online" value={`${overview.data.domainsOnline}/${overview.data.domainsTotal}`} detail={`${domains.data?.length ?? 0} services configured · SSL checked`} tone="orange" onClick={() => setView("domains")} />
        <MetricCard label="Critical alerts" value={`${overview.data.criticalAlerts}`} detail={`${overview.data.warnings} warnings · ${statusTrend(overview.data.status)}`} tone={overview.data.criticalAlerts > 0 ? "red" : "green"} onClick={() => setView("alerts")} />
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

function ServerPage() {
  const [monitorName, setMonitorName] = useState("");
  const [monitorUrl, setMonitorUrl] = useState("");
  const [monitorApiKey, setMonitorApiKey] = useState("");
  const [editingMonitor, setEditingMonitor] = useState<MonitoredServerStatus | null>(null);
  const [isMonitorModalOpen, setIsMonitorModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const server = useServer("local-node");
  const metrics = useServerMetrics("local-node");
  const serverMonitors = useServerMonitors();
  const addServerMonitor = useAddServerMonitor();
  const updateServerMonitor = useUpdateServerMonitor();
  const removeServerMonitor = useRemoveServerMonitor();

  const resetMonitorForm = () => {
    setMonitorName("");
    setMonitorUrl("");
    setMonitorApiKey("");
    setEditingMonitor(null);
    setIsMonitorModalOpen(false);
    setFormError(null);
  };

  const openAddMonitor = () => {
    setMonitorName("");
    setMonitorUrl("");
    setMonitorApiKey("");
    setEditingMonitor(null);
    setFormError(null);
    setIsMonitorModalOpen(true);
  };

  const editMonitor = (monitor: MonitoredServerStatus) => {
    setMonitorName(monitor.name);
    setMonitorUrl(monitor.backendUrl);
    setMonitorApiKey("");
    setEditingMonitor(monitor);
    setFormError(null);
    setIsMonitorModalOpen(true);
  };

  const saveMonitor = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    try {
      const input = {
        name: monitorName,
        backendUrl: monitorUrl,
        apiKey: monitorApiKey || undefined
      };

      if (editingMonitor) {
        await updateServerMonitor.mutateAsync({ id: editingMonitor.id, input });
      } else {
        await addServerMonitor.mutateAsync(input);
      }

      resetMonitorForm();
    } catch (error) {
      setFormError(normalizeApiError(error).message);
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
          <Info label="Uptime" value={formatUptime(server.data.uptimeSeconds)} />
          <Info label="Docker" value={server.data.dockerAvailable ? server.data.dockerVersion ?? "Available" : "Unavailable"} />
          <Info label="Containers" value={server.data.dockerAvailable ? `${server.data.runningContainers} running / ${server.data.stoppedContainers} stopped` : "Not checked"} />
        </div>
      </Panel>
      <div className="metric-grid">
        <MetricCard label="CPU" value={formatPercentage(metrics.data.cpu.usagePercent)} detail={`Normal · Load ${metrics.data.cpu.loadAverage ?? "Unavailable"} · Last 10 min stable`} tone="blue" />
        <MetricCard label="RAM" value={formatPercentage(metrics.data.memory.usagePercent)} detail={`${formatBytes(metrics.data.memory.usedGb)} / ${formatBytes(metrics.data.memory.totalGb)} used · Healthy`} tone="green" />
        <MetricCard label="Disk" value={formatPercentage(metrics.data.disk.usagePercent)} detail={`${formatBytes(metrics.data.disk.usedGb)} / ${formatBytes(metrics.data.disk.totalGb)} used · Healthy`} tone="orange" />
        <MetricCard label="Swap" value={metrics.data.swap.usagePercent === null ? "Not available" : formatPercentage(metrics.data.swap.usagePercent)} detail={metrics.data.swap.usagePercent === null ? "Not available on this host" : `${formatBytes(metrics.data.swap.usedGb)} / ${formatBytes(metrics.data.swap.totalGb)} used`} tone="purple" subdued={metrics.data.swap.usagePercent === null} />
      </div>
      <Panel title="Monitored servers" action={<button onClick={openAddMonitor}><Plus size={16} /> Add server</button>}>
        {serverMonitors.isLoading ? <StateBlock title="Loading monitors" message="Checking configured server monitors." /> : null}
        {(serverMonitors.data ?? []).length === 0 ? (
          <StateBlock title="No extra servers" message="Add another NodeGuard backend to monitor host-level health from this dashboard." />
        ) : (
          <div className="monitor-list">
            {(serverMonitors.data ?? []).map((monitor) => (
              <ServerMonitorRow
                key={monitor.id}
                monitor={monitor}
                onEdit={() => editMonitor(monitor)}
                onRemove={() => removeServerMonitor.mutate(monitor.id)}
              />
            ))}
          </div>
        )}
      </Panel>
      {isMonitorModalOpen ? (
        <Modal title={editingMonitor ? "Edit monitored server" : "Add monitored server"} onClose={resetMonitorForm}>
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
              placeholder={editingMonitor ? "Leave blank to keep current key" : "Optional for /health only"}
            />
          </label>
          <button type="submit" disabled={addServerMonitor.isPending || updateServerMonitor.isPending}>
            {editingMonitor ? <Pencil size={16} /> : <Plus size={16} />}
            {editingMonitor ? "Save edits" : "Add server"}
          </button>
        </form>
        {formError ? <div className="form-error">{formError}</div> : null}
        </Modal>
      ) : null}
    </div>
  );
}

function ContainersPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [monitorName, setMonitorName] = useState("");
  const [containerRef, setContainerRef] = useState("");
  const [editingMonitor, setEditingMonitor] = useState<ContainerMonitorStatus | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const containers = useContainers();
  const container = useContainer(selected);
  const addContainerMonitor = useAddContainerMonitor();
  const updateContainerMonitor = useUpdateContainerMonitor();
  const removeContainerMonitor = useRemoveContainerMonitor();
  const filtered = useMemo(() => (containers.data?.containers ?? []).filter((item) => [item.name, item.image, item.status, item.health].join(" ").toLowerCase().includes(query.toLowerCase())), [containers.data, query]);

  const resetMonitorForm = () => {
    setMonitorName("");
    setContainerRef("");
    setEditingMonitor(null);
    setFormError(null);
  };

  const editMonitor = (monitor: ContainerMonitorStatus) => {
    setMonitorName(monitor.name);
    setContainerRef(monitor.containerRef);
    setEditingMonitor(monitor);
    setFormError(null);
  };

  const saveMonitor = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const input = { name: monitorName, containerRef };

    try {
      if (editingMonitor) {
        await updateContainerMonitor.mutateAsync({ id: editingMonitor.id, input });
      } else {
        await addContainerMonitor.mutateAsync(input);
      }
      resetMonitorForm();
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
      <Panel title="Docker containers" action={<div className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search containers" /></div>}>
        {filtered.length === 0 ? <StateBlock title="No containers found" message={containers.data.dockerAvailable ? "No containers matched the current filter." : "Docker data is currently unavailable. Check Docker access on the backend or clear the search filter."} /> : (
          <div className="table">
            {filtered.map((item) => <ContainerRow key={item.id} container={item} onSelect={() => setSelected(item.id)} />)}
          </div>
        )}
      </Panel>
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
          <button type="submit" disabled={addContainerMonitor.isPending || updateContainerMonitor.isPending}>
            {editingMonitor ? <Pencil size={16} /> : <Plus size={16} />}
            {editingMonitor ? "Save edits" : "Add container"}
          </button>
        </form>
        {editingMonitor ? <button className="secondary-action" onClick={resetMonitorForm}><X size={15} /> Cancel editing {editingMonitor.name}</button> : null}
        {formError ? <div className="form-error">{formError}</div> : null}
        {(containers.data.containerMonitors ?? []).length === 0 ? (
          <StateBlock title="No monitored containers" message="Add container names or IDs that should be present and running." />
        ) : (
          <div className="monitor-list">
            {containers.data.containerMonitors.map((monitor) => (
              <ContainerMonitorRow
                key={monitor.id}
                monitor={monitor}
                onEdit={() => editMonitor(monitor)}
                onRemove={() => removeContainerMonitor.mutate(monitor.id)}
              />
            ))}
          </div>
        )}
      </Panel>
      {selected ? (
        <Panel title={container.data?.name ?? "Container detail"}>
          {!container.data ? <StateBlock title="Loading detail" message="Reading container detail." /> : <ContainerDetail container={container.data} />}
        </Panel>
      ) : null}
    </div>
  );
}

function DomainsPage() {
  const [domainValue, setDomainValue] = useState("");
  const [editingDomain, setEditingDomain] = useState<DomainCheck | null>(null);
  const [isDomainModalOpen, setIsDomainModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const domains = useDomains();
  const addDomain = useAddDomain();
  const updateDomain = useUpdateDomain();
  const removeDomain = useRemoveDomain();

  const resetDomainForm = () => {
    setDomainValue("");
    setEditingDomain(null);
    setIsDomainModalOpen(false);
    setFormError(null);
  };

  const openAddDomain = () => {
    setDomainValue("");
    setEditingDomain(null);
    setFormError(null);
    setIsDomainModalOpen(true);
  };

  const editDomain = (domain: DomainCheck) => {
    setDomainValue(domain.domain);
    setEditingDomain(domain);
    setFormError(null);
    setIsDomainModalOpen(true);
  };

  const saveDomain = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const input = { domain: domainValue };

    try {
      if (editingDomain) {
        await updateDomain.mutateAsync({ id: editingDomain.id, input });
      } else {
        await addDomain.mutateAsync(input);
      }
      resetDomainForm();
    } catch (error) {
      setFormError(normalizeApiError(error).message);
    }
  };

  if (domains.isLoading) return <StateBlock title="Loading domains" message="Checking configured domains." />;
  if (!domains.data) return <StateBlock title="Domains unavailable" message={normalizeApiError(domains.error).message} />;
  return (
    <div className="page-stack">
      <Panel title="Domains / services" action={<div className="button-row"><button onClick={() => domains.refetch()}><RefreshCcw size={16} /> Check now</button><button onClick={openAddDomain}><Plus size={16} /> Add domain</button></div>}>
        {domains.data.length === 0 ? (
          <StateBlock title="No services configured" message="Add a public domain, internal URL, or set MONITORED_DOMAINS in the backend environment." />
        ) : (
          domains.data.map((domain) => (
            <DomainRow
              key={domain.id}
              domain={domain}
              onCheck={() => domains.refetch()}
              onEdit={domain.editable ? () => editDomain(domain) : undefined}
              onRemove={domain.editable ? () => removeDomain.mutate(domain.id) : undefined}
            />
          ))
        )}
      </Panel>
      {isDomainModalOpen ? (
        <Modal title={editingDomain ? "Edit domain / service" : "Add domain / service"} onClose={resetDomainForm}>
          <form className="inline-form modal-form" onSubmit={saveDomain}>
            <label>
              Domain URL
              <input value={domainValue} onChange={(event) => setDomainValue(event.target.value)} placeholder="https://bit.muthu.eu" />
            </label>
            <button type="submit" disabled={addDomain.isPending || updateDomain.isPending}>
              {editingDomain ? <Pencil size={16} /> : <Plus size={16} />}
              {editingDomain ? "Save edits" : "Add domain"}
            </button>
          </form>
          {formError ? <div className="form-error">{formError}</div> : null}
        </Modal>
      ) : null}
    </div>
  );
}

function AlertsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Alert["severity"]>("all");
  const alerts = useAlerts();
  const alert = useAlert(selected);
  if (alerts.isLoading) return <StateBlock title="Loading alerts" message="Generating current alerts." />;
  if (!alerts.data) return <StateBlock title="Alerts unavailable" message={normalizeApiError(alerts.error).message} />;
  const filteredAlerts = filter === "all" ? alerts.data : alerts.data.filter((item) => item.severity === filter);
  return (
    <div className="two-col">
      <Panel title="Alerts" action={<div className="segmented compact-tabs">{(["all", "critical", "warning", "resolved"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value}</button>)}</div>}>
        {filteredAlerts.length === 0 ? <StateBlock title="No alerts" message="No alerts match the current filter." /> : filteredAlerts.map((item) => <button className={`row-button ${selected === item.id ? "selected" : ""}`} key={item.id} onClick={() => setSelected(item.id)}><AlertRow alert={item} /></button>)}
      </Panel>
      <Panel title="Alert detail">
        {!selected ? <StateBlock title="Select an alert" message="Choose an alert to inspect failed checks, likely causes, and next steps." /> : !alert.data ? <StateBlock title="Loading alert" message="Reading alert detail." /> : <AlertDetail alert={alert.data} />}
      </Panel>
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
  const validateConnection = useValidateConnection();

  const testConnection = async () => {
    setConnectionMessage(null);
    if (!backendConfig) {
      setConnectionMessage(demoMode ? "Demo mode is enabled. No backend connection is required." : "No backend is configured.");
      return;
    }

    try {
      await validateConnection.mutateAsync({ backendUrl: backendConfig.backendUrl, apiKey: backendConfig.apiKey });
      setConnectionMessage(`Connection healthy at ${formatDateTime(new Date().toISOString())}`);
    } catch (error) {
      setConnectionMessage(normalizeApiError(error).message);
    }
  };

  const exportDiagnostics = () => {
    const diagnostics = {
      generatedAt: new Date().toISOString(),
      backendUrl: backendConfig ? maskSensitiveUrl(backendConfig.backendUrl, hideSensitiveValues) : null,
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
          <Info label="API key" value={backendConfig?.apiKeyPreview ?? "Not saved"} />
          <Info label="Connected" value={formatDateTime(backendConfig?.connectedAt ?? null)} />
        </div>
        {connectionMessage ? <div className="stale-notice success">{connectionMessage}</div> : null}
      </Panel>
      <Panel title="Refresh interval">
        <div className="segmented">
          {[30, 60, 120, 300].map((value) => <button key={value} className={value === refreshIntervalSeconds ? "active" : ""} onClick={() => setRefreshIntervalSeconds(value)}>{value}s</button>)}
        </div>
      </Panel>
      <Panel title="Security">
        <div className="settings-list">
          <label><input type="checkbox" checked={hideSensitiveValues} onChange={(event) => setHideSensitiveValues(event.target.checked)} /> Hide backend URL in screenshots</label>
          <label><input type="checkbox" checked={demoMode} onChange={(event) => setDemoMode(event.target.checked)} /> Enable demo mode</label>
        </div>
        <div className="button-row">
          <button onClick={exportDiagnostics}>Export diagnostics</button>
          <button onClick={disconnect}>Change API key</button>
        </div>
      </Panel>
      <Panel title="About NodeGuard">
        <p className="muted">Web-only, read-only infrastructure monitoring for local homelab hosts, containers, and services. For local MVP testing, the API key is stored in browser storage; production versions should use encrypted session storage or server-side authentication.</p>
        <button className="danger" onClick={disconnect}><LogOut size={16} /> Disconnect</button>
      </Panel>
    </div>
  );
}

function ContainerRow({ container, onSelect }: { container: Container; onSelect: () => void }) {
  return (
    <button className="table-row" onClick={onSelect}>
      <span><strong>{container.name}</strong><small>{container.image}</small></span>
      <StatusPill status={container.status === "running" ? "healthy" : container.status === "restarting" ? "warning" : "offline"} />
      <span>{container.health}</span>
      <span>{container.uptime}</span>
      <span>{container.ports.join(", ") || "No ports"}</span>
    </button>
  );
}

function ContainerDetail({ container }: { container: Container }) {
  return (
    <div className="page-stack compact">
      <div className="info-grid">
        <Info label="Image" value={container.image} />
        <Info label="Status" value={container.status} />
        <Info label="Health" value={container.health} />
        <Info label="Restart policy" value={container.restartPolicy ?? "Unavailable"} />
        <Info label="Ports" value={container.ports.join(", ") || "No ports"} />
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

function DomainRow({ domain, onCheck, onEdit, onRemove }: { domain: DomainCheck; onCheck?: () => void; onEdit?: () => void; onRemove?: () => void }) {
  const hasActions = Boolean(onCheck || onEdit || onRemove);

  return (
    <div className={`data-row ${hasActions ? "domain-action-row" : "domain-summary-row"}`}>
      <span>
        <strong>{domain.domain}</strong>
        <small>{domain.error ?? `${domain.https ? "HTTPS" : "HTTP"} · Last checked ${formatRelativeTime(domain.lastCheckedAt)}`}</small>
      </span>
      <span>{domain.statusCode ? `HTTP ${domain.statusCode}` : "No status"}</span>
      <span>{formatResponseTime(domain.responseTimeMs)}</span>
      <span>{sslLabel(domain)}</span>
      <StatusPill status={domain.status} />
      {onCheck ? (
        <button className="icon-only" onClick={onCheck} aria-label={`Check ${domain.domain}`}>
          <RefreshCcw size={15} />
        </button>
      ) : null}
      {onEdit ? (
        <button className="icon-only" onClick={onEdit} aria-label={`Edit ${domain.domain}`}>
          <Pencil size={15} />
        </button>
      ) : null}
      {onRemove ? (
        <button className="icon-only danger-soft" onClick={onRemove} aria-label={`Remove ${domain.domain}`}>
          <Trash2 size={15} />
        </button>
      ) : null}
    </div>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  return (
    <div className="data-row alert-row">
      <span><strong>{alert.title}</strong><small>{alert.affectedResource} · {formatRelativeTime(alert.createdAt)}</small></span>
      <StatusPill status={alert.severity} />
    </div>
  );
}

function ServerMonitorRow({ monitor, onEdit, onRemove }: { monitor: MonitoredServerStatus; onEdit: () => void; onRemove: () => void }) {
  return (
    <div className="data-row monitor-row">
      <span>
        <strong>{monitor.name}</strong>
        <small>{monitor.backendUrl} · {monitor.lastError ?? `checked ${formatRelativeTime(monitor.lastCheckedAt)}`}</small>
      </span>
      <StatusPill status={monitor.status} />
      <button className="icon-only" onClick={onEdit} aria-label={`Edit ${monitor.name}`}>
        <Pencil size={15} />
      </button>
      <button className="icon-only danger-soft" onClick={onRemove} aria-label={`Remove ${monitor.name}`}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function ContainerMonitorRow({ monitor, onEdit, onRemove }: { monitor: ContainerMonitorStatus; onEdit: () => void; onRemove: () => void }) {
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
        <Info label="Detected" value={formatDateTime(alert.createdAt)} />
        <Info label="Status" value={alert.status} />
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
  const backendConfig = useSettingsStore((state) => state.backendConfig);
  const demoMode = useSettingsStore((state) => state.demoMode);
  const load = useSettingsStore((state) => state.load);

  useEffect(() => {
    load();
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><ShieldCheck size={24} /><span>NodeGuard</span></div>
        <nav>{nav.map(([key, Icon, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><Icon size={18} /> {label}</button>)}</nav>
      </aside>
      <main className="workspace">
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
