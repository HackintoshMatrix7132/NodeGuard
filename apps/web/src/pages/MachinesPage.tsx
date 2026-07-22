import { Copy,FileText,Pencil,Plus,Server,Trash2 } from "lucide-react";
import { useEffect,useRef,useState } from "react";

import { normalizeApiError } from "../api/errors";
import { MonitoredExternalLink } from "../components/MonitoredExternalLink";
import { NodeGuardSelect } from "../components/NodeGuardSelect";
import {
  useAddServerMonitor,
  useRemoveServerMonitor,
  useServer,
  useServerMetricHistory,
  useServerMetrics,
  useServerMonitors,
  useServers,
  useUpdateServerMonitor
} from "../hooks/useNodeGuardQueries";
import type { MetricHistory,MetricHistoryPoint,MetricHistoryRange,MetricHistorySummary,MonitoredServerStatus,Server as NodeGuardServer } from "../types/nodeguard";
import { formatBytes,formatDateTime,formatPercentage,formatRelativeTime,formatUptime } from "../utils/format";

import type { HistoricalMetricKey,HistoricalResource } from "../app/types";
import { DeleteConfirmationDialog,Info,InfoGroup,MetricCard,MetricDiagnostic,MetricMeter,Modal,Panel,StaleNotice,StateBlock,StatusPill,SuccessNotice,duplicateName } from "../app/ui";

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

export function ServerPage() {
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
    <div className="page-stack machines-page">
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
