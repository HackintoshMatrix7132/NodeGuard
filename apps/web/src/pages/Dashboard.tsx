import { Bell,Globe2,RefreshCcw,ShieldCheck } from "lucide-react";
import { useState } from "react";

import { normalizeApiError } from "../api/errors";
import { ProxmoxDashboardCard } from "../components/ProxmoxIntegration";
import {
  useAlerts,
  useContainers,
  useDomains,
  useOverview,
  useRunChecks,
  useServer,
  useUpdates
} from "../hooks/useNodeGuardQueries";
import { useSettingsStore } from "../store/settingsStore";
import { formatDateTime,formatRelativeTime } from "../utils/format";
import { getStatusLabel,getStatusTone } from "../utils/status";
import { currentUpdateCoverage,formatUpdateCount,updateSummaryHasCurrentData,updateSummaryUsesRetainedData } from "../utils/updatePresentation";

import type { MetricTone,View } from "../app/types";
import { MetricCard,MetricDiagnostic,MetricMeter,Panel,StaleNotice,StateBlock,StatusPill,countLabel,percentage,statusTrend } from "../app/ui";
import { AlertRow } from "./AlertsPage";
import { DomainRow } from "./DomainsPage";

export function Dashboard({ setView }: { setView: (view: View) => void }) {
  const [refreshMessage, setRefreshMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const overview = useOverview();
  const server = useServer("local-node");
  const containers = useContainers();
  const domains = useDomains();
  const updates = useUpdates();
  const alerts = useAlerts();
  const runChecks = useRunChecks();
  const refreshIntervalSeconds = useSettingsStore((state) => state.refreshIntervalSeconds);
  const healthSummary = overview.data?.healthSummary;
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
  const domainTone: MetricTone = domains.data
    ? offlineDomains > 0 ? "red" : warningDomains > 0 ? "orange" : "green"
    : overview.data && overview.data.domainsOnline < overview.data.domainsTotal ? "orange" : "blue";
  const alertTone: MetricTone = healthSummary?.status === "critical" ? "red" : healthSummary?.status === "warning" ? "orange" : "green";
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

  const currentHealth = overview.data.healthSummary;
  const primaryIncident = currentHealth.primaryIncident;
  const incidentSummary = currentHealth.activeIncidents.total === 0
    ? "No active incidents detected."
    : `${countLabel(currentHealth.activeIncidents.total, "active incident")} · ${currentHealth.activeIncidents.critical} critical · ${currentHealth.activeIncidents.warning} warning`;

  return (
    <div className="page-stack dashboard-page">
      <StaleNotice isError={overview.isError} dataUpdatedAt={overview.dataUpdatedAt} />
      {staleSupplementalSections.length > 0 ? (
        <div className="stale-notice" role="status">
          {staleSupplementalSections.join(", ")} could not refresh. Showing the last available data.
        </div>
      ) : null}
      <section className={`hero-panel ${getStatusTone(currentHealth.status)}`}>
        <div>
          <span className="eyebrow">NodeGuard</span>
          <div className="hero-status" role="status" aria-live="polite">{getStatusLabel(currentHealth.status)}</div>
          <p className="hero-summary">{incidentSummary}</p>
          {primaryIncident ? (
            <p className="hero-main-issue">
              <span>Primary incident</span>
              {primaryIncident.title} · {primaryIncident.affectedResource} · since {formatRelativeTime(primaryIncident.since)}
            </p>
          ) : null}
          <small>Last checked {formatDateTime(overview.data.lastCheckedAt)} · Live refresh every {refreshIntervalSeconds}s</small>
        </div>
        <button className="icon-button" onClick={refresh} disabled={runChecks.isPending}><RefreshCcw size={17} /> {runChecks.isPending ? "Refreshing..." : "Refresh"}</button>
      </section>
      {refreshMessage ? <div className={`stale-notice ${refreshMessage.tone === "success" ? "success" : ""}`} role={refreshMessage.tone === "error" ? "alert" : "status"}>{refreshMessage.text}</div> : null}
      <Panel title="Active incidents" action={<button className="dashboard-panel-action" onClick={() => setView("alerts")}>View details</button>}>
        {currentHealth.activeIncidents.total === 0 ? <StateBlock icon={<ShieldCheck size={18} aria-hidden="true" />} title="No active incidents" message="All monitored operational checks are currently healthy." /> : alerts.isLoading && !alerts.data ? <StateBlock tone="loading" title="Loading incident details" message={incidentSummary} /> : alerts.isError && !alerts.data ? <StateBlock tone="error" title={primaryIncident?.title ?? "Incident details unavailable"} message={primaryIncident ? `${primaryIncident.affectedResource} · since ${formatRelativeTime(primaryIncident.since)}` : normalizeApiError(alerts.error).message} /> : (
          <div className="issue-list">
            {healthAlerts.slice(0, 3).map((alert) => <button className="issue-row" key={alert.id} onClick={() => setView("alerts")}><StatusPill status={alert.severity} /><span>{alert.title} · {alert.affectedResource} · since {formatRelativeTime(alert.firstSeenAt)}</span></button>)}
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
          label="Active incidents"
          value={`${currentHealth.activeIncidents.total}`}
          detail={`${currentHealth.activeIncidents.critical} critical · ${currentHealth.activeIncidents.warning} warning`}
          tone={alertTone}
          onClick={() => setView("alerts")}
          indicator={<MetricDiagnostic rows={[
            { label: "Critical now", value: String(currentHealth.activeIncidents.critical), tone: currentHealth.activeIncidents.critical > 0 ? "red" : "green" },
            { label: "Warning now", value: String(currentHealth.activeIncidents.warning), tone: currentHealth.activeIncidents.warning > 0 ? "orange" : "green" },
            { label: "Resolved history", value: String(currentHealth.resolvedHistory.total), tone: "blue" }
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
        <Panel title="Active alert details" action={<button className="dashboard-panel-action" onClick={() => setView("alerts")}>View alert history</button>} className={activeAlerts.length === 0 ? "recent-alerts-card" : undefined}>
          {alerts.isLoading && !alerts.data ? <div className="recent-alerts-body"><StateBlock tone="loading" title="Loading alerts" message="Reading recent alerts." /></div> : alerts.isError && !alerts.data ? <div className="recent-alerts-body"><StateBlock tone="error" title="Recent alerts unavailable" message={normalizeApiError(alerts.error).message} /></div> : activeAlerts.length === 0 ? <div className="recent-alerts-body"><StateBlock icon={<Bell size={18} aria-hidden="true" />} title="No alerts" message="No active alerts were generated." /></div> : activeAlerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)}
        </Panel>
        <Panel title="Domain reachability" action={<button className="dashboard-panel-action" onClick={() => setView("domains")}>Open</button>}>
          {domains.isLoading && !domains.data ? <StateBlock tone="loading" title="Loading domains" message="Reading recent reachability checks." /> : domains.isError && !domains.data ? <StateBlock tone="error" title="Domain reachability unavailable" message={normalizeApiError(domains.error).message} /> : domainItems.length === 0 ? <StateBlock icon={<Globe2 size={18} aria-hidden="true" />} title="No domains configured" message="Add a domain or service to begin reachability monitoring." /> : domainItems.slice(0, 4).map((domain) => <DomainRow key={domain.id} domain={domain} />)}
        </Panel>
      </div>
    </div>
  );
}
