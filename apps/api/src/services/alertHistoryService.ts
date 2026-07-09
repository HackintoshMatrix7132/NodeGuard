import type { Alert, AlertStatus } from "../types/nodeguard.js";
import { getDatabase } from "./database.js";

type AlertHistoryRow = {
  id: string;
  severity: Alert["severity"];
  title: string;
  message: string;
  affected_resource: string;
  status: AlertStatus;
  created_at: string;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  occurrence_count: number;
  failed_checks: string;
  possible_cause: string | null;
  suggested_next_steps: string;
};

const database = getDatabase();

function parseStringList(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function rowToAlert(row: AlertHistoryRow): Alert {
  return {
    id: row.id,
    severity: row.severity,
    title: row.title,
    message: row.message,
    affectedResource: row.affected_resource,
    status: row.status,
    createdAt: row.created_at,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    occurrenceCount: row.occurrence_count,
    resolvedAt: row.resolved_at,
    failedChecks: parseStringList(row.failed_checks),
    possibleCause: row.possible_cause,
    suggestedNextSteps: parseStringList(row.suggested_next_steps)
  };
}

function getAlertById(id: string) {
  const row = database.prepare("SELECT * FROM alert_history WHERE id = ?").get(id) as AlertHistoryRow | undefined;
  return row ? rowToAlert(row) : null;
}

export function recordAlertSnapshot(activeAlerts: Alert[]): Alert[] {
  const now = new Date().toISOString();
  const activeIds = activeAlerts.map((alert) => alert.id);
  const select = database.prepare("SELECT * FROM alert_history WHERE id = ?");
  const insert = database.prepare(`
    INSERT INTO alert_history (
      id, severity, title, message, affected_resource, status, created_at, first_seen_at,
      last_seen_at, resolved_at, occurrence_count, failed_checks, possible_cause, suggested_next_steps
    )
    VALUES (
      @id, @severity, @title, @message, @affectedResource, 'active', @createdAt, @firstSeenAt,
      @lastSeenAt, NULL, 1, @failedChecks, @possibleCause, @suggestedNextSteps
    )
  `);
  const update = database.prepare(`
    UPDATE alert_history
    SET severity = @severity,
        title = @title,
        message = @message,
        affected_resource = @affectedResource,
        status = 'active',
        last_seen_at = @lastSeenAt,
        resolved_at = NULL,
        occurrence_count = occurrence_count + 1,
        failed_checks = @failedChecks,
        possible_cause = @possibleCause,
        suggested_next_steps = @suggestedNextSteps
    WHERE id = @id
  `);
  const resolveAll = database.prepare(`
    UPDATE alert_history
    SET status = 'resolved',
        resolved_at = COALESCE(resolved_at, @resolvedAt)
    WHERE status = 'active'
  `);

  const upsertAlerts = database.transaction((alerts: Alert[]) => {
    for (const alert of alerts) {
      const existing = select.get(alert.id) as AlertHistoryRow | undefined;
      const values = {
        id: alert.id,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        affectedResource: alert.affectedResource,
        createdAt: existing?.created_at ?? alert.createdAt,
        firstSeenAt: existing?.first_seen_at ?? alert.firstSeenAt,
        lastSeenAt: now,
        failedChecks: JSON.stringify(alert.failedChecks),
        possibleCause: alert.possibleCause,
        suggestedNextSteps: JSON.stringify(alert.suggestedNextSteps)
      };

      if (existing) {
        update.run(values);
      } else {
        insert.run(values);
      }
    }

    if (activeIds.length === 0) {
      resolveAll.run({ resolvedAt: now });
      return;
    }

    const placeholders = activeIds.map(() => "?").join(", ");
    database.prepare(`
      UPDATE alert_history
      SET status = 'resolved',
          resolved_at = COALESCE(resolved_at, ?)
      WHERE status = 'active' AND id NOT IN (${placeholders})
    `).run(now, ...activeIds);
  });

  upsertAlerts(activeAlerts);
  return activeAlerts.map((alert) => getAlertById(alert.id) ?? alert);
}

export function listAlertHistory(status: "active" | "resolved" | "all" = "active") {
  const where = status === "all" ? "" : "WHERE status = ?";
  const params = status === "all" ? [] : [status];
  const rows = database.prepare(`
    SELECT * FROM alert_history
    ${where}
    ORDER BY
      CASE status WHEN 'active' THEN 0 ELSE 1 END,
      CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'info' THEN 2 ELSE 3 END,
      last_seen_at DESC
  `).all(...params) as AlertHistoryRow[];

  return rows.map(rowToAlert);
}

export function getAlertHistory(id: string) {
  return getAlertById(id);
}
