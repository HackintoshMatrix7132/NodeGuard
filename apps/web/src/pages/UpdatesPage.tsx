import { AlertTriangle,PackageOpen,RadioTower,RefreshCcw,Search,ShieldAlert,ShieldCheck } from "lucide-react";
import { useEffect,useState } from "react";

import { normalizeApiError } from "../api/errors";
import { NodeGuardSelect } from "../components/NodeGuardSelect";
import {
  useMachineUpdates,
  useUpdates
} from "../hooks/useNodeGuardQueries";
import type { MachinePackageUpdate,MachineUpdateSummary } from "../types/nodeguard";
import { formatDateTime,formatRelativeTime } from "../utils/format";
import { currentUpdateCoverage,formatUpdateCount,hasRetainedUpdateInventory } from "../utils/updatePresentation";

import { AgentStatusPill,MachineUpdateConditionPill } from "../app/status";
import { Modal,Panel,StaleNotice,StateBlock } from "../app/ui";

type MachineUpdateFilter = "all" | "updates" | "security" | "up_to_date" | "reboot" | "unsupported" | "check_failed" | "stale_offline";

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

export function UpdatesPage({ initialMachineId, onInitialMachineApplied }: { initialMachineId?: string | null; onInitialMachineApplied?: () => void }) {
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

export function UpdatesNavLabel() {
  const updates = useUpdates();
  const count = updates.data?.availableCount ?? 0;
  return <><span>Updates</span>{count > 0 ? <span className="nav-count" aria-label={`${count} updates available`}>{count > 99 ? "99+" : count}</span> : null}</>;
}
