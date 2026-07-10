import type { ErrorRequestHandler } from "express";

import { env } from "../config/env.js";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const httpError = error as Error & { status?: number; code?: string; expose?: boolean };
  const status = typeof httpError.status === "number" && httpError.status >= 400 && httpError.status < 600 ? httpError.status : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  response.status(status).json({
    error: httpError.code ?? "internal_error",
    message: env.isProduction && !httpError.expose ? "Unexpected server error." : message
  });
};
