import type { ErrorRequestHandler } from "express";

import { env } from "../config/env.js";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  response.status(500).json({
    error: "internal_error",
    message: env.isProduction ? "Unexpected server error." : message
  });
};
