import { ExternalLink } from "lucide-react";

type MonitoredExternalLinkProps = {
  href: string;
  label: string;
  text: string;
  emphasis?: "normal" | "strong";
  className?: string;
};

export function normalizeMonitoredHref(value: string) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

export function MonitoredExternalLink({
  href,
  label,
  text,
  emphasis = "normal",
  className,
}: MonitoredExternalLinkProps) {
  const classes = ["monitored-external-link", className].filter(Boolean).join(" ");
  const textNode = emphasis === "strong" ? (
    <strong className="monitored-external-link__text">{text}</strong>
  ) : (
    <span className="monitored-external-link__text">{text}</span>
  );

  return (
    <a
      aria-label={label}
      className={classes}
      href={normalizeMonitoredHref(href)}
      onClick={(event) => event.stopPropagation()}
      rel="noopener noreferrer"
      target="_blank"
      title={text}
    >
      {textNode}
      <span aria-hidden="true" className="monitored-external-link__icon">
        <ExternalLink size={14} />
      </span>
    </a>
  );
}
