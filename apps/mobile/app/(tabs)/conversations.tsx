import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

type StatusFilter = 'ALL' | 'NEW' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'NEW', label: 'Novo' },
  { value: 'IN_PROGRESS', label: 'Em atendimento' },
  { value: 'WAITING', label: 'Aguardando' },
  { value: 'RESOLVED', label: 'Resolvido' },
  { value: 'CLOSED', label: 'Encerrado' },
];

export default function ConversationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { api, me, session, logout } = useSession();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const conversationsQuery = useQuery({
    queryKey: ['conversations', search, statusFilter],
    queryFn: () =>
      api.listConversations({
        search,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      }),
    refetchInterval: 10000,
  });

  const summaryQuery = useQuery({
    queryKey: ['conversations-summary', search],
    queryFn: () => api.listConversationSummary({ search }),
    refetchInterval: 20000,
  });

  useEffect(() => {
    if (!session?.accessToken || typeof EventSource === 'undefined') {
      return;
    }

    const streamUrl = api.buildSseUrl('conversations/stream', session.accessToken);
    const eventSource = new EventSource(streamUrl);

    const handleMessage = () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations-summary'] });
    };

    eventSource.addEventListener('message', handleMessage);

    return () => {
      eventSource.removeEventListener('message', handleMessage);
      eventSource.close();
    };
  }, [api, queryClient, session?.accessToken]);

  const conversations = useMemo(
    () => conversationsQuery.data?.data ?? [],
    [conversationsQuery.data],
  );

  const counts = summaryQuery.data;

  return (
    <ScreenTransition>
      <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>INBOX</Text>
          <Text style={styles.title}>Conversas</Text>
          <Text style={styles.subtitle}>
            {me ? `Acompanhando ${me.workspace.name}` : 'Atualizacao em tempo quase real para vendedores.'}
          </Text>
        </View>
        <Pressable style={styles.ghostButton} onPress={() => void logout()}>
          <Text style={styles.ghostButtonText}>Sair</Text>
        </Pressable>
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar contato ou telefone"
        placeholderTextColor={palette.textMuted}
        style={styles.search}
      />

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={STATUS_FILTERS}
        keyExtractor={(item) => item.value}
        contentContainerStyle={styles.filtersList}
        renderItem={({ item }) => {
          const selected = statusFilter === item.value;
          const count = counts ? counts[item.value] : undefined;

          return (
            <Pressable
              style={[styles.filterChip, selected && styles.filterChipSelected]}
              onPress={() => setStatusFilter(item.value)}
            >
              <Text style={[styles.filterChipLabel, selected && styles.filterChipLabelSelected]}>
                {item.label}
              </Text>
              {typeof count === 'number' ? (
                <View style={[styles.filterCount, selected && styles.filterCountSelected]}>
                  <Text style={[styles.filterCountText, selected && styles.filterCountTextSelected]}>
                    {count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />

      {conversationsQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              tintColor={palette.primary}
              refreshing={conversationsQuery.isRefetching}
              onRefresh={() => void conversationsQuery.refetch()}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nenhuma conversa por aqui.</Text>
              <Text style={styles.emptyDescription}>
                As novas mensagens dos clientes aparecem automaticamente nesta lista.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/conversation/${item.id}`)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.contactName}>{item.contact.name}</Text>
                <View style={[styles.statusPill, statusStyle(item.status)]}>
                  <Text style={styles.statusText}>{mapStatus(item.status)}</Text>
                </View>
              </View>
              <Text style={styles.preview} numberOfLines={2}>
                {item.lastMessagePreview || 'Sem mensagens recentes.'}
              </Text>
              <View style={styles.cardMeta}>
                <Text style={styles.metaText}>
                  {item.assignedUser?.name || 'Disponivel para equipe'}
                </Text>
                {item.unreadCount ? (
                  <View style={styles.counter}>
                    <Text style={styles.counterText}>{item.unreadCount}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}
      </View>
    </ScreenTransition>
  );
}

function mapStatus(status: string) {
  if (status === 'IN_PROGRESS') return 'Em atendimento';
  if (status === 'WAITING') return 'Aguardando';
  if (status === 'RESOLVED') return 'Resolvido';
  if (status === 'CLOSED') return 'Encerrado';
  return 'Novo';
}

function statusStyle(status: string) {
  if (status === 'WAITING') {
    return { backgroundColor: 'rgba(243, 201, 63, 0.12)' };
  }

  if (status === 'RESOLVED') {
    return { backgroundColor: 'rgba(73, 216, 185, 0.12)' };
  }

  if (status === 'CLOSED') {
    return { backgroundColor: 'rgba(255, 141, 155, 0.12)' };
  }

  return { backgroundColor: 'rgba(61, 150, 255, 0.12)' };
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  eyebrow: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.1,
  },
  title: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 6,
  },
  subtitle: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6,
  },
  ghostButton: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: palette.surface,
  },
  ghostButtonText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  search: {
    height: 50,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.text,
    fontSize: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  filtersList: {
    gap: 8,
    paddingBottom: 12,
  },
  filterChip: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterChipSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  filterChipLabel: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipLabelSelected: {
    color: palette.primary,
  },
  filterCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.backgroundElevated,
    paddingHorizontal: 6,
  },
  filterCountSelected: {
    backgroundColor: 'rgba(61, 150, 255, 0.2)',
  },
  filterCountText: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  filterCountTextSelected: {
    color: palette.primary,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 36,
    gap: 12,
  },
  emptyState: {
    marginTop: 36,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    gap: 8,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyDescription: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 16,
    gap: 10,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  contactName: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '600',
  },
  preview: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    color: palette.textMuted,
    fontSize: 13,
  },
  counter: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primarySoft,
  },
  counterText: {
    color: palette.primary,
    fontWeight: '700',
    fontSize: 12,
  },
});
