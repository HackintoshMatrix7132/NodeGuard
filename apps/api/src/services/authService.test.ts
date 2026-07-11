import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";

process.env.DATABASE_URL = ":memory:";
process.env.NODE_ENV = "production";
process.env.NODEGUARD_ADMIN_USERNAME = "admin";
process.env.NODEGUARD_ADMIN_PASSWORD = "nodeguard";
process.env.NODEGUARD_DEMO_USERNAME = "demo";
process.env.NODEGUARD_DEMO_PASSWORD = "demo";
process.env.SESSION_COOKIE_SECURE = "auto";

const authService = await import("./authService.js");
const authMiddleware = await import("../middleware/auth.js");

function cookieResponse() {
  let cookie = "";
  const response = {
    setHeader(name: string, value: string) {
      if (name.toLowerCase() === "set-cookie") cookie = value;
    }
  } as unknown as Response;
  return { response, getCookie: () => cookie };
}

function requestWithCookie(cookie: string, secure = false) {
  return {
    secure,
    header(name: string) {
      return name.toLowerCase() === "cookie" ? cookie : undefined;
    }
  } as Request;
}

test("environment-backed admin and demo accounts are created with fixed data modes", () => {
  authService.ensureAdminUser();

  const admin = authService.authenticateUser("admin", "nodeguard");
  assert.equal(admin?.username, "admin");
  assert.equal(admin?.role, "owner");
  assert.equal(admin?.dataMode, "live");

  const demo = authService.authenticateUser("demo", "demo");
  assert.equal(demo?.username, "demo");
  assert.equal(demo?.role, "viewer");
  assert.equal(demo?.dataMode, "demo");
});

test("session cookies are browser-session cookies unless remember me is selected", () => {
  const admin = authService.authenticateUser("admin", "nodeguard");
  assert.ok(admin);

  const browserSession = cookieResponse();
  authService.createSession({ secure: false } as Request, browserSession.response, admin.id, false);
  assert.doesNotMatch(browserSession.getCookie(), /Max-Age=/);
  assert.doesNotMatch(browserSession.getCookie(), /; Secure/);

  const remembered = cookieResponse();
  authService.createSession({ secure: true } as Request, remembered.response, admin.id, true);
  assert.match(remembered.getCookie(), /Max-Age=/);
  assert.match(remembered.getCookie(), /; Secure/);
});

test("session lookup returns the server-owned data mode", () => {
  const demo = authService.authenticateUser("demo", "demo");
  assert.ok(demo);

  const session = cookieResponse();
  authService.createSession({ secure: false } as Request, session.response, demo.id, false);
  const cookie = session.getCookie().split(";")[0];
  const user = authService.getSessionUser(requestWithCookie(cookie));
  assert.equal(user?.dataMode, "demo");
});

test("demo sessions cannot cross the live infrastructure boundary", () => {
  let statusCode = 0;
  let body: unknown;
  let continued = false;
  const response = {
    locals: { dataMode: "demo" },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    }
  } as unknown as Response;

  authMiddleware.requireLiveDataAccess({} as Request, response, (() => {
    continued = true;
  }) as NextFunction);

  assert.equal(statusCode, 403);
  assert.equal(continued, false);
  assert.deepEqual(body, {
    error: "demo_data_only",
    message: "This account is restricted to isolated Demo Mode data."
  });
});

test("live sessions pass the infrastructure boundary", () => {
  let continued = false;
  const response = { locals: { dataMode: "live" } } as unknown as Response;
  authMiddleware.requireLiveDataAccess({} as Request, response, (() => {
    continued = true;
  }) as NextFunction);
  assert.equal(continued, true);
});
