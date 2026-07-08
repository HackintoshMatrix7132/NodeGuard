import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/constants/theme";

type InfoRowProps = {
  label: string;
  value: string;
};

export function InfoRow({ label, value }: InfoRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.gridLine
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700"
  },
  value: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right"
  }
});
