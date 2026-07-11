import { Router } from "express";

import { addContainerMonitor, removeContainerMonitor, updateContainerMonitor } from "../services/containerMonitorService.js";
import { getMonitoringSnapshot } from "../services/snapshotService.js";

export const containersRouter = Router();

containersRouter.get("/", async (_request, response, next) => {
  try {
    const snapshot = await getMonitoringSnapshot();
    response.json(snapshot.docker);
  } catch (error) {
    next(error);
  }
});

containersRouter.get("/monitors", async (_request, response, next) => {
  try {
    const snapshot = await getMonitoringSnapshot();
    response.json(snapshot.docker.containerMonitors);
  } catch (error) {
    next(error);
  }
});

containersRouter.post("/monitors", async (request, response, next) => {
  try {
    await addContainerMonitor(request.body);
    const snapshot = await getMonitoringSnapshot();
    response.status(201).json(snapshot.docker.containerMonitors);
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).json({ error: "invalid_container_monitor", message: error.message });
      return;
    }

    next(error);
  }
});

containersRouter.put("/monitors/:id", async (request, response, next) => {
  try {
    const updatedMonitor = await updateContainerMonitor(request.params.id, request.body);
    if (!updatedMonitor) {
      response.status(404).json({ error: "not_found", message: "Container monitor not found." });
      return;
    }

    const snapshot = await getMonitoringSnapshot();
    response.json(snapshot.docker.containerMonitors);
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).json({ error: "invalid_container_monitor", message: error.message });
      return;
    }

    next(error);
  }
});

containersRouter.delete("/monitors/:id", async (request, response, next) => {
  try {
    const result = await removeContainerMonitor(request.params.id);
    if (!result.removed) {
      response.status(404).json({ error: "not_found", message: "Container monitor not found." });
      return;
    }

    response.json(result);
  } catch (error) {
    next(error);
  }
});

containersRouter.get("/:id", async (request, response, next) => {
  try {
    const snapshot = await getMonitoringSnapshot();
    const serverId = typeof request.query.serverId === "string" ? request.query.serverId : null;
    const container = snapshot.docker.containers.find((item) =>
      (!serverId || item.serverId === serverId)
      && (item.id === request.params.id || item.id.startsWith(request.params.id))
    );
    if (!container) {
      response.status(404).json({ error: "not_found", message: "Container not found." });
      return;
    }

    response.json(container);
  } catch (error) {
    next(error);
  }
});
