import { useLocalSearchParams } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { DetailTopBar } from "@/components/DetailTopBar";
import { ErrorState } from "@/components/ErrorState";
import { InfoRow } from "@/components/InfoRow";
import { LoadingBlock } from "@/components/LoadingBlock";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { StatusPill } from "@/components/StatusPill";
import { colors, radius, spacing } from "@/constants/theme";
import { useAlert } from "@/hooks/useNodeGuardQueries";
import { formatDateTime } from "@/utils/format";
import { getAlertSeverityStyle } from "@/utils/status";

export default function AlertDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const alertId = typeof params.id === "string" ? params.id : "";
  const alert = useAlert(alertId);

  if (alert.isLoading) {
    return (
      <Screen>
        <DetailTopBar eyebrow="Alert" title="Loading" />
        <LoadingBlock />
      </Screen>
    );
  }

  if (alert.error || !alert.data) {
    return (
      <Screen>
        <DetailTopBar eyebrow="Alert" title="Unavailable" />
        <ErrorState
          message={alert.error instanceof Error ? alert.error.message : "The mocked API could not load this alert."}
          onRetry={() => void alert.refetch()}
        />
      </Screen>
    );
  }

  const severity = getAlertSeverityStyle(alert.data.severity);

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={alert.isRefetching} onRefresh={() => void alert.refetch()} tintColor={colors.accent} />}
      >
        <DetailTopBar eyebrow="Alert" title={alert.data.title} subtitle={alert.data.affectedResource} />

        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.message}>{alert.data.message}</Text>
            <StatusPill {...severity} />
          </View>
          <InfoRow label="Resource" value={alert.data.affectedResource} />
          <InfoRow label="Created" value={formatDateTime(alert.data.createdAt)} />
          <InfoRow label="Resolved" value={formatDateTime(alert.data.resolvedAt)} />
        </View>

        <SectionHeader title="Failed Checks" />
        <View style={styles.stackCard}>
          {alert.data.failedChecks.map((check) => (
            <Text key={check} style={styles.stackLine}>
              {check}
            </Text>
          ))}
        </View>

        <SectionHeader title="Next Steps" />
        <View style={styles.stackCard}>
          {alert.data.suggestedNextSteps.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View style={styles.stepIndex}>
                <Text style={styles.stepIndexText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
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
    borderTopColor: colors.critical,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingBottom: spacing.sm
  },
  message: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700"
  },
  stackCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md
  },
  stackLine: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700"
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md
  },
  stepIndex: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentMuted
  },
  stepIndexText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "900"
  },
  stepText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700"
  }
});
