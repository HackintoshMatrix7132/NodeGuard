import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/constants/theme";
import { useSettingsStore } from "@/store/settingsStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      gcTime: 1000 * 60 * 10,
      retry: 1
    }
  }
});

export default function RootLayout() {
  const hydrate = useSettingsStore((state) => state.hydrate);
  const hasHydrated = useSettingsStore((state) => state.hasHydrated);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hasHydrated) {
    return (
      <View style={styles.splash}>
        <Text style={styles.brand}>NodeGuard</Text>
        <Text style={styles.tagline}>Monitor your servers. Protect your stack.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: colors.background
            }
          }}
        />
      </QueryClientProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.background
  },
  brand: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "900"
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700"
  }
});
