'use client';

import { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Layers3, MessageCircleMore, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ShowcaseItem = {
  id: string;
  title: string;
  subtitle: string;
  highlight: string;
  icon: React.ComponentType<{ className?: string }>;
  bullets: string[];
};

const SHOWCASE_ITEMS: ShowcaseItem[] = [
  {
    id: 'inbox',
    title: 'Inbox centralizado',
    subtitle: 'Conversas organizadas por status, responsavel e prioridade.',
    highlight: 'Visao unica para toda a equipe',
    icon: MessageCircleMore,
    bullets: [
      'Fila compartilhada com historico completo por contato.',
      'Troca rapida entre atendentes sem perder contexto.',
      'Alertas para nao deixar conversa sem retorno.',
    ],
  },
  {
    id: 'crm',
    title: 'CRM comercial',
    subtitle: 'Pipeline visual para acompanhar cada oportunidade de venda.',
    highlight: 'Controle de ponta a ponta do funil',
    icon: Layers3,
    bullets: [
      'Cards por etapa com foco no proximo passo.',
      'Tags e observacoes para qualificar cada lead.',
      'Leitura facil de gargalos e conversao.',
    ],
  },
  {
    id: 'automation',
    title: 'Automacoes e fluxo',
    subtitle: 'Regras para distribuir atendimento com consistencia.',
    highlight: 'Padrao de atendimento escalavel',
    icon: Workflow,
    bullets: [
      'Distribuicao por horario e equipe.',
      'Mensagens de apoio para janelas inativas.',
      'Rotina operacional mais previsivel.',
    ],
  },
  {
    id: 'insights',
    title: 'Painel de performance',
    subtitle: 'Indicadores para medir velocidade e qualidade do atendimento.',
    highlight: 'Decisoes orientadas por dados',
    icon: BarChart3,
    bullets: [
      'Visibilidade de SLA e produtividade.',
      'Resumo diario com dados acionaveis.',
      'Base para melhoria continua da equipe.',
    ],
  },
];

function MockScreenshot({ item }: { item: ShowcaseItem }) {
  return (
    <div className="rounded-[20px] border border-border/70 bg-background-panel/35 p-4 sm:p-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background-panel/60 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-primary/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/45" />
          </div>
          <span className="text-[11px] text-muted-foreground">{item.highlight}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <div className="space-y-2 rounded-lg border border-border/70 bg-background-panel/55 p-3">
            <div className="h-7 rounded-md bg-primary/15" />
            <div className="h-7 rounded-md bg-white/7" />
            <div className="h-7 rounded-md bg-white/7" />
            <div className="h-7 rounded-md bg-white/7" />
          </div>

          <div className="space-y-2 rounded-lg border border-border/70 bg-background-panel/55 p-3">
            <div className="h-8 rounded-md bg-white/7" />
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="h-[4.5rem] rounded-md bg-white/7" />
              <div className="h-[4.5rem] rounded-md bg-white/7" />
            </div>
            <div className="h-12 rounded-md bg-primary/12" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ScreenshotShowcase() {
  const [activeId, setActiveId] = useState(SHOWCASE_ITEMS[0]?.id ?? '');

  const activeItem = useMemo(
    () => SHOWCASE_ITEMS.find((item) => item.id === activeId) ?? SHOWCASE_ITEMS[0],
    [activeId],
  );

  if (!activeItem) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {SHOWCASE_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeItem.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left transition-all',
                active
                  ? 'border-primary/35 bg-primary-soft text-foreground'
                  : 'border-border/70 bg-background-panel/30 text-foreground/85 hover:bg-background-panel/45',
              )}
            >
              <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
              <p className="mt-2 text-sm font-semibold leading-snug">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.highlight}</p>
            </button>
          );
        })}
      </div>

      <Card className="rounded-[24px] p-0">
        <CardContent className="space-y-4 p-4 sm:p-5 lg:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
            <MockScreenshot item={activeItem} />

            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary/85">Destaque do modulo</p>
              <h3 className="font-heading text-2xl leading-tight">{activeItem.title}</h3>
              <p className="text-sm text-muted-foreground">{activeItem.subtitle}</p>

              <div className="space-y-2">
                {activeItem.bullets.map((bullet) => (
                  <div key={bullet} className="flex items-start gap-2 rounded-lg border border-border/70 bg-background-panel/35 px-3 py-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm text-foreground/88">{bullet}</p>
                  </div>
                ))}
              </div>

              <Button asChild variant="secondary" className="w-full sm:w-auto">
                <a href="#quero-ser-cliente">Quero uma demo guiada</a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
