import { Bell,ChevronLeft,ChevronRight,RefreshCcw,Search,Trash2 } from "lucide-react";
import { useEffect,useRef,useState } from "react";

import { normalizeApiError } from "../api/errors";
import { NodeGuardSelect } from "../components/NodeGuardSelect";
import {
  useAlert,
  useAlerts,
  useRemoveAlert
} from "../hooks/useNodeGuardQueries";
import type { Alert } from "../types/nodeguard";
import { formatDateTime,formatRelativeTime } from "../utils/format";

import { DeleteConfirmationDialog,Info,Panel,StateBlock,StatusPill,SuccessNotice } from "../app/ui";

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
          <span className="alert-delete-label">{deleting ? "Deleting…" : "Delete"}</span>
        </button>
      </div>
    </article>
  );
}

export function AlertsPage() {
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

export function AlertRow({ alert }: { alert: Alert }) {
  return (
    <div className="data-row alert-row">
      <span><strong>{alert.title}</strong><small>{alert.affectedResource} · Last seen {formatRelativeTime(alert.lastSeenAt)}</small></span>
      <StatusPill status={alert.status === "resolved" ? "resolved" : alert.severity} />
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
