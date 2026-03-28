'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type ConversationStatusFilterValue =
  | 'ALL'
  | 'NEW'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'RESOLVED'
  | 'CLOSED';

type StatusItem = {
  value: ConversationStatusFilterValue;
  label: string;
  hint: string;
  dotClassName: string;
};

const STATUS_ITEMS: StatusItem[] = [
  {
    value: 'ALL',
    label: 'Todas',
    hint: 'Visão completa do inbox',
    dotClassName: 'bg-foreground/72',
  },
  {
    value: 'NEW',
    label: 'Novo',
    hint: 'Clientes sem primeira resposta',
    dotClassName: 'bg-[#8ed0ff] shadow-[0_0_12px_rgba(142,208,255,0.55)]',
  },
  {
    value: 'IN_PROGRESS',
    label: 'Em atendimento',
    hint: 'Conversas em curso',
    dotClassName: 'bg-[#45a0ff] shadow-[0_0_12px_rgba(69,160,255,0.5)]',
  },
  {
    value: 'WAITING',
    label: 'Aguardando',
    hint: 'Abertas para retomada',
    dotClassName: 'bg-[#f0c933] shadow-[0_0_12px_rgba(240,201,51,0.52)]',
  },
  {
    value: 'RESOLVED',
    label: 'Resolvido',
    hint: 'Atendimentos concluídos com sucesso',
    dotClassName: 'bg-[#56dfc0] shadow-[0_0_12px_rgba(86,223,192,0.45)]',
  },
  {
    value: 'CLOSED',
    label: 'Encerrado',
    hint: 'Finalizados sem continuidade',
    dotClassName: 'bg-[#f29aa8] shadow-[0_0_12px_rgba(242,154,168,0.42)]',
  },
];

type ConversationStatusSummary = Record<ConversationStatusFilterValue, number>;

export function ConversationStatusFilter({
  value,
  onValueChange,
  counts,
}: {
  value: ConversationStatusFilterValue;
  onValueChange: (value: ConversationStatusFilterValue) => void;
  counts: ConversationStatusSummary;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);

  const activeIndex = useMemo(
    () => STATUS_ITEMS.findIndex((item) => item.value === value),
    [value],
  );
  const activeItem = STATUS_ITEMS[activeIndex] ?? STATUS_ITEMS[0];
  const activeCount = counts[activeItem.value] ?? 0;

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

  const selectValue = (nextValue: ConversationStatusFilterValue) => {
    onValueChange(nextValue);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const focusItem = (nextIndex: number) => {
    const normalizedIndex =
      (nextIndex + STATUS_ITEMS.length) % STATUS_ITEMS.length;
    itemRefs.current[normalizedIndex]?.focus();
  };

  return (
    <div className="space-y-2.5" ref={rootRef}>
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <h1 className="font-heading text-[21px] font-semibold tracking-tight text-foreground">
            Conversas
          </h1>
          <span className="inline-flex h-7 items-center rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 text-[12px] font-medium text-foreground/78">
            {counts.ALL}
          </span>
        </div>
        <p className="text-[13px] leading-5 text-muted-foreground/90">{activeItem.hint}</p>
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
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            'flex w-full cursor-pointer items-center gap-3 rounded-[18px] border border-border bg-background-elevated px-4 py-3 text-left shadow-[0_12px_24px_rgba(2,10,22,0.08)] transition-all hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/35',
            open && 'border-primary/25',
          )}
        >
          <span
            className={cn(
              'h-2.5 w-2.5 shrink-0 rounded-full',
              activeItem.dotClassName,
            )}
          />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium tracking-[0.01em] text-foreground">
              {activeItem.label}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground/85">
              Toque para trocar o recorte
            </span>
          </div>
          <span className="inline-flex h-8 min-w-[32px] items-center justify-center rounded-full border border-foreground/10 bg-foreground/[0.05] px-2.5 text-[12px] font-semibold text-foreground/85">
            {activeCount}
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
            aria-label="Filtrar conversas por status"
            className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 rounded-[24px] border border-border bg-background-elevated p-2.5 shadow-[0_24px_60px_rgba(2,10,22,0.15)]"
          >
            <div className="px-2 pb-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary/70">
                Filtrar por status
              </p>
            </div>

            <div className="space-y-1.5">
              {STATUS_ITEMS.map((item, index) => {
                const count = counts[item.value] ?? 0;
                const isSelected = item.value === value;

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
                        focusItem(STATUS_ITEMS.length - 1);
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
                      'flex w-full cursor-pointer items-center gap-3 rounded-[18px] border px-3.5 py-3 text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/35',
                      isSelected
                        ? 'border-primary/25 bg-primary-soft text-foreground'
                        : 'border-transparent bg-foreground/[0.02] text-foreground/88 hover:border-border hover:bg-foreground/[0.05]',
                    )}
                  >
                    <span
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        item.dotClassName,
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">
                        {item.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground/85">
                        {item.hint}
                      </span>
                    </div>
                    <span className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full border border-foreground/10 bg-foreground/10 px-2 text-[11px] font-semibold text-foreground/82">
                      {count}
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
