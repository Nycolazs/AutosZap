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

export default function DashboardModuleScreen() {
  const { api } = useSession();
  const overviewQuery = useQuery({
    queryKey: ['mobile-dashboard-overview'],
    queryFn: () => api.dashboardOverview(),
    refetchInterval: 20_000,
  });

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return (
      <ScreenTransition>
        <View style={styles.centerState}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </ScreenTransition>
    );
  }

  const data = overviewQuery.data;

  return (
    <ScreenTransition>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            tintColor={palette.primary}
            refreshing={overviewQuery.isRefetching}
            onRefresh={() => void overviewQuery.refetch()}
          />
        }
      >
        <View style={styles.metricsGrid}>
          <MetricCard label="Conversas ativas" value={data?.metrics.activeConversations ?? 0} />
          <MetricCard label="Contatos" value={data?.metrics.totalContacts ?? 0} />
          <MetricCard label="Campanhas enviadas" value={data?.metrics.sentCampaigns ?? 0} />
          <MetricCard label="Leads CRM" value={data?.metrics.crmLeads ?? 0} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Taxa de resposta</Text>
          <Text style={styles.highlight}>{data?.metrics.responseRate ?? 0}%</Text>
          <Text style={styles.cardHint}>
            Percentual de entregas e leituras nas últimas mensagens de saída.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Atividade recente</Text>
          <View style={styles.activityList}>
            {(data?.recentActivity ?? []).slice(0, 8).map((item) => (
              <View key={item.id} style={styles.activityCard}>
                <Text style={styles.activityTitle}>
                  {item.actionLabel ?? item.action} • {item.entityLabel ?? item.entityType}
                </Text>
                <Text style={styles.activityMeta}>
                  {item.actorName ?? 'Sistema'} • {new Date(item.createdAt).toLocaleString('pt-BR')}
                </Text>
                {item.detail ? (
                  <Text style={styles.activityDetail}>{item.detail}</Text>
                ) : null}
              </View>
            ))}
            {!data?.recentActivity?.length ? (
              <Text style={styles.emptyText}>Sem eventos recentes.</Text>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </ScreenTransition>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
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
  },
  content: {
    padding: 16,
    gap: 12,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.background,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 12,
    gap: 4,
  },
  metricLabel: {
    color: palette.textMuted,
    fontSize: 12,
  },
  metricValue: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '700',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 14,
    gap: 8,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  highlight: {
    color: palette.primary,
    fontSize: 28,
    fontWeight: '800',
  },
  cardHint: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  activityList: {
    gap: 8,
  },
  activityCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 10,
    gap: 4,
  },
  activityTitle: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  activityMeta: {
    color: palette.textMuted,
    fontSize: 11,
  },
  activityDetail: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  emptyText: {
    color: palette.textMuted,
    fontSize: 12,
  },
});
