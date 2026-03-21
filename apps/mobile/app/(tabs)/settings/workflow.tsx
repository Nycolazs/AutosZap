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

const WEEKDAYS = [
  { key: 'monday', label: 'Segunda' },
  { key: 'tuesday', label: 'Terça' },
  { key: 'wednesday', label: 'Quarta' },
  { key: 'thursday', label: 'Quinta' },
  { key: 'friday', label: 'Sexta' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
];

type BusinessHourDay = { isOpen: boolean; start: string; end: string };

export default function WorkflowModuleScreen() {
  const { api } = useSession();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['mobile-workspace-settings'],
    queryFn: () => api.getWorkspaceSettings(),
  });

  // Timeout settings
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [inactivityMinutes, setInactivityMinutes] = useState('60');
  const [waitingAutoCloseMinutes, setWaitingAutoCloseMinutes] = useState('120');

  // Auto-reply toggles
  const [sendBusinessHoursAutoReply, setSendBusinessHoursAutoReply] = useState(false);
  const [sendOutOfHoursAutoReply, setSendOutOfHoursAutoReply] = useState(false);
  const [sendResolvedAutoReply, setSendResolvedAutoReply] = useState(false);
  const [sendClosedAutoReply, setSendClosedAutoReply] = useState(false);
  const [sendWindowClosedTemplateReply, setSendWindowClosedTemplateReply] = useState(false);
  const [sendAssignmentAutoReply, setSendAssignmentAutoReply] = useState(false);

  // Auto-reply messages
  const [businessHoursMessage, setBusinessHoursMessage] = useState('');
  const [outOfHoursMessage, setOutOfHoursMessage] = useState('');
  const [resolvedMessage, setResolvedMessage] = useState('');
  const [closedMessage, setClosedMessage] = useState('');
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const [windowClosedTemplateName, setWindowClosedTemplateName] = useState('');
  const [windowClosedTemplateLanguage, setWindowClosedTemplateLanguage] = useState('pt_BR');

  // Business hours
  const [businessHours, setBusinessHours] = useState<Record<string, BusinessHourDay>>(
    Object.fromEntries(
      WEEKDAYS.map((d) => [d.key, { isOpen: d.key !== 'saturday' && d.key !== 'sunday', start: '08:00', end: '18:00' }]),
    ),
  );

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) return;

    setTimezone(settings.timezone ?? 'America/Sao_Paulo');
    setInactivityMinutes(String(settings.inactivityTimeoutMinutes ?? 60));
    setWaitingAutoCloseMinutes(String(settings.waitingAutoCloseTimeoutMinutes ?? 120));
    setSendBusinessHoursAutoReply(!!settings.sendBusinessHoursAutoReply);
    setSendOutOfHoursAutoReply(!!settings.sendOutOfHoursAutoReply);
    setSendResolvedAutoReply(!!settings.sendResolvedAutoReply);
    setSendClosedAutoReply(!!settings.sendClosedAutoReply);
    setSendWindowClosedTemplateReply(!!settings.sendWindowClosedTemplateReply);
    setSendAssignmentAutoReply(!!settings.sendAssignmentAutoReply);

    setBusinessHoursMessage(settings.businessHoursAutoReply ?? '');
    setOutOfHoursMessage(settings.outOfHoursAutoReply ?? '');
    setResolvedMessage(settings.resolvedAutoReplyMessage ?? '');
    setClosedMessage(settings.closedAutoReplyMessage ?? '');
    setAssignmentMessage(settings.assignmentAutoReplyMessage ?? '');
    setWindowClosedTemplateName(settings.windowClosedTemplateName ?? '');
    setWindowClosedTemplateLanguage(settings.windowClosedTemplateLanguageCode ?? 'pt_BR');

    if (settings.businessHours) {
      try {
        const bh = typeof settings.businessHours === 'string'
          ? JSON.parse(settings.businessHours)
          : settings.businessHours;
        if (typeof bh === 'object') {
          setBusinessHours((prev) => ({ ...prev, ...bh }));
        }
      } catch {
        // ignore
      }
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateWorkspaceSettings({
        timezone: timezone.trim(),
        inactivityTimeoutMinutes: Number(inactivityMinutes) || 60,
        waitingAutoCloseTimeoutMinutes: Number(waitingAutoCloseMinutes) || 120,
        sendBusinessHoursAutoReply,
        sendOutOfHoursAutoReply,
        sendResolvedAutoReply,
        sendClosedAutoReply,
        sendWindowClosedTemplateReply,
        sendAssignmentAutoReply,
        businessHoursAutoReply: businessHoursMessage.trim(),
        outOfHoursAutoReply: outOfHoursMessage.trim(),
        resolvedAutoReplyMessage: resolvedMessage.trim(),
        closedAutoReplyMessage: closedMessage.trim(),
        assignmentAutoReplyMessage: assignmentMessage.trim(),
        windowClosedTemplateName: windowClosedTemplateName.trim(),
        windowClosedTemplateLanguageCode: windowClosedTemplateLanguage.trim(),
        businessHours: businessHours as any,
      } as any),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-workspace-settings'] });
      Alert.alert('Configurações salvas', 'Fluxo e automações atualizados com sucesso.');
    },
    onError: (error: Error) => Alert.alert('Falha ao salvar', error.message),
  });

  function updateBusinessHour(day: string, field: keyof BusinessHourDay, value: any) {
    setBusinessHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  }

  function stepMinutes(setter: (v: string) => void, current: string, delta: number, min: number, max: number) {
    const val = Math.min(max, Math.max(min, (parseInt(current) || 0) + delta));
    setter(String(val));
  }

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
          <RefreshControl tintColor={palette.primary}
            refreshing={settingsQuery.isRefetching}
            onRefresh={() => void settingsQuery.refetch()} />
        }
      >
        {/* Timeout settings */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Parâmetros de timeout</Text>

          <Text style={styles.label}>Fuso horário</Text>
          <TextInput style={styles.input} value={timezone} onChangeText={setTimezone}
            placeholder="America/Sao_Paulo" placeholderTextColor={palette.textMuted} autoCapitalize="none" />

          <Text style={styles.label}>Inatividade (minutos)</Text>
          <View style={styles.stepperRow}>
            <Pressable style={styles.stepperButton}
              onPress={() => stepMinutes(setInactivityMinutes, inactivityMinutes, -5, 1, 1440)}>
              <Text style={styles.stepperText}>−</Text>
            </Pressable>
            <TextInput style={styles.stepperInput} value={inactivityMinutes}
              onChangeText={setInactivityMinutes} keyboardType="number-pad" />
            <Pressable style={styles.stepperButton}
              onPress={() => stepMinutes(setInactivityMinutes, inactivityMinutes, 5, 1, 1440)}>
              <Text style={styles.stepperText}>+</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Auto-encerrar aguardando (minutos)</Text>
          <View style={styles.stepperRow}>
            <Pressable style={styles.stepperButton}
              onPress={() => stepMinutes(setWaitingAutoCloseMinutes, waitingAutoCloseMinutes, -10, 1, 10080)}>
              <Text style={styles.stepperText}>−</Text>
            </Pressable>
            <TextInput style={styles.stepperInput} value={waitingAutoCloseMinutes}
              onChangeText={setWaitingAutoCloseMinutes} keyboardType="number-pad" />
            <Pressable style={styles.stepperButton}
              onPress={() => stepMinutes(setWaitingAutoCloseMinutes, waitingAutoCloseMinutes, 10, 1, 10080)}>
              <Text style={styles.stepperText}>+</Text>
            </Pressable>
          </View>
        </View>

        {/* Auto-reply messages */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Respostas automáticas</Text>

          <AutoReplySection
            label="Em horário comercial"
            description="Enviada quando o contato escreve durante o expediente."
            enabled={sendBusinessHoursAutoReply}
            onToggle={setSendBusinessHoursAutoReply}
            message={businessHoursMessage}
            onChangeMessage={setBusinessHoursMessage}
          />

          <AutoReplySection
            label="Fora de horário"
            description="Enviada quando o contato escreve fora do expediente."
            enabled={sendOutOfHoursAutoReply}
            onToggle={setSendOutOfHoursAutoReply}
            message={outOfHoursMessage}
            onChangeMessage={setOutOfHoursMessage}
          />

          <AutoReplySection
            label="Ao resolver conversa"
            description="Enviada quando um atendente resolve a conversa."
            enabled={sendResolvedAutoReply}
            onToggle={setSendResolvedAutoReply}
            message={resolvedMessage}
            onChangeMessage={setResolvedMessage}
          />

          <AutoReplySection
            label="Ao encerrar conversa"
            description="Enviada quando a conversa é encerrada."
            enabled={sendClosedAutoReply}
            onToggle={setSendClosedAutoReply}
            message={closedMessage}
            onChangeMessage={setClosedMessage}
          />

          <AutoReplySection
            label="Ao atribuir/transferir"
            description="Variáveis: {nome}, {vendedor}, {novo_vendedor}, {empresa}"
            enabled={sendAssignmentAutoReply}
            onToggle={setSendAssignmentAutoReply}
            message={assignmentMessage}
            onChangeMessage={setAssignmentMessage}
          />

          <View style={styles.divider} />

          <SwitchRow
            label="Template quando janela 24h fecha"
            value={sendWindowClosedTemplateReply}
            onChange={setSendWindowClosedTemplateReply}
          />
          {sendWindowClosedTemplateReply && (
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Nome do template</Text>
              <TextInput style={styles.input} value={windowClosedTemplateName}
                onChangeText={setWindowClosedTemplateName} placeholder="Nome do template Meta"
                placeholderTextColor={palette.textMuted} autoCapitalize="none" />
              <Text style={styles.label}>Idioma do template</Text>
              <TextInput style={styles.input} value={windowClosedTemplateLanguage}
                onChangeText={setWindowClosedTemplateLanguage} placeholder="pt_BR"
                placeholderTextColor={palette.textMuted} autoCapitalize="none" />
            </View>
          )}
        </View>

        {/* Business hours */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Horário comercial</Text>
          <Text style={styles.cardSubtitle}>
            Defina os dias e horários de funcionamento do atendimento.
          </Text>

          {WEEKDAYS.map((day) => {
            const bh = businessHours[day.key] ?? { isOpen: false, start: '08:00', end: '18:00' };
            return (
              <View key={day.key} style={styles.bhRow}>
                <View style={styles.bhDayCol}>
                  <Switch
                    value={bh.isOpen}
                    onValueChange={(v) => updateBusinessHour(day.key, 'isOpen', v)}
                    thumbColor={bh.isOpen ? '#ffffff' : '#d1d8e5'}
                    trackColor={{ false: 'rgba(148,167,199,0.35)', true: 'rgba(61,150,255,0.62)' }}
                  />
                  <Text style={[styles.bhDayLabel, !bh.isOpen && styles.bhDayClosed]}>
                    {day.label}
                  </Text>
                </View>
                {bh.isOpen ? (
                  <View style={styles.bhTimeCol}>
                    <TextInput
                      style={styles.bhTimeInput}
                      value={bh.start}
                      onChangeText={(v) => updateBusinessHour(day.key, 'start', v)}
                      placeholder="08:00"
                      placeholderTextColor={palette.textMuted}
                      keyboardType="numbers-and-punctuation"
                    />
                    <Text style={styles.bhSeparator}>até</Text>
                    <TextInput
                      style={styles.bhTimeInput}
                      value={bh.end}
                      onChangeText={(v) => updateBusinessHour(day.key, 'end', v)}
                      placeholder="18:00"
                      placeholderTextColor={palette.textMuted}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                ) : (
                  <Text style={styles.bhClosedText}>Fechado</Text>
                )}
              </View>
            );
          })}
        </View>

        {/* Save */}
        <Pressable
          style={[styles.saveButton, saveMutation.isPending && styles.saveButtonDisabled]}
          disabled={saveMutation.isPending}
          onPress={() => saveMutation.mutate()}
        >
          <Text style={styles.saveButtonText}>
            {saveMutation.isPending ? 'Salvando...' : 'Salvar todas as configurações'}
          </Text>
        </Pressable>
      </ScrollView>
    </ScreenTransition>
  );
}

function AutoReplySection({
  label,
  description,
  enabled,
  onToggle,
  message,
  onChangeMessage,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  message: string;
  onChangeMessage: (v: string) => void;
}) {
  return (
    <View style={styles.autoReplySection}>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>{label}</Text>
          <Text style={styles.switchDescription}>{description}</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          thumbColor={enabled ? '#ffffff' : '#d1d8e5'}
          trackColor={{ false: 'rgba(148,167,199,0.35)', true: 'rgba(61,150,255,0.62)' }}
        />
      </View>
      {enabled && (
        <TextInput
          style={[styles.input, styles.messageInput]}
          value={message}
          onChangeText={onChangeMessage}
          placeholder="Mensagem automática..."
          placeholderTextColor={palette.textMuted}
          multiline
          textAlignVertical="top"
        />
      )}
    </View>
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
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  centerState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: palette.background,
  },
  card: {
    borderRadius: 22, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.backgroundElevated, padding: 14, gap: 10,
  },
  cardTitle: { color: palette.text, fontSize: 16, fontWeight: '800' },
  cardSubtitle: { color: palette.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  label: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },
  input: {
    height: 46, borderRadius: 12, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.surface, color: palette.text, paddingHorizontal: 12, fontSize: 14,
  },
  messageInput: { height: 80, paddingTop: 10 },
  divider: { height: 1, backgroundColor: palette.border, marginVertical: 4 },

  // Stepper
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperButton: {
    width: 40, height: 40, borderRadius: 12, borderWidth: 1,
    borderColor: palette.border, backgroundColor: palette.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperText: { color: palette.text, fontSize: 20, fontWeight: '600' },
  stepperInput: {
    flex: 1, height: 40, borderRadius: 12, borderWidth: 1,
    borderColor: palette.border, backgroundColor: palette.surface,
    color: palette.text, textAlign: 'center', fontSize: 14,
  },

  // Auto-reply
  autoReplySection: { gap: 8 },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  },
  switchLabel: { flex: 1, color: palette.text, fontSize: 13, fontWeight: '600' },
  switchDescription: { color: palette.textMuted, fontSize: 11, lineHeight: 15, marginTop: 1 },

  // Business hours
  bhRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, gap: 8,
  },
  bhDayCol: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 130 },
  bhDayLabel: { color: palette.text, fontSize: 13, fontWeight: '600' },
  bhDayClosed: { color: palette.textMuted },
  bhTimeCol: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bhTimeInput: {
    width: 65, height: 36, borderRadius: 10, borderWidth: 1,
    borderColor: palette.border, backgroundColor: palette.surface,
    color: palette.text, textAlign: 'center', fontSize: 13,
  },
  bhSeparator: { color: palette.textMuted, fontSize: 12 },
  bhClosedText: { color: palette.textMuted, fontSize: 12, fontStyle: 'italic' },

  // Save
  saveButton: {
    minHeight: 52, borderRadius: 16, backgroundColor: palette.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.65 },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
