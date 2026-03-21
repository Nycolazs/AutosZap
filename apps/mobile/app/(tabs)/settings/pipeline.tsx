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

const PRESET_COLORS = [
  '#3d96ff', '#49d8b9', '#f3c93f', '#ff8d9b', '#a78bfa',
  '#fb923c', '#38bdf8', '#4ade80', '#f472b6', '#94a3b8',
];

export default function PipelineScreen() {
  const { api, me } = useSession();
  const queryClient = useQueryClient();
  const canEdit = !!(me as any)?.permissionMap?.CRM_VIEW;

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const [name, setName] = useState('');
  const [color, setColor] = useState('#3d96ff');
  const [order, setOrder] = useState('0');
  const [probability, setProbability] = useState('0');

  const pipelineQuery = useQuery({
    queryKey: ['mobile-pipeline-stages'],
    queryFn: () => api.listPipelineStages(),
    refetchInterval: 30_000,
  });

  const stagesQuery = {
    data: pipelineQuery.data?.stages ?? [],
    isLoading: pipelineQuery.isLoading,
    isRefetching: pipelineQuery.isRefetching,
    refetch: pipelineQuery.refetch,
  };

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.createPipelineStage(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-pipeline-stages'] });
      closeModal();
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      api.updatePipelineStage(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-pipeline-stages'] });
      closeModal();
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deletePipelineStage(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-pipeline-stages'] }),
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const stages = [...stagesQuery.data].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

  function openCreate() {
    setEditing(null);
    setName('');
    setColor('#3d96ff');
    setOrder(String(stages.length));
    setProbability('0');
    setShowModal(true);
  }

  function openEdit(item: any) {
    setEditing(item);
    setName(item.name ?? '');
    setColor(item.color ?? '#3d96ff');
    setOrder(String(item.order ?? 0));
    setProbability(String(item.probability ?? 0));
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
  }

  function save() {
    const payload = {
      name: name.trim(),
      color: color.trim(),
      order: parseInt(order) || 0,
      probability: parseInt(probability) || 0,
    };
    if (!payload.name) {
      Alert.alert('Campo obrigatório', 'Informe o nome da etapa.');
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function confirmDelete(item: any) {
    Alert.alert('Remover etapa', `Deseja remover "${item.name}"? Leads nesta etapa podem ser afetados.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => deleteMutation.mutate(item.id) },
    ]);
  }

  return (
    <ScreenTransition>
      <View style={styles.screen}>
        {stagesQuery.isLoading && !stagesQuery.data ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : (
          <FlatList
            data={stages}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl tintColor={palette.primary}
                refreshing={stagesQuery.isRefetching}
                onRefresh={() => void stagesQuery.refetch()} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Nenhuma etapa cadastrada</Text>
                <Text style={styles.emptyDescription}>
                  Configure as etapas do pipeline para organizar seus leads no CRM.
                </Text>
              </View>
            }
            renderItem={({ item }: { item: any }) => (
              <Pressable style={styles.card} onPress={() => canEdit && openEdit(item)}>
                <View style={styles.cardTop}>
                  <View style={[styles.colorDot, { backgroundColor: item.color || palette.primary }]} />
                  <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                </View>
                <View style={styles.cardMetaRow}>
                  <View style={styles.metricPill}>
                    <Text style={styles.metricText}>Ordem: {item.order ?? 0}</Text>
                  </View>
                  <View style={styles.metricPill}>
                    <Text style={styles.metricText}>Probabilidade: {item.probability ?? 0}%</Text>
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
        <KeyboardAvoidingView style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>
              {editing ? 'Editar etapa' : 'Nova etapa do pipeline'}
            </Text>

            <Text style={styles.label}>Nome *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              placeholder="Ex: Qualificação" placeholderTextColor={palette.textMuted} />

            <Text style={styles.label}>Cor</Text>
            <View style={styles.colorGrid}>
              {PRESET_COLORS.map((c) => (
                <Pressable
                  key={c}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c },
                    color === c && styles.colorSwatchActive,
                  ]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>
            <TextInput style={styles.input} value={color} onChangeText={setColor}
              placeholder="#3d96ff" placeholderTextColor={palette.textMuted} autoCapitalize="none" />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Ordem</Text>
                <TextInput style={styles.input} value={order} onChangeText={setOrder}
                  placeholder="0" placeholderTextColor={palette.textMuted} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Probabilidade (%)</Text>
                <TextInput style={styles.input} value={probability} onChangeText={setProbability}
                  placeholder="0" placeholderTextColor={palette.textMuted} keyboardType="number-pad" />
              </View>
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
    backgroundColor: palette.backgroundElevated, padding: 14, gap: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  colorDot: { width: 14, height: 14, borderRadius: 7 },
  cardName: { color: palette.text, fontSize: 16, fontWeight: '700', flex: 1 },
  cardMetaRow: { flexDirection: 'row', gap: 8 },
  metricPill: {
    borderRadius: 999, backgroundColor: palette.primarySoft,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  metricText: { color: palette.primary, fontSize: 11, fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
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
  row: { flexDirection: 'row', gap: 10 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch: {
    width: 40, height: 40, borderRadius: 12, borderWidth: 2, borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: '#fff', shadowColor: '#fff', shadowOpacity: 0.5, shadowRadius: 6,
    elevation: 4,
  },
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
