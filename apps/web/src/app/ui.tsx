import { AlertTriangle,LoaderCircle,PackageOpen,Trash2,X } from "lucide-react";
import { useEffect,useRef,useState,type CSSProperties } from "react";
import { createPortal } from "react-dom";

import type { Alert,DomainCheck,HealthStatus } from "../types/nodeguard";
import { formatDateTime } from "../utils/format";
import { getStatusLabel,getStatusTone } from "../utils/status";

import type { BreakdownItem,MetricTone } from "./types";

export function LogoMark({ className, label }: { className: string; label?: string }) {
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

export function StatusPill({ status }: { status: HealthStatus | Alert["severity"] }) {
  return <span className={`pill ${getStatusTone(status)}`}>{getStatusLabel(status)}</span>;
}

export function Panel({ title, children, action, className = "" }: { title: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
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

export function MetricCard({
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

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function percentage(part: number, total: number) {
  if (total <= 0) return 0;
  return clampPercent((part / total) * 100);
}

export function MetricMeter({ value, tone = "blue", label, rows = [] }: { value: number; tone?: MetricTone; label: string; rows?: BreakdownItem[] }) {
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

export function MetricBreakdown({ rows }: { rows: BreakdownItem[] }) {
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

export function MetricDiagnostic({ rows }: { rows: BreakdownItem[] }) {
  return (
    <div className="metric-indicator diagnostic">
      <MetricBreakdown rows={rows} />
    </div>
  );
}

export type StateBlockTone = "empty" | "loading" | "error";

export function StateBlock({ title, message, tone = "empty", icon }: { title: string; message: string; tone?: StateBlockTone; icon?: React.ReactNode }) {
  const Icon = tone === "loading" ? LoaderCircle : tone === "error" ? AlertTriangle : PackageOpen;
  return (
    <div className={`state-block state-block--${tone}`} role={tone === "error" ? "alert" : "status"} aria-live={tone === "loading" ? "polite" : undefined}>
      {icon ?? <Icon className={tone === "loading" ? "is-spinning" : undefined} size={18} aria-hidden="true" />}
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}

export function StaleNotice({ isError, dataUpdatedAt }: { isError: boolean; dataUpdatedAt: number }) {
  if (!isError || !dataUpdatedAt) return null;
  if (Date.now() - dataUpdatedAt < 15000) return null;
  return <div className="stale-notice" role="status">Showing last known status from {formatDateTime(new Date(dataUpdatedAt).toISOString())}. Live refresh failed.</div>;
}

export function SuccessNotice({ message, onDismiss }: { message: string; onDismiss: (value: null) => void }) {
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

export function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function summarizeIssues(alerts: Alert[]) {
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

export function mainIssue(alerts: Alert[]) {
  const alert = alerts.find((item) => item.severity === "critical") ?? alerts[0];
  if (!alert) {
    return "All monitored checks are currently healthy.";
  }

  return alert.possibleCause ? `${alert.title}. ${alert.possibleCause}` : `${alert.title}. ${alert.message}`;
}

export function statusTrend(status: HealthStatus | Alert["severity"]) {
  if (status === "healthy" || status === "resolved") return "Healthy";
  if (status === "warning") return "Needs attention";
  if (status === "critical" || status === "offline") return "Action required";
  return "Unknown";
}

export function compactSslLabel(domain: DomainCheck) {
  if (!domain.https) return "No SSL";
  if (domain.sslExpiresInDays === null) return "SSL unknown";
  if (domain.sslExpiresInDays < 0) return "SSL expired";
  return `SSL ${domain.sslExpiresInDays}d`;
}

export function compactUptimeLabel(domain: DomainCheck) {
  return domain.uptimePercent === null ? "Uptime pending" : `${domain.uptimePercent.toFixed(2)}% uptime`;
}

export function latencyTrend(domain: DomainCheck) {
  if (domain.latencyTrendPercent === null || Math.abs(domain.latencyTrendPercent) < 2) {
    return { symbol: "→", label: "Latency is stable", tone: "stable" };
  }

  if (domain.latencyTrendPercent > 0) {
    return { symbol: "↑", label: `Latency increased by ${domain.latencyTrendPercent.toFixed(1)}%`, tone: "slower" };
  }

  return { symbol: "↓", label: `Latency decreased by ${Math.abs(domain.latencyTrendPercent).toFixed(1)}%`, tone: "faster" };
}

export function fullDomainUrl(domain: DomainCheck) {
  return `${domain.domain}${domain.path === "/" ? "" : domain.path}`;
}

export function parseExpectedStatusCodes(value: string) {
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

export function duplicateName(name: string) {
  return `${name.trim() || "Monitor"} copy`;
}

export function domainTargetKey(domain: string, path: string) {
  const value = domain.trim();
  const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  const normalizedPath = path.trim() || "/";
  return `${parsed.origin}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
}

export function maskSensitiveUrl(value: string, hide: boolean) {
  if (!hide) return value;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.hostname.includes(".") ? "service.example.com" : "10.x.x.x"}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return "hidden";
  }
}

export function Modal({ title, children, onClose, isClosing = false, closeDisabled = false, descriptionId }: { title: string; children: React.ReactNode; onClose: () => void; isClosing?: boolean; closeDisabled?: boolean; descriptionId?: string }) {
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

export function DeleteConfirmationDialog({ title, resource, description, confirmLabel, busy, error, onClose, onConfirm }: { title: string; resource: string; description: string; confirmLabel: string; busy: boolean; error?: string | null; onClose: () => void; onConfirm: () => void }) {
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

export function Info({ label, value }: { label: string; value: string }) {
  return <div className="info"><span>{label}</span><strong>{value}</strong></div>;
}

export function InfoGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="server-info-group">
    <h3>{title}</h3>
    <div className="info-grid">{children}</div>
  </section>;
}
