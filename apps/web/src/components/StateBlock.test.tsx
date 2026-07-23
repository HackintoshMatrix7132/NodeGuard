import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { StateBlock } from "../app/ui";

const emptyStateCss = readFileSync(new URL("../styles/empty-state-system.css", import.meta.url), "utf8");
const proxmoxSource = readFileSync(new URL("./ProxmoxIntegration.tsx", import.meta.url), "utf8");

test("StateBlock exposes compact shared title, description, and icon hooks without losing accessible text", () => {
  const markup = renderToStaticMarkup(<StateBlock title="No alerts" message="No active alerts are available." />);

  assert.match(markup, /class="state-block state-block--empty"/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /class="state-block__icon" aria-hidden="true"/);
  assert.match(markup, /class="state-block__title">No alerts/);
  assert.match(markup, /class="state-block__description">No active alerts are available\./);
});

test("StateBlock preserves loading and error announcement semantics", () => {
  const loading = renderToStaticMarkup(<StateBlock tone="loading" title="Loading alerts" message="Reading alerts." />);
  const error = renderToStaticMarkup(<StateBlock tone="error" title="Alerts unavailable" message="Try again." />);

  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-live="polite"/);
  assert.match(error, /role="alert"/);
});

test("all empty states share the compact NodeGuard type scale and responsive layout", () => {
  assert.match(emptyStateCss, /--ng-empty-state-icon-size:\s*16px/);
  assert.match(emptyStateCss, /--ng-empty-state-title-size:\s*var\(--ng-type-section-title, 14px\)/);
  assert.match(emptyStateCss, /--ng-empty-state-description-size:\s*var\(--ng-type-body, 13px\)/);
  assert.match(emptyStateCss, /--ng-empty-state-title-weight:\s*600/);
  assert.match(emptyStateCss, /\.state-block__description\s*\{[^}]*font-weight:\s*400[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(emptyStateCss, /@media \(max-width:\s*640px\)[\s\S]*grid-template-columns:\s*var\(--ng-empty-state-icon-size\) minmax\(0, 1fr\)/);
  assert.match(proxmoxSource, /<StateBlock className="proxmox-empty" title=\{title\} message=\{description\} icon=\{icon\}/);
  assert.doesNotMatch(proxmoxSource, /<div className="proxmox-empty">/);
});
