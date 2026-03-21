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
import type { TeamMemberRecord } from '@autoszap/platform-types';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

const ROLES = ['ADMIN', 'SELLER'] as const;
const STATUSES = ['PENDING', 'ACTIVE', 'INACTIVE'] as const;
const ROLE_LABELS: Record<string, string> = { ADMIN: 'Administrador', SELLER: 'Vendedor' };
const STATUS_LABELS: Record<string, string> = { PENDING: 'Pendente', ACTIVE: 'Ativo', INACTIVE: 'Inativo' };
const STATUS_COLORS: Record<string, string> = {
  PENDING: palette.warning,
  ACTIVE: palette.success,
  INACTIVE: palette.textMuted,
};

export default function TeamModuleScreen() {
  const { api, me } = useSession();
  const queryClient = useQueryClient();
  const isAdmin = (me as any)?.role === 'ADMIN' || (me as any)?.normalizedRole === 'ADMIN';

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPermModal, setShowPermModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [permMember, setPermMember] = useState<any>(null);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [role, setRole] = useState<string>('SELLER');
  const [memberStatus, setMemberStatus] = useState<string>('ACTIVE');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Permissions state
  const [memberPermissions, setMemberPermissions] = useState<Record<string, boolean>>({});

  const teamQuery = useQuery<TeamMemberRecord[]>({
    queryKey: ['mobile-team'],
    queryFn: () => api.listTeam(),
    refetchInterval: 30_000,
  });

  const permCatalogQuery = useQuery({
    queryKey: ['mobile-permission-catalog'],
    queryFn: () => api.listPermissionCatalog(),
    enabled: showPermModal,
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.createTeamMember(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-team'] });
      closeModal();
      Alert.alert('Membro adicionado', 'O convite foi enviado com sucesso.');
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      api.updateTeamMember(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-team'] });
      closeModal();
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteTeamMember(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-team'] }),
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const members = (Array.isArray(teamQuery.data) ? teamQuery.data : []).filter(
    (m) =>
      !search ||
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()),
  );

  const summaryTotal = teamQuery.data?.length ?? 0;
  const summaryAdmins = teamQuery.data?.filter((m) => m.role === 'ADMIN').length ?? 0;
  const summaryActive = teamQuery.data?.filter((m) => m.status === 'ACTIVE').length ?? 0;

  function openCreate() {
    setEditing(null);
    setName('');
    setEmail('');
    setTitle('');
    setRole('SELLER');
    setMemberStatus('ACTIVE');
    setPassword('');
    setConfirmPassword('');
    setShowModal(true);
  }

  function openEdit(member: any) {
    setEditing(member);
    setName(member.name ?? '');
    setEmail(member.email ?? '');
    setTitle(member.title ?? '');
    setRole(member.role ?? 'SELLER');
    setMemberStatus(member.status ?? 'ACTIVE');
    setPassword('');
    setConfirmPassword('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
  }

  function save() {
    if (!name.trim() || name.trim().length < 2) {
      Alert.alert('Campo obrigatório', 'Informe o nome (mín. 2 caracteres).');
      return;
    }
    if (!editing && !email.trim()) {
      Alert.alert('Campo obrigatório', 'Informe o email.');
      return;
    }
    if (password && password !== confirmPassword) {
      Alert.alert('Senhas diferentes', 'A confirmação de senha não confere.');
      return;
    }
    if (password && password.length < 6) {
      Alert.alert('Senha curta', 'A senha deve ter ao menos 6 caracteres.');
      return;
    }

    const payload: any = {
      name: name.trim(),
      title: title.trim() || undefined,
      role,
      status: memberStatus,
    };
    if (!editing) {
      payload.email = email.trim();
    }
    if (password) {
      payload.password = password;
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function confirmDelete(member: any) {
    Alert.alert('Desativar membro', `Deseja remover "${member.name}" da equipe?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => deleteMutation.mutate(member.id) },
    ]);
  }

  function openPermissions(member: any) {
    setPermMember(member);
    const perms: Record<string, boolean> = {};
    if (member.permissions && Array.isArray(member.permissions)) {
      member.permissions.forEach((p: string) => { perms[p] = true; });
    } else if (member.permissionMap) {
      Object.keys(member.permissionMap).forEach((k) => {
        perms[k] = !!member.permissionMap[k];
      });
    }
    setMemberPermissions(perms);
    setShowPermModal(true);
  }

  function togglePerm(key: string) {
    setMemberPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function savePermissions() {
    if (!permMember) return;
    const permissions = Object.keys(memberPermissions).filter((k) => memberPermissions[k]);
    updateMutation.mutate(
      { id: permMember.id, payload: { permissions } },
    );
    setShowPermModal(false);
    setPermMember(null);
  }

  if (teamQuery.isLoading && !teamQuery.data) {
    return (
      <ScreenTransition>
        <View style={styles.centerState}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </ScreenTransition>
    );
  }

  return (
    <ScreenTransition>
      <View style={styles.screen}>
        {/* Summary bar */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summaryTotal}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summaryAdmins}</Text>
            <Text style={styles.summaryLabel}>Admins</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: palette.success }]}>{summaryActive}</Text>
            <Text style={styles.summaryLabel}>Ativos</Text>
          </View>
        </View>

        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar membro..."
          placeholderTextColor={palette.textMuted}
        />

        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl tintColor={palette.primary}
              refreshing={teamQuery.isRefetching}
              onRefresh={() => void teamQuery.refetch()} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nenhum membro encontrado</Text>
              <Text style={styles.emptyDescription}>
                Adicione membros à equipe para distribuir o atendimento.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(item.name ?? '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <Text style={styles.cardEmail}>{item.email}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLORS[item.status] ?? palette.textMuted}22` }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] ?? palette.textMuted }]}>
                    {STATUS_LABELS[item.status] ?? item.status}
                  </Text>
                </View>
              </View>

              <View style={styles.tagRow}>
                <View style={styles.rolePill}>
                  <Text style={styles.roleText}>{ROLE_LABELS[item.role] ?? item.role}</Text>
                </View>
                {item.title ? (
                  <Text style={styles.titleText}>{item.title}</Text>
                ) : null}
              </View>

              {isAdmin && (
                <View style={styles.cardActions}>
                  <Pressable style={styles.actionButton} onPress={() => openEdit(item)}>
                    <Text style={styles.actionText}>Editar</Text>
                  </Pressable>
                  {item.role !== 'ADMIN' && (
                    <Pressable style={styles.actionButton} onPress={() => openPermissions(item)}>
                      <Text style={styles.actionText}>Permissões</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.dangerSmall} onPress={() => confirmDelete(item)}>
                    <Text style={styles.dangerSmallText}>Remover</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
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
              {editing ? 'Editar membro' : 'Convidar membro'}
            </Text>

            <Text style={styles.label}>Nome *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              placeholder="Nome completo" placeholderTextColor={palette.textMuted} />

            <Text style={styles.label}>Email {editing ? '' : '*'}</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail}
              placeholder="email@exemplo.com" placeholderTextColor={palette.textMuted}
              keyboardType="email-address" autoCapitalize="none" editable={!editing} />

            <Text style={styles.label}>Cargo</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle}
              placeholder="Ex: Gerente de vendas" placeholderTextColor={palette.textMuted} />

            <Text style={styles.label}>Perfil</Text>
            <View style={styles.chipRow}>
              {ROLES.map((r) => (
                <Pressable key={r} style={[styles.chip, role === r && styles.chipActive]}
                  onPress={() => setRole(r)}>
                  <Text style={[styles.chipText, role === r && styles.chipTextActive]}>
                    {ROLE_LABELS[r]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Status</Text>
            <View style={styles.chipRow}>
              {STATUSES.map((s) => (
                <Pressable key={s} style={[styles.chip, memberStatus === s && styles.chipActive]}
                  onPress={() => setMemberStatus(s)}>
                  <Text style={[styles.chipText, memberStatus === s && styles.chipTextActive]}>
                    {STATUS_LABELS[s]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Senha {editing ? '(deixe vazio para manter)' : ''}</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword}
              placeholder="Mínimo 6 caracteres" placeholderTextColor={palette.textMuted}
              secureTextEntry />

            <Text style={styles.label}>Confirmar senha</Text>
            <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword}
              placeholder="Repita a senha" placeholderTextColor={palette.textMuted}
              secureTextEntry />

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

      {/* Permissions Modal */}
      <Modal visible={showPermModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Permissões de {permMember?.name}
            </Text>
            <Text style={styles.permHint}>
              {permMember?.role === 'ADMIN'
                ? 'Administradores possuem todas as permissões automaticamente.'
                : 'Selecione as permissões que este membro terá acesso.'}
            </Text>

            {permCatalogQuery.isLoading ? (
              <ActivityIndicator color={palette.primary} style={{ marginTop: 20 }} />
            ) : (
              (permCatalogQuery.data ?? []).map((group: any) => (
                <View key={group.category ?? group.group} style={styles.permGroup}>
                  <Text style={styles.permGroupTitle}>
                    {group.category ?? group.group}
                  </Text>
                  {(group.permissions ?? group.items ?? []).map((perm: any) => {
                    const key = perm.key ?? perm.code ?? perm.name;
                    const isChecked = !!memberPermissions[key];
                    const disabled = permMember?.role === 'ADMIN';
                    return (
                      <Pressable
                        key={key}
                        style={styles.permRow}
                        onPress={() => !disabled && togglePerm(key)}
                        disabled={disabled}
                      >
                        <View style={[
                          styles.checkbox,
                          isChecked && styles.checkboxActive,
                          disabled && styles.checkboxDisabled,
                        ]}>
                          {isChecked && <Text style={styles.checkMark}>✓</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.permLabel}>{perm.label ?? key}</Text>
                          {perm.description ? (
                            <Text style={styles.permDesc}>{perm.description}</Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))
            )}

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => { setShowPermModal(false); setPermMember(null); }}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
              {permMember?.role !== 'ADMIN' && (
                <Pressable style={styles.saveButton} onPress={savePermissions}>
                  <Text style={styles.saveText}>Salvar permissões</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenTransition>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  summaryRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12,
  },
  summaryCard: {
    flex: 1, borderRadius: 14, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.backgroundElevated, padding: 10, alignItems: 'center', gap: 2,
  },
  summaryValue: { color: palette.text, fontSize: 20, fontWeight: '800' },
  summaryLabel: { color: palette.textMuted, fontSize: 11 },
  searchInput: {
    marginHorizontal: 16, marginTop: 10, height: 46, borderRadius: 16,
    borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface,
    color: palette.text, paddingHorizontal: 14, fontSize: 14,
  },
  listContent: { padding: 16, paddingBottom: 100, gap: 10 },
  card: {
    borderRadius: 20, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.backgroundElevated, padding: 14, gap: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: palette.primary, fontSize: 16, fontWeight: '800' },
  cardName: { color: palette.text, fontSize: 15, fontWeight: '700' },
  cardEmail: { color: palette.textMuted, fontSize: 12 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rolePill: {
    borderRadius: 999, backgroundColor: palette.primarySoft,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  roleText: { color: palette.primary, fontSize: 11, fontWeight: '700' },
  titleText: { color: palette.textMuted, fontSize: 12, fontStyle: 'italic' },
  cardActions: { flexDirection: 'row', gap: 6, marginTop: 2 },
  actionButton: {
    flex: 1, height: 34, borderRadius: 10, borderWidth: 1,
    borderColor: palette.border, backgroundColor: palette.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  actionText: { color: palette.text, fontSize: 11, fontWeight: '700' },
  dangerSmall: {
    height: 34, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
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

  // Permissions
  permHint: { color: palette.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 6 },
  permGroup: { gap: 6, marginTop: 10 },
  permGroupTitle: {
    color: palette.primary, fontSize: 13, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1,
  },
  permRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2,
    borderColor: palette.border, backgroundColor: palette.surface,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkboxActive: { borderColor: palette.primary, backgroundColor: palette.primarySoft },
  checkboxDisabled: { opacity: 0.4 },
  checkMark: { color: palette.primary, fontSize: 14, fontWeight: '800' },
  permLabel: { color: palette.text, fontSize: 13, fontWeight: '600' },
  permDesc: { color: palette.textMuted, fontSize: 11, lineHeight: 16, marginTop: 1 },

  emptyState: {
    borderRadius: 16, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.surface, padding: 16, gap: 4, marginTop: 8,
  },
  emptyTitle: { color: palette.text, fontSize: 14, fontWeight: '700' },
  emptyDescription: { color: palette.textMuted, fontSize: 12, lineHeight: 18 },
});
