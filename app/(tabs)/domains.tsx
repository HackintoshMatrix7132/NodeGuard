import { Globe2 } from "lucide-react-native";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { DomainRow } from "@/components/DomainRow";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Header } from "@/components/Header";
import { LoadingBlock } from "@/components/LoadingBlock";
import { Screen } from "@/components/Screen";
import { colors, spacing } from "@/constants/theme";
import { useDomains } from "@/hooks/useNodeGuardQueries";

export default function DomainsScreen() {
  const domains = useDomains();

  if (domains.isLoading) {
    return (
      <Screen>
        <Header eyebrow="Reachability" title="Domains" subtitle="Checking reverse-proxy paths." />
        <LoadingBlock />
      </Screen>
    );
  }

  if (domains.error) {
    return (
      <Screen>
        <Header eyebrow="Reachability" title="Domains" subtitle="Domain data is unavailable." />
        <ErrorState
          message={domains.error instanceof Error ? domains.error.message : "The mocked API could not load domain checks."}
          onRetry={() => void domains.refetch()}
        />
      </Screen>
    );
  }

  const online = domains.data?.filter((domain) => domain.status === "healthy").length ?? 0;
  const total = domains.data?.length ?? 0;

  return (
    <Screen padded={false}>
      <FlatList
        data={domains.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={domains.isRefetching} onRefresh={() => void domains.refetch()} tintColor={colors.accent} />
        }
        ListHeaderComponent={<Header eyebrow="Reachability" title="Domains" subtitle={`${online} reachable of ${total}`} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<EmptyState title="No domains" message="No domain checks are configured yet." icon={Globe2} />}
        renderItem={({ item }) => <DomainRow domain={item} />}
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
