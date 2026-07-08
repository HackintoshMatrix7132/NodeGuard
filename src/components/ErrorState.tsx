import { RefreshCcw } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/constants/theme";

type ErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
};

export function ErrorState({ title = "Could not load data", message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Pressable style={styles.button} onPress={onRetry}>
          <RefreshCcw color={colors.text} size={16} strokeWidth={2.2} />
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 160,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.critical,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.md
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  message: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20
  },
  button: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelHeader
  },
  buttonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800"
  }
});
