import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AudienceType = 'CUSTOM' | 'LIST' | 'TAG' | 'GROUP';

interface CampaignSummary {
  id: string;
  name: string;
  description?: string;
  audienceType: AudienceType;
  message: string;
  status: string;
  scheduledAt?: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  hasMedia?: boolean;
}

interface FormState {
  name: string;
  description: string;
  audienceType: AudienceType;
  message: string;
  scheduledAt: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  audienceType: 'CUSTOM',
  message: '',
  scheduledAt: '',
};

const AUDIENCE_OPTIONS: { value: AudienceType; label: string }[] = [
  { value: 'CUSTOM', label: 'Personalizado' },
  { value: 'LIST', label: 'Lista' },
  { value: 'TAG', label: 'Tag' },
  { value: 'GROUP', label: 'Grupo' },
];

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  DRAFT: { label: 'Rascunho', bg: palette.primarySoft, color: palette.primary },
  SCHEDULED: { label: 'Agendada', bg: 'rgba(243, 201, 63, 0.16)', color: palette.warning },
  SENDING: { label: 'Enviando', bg: palette.primarySoft, color: palette.primary },
  SENT: { label: 'Enviada', bg: 'rgba(73, 216, 185, 0.16)', color: palette.success },
  FAILED: { label: 'Falhou', bg: 'rgba(255, 141, 155, 0.16)', color: palette.danger },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, bg: palette.primarySoft, color: palette.primary };
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function CampaignsScreen() {
  const queryClient = useQueryClient();
  const { api, me } = useSession();
  const canManage = !!me?.permissionMap?.CAMPAIGNS_MANAGE;

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  /* ---- Queries --------------------------------------------------- */

  const campaignsQuery = useQuery({
    queryKey: ['mobile-campaigns'],
    queryFn: () => api.listCampaigns(),
    refetchInterval: 20000,
  });

  /* ---- Mutations ------------------------------------------------- */

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['mobile-campaigns'] }),
    [queryClient],
  );

  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof api.createCampaign>[0]) =>
      api.createCampaign(payload),
    onSuccess: async () => {
      await invalidate();
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof api.updateCampaign>[1] }) =>
      api.updateCampaign(id, payload),
    onSuccess: async () => {
      await invalidate();
      closeModal();
    },
  });

  const sendMutation = useMutation({
    mutationFn: (campaignId: string) => api.sendCampaign(campaignId),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (campaignId: string) => api.deleteCampaign(campaignId),
    onSuccess: invalidate,
  });

  /* ---- Modal helpers --------------------------------------------- */

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }, []);

  const openEdit = useCallback((c: CampaignSummary) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      description: c.description ?? '',
      audienceType: c.audienceType,
      message: c.message,
      scheduledAt: c.scheduledAt ?? '',
    });
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }, []);

  const handleSave = useCallback(() => {
    if (!form.name.trim() || !form.message.trim()) {
      Alert.alert('Campos obrigatórios', 'Preencha o nome e a mensagem da campanha.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      audienceType: form.audienceType,
      targetConfig: {},
      message: form.message.trim(),
      scheduledAt: form.scheduledAt.trim() || undefined,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
    }
  }, [form, editingId, createMutation, updateMutation]);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  /* ---- Delete confirm -------------------------------------------- */

  const confirmDelete = useCallback(
    (c: CampaignSummary) => {
      Alert.alert(
        'Excluir campanha',
        `Tem certeza que deseja excluir "${c.name}"?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Excluir',
            style: 'destructive',
            onPress: () => deleteMutation.mutate(c.id),
          },
        ],
      );
    },
    [deleteMutation],
  );

  /* ---- Send confirm ---------------------------------------------- */

  const confirmSend = useCallback(
    (c: CampaignSummary) => {
      Alert.alert(
        'Enviar campanha',
        `Deseja enviar "${c.name}" para ${c.recipientCount} destinatário(s)?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Enviar',
            onPress: () => sendMutation.mutate(c.id),
          },
        ],
      );
    },
    [sendMutation],
  );

  /* ---- Render ---------------------------------------------------- */

  const renderItem = useCallback(
    ({ item }: { item: CampaignSummary }) => {
      const cfg = getStatusConfig(item.status);
      const isDraft = item.status === 'DRAFT';

      return (
        <Pressable
          style={styles.card}
          onPress={canManage ? () => openEdit(item) : undefined}
        >
          {/* Top row */}
          <View style={styles.topRow}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>

          {/* Description */}
          {!!item.description && (
            <Text style={styles.description} numberOfLines={2}>
              {item.description}
            </Text>
          )}

          {/* Message preview */}
          <Text style={styles.message} numberOfLines={3}>
            {item.message}
          </Text>

          {/* Metrics */}
          <View style={styles.metricsRow}>
            <Metric label="Destinatários" value={item.recipientCount} />
            <Metric label="Enviados" value={item.sentCount} />
            <Metric label="Falhas" value={item.failedCount} color={item.failedCount > 0 ? palette.danger : undefined} />
          </View>

          {/* Actions */}
          {canManage && (
            <View style={styles.actionsRow}>
              {isDraft && (
                <Pressable
                  style={[styles.actionButton, styles.sendButton]}
                  onPress={() => confirmSend(item)}
                  disabled={sendMutation.isPending}
                >
                  <Text style={styles.sendButtonText}>
                    {sendMutation.isPending ? 'Enviando...' : 'Enviar'}
                  </Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => confirmDelete(item)}
                disabled={deleteMutation.isPending}
              >
                <Text style={styles.deleteButtonText}>Excluir</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      );
    },
    [canManage, openEdit, confirmSend, confirmDelete, sendMutation.isPending, deleteMutation.isPending],
  );

  return (
    <ScreenTransition>
      <View style={styles.screen}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>DISPAROS</Text>
          <Text style={styles.title}>Campanhas</Text>
          <Text style={styles.subtitle}>
            Gerencie campanhas de envio em massa para seus contatos.
          </Text>
        </View>

        {/* List */}
        {campaignsQuery.isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : (
          <FlatList
            data={(campaignsQuery.data ?? []) as any[]}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            refreshControl={
              <RefreshControl
                tintColor={palette.primary}
                refreshing={campaignsQuery.isRefetching}
                onRefresh={() => void campaignsQuery.refetch()}
              />
            }
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📢</Text>
                <Text style={styles.emptyTitle}>Nenhuma campanha ainda</Text>
                <Text style={styles.emptyDescription}>
                  {canManage
                    ? 'Toque no botão abaixo para criar sua primeira campanha de envio.'
                    : 'Campanhas criadas pela equipe aparecerão aqui.'}
                </Text>
              </View>
            }
          />
        )}

        {/* FAB */}
        {canManage && (
          <Pressable style={styles.fab} onPress={openCreate}>
            <Text style={styles.fabText}>+</Text>
          </Pressable>
        )}

        {/* Create / Edit Modal */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={closeModal}
        >
          <View style={styles.modalContainer}>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Modal header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingId ? 'Editar campanha' : 'Nova campanha'}
                </Text>
                <Pressable onPress={closeModal}>
                  <Text style={styles.modalClose}>Fechar</Text>
                </Pressable>
              </View>

              {/* Name */}
              <Text style={styles.fieldLabel}>Nome *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                placeholder="Ex: Promoção de Natal"
                placeholderTextColor={palette.textMuted}
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>Descrição</Text>
              <TextInput
                style={styles.input}
                value={form.description}
                onChangeText={(t) => setForm((f) => ({ ...f, description: t }))}
                placeholder="Descrição opcional"
                placeholderTextColor={palette.textMuted}
              />

              {/* Audience type */}
              <Text style={styles.fieldLabel}>Tipo de audiência</Text>
              <View style={styles.audienceRow}>
                {AUDIENCE_OPTIONS.map((opt) => {
                  const selected = form.audienceType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[
                        styles.audienceChip,
                        selected && styles.audienceChipSelected,
                      ]}
                      onPress={() => setForm((f) => ({ ...f, audienceType: opt.value }))}
                    >
                      <Text
                        style={[
                          styles.audienceChipText,
                          selected && styles.audienceChipTextSelected,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Message */}
              <Text style={styles.fieldLabel}>Mensagem *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.message}
                onChangeText={(t) => setForm((f) => ({ ...f, message: t }))}
                placeholder="Digite a mensagem da campanha..."
                placeholderTextColor={palette.textMuted}
                multiline
                textAlignVertical="top"
              />

              {/* Scheduled at */}
              <Text style={styles.fieldLabel}>Agendar (opcional)</Text>
              <TextInput
                style={styles.input}
                value={form.scheduledAt}
                onChangeText={(t) => setForm((f) => ({ ...f, scheduledAt: t }))}
                placeholder="Ex: 2026-04-01T10:00:00"
                placeholderTextColor={palette.textMuted}
              />

              {/* Error */}
              {(createMutation.isError || updateMutation.isError) && (
                <Text style={styles.errorText}>
                  Erro ao salvar campanha. Tente novamente.
                </Text>
              )}

              {/* Save */}
              <Pressable
                style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingId ? 'Salvar alterações' : 'Criar campanha'}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </Modal>
      </View>
    </ScreenTransition>
  );
}

/* ------------------------------------------------------------------ */
/*  Metric component                                                   */
/* ------------------------------------------------------------------ */

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, color ? { color } : undefined]}>
        {value}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

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
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 100,
    gap: 12,
  },

  /* Empty state */
  emptyState: {
    marginTop: 32,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 24,
    gap: 8,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyDescription: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },

  /* Card */
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  name: {
    flex: 1,
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  message: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },

  /* Metrics */
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  metricLabel: {
    color: palette.textMuted,
    fontSize: 11,
  },
  metricValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },

  /* Action buttons */
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    backgroundColor: palette.primary,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: 'rgba(255, 141, 155, 0.16)',
  },
  deleteButtonText: {
    color: palette.danger,
    fontSize: 14,
    fontWeight: '700',
  },

  /* FAB */
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 30,
  },

  /* Modal */
  modalContainer: {
    flex: 1,
    backgroundColor: palette.background,
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    padding: 20,
    paddingBottom: 40,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800',
  },
  modalClose: {
    color: palette.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  fieldLabel: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    color: palette.text,
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },

  /* Audience chips */
  audienceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  audienceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  audienceChipSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  audienceChipText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  audienceChipTextSelected: {
    color: palette.primary,
  },

  /* Error */
  errorText: {
    color: palette.danger,
    fontSize: 13,
    textAlign: 'center',
  },

  /* Save button */
  saveButton: {
    borderRadius: 18,
    backgroundColor: palette.primary,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
