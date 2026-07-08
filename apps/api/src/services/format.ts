export function gb(bytes: number | null | undefined) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) {
    return null;
  }

  return Number((bytes / 1024 / 1024 / 1024).toFixed(1));
}

export function mb(bytes: number | null | undefined) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) {
    return null;
  }

  return Math.round(bytes / 1024 / 1024);
}

export function percent(used: number | null, total: number | null) {
  if (!used || !total || total <= 0) {
    return null;
  }

  return Number(((used / total) * 100).toFixed(1));
}

export function uptimeLabel(startedAt: string | null) {
  if (!startedAt) {
    return "Unavailable";
  }

  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}
