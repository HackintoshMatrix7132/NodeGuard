import type { ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/constants/theme";

type IconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

type HeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actionIcon?: ComponentType<IconProps>;
  onActionPress?: () => void;
};

export function Header({ eyebrow, title, subtitle, actionIcon: ActionIcon, onActionPress }: HeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {ActionIcon && onActionPress ? (
        <Pressable style={styles.action} onPress={onActionPress}>
          <ActionIcon color={colors.text} size={20} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.lg
  },
  copy: {
    flex: 1,
    minWidth: 0
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0
  },
  title: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "900"
  },
  subtitle: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600"
  },
  action: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border
  }
});
