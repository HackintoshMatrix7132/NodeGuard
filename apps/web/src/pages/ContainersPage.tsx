import { AlertTriangle,ArrowDown,ArrowUp,ArrowUpDown,Boxes,Copy,ExternalLink,Eye,EyeOff,Pencil,Plus,RefreshCcw,Search,Trash2 } from "lucide-react";
import { useEffect,useMemo,useRef,useState } from "react";

import { normalizeApiError } from "../api/errors";
import { NodeGuardSelect } from "../components/NodeGuardSelect";
import {
  useAddContainerMonitor,
  useContainer,
  useContainers,
  useRemoveContainerMonitor,
  useUpdateContainerMonitor
} from "../hooks/useNodeGuardQueries";
import type { Container,ContainerMonitorStatus } from "../types/nodeguard";
import { getContainerImageRepositoryUrl } from "../utils/containerImage";
import { formatRelativeTime } from "../utils/format";

import { DeleteConfirmationDialog,Info,Modal,Panel,StaleNotice,StateBlock,StatusPill,SuccessNotice,duplicateName } from "../app/ui";

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

export function ContainersPage({ initialHostId, onHostFilterApplied }: { initialHostId?: string | null; onHostFilterApplied?: () => void }) {
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
    <div className="page-stack containers-page">
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
