import { create } from "zustand";

import type { AuthUser, BackendConfig } from "../types/nodeguard";

const storageKey = "nodeguard.backend";
const preferencesKey = "nodeguard.preferences";

function readPreferences() {
  if (typeof localStorage === "undefined") return {};
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

function migrateDevBackendUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.port === "5173") {
      parsed.port = "3000";
      return parsed.toString().replace(/\/$/, "");
    }
  } catch {
    return value;
  }

  return value;
}

type SettingsState = {
  backendConfig: BackendConfig | null;
  refreshIntervalSeconds: number;
  demoMode: boolean;
  hideSensitiveValues: boolean;
  sidebarDesktopCollapsed: boolean;
  load: () => void;
  saveSession: (backendUrl: string, user: AuthUser) => void;
  disconnect: () => void;
  setRefreshIntervalSeconds: (value: number) => void;
  setHideSensitiveValues: (value: boolean) => void;
  setSidebarDesktopCollapsed: (value: boolean) => void;
};

const initialPreferences = readPreferences();

export const useSettingsStore = create<SettingsState>((set) => ({
  backendConfig: null,
  refreshIntervalSeconds: 1,
  demoMode: false,
  hideSensitiveValues: true,
  sidebarDesktopCollapsed: typeof initialPreferences.sidebarDesktopCollapsed === "boolean" ? initialPreferences.sidebarDesktopCollapsed : false,
  load: () => {
    const raw = localStorage.getItem(storageKey);
    const preferencesRaw = localStorage.getItem(preferencesKey);
    const nextState: Partial<SettingsState> = {};

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<BackendConfig>;
        if (parsed.backendUrl && parsed.user?.username) {
          const migrated = { ...parsed, backendUrl: migrateDevBackendUrl(parsed.backendUrl) } as BackendConfig;
          nextState.backendConfig = migrated;
          nextState.demoMode = migrated.user.dataMode === "demo";
          if (migrated.backendUrl !== parsed.backendUrl) {
            localStorage.setItem(storageKey, JSON.stringify(migrated));
          }
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch {
        localStorage.removeItem(storageKey);
      }
    }

    if (preferencesRaw) {
      try {
        const parsed = JSON.parse(preferencesRaw) as Partial<Pick<SettingsState, "hideSensitiveValues" | "refreshIntervalSeconds" | "sidebarDesktopCollapsed">>;
        nextState.hideSensitiveValues = parsed.hideSensitiveValues ?? true;
        nextState.refreshIntervalSeconds = parsed.refreshIntervalSeconds ?? 1;
        nextState.sidebarDesktopCollapsed = typeof parsed.sidebarDesktopCollapsed === "boolean" ? parsed.sidebarDesktopCollapsed : false;
      } catch {
        localStorage.removeItem(preferencesKey);
      }
    }

    set(nextState);
  },
  saveSession: (backendUrl, user) => {
    const backendConfig = {
      backendUrl,
      user,
      connectedAt: new Date().toISOString()
    };
    localStorage.setItem(storageKey, JSON.stringify(backendConfig));
    set({ backendConfig, demoMode: user.dataMode === "demo" });
  },
  disconnect: () => {
    localStorage.removeItem(storageKey);
    set({ backendConfig: null, demoMode: false });
  },
  setRefreshIntervalSeconds: (refreshIntervalSeconds) => {
    writePreference("refreshIntervalSeconds", refreshIntervalSeconds);
    set({ refreshIntervalSeconds });
  },
  setHideSensitiveValues: (hideSensitiveValues) => {
    writePreference("hideSensitiveValues", hideSensitiveValues);
    set({ hideSensitiveValues });
  },
  setSidebarDesktopCollapsed: (sidebarDesktopCollapsed) => {
    writePreference("sidebarDesktopCollapsed", sidebarDesktopCollapsed);
    set({ sidebarDesktopCollapsed });
  }
}));
