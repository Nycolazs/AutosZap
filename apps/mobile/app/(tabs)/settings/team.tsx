import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { TeamMemberRecord } from '@autoszap/platform-types';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

export default function TeamModuleScreen() {
  const { api } = useSession();
  const teamQuery = useQuery<TeamMemberRecord[]>({
    queryKey: ['mobile-team'],
    queryFn: () => api.listTeam(),
    refetchInterval: 30_000,
  });
  const members = Array.isArray(teamQuery.data) ? teamQuery.data : [];

  if (teamQuery.isLoading && members.length === 0) {
    return (
      <ScreenTransition>
        <View style={styles.centerState}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </ScreenTransition>
    );
  }

  return (
    <ScreenTransition>
      <FlatList
        style={styles.screen}
        data={members}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            tintColor={palette.primary}
            refreshing={teamQuery.isRefetching}
            onRefresh={() => void teamQuery.refetch()}
          />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Nenhum membro encontrado.</Text>
            <Text style={styles.emptyDescription}>
              Cadastre usuários no web para visualizar aqui.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{item.email}</Text>
            <Text style={styles.meta}>
              {item.role} • {item.status}
            </Text>
            {item.title ? <Text style={styles.meta}>Cargo: {item.title}</Text> : null}
          </View>
        )}
      />
    </ScreenTransition>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: 16,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.background,
  },
  listContent: {
    paddingTop: 16,
    paddingBottom: 24,
    gap: 8,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 12,
    gap: 4,
  },
  name: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
  },
  meta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  emptyState: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 12,
    gap: 4,
    marginTop: 16,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyDescription: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
