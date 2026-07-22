import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("the API drains background work and closes cleanly on SIGTERM", async () => {
  const entryPoint = fileURLToPath(new URL("./index.js", import.meta.url));
  const child = spawn(process.execPath, [entryPoint], {
    env: {
      ...process.env,
      DATABASE_URL: ":memory:",
      NODE_ENV: "production",
      NODEGUARD_ADMIN_PASSWORD: "lifecycle-admin-password",
      NODEGUARD_DEMO_PASSWORD: "lifecycle-demo-password",
      NODEGUARD_HOST: "127.0.0.1",
      PORT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdout = "";
  let stderr = "";
  let signalSent = false;
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
    if (!signalSent && stdout.includes("NodeGuard API listening")) {
      signalSent = true;
      child.kill("SIGTERM");
    }
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`API lifecycle test timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 15_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });

  assert.deepEqual(result, { code: 0, signal: null }, `stderr:\n${stderr}`);
  assert.match(stdout, /received SIGTERM; shutting down/);
  assert.match(stdout, /shutdown complete/);
});
