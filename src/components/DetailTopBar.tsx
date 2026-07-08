import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/constants/theme";

import { BackButton } from "./BackButton";

type DetailTopBarProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
};

export function DetailTopBar({ eyebrow, title, subtitle }: DetailTopBarProps) {
  return (
    <View style={styles.bar}>
      <BackButton />
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  copy: {
    flex: 1,
    minWidth: 0
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0
  },
  title: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900"
  },
  subtitle: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700"
  }
});
