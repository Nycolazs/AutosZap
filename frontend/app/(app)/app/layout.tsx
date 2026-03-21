'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AccessDenied } from '@/components/shared/access-denied';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { RouteTransition } from '@/components/layout/route-transition';
import { Topbar } from '@/components/layout/topbar';
import { Skeleton } from '@/components/ui/skeleton';
import { apiRequest } from '@/lib/api-client';
import {
  canAccessRequirement,
  getFirstAccessibleAppPath,
  getRequiredPermissionForPath,
} from '@/lib/permissions';
import { AuthMeResponse } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isInboxRoute = pathname.startsWith('/app/inbox');
  const shouldShowMobileBottomNav = !isInboxRoute;
  const meQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiRequest<AuthMeResponse>('auth/me'),
  });
  const me = meQuery.data;
  const requiredPermission = getRequiredPermissionForPath(pathname);
  const hasAccess = canAccessRequirement(me?.permissionMap, requiredPermission);
  const fallbackHref = getFirstAccessibleAppPath(me?.permissionMap);

  useEffect(() => {
    if (!me || hasAccess || pathname !== '/app') {
      return;
    }

    router.replace(fallbackHref);
  }, [fallbackHref, hasAccess, me, pathname, router]);

  if (meQuery.isLoading) {
    return (
      <div className="flex h-dvh min-h-dvh overflow-hidden bg-background text-foreground">
        <aside className="hidden w-[272px] shrink-0 border-r border-border/70 bg-background-panel/70 p-4 lg:flex lg:flex-col lg:gap-4">
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-9 w-4/5 rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-5/6 rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
        </aside>

        <div className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 items-center gap-3 border-b border-border/70 px-3 py-3 md:px-4">
            <Skeleton className="h-10 w-10 rounded-xl lg:hidden" />
            <Skeleton className="h-10 w-48 rounded-xl" />
            <Skeleton className="ml-auto h-10 w-10 rounded-xl" />
            <Skeleton className="hidden h-10 w-52 rounded-xl md:block" />
          </header>

          <main
            data-app-shell
            className={cn(
              'min-h-0 flex-1',
              isInboxRoute ? 'overflow-hidden' : 'overflow-auto',
            )}
          >
            <div className="h-full space-y-4 px-3 py-3 sm:p-4 lg:p-5">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-[calc(100%-6.5rem)] w-full rounded-[28px]" />
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!meQuery.isLoading && me && !hasAccess && pathname !== '/app') {
    return (
      <div className="flex h-dvh min-h-dvh overflow-hidden bg-background text-foreground">
        <AppSidebar permissionMap={me.permissionMap} />
        <div className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            userName={me.name}
            userRole={me.normalizedRole}
            userAvatarUrl={me.avatarUrl}
            permissionMap={me.permissionMap}
          />
          <main data-app-shell className="min-h-0 flex-1 overflow-auto">
            <div className="h-full px-3 py-3 sm:p-4 lg:p-5">
              <AccessDenied fallbackHref={fallbackHref} />
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-dvh overflow-hidden bg-background text-foreground">
      <AppSidebar permissionMap={me?.permissionMap} />
      <div className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          userName={me?.name}
          userRole={me?.normalizedRole}
          userAvatarUrl={me?.avatarUrl}
          permissionMap={me?.permissionMap}
        />
        <main
          data-app-shell
          className={cn(
            'min-h-0 flex-1',
            isInboxRoute ? 'overflow-hidden' : 'overflow-auto',
          )}
        >
          <div
            className={cn(
              'min-h-full px-3 py-3 sm:p-4 lg:p-5',
              shouldShowMobileBottomNav && 'pb-24 lg:pb-5',
              isInboxRoute && 'overflow-hidden',
            )}
          >
            <RouteTransition className="min-h-full">{children}</RouteTransition>
          </div>
        </main>
        {shouldShowMobileBottomNav ? (
          <MobileBottomNav permissionMap={me?.permissionMap} />
        ) : null}
      </div>
    </div>
  );
}
