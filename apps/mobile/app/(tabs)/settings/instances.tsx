import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

export default function InstancesModuleScreen() {
  const { api } = useSession();
  const queryClient = useQueryClient();
  const instancesQuery = useQuery({
    queryKey: ['mobile-instances'],
    queryFn: () => api.listInstances(),
    refetchInterval: 20_000,
  });

  const syncMutation = useMutation({
    mutationFn: (instanceId: string) => api.syncInstance(instanceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-instances'] });
    },
    onError: (error: Error) => {
      Alert.alert('Falha na sincronização', error.message);
    },
  });

  const testMutation = useMutation({
    mutationFn: (instanceId: string) => api.testInstance(instanceId),
    onSuccess: () => {
      Alert.alert('Conexão validada', 'Teste executado com sucesso.');
    },
    onError: (error: Error) => {
      Alert.alert('Falha no teste', error.message);
    },
  });

  return (
    <ScreenTransition>
      <FlatList
        style={styles.screen}
        data={instancesQuery.data ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            tintColor={palette.primary}
            refreshing={instancesQuery.isRefetching}
            onRefresh={() => void instancesQuery.refetch()}
          />
        }
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Nenhuma instância configurada.</Text>
            <Text style={styles.emptyDescription}>
              Configure integrações no web e acompanhe o status aqui.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.topRow}>
              <Text style={styles.name}>{item.name}</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>{item.status}</Text>
              </View>
            </View>
            <Text style={styles.meta}>Modo: {item.mode}</Text>
            {item.phoneNumber ? <Text style={styles.meta}>Telefone: {item.phoneNumber}</Text> : null}
            {item.phoneNumberId ? <Text style={styles.meta}>Phone ID: {item.phoneNumberId}</Text> : null}
            {item.lastSyncAt ? (
              <Text style={styles.meta}>Último sync: {new Date(item.lastSyncAt).toLocaleString('pt-BR')}</Text>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                style={styles.actionButton}
                disabled={syncMutation.isPending}
                onPress={() => syncMutation.mutate(item.id)}
              >
                <Text style={styles.actionText}>
                  {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.actionButton}
                disabled={testMutation.isPending}
                onPress={() => testMutation.mutate(item.id)}
              >
                <Text style={styles.actionText}>
                  {testMutation.isPending ? 'Testando...' : 'Testar'}
                </Text>
              </Pressable>
            </View>
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
  },
  content: {
    padding: 16,
    gap: 10,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 12,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  meta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 12,
    gap: 4,
    marginTop: 12,
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
