import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/constants/theme";
import type { Alert } from "@/types/nodeguard";
import { formatRelativeTime } from "@/utils/format";
import { getAlertSeverityStyle } from "@/utils/status";

import { StatusPill } from "./StatusPill";

type AlertRowProps = {
  alert: Alert;
  onPress: () => void;
};

export function AlertRow({ alert, onPress }: AlertRowProps) {
  const severity = getAlertSeverityStyle(alert.severity);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.title} numberOfLines={2}>
            {alert.title}
          </Text>
          <Text style={styles.resource} numberOfLines={1}>
            {alert.affectedResource}
          </Text>
        </View>
        <StatusPill {...severity} />
      </View>
      <Text style={styles.message} numberOfLines={2}>
        {alert.message}
      </Text>
      <Text style={styles.time}>{formatRelativeTime(alert.createdAt)}</Text>
    </Pressable>
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
  title: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "900"
  },
  resource: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700"
  },
  message: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500"
  },
  time: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: "700"
  }
});
