'use client';

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import type { ConversationMessage, ConversationMessagesPage } from '@/lib/types';

interface UseCursorMessagesOptions {
  conversationId: string | null | undefined;
  /** Number of messages per page (default 30). */
  limit?: number;
  /** Whether the query is enabled (default true). */
  enabled?: boolean;
}

interface UseCursorMessagesReturn {
  /** All loaded messages ordered chronologically (oldest first). */
  messages: ConversationMessage[];
  /** Fetch the next (older) page of messages. */
  fetchOlderMessages: () => void;
  /** Whether there are more older messages to load. */
  hasOlderMessages: boolean;
  /** Whether a page of older messages is currently being fetched. */
  isLoadingOlder: boolean;
  /** Whether the initial page is being loaded. */
  isLoadingInitial: boolean;
  /** Whether data exists (at least one page loaded). */
  hasData: boolean;
  /** Any error from the query. */
  error: Error | null;
}

export function useCursorMessages({
  conversationId,
  limit = 30,
  enabled = true,
}: UseCursorMessagesOptions): UseCursorMessagesReturn {
  const query = useInfiniteQuery({
    queryKey: ['conversation', conversationId, 'messages'] as const,
    enabled: enabled && Boolean(conversationId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set('conversationId', conversationId!);
      if (pageParam) {
        params.set('cursor', pageParam);
      }
      params.set('limit', String(limit));

      return apiRequest<ConversationMessagesPage>(
        `messages?${params.toString()}`,
      );
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    // Messages are fetched on demand, not on interval.
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  // Pages come back in reverse-chronological order from the API (newest page
  // first). Each page's `items` are also newest-first. We reverse both so the
  // final array is chronological (oldest first) for rendering.
  const messages = useMemo<ConversationMessage[]>(() => {
    if (!query.data?.pages.length) return [];

    return [...query.data.pages]
      .reverse()
      .flatMap((page) => page.items);
  }, [query.data]);

  return useMemo(
    () => ({
      messages,
      fetchOlderMessages: () => {
        if (query.hasNextPage && !query.isFetchingNextPage) {
          void query.fetchNextPage();
        }
      },
      hasOlderMessages: Boolean(query.hasNextPage),
      isLoadingOlder: query.isFetchingNextPage,
      isLoadingInitial: query.isLoading,
      hasData: Boolean(query.data?.pages.length),
      error: query.error,
    }),
    [messages, query],
  );
}
