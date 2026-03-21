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

const STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Ativo', INACTIVE: 'Inativo' };
const STATUS_COLORS: Record<string, string> = { ACTIVE: palette.success, INACTIVE: palette.textMuted };

export default function AssistantsScreen() {
  const { api, me } = useSession();
  const queryClient = useQueryClient();
  const canEdit = !!(me as any)?.permissionMap?.ASSISTANTS_MANAGE;

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [objective, setObjective] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState('0.2');
  const [model, setModel] = useState('gpt-4.1-mini');
  const [status, setStatus] = useState<string>('ACTIVE');
  const [selectedBaseIds, setSelectedBaseIds] = useState<string[]>([]);
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);

  const assistantsQuery = useQuery({
    queryKey: ['mobile-assistants'],
    queryFn: () => api.listAssistants(),
    refetchInterval: 30_000,
  });

  const basesQuery = useQuery({
    queryKey: ['mobile-knowledge-bases'],
    queryFn: () => api.listKnowledgeBases(),
  });

  const toolsQuery = useQuery({
    queryKey: ['mobile-ai-tools'],
    queryFn: () => api.listAiTools(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.createAssistant(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-assistants'] });
      closeModal();
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      api.updateAssistant(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-assistants'] });
      closeModal();
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAssistant(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-assistants'] }),
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  function openCreate() {
    setEditing(null);
    setName('');
    setDescription('');
    setObjective('');
    setSystemPrompt('');
    setTemperature('0.2');
    setModel('gpt-4.1-mini');
    setStatus('ACTIVE');
    setSelectedBaseIds([]);
    setSelectedToolIds([]);
    setShowModal(true);
  }

  function openEdit(item: any) {
    setEditing(item);
    setName(item.name ?? '');
    setDescription(item.description ?? '');
    setObjective(item.objective ?? '');
    setSystemPrompt(item.systemPrompt ?? '');
    setTemperature(String(item.temperature ?? 0.2));
    setModel(item.model ?? 'gpt-4.1-mini');
    setStatus(item.status ?? 'ACTIVE');
    setSelectedBaseIds(item.knowledgeBaseIds ?? []);
    setSelectedToolIds(item.toolIds ?? []);
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
      objective: objective.trim() || undefined,
      systemPrompt: systemPrompt.trim(),
      temperature: parseFloat(temperature) || 0.2,
      model: model.trim() || 'gpt-4.1-mini',
      status,
      knowledgeBaseIds: selectedBaseIds,
      toolIds: selectedToolIds,
    };
    if (!payload.name) {
      Alert.alert('Campo obrigatório', 'Informe o nome do assistente.');
      return;
    }
    if (!payload.systemPrompt || payload.systemPrompt.length < 10) {
      Alert.alert('Prompt insuficiente', 'O prompt do sistema deve ter ao menos 10 caracteres.');
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function confirmDelete(item: any) {
    Alert.alert('Remover assistente', `Deseja remover "${item.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => deleteMutation.mutate(item.id) },
    ]);
  }

  function toggleSelection(id: string, list: string[], setter: (v: string[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  const assistants = assistantsQuery.data ?? [];
  const bases = basesQuery.data ?? [];
  const tools = toolsQuery.data ?? [];

  return (
    <ScreenTransition>
      <View style={styles.screen}>
        {assistantsQuery.isLoading && !assistantsQuery.data ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : (
          <FlatList
            data={assistants}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                tintColor={palette.primary}
                refreshing={assistantsQuery.isRefetching}
                onRefresh={() => void assistantsQuery.refetch()}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Nenhum assistente configurado</Text>
                <Text style={styles.emptyDescription}>
                  Assistentes de IA automatizam o atendimento usando bases de conhecimento e ferramentas.
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
                  Modelo: {item.model ?? '-'} • Temp: {item.temperature ?? '-'}
                </Text>
                <View style={styles.badgeRow}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {item.knowledgeBaseIds?.length ?? 0} bases
                    </Text>
                  </View>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {item.toolIds?.length ?? 0} ferramentas
                    </Text>
                  </View>
                </View>
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
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>
              {editing ? 'Editar assistente' : 'Novo assistente'}
            </Text>

            <Text style={styles.label}>Nome *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              placeholder="Nome do assistente" placeholderTextColor={palette.textMuted} />

            <Text style={styles.label}>Descrição</Text>
            <TextInput style={[styles.input, styles.textArea]} value={description}
              onChangeText={setDescription} placeholder="Descrição opcional..."
              placeholderTextColor={palette.textMuted} multiline textAlignVertical="top" />

            <Text style={styles.label}>Objetivo</Text>
            <TextInput style={styles.input} value={objective} onChangeText={setObjective}
              placeholder="Ex: Atendimento ao cliente" placeholderTextColor={palette.textMuted} />

            <Text style={styles.label}>Prompt do sistema *</Text>
            <TextInput style={[styles.input, { height: 140 }]} value={systemPrompt}
              onChangeText={setSystemPrompt} placeholder="Instruções do assistente..."
              placeholderTextColor={palette.textMuted} multiline textAlignVertical="top" />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Modelo</Text>
                <TextInput style={styles.input} value={model} onChangeText={setModel}
                  placeholder="gpt-4.1-mini" placeholderTextColor={palette.textMuted} autoCapitalize="none" />
              </View>
              <View style={{ flex: 0.5 }}>
                <Text style={styles.label}>Temperatura</Text>
                <TextInput style={styles.input} value={temperature} onChangeText={setTemperature}
                  placeholder="0.2" placeholderTextColor={palette.textMuted} keyboardType="decimal-pad" />
              </View>
            </View>

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

            {bases.length > 0 && (
              <>
                <Text style={styles.label}>Bases de conhecimento</Text>
                <View style={styles.chipRow}>
                  {bases.map((b: any) => (
                    <Pressable
                      key={b.id}
                      style={[styles.chip, selectedBaseIds.includes(b.id) && styles.chipActive]}
                      onPress={() => toggleSelection(b.id, selectedBaseIds, setSelectedBaseIds)}
                    >
                      <Text style={[styles.chipText, selectedBaseIds.includes(b.id) && styles.chipTextActive]}>
                        {b.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {tools.length > 0 && (
              <>
                <Text style={styles.label}>Ferramentas de IA</Text>
                <View style={styles.chipRow}>
                  {tools.map((t: any) => (
                    <Pressable
                      key={t.id}
                      style={[styles.chip, selectedToolIds.includes(t.id) && styles.chipActive]}
                      onPress={() => toggleSelection(t.id, selectedToolIds, setSelectedToolIds)}
                    >
                      <Text style={[styles.chipText, selectedToolIds.includes(t.id) && styles.chipTextActive]}>
                        {t.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={closeModal}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.saveButton, (createMutation.isPending || updateMutation.isPending) && styles.saveButtonDisabled]}
                disabled={createMutation.isPending || updateMutation.isPending}
                onPress={save}
              >
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 14,
    gap: 6,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cardName: { color: palette.text, fontSize: 15, fontWeight: '700', flex: 1 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardDesc: { color: palette.textMuted, fontSize: 13, lineHeight: 19 },
  cardMeta: { color: palette.textMuted, fontSize: 12 },
  badgeRow: { flexDirection: 'row', gap: 8 },
  badge: {
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { color: palette.primary, fontSize: 11, fontWeight: '700' },
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
  row: { flexDirection: 'row', gap: 10 },
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
