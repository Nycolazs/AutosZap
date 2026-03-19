import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

export default function WorkflowModuleScreen() {
  const { api } = useSession();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['mobile-workspace-settings'],
    queryFn: () => api.getWorkspaceSettings(),
  });

  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [inactivityMinutes, setInactivityMinutes] = useState('60');
  const [waitingAutoCloseMinutes, setWaitingAutoCloseMinutes] = useState('120');
  const [sendBusinessHoursAutoReply, setSendBusinessHoursAutoReply] = useState(false);
  const [sendOutOfHoursAutoReply, setSendOutOfHoursAutoReply] = useState(false);
  const [sendResolvedAutoReply, setSendResolvedAutoReply] = useState(false);
  const [sendClosedAutoReply, setSendClosedAutoReply] = useState(false);
  const [sendWindowClosedTemplateReply, setSendWindowClosedTemplateReply] = useState(false);

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) {
      return;
    }

    setTimezone(settings.timezone);
    setInactivityMinutes(String(settings.inactivityTimeoutMinutes));
    setWaitingAutoCloseMinutes(
      String(settings.waitingAutoCloseTimeoutMinutes ?? 120),
    );
    setSendBusinessHoursAutoReply(settings.sendBusinessHoursAutoReply);
    setSendOutOfHoursAutoReply(settings.sendOutOfHoursAutoReply);
    setSendResolvedAutoReply(settings.sendResolvedAutoReply);
    setSendClosedAutoReply(settings.sendClosedAutoReply);
    setSendWindowClosedTemplateReply(settings.sendWindowClosedTemplateReply);
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateWorkspaceSettings({
        timezone: timezone.trim(),
        inactivityTimeoutMinutes: Number(inactivityMinutes),
        waitingAutoCloseTimeoutMinutes: Number(waitingAutoCloseMinutes),
        sendBusinessHoursAutoReply,
        sendOutOfHoursAutoReply,
        sendResolvedAutoReply,
        sendClosedAutoReply,
        sendWindowClosedTemplateReply,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-workspace-settings'] });
      Alert.alert('Configurações salvas', 'Fluxo e automações atualizados com sucesso.');
    },
    onError: (error: Error) => {
      Alert.alert('Falha ao salvar', error.message);
    },
  });

  if (settingsQuery.isLoading && !settingsQuery.data) {
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
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            tintColor={palette.primary}
            refreshing={settingsQuery.isRefetching}
            onRefresh={() => void settingsQuery.refetch()}
          />
        }
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Parâmetros de timeout</Text>
          <TextInput
            value={timezone}
            onChangeText={setTimezone}
            placeholder="America/Sao_Paulo"
            placeholderTextColor={palette.textMuted}
            style={styles.input}
          />
          <TextInput
            value={inactivityMinutes}
            onChangeText={setInactivityMinutes}
            keyboardType="number-pad"
            placeholder="Minutos de inatividade"
            placeholderTextColor={palette.textMuted}
            style={styles.input}
          />
          <TextInput
            value={waitingAutoCloseMinutes}
            onChangeText={setWaitingAutoCloseMinutes}
            keyboardType="number-pad"
            placeholder="Minutos para auto-encerrar aguardando"
            placeholderTextColor={palette.textMuted}
            style={styles.input}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Respostas automáticas</Text>
          <SwitchRow
            label="Auto-reply em horário comercial"
            value={sendBusinessHoursAutoReply}
            onChange={setSendBusinessHoursAutoReply}
          />
          <SwitchRow
            label="Auto-reply fora de horário"
            value={sendOutOfHoursAutoReply}
            onChange={setSendOutOfHoursAutoReply}
          />
          <SwitchRow
            label="Mensagem automática ao resolver"
            value={sendResolvedAutoReply}
            onChange={setSendResolvedAutoReply}
          />
          <SwitchRow
            label="Mensagem automática ao encerrar"
            value={sendClosedAutoReply}
            onChange={setSendClosedAutoReply}
          />
          <SwitchRow
            label="Template quando janela 24h fecha"
            value={sendWindowClosedTemplateReply}
            onChange={setSendWindowClosedTemplateReply}
          />
        </View>

        <Pressable
          style={[styles.saveButton, saveMutation.isPending && styles.saveButtonDisabled]}
          disabled={saveMutation.isPending}
          onPress={() => saveMutation.mutate()}
        >
          <Text style={styles.saveButtonText}>
            {saveMutation.isPending ? 'Salvando...' : 'Salvar configurações'}
          </Text>
        </Pressable>
      </ScrollView>
    </ScreenTransition>
  );
}

function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        thumbColor={value ? '#ffffff' : '#d1d8e5'}
        trackColor={{
          false: 'rgba(148, 167, 199, 0.35)',
          true: 'rgba(61, 150, 255, 0.62)',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.background,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 12,
    gap: 10,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.text,
    paddingHorizontal: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  switchLabel: {
    flex: 1,
    color: palette.text,
    fontSize: 13,
  },
  saveButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
