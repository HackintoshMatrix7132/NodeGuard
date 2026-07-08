import { router } from "expo-router";
import { Bell } from "lucide-react-native";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { AlertRow } from "@/components/AlertRow";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Header } from "@/components/Header";
import { LoadingBlock } from "@/components/LoadingBlock";
import { Screen } from "@/components/Screen";
import { colors, spacing } from "@/constants/theme";
import { useAlerts } from "@/hooks/useNodeGuardQueries";

export default function AlertsScreen() {
  const alerts = useAlerts();

  if (alerts.isLoading) {
    return (
      <Screen>
        <Header eyebrow="Incidents" title="Alerts" subtitle="Loading current issues." />
        <LoadingBlock />
      </Screen>
    );
  }

  if (alerts.error) {
    return (
      <Screen>
        <Header eyebrow="Incidents" title="Alerts" subtitle="Alert data is unavailable." />
        <ErrorState
          message={alerts.error instanceof Error ? alerts.error.message : "The mocked API could not load alerts."}
          onRetry={() => void alerts.refetch()}
        />
      </Screen>
    );
  }

  const active = alerts.data?.filter((alert) => alert.status === "active").length ?? 0;
  const total = alerts.data?.length ?? 0;

  return (
    <Screen padded={false}>
      <FlatList
        data={alerts.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={alerts.isRefetching} onRefresh={() => void alerts.refetch()} tintColor={colors.accent} />
        }
        ListHeaderComponent={<Header eyebrow="Incidents" title="Alerts" subtitle={`${active} active of ${total}`} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<EmptyState title="No alerts" message="No active or recent alerts are available." icon={Bell} />}
        renderItem={({ item }) => (
          <AlertRow
            alert={item}
            onPress={() =>
              router.push({
                pathname: "/alerts/[id]",
                params: { id: item.id }
              })
            }
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl
  },
  separator: {
    height: spacing.md
  }
});
