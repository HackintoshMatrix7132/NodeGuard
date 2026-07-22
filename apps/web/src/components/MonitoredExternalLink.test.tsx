import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { readStylesheetSource } from "../test/sourceInspection";
import { MonitoredExternalLink, normalizeMonitoredHref } from "./MonitoredExternalLink";

test("renders secure external-link semantics and an accessible name", () => {
  const markup = renderToStaticMarkup(
    <MonitoredExternalLink
      href="https://prox.example.test"
      label="Open Proxmox Server at https://prox.example.test"
      text="https://prox.example.test"
    />,
  );

  assert.match(markup, /href="https:\/\/prox\.example\.test"/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noopener noreferrer"/);
  assert.match(markup, /aria-label="Open Proxmox Server at https:\/\/prox\.example\.test"/);
  assert.match(markup, /title="https:\/\/prox\.example\.test"/);
  assert.match(markup, /class="monitored-external-link__text"/);
  assert.match(markup, /class="monitored-external-link__icon"/);
  assert.match(markup, /aria-hidden="true"/);
});

test("normalizes scheme-less monitored URLs without changing HTTPS URLs", () => {
  assert.equal(normalizeMonitoredHref(" prox.example.test "), "http://prox.example.test");
  assert.equal(normalizeMonitoredHref("https://prox.example.test"), "https://prox.example.test");
});

test("keeps the monitored link animation contract for hover, focus, truncation, and reduced motion", () => {
  const styles = readStylesheetSource();

  assert.match(
    styles,
    /\.monitored-external-link__text\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
  );
  assert.match(
    styles,
    /\.monitored-external-link__icon\s*\{[^}]*opacity:\s*0;[^}]*translateX\(-6px\) scale\(0\.72\);[^}]*180ms cubic-bezier\(0\.2, 0\.9, 0\.25, 1\.25\)/s,
  );
  assert.match(
    styles,
    /\.monitored-external-link:hover \.monitored-external-link__icon,[\s\S]*\.monitored-external-link:focus-visible \.monitored-external-link__icon\s*\{[^}]*opacity:\s*1;[^}]*translateX\(0\) scale\(1\);/s,
  );
  assert.match(
    styles,
    /\.monitored-external-link:hover \.monitored-external-link__text,[\s\S]*\.monitored-external-link:focus-visible \.monitored-external-link__text\s*\{[^}]*text-decoration-color:/s,
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?transition-duration:\s*0\.001ms !important;/,
  );
});
