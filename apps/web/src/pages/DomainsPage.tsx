import { ChevronDown,Copy,Globe2,LoaderCircle,Pencil,Plus,RefreshCcw,Trash2 } from "lucide-react";
import { useState } from "react";

import { normalizeApiError } from "../api/errors";
import { MonitoredExternalLink } from "../components/MonitoredExternalLink";
import {
  useAddDomain,
  useDomains,
  useRemoveDomain,
  useUpdateDomain
} from "../hooks/useNodeGuardQueries";
import type { DomainCheck } from "../types/nodeguard";
import { formatDateTime,formatRelativeTime,formatResponseTime } from "../utils/format";
import { getStatusLabel } from "../utils/status";

import { DeleteConfirmationDialog,Info,Modal,Panel,StateBlock,StatusPill,SuccessNotice,compactSslLabel,compactUptimeLabel,domainTargetKey,fullDomainUrl,latencyTrend,parseExpectedStatusCodes } from "../app/ui";

export function DomainsPage() {
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
  const isSavingDomain = addDomain.isPending || updateDomain.isPending;

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
    <div className="page-stack domains-page">
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
            <button className="modal-submit" type="submit" disabled={isSavingDomain} aria-busy={isSavingDomain}>
              {isSavingDomain ? <LoaderCircle className="is-spinning" size={14} /> : editingDomain ? null : duplicatingDomain ? <Copy size={16} /> : <Plus size={16} />}
              {isSavingDomain ? "Saving…" : editingDomain ? "Save edits" : duplicatingDomain ? "Create duplicate" : "Add domain"}
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

export function DomainRow({ domain, onCheck, onDuplicate, onEdit, onRemove }: { domain: DomainCheck; onCheck?: () => void; onDuplicate?: () => void; onEdit?: () => void; onRemove?: () => void }) {
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
        <span>{compactUptimeLabel(domain)}</span>
        <span>{compactSslLabel(domain)}</span>
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
