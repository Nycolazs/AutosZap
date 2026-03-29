'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  ChevronRight,
  LayoutDashboard,
  Megaphone,
  MessageSquareText,
  PanelBottomOpen,
} from 'lucide-react';
import { APP_NAV_SECTIONS } from '@/components/layout/app-sidebar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PermissionMap, canAccessRequirement } from '@/lib/permissions';
import { cn } from '@/lib/utils';

function isRouteActive(pathname: string, href: string) {
  if (href === '/app') {
    return pathname === '/app';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

const PRIMARY_DESTINATIONS = [
  { href: '/app', label: 'Painel', icon: LayoutDashboard },
  { href: '/app/inbox', label: 'Inbox', icon: MessageSquareText },
  { href: '/app/crm', label: 'CRM', icon: BriefcaseBusiness },
  { href: '/app/disparos', label: 'Disparos', icon: Megaphone },
] as const;

export function MobileBottomNav({
  permissionMap,
}: {
  permissionMap?: PermissionMap;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

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

  const visiblePrimary = PRIMARY_DESTINATIONS.filter((item) =>
    visibleSections.some((section) =>
      section.items.some((entry) => entry.href === item.href),
    ),
  );

  const extraSections = visibleSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          !PRIMARY_DESTINATIONS.some((entry) => entry.href === item.href) &&
          item.href !== '/app/menu-interativo',
      ),
    }))
    .filter((section) => section.items.length);

  if (!visiblePrimary.length) {
    return null;
  }

  return (
    <>
      <nav className="motion-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[calc(0.55rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl dark:bg-[linear-gradient(180deg,rgba(5,16,29,0.95),rgba(4,13,25,0.98))] lg:hidden">
        <div className="grid grid-cols-5 gap-1 px-2">
          {visiblePrimary.map((item) => {
            const active = isRouteActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex min-h-11 flex-col items-center justify-center rounded-xl px-1.5 py-1.5 text-[10px] font-medium transition',
                  active
                    ? 'bg-primary text-white shadow-[0_10px_22px_rgba(50,151,255,0.28)]'
                    : 'text-foreground/75 hover:bg-foreground/[0.05] hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="mt-1 truncate">{item.label}</span>
              </Link>
            );
          })}

          <Button
            variant="ghost"
            className="h-auto min-h-11 flex-col rounded-xl px-1.5 py-1.5 text-[10px] font-medium text-foreground/78"
            onClick={() => setMoreOpen(true)}
          >
            <PanelBottomOpen className="h-4 w-4" />
            <span className="mt-1">Mais</span>
          </Button>
        </div>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="max-h-[88vh] sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Mais áreas</DialogTitle>
            <DialogDescription>
              Atalhos para módulos administrativos e configurações.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto pr-1">
            {extraSections.map((section) => (
              <div key={section.label}>
                <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                  {section.label}
                </p>
                <div className="space-y-1.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isRouteActive(pathname, item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition',
                          active
                            ? 'border-primary/35 bg-primary-soft text-foreground'
                            : 'border-border bg-foreground/[0.02] text-foreground/82 hover:border-border hover:bg-foreground/[0.05]',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
