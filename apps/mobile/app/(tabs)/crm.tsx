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

/* ---------- helpers ---------- */

function formatBRL(value: number | string | undefined | null): string {
  const num = Number(value) || 0;
  return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ---------- types ---------- */

interface LeadFormState {
  name: string;
  company: string;
  value: string;
  stageId: string;
  assignedToId: string;
  notes: string;
}

const EMPTY_FORM: LeadFormState = {
  name: '',
  company: '',
  value: '',
  stageId: '',
  assignedToId: '',
  notes: '',
};

/* ---------- component ---------- */

export default function CrmScreen() {
  const { api, me } = useSession();
  const queryClient = useQueryClient();

  const canManage = Boolean(me?.permissionMap?.CRM_VIEW);

  /* --- state --- */
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [form, setForm] = useState<LeadFormState>(EMPTY_FORM);
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);

  /* --- queries --- */
  const leadsQuery = useQuery({
    queryKey: ['mobile-leads', search],
    queryFn: () => api.listLeads({ search }),
    refetchInterval: 15_000,
  });

  const pipelineQuery = useQuery({
    queryKey: ['mobile-pipeline-stages'],
    queryFn: () => api.listPipelineStages(),
  });

  const teamQuery = useQuery({
    queryKey: ['mobile-team'],
    queryFn: () => api.listTeam(),
  });

  /* --- mutations --- */
  const invalidateLeads = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['mobile-leads'] });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof api.createLead>[0]) => api.createLead(payload),
    onSuccess: async () => {
      await invalidateLeads();
      closeModal();
    },
    onError: (err: Error) => Alert.alert('Erro ao criar lead', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof api.updateLead>[1] }) =>
      api.updateLead(id, payload),
    onSuccess: async () => {
      await invalidateLeads();
      closeModal();
    },
    onError: (err: Error) => Alert.alert('Erro ao atualizar lead', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteLead(id),
    onSuccess: invalidateLeads,
    onError: (err: Error) => Alert.alert('Erro ao remover lead', err.message),
  });

  /* --- pipeline & grouping --- */
  const pipeline = pipelineQuery.data;
  const stages = useMemo(() => {
    if (!pipeline?.stages) return [];
    return [...pipeline.stages].sort((a, b) => a.order - b.order);
  }, [pipeline]);

  const grouped = useMemo(() => {
    const leads = leadsQuery.data?.data ?? [];
    const map: Record<string, typeof leads> = {};
    for (const lead of leads) {
      const key = lead.stage.id;
      if (!map[key]) map[key] = [];
      map[key].push(lead);
    }
    // sort leads within each stage by order
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return map;
  }, [leadsQuery.data]);

  const sections = useMemo(() => {
    return stages.map((stage) => ({
      stage,
      leads: grouped[stage.id] ?? [],
    }));
  }, [stages, grouped]);

  /* --- modal helpers --- */
  const closeModal = useCallback(() => {
    setModalVisible(false);
    setEditingLeadId(null);
    setForm(EMPTY_FORM);
    setStagePickerOpen(false);
    setAssigneePickerOpen(false);
  }, []);

  const openCreateModal = useCallback(() => {
    setEditingLeadId(null);
    setForm({
      ...EMPTY_FORM,
      stageId: stages[0]?.id ?? '',
    });
    setModalVisible(true);
  }, [stages]);

  const openEditModal = useCallback(
    (lead: { id: string; name: string; company?: string | null; value: number | string; stage: { id: string }; assignedTo?: { id: string } | null }) => {
      if (!canManage) return;
      setEditingLeadId(lead.id);
      setForm({
        name: lead.name,
        company: lead.company ?? '',
        value: String(lead.value ?? ''),
        stageId: lead.stage.id,
        assignedToId: lead.assignedTo?.id ?? '',
        notes: '',
      });
      setModalVisible(true);
    },
    [canManage],
  );

  const handleDeleteLead = useCallback(
    (leadId: string, leadName: string) => {
      if (!canManage) return;
      Alert.alert('Remover lead', `Tem certeza que deseja remover "${leadName}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(leadId),
        },
      ]);
    },
    [canManage, deleteMutation],
  );

  const handleSubmit = useCallback(() => {
    if (!form.name.trim()) {
      Alert.alert('Campo obrigatório', 'Informe o nome do lead.');
      return;
    }
    if (!form.stageId) {
      Alert.alert('Campo obrigatório', 'Selecione uma etapa.');
      return;
    }

    const payload = {
      pipelineId: pipeline?.id ?? '',
      stageId: form.stageId,
      name: form.name.trim(),
      company: form.company.trim() || undefined,
      value: String(Number(form.value) || 0),
      notes: form.notes.trim() || undefined,
      assignedToId: form.assignedToId || undefined,
    };

    if (editingLeadId) {
      updateMutation.mutate({ id: editingLeadId, payload });
    } else {
      createMutation.mutate(payload);
    }
  }, [form, editingLeadId, pipeline, createMutation, updateMutation]);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  /* --- pick helpers --- */
  const selectedStageName = stages.find((s) => s.id === form.stageId)?.name ?? 'Selecionar etapa';
  const team = teamQuery.data ?? [];
  const selectedAssigneeName = team.find((t) => t.id === form.assignedToId)?.name ?? 'Nenhum';

  /* ---------- render ---------- */

  return (
    <ScreenTransition>
      <View style={styles.screen}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>CRM</Text>
          <Text style={styles.title}>Pipeline</Text>
          <Text style={styles.subtitle}>
            Gerencie leads por etapa e acompanhe oportunidades.
          </Text>
        </View>

        {/* Search */}
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar lead ou empresa"
          placeholderTextColor={palette.textMuted}
          style={styles.search}
        />

        {/* Content */}
        {leadsQuery.isLoading || pipelineQuery.isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : (
          <FlatList
            data={sections}
            keyExtractor={(item) => item.stage.id}
            refreshControl={
              <RefreshControl
                tintColor={palette.primary}
                refreshing={leadsQuery.isRefetching}
                onRefresh={() => {
                  void leadsQuery.refetch();
                  void pipelineQuery.refetch();
                }}
              />
            }
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Nenhuma etapa encontrada.</Text>
                <Text style={styles.emptyDescription}>
                  Configure seu pipeline no web para visualizar aqui.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const { stage, leads } = item;
              const stageColor = stage.color || palette.primary;

              return (
                <View style={styles.stageCard}>
                  {/* Stage header */}
                  <View style={styles.stageHeader}>
                    <View style={styles.stageHeaderLeft}>
                      <View style={[styles.stageIndicator, { backgroundColor: stageColor }]} />
                      <Text style={styles.stageTitle}>{stage.name}</Text>
                    </View>
                    <View style={[styles.countPill, { backgroundColor: `${stageColor}22` }]}>
                      <Text style={[styles.countText, { color: stageColor }]}>{leads.length}</Text>
                    </View>
                  </View>

                  {/* Leads */}
                  {leads.length === 0 ? (
                    <View style={styles.stageEmpty}>
                      <Text style={styles.stageEmptyText}>Nenhum lead nesta etapa.</Text>
                    </View>
                  ) : (
                    <View style={styles.stageList}>
                      {leads.map((lead) => (
                        <Pressable
                          key={lead.id}
                          style={styles.leadCard}
                          onPress={() => openEditModal(lead)}
                          onLongPress={() => handleDeleteLead(lead.id, lead.name)}
                        >
                          <View style={styles.leadTop}>
                            <Text style={styles.leadName} numberOfLines={1}>
                              {lead.name}
                            </Text>
                            <Text style={styles.leadValue}>{formatBRL(lead.value)}</Text>
                          </View>
                          {lead.company ? (
                            <Text style={styles.leadMeta} numberOfLines={1}>
                              {lead.company}
                            </Text>
                          ) : null}
                          <Text style={styles.leadAssignee} numberOfLines={1}>
                            {lead.assignedTo?.name ?? 'Sem responsável'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

        {/* FAB */}
        {canManage && (
          <Pressable style={styles.fab} onPress={openCreateModal}>
            <Text style={styles.fabIcon}>＋</Text>
          </Pressable>
        )}

        {/* Create / Edit Modal */}
        <Modal
          visible={modalVisible}
          transparent
          animationType="slide"
          onRequestClose={closeModal}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
                {/* Modal header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {editingLeadId ? 'Editar lead' : 'Novo lead'}
                  </Text>
                  <Pressable onPress={closeModal} hitSlop={12}>
                    <Text style={styles.modalClose}>✕</Text>
                  </Pressable>
                </View>

                {/* Name */}
                <Text style={styles.label}>Nome *</Text>
                <TextInput
                  style={styles.input}
                  value={form.name}
                  onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                  placeholder="Nome do lead"
                  placeholderTextColor={palette.textMuted}
                />

                {/* Company */}
                <Text style={styles.label}>Empresa</Text>
                <TextInput
                  style={styles.input}
                  value={form.company}
                  onChangeText={(v) => setForm((p) => ({ ...p, company: v }))}
                  placeholder="Nome da empresa"
                  placeholderTextColor={palette.textMuted}
                />

                {/* Value */}
                <Text style={styles.label}>Valor (R$)</Text>
                <TextInput
                  style={styles.input}
                  value={form.value}
                  onChangeText={(v) => setForm((p) => ({ ...p, value: v }))}
                  placeholder="0"
                  placeholderTextColor={palette.textMuted}
                  keyboardType="numeric"
                />

                {/* Stage picker */}
                <Text style={styles.label}>Etapa *</Text>
                <Pressable
                  style={styles.pickerButton}
                  onPress={() => setStagePickerOpen((v) => !v)}
                >
                  <Text style={styles.pickerText}>{selectedStageName}</Text>
                  <Text style={styles.pickerArrow}>{stagePickerOpen ? '▲' : '▼'}</Text>
                </Pressable>
                {stagePickerOpen && (
                  <View style={styles.pickerList}>
                    {stages.map((s) => (
                      <Pressable
                        key={s.id}
                        style={[
                          styles.pickerOption,
                          s.id === form.stageId && styles.pickerOptionActive,
                        ]}
                        onPress={() => {
                          setForm((p) => ({ ...p, stageId: s.id }));
                          setStagePickerOpen(false);
                        }}
                      >
                        <View style={[styles.pickerDot, { backgroundColor: s.color || palette.primary }]} />
                        <Text
                          style={[
                            styles.pickerOptionText,
                            s.id === form.stageId && styles.pickerOptionTextActive,
                          ]}
                        >
                          {s.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Assignee picker */}
                <Text style={styles.label}>Responsável</Text>
                <Pressable
                  style={styles.pickerButton}
                  onPress={() => setAssigneePickerOpen((v) => !v)}
                >
                  <Text style={styles.pickerText}>{selectedAssigneeName}</Text>
                  <Text style={styles.pickerArrow}>{assigneePickerOpen ? '▲' : '▼'}</Text>
                </Pressable>
                {assigneePickerOpen && (
                  <View style={styles.pickerList}>
                    <Pressable
                      style={[
                        styles.pickerOption,
                        !form.assignedToId && styles.pickerOptionActive,
                      ]}
                      onPress={() => {
                        setForm((p) => ({ ...p, assignedToId: '' }));
                        setAssigneePickerOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          !form.assignedToId && styles.pickerOptionTextActive,
                        ]}
                      >
                        Nenhum
                      </Text>
                    </Pressable>
                    {team.map((member) => (
                      <Pressable
                        key={member.id}
                        style={[
                          styles.pickerOption,
                          member.id === form.assignedToId && styles.pickerOptionActive,
                        ]}
                        onPress={() => {
                          setForm((p) => ({ ...p, assignedToId: member.id }));
                          setAssigneePickerOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            member.id === form.assignedToId && styles.pickerOptionTextActive,
                          ]}
                        >
                          {member.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Notes */}
                <Text style={styles.label}>Observações</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  value={form.notes}
                  onChangeText={(v) => setForm((p) => ({ ...p, notes: v }))}
                  placeholder="Notas sobre este lead"
                  placeholderTextColor={palette.textMuted}
                  multiline
                  numberOfLines={3}
                />

                {/* Submit */}
                <Pressable
                  style={[styles.submitButton, isSaving && styles.submitButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.submitText}>
                      {editingLeadId ? 'Salvar alterações' : 'Criar lead'}
                    </Text>
                  )}
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </ScreenTransition>
  );
}

/* ---------- styles ---------- */

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
    paddingBottom: 100,
    gap: 12,
  },

  /* empty */
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

  /* stage card */
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
  stageHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stageIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontWeight: '700',
    fontSize: 13,
  },
  stageList: {
    gap: 8,
  },
  stageEmpty: {
    padding: 12,
    alignItems: 'center',
  },
  stageEmptyText: {
    color: palette.textMuted,
    fontSize: 13,
  },

  /* lead card */
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
    color: palette.success,
    fontSize: 13,
    fontWeight: '700',
  },
  leadMeta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  leadAssignee: {
    color: palette.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },

  /* FAB */
  fab: {
    position: 'absolute',
    bottom: 28,
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
  fabIcon: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginTop: -2,
  },

  /* modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: palette.backgroundElevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
  },
  modalContent: {
    padding: 20,
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '800',
  },
  modalClose: {
    color: palette.textMuted,
    fontSize: 20,
    fontWeight: '700',
  },

  /* form */
  label: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
    height: 48,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.text,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  inputMultiline: {
    height: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },

  /* picker */
  pickerButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerText: {
    color: palette.text,
    fontSize: 15,
  },
  pickerArrow: {
    color: palette.textMuted,
    fontSize: 11,
  },
  pickerList: {
    borderRadius: 14,
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  pickerOptionActive: {
    backgroundColor: palette.primarySoft,
  },
  pickerOptionText: {
    color: palette.text,
    fontSize: 14,
  },
  pickerOptionTextActive: {
    color: palette.primary,
    fontWeight: '700',
  },
  pickerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  /* submit */
  submitButton: {
    height: 50,
    borderRadius: 16,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
