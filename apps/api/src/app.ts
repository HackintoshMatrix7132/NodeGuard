import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { isRequestOriginAllowed } from "./config/cors.js";
import { env } from "./config/env.js";
import { AGENT_API_BASE_PATH, AGENT_ENDPOINTS } from "./generated/agentContract.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAuthenticated, requireLiveDataAccess } from "./middleware/auth.js";
import { agentDownloadsRouter } from "./routes/agentDownloads.js";
import { agentIngestRouter } from "./routes/agentIngest.js";
import { agentsRouter } from "./routes/agents.js";
import { alertsRouter } from "./routes/alerts.js";
import { authRouter } from "./routes/auth.js";
import { checksRouter } from "./routes/checks.js";
import { containersRouter } from "./routes/containers.js";
import { domainsRouter } from "./routes/domains.js";
import { healthRouter } from "./routes/health.js";
import { overviewRouter } from "./routes/overview.js";
import proxmoxRouter from "./routes/proxmox.js";
import { serversRouter } from "./routes/servers.js";
import { updatesRouter } from "./routes/updates.js";

export function createApp() {
  const app = express();
  const webDistPath = path.resolve(process.cwd(), env.webDistDir);

  app.set("trust proxy", env.trustProxy);
  app.use(helmet({
    contentSecurityPolicy: false
  }));
  app.use(express.json({ limit: env.requestJsonLimit }));
  app.use(cors((request, callback) => {
    const origin = request.header("origin");
    const allowed = isRequestOriginAllowed(origin, request.protocol, request.get("host"), env.allowedOrigins)
      || (!env.isProduction && env.allowedOrigins.length === 0);

    if (allowed) {
      callback(null, { credentials: true, origin: true });
      return;
    }

    const error = Object.assign(new Error("Origin is not allowed by NodeGuard CORS policy."), {
      status: 403,
      code: "origin_not_allowed",
      expose: true
    });
    callback(error, { origin: false });
  }));

  app.use("/health", healthRouter);
  app.use(agentDownloadsRouter);
  app.use("/api", rateLimit({
    windowMs: env.rateLimitWindowMs,
    limit: env.rateLimitMax,
    standardHeaders: "draft-8",
    legacyHeaders: false
  }));
  app.use("/api/auth", authRouter);
  app.use(AGENT_ENDPOINTS.register, rateLimit({
    windowMs: env.rateLimitWindowMs,
    limit: env.agentEnrollmentRateLimitMax,
    standardHeaders: "draft-8",
    legacyHeaders: false
  }));
  app.use(AGENT_API_BASE_PATH, rateLimit({
    windowMs: env.rateLimitWindowMs,
    limit: env.agentRateLimitMax,
    standardHeaders: "draft-8",
    legacyHeaders: false
  }));
  app.use(AGENT_API_BASE_PATH, agentIngestRouter);
  app.use("/api", requireAuthenticated);
  // Proxmox exposes a read-only fictional snapshot to Demo Mode. Mutation routes
  // enforce Live Mode and owner authorization inside the router, so mount it
  // before the global live-only guard without weakening settings or sync protections.
  app.use("/api/proxmox", proxmoxRouter);
  app.use("/api", requireLiveDataAccess);
  app.use("/api/agents", agentsRouter);
  app.use("/api/overview", overviewRouter);
  app.use("/api/servers", serversRouter);
  app.use("/api/containers", containersRouter);
  app.use("/api/domains", domainsRouter);
  app.use("/api/updates", updatesRouter);
  app.use("/api/alerts", alertsRouter);
  app.use("/api/checks", checksRouter);

  if (existsSync(path.join(webDistPath, "index.html"))) {
    app.use(express.static(webDistPath));
    app.get("*", (request, response, next) => {
      if (request.path.startsWith("/api") || request.path.startsWith("/agent/releases") || request.path === "/health" || request.path === "/install-agent.sh") {
        next();
        return;
      }

      response.sendFile(path.join(webDistPath, "index.html"));
    });
  }

  app.use(errorHandler);

  return app;
}
