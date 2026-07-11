import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { env } from "./config/env.js";
import { isRequestOriginAllowed } from "./config/cors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAuthenticated, requireLiveDataAccess } from "./middleware/auth.js";
import { agentIngestRouter } from "./routes/agentIngest.js";
import { agentsRouter } from "./routes/agents.js";
import { authRouter } from "./routes/auth.js";
import { alertsRouter } from "./routes/alerts.js";
import { checksRouter } from "./routes/checks.js";
import { containersRouter } from "./routes/containers.js";
import { domainsRouter } from "./routes/domains.js";
import { healthRouter } from "./routes/health.js";
import { overviewRouter } from "./routes/overview.js";
import { serversRouter } from "./routes/servers.js";
import { updatesRouter } from "./routes/updates.js";
import { cleanupExpiredSessions, ensureAdminUser } from "./services/authService.js";
import { startMetricHistorySampler } from "./services/metricHistoryService.js";
import { startUpdateRefreshScheduler } from "./services/updateService.js";

const app = express();
const webDistPath = path.resolve(process.cwd(), env.webDistDir);

ensureAdminUser();
cleanupExpiredSessions();
startMetricHistorySampler();
startUpdateRefreshScheduler();

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
app.use("/api", rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: env.rateLimitMax,
  standardHeaders: "draft-8",
  legacyHeaders: false
}));
app.use("/api/auth", authRouter);
app.use("/api/agent/register", rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: env.agentEnrollmentRateLimitMax,
  standardHeaders: "draft-8",
  legacyHeaders: false
}));
app.use("/api/agent", rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: env.agentRateLimitMax,
  standardHeaders: "draft-8",
  legacyHeaders: false
}));
app.use("/api/agent", agentIngestRouter);
app.use("/api", requireAuthenticated);
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
    if (request.path.startsWith("/api") || request.path === "/health") {
      next();
      return;
    }

    response.sendFile(path.join(webDistPath, "index.html"));
  });
}

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`NodeGuard API listening on http://localhost:${env.port}`);
});
