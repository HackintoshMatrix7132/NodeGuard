import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  response.status(500).json({
    error: "internal_error",
    message
  });
};
