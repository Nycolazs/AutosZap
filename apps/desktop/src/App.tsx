import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PlatformApiError,
  createPlatformClient,
} from '@autoszap/platform-client';
import type { AuthMe, AuthSession, ConversationReminder } from '@autoszap/platform-types';

type ReminderDraft = {
  internalDescription: string;
  messageToSend: string;
  remindAtDate: string;
  remindAtTime: string;
};

const apiBaseUrl =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ??
  'http://localhost:4000';

const initialReminderDraft: ReminderDraft = {
  internalDescription: '',
  messageToSend: '',
  remindAtDate: '',
  remindAtTime: '',
};

export function App() {
  const sessionRef = useRef<AuthSession | null>(null);
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [me, setMe] = useState<AuthMe | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [email, setEmail] = useState('admin@autoszap.com');
  const [password, setPassword] = useState('123456');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [draftReminder, setDraftReminder] = useState<ReminderDraft>(
    initialReminderDraft,
  );

  const api = useMemo(
    () =>
      createPlatformClient({
        baseUrl: apiBaseUrl,
        getAccessToken: () => sessionRef.current?.accessToken ?? null,
        getRefreshToken: () => sessionRef.current?.refreshToken ?? null,
        onSessionUpdate: async (nextSession) => {
          sessionRef.current = nextSession;
          setSession(nextSession);
          await window.autoszapDesktop.setSession(nextSession);
        },
        onAuthFailure: async () => {
          sessionRef.current = null;
          setSession(null);
          setMe(null);
          await window.autoszapDesktop.clearSession();
        },
      }),
    [],
  );

  useEffect(() => {
    void (async () => {
      const stored = (await window.autoszapDesktop.getSession()) as AuthSession | null;

      if (stored) {
        sessionRef.current = stored;
        setSession(stored);

        try {
          setMe(await api.me());
        } catch {
          await window.autoszapDesktop.clearSession();
          sessionRef.current = null;
          setSession(null);
        }
      }

      setBooting(false);
    })();
  }, [api]);

  const conversationsQuery = useQuery({
    queryKey: ['desktop-conversations'],
    queryFn: () => api.listConversations(),
    enabled: Boolean(session),
    refetchInterval: 10000,
  });

  const notificationsQuery = useQuery({
    queryKey: ['desktop-notifications'],
    queryFn: () => api.listNotifications(30),
    enabled: Boolean(session),
    refetchInterval: 15000,
  });

  const conversationQuery = useQuery({
    queryKey: ['desktop-conversation', selectedConversationId],
    queryFn: () => api.getConversation(selectedConversationId as string),
    enabled: Boolean(session && selectedConversationId),
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (!selectedConversationId && conversationsQuery.data?.data?.length) {
      setSelectedConversationId(conversationsQuery.data.data[0].id);
    }
  }, [conversationsQuery.data?.data, selectedConversationId]);

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }

    const inboxStream = new EventSource(
      api.buildSseUrl('conversations/stream', session.accessToken),
    );
    const notificationsStream = new EventSource(
      api.buildSseUrl('notifications/stream', session.accessToken),
    );

    inboxStream.addEventListener('inbox-event', () => {
      void conversationsQuery.refetch();
      if (selectedConversationId) {
        void conversationQuery.refetch();
      }
    });

    notificationsStream.addEventListener('notification-event', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as {
        type: string;
        payload?: { title?: string; body?: string; linkHref?: string };
      };

      void notificationsQuery.refetch();

      if (
        payload.type === 'notification.created' &&
        payload.payload?.title &&
        payload.payload?.body
      ) {
        void window.autoszapDesktop.notify({
          title: payload.payload.title,
          body: payload.payload.body,
          linkHref: payload.payload.linkHref,
        });
      }
    });

    const unsubscribe = window.autoszapDesktop.onOpenLink((linkHref) => {
      if (!linkHref?.includes('conversationId=')) {
        return;
      }

      const conversationId = linkHref.split('conversationId=').pop();

      if (conversationId) {
        setSelectedConversationId(conversationId);
      }
    });

    return () => {
      inboxStream.close();
      notificationsStream.close();
      unsubscribe();
    };
  }, [
    api,
    conversationQuery,
    conversationsQuery,
    notificationsQuery,
    selectedConversationId,
    session?.accessToken,
  ]);

  if (booting) {
    return <div className="desktop-shell desktop-center">Carregando AutoZap...</div>;
  }

  if (!session) {
    return (
      <div className="desktop-auth">
        <div className="desktop-auth__hero">
          <p className="desktop-auth__eyebrow">AUTOZAP DESKTOP</p>
          <h1>Atendimento contínuo, com notificações reais.</h1>
          <p>
            Trabalhe com o inbox em uma janela dedicada, receba alertas do sistema
            operacional e acompanhe seus lembretes sem depender do navegador.
          </p>
        </div>
        <form
          className="desktop-auth__card"
          onSubmit={async (event) => {
            event.preventDefault();

            try {
              setSubmitting(true);
              setLoginError(null);
              const nextSession = await api.login(email, password);
              sessionRef.current = nextSession;
              setSession(nextSession);
              await window.autoszapDesktop.setSession(nextSession);
              setMe(await api.me());
            } catch (error) {
              setLoginError(
                error instanceof PlatformApiError || error instanceof Error
                  ? error.message
                  : 'Falha ao entrar no app desktop.',
              );
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <h2>Entrar</h2>
          <p>Use a mesma conta do AutoZap web.</p>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            placeholder="voce@empresa.com"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="Sua senha"
          />
          {loginError ? <span className="desktop-error">{loginError}</span> : null}
          <button disabled={submitting} type="submit">
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    );
  }

  const selectedConversation = conversationQuery.data;

  return (
    <div className="desktop-shell">
      <aside className="desktop-sidebar">
        <div className="desktop-sidebar__header">
          <div>
            <p className="desktop-auth__eyebrow">INBOX</p>
            <h2>Conversas</h2>
            <span>{conversationsQuery.data?.data.length ?? 0} ativas</span>
          </div>
          <button
            className="desktop-ghost-button"
            onClick={async () => {
              await api.logout(session.refreshToken);
              await window.autoszapDesktop.clearSession();
              sessionRef.current = null;
              setSession(null);
              setMe(null);
              setSelectedConversationId(null);
            }}
          >
            Sair
          </button>
        </div>

        <div className="desktop-conversation-list">
          {(conversationsQuery.data?.data ?? []).map((conversation) => (
            <button
              key={conversation.id}
              className={`desktop-conversation-item ${
                selectedConversationId === conversation.id ? 'is-active' : ''
              }`}
              onClick={() => setSelectedConversationId(conversation.id)}
            >
              <div className="desktop-conversation-item__top">
                <strong>{conversation.contact.name}</strong>
                <span>{mapStatus(conversation.status)}</span>
              </div>
              <p>{conversation.lastMessagePreview || 'Sem mensagens recentes.'}</p>
              <div className="desktop-conversation-item__meta">
                <span>{conversation.assignedUser?.name || 'Equipe'}</span>
                {conversation.unreadCount ? <em>{conversation.unreadCount}</em> : null}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="desktop-main">
        {selectedConversation ? (
          <div key={selectedConversation.id} className="desktop-main-transition">
            <header className="desktop-main__header">
              <div>
                <h2>{selectedConversation.contact.name}</h2>
                <p>
                  {selectedConversation.assignedUser?.name || 'Disponivel para equipe'} •{' '}
                  {mapStatus(selectedConversation.status)}
                </p>
              </div>
              <div className="desktop-header-badges">
                <span className="desktop-badge">{me?.workspace.name}</span>
                <span className="desktop-badge">
                  {notificationsQuery.data?.unreadCount ?? 0} alertas
                </span>
              </div>
            </header>

            <div className="desktop-main__body">
              <section className="desktop-chat">
                <div className="desktop-messages">
                  {selectedConversation.messages.map((item) => (
                    <article
                      key={item.id}
                      className={`desktop-message ${
                        item.direction === 'INBOUND' ? 'is-inbound' : 'is-outbound'
                      }`}
                    >
                      <p>{item.content}</p>
                      <time>{new Date(item.createdAt).toLocaleString('pt-BR')}</time>
                    </article>
                  ))}
                </div>

                <form
                  className="desktop-composer"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!message.trim()) return;
                    await api.sendConversationMessage(selectedConversation.id, message);
                    setMessage('');
                    await conversationQuery.refetch();
                    await conversationsQuery.refetch();
                  }}
                >
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Digite sua mensagem para o cliente"
                  />
                  <button type="submit">Enviar mensagem</button>
                </form>
              </section>

              <aside className="desktop-sidepanel">
                <section className="desktop-panel-card">
                  <div className="desktop-panel-card__header">
                    <div>
                      <h3>Lembretes</h3>
                      <p>Crie retornos com contexto e notificação automática.</p>
                    </div>
                    <span className="desktop-badge">
                      {selectedConversation.reminders?.length ?? 0}
                    </span>
                  </div>

                  <div className="desktop-reminder-form">
                    <input
                      value={draftReminder.internalDescription}
                      onChange={(event) =>
                        setDraftReminder((current) => ({
                          ...current,
                          internalDescription: event.target.value,
                        }))
                      }
                      placeholder="Descricao interna"
                    />
                    <textarea
                      value={draftReminder.messageToSend}
                      onChange={(event) =>
                        setDraftReminder((current) => ({
                          ...current,
                          messageToSend: event.target.value,
                        }))
                      }
                      placeholder="Mensagem prevista para o cliente"
                    />
                    <div className="desktop-reminder-form__row">
                      <input
                        value={draftReminder.remindAtDate}
                        onChange={(event) =>
                          setDraftReminder((current) => ({
                            ...current,
                            remindAtDate: event.target.value,
                          }))
                        }
                        placeholder="2026-03-13"
                      />
                      <input
                        value={draftReminder.remindAtTime}
                        onChange={(event) =>
                          setDraftReminder((current) => ({
                            ...current,
                            remindAtTime: event.target.value,
                          }))
                        }
                        placeholder="18:30"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await api.createReminder(selectedConversation.id, {
                          internalDescription: draftReminder.internalDescription,
                          messageToSend: draftReminder.messageToSend,
                          remindAt: `${draftReminder.remindAtDate}T${draftReminder.remindAtTime}:00`,
                        });
                        setDraftReminder(initialReminderDraft);
                        await conversationQuery.refetch();
                        await notificationsQuery.refetch();
                      }}
                    >
                      Criar lembrete
                    </button>
                  </div>

                  <div className="desktop-reminder-list">
                    {(selectedConversation.reminders ?? []).map((reminder) => (
                      <article key={reminder.id} className="desktop-reminder-card">
                        <div className="desktop-reminder-card__top">
                          <strong>
                            {reminder.internalDescription || reminder.messageToSend}
                          </strong>
                          <span className={`desktop-badge is-${badgeTone(reminder)}`}>
                            {mapReminderStatus(reminder)}
                          </span>
                        </div>
                        <p>{reminder.messageToSend}</p>
                        <time>{new Date(reminder.remindAt).toLocaleString('pt-BR')}</time>
                        <div className="desktop-reminder-card__actions">
                          {reminder.status !== 'COMPLETED' &&
                          reminder.status !== 'CANCELED' ? (
                            <>
                              <button
                                type="button"
                                className="desktop-ghost-button"
                                onClick={async () => {
                                  await api.completeReminder(
                                    selectedConversation.id,
                                    reminder.id,
                                  );
                                  await conversationQuery.refetch();
                                }}
                              >
                                Concluir
                              </button>
                              <button
                                type="button"
                                className="desktop-ghost-button"
                                onClick={async () => {
                                  await api.cancelReminder(
                                    selectedConversation.id,
                                    reminder.id,
                                  );
                                  await conversationQuery.refetch();
                                }}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        ) : (
          <div className="desktop-center">Escolha uma conversa para começar.</div>
        )}
      </main>
    </div>
  );
}

function mapStatus(status: string) {
  if (status === 'IN_PROGRESS') return 'Em atendimento';
  if (status === 'WAITING') return 'Aguardando';
  if (status === 'RESOLVED') return 'Resolvido';
  if (status === 'CLOSED') return 'Encerrado';
  return 'Novo';
}

function mapReminderStatus(reminder: ConversationReminder) {
  if (reminder.status === 'COMPLETED') return 'Concluido';
  if (reminder.status === 'CANCELED') return 'Cancelado';
  const remindAt = new Date(reminder.remindAt);
  const today = new Date();

  if (remindAt.getTime() < Date.now()) return 'Atrasado';
  if (remindAt.toDateString() === today.toDateString()) return 'Hoje';
  return reminder.status === 'NOTIFIED' ? 'Notificado' : 'Pendente';
}

function badgeTone(reminder: ConversationReminder) {
  const label = mapReminderStatus(reminder);
  if (label === 'Atrasado') return 'warning';
  if (label === 'Concluido') return 'success';
  if (label === 'Cancelado') return 'danger';
  return 'primary';
}
