import { useLocalSearchParams } from "expo-router";
import { Activity, Boxes, Network, Server as ServerIcon } from "lucide-react-native";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { DetailTopBar } from "@/components/DetailTopBar";
import { ErrorState } from "@/components/ErrorState";
import { InfoRow } from "@/components/InfoRow";
import { LoadingBlock } from "@/components/LoadingBlock";
import { MetricCard } from "@/components/MetricCard";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { StatusPill } from "@/components/StatusPill";
import { SummaryTile } from "@/components/SummaryTile";
import { colors, radius, spacing } from "@/constants/theme";
import { useContainers, useServer, useServerMetrics } from "@/hooks/useNodeGuardQueries";
import { formatDateTime, formatUptime } from "@/utils/format";
import { getHealthStatusStyle } from "@/utils/status";

export default function ServerDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const serverId = typeof params.id === "string" ? params.id : "local-node";
  const server = useServer(serverId);
  const metrics = useServerMetrics(serverId);
  const containers = useContainers();

  const isLoading = server.isLoading || metrics.isLoading || containers.isLoading;
  const isRefreshing = server.isRefetching || metrics.isRefetching || containers.isRefetching;
  const error = server.error || metrics.error || containers.error;

  const onRefresh = async () => {
    await Promise.all([server.refetch(), metrics.refetch(), containers.refetch()]);
  };

  if (isLoading) {
    return (
      <Screen>
        <DetailTopBar eyebrow="Server" title="Loading" />
        <LoadingBlock />
      </Screen>
    );
  }

  if (error || !server.data || !metrics.data || !containers.data) {
    return (
      <Screen>
        <DetailTopBar eyebrow="Server" title="Unavailable" />
        <ErrorState
          message={error instanceof Error ? error.message : "The mocked API could not load this server."}
          onRetry={onRefresh}
        />
      </Screen>
    );
  }

  const status = getHealthStatusStyle(server.data.status);
  const unhealthyContainers = containers.data.filter((container) => container.health === "unhealthy").length;

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <DetailTopBar eyebrow="Server" title={server.data.name} subtitle={server.data.hostname} />

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardLabel}>Current state</Text>
              <Text style={styles.cardTitle}>{status.label}</Text>
            </View>
            <StatusPill {...status} />
          </View>
          <InfoRow label="OS" value={server.data.os} />
          <InfoRow label="Kernel" value={server.data.kernel} />
          <InfoRow label="Uptime" value={formatUptime(server.data.uptimeSeconds)} />
          <InfoRow label="Docker" value={server.data.dockerVersion} />
          <InfoRow label="Last checked" value={formatDateTime(server.data.lastCheckedAt)} />
        </View>

        <View style={styles.summaryGrid}>
          <SummaryTile
            label="Containers"
            value={`${server.data.runningContainers}/${server.data.runningContainers + server.data.stoppedContainers}`}
            detail="running"
            icon={Boxes}
            tone={unhealthyContainers > 0 ? "warning" : "healthy"}
          />
          <SummaryTile
            label="Load"
            value={metrics.data.cpu.loadAverage.toFixed(2)}
            detail="1 minute"
            icon={Activity}
            tone="blue"
          />
          <SummaryTile
            label="Network"
            value={`${metrics.data.network.downloadMbps.toFixed(1)}`}
            detail="Mbps down"
            icon={Network}
            tone="accent"
          />
          <SummaryTile
            label="Host"
            value="1"
            detail="local server"
            icon={ServerIcon}
            tone="healthy"
          />
        </View>

        <SectionHeader title="Resource Usage" />
        <View style={styles.metricStack}>
          <MetricCard
            label="CPU"
            value={metrics.data.cpu.usagePercent}
            detail={`Load average ${metrics.data.cpu.loadAverage.toFixed(2)}`}
          />
          <MetricCard
            label="RAM"
            value={metrics.data.memory.usagePercent}
            detail={`${metrics.data.memory.usedGb.toFixed(1)} GB of ${metrics.data.memory.totalGb} GB`}
          />
          <MetricCard
            label="Disk"
            value={metrics.data.disk.usagePercent}
            detail={`${metrics.data.disk.usedGb} GB of ${metrics.data.disk.totalGb} GB`}
          />
          <MetricCard
            label="Swap"
            value={metrics.data.swap.usagePercent}
            detail={`${metrics.data.swap.usedGb.toFixed(1)} GB of ${metrics.data.swap.totalGb} GB`}
          />
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
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.lg,
    paddingBottom: spacing.sm
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800"
  },
  cardTitle: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900"
  },
  summaryGrid: {
    marginTop: spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  metricStack: {
    gap: spacing.md
  }
});
