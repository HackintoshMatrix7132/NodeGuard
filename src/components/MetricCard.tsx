import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/constants/theme";
import { getMetricColor } from "@/utils/status";

type MetricCardProps = {
  label: string;
  value: number;
  detail: string;
};

export function MetricCard({ label, value, detail }: MetricCardProps) {
  const barColor = getMetricColor(value);
  const clampedValue = Math.max(0, Math.min(value, 100));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, { color: barColor }]}>{value.toFixed(1)}%</Text>
      </View>
      <View style={styles.gridPreview}>
        {[18, 44, 30, 62, 48, 74, 54, 68, 40, 58, 76, 52].map((height, index) => (
          <View
            key={`${label}-${index}`}
            style={[
              styles.gridBar,
              {
                height,
                backgroundColor: index > 8 ? barColor : colors.blue
              }
            ]}
          />
        ))}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${clampedValue}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={styles.detail} numberOfLines={1}>
        {detail}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700"
  },
  value: {
    fontSize: 22,
    fontWeight: "900"
  },
  gridPreview: {
    height: 80,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.gridLine,
    backgroundColor: colors.panelHeader,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    overflow: "hidden"
  },
  gridBar: {
    flex: 1,
    minWidth: 3,
    opacity: 0.72,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: colors.surfaceRaised
  },
  fill: {
    height: "100%",
    borderRadius: 4
  },
  detail: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: "600"
  }
});
