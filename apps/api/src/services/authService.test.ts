import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";

process.env.DATABASE_URL = ":memory:";
process.env.NODE_ENV = "production";
process.env.NODEGUARD_ADMIN_USERNAME = "admin";
process.env.NODEGUARD_ADMIN_PASSWORD = "nodeguard";
process.env.SESSION_COOKIE_SECURE = "auto";

const authService = await import("./authService.js");

function cookieResponse() {
  let cookie = "";
  const response = {
    setHeader(name: string, value: string) {
      if (name.toLowerCase() === "set-cookie") cookie = value;
    }
  } as unknown as Response;
  return { response, getCookie: () => cookie };
}

test("production owner credentials are created from the environment", () => {
  authService.ensureAdminUser();
  const user = authService.authenticateUser("admin", "nodeguard");
  assert.equal(user?.username, "admin");
});

test("automatic session cookies follow direct HTTP and trusted HTTPS requests", () => {
  const user = authService.authenticateUser("admin", "nodeguard");
  assert.ok(user);

  const http = cookieResponse();
  authService.createSession({ secure: false } as Request, http.response, user.id);
  assert.doesNotMatch(http.getCookie(), /; Secure/);

  const https = cookieResponse();
  authService.createSession({ secure: true } as Request, https.response, user.id);
  assert.match(https.getCookie(), /; Secure/);
});
