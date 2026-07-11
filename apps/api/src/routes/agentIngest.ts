import { Router } from "express";

import { requireAgent } from "../middleware/agentAuth.js";
import {
  AgentPayloadError,
  parseAgentDocker,
  parseAgentHeartbeat,
  parseAgentInventory,
  parseAgentMetrics,
  parseAgentRegistration
} from "../services/agentValidation.js";
import {
  AgentServiceError,
  getAgentStatusPayload,
  recordAgentDocker,
  recordAgentHeartbeat,
  recordAgentInventory,
  recordAgentMetrics,
  registerAgent
} from "../services/agentService.js";

export const agentIngestRouter = Router();

function agentId(response: Parameters<typeof requireAgent>[1]) {
  return String(response.locals.agentId);
}

function sendAgentError(error: unknown, response: Parameters<typeof requireAgent>[1]) {
  if (error instanceof AgentPayloadError) {
    response.status(400).json({ error: error.code, message: error.message });
    return true;
  }
  if (error instanceof AgentServiceError) {
    response.status(error.status).json({ error: error.code, message: error.message });
    return true;
  }
  return false;
}

agentIngestRouter.post("/register", (request, response, next) => {
  try {
    response.setHeader("Cache-Control", "no-store");
    response.status(201).json(registerAgent(parseAgentRegistration(request.body)));
  } catch (error) {
    if (!sendAgentError(error, response)) next(error);
  }
});

agentIngestRouter.use(requireAgent);

agentIngestRouter.get("/status", (_request, response, next) => {
  try {
    response.json(getAgentStatusPayload(agentId(response)));
  } catch (error) {
    if (!sendAgentError(error, response)) next(error);
  }
});

agentIngestRouter.post("/heartbeat", (request, response, next) => {
  try {
    response.json(recordAgentHeartbeat(agentId(response), parseAgentHeartbeat(request.body)));
  } catch (error) {
    if (!sendAgentError(error, response)) next(error);
  }
});

agentIngestRouter.post("/inventory", (request, response, next) => {
  try {
    response.json(recordAgentInventory(agentId(response), parseAgentInventory(request.body)));
  } catch (error) {
    if (!sendAgentError(error, response)) next(error);
  }
});

agentIngestRouter.post("/metrics", (request, response, next) => {
  try {
    response.json(recordAgentMetrics(agentId(response), parseAgentMetrics(request.body)));
  } catch (error) {
    if (!sendAgentError(error, response)) next(error);
  }
});

agentIngestRouter.post("/docker", (request, response, next) => {
  try {
    response.json(recordAgentDocker(agentId(response), parseAgentDocker(request.body)));
  } catch (error) {
    if (!sendAgentError(error, response)) next(error);
  }
});
