'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BriefcaseBusiness,
  Building2,
  Clock3,
  Code2,
  ContactRound,
  LayoutDashboard,
  Megaphone,
  MessageSquareText,
  RadioTower,
  Settings,
  Tags,
  Users,
  Workflow,
} from 'lucide-react';
import { isLocalDevelopment } from '@/lib/environment';
import { PermissionMap, PermissionRequirement, canAccessRequirement } from '@/lib/permissions';
import { cn } from '@/lib/utils';

export const APP_NAV_SECTIONS: Array<{
  label: string;
  items: Array<{
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    requirement?: PermissionRequirement;
  }>;
}> = [
  {
    label: 'Principal',
    items: [
      {
        href: '/app',
        label: 'Visão geral',
        icon: LayoutDashboard,
        requirement: { permission: 'DASHBOARD_VIEW' },
      },
    ],
  },
  {
    label: 'Atendimento',
    items: [
      {
        href: '/app/inbox',
        label: 'Inbox',
        icon: MessageSquareText,
        requirement: { permission: 'INBOX_VIEW' },
      },
      {
        href: '/app/crm',
        label: 'CRM',
        icon: BriefcaseBusiness,
        requirement: { permission: 'CRM_VIEW' },
      },
      {
        href: '/app/horarios-de-funcionamento',
        label: 'Horários de Funcionamento',
        icon: Clock3,
        requirement: {
          permissions: [
            'SETTINGS_VIEW',
            'CONFIGURE_CONVERSATION_ROUTING',
            'CONFIGURE_AUTO_MESSAGES',
            'CONFIGURE_BUSINESS_HOURS',
          ],
          mode: 'any',
        },
      },
    ],
  },
  {
    label: 'Marketing',
    items: [
      {
        href: '/app/disparos',
        label: 'Disparos',
        icon: Megaphone,
        requirement: { permission: 'CAMPAIGNS_VIEW' },
      },
      {
        href: '/app/grupos',
        label: 'Grupos',
        icon: Users,
        requirement: { permission: 'GROUPS_VIEW' },
      },
      {
        href: '/app/listas-de-contatos',
        label: 'Listas de contatos',
        icon: Building2,
        requirement: { permission: 'LISTS_VIEW' },
      },
      {
        href: '/app/contatos',
        label: 'Contatos',
        icon: ContactRound,
        requirement: { permission: 'CONTACTS_VIEW' },
      },
    ],
  },
  {
    label: 'Workspace',
    items: [
      {
        href: '/app/instancias',
        label: 'Instâncias',
        icon: RadioTower,
        requirement: { permission: 'INTEGRATIONS_VIEW' },
      },
      {
        href: '/app/pipeline',
        label: 'Pipeline',
        icon: Workflow,
        requirement: { permission: 'PIPELINE_VIEW' },
      },
      {
        href: '/app/tags',
        label: 'Tags',
        icon: Tags,
        requirement: { permission: 'TAGS_VIEW' },
      },
      {
        href: '/app/equipe',
        label: 'Equipe',
        icon: Users,
        requirement: { permission: 'TEAM_VIEW' },
      },
      ...(isLocalDevelopment
        ? [
            {
              href: '/app/desenvolvimento',
              label: 'Desenvolvimento',
              icon: Code2,
              requirement: { permission: 'DEVELOPMENT_VIEW' as const },
            },
          ]
        : []),
      {
        href: '/app/configuracoes',
        label: 'Configurações',
        icon: Settings,
        requirement: { permission: 'SETTINGS_VIEW' },
      },
    ],
  },
];

export function AppSidebar({ permissionMap }: { permissionMap?: PermissionMap }) {
  const pathname = usePathname();
  const visibleSections = APP_NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        canAccessRequirement(permissionMap, item.requirement),
      ),
    }))
    .filter((section) => section.items.length);

  return (
    <aside className="hidden h-screen w-[244px] shrink-0 overflow-hidden border-r border-border bg-background-elevated px-3 py-5 lg:flex lg:flex-col">
      <Link href="/app" className="mb-6 flex items-center gap-3 px-2">
        <Image
          src="/brand/autoszap-mark.png"
          alt="AutosZap"
          width={56}
          height={56}
          className="h-12 w-12 shrink-0 object-contain"
          priority
        />
        <div className="min-w-0">
          <p className="font-heading text-[24px] font-semibold tracking-tight text-foreground">AutosZap</p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">Atendimento & CRM</p>
        </div>
      </Link>

      <div className="space-y-5 overflow-y-auto pr-1">
        {visibleSections.map((section) => (
          <div key={section.label}>
            {section.items.length ? (
              <>
                <p className="mb-2.5 px-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
                  {section.label}
                </p>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-all',
                          active
                            ? 'bg-primary text-white shadow-[0_12px_28px_rgba(50,151,255,0.22)]'
                            : 'text-foreground/72 hover:bg-white/5 hover:text-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}
