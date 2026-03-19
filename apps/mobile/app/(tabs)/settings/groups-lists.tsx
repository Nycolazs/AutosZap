import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

export default function GroupsListsModuleScreen() {
  const { api } = useSession();
  const groupsQuery = useQuery({
    queryKey: ['mobile-groups'],
    queryFn: () => api.listGroups(),
    refetchInterval: 30_000,
  });
  const listsQuery = useQuery({
    queryKey: ['mobile-contact-lists'],
    queryFn: () => api.listContactLists(),
    refetchInterval: 30_000,
  });

  const loading = groupsQuery.isLoading || listsQuery.isLoading;

  return (
    <ScreenTransition>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            tintColor={palette.primary}
            refreshing={groupsQuery.isRefetching || listsQuery.isRefetching}
            onRefresh={() => {
              void Promise.all([groupsQuery.refetch(), listsQuery.refetch()]);
            }}
          />
        }
      >
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Grupos</Text>
          {(groupsQuery.data ?? []).map((group) => (
            <View key={group.id} style={styles.card}>
              <Text style={styles.name}>{group.name}</Text>
              {group.description ? <Text style={styles.meta}>{group.description}</Text> : null}
              {typeof group.contactCount === 'number' ? (
                <Text style={styles.meta}>Contatos: {group.contactCount}</Text>
              ) : null}
            </View>
          ))}
          {!groupsQuery.data?.length ? (
            <Text style={styles.emptyText}>Nenhum grupo encontrado.</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Listas de contatos</Text>
          {(listsQuery.data ?? []).map((list) => (
            <View key={list.id} style={styles.card}>
              <Text style={styles.name}>{list.name}</Text>
              {list.description ? <Text style={styles.meta}>{list.description}</Text> : null}
              {typeof list.contactCount === 'number' ? (
                <Text style={styles.meta}>Contatos: {list.contactCount}</Text>
              ) : null}
            </View>
          ))}
          {!listsQuery.data?.length ? (
            <Text style={styles.emptyText}>Nenhuma lista encontrada.</Text>
          ) : null}
        </View>
      </ScrollView>
    </ScreenTransition>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: 16,
    gap: 14,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
  },
  section: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 10,
    gap: 2,
  },
  name: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
  meta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  emptyText: {
    color: palette.textMuted,
    fontSize: 12,
  },
});
