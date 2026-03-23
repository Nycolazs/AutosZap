import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenTransition } from '@/components/screen-transition';
import { resolveApiUrl } from '@/lib/api';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

const MODE_LABELS: Record<string, string> = {
  DEV: 'Desenvolvimento',
  SANDBOX: 'Sandbox',
  PRODUCTION: 'Producao',
};
const STATUS_COLORS: Record<string, string> = {
  CONNECTED: palette.success,
  DISCONNECTED: palette.danger,
  SYNCING: palette.warning,
  PENDING: palette.warning,
  ACTIVE: palette.success,
};

function buildInstancesWebUrl() {
  try {
    const apiUrl = new URL(resolveApiUrl());

    if (
      (apiUrl.hostname === 'localhost' || apiUrl.hostname === '127.0.0.1') &&
      apiUrl.port === '4000'
    ) {
      apiUrl.port = '3000';
      apiUrl.pathname = '/app/instancias';
      apiUrl.search = '';
      apiUrl.hash = '';
      return apiUrl.toString();
    }

    if (apiUrl.hostname.startsWith('api.')) {
      apiUrl.hostname = apiUrl.hostname.replace(/^api\./, '');
      apiUrl.pathname = '/app/instancias';
      apiUrl.search = '';
      apiUrl.hash = '';
      return apiUrl.toString();
    }
  } catch {
    return null;
  }

  return null;
}

export default function InstancesModuleScreen() {
  const { api, me } = useSession();
  const queryClient = useQueryClient();
  const isAdmin =
    (me as any)?.role === 'ADMIN' || (me as any)?.normalizedRole === 'ADMIN';
  const [showDiagnostics, setShowDiagnostics] = useState<any>(null);
  const instancesWebUrl = useMemo(() => buildInstancesWebUrl(), []);

  const instancesQuery = useQuery({
    queryKey: ['mobile-instances'],
    queryFn: () => api.listInstances(),
    refetchInterval: 20_000,
  });

  const diagnosticsQuery = useQuery({
    queryKey: ['mobile-instance-diagnostics', showDiagnostics?.id],
    queryFn: () => api.getInstanceDiagnostics(showDiagnostics!.id),
    enabled: !!showDiagnostics?.id,
  });

  const syncMutation = useMutation({
    mutationFn: (instanceId: string) => api.syncInstance(instanceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-instances'] });
      Alert.alert('Sincronizado', 'Dados sincronizados com sucesso.');
    },
    onError: (error: Error) => Alert.alert('Falha na sincronizacao', error.message),
  });

  const testMutation = useMutation({
    mutationFn: (instanceId: string) => api.testInstance(instanceId),
    onSuccess: () => Alert.alert('Conexao validada', 'Teste executado com sucesso.'),
    onError: (error: Error) => Alert.alert('Falha no teste', error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteInstance(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-instances'] }),
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  function openEmbeddedSignupGuide() {
    if (!isAdmin) {
      Alert.alert(
        'Conexao gerenciada pelo admin',
        'Um administrador precisa conectar novos numeros pelo painel web usando o Embedded Signup da Meta.',
      );
      return;
    }

    if (!instancesWebUrl) {
      Alert.alert(
        'Abrir painel web',
        'Conecte novos numeros pelo modulo de instancias no painel web. Neste app mobile o cadastro manual foi removido por seguranca.',
      );
      return;
    }

    void Linking.openURL(instancesWebUrl).catch(() => {
      Alert.alert(
        'Nao foi possivel abrir o painel web',
        'Abra manualmente o modulo de instancias no painel web para iniciar o Embedded Signup.',
      );
    });
  }

  function confirmDelete(item: any) {
    Alert.alert(
      'Remover instancia',
      `Deseja remover "${item.name}"? Para usar esse numero novamente, conecte-o outra vez pelo Embedded Signup.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(item.id),
        },
      ],
    );
  }

  return (
    <ScreenTransition>
      <View style={styles.screen}>
        <FlatList
          data={instancesQuery.data ?? []}
          keyExtractor={(item: any) => item.id}
          refreshControl={
            <RefreshControl
              tintColor={palette.primary}
              refreshing={instancesQuery.isRefetching}
              onRefresh={() => void instancesQuery.refetch()}
            />
          }
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.headerStack}>
              <View style={styles.heroCard}>
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>Embedded Signup oficial</Text>
                </View>
                <Text style={styles.heroTitle}>
                  Conecte novos numeros somente pelo fluxo seguro da Meta.
                </Text>
                <Text style={styles.heroDescription}>
                  O cadastro manual de tokens e segredos foi removido. Agora o workspace usa o Embedded Signup para reduzir erros e proteger credenciais sensiveis.
                </Text>
                <Pressable style={styles.heroButton} onPress={openEmbeddedSignupGuide}>
                  <Text style={styles.heroButtonText}>
                    {isAdmin ? 'Abrir painel web para conectar' : 'Como um admin conecta'}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.infoRow}>
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Fluxo</Text>
                  <Text style={styles.infoValue}>100% Meta</Text>
                  <Text style={styles.infoHelper}>Sem access token manual no app.</Text>
                </View>
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Instancias</Text>
                  <Text style={styles.infoValue}>{(instancesQuery.data ?? []).length}</Text>
                  <Text style={styles.infoHelper}>Numeros listados neste workspace.</Text>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nenhuma instancia conectada</Text>
              <Text style={styles.emptyDescription}>
                {isAdmin
                  ? 'Abra o painel web e use o Embedded Signup da Meta para conectar o primeiro numero oficial.'
                  : 'Quando um administrador conectar um numero oficial, ele aparecera aqui.'}
              </Text>
            </View>
          }
          renderItem={({ item }: { item: any }) => {
            const statusColor = STATUS_COLORS[item.status] ?? palette.textMuted;
            return (
              <View style={styles.card}>
                <View style={styles.topRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={[styles.statusPill, { backgroundColor: `${statusColor}22` }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>
                      {item.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.modePill}>
                    <Text style={styles.modeText}>
                      {MODE_LABELS[item.mode] ?? item.mode}
                    </Text>
                  </View>
                  {item.phoneNumber ? <Text style={styles.meta}>{item.phoneNumber}</Text> : null}
                </View>

                <Text style={styles.meta}>Cadastro: Embedded Signup oficial</Text>
                {item.phoneNumberId ? (
                  <Text style={styles.meta}>Phone ID: {item.phoneNumberId}</Text>
                ) : null}
                {item.lastSyncAt ? (
                  <Text style={styles.meta}>
                    Ultimo sync: {new Date(item.lastSyncAt).toLocaleString('pt-BR')}
                  </Text>
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

                <View style={styles.actions}>
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => setShowDiagnostics(item)}
                  >
                    <Text style={styles.actionText}>Diagnostico</Text>
                  </Pressable>
                  {isAdmin ? (
                    <Pressable
                      style={styles.dangerSmall}
                      onPress={() => confirmDelete(item)}
                    >
                      <Text style={styles.dangerSmallText}>Remover</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      </View>

      <Modal visible={!!showDiagnostics} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>Diagnostico: {showDiagnostics?.name}</Text>

            {diagnosticsQuery.isLoading ? (
              <ActivityIndicator color={palette.primary} style={{ marginTop: 20 }} />
            ) : diagnosticsQuery.data ? (
              <View style={styles.diagCard}>
                {Object.entries(diagnosticsQuery.data as Record<string, any>).map(
                  ([key, value]) => (
                    <View key={key} style={styles.diagRow}>
                      <Text style={styles.diagLabel}>{key}</Text>
                      <Text style={styles.diagValue}>
                        {typeof value === 'object'
                          ? JSON.stringify(value, null, 2)
                          : String(value ?? '-')}
                      </Text>
                    </View>
                  ),
                )}
              </View>
            ) : (
              <Text style={styles.meta}>Sem dados de diagnostico disponiveis.</Text>
            )}

            <Pressable style={styles.cancelButton} onPress={() => setShowDiagnostics(null)}>
              <Text style={styles.cancelText}>Fechar</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </ScreenTransition>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  headerStack: { gap: 12, marginBottom: 2 },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(88, 170, 255, 0.18)',
    backgroundColor: palette.backgroundElevated,
    padding: 18,
    gap: 10,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(88, 170, 255, 0.12)',
  },
  heroBadgeText: { color: palette.primary, fontSize: 11, fontWeight: '700' },
  heroTitle: { color: palette.text, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  heroDescription: { color: palette.textMuted, fontSize: 13, lineHeight: 20 },
  heroButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  heroButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  infoRow: { flexDirection: 'row', gap: 10 },
  infoCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 4,
  },
  infoLabel: { color: palette.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  infoValue: { color: palette.text, fontSize: 19, fontWeight: '800' },
  infoHelper: { color: palette.textMuted, fontSize: 12, lineHeight: 17 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 14,
    gap: 8,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  name: { color: palette.text, fontSize: 15, fontWeight: '700', flex: 1 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  modePill: {
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  modeText: { color: palette.primary, fontSize: 11, fontWeight: '700' },
  meta: { color: palette.textMuted, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  actionButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: palette.text, fontSize: 11, fontWeight: '700' },
  dangerSmall: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,141,155,0.35)',
    backgroundColor: 'rgba(255,141,155,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerSmallText: { color: palette.danger, fontSize: 11, fontWeight: '700' },
  modalContainer: { flex: 1, backgroundColor: palette.background },
  modalContent: { padding: 20, paddingBottom: 40, gap: 10 },
  modalTitle: { color: palette.text, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  cancelButton: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  cancelText: { color: palette.text, fontSize: 14, fontWeight: '700' },
  diagCard: { gap: 8 },
  diagRow: { gap: 2 },
  diagLabel: { color: palette.primary, fontSize: 12, fontWeight: '700' },
  diagValue: { color: palette.text, fontSize: 13, lineHeight: 19 },
  emptyState: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 18,
    gap: 6,
    marginTop: 4,
  },
  emptyTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
  emptyDescription: { color: palette.textMuted, fontSize: 12, lineHeight: 19 },
});
