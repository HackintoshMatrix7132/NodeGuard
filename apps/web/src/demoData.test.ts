import assert from "node:assert/strict";
import test from "node:test";

import { demoContainers } from "./demoData";

test("the demo Postgres container is assigned to the Photos VM", () => {
  const postgres = demoContainers.find((container) => container.id === "pg001");

  assert.ok(postgres);
  assert.equal(postgres.serverId, "agent-photos-vm");
  assert.equal(postgres.hostName, "Photos VM");
});
