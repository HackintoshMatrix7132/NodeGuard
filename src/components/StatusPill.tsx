import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/constants/theme";

type StatusPillProps = {
  label: string;
  color: string;
  background: string;
};

export function StatusPill({ label, color, background }: StatusPillProps) {
  return (
    <View style={[styles.pill, { backgroundColor: background, borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 28,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    backgroundColor: colors.surfaceMuted
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  label: {
    fontSize: 12,
    fontWeight: "700"
  }
});
