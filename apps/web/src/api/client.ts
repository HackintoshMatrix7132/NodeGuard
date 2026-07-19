import { ApiError } from "./errors";

export type ApiConfig = {
  backendUrl: string;
  apiKey?: string;
};

const defaultLocalApiUrl = "http://localhost:3000";

export function getDefaultBackendUrl() {
  const configuredUrl = import.meta.env.VITE_NODEGUARD_API_URL as string | undefined;
  if (configuredUrl) {
    return normalizeBackendUrl(configuredUrl);
  }

  if (window.location.port === "5173") {
    return normalizeBackendUrl(`${window.location.protocol}//${window.location.hostname}:3000`);
  }

  return window.location.origin;
}

export function normalizeBackendUrl(value: string) {
  const trimmed = value.trim();
  const parsed = new URL(trimmed);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ApiError("Use http:// or https:// for the backend URL.");
  }

  return parsed.toString().replace(/\/$/, "");
}

function apiBaseUrl(value: string) {
  const normalized = normalizeBackendUrl(value);
  const parsed = new URL(normalized);

  if (parsed.port === "5173") {
    parsed.port = "3000";
    return parsed.toString().replace(/\/$/, "");
  }

  return normalized;
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError("Backend returned invalid JSON.", response.status);
  }
}

export async function apiFetch<T>(config: ApiConfig, path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort();
  if (callerSignal?.aborted) controller.abort();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), 8000);
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    ...init.headers
  };

  try {
    const response = await fetch(`${apiBaseUrl(config.backendUrl)}${path}`, {
      ...init,
      signal: controller.signal,
      credentials: "include",
      headers
    });
    const body = await parseJson(response);

    if (!response.ok) {
      const message = typeof body === "object" && body && "message" in body ? String(body.message) : "Request failed.";
      const code = typeof body === "object" && body && "error" in body ? String(body.error) : undefined;
      throw new ApiError(message, response.status, code);
    }

    return body as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      if (callerSignal?.aborted) throw error;
      throw new ApiError("Backend request timed out.");
    }

    throw new ApiError("Backend is unreachable.");
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}
