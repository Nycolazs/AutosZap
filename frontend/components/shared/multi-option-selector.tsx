'use client';

import { cn } from '@/lib/utils';

export type MultiOption = {
  label: string;
  value: string;
  color?: string;
};

export function MultiOptionSelector({
  options,
  value,
  onChange,
  emptyMessage = 'Nenhuma opcao disponivel.',
}: {
  options: MultiOption[];
  value: string[];
  onChange: (next: string[]) => void;
  emptyMessage?: string;
}) {
  if (!options.length) {
    return (
      <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-4 text-sm leading-6 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-[22px] border border-white/8 bg-background-panel/80 p-2.5 sm:grid-cols-2">
      {options.map((option) => {
        const active = value.includes(option.value);

        return (
          <button
            key={option.value}
            type="button"
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-[18px] border px-3.5 py-2.5 text-left transition',
              active
                ? 'border-primary/55 bg-primary/14 text-foreground shadow-[0_10px_24px_rgba(50,151,255,0.14)]'
                : 'border-white/8 bg-white/[0.02] text-muted-foreground hover:border-primary/30 hover:text-foreground',
            )}
            onClick={() =>
              onChange(
                active
                  ? value.filter((item) => item !== option.value)
                  : [...value, option.value],
              )
            }
          >
            {option.color ? (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: option.color }}
              />
            ) : (
              <span
                className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-full',
                  active ? 'bg-primary' : 'bg-white/20',
                )}
              />
            )}
            <span className="text-sm font-medium leading-5">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
