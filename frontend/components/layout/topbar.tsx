'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, LogOut, Menu, Search } from 'lucide-react';
import { toast } from 'sonner';
import { APP_NAV_SECTIONS } from '@/components/layout/app-sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/api-client';
import {
  PermissionMap,
  canAccessRequirement,
  getRoleLabel,
} from '@/lib/permissions';
import {
  NotificationRealtimeEvent,
  NotificationsResponse,
} from '@/lib/types';
import { cn, formatDate } from '@/lib/utils';

function isRouteActive(pathname: string, href: string) {
  if (href === '/app') {
    return pathname === '/app';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Topbar({
  userName,
  userRole,
  userAvatarUrl,
  companyName,
  companyAvatarUrl,
  permissionMap,
}: {
  userName?: string;
  userRole?: string;
  userAvatarUrl?: string | null;
  companyName?: string;
  companyAvatarUrl?: string | null;
  permissionMap?: PermissionMap;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const previousUnreadIdsRef = useRef<string[]>([]);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const visibleSections = useMemo(
    () =>
      APP_NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          canAccessRequirement(permissionMap, item.requirement),
        ),
      })).filter((section) => section.items.length),
    [permissionMap],
  );

  const currentLabel = useMemo(
    () =>
      visibleSections
        .flatMap((section) => section.items)
        .find((item) => isRouteActive(pathname, item.href))?.label ??
      'AutosZap',
    [pathname, visibleSections],
  );

  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiRequest<NotificationsResponse>('notifications?limit=12'),
    refetchInterval: notificationsOpen ? 15_000 : 60_000,
    refetchOnReconnect: true,
    refetchOnWindowFocus: notificationsOpen,
    staleTime: notificationsOpen ? 0 : 60_000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest('notifications/read-all', { method: 'POST' }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const previous =
        queryClient.getQueryData<NotificationsResponse>(['notifications']);

      if (previous) {
        const readAt = new Date().toISOString();

        queryClient.setQueryData<NotificationsResponse>(['notifications'], {
          unreadCount: 0,
          items: previous.items.map((notification) => ({
            ...notification,
            readAt: notification.readAt ?? readAt,
          })),
        });
      }

      return { previous };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['notifications'], context.previous);
      }
    },
  });

  useEffect(() => {
    const eventSource = new EventSource('/api/proxy/notifications/stream');

    const handleNotificationEvent = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as NotificationRealtimeEvent;

        queryClient.setQueryData<NotificationsResponse>(
          ['notifications'],
          (current) => {
            if (!current) {
              return current;
            }

            const readAt = new Date().toISOString();
            const nextUnreadCount = payload.unreadCount ?? current.unreadCount;

            if (payload.type === 'notification.read-all') {
              return {
                unreadCount: nextUnreadCount,
                items: current.items.map((notification) => ({
                  ...notification,
                  readAt: notification.readAt ?? readAt,
                })),
              };
            }

            if (
              payload.type === 'notification.read' &&
              payload.notificationId
            ) {
              return {
                unreadCount: nextUnreadCount,
                items: current.items.map((notification) =>
                  notification.id === payload.notificationId
                    ? {
                        ...notification,
                        readAt: notification.readAt ?? readAt,
                      }
                    : notification,
                ),
              };
            }

            if (
              payload.type === 'notification.created' &&
              payload.notificationId &&
              payload.payload
            ) {
              const item = {
                id: payload.notificationId,
                title:
                  typeof payload.payload.title === 'string'
                    ? payload.payload.title
                    : 'Nova notificacao',
                body:
                  typeof payload.payload.body === 'string'
                    ? payload.payload.body
                    : '',
                type:
                  typeof payload.payload.type === 'string'
                    ? payload.payload.type
                    : 'INFO',
                entityType:
                  typeof payload.payload.entityType === 'string'
                    ? payload.payload.entityType
                    : null,
                entityId:
                  typeof payload.payload.entityId === 'string'
                    ? payload.payload.entityId
                    : null,
                linkHref:
                  typeof payload.payload.linkHref === 'string'
                    ? payload.payload.linkHref
                    : null,
                metadata:
                  payload.payload.metadata &&
                  typeof payload.payload.metadata === 'object' &&
                  !Array.isArray(payload.payload.metadata)
                    ? (payload.payload.metadata as Record<string, unknown>)
                    : null,
                createdAt:
                  typeof payload.payload.createdAt === 'string'
                    ? payload.payload.createdAt
                    : new Date().toISOString(),
                readAt: null,
              };

              const items = current.items.some(
                (notification) => notification.id === item.id,
              )
                ? current.items
                : [item, ...current.items].slice(0, 12);

              return {
                unreadCount: nextUnreadCount,
                items,
              };
            }

            return current;
          },
        );
      } catch {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    };

    eventSource.addEventListener(
      'notification-event',
      handleNotificationEvent as EventListener,
    );

    return () => {
      eventSource.removeEventListener(
        'notification-event',
        handleNotificationEvent as EventListener,
      );
      eventSource.close();
    };
  }, [queryClient]);

  useEffect(() => {
    const unreadNotifications = notificationsQuery.data?.items.filter(
      (item) => !item.readAt,
    );

    if (!unreadNotifications?.length) {
      previousUnreadIdsRef.current = [];
      return;
    }

    const previousUnreadIds = previousUnreadIdsRef.current;
    const newUnreadNotifications = unreadNotifications.filter(
      (item) => !previousUnreadIds.includes(item.id),
    );

    if (newUnreadNotifications.length > 0) {
      const latestNotification = newUnreadNotifications[0];
      toast.info(latestNotification.title, {
        description: latestNotification.body,
      });
    }

    previousUnreadIdsRef.current = unreadNotifications.map((item) => item.id);
  }, [notificationsQuery.data?.items]);

  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  async function openNotification(notificationId: string, linkHref?: string | null) {
    try {
      await apiRequest(`notifications/${notificationId}/read`, {
        method: 'POST',
      });
      queryClient.setQueryData<NotificationsResponse>(
        ['notifications'],
        (current) => {
          if (!current) {
            return current;
          }

          const readAt = new Date().toISOString();
          const wasUnread = current.items.some(
            (notification) =>
              notification.id === notificationId && !notification.readAt,
          );

          return {
            unreadCount: wasUnread
              ? Math.max(0, current.unreadCount - 1)
              : current.unreadCount,
            items: current.items.map((notification) =>
              notification.id === notificationId
                ? {
                    ...notification,
                    readAt: notification.readAt ?? readAt,
                  }
                : notification,
            ),
          };
        },
      );
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });

      if (linkHref) {
        router.push(linkHref);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Nao foi possivel abrir a notificacao agora.';
      toast.error(message);
    } finally {
      setNotificationsOpen(false);
    }
  }

  function submitSearch() {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return;
    }

    router.push(`/app/contatos?search=${encodeURIComponent(normalizedQuery)}`);
    setSearchOpen(false);
  }

  return (
    <>
      <div className="desktop-low-height-app-topbar flex shrink-0 items-center gap-3 border-b border-border bg-background/72 px-3 py-2.5 backdrop-blur-xl md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          <Button
            variant="secondary"
            size="icon"
            className="lg:hidden"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="min-w-0 lg:hidden">
            <p className="truncate text-[15px] font-semibold">{currentLabel}</p>
            <div className="flex min-w-0 items-center gap-2">
              {companyAvatarUrl ? (
                <Avatar className="h-5 w-5">
                  <AvatarImage src={companyAvatarUrl} alt={companyName ?? 'Empresa'} />
                  <AvatarFallback className="text-[9px]">
                    {companyName?.slice(0, 2).toUpperCase() ?? 'EM'}
                  </AvatarFallback>
                </Avatar>
              ) : null}
              <p className="truncate text-[11px] text-muted-foreground">
                {companyName ?? userName ?? 'AutosZap'}
              </p>
            </div>
          </div>
          <div className="relative hidden flex-1 md:block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  submitSearch();
                }
              }}
              placeholder="Buscar por contato, conversa ou lead"
              className="pl-11"
            />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <Button
            variant="secondary"
            size="icon"
            className="md:hidden"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="relative"
            onClick={() => setNotificationsOpen(true)}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {Math.min(unreadCount, 99)}
              </span>
            ) : null}
          </Button>

          <div className="hidden min-w-0 items-center gap-2 rounded-2xl border border-border bg-white/[0.03] px-2.5 py-1.5 sm:flex md:px-3 md:py-2">
            {companyAvatarUrl ? (
              <Avatar className="h-9 w-9">
                <AvatarImage src={companyAvatarUrl} alt={companyName ?? 'Empresa'} />
                <AvatarFallback>
                  {companyName?.slice(0, 2).toUpperCase() ?? 'EM'}
                </AvatarFallback>
              </Avatar>
            ) : null}
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                Empresa
              </p>
              <p className="truncate text-sm font-medium">
                {companyName ?? 'AutosZap'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-border bg-white/[0.03] px-2.5 py-1.5 md:gap-3 md:px-3 md:py-2">
            <Avatar>
              {userAvatarUrl && <AvatarImage src={userAvatarUrl} alt={userName ?? 'Avatar'} />}
              <AvatarFallback>
                {userName?.slice(0, 2).toUpperCase() ?? 'AS'}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:block">
              <p className="text-sm font-medium">{userName ?? 'AutosZap'}</p>
              <p className="text-xs text-muted-foreground">
                {getRoleLabel(userRole)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                router.push('/login');
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="mobile-menu-drawer left-0 right-auto top-0 bottom-auto h-dvh max-h-dvh w-[min(88vw,320px)] translate-x-0 translate-y-0 rounded-none border-r border-border border-l-0 bg-background-elevated p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-none sm:border-r sm:border-l-0">
          <DialogHeader>
            <DialogTitle>Navegação</DialogTitle>
            <DialogDescription>
              Acesse os módulos liberados para seu usuário.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 overflow-y-auto pr-1">
            {visibleSections.map((section) => (
              <div key={section.label}>
                <p className="mb-2 px-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
                  {section.label}
                </p>
                <div className="space-y-1">
                  {section.items
                    .filter((item) => item.href !== '/app/menu-interativo')
                    .map((item) => {
                    const active = isRouteActive(pathname, item.href);
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition',
                          active
                            ? 'bg-primary text-white shadow-[0_12px_28px_rgba(50,151,255,0.22)]'
                            : 'bg-white/[0.03] text-foreground/78 hover:bg-white/[0.06] hover:text-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Buscar no sistema</DialogTitle>
            <DialogDescription>
              Localize contatos, conversas e leads sem sair da tela atual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    submitSearch();
                  }
                }}
                placeholder="Buscar por contato, conversa ou lead"
                className="pl-11"
              />
            </div>
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSearchOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={submitSearch}>
                Buscar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden p-0 sm:h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-1.5rem)] sm:w-[min(680px,calc(100vw-1.5rem))] sm:max-w-none">
          <div className="shrink-0 flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="font-heading text-lg font-semibold">Notificações</h2>
              <p className="text-sm text-muted-foreground">
                Alertas do sistema e lembretes da operação.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {unreadCount > 0 ? (
                <Badge>{unreadCount} não lidas</Badge>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={unreadCount === 0 || markAllReadMutation.isPending}
              >
                Marcar tudo como lido
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {notificationsQuery.data?.items.length ? (
              <div className="space-y-3">
                {notificationsQuery.data.items.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() =>
                      void openNotification(
                        notification.id,
                        notification.linkHref,
                      )
                    }
                    className={cn(
                      'w-full rounded-[22px] border p-4 text-left transition',
                      notification.readAt
                        ? 'border-border bg-white/[0.02] text-foreground/72'
                        : 'border-primary/25 bg-primary-soft text-foreground shadow-[0_12px_30px_rgba(50,151,255,0.12)]',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{notification.title}</p>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(notification.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {notification.body}
                    </p>
                    {notification.linkHref ? (
                      <p className="mt-3 text-xs font-medium text-primary">
                        Abrir conversa
                      </p>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhuma notificação por aqui.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
