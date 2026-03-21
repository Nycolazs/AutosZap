import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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

export default function ProfileSettingsScreen() {
  const { api, me } = useSession();
  const queryClient = useQueryClient();

  // Profile
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileTitle, setProfileTitle] = useState('');

  // Workspace
  const [wsName, setWsName] = useState('');
  const [wsCompany, setWsCompany] = useState('');

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const workspaceQuery = useQuery({
    queryKey: ['mobile-workspace-info'],
    queryFn: () => api.meExtended(),
  });

  useEffect(() => {
    if (me) {
      setProfileName((me as any).name ?? '');
      setProfileEmail((me as any).email ?? '');
      setProfileTitle((me as any).title ?? '');
    }
  }, [me]);

  useEffect(() => {
    const ws = workspaceQuery.data?.workspace ?? (me as any)?.workspace;
    if (ws) {
      setWsName(ws.name ?? '');
      setWsCompany(ws.companyName ?? ws.legalName ?? '');
    }
  }, [workspaceQuery.data, me]);

  const profileMutation = useMutation({
    mutationFn: () =>
      api.updateProfile({
        name: profileName.trim(),
        title: profileTitle.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session-me'] });
      Alert.alert('Perfil salvo', 'Suas informações foram atualizadas.');
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const workspaceMutation = useMutation({
    mutationFn: () =>
      api.updateWorkspace({
        name: wsName.trim(),
        companyName: wsCompany.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session-me'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-workspace-info'] });
      Alert.alert('Workspace salvo', 'Informações da empresa atualizadas.');
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const passwordMutation = useMutation({
    mutationFn: () =>
      api.changePassword({
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      Alert.alert('Senha alterada', 'Sua senha foi atualizada com sucesso.');
    },
    onError: (err: Error) => Alert.alert('Erro ao alterar senha', err.message),
  });

  function saveProfile() {
    if (!profileName.trim()) {
      Alert.alert('Campo obrigatório', 'Informe seu nome.');
      return;
    }
    profileMutation.mutate();
  }

  function saveWorkspace() {
    if (!wsName.trim()) {
      Alert.alert('Campo obrigatório', 'Informe o nome do workspace.');
      return;
    }
    workspaceMutation.mutate();
  }

  function savePassword() {
    if (!currentPassword.trim()) {
      Alert.alert('Campo obrigatório', 'Informe a senha atual.');
      return;
    }
    if (!newPassword.trim() || newPassword.length < 6) {
      Alert.alert('Senha inválida', 'A nova senha deve ter ao menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Senhas diferentes', 'A confirmação não confere com a nova senha.');
      return;
    }
    passwordMutation.mutate();
  }

  return (
    <ScreenTransition>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile section */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Perfil</Text>
            <Text style={styles.cardSubtitle}>Suas informações pessoais na plataforma.</Text>

            <Text style={styles.label}>Nome</Text>
            <TextInput style={styles.input} value={profileName} onChangeText={setProfileName}
              placeholder="Seu nome" placeholderTextColor={palette.textMuted} />

            <Text style={styles.label}>Email</Text>
            <TextInput style={[styles.input, styles.inputDisabled]} value={profileEmail}
              editable={false} />

            <Text style={styles.label}>Cargo</Text>
            <TextInput style={styles.input} value={profileTitle} onChangeText={setProfileTitle}
              placeholder="Ex: Gerente comercial" placeholderTextColor={palette.textMuted} />

            <Pressable
              style={[styles.saveButton, profileMutation.isPending && styles.saveButtonDisabled]}
              disabled={profileMutation.isPending}
              onPress={saveProfile}
            >
              <Text style={styles.saveText}>
                {profileMutation.isPending ? 'Salvando...' : 'Salvar perfil'}
              </Text>
            </Pressable>
          </View>

          {/* Workspace section */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Workspace</Text>
            <Text style={styles.cardSubtitle}>Informações da empresa e organização.</Text>

            <Text style={styles.label}>Nome do workspace</Text>
            <TextInput style={styles.input} value={wsName} onChangeText={setWsName}
              placeholder="Nome da organização" placeholderTextColor={palette.textMuted} />

            <Text style={styles.label}>Razão social</Text>
            <TextInput style={styles.input} value={wsCompany} onChangeText={setWsCompany}
              placeholder="Razão social da empresa" placeholderTextColor={palette.textMuted} />

            <Pressable
              style={[styles.saveButton, workspaceMutation.isPending && styles.saveButtonDisabled]}
              disabled={workspaceMutation.isPending}
              onPress={saveWorkspace}
            >
              <Text style={styles.saveText}>
                {workspaceMutation.isPending ? 'Salvando...' : 'Salvar workspace'}
              </Text>
            </Pressable>
          </View>

          {/* Password section */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Segurança</Text>
            <Text style={styles.cardSubtitle}>Altere sua senha de acesso.</Text>

            <Text style={styles.label}>Senha atual</Text>
            <TextInput style={styles.input} value={currentPassword}
              onChangeText={setCurrentPassword} placeholder="Digite a senha atual"
              placeholderTextColor={palette.textMuted} secureTextEntry />

            <Text style={styles.label}>Nova senha</Text>
            <TextInput style={styles.input} value={newPassword}
              onChangeText={setNewPassword} placeholder="Mínimo 6 caracteres"
              placeholderTextColor={palette.textMuted} secureTextEntry />

            <Text style={styles.label}>Confirmar nova senha</Text>
            <TextInput style={styles.input} value={confirmNewPassword}
              onChangeText={setConfirmNewPassword} placeholder="Repita a nova senha"
              placeholderTextColor={palette.textMuted} secureTextEntry />

            <Pressable
              style={[styles.passwordButton, passwordMutation.isPending && styles.saveButtonDisabled]}
              disabled={passwordMutation.isPending}
              onPress={savePassword}
            >
              <Text style={styles.saveText}>
                {passwordMutation.isPending ? 'Alterando...' : 'Alterar senha'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenTransition>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  card: {
    borderRadius: 22, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.backgroundElevated, padding: 16, gap: 10,
  },
  cardTitle: { color: palette.text, fontSize: 17, fontWeight: '800' },
  cardSubtitle: { color: palette.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  label: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },
  input: {
    height: 48, borderRadius: 14, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.surface, color: palette.text, paddingHorizontal: 14, fontSize: 14,
  },
  inputDisabled: { opacity: 0.5 },
  saveButton: {
    height: 48, borderRadius: 14, backgroundColor: palette.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  passwordButton: {
    height: 48, borderRadius: 14, backgroundColor: palette.surfaceSoft,
    borderWidth: 1, borderColor: palette.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
});
