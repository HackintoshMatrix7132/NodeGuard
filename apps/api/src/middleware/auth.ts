import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";
import { getSessionUser } from "../services/authService.js";

export function readApiKey(request: Request) {
  const authorization = request.header("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return request.header("x-api-key")?.trim() ?? "";
}

function apiKeysMatch(providedKey: string, expectedKey: string) {
  const provided = Buffer.from(providedKey);
  const expected = Buffer.from(expectedKey);
  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}

export function requireApiKey(request: Request, response: Response, next: NextFunction) {
  const providedKey = readApiKey(request);

  if (!providedKey) {
    response.status(401).json({ error: "missing_api_key", message: "Missing API key." });
    return;
  }

  if (!env.apiKey || !apiKeysMatch(providedKey, env.apiKey)) {
    response.status(403).json({ error: "invalid_api_key", message: "Invalid API key." });
    return;
  }

  next();
}

export function hasValidApiKey(request: Request) {
  const providedKey = readApiKey(request);
  return Boolean(providedKey && env.apiKey && apiKeysMatch(providedKey, env.apiKey));
}

export function requireAuthenticated(request: Request, response: Response, next: NextFunction) {
  const providedKey = readApiKey(request);
  if (providedKey) {
    if (hasValidApiKey(request)) {
      next();
      return;
    }

    response.status(403).json({ error: "invalid_api_key", message: "Invalid API key." });
    return;
  }

  const user = getSessionUser(request);
  if (!user) {
    response.status(401).json({ error: "not_authenticated", message: "Sign in to NodeGuard." });
    return;
  }

  next();
}
