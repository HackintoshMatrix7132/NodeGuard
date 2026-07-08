import { router } from "expo-router";
import { Boxes, Globe2, RefreshCcw, Server, ShieldAlert } from "lucide-react-native";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { AlertRow } from "@/components/AlertRow";
import { ErrorState } from "@/components/ErrorState";
import { Header } from "@/components/Header";
import { LoadingBlock } from "@/components/LoadingBlock";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { StatusPill } from "@/components/StatusPill";
import { SummaryTile } from "@/components/SummaryTile";
import { colors, radius, shadow, spacing } from "@/constants/theme";
import { useAlerts, useContainers, useDomains, useOverview, useRunChecks, useServer } from "@/hooks/useNodeGuardQueries";
import { formatRelativeTime, formatUptime } from "@/utils/format";
import { getHealthStatusStyle } from "@/utils/status";

export default function DashboardScreen() {
  const overview = useOverview();
  const server = useServer("local-node");
  const containers = useContainers();
  const domains = useDomains();
  const alerts = useAlerts();
  const runChecks = useRunChecks();

  const isLoading = overview.isLoading || server.isLoading || containers.isLoading || domains.isLoading || alerts.isLoading;
  const isRefreshing = overview.isRefetching || server.isRefetching || containers.isRefetching || domains.isRefetching || alerts.isRefetching || runChecks.isPending;
  const error = overview.error || server.error || containers.error || domains.error || alerts.error;

  const onRefresh = async () => {
    await Promise.all([
      overview.refetch(),
      server.refetch(),
      containers.refetch(),
      domains.refetch(),
      alerts.refetch()
    ]);
  };

  const onRunChecks = () => {
    runChecks.mutate();
  };

  if (isLoading) {
    return (
      <Screen>
        <Header eyebrow="NodeGuard" title="Dashboard" subtitle="Checking the local server." />
        <LoadingBlock />
      </Screen>
    );
  }

  if (error || !overview.data || !server.data || !containers.data || !domains.data || !alerts.data) {
    return (
      <Screen>
        <Header eyebrow="NodeGuard" title="Dashboard" subtitle="Last-known status could not be loaded." />
        <ErrorState
          message={error instanceof Error ? error.message : "The mocked monitoring API did not return a full dashboard response."}
          onRetry={onRefresh}
        />
      </Screen>
    );
  }

  const status = getHealthStatusStyle(overview.data.status);
  const activeAlerts = alerts.data.filter((alert) => alert.status === "active");
  const recentAlerts = alerts.data.slice(0, 3);

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <Header
          eyebrow="NodeGuard"
          title="Local server"
          subtitle={`Last checked ${formatRelativeTime(overview.data.lastCheckedAt)}`}
          actionIcon={RefreshCcw}
          onActionPress={onRunChecks}
        />

        <Pressable
          style={[styles.hero, { borderTopColor: status.color }]}
          onPress={() =>
            router.push({
              pathname: "/servers/[id]",
              params: { id: server.data.id }
            })
          }
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>Overall status</Text>
              <Text style={styles.heroStatus}>{status.label}</Text>
            </View>
            <StatusPill {...status} />
          </View>
          <Text style={styles.heroCopy}>
            {activeAlerts.length === 0
              ? "All monitored resources are passing their current checks."
              : `${activeAlerts.length} active issue${activeAlerts.length === 1 ? "" : "s"} need attention.`}
          </Text>
          <View style={styles.heroDivider} />
          <View style={styles.sparkGrid}>
            {[42, 61, 54, 70, 45, 78, 65, 83, 58, 72, 49, 66, 76, 59].map((height, index) => (
              <View
                key={index}
                style={[
                  styles.sparkBar,
                  {
                    height,
                    backgroundColor: index > 10 ? status.color : colors.blue
                  }
                ]}
              />
            ))}
          </View>
          <View style={styles.serverLine}>
            <Server color={colors.textMuted} size={18} strokeWidth={2.2} />
            <Text style={styles.serverLineText} numberOfLines={1}>
              {server.data.name} - {server.data.os} - uptime {formatUptime(server.data.uptimeSeconds)}
            </Text>
          </View>
        </Pressable>

        <View style={styles.summaryGrid}>
          <SummaryTile
            label="Server"
            value={`${overview.data.serversOnline}/${overview.data.serversTotal}`}
            detail="online"
            icon={Server}
            tone="healthy"
          />
          <SummaryTile
            label="Containers"
            value={`${overview.data.containersRunning}/${overview.data.containersTotal}`}
            detail="running"
            icon={Boxes}
            tone={overview.data.containersRunning === overview.data.containersTotal ? "healthy" : "warning"}
          />
          <SummaryTile
            label="Domains"
            value={`${overview.data.domainsOnline}/${overview.data.domainsTotal}`}
            detail="reachable"
            icon={Globe2}
            tone={overview.data.domainsOnline === overview.data.domainsTotal ? "healthy" : "warning"}
          />
          <SummaryTile
            label="Alerts"
            value={`${overview.data.criticalAlerts}`}
            detail={`${overview.data.warnings} warnings`}
            icon={ShieldAlert}
            tone={overview.data.criticalAlerts > 0 ? "critical" : "blue"}
          />
        </View>

        <SectionHeader title="Recent Alerts" action={`${recentAlerts.length} latest`} />
        <View style={styles.stack}>
          {recentAlerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onPress={() =>
                router.push({
                  pathname: "/alerts/[id]",
                  params: { id: alert.id }
                })
              }
            />
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
  hero: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderTopWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
    ...shadow
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.lg
  },
  heroLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800"
  },
  heroStatus: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "900"
  },
  heroCopy: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600"
  },
  heroDivider: {
    height: 1,
    backgroundColor: colors.border
  },
  sparkGrid: {
    height: 88,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.gridLine,
    backgroundColor: colors.panelHeader,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    padding: spacing.sm,
    overflow: "hidden"
  },
  sparkBar: {
    flex: 1,
    minWidth: 4,
    opacity: 0.75,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2
  },
  serverLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  serverLineText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700"
  },
  summaryGrid: {
    marginTop: spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  stack: {
    gap: spacing.md
  }
});
