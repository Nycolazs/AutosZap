'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AccessDenied } from '@/components/shared/access-denied';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Topbar } from '@/components/layout/topbar';
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

  if (!meQuery.isLoading && me && !hasAccess && pathname !== '/app') {
    return (
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <AppSidebar permissionMap={me.permissionMap} />
        <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            userName={me.name}
            userRole={me.normalizedRole}
            permissionMap={me.permissionMap}
          />
          <main className="min-h-0 flex-1 overflow-auto">
            <div className="h-full p-4 lg:p-5">
              <AccessDenied fallbackHref={fallbackHref} />
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <AppSidebar permissionMap={me?.permissionMap} />
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          userName={me?.name}
          userRole={me?.normalizedRole}
          permissionMap={me?.permissionMap}
        />
        <main
          className={cn(
            'min-h-0 flex-1',
            isInboxRoute ? 'overflow-hidden' : 'overflow-auto',
          )}
        >
          <div className={cn('h-full p-4 lg:p-5', isInboxRoute && 'overflow-hidden')}>{children}</div>
        </main>
      </div>
    </div>
  );
}
