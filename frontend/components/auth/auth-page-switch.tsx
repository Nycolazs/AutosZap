'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

type AuthPageSwitchProps = {
  active: 'login' | 'register';
  onSelect?: (view: 'login' | 'register') => void;
};

const items = [
  { key: 'register' as const, href: '/register', label: 'Criar conta' },
  { key: 'login' as const, href: '/login', label: 'Entrar' },
];

export function AuthPageSwitch({ active, onSelect }: AuthPageSwitchProps) {
  return (
    <div className="grid w-full max-w-[270px] grid-cols-2 rounded-full border border-white/[0.08] bg-white/[0.03] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      {items.map((item) => {
        const className = cn(
          'rounded-full px-3 py-1.5 text-center text-[11px] font-semibold transition',
          item.key === active
            ? 'bg-white/[0.09] text-foreground shadow-[0_10px_24px_rgba(3,12,24,0.28)]'
            : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
        );

        if (onSelect) {
          return (
            <button
              key={item.key}
              type="button"
              className={className}
              aria-pressed={item.key === active}
              onClick={() => onSelect(item.key)}
            >
              {item.label}
            </button>
          );
        }

        return (
          <Link key={item.key} href={item.href} className={className}>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
