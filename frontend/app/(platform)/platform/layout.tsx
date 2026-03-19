'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, FileText, LayoutDashboard, ShieldUser, Users2 } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { PlatformMeResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  {
    href: '/platform',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/platform/companies',
    label: 'Empresas',
    icon: Building2,
  },
  {
    href: '/platform/users',
    label: 'Usuários',
    icon: Users2,
  },
  {
    href: '/platform/audit',
    label: 'Auditoria',
    icon: FileText,
  },
];

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const meQuery = useQuery({
    queryKey: ['platform-me'],
    queryFn: () => apiRequest<PlatformMeResponse>('platform-admin/me'),
  });

  if (meQuery.isLoading) {
    return (
      <div className="flex h-dvh min-h-dvh overflow-hidden bg-background text-foreground">
        <aside className="hidden w-[280px] shrink-0 border-r border-border/70 bg-background-panel/70 p-4 lg:flex lg:flex-col lg:gap-4">
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-4/5 rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
        </aside>
        <main className="flex-1 overflow-auto p-4">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="mt-4 h-[calc(100%-8rem)] w-full rounded-2xl" />
        </main>
      </div>
    );
  }

  if (meQuery.isError || !meQuery.data?.isPlatformAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <ShieldUser className="h-6 w-6 text-primary" />
              <h1 className="text-lg font-semibold">Acesso restrito</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Esta área é exclusiva para administradores da plataforma.
            </p>
            <Button asChild>
              <Link href="/app">Voltar para o painel da empresa</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-dvh overflow-hidden bg-background text-foreground">
      <aside className="hidden h-full w-[280px] shrink-0 border-r border-border bg-background-elevated p-4 lg:flex lg:flex-col">
        <div className="mb-6 rounded-2xl border border-border/70 bg-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Control Plane</p>
          <p className="mt-1 text-lg font-semibold">AutosZap Platform</p>
          <p className="text-xs text-muted-foreground">{meQuery.data.email}</p>
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground/80 hover:bg-white/5 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-5 lg:p-6">{children}</main>
    </div>
  );
}
