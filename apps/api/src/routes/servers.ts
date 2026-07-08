import { Router } from "express";

import { getMonitoringSnapshot } from "../services/snapshotService.js";
import { addMonitoredServer, listMonitoredServerStatuses, removeMonitoredServer, updateMonitoredServer } from "../services/serverMonitorService.js";

export const serversRouter = Router();

serversRouter.get("/", async (_request, response, next) => {
  try {
    const snapshot = await getMonitoringSnapshot();
    response.json([snapshot.server, ...snapshot.serverMonitors]);
  } catch (error) {
    next(error);
  }
});

serversRouter.get("/monitors", async (_request, response, next) => {
  try {
    response.json(await listMonitoredServerStatuses());
  } catch (error) {
    next(error);
  }
});

serversRouter.post("/monitors", async (request, response, next) => {
  try {
    const server = await addMonitoredServer(request.body);
    response.status(201).json(server);
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).json({ error: "invalid_server_monitor", message: error.message });
      return;
    }

    next(error);
  }
});

serversRouter.put("/monitors/:id", async (request, response, next) => {
  try {
    const server = await updateMonitoredServer(request.params.id, request.body);
    if (!server) {
      response.status(404).json({ error: "not_found", message: "Server monitor not found." });
      return;
    }

    response.json(server);
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).json({ error: "invalid_server_monitor", message: error.message });
      return;
    }

    next(error);
  }
});

serversRouter.delete("/monitors/:id", async (request, response, next) => {
  try {
    const result = await removeMonitoredServer(request.params.id);
    if (!result.removed) {
      response.status(404).json({ error: "not_found", message: "Server monitor not found." });
      return;
    }

    response.json(result);
  } catch (error) {
    next(error);
  }
});

serversRouter.get("/:id", async (request, response, next) => {
  try {
    const snapshot = await getMonitoringSnapshot();
    if (request.params.id !== snapshot.server.id) {
      response.status(404).json({ error: "not_found", message: "Server not found." });
      return;
    }

    response.json(snapshot.server);
  } catch (error) {
    next(error);
  }
});

serversRouter.get("/:id/metrics", async (request, response, next) => {
  try {
    const snapshot = await getMonitoringSnapshot();
    if (request.params.id !== snapshot.server.id) {
      response.status(404).json({ error: "not_found", message: "Server metrics not found." });
      return;
    }

    response.json(snapshot.metrics);
  } catch (error) {
    next(error);
  }
});

serversRouter.get("/:id/containers", async (request, response, next) => {
  try {
    const snapshot = await getMonitoringSnapshot();
    if (request.params.id !== snapshot.server.id) {
      response.status(404).json({ error: "not_found", message: "Server containers not found." });
      return;
    }

    response.json(snapshot.docker);
  } catch (error) {
    next(error);
  }
});
