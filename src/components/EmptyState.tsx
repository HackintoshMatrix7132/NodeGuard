import type { ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/constants/theme";

type IconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

type EmptyStateProps = {
  title: string;
  message: string;
  icon: ComponentType<IconProps>;
};

export function EmptyState({ title, message, icon: Icon }: EmptyStateProps) {
  return (
    <View style={styles.card}>
      <Icon color={colors.textDim} size={26} strokeWidth={2} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.sm
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  message: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center"
  }
});
