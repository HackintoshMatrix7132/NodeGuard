import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireApiKey } from "./middleware/auth.js";
import { alertsRouter } from "./routes/alerts.js";
import { checksRouter } from "./routes/checks.js";
import { containersRouter } from "./routes/containers.js";
import { domainsRouter } from "./routes/domains.js";
import { healthRouter } from "./routes/health.js";
import { overviewRouter } from "./routes/overview.js";
import { serversRouter } from "./routes/servers.js";

const app = express();
const webDistPath = path.resolve(process.cwd(), env.webDistDir);

if (env.isProduction && !env.apiKey) {
  throw new Error("NODEGUARD_API_KEY is required when NODE_ENV=production.");
}

app.set("trust proxy", env.trustProxy);
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: env.requestJsonLimit }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.allowedOrigins.includes(origin) || (!env.isProduction && env.allowedOrigins.length === 0)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin is not allowed by NodeGuard CORS policy."));
  }
}));

app.use("/health", healthRouter);
app.use("/api", rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: env.rateLimitMax,
  standardHeaders: "draft-8",
  legacyHeaders: false
}));
app.use("/api", requireApiKey);
app.use("/api/overview", overviewRouter);
app.use("/api/servers", serversRouter);
app.use("/api/containers", containersRouter);
app.use("/api/domains", domainsRouter);
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
