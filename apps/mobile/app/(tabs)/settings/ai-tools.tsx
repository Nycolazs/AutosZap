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

const STATUSES = ['ACTIVE', 'DRAFT', 'INACTIVE'] as const;
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativa',
  DRAFT: 'Rascunho',
  INACTIVE: 'Inativa',
};
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: palette.success,
  DRAFT: palette.warning,
  INACTIVE: palette.textMuted,
};

export default function AiToolsScreen() {
  const { api, me } = useSession();
  const queryClient = useQueryClient();
  const canEdit = !!(me as any)?.permissionMap?.AI_TOOLS_MANAGE;

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [action, setAction] = useState('');
  const [status, setStatus] = useState<string>('ACTIVE');

  const toolsQuery = useQuery({
    queryKey: ['mobile-ai-tools'],
    queryFn: () => api.listAiTools(),
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.createAiTool(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-ai-tools'] });
      closeModal();
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      api.updateAiTool(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-ai-tools'] });
      closeModal();
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAiTool(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-ai-tools'] }),
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  function openCreate() {
    setEditing(null);
    setName('');
    setDescription('');
    setType('');
    setEndpoint('');
    setAction('');
    setStatus('ACTIVE');
    setShowModal(true);
  }

  function openEdit(item: any) {
    setEditing(item);
    setName(item.name ?? '');
    setDescription(item.description ?? '');
    setType(item.type ?? '');
    setEndpoint(item.endpoint ?? '');
    setAction(item.action ?? '');
    setStatus(item.status ?? 'ACTIVE');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
  }

  function save() {
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      type: type.trim() || undefined,
      endpoint: endpoint.trim() || undefined,
      action: action.trim() || undefined,
      status,
    };
    if (!payload.name) {
      Alert.alert('Campo obrigatório', 'Informe o nome da ferramenta.');
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function confirmDelete(item: any) {
    Alert.alert('Remover ferramenta', `Deseja remover "${item.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => deleteMutation.mutate(item.id) },
    ]);
  }

  const tools = toolsQuery.data ?? [];

  return (
    <ScreenTransition>
      <View style={styles.screen}>
        {toolsQuery.isLoading && !toolsQuery.data ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : (
          <FlatList
            data={tools}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl tintColor={palette.primary}
                refreshing={toolsQuery.isRefetching}
                onRefresh={() => void toolsQuery.refetch()} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Nenhuma ferramenta de IA</Text>
                <Text style={styles.emptyDescription}>
                  Ferramentas permitem que os assistentes executem ações como consultas e integrações.
                </Text>
              </View>
            }
            renderItem={({ item }: { item: any }) => (
              <Pressable style={styles.card} onPress={() => canEdit && openEdit(item)}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                  <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLORS[item.status] ?? palette.textMuted}22` }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] ?? palette.textMuted }]}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </Text>
                  </View>
                </View>
                {item.description ? (
                  <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
                ) : null}
                <Text style={styles.cardMeta}>
                  {[item.type, item.endpoint].filter(Boolean).join(' • ') || 'Sem detalhes'}
                </Text>
                {canEdit && (
                  <View style={styles.cardActions}>
                    <Pressable style={styles.editButton} onPress={() => openEdit(item)}>
                      <Text style={styles.editText}>Editar</Text>
                    </Pressable>
                    <Pressable style={styles.dangerButton} onPress={() => confirmDelete(item)}>
                      <Text style={styles.dangerText}>Remover</Text>
                    </Pressable>
                  </View>
                )}
              </Pressable>
            )}
          />
        )}

        {canEdit && (
          <Pressable style={styles.fab} onPress={openCreate}>
            <Text style={styles.fabText}>＋</Text>
          </Pressable>
        )}
      </View>

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>
              {editing ? 'Editar ferramenta' : 'Nova ferramenta de IA'}
            </Text>

            <Text style={styles.label}>Nome *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              placeholder="Nome da ferramenta" placeholderTextColor={palette.textMuted} />

            <Text style={styles.label}>Descrição</Text>
            <TextInput style={[styles.input, styles.textArea]} value={description}
              onChangeText={setDescription} placeholder="O que esta ferramenta faz..."
              placeholderTextColor={palette.textMuted} multiline textAlignVertical="top" />

            <Text style={styles.label}>Tipo</Text>
            <TextInput style={styles.input} value={type} onChangeText={setType}
              placeholder="Ex: HTTP, FUNCTION" placeholderTextColor={palette.textMuted} autoCapitalize="characters" />

            <Text style={styles.label}>Endpoint</Text>
            <TextInput style={styles.input} value={endpoint} onChangeText={setEndpoint}
              placeholder="https://api.example.com/action" placeholderTextColor={palette.textMuted}
              keyboardType="url" autoCapitalize="none" />

            <Text style={styles.label}>Action</Text>
            <TextInput style={styles.input} value={action} onChangeText={setAction}
              placeholder="Nome da ação" placeholderTextColor={palette.textMuted} autoCapitalize="none" />

            <Text style={styles.label}>Status</Text>
            <View style={styles.chipRow}>
              {STATUSES.map((s) => (
                <Pressable key={s} style={[styles.chip, status === s && styles.chipActive]}
                  onPress={() => setStatus(s)}>
                  <Text style={[styles.chipText, status === s && styles.chipTextActive]}>
                    {STATUS_LABELS[s]}
                  </Text>
                </Pressable>
              ))}
            </View>

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
    </ScreenTransition>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 100, gap: 10 },
  card: {
    borderRadius: 20, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.backgroundElevated, padding: 14, gap: 6,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cardName: { color: palette.text, fontSize: 15, fontWeight: '700', flex: 1 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardDesc: { color: palette.textMuted, fontSize: 13, lineHeight: 19 },
  cardMeta: { color: palette.textMuted, fontSize: 12 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  editButton: {
    flex: 1, height: 36, borderRadius: 12, borderWidth: 1,
    borderColor: palette.border, backgroundColor: palette.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  editText: { color: palette.text, fontSize: 12, fontWeight: '700' },
  dangerButton: {
    flex: 1, height: 36, borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(255,141,155,0.35)', backgroundColor: 'rgba(255,141,155,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  dangerText: { color: palette.danger, fontSize: 12, fontWeight: '700' },
  fab: {
    position: 'absolute', bottom: 24, right: 20, width: 56, height: 56,
    borderRadius: 28, backgroundColor: palette.primary,
    alignItems: 'center', justifyContent: 'center', elevation: 6,
    shadowColor: palette.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '600', marginTop: -2 },
  modalContainer: { flex: 1, backgroundColor: palette.background },
  modalContent: { padding: 20, paddingBottom: 40, gap: 10 },
  modalTitle: { color: palette.text, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  label: { color: palette.textMuted, fontSize: 12, fontWeight: '600', marginTop: 4 },
  input: {
    height: 48, borderRadius: 14, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.surface, color: palette.text, paddingHorizontal: 14, fontSize: 14,
  },
  textArea: { height: 90, paddingTop: 12 },
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
  emptyState: {
    borderRadius: 16, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.surface, padding: 16, gap: 4, marginTop: 8,
  },
  emptyTitle: { color: palette.text, fontSize: 14, fontWeight: '700' },
  emptyDescription: { color: palette.textMuted, fontSize: 12, lineHeight: 18 },
});
