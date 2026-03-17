import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

export default function ConversationScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const conversationId = String(params.id);
  const { api } = useSession();
  const [message, setMessage] = useState('');
  const [remindersVisible, setRemindersVisible] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const [sending, setSending] = useState(false);
  const [reminderDescription, setReminderDescription] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');

  const conversationQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.getConversation(conversationId),
    refetchInterval: 8000,
  });

  const conversation = conversationQuery.data;
  const reminders = useMemo(
    () => conversation?.reminders ?? [],
    [conversation?.reminders],
  );

  if (conversationQuery.isLoading || !conversation) {
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
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        keyboardVerticalOffset={96}
      >
      <View style={styles.headerCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.contactName}>{conversation.contact.name}</Text>
          <Text style={styles.contactMeta}>
            {conversation.assignedUser?.name || 'Equipe disponivel'} • {mapStatus(conversation.status)}
          </Text>
        </View>
        <Pressable
          style={styles.headerAction}
          onPress={() => setRemindersVisible(true)}
        >
          <Text style={styles.headerActionText}>Lembretes</Text>
        </Pressable>
      </View>

      <FlatList
        data={conversation.messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesContent}
        refreshControl={
          <RefreshControl
            tintColor={palette.primary}
            refreshing={conversationQuery.isRefetching}
            onRefresh={() => void conversationQuery.refetch()}
          />
        }
        renderItem={({ item }) => {
          const outbound = item.direction !== 'INBOUND';
          return (
            <View
              style={[
                styles.bubble,
                outbound ? styles.bubbleOutbound : styles.bubbleInbound,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  outbound && { color: palette.text },
                ]}
              >
                {item.content}
              </Text>
              <Text style={styles.messageMeta}>
                {new Date(item.createdAt).toLocaleString('pt-BR')}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyMessages}>
            <Text style={styles.emptyTitle}>Ainda sem histórico.</Text>
            <Text style={styles.emptyDescription}>
              Assim que esta conversa receber mensagens, o histórico aparece aqui.
            </Text>
          </View>
        }
      />

      <View style={styles.composer}>
        <TextInput
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder="Digite sua mensagem"
          placeholderTextColor={palette.textMuted}
          style={styles.composerInput}
        />
        <Pressable
          style={[styles.sendButton, sending && styles.sendButtonDisabled]}
          disabled={sending}
          onPress={async () => {
            if (!message.trim()) {
              return;
            }

            try {
              setSending(true);
              await api.sendConversationMessage(conversationId, message);
              setMessage('');
              await conversationQuery.refetch();
            } finally {
              setSending(false);
            }
          }}
        >
          <Text style={styles.sendButtonText}>
            {sending ? 'Enviando...' : 'Enviar'}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={remindersVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setRemindersVisible(false)}
      >
        <ScrollView style={styles.modalScreen} contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Lembretes da conversa</Text>
              <Text style={styles.modalSubtitle}>
                Agende retornos e destaque prioridades para este cliente.
              </Text>
            </View>
            <Pressable
              style={styles.modalClose}
              onPress={() => setRemindersVisible(false)}
            >
              <Text style={styles.modalCloseText}>Fechar</Text>
            </Pressable>
          </View>

          <View style={styles.metricsRow}>
            <Metric label="Total" value={String(reminders.length)} />
            <Metric
              label="Ativos"
              value={String(
                reminders.filter(
                  (item) =>
                    item.status === 'PENDING' || item.status === 'NOTIFIED',
                ).length,
              )}
            />
            <Metric
              label="Vencidos"
              value={String(
                reminders.filter(
                  (item) =>
                    item.status === 'NOTIFIED' &&
                    new Date(item.remindAt).getTime() < Date.now(),
                ).length,
              )}
            />
          </View>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Novo lembrete</Text>
            <TextInput
              value={reminderDescription}
              onChangeText={setReminderDescription}
              placeholder="Descricao interna"
              placeholderTextColor={palette.textMuted}
              style={styles.input}
            />
            <TextInput
              value={reminderMessage}
              onChangeText={setReminderMessage}
              multiline
              placeholder="Mensagem prevista para o cliente"
              placeholderTextColor={palette.textMuted}
              style={[styles.input, styles.textarea]}
            />
            <View style={styles.row}>
              <TextInput
                value={reminderDate}
                onChangeText={setReminderDate}
                placeholder="2026-03-13"
                placeholderTextColor={palette.textMuted}
                style={[styles.input, styles.rowInput]}
              />
              <TextInput
                value={reminderTime}
                onChangeText={setReminderTime}
                placeholder="18:30"
                placeholderTextColor={palette.textMuted}
                style={[styles.input, styles.rowInput]}
              />
            </View>
            <Pressable
              style={[
                styles.primaryButton,
                savingReminder && styles.sendButtonDisabled,
              ]}
              disabled={savingReminder}
              onPress={async () => {
                if (!reminderMessage.trim() || !reminderDate.trim() || !reminderTime.trim()) {
                  return;
                }

                try {
                  setSavingReminder(true);
                  await api.createReminder(conversationId, {
                    internalDescription: reminderDescription,
                    messageToSend: reminderMessage,
                    remindAt: `${reminderDate}T${reminderTime}:00`,
                  });
                  setReminderDescription('');
                  setReminderMessage('');
                  setReminderDate('');
                  setReminderTime('');
                  await conversationQuery.refetch();
                } finally {
                  setSavingReminder(false);
                }
              }}
            >
              <Text style={styles.primaryButtonText}>
                {savingReminder ? 'Salvando...' : 'Criar lembrete'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.listCard}>
            <Text style={styles.sectionTitle}>Pendentes e historico</Text>
            {reminders.length ? (
              reminders.map((item) => (
                <View key={item.id} style={styles.reminderCard}>
                  <View style={styles.reminderTop}>
                    <Text style={styles.reminderTitle} numberOfLines={2}>
                      {item.internalDescription || item.messageToSend}
                    </Text>
                    <View style={[styles.statusPill, reminderStatusStyle(item)]}>
                      <Text style={styles.statusText}>{mapReminderStatus(item)}</Text>
                    </View>
                  </View>
                  <Text style={styles.reminderBody} numberOfLines={3}>
                    {item.messageToSend}
                  </Text>
                  <Text style={styles.reminderMeta}>
                    {new Date(item.remindAt).toLocaleString('pt-BR')}
                  </Text>
                  <View style={styles.reminderActions}>
                    {item.status !== 'COMPLETED' && item.status !== 'CANCELED' ? (
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={async () => {
                          await api.completeReminder(conversationId, item.id);
                          await conversationQuery.refetch();
                        }}
                      >
                        <Text style={styles.secondaryButtonText}>Concluir</Text>
                      </Pressable>
                    ) : null}
                    {item.status !== 'CANCELED' && item.status !== 'COMPLETED' ? (
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={async () => {
                          await api.cancelReminder(conversationId, item.id);
                          await conversationQuery.refetch();
                        }}
                      >
                        <Text style={styles.secondaryButtonText}>Cancelar</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyMessages}>
                <Text style={styles.emptyTitle}>Nenhum lembrete nesta conversa.</Text>
                <Text style={styles.emptyDescription}>
                  Crie um retorno programado para avisar a equipe na hora certa.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </Modal>
      </KeyboardAvoidingView>
    </ScreenTransition>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function mapStatus(status: string) {
  if (status === 'IN_PROGRESS') return 'Em atendimento';
  if (status === 'WAITING') return 'Aguardando';
  if (status === 'RESOLVED') return 'Resolvido';
  if (status === 'CLOSED') return 'Encerrado';
  return 'Novo';
}

function mapReminderStatus(reminder: { status: string; remindAt: string }) {
  if (reminder.status === 'COMPLETED') return 'Concluido';
  if (reminder.status === 'CANCELED') return 'Cancelado';
  const remindAt = new Date(reminder.remindAt);
  const today = new Date();

  if (remindAt.toDateString() === today.toDateString()) return 'Hoje';
  if (remindAt.getTime() < Date.now()) return 'Atrasado';
  return reminder.status === 'NOTIFIED' ? 'Notificado' : 'Pendente';
}

function reminderStatusStyle(reminder: { status: string; remindAt: string }) {
  const label = mapReminderStatus(reminder);

  if (label === 'Atrasado') {
    return { backgroundColor: 'rgba(243, 201, 63, 0.14)' };
  }

  if (label === 'Concluido') {
    return { backgroundColor: 'rgba(73, 216, 185, 0.14)' };
  }

  if (label === 'Cancelado') {
    return { backgroundColor: 'rgba(255, 141, 155, 0.14)' };
  }

  return { backgroundColor: palette.primarySoft };
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.background,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    backgroundColor: palette.backgroundElevated,
  },
  contactName: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },
  contactMeta: {
    color: palette.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  headerAction: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: palette.primarySoft,
  },
  headerActionText: {
    color: palette.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 10,
  },
  bubble: {
    maxWidth: '84%',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bubbleInbound: {
    alignSelf: 'flex-start',
    backgroundColor: palette.backgroundElevated,
    borderWidth: 1,
    borderColor: palette.border,
  },
  bubbleOutbound: {
    alignSelf: 'flex-end',
    backgroundColor: palette.primary,
  },
  messageText: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 22,
  },
  messageMeta: {
    color: 'rgba(242, 247, 255, 0.7)',
    fontSize: 11,
    marginTop: 8,
  },
  emptyMessages: {
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    gap: 8,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyDescription: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    backgroundColor: palette.background,
    gap: 10,
  },
  composerInput: {
    minHeight: 52,
    maxHeight: 140,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.text,
    fontSize: 15,
  },
  sendButton: {
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
  },
  sendButtonDisabled: {
    opacity: 0.72,
  },
  sendButtonText: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
  },
  modalScreen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  modalContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  modalTitle: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6,
  },
  modalClose: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  modalCloseText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    padding: 14,
    borderRadius: 20,
    backgroundColor: palette.backgroundElevated,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 4,
  },
  metricLabel: {
    color: palette.textMuted,
    fontSize: 12,
  },
  metricValue: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '700',
  },
  formCard: {
    padding: 16,
    borderRadius: 24,
    backgroundColor: palette.backgroundElevated,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 12,
  },
  listCard: {
    padding: 16,
    borderRadius: 24,
    backgroundColor: palette.backgroundElevated,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 12,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },
  input: {
    minHeight: 50,
    borderRadius: 18,
    paddingHorizontal: 16,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.text,
    fontSize: 15,
  },
  textarea: {
    minHeight: 110,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  rowInput: {
    flex: 1,
  },
  primaryButton: {
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
  },
  primaryButtonText: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
  },
  reminderCard: {
    padding: 14,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 8,
  },
  reminderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  reminderTitle: {
    flex: 1,
    color: palette.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  reminderBody: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  reminderMeta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '600',
  },
  reminderActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: palette.backgroundElevated,
    borderWidth: 1,
    borderColor: palette.border,
  },
  secondaryButtonText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
});
