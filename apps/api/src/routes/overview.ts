import { Router } from "express";

import { getMonitoringSnapshot } from "../services/snapshotService.js";

export const overviewRouter = Router();

overviewRouter.get("/", async (_request, response, next) => {
  try {
    const snapshot = await getMonitoringSnapshot();
    response.json(snapshot.overview);
  } catch (error) {
    next(error);
  }
});
