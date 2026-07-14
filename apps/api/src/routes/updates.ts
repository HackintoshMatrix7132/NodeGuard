import { Router } from "express";

import { requireOwner } from "../middleware/auth.js";
import { getMachineUpdateDetail, getUpdateCenterSnapshot, type UpdateMachineFilterStatus } from "../services/updateService.js";

export const updatesRouter = Router();

updatesRouter.use(requireOwner);

const updateStatuses = new Set<UpdateMachineFilterStatus>([
  "all",
  "updates",
  "security",
  "up_to_date",
  "reboot",
  "unsupported",
  "check_failed",
  "stale_offline"
]);

updatesRouter.get("/", (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  const search = typeof request.query.search === "string" ? request.query.search : undefined;
  const requestedStatus = typeof request.query.status === "string" ? request.query.status : "all";
  const status = updateStatuses.has(requestedStatus as UpdateMachineFilterStatus)
    ? requestedStatus as UpdateMachineFilterStatus
    : "all";
  response.json(getUpdateCenterSnapshot({ search, status }));
});

updatesRouter.get("/machines/:agentId", (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  const machine = getMachineUpdateDetail(request.params.agentId);
  if (!machine) {
    response.status(404).json({
      error: "agent_not_found",
      message: "Agent update inventory not found."
    });
    return;
  }
  response.json(machine);
});
