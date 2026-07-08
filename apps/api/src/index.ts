import cors from "cors";
import express from "express";

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

app.use(express.json());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.allowedOrigins.length === 0 || env.allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin is not allowed by NodeGuard CORS policy."));
  }
}));

app.use("/health", healthRouter);
app.use("/api", requireApiKey);
app.use("/api/overview", overviewRouter);
app.use("/api/servers", serversRouter);
app.use("/api/containers", containersRouter);
app.use("/api/domains", domainsRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/checks", checksRouter);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`NodeGuard API listening on http://localhost:${env.port}`);
});
