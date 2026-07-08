import { Router } from "express";

import { addStoredDomain, removeStoredDomain, updateStoredDomain } from "../services/domainConfigService.js";
import { getMonitoringSnapshot } from "../services/snapshotService.js";

export const domainsRouter = Router();

domainsRouter.get("/", async (_request, response, next) => {
  try {
    const snapshot = await getMonitoringSnapshot();
    response.json(snapshot.domains);
  } catch (error) {
    next(error);
  }
});

domainsRouter.post("/", async (request, response, next) => {
  try {
    await addStoredDomain(request.body);
    const snapshot = await getMonitoringSnapshot();
    response.status(201).json(snapshot.domains);
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).json({ error: "invalid_domain", message: error.message });
      return;
    }

    next(error);
  }
});

domainsRouter.put("/:id", async (request, response, next) => {
  try {
    const updatedDomain = await updateStoredDomain(request.params.id, request.body);
    if (!updatedDomain) {
      response.status(404).json({ error: "not_found", message: "Editable domain not found." });
      return;
    }

    const snapshot = await getMonitoringSnapshot();
    response.json(snapshot.domains);
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).json({ error: "invalid_domain", message: error.message });
      return;
    }

    next(error);
  }
});

domainsRouter.delete("/:id", async (request, response, next) => {
  try {
    const result = await removeStoredDomain(request.params.id);
    if (!result.removed) {
      response.status(404).json({ error: "not_found", message: "Editable domain not found." });
      return;
    }

    response.json(result);
  } catch (error) {
    next(error);
  }
});
