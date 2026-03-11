'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Topbar } from '@/components/layout/topbar';
import { apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/utils';

type MeResponse = {
  name: string;
  role: string;
  workspace: { name: string };
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInboxRoute = pathname.startsWith('/app/inbox');
  const meQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiRequest<MeResponse>('auth/me'),
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar userName={meQuery.data?.name} userRole={meQuery.data?.role} />
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
