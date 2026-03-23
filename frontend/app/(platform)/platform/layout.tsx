'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Building2,
  ChevronRight,
  ContactRound,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldUser,
  TicketCheck,
  Users2,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { AuthMeResponse, PlatformMeResponse } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/* ── Navigation config ── */

const NAV_ITEMS = [
  { href: '/platform', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/platform/companies', label: 'Empresas', icon: Building2 },
  { href: '/platform/users', label: 'Usuarios', icon: Users2 },
  { href: '/platform/interessados', label: 'Interessados', icon: ContactRound },
  { href: '/platform/suporte', label: 'Suporte', icon: TicketCheck },
  { href: '/platform/audit', label: 'Auditoria', icon: FileText },
];

function isPlatformRouteActive(pathname: string, href: string) {
  if (href === '/platform') return pathname === '/platform';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* ── Sidebar content (shared between desktop sidebar and mobile drawer) ── */

function SidebarContent({
  pathname,
  user,
  onLogout,
  onNavClick,
}: {
  pathname: string;
  user: PlatformMeResponse;
  onLogout: () => void;
  onNavClick?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="mb-1 flex items-center gap-3 px-3 py-2">
        <Image
          src="/brand/autoszap-mark.png"
          alt="AutosZap"
          width={36}
          height={36}
          className="h-8 w-8 shrink-0 object-contain"
          priority
        />
        <div className="min-w-0">
          <p className="font-heading text-[15px] font-bold leading-tight tracking-tight">
            AutosZap
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-primary">
            Control Plane
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-3 mb-3 h-px bg-border/60" />

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-2">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60">
          Administracao
        </p>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isPlatformRouteActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all',
                active
                  ? 'bg-primary text-primary-foreground shadow-[0_2px_8px_rgba(50,151,255,0.25)]'
                  : 'text-foreground/70 hover:bg-white/[0.06] hover:text-foreground',
              )}
            >
              <Icon className={cn('h-[18px] w-[18px]', active ? '' : 'text-muted-foreground group-hover:text-foreground')} />
              {item.label}
              {active && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* Quick link to app */}
      <div className="mx-2 mb-3">
        <Link
          href="/app"
          onClick={onNavClick}
          className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-white/[0.03] px-3 py-2.5 text-[12px] text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
        >
          <Building2 className="h-4 w-4" />
          Ir para painel da empresa
        </Link>
      </div>

      {/* User card + logout */}
      <div className="border-t border-border/60 px-3 pt-3 pb-1">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 ring-2 ring-primary/20">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
            <AvatarFallback className="text-[11px]">
              {user.name?.slice(0, 2).toUpperCase() ?? 'AD'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight">
              {user.name}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="shrink-0 rounded-lg p-2 text-muted-foreground transition hover:bg-danger/10 hover:text-danger"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main layout ── */

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const meQuery = useQuery({
    queryKey: ['platform-me'],
    queryFn: () => apiRequest<PlatformMeResponse>('platform-admin/me'),
    retry: 1,
  });

  const fallbackAuthMeQuery = useQuery({
    queryKey: ['auth-me-fallback'],
    queryFn: () => apiRequest<AuthMeResponse>('auth/me'),
    enabled: meQuery.isError,
    retry: 1,
  });

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  /* Loading state */
  if (meQuery.isLoading || (meQuery.isError && fallbackAuthMeQuery.isLoading)) {
    return (
      <div className="flex h-dvh min-h-dvh overflow-hidden bg-background text-foreground">
        <aside className="hidden w-[260px] shrink-0 border-r border-border/50 bg-background-panel/50 p-4 lg:flex lg:flex-col lg:gap-3">
          <div className="flex items-center gap-3 px-1 py-2">
            <Skeleton className="h-8 w-8 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-2.5 w-16 rounded" />
            </div>
          </div>
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-4/5 rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-3/4 rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
        </aside>
        <div className="flex-1 p-4 sm:p-6">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="mt-2 h-4 w-48 rounded" />
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
          <Skeleton className="mt-4 h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  /* Backend error — both queries failed */
  if (meQuery.isError && fallbackAuthMeQuery.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md rounded-2xl border-border/50">
          <CardContent className="space-y-4 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10">
              <ShieldUser className="h-7 w-7 text-danger" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Nao foi possivel validar o acesso</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                O servico de autenticacao nao respondeu agora. Tente novamente.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <Button
                className="rounded-xl"
                onClick={() => {
                  void meQuery.refetch();
                  void fallbackAuthMeQuery.refetch();
                }}
              >
                Tentar novamente
              </Button>
              <Button asChild variant="ghost" className="rounded-xl text-muted-foreground">
                <Link href="/app">Voltar para o painel</Link>
              </Button>
              <Button variant="ghost" className="rounded-xl text-muted-foreground" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sair da conta
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fallbackUser = fallbackAuthMeQuery.data?.platform?.isPlatformAdmin
    ? ({
        id: fallbackAuthMeQuery.data.id,
        name: fallbackAuthMeQuery.data.name,
        email: fallbackAuthMeQuery.data.email,
        avatarUrl: fallbackAuthMeQuery.data.avatarUrl,
        status: fallbackAuthMeQuery.data.status,
        platformRole: fallbackAuthMeQuery.data.platform?.role ?? null,
        isPlatformAdmin: true,
        memberships: [],
      } satisfies PlatformMeResponse)
    : null;

  const user = meQuery.data ?? fallbackUser;

  /* Access denied — not a platform admin */
  if (meQuery.isSuccess && !meQuery.data.isPlatformAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md rounded-2xl border-border/50">
          <CardContent className="space-y-4 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10">
              <ShieldUser className="h-7 w-7 text-danger" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Acesso restrito</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Esta area e exclusiva para administradores da plataforma.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <Button asChild className="rounded-xl">
                <Link href="/app">Voltar para o painel</Link>
              </Button>
              <Button variant="ghost" className="rounded-xl text-muted-foreground" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sair da conta
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md rounded-2xl border-border/50">
          <CardContent className="space-y-4 p-6 text-center">
            <div>
              <h1 className="text-lg font-semibold">Nao foi possivel confirmar o acesso</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                O status de permissao da plataforma nao foi validado nesta sessao.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <Button
                className="rounded-xl"
                onClick={() => {
                  void meQuery.refetch();
                  void fallbackAuthMeQuery.refetch();
                }}
              >
                Tentar novamente
              </Button>
              <Button variant="ghost" className="rounded-xl text-muted-foreground" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sair da conta
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-dvh overflow-hidden bg-background text-foreground">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden h-full w-[260px] shrink-0 flex-col border-r border-border/50 bg-background-elevated py-4 lg:flex">
        <SidebarContent
          pathname={pathname}
          user={user}
          onLogout={handleLogout}
        />
      </aside>

      {/* ── Mobile overlay ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer */}
          <aside className="absolute left-0 top-0 h-full w-[280px] bg-background-elevated py-4 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="absolute right-3 top-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent
              pathname={pathname}
              user={user}
              onLogout={handleLogout}
              onNavClick={() => setMobileMenuOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* ── Main content area ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex items-center justify-between border-b border-border/50 bg-background-elevated/80 px-4 py-3 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="rounded-lg p-2 text-foreground transition hover:bg-white/5"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2">
            <Image
              src="/brand/autoszap-mark.png"
              alt="AutosZap"
              width={28}
              height={28}
              className="h-6 w-6 object-contain"
            />
            <span className="font-heading text-[14px] font-bold tracking-tight">
              Platform
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
              <AvatarFallback className="text-[10px]">
                {user.name?.slice(0, 2).toUpperCase() ?? 'AD'}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Page content */}
        <main className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
