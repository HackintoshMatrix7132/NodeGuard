import { Router } from "express";

import { getMonitoringSnapshot } from "../services/snapshotService.js";

export const checksRouter = Router();

checksRouter.post("/run", async (_request, response, next) => {
  try {
    const snapshot = await getMonitoringSnapshot();
    response.json(snapshot.overview);
  } catch (error) {
    next(error);
  }
});
