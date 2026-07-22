import assert from "node:assert/strict";
import test from "node:test";

import { overviewQueryKey } from "./useNodeGuardQueries";

test("overview cache keys are isolated by data mode", () => {
  assert.deepEqual(overviewQueryKey(false), ["overview", false]);
  assert.deepEqual(overviewQueryKey(true), ["overview", true]);
  assert.notDeepEqual(overviewQueryKey(false), overviewQueryKey(true));
});
