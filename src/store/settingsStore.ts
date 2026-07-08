import { Platform } from "react-native";
import { create } from "zustand";

import type { BackendConfig } from "@/types/nodeguard";

type SettingsState = {
  backendConfig: BackendConfig | null;
  refreshIntervalSeconds: number;
  hideSensitiveData: boolean;
  criticalServices: string[];
  hasHydrated: boolean;
  hydrate: () => Promise<void>;
  saveConnection: (backendUrl: string, apiKey: string) => Promise<void>;
  disconnect: () => Promise<void>;
  setRefreshIntervalSeconds: (seconds: number) => void;
  setHideSensitiveData: (enabled: boolean) => void;
  toggleCriticalService: (service: string) => void;
};

const backendUrlKey = "nodeguard.backendUrl";
const apiKeyKey = "nodeguard.apiKey";

const maskApiKey = (apiKey: string) => {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 4) {
    return "****";
  }

  return `****${trimmed.slice(-4)}`;
};

async function getSecureStore() {
  if (Platform.OS === "web") {
    return null;
  }

  const SecureStore = await import("expo-secure-store");
  const available = await SecureStore.isAvailableAsync();
  if (!available) {
    return null;
  }

  return SecureStore;
}

async function getSecureValue(key: string) {
  const SecureStore = await getSecureStore();
  if (!SecureStore) {
    return null;
  }

  return SecureStore.getItemAsync(key);
}

async function setSecureValue(key: string, value: string) {
  const SecureStore = await getSecureStore();
  if (!SecureStore) {
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function deleteSecureValue(key: string) {
  const SecureStore = await getSecureStore();
  if (!SecureStore) {
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  backendConfig: null,
  refreshIntervalSeconds: 60,
  hideSensitiveData: false,
  criticalServices: ["nodeguard-api", "nginx-proxy-manager", "vaultwarden", "postgres"],
  hasHydrated: false,
  hydrate: async () => {
    try {
      const backendUrl = await getSecureValue(backendUrlKey);
      const apiKey = await getSecureValue(apiKeyKey);

      if (backendUrl && apiKey) {
        set({
          backendConfig: {
            backendUrl,
            apiKeyPreview: maskApiKey(apiKey),
            connectedAt: new Date().toISOString()
          }
        });
      }
    } finally {
      set({ hasHydrated: true });
    }
  },
  saveConnection: async (backendUrl, apiKey) => {
    await setSecureValue(backendUrlKey, backendUrl.trim());
    await setSecureValue(apiKeyKey, apiKey.trim());

    set({
      backendConfig: {
        backendUrl: backendUrl.trim(),
        apiKeyPreview: maskApiKey(apiKey),
        connectedAt: new Date().toISOString()
      }
    });
  },
  disconnect: async () => {
    await deleteSecureValue(backendUrlKey);
    await deleteSecureValue(apiKeyKey);
    set({ backendConfig: null });
  },
  setRefreshIntervalSeconds: (seconds) => set({ refreshIntervalSeconds: seconds }),
  setHideSensitiveData: (enabled) => set({ hideSensitiveData: enabled }),
  toggleCriticalService: (service) => {
    const current = get().criticalServices;

    set({
      criticalServices: current.includes(service)
        ? current.filter((item) => item !== service)
        : [...current, service]
    });
  }
}));
