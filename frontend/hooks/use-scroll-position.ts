'use client';

import { useCallback, useRef } from 'react';

const NEAR_BOTTOM_THRESHOLD = 150;

interface UseScrollPositionReturn {
  /** Attach this ref to the scrollable container element. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Call BEFORE prepending older messages (e.g. before fetchNextPage).
   * Snapshots the current scroll position.
   */
  onBeforePrepend: () => void;
  /**
   * Call AFTER older messages have been rendered into the DOM.
   * Restores the scroll position so the user sees the same content.
   */
  onAfterPrepend: () => void;
  /**
   * Scrolls to the bottom of the container.
   * Optionally smooth or instant.
   */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /**
   * Returns true if the user is currently near the bottom of the scroll area.
   * Use this to decide whether to auto-scroll on new messages.
   */
  isNearBottom: () => boolean;
}

export function useScrollPosition(): UseScrollPositionReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollSnapshotRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);

  const onBeforePrepend = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    scrollSnapshotRef.current = {
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
    };
  }, []);

  const onAfterPrepend = useCallback(() => {
    const el = containerRef.current;
    const snapshot = scrollSnapshotRef.current;
    if (!el || !snapshot) return;

    // The new scrollHeight is larger because older messages were prepended.
    // Adjust scrollTop so the same content remains visible.
    const heightDiff = el.scrollHeight - snapshot.scrollHeight;
    el.scrollTop = snapshot.scrollTop + heightDiff;

    scrollSnapshotRef.current = null;
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const el = containerRef.current;
      if (!el) return;

      el.scrollTo({
        top: el.scrollHeight,
        behavior,
      });
    },
    [],
  );

  const isNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;

    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom <= NEAR_BOTTOM_THRESHOLD;
  }, []);

  return {
    containerRef,
    onBeforePrepend,
    onAfterPrepend,
    scrollToBottom,
    isNearBottom,
  };
}
