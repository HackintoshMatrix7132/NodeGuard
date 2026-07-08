import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";

export function readApiKey(request: Request) {
  const authorization = request.header("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return request.header("x-api-key")?.trim() ?? "";
}

export function requireApiKey(request: Request, response: Response, next: NextFunction) {
  const providedKey = readApiKey(request);

  if (!providedKey) {
    response.status(401).json({ error: "missing_api_key", message: "Missing API key." });
    return;
  }

  if (!env.apiKey || providedKey !== env.apiKey) {
    response.status(403).json({ error: "invalid_api_key", message: "Invalid API key." });
    return;
  }

  next();
}
