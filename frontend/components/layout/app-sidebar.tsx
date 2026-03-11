'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BriefcaseBusiness,
  Building2,
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
import { cn } from '@/lib/utils';

const sections = [
  {
    label: 'Principal',
    items: [{ href: '/app', label: 'Visao geral', icon: LayoutDashboard }],
  },
  {
    label: 'Atendimento',
    items: [
      { href: '/app/inbox', label: 'Inbox', icon: MessageSquareText },
      { href: '/app/crm', label: 'CRM', icon: BriefcaseBusiness },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { href: '/app/disparos', label: 'Disparos', icon: Megaphone },
      { href: '/app/grupos', label: 'Grupos', icon: Users },
      { href: '/app/listas-de-contatos', label: 'Listas de Contatos', icon: Building2 },
      { href: '/app/contatos', label: 'Contatos', icon: ContactRound },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/app/instancias', label: 'Instancias', icon: RadioTower },
      { href: '/app/desenvolvimento', label: 'Desenvolvimento', icon: Code2 },
      { href: '/app/pipeline', label: 'Pipeline', icon: Workflow },
      { href: '/app/tags', label: 'Tags', icon: Tags },
      { href: '/app/equipe', label: 'Equipe', icon: Users },
      { href: '/app/configuracoes', label: 'Configuracoes', icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-[244px] shrink-0 overflow-hidden border-r border-border bg-background-elevated px-3 py-5 lg:flex lg:flex-col">
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="rounded-2xl bg-primary p-2.5 text-white shadow-[0_16px_40px_rgba(50,151,255,0.26)]">
          <MessageSquareText className="h-5 w-5" />
        </div>
        <div>
          <p className="font-heading text-lg font-semibold">AutosZap</p>
          <p className="text-xs text-muted-foreground">SaaS premium para WhatsApp</p>
        </div>
      </div>

      <div className="space-y-5 overflow-y-auto pr-1">
        {sections.map((section) => (
          <div key={section.label}>
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
          </div>
        ))}
      </div>
    </aside>
  );
}
