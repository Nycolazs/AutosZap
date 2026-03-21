import { useCallback, useMemo, useState } from 'react';
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

interface ContactRecord {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  source?: string;
  notes?: string;
  lastInteractionAt?: string;
  tags?: TagSummary[];
}

interface TagSummary {
  id: string;
  name: string;
  color?: string;
}

interface ContactForm {
  name: string;
  phone: string;
  email: string;
  company: string;
  jobTitle: string;
  notes: string;
  tagIds: string[];
}

const EMPTY_FORM: ContactForm = {
  name: '',
  phone: '',
  email: '',
  company: '',
  jobTitle: '',
  notes: '',
  tagIds: [],
};

export default function ContactsModuleScreen() {
  const { api, me } = useSession();
  const queryClient = useQueryClient();
  const canEdit = !!me?.permissionMap?.CONTACTS_EDIT;

  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRecord | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);

  // ── Queries ──────────────────────────────────────────────────────────

  const contactsQuery = useQuery({
    queryKey: ['mobile-contacts', search],
    queryFn: () => api.listContacts({ search, limit: 100 }),
    refetchInterval: 30_000,
  });

  const tagsQuery = useQuery({
    queryKey: ['mobile-tags'],
    queryFn: () => api.listTags(),
    staleTime: 60_000,
  });

  const contacts = contactsQuery.data?.data ?? [];
  const allTags = (tagsQuery.data ?? []) as any[];

  // ── Mutations ────────────────────────────────────────────────────────

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['mobile-contacts'] }),
    [queryClient],
  );

  const createMutation = useMutation({
    mutationFn: (payload: ContactForm) =>
      api.createContact({
        name: payload.name.trim(),
        phone: payload.phone.trim(),
        email: payload.email.trim() || undefined,
        company: payload.company.trim() || undefined,
        jobTitle: payload.jobTitle.trim() || undefined,
        notes: payload.notes.trim() || undefined,
        tagIds: payload.tagIds.length ? payload.tagIds : undefined,
      }),
    onSuccess: async () => {
      closeModal();
      await invalidate();
    },
    onError: (error: Error) => {
      Alert.alert('Falha ao criar contato', error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ContactForm }) =>
      api.updateContact(id, {
        name: payload.name.trim(),
        phone: payload.phone.trim(),
        email: payload.email.trim() || undefined,
        company: payload.company.trim() || undefined,
        jobTitle: payload.jobTitle.trim() || undefined,
        notes: payload.notes.trim() || undefined,
        tagIds: payload.tagIds.length ? payload.tagIds : undefined,
      }),
    onSuccess: async () => {
      closeModal();
      await invalidate();
    },
    onError: (error: Error) => {
      Alert.alert('Falha ao atualizar contato', error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (contactId: string) => api.deleteContact(contactId),
    onSuccess: async () => {
      await invalidate();
    },
    onError: (error: Error) => {
      Alert.alert('Falha ao remover contato', error.message);
    },
  });

  // ── Helpers ──────────────────────────────────────────────────────────

  const openCreateModal = useCallback(() => {
    setEditingContact(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }, []);

  const openEditModal = useCallback((contact: ContactRecord) => {
    setEditingContact(contact);
    setForm({
      name: contact.name,
      phone: contact.phone,
      email: contact.email ?? '',
      company: contact.company ?? '',
      jobTitle: contact.jobTitle ?? '',
      notes: contact.notes ?? '',
      tagIds: contact.tags?.map((t) => t.id) ?? [],
    });
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setEditingContact(null);
    setForm(EMPTY_FORM);
  }, []);

  const handleSave = useCallback(() => {
    if (!form.name.trim() || !form.phone.trim()) return;
    if (editingContact) {
      updateMutation.mutate({ id: editingContact.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  }, [form, editingContact, updateMutation, createMutation]);

  const confirmDelete = useCallback(
    (contact: ContactRecord) => {
      Alert.alert(
        'Remover contato',
        `Tem certeza que deseja remover "${contact.name}"? Esta ação não pode ser desfeita.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Remover',
            style: 'destructive',
            onPress: () => deleteMutation.mutate(contact.id),
          },
        ],
      );
    },
    [deleteMutation],
  );

  const toggleTag = useCallback(
    (tagId: string) => {
      setForm((prev) => ({
        ...prev,
        tagIds: prev.tagIds.includes(tagId)
          ? prev.tagIds.filter((id) => id !== tagId)
          : [...prev.tagIds, tagId],
      }));
    },
    [],
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const canSave = !!form.name.trim() && !!form.phone.trim() && !isSaving;

  const selectedTagSet = useMemo(() => new Set(form.tagIds), [form.tagIds]);

  // ── Render ───────────────────────────────────────────────────────────

  const renderContact = useCallback(
    ({ item }: { item: ContactRecord }) => (
      <Pressable
        style={styles.card}
        onLongPress={canEdit ? () => confirmDelete(item) : undefined}
        onPress={canEdit ? () => openEditModal(item) : undefined}
      >
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{item.phone}</Text>
          </View>
          {canEdit && (
            <Pressable
              style={styles.deleteButton}
              onPress={() => confirmDelete(item)}
              disabled={deleteMutation.isPending}
            >
              <Text style={styles.deleteText}>Remover</Text>
            </Pressable>
          )}
        </View>

        {(item.email || item.company) && (
          <View style={styles.cardDetails}>
            {item.email ? <Text style={styles.meta}>Email: {item.email}</Text> : null}
            {item.company ? <Text style={styles.meta}>Empresa: {item.company}</Text> : null}
          </View>
        )}

        {item.tags && item.tags.length > 0 && (
          <View style={styles.tags}>
            {item.tags.map((tag) => (
              <View
                key={tag.id}
                style={[
                  styles.tagPill,
                  tag.color ? { borderColor: tag.color + '55', backgroundColor: tag.color + '18' } : null,
                ]}
              >
                <Text style={[styles.tagText, tag.color ? { color: tag.color } : null]}>
                  {tag.name}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Pressable>
    ),
    [canEdit, confirmDelete, openEditModal, deleteMutation.isPending],
  );

  return (
    <ScreenTransition>
      <View style={styles.screen}>
        {/* Search */}
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar contato por nome, telefone ou email"
          placeholderTextColor={palette.textMuted}
          style={styles.search}
        />

        {/* List */}
        {contactsQuery.isLoading && !contacts.length ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : (
          <FlatList
            data={contacts as any[]}
            keyExtractor={(item: any) => item.id}
            renderItem={renderContact}
            refreshControl={
              <RefreshControl
                tintColor={palette.primary}
                refreshing={contactsQuery.isRefetching}
                onRefresh={() => void contactsQuery.refetch()}
              />
            }
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Nenhum contato encontrado.</Text>
                <Text style={styles.emptyDescription}>
                  Ajuste a busca ou cadastre um novo contato.
                </Text>
              </View>
            }
          />
        )}

        {/* FAB */}
        {canEdit && (
          <Pressable style={styles.fab} onPress={openCreateModal}>
            <Text style={styles.fabText}>+</Text>
          </Pressable>
        )}

        {/* Create / Edit Modal */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent
          onRequestClose={closeModal}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable style={styles.modalOverlay} onPress={closeModal}>
              <Pressable style={styles.modalContent} onPress={() => {}}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.modalTitle}>
                    {editingContact ? 'Editar contato' : 'Novo contato'}
                  </Text>

                  <Text style={styles.label}>Nome *</Text>
                  <TextInput
                    value={form.name}
                    onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                    placeholder="Nome do contato"
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Telefone *</Text>
                  <TextInput
                    value={form.phone}
                    onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))}
                    placeholder="+55 11 99999-9999"
                    placeholderTextColor={palette.textMuted}
                    keyboardType="phone-pad"
                    style={styles.input}
                  />

                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    value={form.email}
                    onChangeText={(v) => setForm((p) => ({ ...p, email: v }))}
                    placeholder="email@exemplo.com"
                    placeholderTextColor={palette.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={styles.input}
                  />

                  <Text style={styles.label}>Empresa</Text>
                  <TextInput
                    value={form.company}
                    onChangeText={(v) => setForm((p) => ({ ...p, company: v }))}
                    placeholder="Nome da empresa"
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Cargo</Text>
                  <TextInput
                    value={form.jobTitle}
                    onChangeText={(v) => setForm((p) => ({ ...p, jobTitle: v }))}
                    placeholder="Cargo do contato"
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Observações</Text>
                  <TextInput
                    value={form.notes}
                    onChangeText={(v) => setForm((p) => ({ ...p, notes: v }))}
                    placeholder="Anotações sobre o contato"
                    placeholderTextColor={palette.textMuted}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    style={[styles.input, styles.textArea]}
                  />

                  {/* Tags */}
                  {allTags.length > 0 && (
                    <>
                      <Text style={styles.label}>Tags</Text>
                      <View style={styles.tagSelector}>
                        {allTags.map((tag) => {
                          const isSelected = selectedTagSet.has(tag.id);
                          return (
                            <Pressable
                              key={tag.id}
                              onPress={() => toggleTag(tag.id)}
                              style={[
                                styles.tagOption,
                                isSelected && styles.tagOptionSelected,
                                tag.color && isSelected
                                  ? { borderColor: tag.color, backgroundColor: tag.color + '22' }
                                  : null,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.tagOptionText,
                                  isSelected && tag.color ? { color: tag.color } : null,
                                ]}
                              >
                                {tag.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}

                  {/* Actions */}
                  <View style={styles.modalActions}>
                    <Pressable style={styles.cancelButton} onPress={closeModal}>
                      <Text style={styles.cancelButtonText}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.saveButton, !canSave && styles.buttonDisabled]}
                      onPress={handleSave}
                      disabled={!canSave}
                    >
                      <Text style={styles.saveButtonText}>
                        {isSaving
                          ? 'Salvando...'
                          : editingContact
                            ? 'Atualizar'
                            : 'Criar contato'}
                      </Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </ScreenTransition>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  search: {
    height: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    color: palette.text,
    marginBottom: 12,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    gap: 10,
    paddingBottom: 80,
  },

  // Card
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 14,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: palette.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  name: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
  },
  meta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  cardDetails: {
    paddingLeft: 48,
    gap: 2,
  },

  // Tags
  tags: {
    paddingLeft: 48,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    color: palette.text,
    fontSize: 11,
    fontWeight: '600',
  },

  // Delete button on card
  deleteButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 141, 155, 0.4)',
    backgroundColor: 'rgba(255, 141, 155, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteText: {
    color: palette.danger,
    fontSize: 11,
    fontWeight: '700',
  },

  // Empty state
  emptyState: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 4,
    marginTop: 12,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyDescription: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },

  // FAB
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
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
    marginTop: -2,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: palette.backgroundElevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  label: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    height: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    color: palette.text,
    fontSize: 14,
  },
  textArea: {
    height: 80,
    paddingTop: 12,
    paddingBottom: 12,
  },

  // Tag selector in modal
  tagSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  tagOption: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagOptionSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  tagOptionText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '600',
  },

  // Modal actions
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
    marginBottom: 8,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  saveButton: {
    flex: 1,
    height: 48,
    borderRadius: 18,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
