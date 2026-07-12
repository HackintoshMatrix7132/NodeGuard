import { existsSync } from "node:fs";
import path from "node:path";
import { Router } from "express";

import { env } from "../config/env.js";

const releaseAssetNames = new Set([
  "nodeguard-agent-linux-amd64",
  "nodeguard-agent-linux-arm64",
  "checksums.txt"
]);

function isSafeVersion(value: string) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);
}

export const agentDownloadsRouter = Router();

agentDownloadsRouter.get("/install-agent.sh", (_request, response) => {
  const installerPath = path.resolve(process.cwd(), env.agentInstallerPath);
  if (!existsSync(installerPath)) {
    response.status(404).type("text/plain").send("NodeGuard Agent installer is not available on this deployment.\n");
    return;
  }

  response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  response.setHeader("Content-Disposition", "inline; filename=install-agent.sh");
  response.type("application/x-sh");
  response.sendFile(installerPath);
});

agentDownloadsRouter.get("/agent/releases/latest/version", (_request, response) => {
  response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  response.type("text/plain").send(`${env.agentReleaseVersion}\n`);
});

agentDownloadsRouter.get("/agent/releases/:version/:asset", (request, response) => {
  const { version, asset } = request.params;
  if (!isSafeVersion(version) || !releaseAssetNames.has(asset)) {
    response.status(404).type("text/plain").send("Agent release asset not found.\n");
    return;
  }

  const assetPath = path.resolve(process.cwd(), env.agentReleaseDir, version, asset);
  if (!existsSync(assetPath)) {
    response.status(404).type("text/plain").send("Agent release asset not found.\n");
    return;
  }

  response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  response.setHeader("Content-Disposition", `attachment; filename=${asset}`);
  response.type(asset === "checksums.txt" ? "text/plain" : "application/octet-stream");
  response.sendFile(assetPath);
});
