import { useMemo, useState } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

export default function CrmScreen() {
  const { api } = useSession();
  const [search, setSearch] = useState('');
  const leadsQuery = useQuery({
    queryKey: ['mobile-leads', search],
    queryFn: () => api.listLeads({ search }),
    refetchInterval: 15000,
  });

  const grouped = useMemo(() => {
    const leads = leadsQuery.data?.data ?? [];

    return leads.reduce<Record<string, typeof leads>>((acc, lead) => {
      const key = lead.stage.name;
      acc[key] = [...(acc[key] ?? []), lead];
      return acc;
    }, {});
  }, [leadsQuery.data]);

  const groups = Object.entries(grouped);

  return (
    <ScreenTransition>
      <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>CRM</Text>
        <Text style={styles.title}>Pipeline</Text>
        <Text style={styles.subtitle}>
          Veja leads por etapa e acompanhe prioridades no celular.
        </Text>
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar lead ou empresa"
        placeholderTextColor={palette.textMuted}
        style={styles.search}
      />

      {leadsQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={([stage]) => stage}
          refreshControl={
            <RefreshControl
              tintColor={palette.primary}
              refreshing={leadsQuery.isRefetching}
              onRefresh={() => void leadsQuery.refetch()}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nenhum lead agora.</Text>
              <Text style={styles.emptyDescription}>
                Crie ou atualize oportunidades no web para visualizar aqui.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const [stage, leads] = item;

            return (
              <View style={styles.stageCard}>
                <View style={styles.stageHeader}>
                  <Text style={styles.stageTitle}>{stage}</Text>
                  <View style={styles.countPill}>
                    <Text style={styles.countText}>{leads.length}</Text>
                  </View>
                </View>

                <View style={styles.stageList}>
                  {leads.slice(0, 6).map((lead) => (
                    <Pressable key={lead.id} style={styles.leadCard}>
                      <View style={styles.leadTop}>
                        <Text style={styles.leadName} numberOfLines={1}>{lead.name}</Text>
                        <Text style={styles.leadValue}>{lead.value}</Text>
                      </View>
                      <Text style={styles.leadMeta} numberOfLines={1}>
                        {lead.company || 'Sem empresa'}
                      </Text>
                      <Text style={styles.leadMeta} numberOfLines={1}>
                        {lead.assignedTo?.name || 'Sem responsável'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          }}
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
  search: {
    height: 50,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.text,
    paddingHorizontal: 16,
    marginBottom: 12,
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
  stageCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 14,
    gap: 10,
  },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stageTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  countPill: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: palette.primary,
    fontWeight: '700',
  },
  stageList: {
    gap: 8,
  },
  leadCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 12,
    gap: 4,
  },
  leadTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  leadName: {
    flex: 1,
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
  },
  leadValue: {
    color: palette.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  leadMeta: {
    color: palette.textMuted,
    fontSize: 12,
  },
});
