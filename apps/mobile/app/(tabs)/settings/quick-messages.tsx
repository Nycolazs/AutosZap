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

export default function QuickMessagesScreen() {
  const { api, me } = useSession();
  const queryClient = useQueryClient();
  const canEdit = !!(me as any)?.permissionMap?.QUICK_MESSAGES_MANAGE;

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState('');

  const [title, setTitle] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [content, setContent] = useState('');

  const query = useQuery({
    queryKey: ['mobile-quick-messages'],
    queryFn: () => api.listQuickMessages(),
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.createQuickMessage(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-quick-messages'] });
      closeModal();
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      api.updateQuickMessage(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-quick-messages'] });
      closeModal();
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteQuickMessage(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-quick-messages'] }),
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const items = (query.data ?? []).filter(
    (item: any) =>
      !search ||
      item.title?.toLowerCase().includes(search.toLowerCase()) ||
      item.shortcut?.toLowerCase().includes(search.toLowerCase()) ||
      item.content?.toLowerCase().includes(search.toLowerCase()),
  );

  function openCreate() {
    setEditing(null);
    setTitle('');
    setShortcut('');
    setContent('');
    setShowModal(true);
  }

  function openEdit(item: any) {
    setEditing(item);
    setTitle(item.title ?? '');
    setShortcut(item.shortcut ?? '');
    setContent(item.content ?? '');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
  }

  function save() {
    const payload = {
      title: title.trim(),
      shortcut: shortcut.trim() || undefined,
      content: content.trim(),
    };
    if (!payload.title) {
      Alert.alert('Campo obrigatório', 'Informe o título da mensagem.');
      return;
    }
    if (!payload.content) {
      Alert.alert('Campo obrigatório', 'Informe o conteúdo da mensagem.');
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function confirmDelete(item: any) {
    Alert.alert('Remover mensagem rápida', `Deseja remover "${item.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => deleteMutation.mutate(item.id) },
    ]);
  }

  return (
    <ScreenTransition>
      <View style={styles.screen}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar mensagem rápida..."
          placeholderTextColor={palette.textMuted}
        />

        {query.isLoading && !query.data ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl tintColor={palette.primary}
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Nenhuma mensagem rápida</Text>
                <Text style={styles.emptyDescription}>
                  Crie templates de mensagens para agilizar o atendimento nas conversas.
                </Text>
              </View>
            }
            renderItem={({ item }: { item: any }) => (
              <Pressable style={styles.card} onPress={() => canEdit && openEdit(item)}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                  {item.shortcut ? (
                    <View style={styles.shortcutPill}>
                      <Text style={styles.shortcutText}>/{item.shortcut}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.cardContent} numberOfLines={3}>{item.content}</Text>
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
              {editing ? 'Editar mensagem rápida' : 'Nova mensagem rápida'}
            </Text>

            <Text style={styles.label}>Título *</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle}
              placeholder="Ex: Boas-vindas" placeholderTextColor={palette.textMuted} />

            <Text style={styles.label}>Atalho</Text>
            <TextInput style={styles.input} value={shortcut} onChangeText={setShortcut}
              placeholder="Ex: ola (usado como /ola)" placeholderTextColor={palette.textMuted}
              autoCapitalize="none" />

            <Text style={styles.label}>Conteúdo *</Text>
            <TextInput style={[styles.input, styles.textArea]} value={content}
              onChangeText={setContent}
              placeholder="Olá {{nome}}, tudo bem? Sou da {{empresa}}..."
              placeholderTextColor={palette.textMuted} multiline textAlignVertical="top" />

            <Text style={styles.hint}>
              Variáveis disponíveis: {'{{nome}}'}, {'{{telefone}}'}, {'{{empresa}}'}, {'{{vendedor}}'}
            </Text>

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
  searchInput: {
    marginHorizontal: 16, marginTop: 12, height: 46, borderRadius: 16,
    borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface,
    color: palette.text, paddingHorizontal: 14, fontSize: 14,
  },
  listContent: { padding: 16, paddingBottom: 100, gap: 10 },
  card: {
    borderRadius: 20, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.backgroundElevated, padding: 14, gap: 8,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cardTitle: { color: palette.text, fontSize: 15, fontWeight: '700', flex: 1 },
  shortcutPill: {
    borderRadius: 999, backgroundColor: palette.primarySoft,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  shortcutText: { color: palette.primary, fontSize: 11, fontWeight: '700' },
  cardContent: { color: palette.textMuted, fontSize: 13, lineHeight: 19 },
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
  textArea: { height: 140, paddingTop: 12 },
  hint: { color: palette.textMuted, fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
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
