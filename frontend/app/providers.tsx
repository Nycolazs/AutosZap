'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Loader2 } from 'lucide-react';
import { ThemeProvider, useTheme } from 'next-themes';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { GlobalLoadingIndicator } from '@/components/layout/global-loading-indicator';

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      richColors
      theme={resolvedTheme === 'light' ? 'light' : 'dark'}
      position="top-right"
      expand
      icons={{
        loading: <Loader2 className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            'rounded-[24px] border border-border/70 bg-background-panel/95 text-foreground shadow-[0_24px_64px_rgba(3,8,20,0.28)] backdrop-blur-xl',
          content: 'gap-1',
          title: 'text-[15px] font-semibold leading-6 text-foreground',
          description: 'text-[13px] leading-5 text-muted-foreground',
          icon: 'text-primary',
          loader: 'text-primary',
          loading:
            'border-primary/24 bg-[linear-gradient(135deg,rgba(50,151,255,0.16),rgba(15,23,42,0.06))]',
          success:
            'border-emerald-500/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(15,23,42,0.06))]',
          error:
            'border-danger/20 bg-[linear-gradient(135deg,rgba(239,68,68,0.16),rgba(15,23,42,0.06))]',
          info:
            'border-primary/18 bg-[linear-gradient(135deg,rgba(50,151,255,0.12),rgba(15,23,42,0.05))]',
          warning:
            'border-amber-500/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(15,23,42,0.05))]',
        },
      }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <GlobalLoadingIndicator />
        {children}
        <ThemedToaster />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
