'use client';

import { Check, ChevronDown, Loader2, MessageSquareText } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { InboxInstance } from '@/lib/types';
import { cn } from '@/lib/utils';

const ALL_INBOX_INSTANCES_VALUE = 'ALL';

type ConversationInstanceFilterItem = {
  value: string;
  label: string;
  hint: string;
  visibleConversationsCount: number;
  activityCount: number;
  hasNewMessages: boolean;
};

function getInboxInstanceLabel(
  instance?: Pick<InboxInstance, 'name' | 'phoneNumber'> | null,
) {
  const instanceName = instance?.name?.trim();

  if (instanceName) {
    return instanceName;
  }

  const instancePhone = instance?.phoneNumber?.trim();

  if (instancePhone) {
    return instancePhone;
  }

  return null;
}

function formatConversationCountLabel(count: number) {
  if (count === 0) {
    return 'Sem conversas';
  }

  return `${count} conversa${count === 1 ? '' : 's'}`;
}

function getInboxInstanceActivityCount(
  instance: Pick<InboxInstance, 'unreadMessagesCount' | 'newConversationsCount'>,
) {
  return instance.unreadMessagesCount;
}

function formatCompactCount(count: number) {
  return count > 99 ? '99+' : String(count);
}

export function ConversationInstanceFilter({
  value,
  onValueChange,
  instances,
  isFetching = false,
}: {
  value: string | null;
  onValueChange: (value: string | null) => void;
  instances: InboxInstance[];
  isFetching?: boolean;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);

  const items = useMemo<ConversationInstanceFilterItem[]>(() => {
    const allVisibleConversationsCount = instances.reduce(
      (total, instance) => total + instance.visibleConversationsCount,
      0,
    );
    const allUnreadMessagesCount = instances.reduce(
      (total, instance) => total + instance.unreadMessagesCount,
      0,
    );

    return [
      {
        value: ALL_INBOX_INSTANCES_VALUE,
        label: 'Todas as instancias',
        hint: formatConversationCountLabel(allVisibleConversationsCount),
        visibleConversationsCount: allVisibleConversationsCount,
        activityCount: allUnreadMessagesCount,
        hasNewMessages: instances.some(
          (instance) => instance.unreadMessagesCount > 0,
        ),
      },
      ...instances.map((instance) => ({
        value: instance.id,
        label: getInboxInstanceLabel(instance) ?? 'Instancia sem nome',
        hint: formatConversationCountLabel(instance.visibleConversationsCount),
        visibleConversationsCount: instance.visibleConversationsCount,
        activityCount: getInboxInstanceActivityCount(instance),
        hasNewMessages: instance.unreadMessagesCount > 0,
      })),
    ];
  }, [instances]);

  const selectedValue = value ?? ALL_INBOX_INSTANCES_VALUE;
  const activeIndex = useMemo(
    () => items.findIndex((item) => item.value === selectedValue),
    [items, selectedValue],
  );
  const activeItem = items[activeIndex] ?? items[0];

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const targetIndex = activeIndex >= 0 ? activeIndex : 0;
    const frame = window.requestAnimationFrame(() => {
      itemRefs.current[targetIndex]?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, open]);

  const selectValue = (nextValue: string) => {
    onValueChange(
      nextValue === ALL_INBOX_INSTANCES_VALUE ? null : nextValue,
    );
    setOpen(false);
    triggerRef.current?.focus();
  };

  const focusItem = (nextIndex: number) => {
    const normalizedIndex = (nextIndex + items.length) % items.length;
    itemRefs.current[normalizedIndex]?.focus();
  };

  if (!activeItem) {
    return null;
  }

  return (
    <div className="space-y-2.5" ref={rootRef}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
          Instancias
        </p>
        {isFetching ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <div className="relative rounded-[22px] border border-border p-2 shadow-[0_18px_34px_rgba(2,10,22,0.08)]">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (
              event.key === 'ArrowDown' ||
              event.key === 'Enter' ||
              event.key === ' '
            ) {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            'flex w-full items-center gap-3 rounded-[18px] border border-border bg-background-elevated px-4 py-3 text-left shadow-[0_12px_24px_rgba(2,10,22,0.08)] transition-all hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/35',
            open && 'border-primary/25',
          )}
        >
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium tracking-[0.01em] text-foreground">
              {activeItem.label}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground/85">
              {activeItem.hint}
            </span>
          </div>
          {activeItem.hasNewMessages ? (
            <span className="inline-flex h-8 items-center gap-1 rounded-full border border-primary/20 bg-primary-soft px-2.5 text-[11px] font-semibold text-primary">
              <MessageSquareText className="h-3.5 w-3.5" />
              {formatCompactCount(activeItem.activityCount)}
            </span>
          ) : null}
          <span className="inline-flex h-8 min-w-[32px] items-center justify-center rounded-full border border-foreground/10 bg-foreground/[0.05] px-2.5 text-[12px] font-semibold text-foreground/85">
            {activeItem.visibleConversationsCount}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180 text-foreground/80',
            )}
          />
        </button>

        {open ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Filtrar conversas por instancia"
            className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 rounded-[24px] border border-border bg-background-elevated p-2.5 shadow-[0_24px_60px_rgba(2,10,22,0.15)]"
          >
            <div className="px-2 pb-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary/70">
                Filtrar por instancia
              </p>
            </div>

            <div className="space-y-1.5">
              {items.map((item, index) => {
                const isSelected = item.value === selectedValue;

                return (
                  <button
                    key={item.value}
                    ref={(node) => {
                      itemRefs.current[index] = node;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectValue(item.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        focusItem(index + 1);
                      }

                      if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        focusItem(index - 1);
                      }

                      if (event.key === 'Home') {
                        event.preventDefault();
                        focusItem(0);
                      }

                      if (event.key === 'End') {
                        event.preventDefault();
                        focusItem(items.length - 1);
                      }

                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectValue(item.value);
                      }

                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setOpen(false);
                        triggerRef.current?.focus();
                      }
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[18px] border px-3.5 py-3 text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/35',
                      isSelected
                        ? 'border-primary/25 bg-primary-soft text-foreground'
                        : 'border-transparent bg-foreground/[0.02] text-foreground/88 hover:border-border hover:bg-foreground/[0.05]',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">
                        {item.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground/85">
                        {item.hint}
                      </span>
                    </div>
                    {item.hasNewMessages ? (
                      <span className="inline-flex h-7 items-center gap-1 rounded-full border border-primary/20 bg-primary-soft px-2 text-[11px] font-semibold text-primary">
                        <MessageSquareText className="h-3.5 w-3.5" />
                        {formatCompactCount(item.activityCount)}
                      </span>
                    ) : null}
                    <span className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full border border-foreground/10 bg-foreground/10 px-2 text-[11px] font-semibold text-foreground/82">
                      {item.visibleConversationsCount}
                    </span>
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0 text-primary transition-opacity',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
