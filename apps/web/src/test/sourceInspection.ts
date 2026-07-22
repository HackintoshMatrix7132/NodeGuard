import { readdirSync, readFileSync } from "node:fs";

function readDirectorySources(directory: URL) {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
    .sort()
    .map((name) => readFileSync(new URL(name, directory), "utf8"))
    .join("\n");
}

export function readAppSource() {
  return [
    readFileSync(new URL("../App.tsx", import.meta.url), "utf8"),
    readDirectorySources(new URL("../app/", import.meta.url)),
    readDirectorySources(new URL("../pages/", import.meta.url)),
  ].join("\n");
}

export function readStylesheetSource() {
  const aggregatorUrl = new URL("../styles.css", import.meta.url);
  const aggregator = readFileSync(aggregatorUrl, "utf8");
  const imports = [...aggregator.matchAll(/@import\s+["']([^"']+)["'];/g)];
  return [
    aggregator,
    ...imports.map((match) => readFileSync(new URL(match[1], aggregatorUrl), "utf8")),
  ].join("\n");
}
