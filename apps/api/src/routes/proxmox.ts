import { Router, type Request, type Response } from "express";
import {
  createProxmoxConnection,
  deleteProxmoxConnection,
  getDemoProxmoxSnapshot,
  getProxmoxSnapshot,
  listProxmoxConnections,
  setProxmoxConnectionEnabled,
  syncAllProxmoxConnections,
  syncProxmoxConnection,
  testProxmoxConnection,
  updateProxmoxConnection,
  type ProxmoxConnectionInput
} from "../services/proxmoxService.js";

const router = Router();

function authContext(req: Request, res: Response): Record<string, unknown> {
  const request = req as Request & Record<string, unknown>;
  const candidates = [
    request.user,
    request.auth,
    request.session,
    res.locals.user,
    res.locals.auth,
    res.locals.session
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") return candidate as Record<string, unknown>;
  }
  return {};
}

function readMode(req: Request, res: Response): "demo" | "live" | "unknown" {
  const context = authContext(req, res);
  const nested = context.user && typeof context.user === "object" ? context.user as Record<string, unknown> : {};
  const value = context.dataMode ?? context.data_mode ?? context.mode ?? nested.dataMode ?? nested.data_mode;
  return value === "demo" ? "demo" : value === "live" ? "live" : "unknown";
}

function requireLive(req: Request, res: Response): boolean {
  if (readMode(req, res) === "demo") {
    res.status(403).json({ error: "Proxmox integration settings are unavailable in Demo Mode." });
    return false;
  }
  return true;
}

function inputFromBody(body: unknown): ProxmoxConnectionInput {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  return {
    name: typeof value.name === "string" ? value.name : "",
    baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : "",
    tokenUser: typeof value.tokenUser === "string" ? value.tokenUser : "",
    tokenId: typeof value.tokenId === "string" ? value.tokenId : "",
    ...(typeof value.tokenSecret === "string" && value.tokenSecret.trim() ? { tokenSecret: value.tokenSecret } : {}),
    ...(typeof value.customCa === "string" ? { customCa: value.customCa || null } : {}),
    ...(typeof value.enabled === "boolean" ? { enabled: value.enabled } : {})
  };
}

function errorResponse(res: Response, error: unknown, fallback: string): void {
  const message = error instanceof Error ? error.message : fallback;
  const status = /not found/i.test(message) ? 404 : /required|valid|must|HTTPS/i.test(message) ? 400 : 502;
  res.status(status).json({ error: message });
}

router.get("/", (req, res) => {
  res.json(readMode(req, res) === "demo" ? getDemoProxmoxSnapshot() : getProxmoxSnapshot());
});

router.get("/connections", (req, res) => {
  if (!requireLive(req, res)) return;
  res.json({ connections: listProxmoxConnections() });
});

router.post("/connections/test", async (req, res) => {
  if (!requireLive(req, res)) return;
  try {
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    res.json(await testProxmoxConnection(inputFromBody(body), typeof body.id === "string" ? body.id : undefined));
  } catch (error) {
    errorResponse(res, error, "Unable to test the Proxmox connection.");
  }
});

router.post("/connections", async (req, res) => {
  if (!requireLive(req, res)) return;
  try {
    res.status(201).json(await createProxmoxConnection(inputFromBody(req.body)));
  } catch (error) {
    errorResponse(res, error, "Unable to save the Proxmox connection.");
  }
});

router.put("/connections/:id", async (req, res) => {
  if (!requireLive(req, res)) return;
  try {
    res.json(await updateProxmoxConnection(req.params.id, inputFromBody(req.body)));
  } catch (error) {
    errorResponse(res, error, "Unable to update the Proxmox connection.");
  }
});

router.patch("/connections/:id/enabled", (req, res) => {
  if (!requireLive(req, res)) return;
  try {
    if (typeof req.body?.enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean." });
      return;
    }
    res.json(setProxmoxConnectionEnabled(req.params.id, req.body.enabled));
  } catch (error) {
    errorResponse(res, error, "Unable to change the Proxmox connection state.");
  }
});

router.post("/connections/:id/sync", async (req, res) => {
  if (!requireLive(req, res)) return;
  try {
    await syncProxmoxConnection(req.params.id);
    res.json(getProxmoxSnapshot());
  } catch (error) {
    errorResponse(res, error, "Unable to synchronize the Proxmox connection.");
  }
});

router.post("/sync", async (req, res) => {
  if (!requireLive(req, res)) return;
  await syncAllProxmoxConnections();
  res.json(getProxmoxSnapshot());
});

router.delete("/connections/:id", (req, res) => {
  if (!requireLive(req, res)) return;
  if (!deleteProxmoxConnection(req.params.id)) {
    res.status(404).json({ error: "Proxmox connection was not found." });
    return;
  }
  res.json({ success: true });
});

export const proxmoxRouter = router;
export default router;
