import { router } from "expo-router";
import { LogOut, Shield } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { Header } from "@/components/Header";
import { InfoRow } from "@/components/InfoRow";
import { Screen } from "@/components/Screen";
import { colors, radius, spacing } from "@/constants/theme";
import { useSettingsStore } from "@/store/settingsStore";
import { formatDateTime } from "@/utils/format";

const refreshOptions = [30, 60, 120, 300];
const serviceOptions = ["nodeguard-api", "nginx-proxy-manager", "vaultwarden", "postgres", "photoprism"];

export default function SettingsScreen() {
  const backendConfig = useSettingsStore((state) => state.backendConfig);
  const refreshIntervalSeconds = useSettingsStore((state) => state.refreshIntervalSeconds);
  const hideSensitiveData = useSettingsStore((state) => state.hideSensitiveData);
  const criticalServices = useSettingsStore((state) => state.criticalServices);
  const setRefreshIntervalSeconds = useSettingsStore((state) => state.setRefreshIntervalSeconds);
  const setHideSensitiveData = useSettingsStore((state) => state.setHideSensitiveData);
  const toggleCriticalService = useSettingsStore((state) => state.toggleCriticalService);
  const disconnect = useSettingsStore((state) => state.disconnect);

  const onDisconnect = async () => {
    await disconnect();
    router.replace("/connect");
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <Header eyebrow="NodeGuard" title="Settings" subtitle="Local server monitoring profile." />

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconBox}>
              <Shield color={colors.accent} size={20} strokeWidth={2.2} />
            </View>
            <Text style={styles.cardTitle}>Connection</Text>
          </View>
          <InfoRow label="Backend" value={backendConfig?.backendUrl ?? "Not connected"} />
          <InfoRow label="API key" value={backendConfig?.apiKeyPreview ?? "Not saved"} />
          <InfoRow label="Connected" value={formatDateTime(backendConfig?.connectedAt ?? null)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Refresh Interval</Text>
          <View style={styles.optionGrid}>
            {refreshOptions.map((option) => {
              const selected = option === refreshIntervalSeconds;

              return (
                <Pressable
                  key={option}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => setRefreshIntervalSeconds(option)}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option}s</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.cardTitle}>Screenshot Privacy</Text>
              <Text style={styles.muted}>Hide URLs and token previews</Text>
            </View>
            <Switch
              value={hideSensitiveData}
              onValueChange={setHideSensitiveData}
              thumbColor={hideSensitiveData ? colors.accent : colors.textMuted}
              trackColor={{
                false: colors.surfaceRaised,
                true: colors.accentMuted
              }}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Critical Services</Text>
          <View style={styles.serviceStack}>
            {serviceOptions.map((service) => {
              const selected = criticalServices.includes(service);

              return (
                <Pressable
                  key={service}
                  style={[styles.serviceRow, selected && styles.serviceRowSelected]}
                  onPress={() => toggleCriticalService(service)}
                >
                  <Text style={styles.serviceName}>{service}</Text>
                  <Text style={[styles.serviceState, selected && styles.serviceStateSelected]}>
                    {selected ? "Critical" : "Normal"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable style={styles.disconnectButton} onPress={onDisconnect}>
          <LogOut color={colors.critical} size={18} strokeWidth={2.2} />
          <Text style={styles.disconnectText}>Disconnect</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentMuted
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  muted: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700"
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  option: {
    minWidth: 68,
    minHeight: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.panelHeader
  },
  optionSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blueMuted
  },
  optionText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "900"
  },
  optionTextSelected: {
    color: colors.blue
  },
  switchRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg
  },
  switchCopy: {
    flex: 1
  },
  serviceStack: {
    gap: spacing.sm
  },
  serviceRow: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelHeader,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  serviceRowSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted
  },
  serviceName: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: "800"
  },
  serviceState: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "900"
  },
  serviceStateSelected: {
    color: colors.accent
  },
  disconnectButton: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.critical,
    backgroundColor: colors.criticalMuted,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm
  },
  disconnectText: {
    color: colors.critical,
    fontSize: 14,
    fontWeight: "900"
  }
});
