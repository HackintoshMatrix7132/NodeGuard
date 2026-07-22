import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const runtimeDirectory = mkdtempSync(path.join(tmpdir(), "nodeguard-e2e-api-"));
const apiEntryPoint = fileURLToPath(new URL("../../api/dist/index.js", import.meta.url));

process.chdir(runtimeDirectory);
process.once("exit", () => rmSync(runtimeDirectory, { recursive: true, force: true }));

await import(pathToFileURL(apiEntryPoint).href);
