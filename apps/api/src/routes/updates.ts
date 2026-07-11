import { Router } from "express";

import { getMonitoringSnapshot } from "../services/snapshotService.js";
import { getHomeAssistantSettings, getUpdateCenterSnapshot, refreshUpdates, saveHomeAssistantSettings, testHomeAssistantConnection } from "../services/updateService.js";

export const updatesRouter = Router();

updatesRouter.get("/", (_request, response) => {
  response.json(getUpdateCenterSnapshot());
});

updatesRouter.post("/refresh", async (_request, response, next) => {
  try {
    const snapshot = await refreshUpdates();
    await getMonitoringSnapshot();
    response.json(snapshot);
  } catch (error) {
    next(error);
  }
});

updatesRouter.get("/settings/home-assistant", (_request, response) => {
  response.json(getHomeAssistantSettings());
});

updatesRouter.post("/settings/home-assistant/test", async (request, response) => {
  try {
    response.json(await testHomeAssistantConnection(request.body));
  } catch (error) {
    response.status(400).json({
      error: "home_assistant_connection_failed",
      message: error instanceof Error ? error.message : "Home Assistant connection failed."
    });
  }
});

updatesRouter.put("/settings/home-assistant", async (request, response) => {
  try {
    const settings = await saveHomeAssistantSettings(request.body);
    await getMonitoringSnapshot();
    response.json(settings);
  } catch (error) {
    response.status(400).json({
      error: "invalid_home_assistant_settings",
      message: error instanceof Error ? error.message : "Home Assistant settings could not be saved."
    });
  }
});
