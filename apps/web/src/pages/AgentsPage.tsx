import { Boxes,Check,Copy,Download,ExternalLink,Eye,EyeOff,FileText,KeyRound,LoaderCircle,PackageOpen,Pencil,Plus,RadioTower,RefreshCcw,Search,ShieldAlert,ShieldCheck,Trash2 } from "lucide-react";
import { useEffect,useMemo,useRef,useState } from "react";

import { normalizeApiError } from "../api/errors";
import { NodeGuardSelect } from "../components/NodeGuardSelect";
import {
  useAgent,
  useAgentEnrollmentProgress,
  useAgentEnrollmentTokens,
  useAgents,
  useCreateAgentEnrollmentToken,
  useCreateAgentRotationToken,
  useDeleteAgent,
  useRenameAgent,
  useRevokeAgent,
  useRevokeAgentEnrollmentToken,
  useUpdates
} from "../hooks/useNodeGuardQueries";
import { useSettingsStore } from "../store/settingsStore";
import type { AgentEnrollmentProgress,AgentStatus,AgentSummary,CreatedAgentEnrollmentToken,MachineUpdateSummary } from "../types/nodeguard";
import { buildAgentCommand } from "../utils/agentCommand";
import { formatBytes,formatDateTime,formatPercentage,formatRelativeTime,formatUptime } from "../utils/format";
import { formatUpdateCount,hasRetainedUpdateInventory } from "../utils/updatePresentation";

import { AgentStatusPill,MachineUpdateConditionPill } from "../app/status";
import { Info,InfoGroup,Modal,Panel,StateBlock,SuccessNotice } from "../app/ui";

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

export function AgentsPage({ onOpenContainers, onOpenUpdates }: { onOpenContainers: (agentId: string) => void; onOpenUpdates: (agentId: string) => void }) {
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
