import { Router } from "express";

import { getMonitoringSnapshot } from "../services/snapshotService.js";

export const alertsRouter = Router();

alertsRouter.get("/", async (_request, response, next) => {
  try {
    const snapshot = await getMonitoringSnapshot();
    response.json(snapshot.alerts);
  } catch (error) {
    next(error);
  }
});

alertsRouter.get("/:id", async (request, response, next) => {
  try {
    const snapshot = await getMonitoringSnapshot();
    const alert = snapshot.alerts.find((item) => item.id === request.params.id);
    if (!alert) {
      response.status(404).json({ error: "not_found", message: "Alert not found." });
      return;
    }

    response.json(alert);
  } catch (error) {
    next(error);
  }
});
