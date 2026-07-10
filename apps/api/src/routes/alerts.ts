import { Router } from "express";

import { deleteAlertHistory, getAlertHistory, listAlertHistory } from "../services/alertHistoryService.js";
import { getMonitoringSnapshot } from "../services/snapshotService.js";

export const alertsRouter = Router();

alertsRouter.get("/", async (request, response, next) => {
  try {
    const snapshot = await getMonitoringSnapshot();
    const status = request.query.status;
    if (status === "all" || status === "resolved") {
      response.json(listAlertHistory(status));
      return;
    }

    response.json(snapshot.alerts);
  } catch (error) {
    next(error);
  }
});

alertsRouter.get("/:id", async (request, response, next) => {
  try {
    await getMonitoringSnapshot();
    const alert = getAlertHistory(request.params.id);
    if (!alert) {
      response.status(404).json({ error: "not_found", message: "Alert not found." });
      return;
    }

    response.json(alert);
  } catch (error) {
    next(error);
  }
});

alertsRouter.delete("/:id", (request, response, next) => {
  try {
    const result = deleteAlertHistory(request.params.id);
    if (!result.removed) {
      response.status(404).json({ error: "not_found", message: "Alert not found." });
      return;
    }

    response.json(result);
  } catch (error) {
    next(error);
  }
});
