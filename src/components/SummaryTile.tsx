import type { ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/constants/theme";

type IconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

type SummaryTileProps = {
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<IconProps>;
  tone?: "accent" | "blue" | "warning" | "critical" | "healthy";
};

const tones = {
  accent: {
    color: colors.accent,
    background: colors.accentMuted
  },
  blue: {
    color: colors.blue,
    background: colors.blueMuted
  },
  warning: {
    color: colors.warning,
    background: colors.warningMuted
  },
  critical: {
    color: colors.critical,
    background: colors.criticalMuted
  },
  healthy: {
    color: colors.healthy,
    background: colors.healthyMuted
  }
};

export function SummaryTile({ label, value, detail, icon: Icon, tone = "accent" }: SummaryTileProps) {
  const currentTone = tones[tone];

  return (
    <View style={[styles.tile, { borderTopColor: currentTone.color }]}>
      <View style={[styles.iconBox, { backgroundColor: currentTone.background }]}>
        <Icon color={currentTone.color} size={19} strokeWidth={2.2} />
      </View>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.detail} numberOfLines={1}>
        {detail}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 148,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 3
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center"
  },
  value: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900"
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700"
  },
  detail: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: "600"
  }
});
