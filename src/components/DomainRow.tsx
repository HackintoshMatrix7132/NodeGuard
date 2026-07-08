import { Lock, Timer } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/constants/theme";
import type { DomainCheck } from "@/types/nodeguard";
import { formatRelativeTime, formatSslDays } from "@/utils/format";
import { getHealthStatusStyle } from "@/utils/status";

import { StatusPill } from "./StatusPill";

type DomainRowProps = {
  domain: DomainCheck;
};

export function DomainRow({ domain }: DomainRowProps) {
  const status = getHealthStatusStyle(domain.status);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.domain} numberOfLines={1}>
            {domain.domain}
          </Text>
          <Text style={styles.subtitle}>
            {domain.statusCode ? `HTTP ${domain.statusCode}` : "No response"} - {formatRelativeTime(domain.lastCheckedAt)}
          </Text>
        </View>
        <StatusPill {...status} />
      </View>

      <View style={styles.metricRow}>
        <View style={styles.metric}>
          <Timer color={colors.textDim} size={15} strokeWidth={2.2} />
          <Text style={styles.metricText}>{domain.responseTimeMs ? `${domain.responseTimeMs}ms` : "timeout"}</Text>
        </View>
        <View style={styles.metric}>
          <Lock color={domain.https ? colors.healthy : colors.warning} size={15} strokeWidth={2.2} />
          <Text style={styles.metricText}>SSL {formatSslDays(domain.sslExpiresAt)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  titleGroup: {
    flex: 1,
    minWidth: 0
  },
  domain: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  subtitle: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600"
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  metric: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  metricText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700"
  }
});
