import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { api, session } = useSession();
  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.listNotifications(50),
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!session?.accessToken || typeof EventSource === 'undefined') {
      return;
    }

    const streamUrl = api.buildSseUrl('notifications/stream', session.accessToken);
    const eventSource = new EventSource(streamUrl);

    const handleMessage = () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };

    eventSource.addEventListener('message', handleMessage);

    return () => {
      eventSource.removeEventListener('message', handleMessage);
      eventSource.close();
    };
  }, [api, queryClient, session?.accessToken]);

  return (
    <ScreenTransition>
      <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ALERTAS</Text>
        <Text style={styles.title}>Notificações</Text>
        <Text style={styles.subtitle}>
          Lembretes vencidos e novas mensagens importantes chegam aqui.
        </Text>
      </View>

      {notificationsQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : (
        <FlatList
          data={notificationsQuery.data?.items ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              tintColor={palette.primary}
              refreshing={notificationsQuery.isRefetching}
              onRefresh={() => void notificationsQuery.refetch()}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nenhum alerta agora.</Text>
              <Text style={styles.emptyDescription}>
                Quando um cliente responder ou um lembrete vencer, voce recebe um aviso aqui.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.card,
                !item.readAt && {
                  borderColor: 'rgba(61, 150, 255, 0.35)',
                  backgroundColor: palette.surface,
                },
              ]}
              onPress={async () => {
                await api.markNotificationRead(item.id);
                await notificationsQuery.refetch();

                if (item.metadata && typeof item.metadata === 'object' && 'conversationId' in item.metadata) {
                  router.push(`/conversation/${String(item.metadata.conversationId)}`);
                }
              }}
            >
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardBody}>{item.body}</Text>
              <Text style={styles.cardMeta}>
                {item.readAt ? 'Lida' : 'Nova'} • {new Date(item.createdAt).toLocaleString('pt-BR')}
              </Text>
            </Pressable>
          )}
        />
      )}
      </View>
    </ScreenTransition>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    marginBottom: 14,
    gap: 6,
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
  },
  subtitle: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 32,
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
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardBody: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  cardMeta: {
    color: palette.textMuted,
    fontSize: 12,
  },
});
