import { router } from "expo-router";
import { Boxes, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, TextInput, View } from "react-native";

import { ContainerRow } from "@/components/ContainerRow";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Header } from "@/components/Header";
import { LoadingBlock } from "@/components/LoadingBlock";
import { Screen } from "@/components/Screen";
import { colors, radius, spacing } from "@/constants/theme";
import { useContainers } from "@/hooks/useNodeGuardQueries";

export default function ContainersScreen() {
  const containers = useContainers();
  const [search, setSearch] = useState("");

  const filteredContainers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!containers.data || !query) {
      return containers.data ?? [];
    }

    return containers.data.filter((container) =>
      [container.name, container.image, container.status, container.health].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [containers.data, search]);

  if (containers.isLoading) {
    return (
      <Screen>
        <Header eyebrow="Docker" title="Containers" subtitle="Reading mocked container inventory." />
        <LoadingBlock />
      </Screen>
    );
  }

  if (containers.error) {
    return (
      <Screen>
        <Header eyebrow="Docker" title="Containers" subtitle="Container data is unavailable." />
        <ErrorState
          message={containers.error instanceof Error ? containers.error.message : "The mocked API could not load containers."}
          onRetry={() => void containers.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={filteredContainers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={containers.isRefetching} onRefresh={() => void containers.refetch()} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <View>
            <Header
              eyebrow="Docker"
              title="Containers"
              subtitle={`${containers.data?.filter((item) => item.status === "running").length ?? 0} running of ${containers.data?.length ?? 0}`}
            />
            <View style={styles.searchBox}>
              <Search color={colors.textDim} size={18} strokeWidth={2.2} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search containers"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.searchInput}
              />
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <EmptyState title="No containers found" message="No container matches the current search." icon={Boxes} />
        }
        renderItem={({ item }) => (
          <ContainerRow
            container={item}
            onPress={() =>
              router.push({
                pathname: "/containers/[id]",
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
  searchBox: {
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "700"
  },
  separator: {
    height: spacing.md
  }
});
