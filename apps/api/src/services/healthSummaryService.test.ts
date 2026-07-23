import assert from "node:assert/strict";
import test from "node:test";

import type { Alert } from "../types/nodeguard.js";
import { buildHealthSummary } from "./healthSummaryService.js";

function alert(overrides: Partial<Alert> & Pick<Alert, "id" | "severity" | "status">): Alert {
  return {
    title: overrides.id,
    message: "Test incident",
    affectedResource: "test-host",
    createdAt: "2026-07-23T10:00:00.000Z",
    firstSeenAt: "2026-07-23T10:00:00.000Z",
    lastSeenAt: "2026-07-23T10:05:00.000Z",
    occurrenceCount: 1,
    resolvedAt: null,
    failedChecks: [],
    possibleCause: null,
    suggestedNextSteps: [],
    ...overrides
  };
}

test("health summary separates active incidents from resolved history", () => {
  const active = [
    alert({ id: "warning", severity: "warning", status: "active" }),
    alert({ id: "critical", severity: "critical", status: "active", affectedResource: "edge-node", firstSeenAt: "2026-07-23T09:00:00.000Z" }),
    alert({ id: "updates", severity: "warning", status: "active", affectedResource: "Update Center" })
  ];
  const history = [
    ...active,
    alert({ id: "resolved-critical", severity: "critical", status: "resolved", resolvedAt: "2026-07-22T12:00:00.000Z" })
  ];

  assert.deepEqual(buildHealthSummary(active, history), {
    status: "critical",
    activeIncidents: { total: 2, critical: 1, warning: 1 },
    resolvedHistory: { total: 1, critical: 1, warning: 0 },
    primaryIncident: {
      id: "critical",
      severity: "critical",
      title: "critical",
      affectedResource: "edge-node",
      since: "2026-07-23T09:00:00.000Z"
    }
  });
});

test("health summary is healthy when only update notices or resolved alerts remain", () => {
  const updateNotice = alert({ id: "updates", severity: "warning", status: "active", affectedResource: "Update Center" });
  const resolved = alert({ id: "old-warning", severity: "warning", status: "resolved", resolvedAt: "2026-07-22T12:00:00.000Z" });

  assert.deepEqual(buildHealthSummary([updateNotice], [updateNotice, resolved]), {
    status: "healthy",
    activeIncidents: { total: 0, critical: 0, warning: 0 },
    resolvedHistory: { total: 1, critical: 0, warning: 1 },
    primaryIncident: null
  });
});
