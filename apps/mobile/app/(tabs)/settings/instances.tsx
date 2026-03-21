import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

const MODES = ['DEVELOPMENT', 'SANDBOX', 'PRODUCTION'] as const;
const MODE_LABELS: Record<string, string> = {
  DEVELOPMENT: 'Desenvolvimento',
  SANDBOX: 'Sandbox',
  PRODUCTION: 'Produção',
};
const STATUS_COLORS: Record<string, string> = {
  CONNECTED: palette.success,
  DISCONNECTED: palette.danger,
  PENDING: palette.warning,
  ACTIVE: palette.success,
};

export default function InstancesModuleScreen() {
  const { api, me } = useSession();
  const queryClient = useQueryClient();
  const isAdmin = (me as any)?.role === 'ADMIN' || (me as any)?.normalizedRole === 'ADMIN';

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [showDiagnostics, setShowDiagnostics] = useState<any>(null);

  // Form
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [mode, setMode] = useState<string>('PRODUCTION');

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
    onError: (error: Error) => Alert.alert('Falha na sincronização', error.message),
  });

  const testMutation = useMutation({
    mutationFn: (instanceId: string) => api.testInstance(instanceId),
    onSuccess: () => Alert.alert('Conexão validada', 'Teste executado com sucesso.'),
    onError: (error: Error) => Alert.alert('Falha no teste', error.message),
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.createInstance(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-instances'] });
      closeModal();
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      api.updateInstance(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-instances'] });
      closeModal();
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteInstance(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-instances'] }),
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  function openCreate() {
    setEditing(null);
    setName('');
    setPhoneNumber('');
    setBusinessAccountId('');
    setPhoneNumberId('');
    setAccessToken('');
    setWebhookVerifyToken('');
    setAppSecret('');
    setMode('PRODUCTION');
    setShowModal(true);
  }

  function openEdit(item: any) {
    setEditing(item);
    setName(item.name ?? '');
    setPhoneNumber(item.phoneNumber ?? '');
    setBusinessAccountId(item.businessAccountId ?? '');
    setPhoneNumberId(item.phoneNumberId ?? '');
    setAccessToken(item.accessToken ?? '');
    setWebhookVerifyToken(item.webhookVerifyToken ?? '');
    setAppSecret(item.appSecret ?? '');
    setMode(item.mode ?? 'PRODUCTION');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
  }

  function save() {
    const payload = {
      name: name.trim(),
      provider: 'META_WHATSAPP',
      phoneNumber: phoneNumber.trim() || undefined,
      businessAccountId: businessAccountId.trim() || undefined,
      phoneNumberId: phoneNumberId.trim() || undefined,
      accessToken: accessToken.trim() || undefined,
      webhookVerifyToken: webhookVerifyToken.trim() || undefined,
      appSecret: appSecret.trim() || undefined,
      mode,
    };
    if (!payload.name) {
      Alert.alert('Campo obrigatório', 'Informe o nome da instância.');
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function confirmDelete(item: any) {
    Alert.alert('Remover instância', `Deseja remover "${item.name}"? A integração será desconectada.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => deleteMutation.mutate(item.id) },
    ]);
  }

  return (
    <ScreenTransition>
      <View style={styles.screen}>
        <FlatList
          data={instancesQuery.data ?? []}
          keyExtractor={(item: any) => item.id}
          refreshControl={
            <RefreshControl tintColor={palette.primary}
              refreshing={instancesQuery.isRefetching}
              onRefresh={() => void instancesQuery.refetch()} />
          }
          contentContainerStyle={styles.content}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nenhuma instância configurada</Text>
              <Text style={styles.emptyDescription}>
                {isAdmin
                  ? 'Configure uma instância do WhatsApp para começar a usar a plataforma.'
                  : 'Instâncias serão exibidas aqui quando configuradas.'}
              </Text>
            </View>
          }
          renderItem={({ item }: { item: any }) => {
            const statusColor = STATUS_COLORS[item.status] ?? palette.textMuted;
            return (
              <View style={styles.card}>
                <View style={styles.topRow}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <View style={[styles.statusPill, { backgroundColor: `${statusColor}22` }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
                  </View>
                </View>
                <View style={styles.metaRow}>
                  <View style={styles.modePill}>
                    <Text style={styles.modeText}>{MODE_LABELS[item.mode] ?? item.mode}</Text>
                  </View>
                  {item.phoneNumber ? (
                    <Text style={styles.meta}>{item.phoneNumber}</Text>
                  ) : null}
                </View>
                {item.phoneNumberId ? <Text style={styles.meta}>Phone ID: {item.phoneNumberId}</Text> : null}
                {item.lastSyncAt ? (
                  <Text style={styles.meta}>
                    Último sync: {new Date(item.lastSyncAt).toLocaleString('pt-BR')}
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

                {isAdmin && (
                  <View style={styles.actions}>
                    <Pressable style={styles.actionButton} onPress={() => openEdit(item)}>
                      <Text style={styles.actionText}>Editar</Text>
                    </Pressable>
                    <Pressable style={styles.actionButton} onPress={() => setShowDiagnostics(item)}>
                      <Text style={styles.actionText}>Diagnóstico</Text>
                    </Pressable>
                    <Pressable style={styles.dangerSmall} onPress={() => confirmDelete(item)}>
                      <Text style={styles.dangerSmallText}>Excluir</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
        />

        {isAdmin && (
          <Pressable style={styles.fab} onPress={openCreate}>
            <Text style={styles.fabText}>＋</Text>
          </Pressable>
        )}
      </View>

      {/* Create / Edit Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>
              {editing ? 'Editar instância' : 'Nova instância'}
            </Text>

            <Text style={styles.label}>Nome *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              placeholder="Nome da instância" placeholderTextColor={palette.textMuted} />

            <Text style={styles.label}>Modo</Text>
            <View style={styles.chipRow}>
              {MODES.map((m) => (
                <Pressable key={m} style={[styles.chip, mode === m && styles.chipActive]}
                  onPress={() => setMode(m)}>
                  <Text style={[styles.chipText, mode === m && styles.chipTextActive]}>
                    {MODE_LABELS[m]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Número de telefone</Text>
            <TextInput style={styles.input} value={phoneNumber} onChangeText={setPhoneNumber}
              placeholder="+55 11 99999-0000" placeholderTextColor={palette.textMuted}
              keyboardType="phone-pad" />

            <Text style={styles.label}>Business Account ID</Text>
            <TextInput style={styles.input} value={businessAccountId}
              onChangeText={setBusinessAccountId} placeholder="ID da conta business"
              placeholderTextColor={palette.textMuted} autoCapitalize="none" />

            <Text style={styles.label}>Phone Number ID</Text>
            <TextInput style={styles.input} value={phoneNumberId}
              onChangeText={setPhoneNumberId} placeholder="ID do número"
              placeholderTextColor={palette.textMuted} autoCapitalize="none" />

            <Text style={styles.label}>Access Token</Text>
            <TextInput style={styles.input} value={accessToken}
              onChangeText={setAccessToken} placeholder="Token de acesso Meta"
              placeholderTextColor={palette.textMuted} autoCapitalize="none" secureTextEntry />

            <Text style={styles.label}>Webhook Verify Token</Text>
            <TextInput style={styles.input} value={webhookVerifyToken}
              onChangeText={setWebhookVerifyToken} placeholder="Token de verificação"
              placeholderTextColor={palette.textMuted} autoCapitalize="none" />

            <Text style={styles.label}>App Secret</Text>
            <TextInput style={styles.input} value={appSecret}
              onChangeText={setAppSecret} placeholder="Secret do app Meta"
              placeholderTextColor={palette.textMuted} autoCapitalize="none" secureTextEntry />

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={closeModal}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.saveButton, (createMutation.isPending || updateMutation.isPending) && styles.saveButtonDisabled]}
                disabled={createMutation.isPending || updateMutation.isPending}
                onPress={save}>
                <Text style={styles.saveText}>
                  {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Diagnostics Modal */}
      <Modal visible={!!showDiagnostics} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Diagnóstico: {showDiagnostics?.name}
            </Text>

            {diagnosticsQuery.isLoading ? (
              <ActivityIndicator color={palette.primary} style={{ marginTop: 20 }} />
            ) : diagnosticsQuery.data ? (
              <View style={styles.diagCard}>
                {Object.entries(diagnosticsQuery.data as Record<string, any>).map(([key, value]) => (
                  <View key={key} style={styles.diagRow}>
                    <Text style={styles.diagLabel}>{key}</Text>
                    <Text style={styles.diagValue}>
                      {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '-')}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.meta}>Sem dados de diagnóstico disponíveis.</Text>
            )}

            <Pressable
              style={styles.cancelButton}
              onPress={() => setShowDiagnostics(null)}
            >
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
  content: { padding: 16, gap: 10, paddingBottom: 100 },
  card: {
    borderRadius: 20, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.backgroundElevated, padding: 14, gap: 6,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  name: { color: palette.text, fontSize: 15, fontWeight: '700', flex: 1 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modePill: {
    borderRadius: 999, backgroundColor: palette.primarySoft,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  modeText: { color: palette.primary, fontSize: 11, fontWeight: '700' },
  meta: { color: palette.textMuted, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 6, marginTop: 4 },
  actionButton: {
    flex: 1, minHeight: 36, borderRadius: 10, borderWidth: 1,
    borderColor: palette.border, backgroundColor: palette.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  actionText: { color: palette.text, fontSize: 11, fontWeight: '700' },
  dangerSmall: {
    minHeight: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(255,141,155,0.35)', backgroundColor: 'rgba(255,141,155,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  dangerSmallText: { color: palette.danger, fontSize: 11, fontWeight: '700' },
  fab: {
    position: 'absolute', bottom: 24, right: 20, width: 56, height: 56,
    borderRadius: 28, backgroundColor: palette.primary,
    alignItems: 'center', justifyContent: 'center', elevation: 6,
    shadowColor: palette.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '600', marginTop: -2 },

  // Modal
  modalContainer: { flex: 1, backgroundColor: palette.background },
  modalContent: { padding: 20, paddingBottom: 40, gap: 10 },
  modalTitle: { color: palette.text, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  label: { color: palette.textMuted, fontSize: 12, fontWeight: '600', marginTop: 4 },
  input: {
    height: 48, borderRadius: 14, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.surface, color: palette.text, paddingHorizontal: 14, fontSize: 14,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 36, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1,
    borderColor: palette.border, backgroundColor: palette.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  chipActive: { borderColor: palette.primary, backgroundColor: palette.primarySoft },
  chipText: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: palette.primary },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelButton: {
    flex: 1, height: 48, borderRadius: 14, borderWidth: 1,
    borderColor: palette.border, backgroundColor: palette.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { color: palette.text, fontSize: 14, fontWeight: '700' },
  saveButton: {
    flex: 1, height: 48, borderRadius: 14, backgroundColor: palette.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Diagnostics
  diagCard: { gap: 8 },
  diagRow: { gap: 2 },
  diagLabel: { color: palette.primary, fontSize: 12, fontWeight: '700' },
  diagValue: { color: palette.text, fontSize: 13, lineHeight: 19 },

  emptyState: {
    borderRadius: 16, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.surface, padding: 16, gap: 4, marginTop: 12,
  },
  emptyTitle: { color: palette.text, fontSize: 14, fontWeight: '700' },
  emptyDescription: { color: palette.textMuted, fontSize: 12, lineHeight: 18 },
});
