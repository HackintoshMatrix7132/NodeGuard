export function formatBytes(gb: number | null) {
  if (gb === null) {
    return "Unavailable";
  }

  if (gb >= 1024) {
    return `${(gb / 1024).toFixed(1)} TB`;
  }

  return `${gb.toFixed(1)} GB`;
}

export function formatPercentage(value: number | null) {
  return value === null ? "Unavailable" : `${value.toFixed(1)}%`;
}

export function formatUptime(seconds: number | null) {
  if (seconds === null) {
    return "Unavailable";
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatDateTime(value: string | null) {
  if (!value) return "Unavailable";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatRelativeTime(value: string | null) {
  if (!value) return "Unavailable";
  const diffMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatResponseTime(value: number | null) {
  return value === null ? "timeout" : `${value}ms`;
}
