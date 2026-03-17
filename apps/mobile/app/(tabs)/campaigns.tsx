import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

export default function CampaignsScreen() {
  const queryClient = useQueryClient();
  const { api } = useSession();
  const campaignsQuery = useQuery({
    queryKey: ['mobile-campaigns'],
    queryFn: () => api.listCampaigns(),
    refetchInterval: 20000,
  });

  const sendMutation = useMutation({
    mutationFn: (campaignId: string) => api.sendCampaign(campaignId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-campaigns'] });
    },
  });

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>DISPAROS</Text>
        <Text style={styles.title}>Campanhas</Text>
        <Text style={styles.subtitle}>
          Monitore campanhas e envie rapidamente as que estão prontas.
        </Text>
      </View>

      {campaignsQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : (
        <FlatList
          data={campaignsQuery.data ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              tintColor={palette.primary}
              refreshing={campaignsQuery.isRefetching}
              onRefresh={() => void campaignsQuery.refetch()}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nenhuma campanha cadastrada.</Text>
              <Text style={styles.emptyDescription}>
                Crie campanhas no web e acompanhe os resultados aqui.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.topRow}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{item.status}</Text>
                </View>
              </View>

              <Text style={styles.message} numberOfLines={3}>{item.message}</Text>

              <View style={styles.metricsRow}>
                <Metric label="Dest." value={item.recipientCount} />
                <Metric label="Env." value={item.sentCount} />
                <Metric label="Falhas" value={item.failedCount} />
              </View>

              <Pressable
                style={[
                  styles.sendButton,
                  sendMutation.isPending && styles.sendButtonDisabled,
                ]}
                onPress={() => sendMutation.mutate(item.id)}
                disabled={sendMutation.isPending}
              >
                <Text style={styles.sendButtonText}>
                  {sendMutation.isPending ? 'Enviando...' : 'Enviar agora'}
                </Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
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
    letterSpacing: 2,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 28,
    gap: 12,
  },
  emptyState: {
    marginTop: 32,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 20,
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
    padding: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  name: {
    flex: 1,
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  message: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  metricLabel: {
    color: palette.textMuted,
    fontSize: 11,
  },
  metricValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
  sendButton: {
    borderRadius: 14,
    backgroundColor: palette.primary,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
