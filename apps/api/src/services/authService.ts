import crypto from "node:crypto";
import type { Request, Response } from "express";

import { env } from "../config/env.js";
import { getDatabase } from "./database.js";

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
};

export type AuthUser = {
  id: string;
  username: string;
  role: string;
};

const developmentPassword = "nodeguard";
const scryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function nowIso() {
  return new Date().toISOString();
}

function futureIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: Buffer, b: Buffer) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function passwordHash(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const key = crypto.scryptSync(password, salt, 64, scryptOptions).toString("base64url");
  return `scrypt$${scryptOptions.N}$${scryptOptions.r}$${scryptOptions.p}$${salt}$${key}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [scheme, n, r, p, salt, expectedKey] = storedHash.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !expectedKey) {
    return false;
  }

  const key = crypto.scryptSync(password, salt, 64, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024
  }).toString("base64url");

  return safeEqual(Buffer.from(key), Buffer.from(expectedKey));
}

function publicUser(row: Pick<UserRow, "id" | "username" | "role">): AuthUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role
  };
}

function readCookies(request: Request) {
  const cookieHeader = request.header("cookie") ?? "";
  return Object.fromEntries(cookieHeader.split(";").map((part) => {
    const [rawName, ...rawValue] = part.trim().split("=");
    return [rawName, decodeURIComponent(rawValue.join("="))];
  }).filter(([name]) => Boolean(name)));
}

function serializeCookie(name: string, value: string, maxAgeSeconds: number) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ];

  if (env.isProduction) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function ensureAdminUser() {
  const database = getDatabase();
  const username = env.adminUsername.trim() || "admin";
  const existingAdmin = database.prepare("SELECT * FROM users WHERE lower(username) = lower(?)").get(username) as UserRow | undefined;

  if (existingAdmin) {
    if (env.adminPassword && !verifyPassword(env.adminPassword, existingAdmin.password_hash)) {
      database.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(passwordHash(env.adminPassword), nowIso(), existingAdmin.id);
      database.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(existingAdmin.id);
    }
    return;
  }

  const existing = database.prepare("SELECT id FROM users LIMIT 1").get() as { id: string } | undefined;
  if (existing) {
    return;
  }

  const password = env.adminPassword || developmentPassword;

  if (env.isProduction && !env.adminPassword) {
    throw new Error("NODEGUARD_ADMIN_PASSWORD is required when NODE_ENV=production.");
  }

  if (!env.isProduction && !env.adminPassword) {
    console.warn("NodeGuard development login created with username 'admin' and password 'nodeguard'. Set NODEGUARD_ADMIN_PASSWORD to override it.");
  }

  const timestamp = nowIso();
  database.prepare(`
    INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
    VALUES (@id, @username, @passwordHash, 'owner', @createdAt, @updatedAt)
  `).run({
    id: crypto.randomUUID(),
    username,
    passwordHash: passwordHash(password),
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export function authenticateUser(username: string, password: string) {
  const database = getDatabase();
  const user = database.prepare("SELECT * FROM users WHERE lower(username) = lower(?)").get(username.trim()) as UserRow | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    return null;
  }

  return publicUser(user);
}

export function createSession(response: Response, userId: string) {
  const database = getDatabase();
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha256(token);
  const timestamp = nowIso();
  const expiresAt = futureIso(env.sessionDurationDays);

  database.prepare(`
    INSERT INTO user_sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at)
    VALUES (@id, @userId, @tokenHash, @createdAt, @expiresAt, @lastSeenAt)
  `).run({
    id: crypto.randomUUID(),
    userId,
    tokenHash,
    createdAt: timestamp,
    expiresAt,
    lastSeenAt: timestamp
  });

  response.setHeader("Set-Cookie", serializeCookie(env.sessionCookieName, token, env.sessionDurationDays * 24 * 60 * 60));
}

export function getSessionUser(request: Request) {
  const token = readCookies(request)[env.sessionCookieName];
  if (!token) {
    return null;
  }

  const database = getDatabase();
  const tokenHash = sha256(token);
  const row = database.prepare(`
    SELECT users.id, users.username, users.role, user_sessions.id AS session_id, user_sessions.expires_at
    FROM user_sessions
    JOIN users ON users.id = user_sessions.user_id
    WHERE user_sessions.token_hash = ?
  `).get(tokenHash) as (UserRow & SessionRow & { session_id: string }) | undefined;

  if (!row) {
    return null;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    database.prepare("DELETE FROM user_sessions WHERE id = ?").run(row.session_id);
    return null;
  }

  database.prepare("UPDATE user_sessions SET last_seen_at = ? WHERE id = ?").run(nowIso(), row.session_id);
  return publicUser(row);
}

export function destroySession(request: Request, response: Response) {
  const token = readCookies(request)[env.sessionCookieName];
  if (token) {
    getDatabase().prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(sha256(token));
  }

  response.setHeader("Set-Cookie", serializeCookie(env.sessionCookieName, "", 0));
}

export function cleanupExpiredSessions() {
  getDatabase().prepare("DELETE FROM user_sessions WHERE expires_at <= ?").run(nowIso());
}
