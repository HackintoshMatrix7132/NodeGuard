import { Router } from "express";

import { requireOwner } from "../middleware/auth.js";
import {
  AgentServiceError,
  createAgentEnrollmentToken,
  deleteAgent,
  getAgent,
  getAgentEnrollmentProgress,
  listActiveEnrollmentTokens,
  listAgents,
  renameAgent,
  revokeAgent,
  revokeEnrollmentToken
} from "../services/agentService.js";

export const agentsRouter = Router();

agentsRouter.use(requireOwner);

function sendServiceError(error: unknown, response: Parameters<typeof requireOwner>[1]) {
  if (error instanceof AgentServiceError) {
    response.status(error.status).json({ error: error.code, message: error.message });
    return true;
  }
  return false;
}

agentsRouter.get("/", (_request, response) => {
  response.json({ agents: listAgents() });
});

agentsRouter.get("/enrollment-tokens", (_request, response) => {
  response.json({ tokens: listActiveEnrollmentTokens() });
});

agentsRouter.post("/enrollment-tokens", (request, response, next) => {
  try {
    response.setHeader("Cache-Control", "no-store");
    const displayName = typeof request.body?.displayName === "string" ? request.body.displayName : undefined;
    response.status(201).json(createAgentEnrollmentToken(displayName));
  } catch (error) {
    if (!sendServiceError(error, response)) next(error);
  }
});

agentsRouter.delete("/enrollment-tokens/:tokenId", (request, response) => {
  const result = revokeEnrollmentToken(request.params.tokenId);
  response.status(result.revoked ? 200 : 404).json(result.revoked
    ? result
    : { error: "enrollment_token_not_found", message: "Active enrollment token not found." });
});

agentsRouter.get("/enrollment-tokens/:tokenId/status", (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  const progress = getAgentEnrollmentProgress(request.params.tokenId);
  if (!progress) {
    response.status(404).json({ error: "enrollment_token_not_found", message: "Enrollment token not found." });
    return;
  }
  response.json(progress);
});

agentsRouter.get("/:agentId", (request, response) => {
  const agent = getAgent(request.params.agentId);
  if (!agent) {
    response.status(404).json({ error: "agent_not_found", message: "Agent not found." });
    return;
  }
  response.json(agent);
});

agentsRouter.put("/:agentId", (request, response, next) => {
  try {
    const displayName = typeof request.body?.displayName === "string" ? request.body.displayName : "";
    response.json(renameAgent(request.params.agentId, displayName));
  } catch (error) {
    if (!sendServiceError(error, response)) next(error);
  }
});

agentsRouter.post("/:agentId/rotate-credential", (request, response, next) => {
  try {
    response.setHeader("Cache-Control", "no-store");
    const agent = getAgent(request.params.agentId);
    if (!agent || agent.status === "revoked") {
      response.status(404).json({ error: "agent_not_found", message: "Active agent not found." });
      return;
    }
    response.status(201).json(createAgentEnrollmentToken(agent.displayName, "rotate", agent.id));
  } catch (error) {
    if (!sendServiceError(error, response)) next(error);
  }
});

agentsRouter.post("/:agentId/revoke", (request, response) => {
  const result = revokeAgent(request.params.agentId);
  response.status(result.revoked ? 200 : 404).json(result.revoked
    ? result
    : { error: "agent_not_found", message: "Active agent not found." });
});

agentsRouter.delete("/:agentId", (request, response, next) => {
  try {
    response.json(deleteAgent(request.params.agentId));
  } catch (error) {
    if (!sendServiceError(error, response)) next(error);
  }
});
