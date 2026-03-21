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

const KB_TYPES = ['INTERNAL', 'FAQ', 'URL', 'MIXED'] as const;
const KB_STATUSES = ['ACTIVE', 'DRAFT', 'INACTIVE'] as const;
const DOC_TYPES = ['TEXT', 'URL', 'NOTE'] as const;

const TYPE_LABELS: Record<string, string> = {
  INTERNAL: 'Interna',
  FAQ: 'FAQ',
  URL: 'URL',
  MIXED: 'Mista',
};
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

export default function KnowledgeBasesScreen() {
  const { api, me } = useSession();
  const queryClient = useQueryClient();
  const canEdit = !!(me as any)?.permissionMap?.KNOWLEDGE_BASES_MANAGE;

  const [search, setSearch] = useState('');
  const [showBaseModal, setShowBaseModal] = useState(false);
  const [editingBase, setEditingBase] = useState<any>(null);
  const [selectedBase, setSelectedBase] = useState<any>(null);
  const [showDocModal, setShowDocModal] = useState(false);

  // Base form
  const [baseName, setBaseName] = useState('');
  const [baseDescription, setBaseDescription] = useState('');
  const [baseType, setBaseType] = useState<string>('INTERNAL');
  const [baseStatus, setBaseStatus] = useState<string>('ACTIVE');

  // Doc form
  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState<string>('TEXT');
  const [docSourceUrl, setDocSourceUrl] = useState('');
  const [docContent, setDocContent] = useState('');

  const basesQuery = useQuery({
    queryKey: ['mobile-knowledge-bases'],
    queryFn: () => api.listKnowledgeBases(),
    refetchInterval: 30_000,
  });

  const docsQuery = useQuery({
    queryKey: ['mobile-kb-docs', selectedBase?.id],
    queryFn: () => api.listKnowledgeDocuments(selectedBase!.id),
    enabled: !!selectedBase?.id,
  });

  const createBaseMutation = useMutation({
    mutationFn: (payload: any) => api.createKnowledgeBase(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-knowledge-bases'] });
      closeBaseModal();
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const updateBaseMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      api.updateKnowledgeBase(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-knowledge-bases'] });
      closeBaseModal();
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const deleteBaseMutation = useMutation({
    mutationFn: (id: string) => api.deleteKnowledgeBase(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-knowledge-bases'] });
      if (selectedBase) setSelectedBase(null);
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const createDocMutation = useMutation({
    mutationFn: (payload: any) => api.createKnowledgeDocument(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-kb-docs', selectedBase?.id] });
      closeDocModal();
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (id: string) => api.deleteKnowledgeDocument(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-kb-docs', selectedBase?.id] });
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const bases = (basesQuery.data ?? []).filter(
    (b: any) =>
      !search ||
      b.name?.toLowerCase().includes(search.toLowerCase()) ||
      b.description?.toLowerCase().includes(search.toLowerCase()),
  );

  function openCreateBase() {
    setEditingBase(null);
    setBaseName('');
    setBaseDescription('');
    setBaseType('INTERNAL');
    setBaseStatus('ACTIVE');
    setShowBaseModal(true);
  }

  function openEditBase(base: any) {
    setEditingBase(base);
    setBaseName(base.name ?? '');
    setBaseDescription(base.description ?? '');
    setBaseType(base.type ?? 'INTERNAL');
    setBaseStatus(base.status ?? 'ACTIVE');
    setShowBaseModal(true);
  }

  function closeBaseModal() {
    setShowBaseModal(false);
    setEditingBase(null);
  }

  function saveBase() {
    const payload = {
      name: baseName.trim(),
      description: baseDescription.trim(),
      type: baseType,
      status: baseStatus,
    };
    if (!payload.name) {
      Alert.alert('Campo obrigatório', 'Informe o nome da base.');
      return;
    }
    if (editingBase) {
      updateBaseMutation.mutate({ id: editingBase.id, payload });
    } else {
      createBaseMutation.mutate(payload);
    }
  }

  function confirmDeleteBase(base: any) {
    Alert.alert('Remover base', `Deseja remover "${base.name}"? Todos os documentos serão perdidos.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => deleteBaseMutation.mutate(base.id) },
    ]);
  }

  function openAddDoc() {
    setDocTitle('');
    setDocType('TEXT');
    setDocSourceUrl('');
    setDocContent('');
    setShowDocModal(true);
  }

  function closeDocModal() {
    setShowDocModal(false);
  }

  function saveDoc() {
    const payload = {
      knowledgeBaseId: selectedBase.id,
      title: docTitle.trim(),
      type: docType,
      sourceUrl: docSourceUrl.trim() || undefined,
      content: docContent.trim(),
    };
    if (!payload.title) {
      Alert.alert('Campo obrigatório', 'Informe o título do documento.');
      return;
    }
    createDocMutation.mutate(payload);
  }

  function confirmDeleteDoc(doc: any) {
    Alert.alert('Remover documento', `Deseja remover "${doc.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => deleteDocMutation.mutate(doc.id) },
    ]);
  }

  // If a base is selected, show documents view
  if (selectedBase) {
    const docs = docsQuery.data ?? [];
    return (
      <ScreenTransition>
        <View style={styles.screen}>
          <Pressable style={styles.backButton} onPress={() => setSelectedBase(null)}>
            <Text style={styles.backText}>← Voltar às bases</Text>
          </Pressable>

          <View style={styles.selectedHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedName}>{selectedBase.name}</Text>
              {selectedBase.description ? (
                <Text style={styles.selectedDesc}>{selectedBase.description}</Text>
              ) : null}
            </View>
            <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLORS[selectedBase.status] ?? palette.textMuted}22` }]}>
              <Text style={[styles.statusText, { color: STATUS_COLORS[selectedBase.status] ?? palette.textMuted }]}>
                {STATUS_LABELS[selectedBase.status] ?? selectedBase.status}
              </Text>
            </View>
          </View>

          <View style={styles.docHeader}>
            <Text style={styles.cardTitle}>Documentos ({docs.length})</Text>
            {canEdit && (
              <Pressable style={styles.addDocButton} onPress={openAddDoc}>
                <Text style={styles.addDocText}>+ Novo</Text>
              </Pressable>
            )}
          </View>

          {docsQuery.isLoading ? (
            <ActivityIndicator color={palette.primary} style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={docs}
              keyExtractor={(item: any) => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>Nenhum documento</Text>
                  <Text style={styles.emptyDescription}>
                    Adicione documentos para alimentar esta base de conhecimento.
                  </Text>
                </View>
              }
              renderItem={({ item }: { item: any }) => (
                <View style={styles.docCard}>
                  <View style={styles.docTop}>
                    <Text style={styles.docTitle} numberOfLines={1}>{item.title}</Text>
                    <View style={styles.docTypePill}>
                      <Text style={styles.docTypeText}>{item.type}</Text>
                    </View>
                  </View>
                  {item.sourceUrl ? (
                    <Text style={styles.docMeta} numberOfLines={1}>URL: {item.sourceUrl}</Text>
                  ) : null}
                  {item.content ? (
                    <Text style={styles.docContent} numberOfLines={3}>{item.content}</Text>
                  ) : null}
                  <Text style={styles.docMeta}>
                    Criado em {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                  </Text>
                  {canEdit && (
                    <Pressable
                      style={styles.deleteDocButton}
                      onPress={() => confirmDeleteDoc(item)}
                    >
                      <Text style={styles.deleteDocText}>Remover</Text>
                    </Pressable>
                  )}
                </View>
              )}
            />
          )}
        </View>

        {/* Add Document Modal */}
        <Modal visible={showDocModal} animationType="slide" presentationStyle="pageSheet">
          <KeyboardAvoidingView
            style={styles.modalContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Novo documento</Text>

              <Text style={styles.label}>Título</Text>
              <TextInput style={styles.input} value={docTitle} onChangeText={setDocTitle}
                placeholder="Nome do documento" placeholderTextColor={palette.textMuted} />

              <Text style={styles.label}>Tipo</Text>
              <View style={styles.chipRow}>
                {DOC_TYPES.map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.chip, docType === t && styles.chipActive]}
                    onPress={() => setDocType(t)}
                  >
                    <Text style={[styles.chipText, docType === t && styles.chipTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </View>

              {(docType === 'URL' || docType === 'TEXT') && (
                <>
                  <Text style={styles.label}>URL de origem</Text>
                  <TextInput style={styles.input} value={docSourceUrl} onChangeText={setDocSourceUrl}
                    placeholder="https://..." placeholderTextColor={palette.textMuted}
                    keyboardType="url" autoCapitalize="none" />
                </>
              )}

              <Text style={styles.label}>Conteúdo</Text>
              <TextInput style={[styles.input, styles.textArea]} value={docContent}
                onChangeText={setDocContent} placeholder="Conteúdo do documento..."
                placeholderTextColor={palette.textMuted} multiline textAlignVertical="top" />

              <View style={styles.modalActions}>
                <Pressable style={styles.cancelButton} onPress={closeDocModal}>
                  <Text style={styles.cancelText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveButton, createDocMutation.isPending && styles.saveButtonDisabled]}
                  disabled={createDocMutation.isPending}
                  onPress={saveDoc}
                >
                  <Text style={styles.saveText}>
                    {createDocMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </ScreenTransition>
    );
  }

  // Bases list view
  return (
    <ScreenTransition>
      <View style={styles.screen}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar bases..."
          placeholderTextColor={palette.textMuted}
        />

        {basesQuery.isLoading && !basesQuery.data ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : (
          <FlatList
            data={bases}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                tintColor={palette.primary}
                refreshing={basesQuery.isRefetching}
                onRefresh={() => void basesQuery.refetch()}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Nenhuma base encontrada</Text>
                <Text style={styles.emptyDescription}>
                  {canEdit
                    ? 'Crie sua primeira base de conhecimento para alimentar os assistentes de IA.'
                    : 'Bases de conhecimento serão exibidas aqui quando configuradas.'}
                </Text>
              </View>
            }
            renderItem={({ item }: { item: any }) => (
              <Pressable style={styles.card} onPress={() => setSelectedBase(item)}>
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
                <View style={styles.cardMeta}>
                  <View style={styles.typePill}>
                    <Text style={styles.typeText}>{TYPE_LABELS[item.type] ?? item.type}</Text>
                  </View>
                  <Text style={styles.metaText}>
                    {item.documentCount ?? item._count?.documents ?? 0} documentos
                  </Text>
                </View>
                {canEdit && (
                  <View style={styles.cardActions}>
                    <Pressable style={styles.editButton} onPress={() => openEditBase(item)}>
                      <Text style={styles.editText}>Editar</Text>
                    </Pressable>
                    <Pressable style={styles.dangerButton} onPress={() => confirmDeleteBase(item)}>
                      <Text style={styles.dangerText}>Remover</Text>
                    </Pressable>
                  </View>
                )}
              </Pressable>
            )}
          />
        )}

        {canEdit && (
          <Pressable style={styles.fab} onPress={openCreateBase}>
            <Text style={styles.fabText}>＋</Text>
          </Pressable>
        )}
      </View>

      {/* Create/Edit Base Modal */}
      <Modal visible={showBaseModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>
              {editingBase ? 'Editar base' : 'Nova base de conhecimento'}
            </Text>

            <Text style={styles.label}>Nome</Text>
            <TextInput style={styles.input} value={baseName} onChangeText={setBaseName}
              placeholder="Nome da base" placeholderTextColor={palette.textMuted} />

            <Text style={styles.label}>Descrição</Text>
            <TextInput style={[styles.input, styles.textArea]} value={baseDescription}
              onChangeText={setBaseDescription} placeholder="Descrição opcional..."
              placeholderTextColor={palette.textMuted} multiline textAlignVertical="top" />

            <Text style={styles.label}>Tipo</Text>
            <View style={styles.chipRow}>
              {KB_TYPES.map((t) => (
                <Pressable
                  key={t}
                  style={[styles.chip, baseType === t && styles.chipActive]}
                  onPress={() => setBaseType(t)}
                >
                  <Text style={[styles.chipText, baseType === t && styles.chipTextActive]}>
                    {TYPE_LABELS[t]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Status</Text>
            <View style={styles.chipRow}>
              {KB_STATUSES.map((s) => (
                <Pressable
                  key={s}
                  style={[styles.chip, baseStatus === s && styles.chipActive]}
                  onPress={() => setBaseStatus(s)}
                >
                  <Text style={[styles.chipText, baseStatus === s && styles.chipTextActive]}>
                    {STATUS_LABELS[s]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={closeBaseModal}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.saveButton, (createBaseMutation.isPending || updateBaseMutation.isPending) && styles.saveButtonDisabled]}
                disabled={createBaseMutation.isPending || updateBaseMutation.isPending}
                onPress={saveBase}
              >
                <Text style={styles.saveText}>
                  {createBaseMutation.isPending || updateBaseMutation.isPending ? 'Salvando...' : 'Salvar'}
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
  searchInput: {
    marginHorizontal: 16,
    marginTop: 12,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.text,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  listContent: { padding: 16, paddingBottom: 100, gap: 10 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 14,
    gap: 8,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  cardName: { color: palette.text, fontSize: 15, fontWeight: '700', flex: 1 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardDesc: { color: palette.textMuted, fontSize: 13, lineHeight: 19 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typePill: {
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  typeText: { color: palette.primary, fontSize: 11, fontWeight: '700' },
  metaText: { color: palette.textMuted, fontSize: 12 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  editButton: {
    flex: 1,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editText: { color: palette.text, fontSize: 12, fontWeight: '700' },
  dangerButton: {
    flex: 1,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,141,155,0.35)',
    backgroundColor: 'rgba(255,141,155,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { color: palette.danger, fontSize: 12, fontWeight: '700' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '600', marginTop: -2 },

  // Selected base detail
  backButton: { padding: 16, paddingBottom: 4 },
  backText: { color: palette.primary, fontSize: 14, fontWeight: '600' },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  selectedName: { color: palette.text, fontSize: 18, fontWeight: '800' },
  selectedDesc: { color: palette.textMuted, fontSize: 13, marginTop: 2 },
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  cardTitle: { color: palette.text, fontSize: 16, fontWeight: '700' },
  addDocButton: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDocText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  docCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 12,
    gap: 6,
  },
  docTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  docTitle: { color: palette.text, fontSize: 14, fontWeight: '700', flex: 1 },
  docTypePill: {
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  docTypeText: { color: palette.primary, fontSize: 10, fontWeight: '700' },
  docMeta: { color: palette.textMuted, fontSize: 11 },
  docContent: { color: palette.textMuted, fontSize: 12, lineHeight: 18 },
  deleteDocButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,141,155,0.08)',
    marginTop: 2,
  },
  deleteDocText: { color: palette.danger, fontSize: 11, fontWeight: '700' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: palette.background },
  modalContent: { padding: 20, paddingBottom: 40, gap: 10 },
  modalTitle: { color: palette.text, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  label: { color: palette.textMuted, fontSize: 12, fontWeight: '600', marginTop: 4 },
  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.text,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  textArea: { height: 110, paddingTop: 12, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  chipText: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: palette.primary },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: palette.text, fontSize: 14, fontWeight: '700' },
  saveButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 4,
    marginTop: 8,
  },
  emptyTitle: { color: palette.text, fontSize: 14, fontWeight: '700' },
  emptyDescription: { color: palette.textMuted, fontSize: 12, lineHeight: 18 },
});
