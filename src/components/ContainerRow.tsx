import { Cpu, HardDrive } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/constants/theme";
import type { Container } from "@/types/nodeguard";
import { formatMemory } from "@/utils/format";
import { getContainerHealthStyle, getContainerStatusStyle } from "@/utils/status";

import { StatusPill } from "./StatusPill";

type ContainerRowProps = {
  container: Container;
  onPress: () => void;
};

export function ContainerRow({ container, onPress }: ContainerRowProps) {
  const status = getContainerStatusStyle(container.status);
  const health = getContainerHealthStyle(container.health);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.name} numberOfLines={1}>
            {container.name}
          </Text>
          <Text style={styles.image} numberOfLines={1}>
            {container.image}
          </Text>
        </View>
        <StatusPill {...status} />
      </View>

      <View style={styles.pillRow}>
        <StatusPill {...health} />
        <Text style={styles.uptime} numberOfLines={1}>
          {container.uptime}
        </Text>
      </View>

      <View style={styles.metricRow}>
        <View style={styles.metric}>
          <Cpu color={colors.textDim} size={15} strokeWidth={2.2} />
          <Text style={styles.metricText}>{container.cpuPercent.toFixed(1)}%</Text>
        </View>
        <View style={styles.metric}>
          <HardDrive color={colors.textDim} size={15} strokeWidth={2.2} />
          <Text style={styles.metricText}>{formatMemory(container.memoryMb, container.memoryLimitMb)}</Text>
        </View>
      </View>
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
  name: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  image: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600"
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  uptime: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: "700"
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  metric: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  metricText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700"
  }
});
