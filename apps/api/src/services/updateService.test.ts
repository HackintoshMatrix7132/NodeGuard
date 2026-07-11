import assert from "node:assert/strict";
import test from "node:test";

import { normalizeHomeAssistantUpdates } from "./updateService.js";

test("normalizes Home Assistant update entities into the shared update model", () => {
  const checkedAt = "2026-07-11T00:00:00.000Z";
  const updates = normalizeHomeAssistantUpdates([
    {
      entity_id: "update.home_assistant_core_update",
      state: "on",
      attributes: {
        friendly_name: "Home Assistant Core Update",
        installed_version: "2026.6.4",
        latest_version: "2026.7.1",
        release_url: "https://www.home-assistant.io/blog/"
      }
    },
    {
      entity_id: "update.router_firmware",
      state: "off",
      attributes: { friendly_name: "Router firmware", device_class: "firmware", installed_version: "8.0", latest_version: "8.0" }
    },
    { entity_id: "sensor.not_an_update", state: "on", attributes: {} }
  ], "https://ha.example.test", checkedAt);

  assert.equal(updates.length, 2);
  assert.deepEqual(updates[0], {
    id: "home_assistant:update.home_assistant_core_update",
    sourceId: "home_assistant",
    sourceName: "Home Assistant",
    name: "Home Assistant Core Update",
    installedVersion: "2026.6.4",
    availableVersion: "2026.7.1",
    category: "core",
    status: "available",
    securityCritical: false,
    lastCheckedAt: checkedAt,
    openUrl: "https://ha.example.test/config/updates",
    releaseNotesUrl: "https://www.home-assistant.io/blog/"
  });
  assert.equal(updates[1].category, "firmware");
  assert.equal(updates[1].status, "up_to_date");
});

test("marks explicit security-critical update metadata separately", () => {
  const [update] = normalizeHomeAssistantUpdates([{
    entity_id: "update.gateway_firmware",
    state: "on",
    attributes: { friendly_name: "Gateway critical security update", security_critical: true }
  }], "https://ha.example.test");

  assert.equal(update.securityCritical, true);
  assert.equal(update.status, "available");
});
