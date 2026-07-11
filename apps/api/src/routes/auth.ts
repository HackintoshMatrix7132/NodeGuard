import { Router } from "express";

import { authenticateUser, createSession, destroySession, getSessionUser } from "../services/authService.js";

export const authRouter = Router();

authRouter.get("/me", (request, response) => {
  const user = getSessionUser(request);
  response.json({
    authenticated: Boolean(user),
    user
  });
});

authRouter.post("/login", (request, response) => {
  const username = typeof request.body?.username === "string" ? request.body.username.trim() : "";
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  const rememberMe = request.body?.rememberMe === true;

  if (!username || !password) {
    response.status(400).json({ error: "missing_credentials", message: "Enter your username and password." });
    return;
  }

  const user = authenticateUser(username, password);
  if (!user) {
    response.status(401).json({ error: "invalid_credentials", message: "Invalid username or password." });
    return;
  }

  createSession(request, response, user.id, rememberMe);
  response.json({
    authenticated: true,
    user
  });
});

authRouter.post("/logout", (request, response) => {
  destroySession(request, response);
  response.json({ ok: true });
});
