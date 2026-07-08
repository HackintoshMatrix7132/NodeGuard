import { useLocalSearchParams } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { DetailTopBar } from "@/components/DetailTopBar";
import { ErrorState } from "@/components/ErrorState";
import { InfoRow } from "@/components/InfoRow";
import { LoadingBlock } from "@/components/LoadingBlock";
import { MetricCard } from "@/components/MetricCard";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { StatusPill } from "@/components/StatusPill";
import { colors, radius, spacing } from "@/constants/theme";
import { useContainer } from "@/hooks/useNodeGuardQueries";
import { formatDateTime, formatMemory } from "@/utils/format";
import { getContainerHealthStyle, getContainerStatusStyle } from "@/utils/status";

export default function ContainerDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const containerId = typeof params.id === "string" ? params.id : "";
  const container = useContainer(containerId);

  if (container.isLoading) {
    return (
      <Screen>
        <DetailTopBar eyebrow="Container" title="Loading" />
        <LoadingBlock />
      </Screen>
    );
  }

  if (container.error || !container.data) {
    return (
      <Screen>
        <DetailTopBar eyebrow="Container" title="Unavailable" />
        <ErrorState
          message={container.error instanceof Error ? container.error.message : "The mocked API could not load this container."}
          onRetry={() => void container.refetch()}
        />
      </Screen>
    );
  }

  const status = getContainerStatusStyle(container.data.status);
  const health = getContainerHealthStyle(container.data.health);
  const memoryPercent =
    container.data.memoryLimitMb > 0 ? (container.data.memoryMb / container.data.memoryLimitMb) * 100 : 0;

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={container.isRefetching} onRefresh={() => void container.refetch()} tintColor={colors.accent} />
        }
      >
        <DetailTopBar eyebrow="Container" title={container.data.name} subtitle={container.data.image} />

        <View style={styles.card}>
          <View style={styles.pillRow}>
            <StatusPill {...status} />
            <StatusPill {...health} />
          </View>
          <InfoRow label="Image" value={container.data.image} />
          <InfoRow label="Uptime" value={container.data.uptime} />
          <InfoRow label="Started" value={formatDateTime(container.data.startedAt)} />
          <InfoRow label="Restart policy" value={container.data.restartPolicy} />
          <InfoRow label="Ports" value={container.data.ports.length > 0 ? container.data.ports.join(", ") : "No exposed ports"} />
        </View>

        <SectionHeader title="Usage" />
        <View style={styles.metricStack}>
          <MetricCard label="CPU" value={container.data.cpuPercent} detail="container CPU share" />
          <MetricCard label="Memory" value={memoryPercent} detail={formatMemory(container.data.memoryMb, container.data.memoryLimitMb)} />
        </View>

        <SectionHeader title="Recent Logs" action={`${container.data.logs.length} lines`} />
        <View style={styles.logCard}>
          {container.data.logs.map((line) => (
            <Text key={line} style={styles.logLine}>
              {line}
            </Text>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderTopWidth: 3,
    borderColor: colors.border,
    borderTopColor: colors.blue,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingBottom: spacing.sm
  },
  metricStack: {
    gap: spacing.md
  },
  logCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelHeader,
    padding: spacing.md,
    gap: spacing.sm
  },
  logLine: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600"
  }
});
