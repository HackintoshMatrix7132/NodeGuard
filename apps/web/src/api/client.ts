import { ApiError } from "./errors";

export type ApiConfig = {
  backendUrl: string;
  apiKey: string;
};

export function normalizeBackendUrl(value: string) {
  const trimmed = value.trim();
  const parsed = new URL(trimmed);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ApiError("Use http:// or https:// for the backend URL.");
  }

  return parsed.toString().replace(/\/$/, "");
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
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${normalizeBackendUrl(config.backendUrl)}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...init.headers
      }
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
      throw new ApiError("Backend request timed out.");
    }

    throw new ApiError("Backend is unreachable.");
  } finally {
    clearTimeout(timeout);
  }
}
