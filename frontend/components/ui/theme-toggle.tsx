'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const toggle = useCallback(() => {
    const root = document.documentElement;
    root.classList.add('theme-transition');

    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);

    const cleanup = setTimeout(() => {
      root.classList.remove('theme-transition');
    }, 450);

    return () => clearTimeout(cleanup);
  }, [resolvedTheme, setTheme]);

  if (!mounted) {
    return (
      <button
        type="button"
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-foreground/[0.03] transition-colors hover:bg-foreground/[0.06]',
          className,
        )}
        aria-label="Alternar tema"
      >
        <span className="h-4 w-4" />
      </button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border transition-colors',
        'bg-foreground/[0.03] hover:bg-foreground/[0.06]',
        className,
      )}
      aria-label={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
    >
      <Sun
        className={cn(
          'absolute h-4 w-4 transition-all duration-300',
          isDark
            ? 'rotate-90 scale-0 opacity-0'
            : 'rotate-0 scale-100 opacity-100 text-amber-500',
        )}
      />
      <Moon
        className={cn(
          'absolute h-4 w-4 transition-all duration-300',
          isDark
            ? 'rotate-0 scale-100 opacity-100 text-blue-300'
            : '-rotate-90 scale-0 opacity-0',
        )}
      />
    </button>
  );
}
