import assert from "node:assert/strict";
import test from "node:test";

import { demoAlerts, demoContainers, getDemoOverview } from "./demoData";

test("the demo Postgres container is assigned to the Photos VM", () => {
  const postgres = demoContainers.find((container) => container.id === "pg001");

  assert.ok(postgres);
  assert.equal(postgres.serverId, "agent-photos-vm");
  assert.equal(postgres.hostName, "Photos VM");
});

test("the demo overview separates active incidents from resolved alert history", () => {
  const overview = getDemoOverview(demoAlerts);

  assert.equal(overview.status, overview.healthSummary.status);
  assert.equal(overview.healthSummary.activeIncidents.total > 0, true);
  assert.equal(overview.healthSummary.resolvedHistory.total > 0, true);
  assert.ok(overview.healthSummary.primaryIncident);
  assert.equal(overview.healthSummary.primaryIncident.since, demoAlerts.find((item) => item.id === overview.healthSummary.primaryIncident?.id)?.firstSeenAt);
});
