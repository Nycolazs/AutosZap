'use client';

import { useCallback, useMemo, useRef } from 'react';
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import type {
  ConversationMessage,
  ConversationMessagesPage,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OptimisticMessageStatus = 'sending' | 'sent' | 'failed';

interface SendTextPayload {
  conversationId: string;
  content: string;
  quotedMessageId?: string | null;
  /** Optional sender info used to build the optimistic message. */
  sender?: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
}

interface SendMediaPayload {
  conversationId: string;
  file: File;
  caption?: string;
  sender?: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
}

interface PendingMessage {
  optimisticId: string;
  conversationId: string;
  status: OptimisticMessageStatus;
  content: string;
}

interface UseSendMessageReturn {
  sendMessage: (payload: SendTextPayload) => void;
  sendMedia: (payload: SendMediaPayload) => void;
  pendingMessages: PendingMessage[];
  retryMessage: (optimisticId: string) => void;
  isSending: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createOptimisticId(): string {
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildOptimisticMessage(
  id: string,
  content: string,
  sender?: SendTextPayload['sender'],
  quotedMessageId?: string | null,
): ConversationMessage {
  return {
    id,
    direction: 'OUTBOUND',
    messageType: 'text',
    content,
    metadata: quotedMessageId
      ? { quotedExternalMessageId: quotedMessageId }
      : null,
    senderUser: sender
      ? { id: sender.id, name: sender.name, avatarUrl: sender.avatarUrl ?? null }
      : null,
    senderUserId: sender?.id ?? null,
    status: 'QUEUED',
    sentAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

type MessagesInfiniteData = InfiniteData<ConversationMessagesPage>;

function appendOptimisticToCache(
  current: MessagesInfiniteData | undefined,
  message: ConversationMessage,
): MessagesInfiniteData | undefined {
  if (!current) return current;

  const pages = [...current.pages];
  if (pages.length === 0) {
    pages.push({ items: [message], hasMore: false, nextCursor: null });
  } else {
    // The first page is the newest set of messages. Append there.
    const first = pages[0];
    pages[0] = { ...first, items: [message, ...first.items] };
  }

  return { ...current, pages, pageParams: current.pageParams };
}

function replaceOptimisticInCache(
  current: MessagesInfiniteData | undefined,
  optimisticId: string,
  real: ConversationMessage,
): MessagesInfiniteData | undefined {
  if (!current) return current;

  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.id === optimisticId ? { ...real, id: optimisticId } : item,
      ),
    })),
  };
}

function markOptimisticFailed(
  current: MessagesInfiniteData | undefined,
  optimisticId: string,
): MessagesInfiniteData | undefined {
  if (!current) return current;

  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.id === optimisticId ? { ...item, status: 'FAILED' } : item,
      ),
    })),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSendMessage(): UseSendMessageReturn {
  const queryClient = useQueryClient();

  // Pending message tracking (optimistic IDs that are in-flight or failed).
  const pendingRef = useRef<Map<string, PendingMessage>>(new Map());
  // Store retry payloads for failed messages.
  const retryPayloadsRef = useRef<
    Map<string, SendTextPayload & { optimisticId: string }>
  >(new Map());

  // --- Text message mutation -------------------------------------------------
  const textMutation = useMutation({
    mutationFn: (
      payload: SendTextPayload & { optimisticId: string },
    ) =>
      apiRequest<ConversationMessage>('messages', {
        method: 'POST',
        body: {
          conversationId: payload.conversationId,
          content: payload.content,
          quotedMessageId: payload.quotedMessageId ?? undefined,
        },
      }),
    onMutate: async (payload) => {
      const messagesKey = [
        'conversation',
        payload.conversationId,
        'messages',
      ];

      await queryClient.cancelQueries({ queryKey: messagesKey });

      const optimistic = buildOptimisticMessage(
        payload.optimisticId,
        payload.content,
        payload.sender,
        payload.quotedMessageId,
      );

      queryClient.setQueryData<MessagesInfiniteData>(
        messagesKey,
        (current) => appendOptimisticToCache(current, optimistic),
      );

      pendingRef.current.set(payload.optimisticId, {
        optimisticId: payload.optimisticId,
        conversationId: payload.conversationId,
        status: 'sending',
        content: payload.content,
      });

      retryPayloadsRef.current.set(payload.optimisticId, payload);

      return { messagesKey, optimisticId: payload.optimisticId };
    },
    onSuccess: (serverMessage, payload, context) => {
      if (!context) return;

      queryClient.setQueryData<MessagesInfiniteData>(
        context.messagesKey,
        (current) =>
          replaceOptimisticInCache(
            current,
            context.optimisticId,
            serverMessage,
          ),
      );

      const pending = pendingRef.current.get(context.optimisticId);
      if (pending) {
        pending.status = 'sent';
      }
      // Clean up after a brief delay so UI can show "sent" state.
      setTimeout(() => {
        pendingRef.current.delete(context.optimisticId);
        retryPayloadsRef.current.delete(context.optimisticId);
      }, 2_000);
    },
    onError: (_error, _payload, context) => {
      if (!context) return;

      queryClient.setQueryData<MessagesInfiniteData>(
        context.messagesKey,
        (current) =>
          markOptimisticFailed(current, context.optimisticId),
      );

      const pending = pendingRef.current.get(context.optimisticId);
      if (pending) {
        pending.status = 'failed';
      }
    },
  });

  // --- Media message mutation ------------------------------------------------
  const mediaMutation = useMutation({
    mutationFn: (payload: SendMediaPayload & { optimisticId: string }) => {
      const formData = new FormData();
      formData.append('conversationId', payload.conversationId);
      formData.append('file', payload.file);
      if (payload.caption) {
        formData.append('caption', payload.caption);
      }

      return apiRequest<ConversationMessage>('messages/media', {
        method: 'POST',
        body: formData,
      });
    },
    onMutate: async (payload) => {
      const messagesKey = [
        'conversation',
        payload.conversationId,
        'messages',
      ];

      await queryClient.cancelQueries({ queryKey: messagesKey });

      const displayContent = payload.caption || payload.file.name;
      const optimistic = buildOptimisticMessage(
        payload.optimisticId,
        displayContent,
        payload.sender,
      );
      optimistic.messageType = 'document';
      optimistic.metadata = {
        fileName: payload.file.name,
        mimeType: payload.file.type,
        caption: payload.caption ?? null,
      };

      queryClient.setQueryData<MessagesInfiniteData>(
        messagesKey,
        (current) => appendOptimisticToCache(current, optimistic),
      );

      pendingRef.current.set(payload.optimisticId, {
        optimisticId: payload.optimisticId,
        conversationId: payload.conversationId,
        status: 'sending',
        content: displayContent,
      });

      return { messagesKey, optimisticId: payload.optimisticId };
    },
    onSuccess: (serverMessage, _payload, context) => {
      if (!context) return;

      queryClient.setQueryData<MessagesInfiniteData>(
        context.messagesKey,
        (current) =>
          replaceOptimisticInCache(
            current,
            context.optimisticId,
            serverMessage,
          ),
      );

      pendingRef.current.delete(context.optimisticId);
    },
    onError: (_error, _payload, context) => {
      if (!context) return;

      queryClient.setQueryData<MessagesInfiniteData>(
        context.messagesKey,
        (current) =>
          markOptimisticFailed(current, context.optimisticId),
      );

      const pending = pendingRef.current.get(context.optimisticId);
      if (pending) {
        pending.status = 'failed';
      }
    },
  });

  // --- Public API ------------------------------------------------------------

  const sendMessage = useCallback(
    (payload: SendTextPayload) => {
      const optimisticId = createOptimisticId();
      textMutation.mutate({ ...payload, optimisticId });
    },
    [textMutation],
  );

  const sendMedia = useCallback(
    (payload: SendMediaPayload) => {
      const optimisticId = createOptimisticId();
      mediaMutation.mutate({ ...payload, optimisticId });
    },
    [mediaMutation],
  );

  const retryMessage = useCallback(
    (optimisticId: string) => {
      const retryPayload = retryPayloadsRef.current.get(optimisticId);
      if (!retryPayload) return;

      // Reset status in cache back to queued.
      const messagesKey = [
        'conversation',
        retryPayload.conversationId,
        'messages',
      ];

      queryClient.setQueryData<MessagesInfiniteData>(
        messagesKey,
        (current) => {
          if (!current) return current;
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === optimisticId
                  ? { ...item, status: 'QUEUED' }
                  : item,
              ),
            })),
          };
        },
      );

      const pending = pendingRef.current.get(optimisticId);
      if (pending) {
        pending.status = 'sending';
      }

      textMutation.mutate(retryPayload);
    },
    [queryClient, textMutation],
  );

  const pendingMessages = useMemo<PendingMessage[]>(
    () => Array.from(pendingRef.current.values()),
    // Re-derive when mutation state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [textMutation.status, mediaMutation.status],
  );

  return useMemo(
    () => ({
      sendMessage,
      sendMedia,
      pendingMessages,
      retryMessage,
      isSending: textMutation.isPending || mediaMutation.isPending,
    }),
    [
      sendMessage,
      sendMedia,
      pendingMessages,
      retryMessage,
      textMutation.isPending,
      mediaMutation.isPending,
    ],
  );
}
