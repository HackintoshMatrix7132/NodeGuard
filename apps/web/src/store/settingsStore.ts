import { create } from "zustand";

import type { BackendConfig } from "../types/nodeguard";

const storageKey = "nodeguard.backend";
const preferencesKey = "nodeguard.preferences";

function previewKey(apiKey: string) {
  if (apiKey.length <= 4) {
    return "••••";
  }

  return `••••${apiKey.slice(-4)}`;
}

function readPreferences() {
  try {
    const raw = localStorage.getItem(preferencesKey);
    return raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    localStorage.removeItem(preferencesKey);
    return {};
  }
}

function writePreference(key: string, value: unknown) {
  localStorage.setItem(preferencesKey, JSON.stringify({ ...readPreferences(), [key]: value }));
}

type SettingsState = {
  backendConfig: BackendConfig | null;
  refreshIntervalSeconds: number;
  demoMode: boolean;
  hideSensitiveValues: boolean;
  load: () => void;
  saveConnection: (backendUrl: string, apiKey: string) => void;
  disconnect: () => void;
  setRefreshIntervalSeconds: (value: number) => void;
  setDemoMode: (value: boolean) => void;
  setHideSensitiveValues: (value: boolean) => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  backendConfig: null,
  refreshIntervalSeconds: 60,
  demoMode: false,
  hideSensitiveValues: true,
  load: () => {
    const raw = localStorage.getItem(storageKey);
    const preferencesRaw = localStorage.getItem(preferencesKey);
    const nextState: Partial<SettingsState> = {};

    if (raw) {
      try {
        nextState.backendConfig = JSON.parse(raw) as BackendConfig;
      } catch {
        localStorage.removeItem(storageKey);
      }
    }

    if (preferencesRaw) {
      try {
        const parsed = JSON.parse(preferencesRaw) as Partial<Pick<SettingsState, "demoMode" | "hideSensitiveValues" | "refreshIntervalSeconds">>;
        nextState.demoMode = Boolean(parsed.demoMode);
        nextState.hideSensitiveValues = parsed.hideSensitiveValues ?? true;
        nextState.refreshIntervalSeconds = parsed.refreshIntervalSeconds ?? 60;
      } catch {
        localStorage.removeItem(preferencesKey);
      }
    }

    set(nextState);
  },
  saveConnection: (backendUrl, apiKey) => {
    const backendConfig = {
      backendUrl,
      apiKey,
      apiKeyPreview: previewKey(apiKey),
      connectedAt: new Date().toISOString()
    };
    localStorage.setItem(storageKey, JSON.stringify(backendConfig));
    set({ backendConfig });
  },
  disconnect: () => {
    localStorage.removeItem(storageKey);
    set({ backendConfig: null });
  },
  setRefreshIntervalSeconds: (refreshIntervalSeconds) => {
    writePreference("refreshIntervalSeconds", refreshIntervalSeconds);
    set({ refreshIntervalSeconds });
  },
  setDemoMode: (demoMode) => {
    writePreference("demoMode", demoMode);
    set({ demoMode });
  },
  setHideSensitiveValues: (hideSensitiveValues) => {
    writePreference("hideSensitiveValues", hideSensitiveValues);
    set({ hideSensitiveValues });
  }
}));
