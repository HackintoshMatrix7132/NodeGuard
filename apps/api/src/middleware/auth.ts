import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";
import { getSessionUser, type AuthUser } from "../services/authService.js";

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

export function hasValidApiKey(request: Request) {
  const providedKey = readApiKey(request);
  return Boolean(providedKey && env.apiKey && apiKeysMatch(providedKey, env.apiKey));
}

function setAuthenticatedUser(response: Response, user: AuthUser | null, dataMode: "live" | "demo") {
  response.locals.authUser = user;
  response.locals.dataMode = dataMode;
}

export function requireAuthenticated(request: Request, response: Response, next: NextFunction) {
  const providedKey = readApiKey(request);
  if (providedKey) {
    if (hasValidApiKey(request)) {
      setAuthenticatedUser(response, null, "live");
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

  setAuthenticatedUser(response, user, user.dataMode);
  next();
}

export function requireLiveDataAccess(_request: Request, response: Response, next: NextFunction) {
  if (response.locals.dataMode === "demo") {
    response.status(403).json({
      error: "demo_data_only",
      message: "This account is restricted to isolated Demo Mode data."
    });
    return;
  }

  next();
}

export function requireOwner(request: Request, response: Response, next: NextFunction) {
  const user = response.locals.authUser as AuthUser | null | undefined ?? getSessionUser(request);
  if (!user) {
    response.status(401).json({ error: "not_authenticated", message: "Sign in to NodeGuard." });
    return;
  }

  if (user.dataMode !== "live" || (user.role !== "owner" && user.role !== "admin")) {
    response.status(403).json({ error: "owner_required", message: "Owner or admin access is required." });
    return;
  }

  next();
}
