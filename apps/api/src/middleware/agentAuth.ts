import type { NextFunction, Request, Response } from "express";

import { AgentServiceError, authenticateAgent } from "../services/agentService.js";

function readAgentCredential(request: Request) {
  const authorization = request.header("authorization")?.trim() ?? "";
  return authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice("bearer ".length).trim()
    : "";
}

export function requireAgent(request: Request, response: Response, next: NextFunction) {
  const agentId = request.header("x-nodeguard-agent-id")?.trim() ?? "";
  const credential = readAgentCredential(request);

  if (!agentId || !credential) {
    response.status(401).json({
      error: "missing_agent_credentials",
      message: "Agent ID and bearer credential are required."
    });
    return;
  }

  try {
    const agent = authenticateAgent(agentId, credential);
    if (!agent) {
      response.status(401).json({
        error: "invalid_agent_credentials",
        message: "Agent credentials are invalid."
      });
      return;
    }

    response.locals.agentId = agent.id;
    next();
  } catch (error) {
    if (error instanceof AgentServiceError) {
      response.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    next(error);
  }
}
