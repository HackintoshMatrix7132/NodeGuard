import { StyleSheet, View } from "react-native";

import { colors, radius, spacing } from "@/constants/theme";

export function LoadingBlock() {
  return (
    <View style={styles.stack}>
      <View style={[styles.block, styles.large]} />
      <View style={styles.grid}>
        <View style={styles.block} />
        <View style={styles.block} />
      </View>
      <View style={styles.block} />
      <View style={styles.block} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
    paddingTop: spacing.xl
  },
  grid: {
    flexDirection: "row",
    gap: spacing.md
  },
  block: {
    flex: 1,
    height: 112,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  large: {
    height: 180
  }
});
