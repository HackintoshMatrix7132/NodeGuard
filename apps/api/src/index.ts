import type { Server } from "node:http";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { cleanupExpiredSessions, ensureAdminUser } from "./services/authService.js";
import { closeDatabase } from "./services/database.js";
import { startMetricHistorySampler, stopMetricHistorySampler } from "./services/metricHistoryService.js";
import { startProxmoxSyncScheduler, stopProxmoxSyncScheduler } from "./services/proxmoxService.js";

const shutdownTimeoutMs = 10_000;
const backgroundDrainTimeoutMs = 15_000;
const forcedExitTimeoutMs = 25_000;

function withinTimeout(promise: Promise<unknown>, timeoutMs: number, message: string) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    void promise.then(
      () => {
        clearTimeout(timeout);
        resolve();
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function closeHttpServer(server: Server) {
  if (!server.listening) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.warn("NodeGuard API shutdown timed out; closing remaining HTTP connections.");
      server.closeAllConnections();
    }, shutdownTimeoutMs);
    timeout.unref();

    server.close((error) => {
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

ensureAdminUser();
cleanupExpiredSessions();
startMetricHistorySampler();
startProxmoxSyncScheduler();

const server = createApp().listen(env.port, env.host, () => {
  console.log(`NodeGuard API listening on http://${env.host}:${env.port}`);
});

let shutdownPromise: Promise<void> | null = null;

function shutdown(signal: NodeJS.Signals) {
  if (shutdownPromise) return shutdownPromise;

  console.log(`NodeGuard API received ${signal}; shutting down.`);
  const forcedExit = setTimeout(() => {
    console.error("NodeGuard API exceeded its shutdown deadline; exiting after closing SQLite.");
    try {
      closeDatabase();
    } finally {
      process.exit(1);
    }
  }, forcedExitTimeoutMs);
  shutdownPromise = (async () => {
    const serverClosed = closeHttpServer(server);
    const backgroundStopped = withinTimeout(
      Promise.all([stopMetricHistorySampler(), stopProxmoxSyncScheduler()]),
      backgroundDrainTimeoutMs,
      "NodeGuard background work did not drain before the shutdown deadline."
    );

    const results = await Promise.allSettled([serverClosed, backgroundStopped]);
    closeDatabase();

    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason);
    if (failures.length) {
      throw new AggregateError(failures, "NodeGuard API did not drain cleanly.");
    }
    clearTimeout(forcedExit);
    console.log("NodeGuard API shutdown complete.");
  })().catch((error) => {
    process.exitCode = 1;
    console.error("NodeGuard API shutdown failed.", error);
    try {
      closeDatabase();
    } catch (closeError) {
      console.error("NodeGuard database shutdown failed.", closeError);
    }
  });

  return shutdownPromise;
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
