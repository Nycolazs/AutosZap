import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  MessageSquareMore,
  ShieldCheck,
  UsersRound,
  Workflow,
} from 'lucide-react';
import { LeadInterestForm } from '@/components/marketing/lead-interest-form';
import { ScreenshotShowcase } from '@/components/marketing/screenshot-showcase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'AutosZap — Atendimento, CRM e Automacao para WhatsApp Business',
  description:
    'Plataforma B2B que une inbox multiatendente, CRM com pipeline e automacao em uma experiencia unica para equipes que usam WhatsApp Business Platform.',
  alternates: { canonical: 'https://autoszap.com' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AutosZap',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://autoszap.com',
  description:
    'Plataforma B2B que une inbox multiatendente, CRM com pipeline e automacao para WhatsApp Business Platform.',
  offers: {
    '@type': 'Offer',
    category: 'SaaS',
  },
  featureList: [
    'Inbox multiatendente com distribuicao de conversas',
    'CRM com pipeline para leads e oportunidades',
    'Campanhas e listas para operacao comercial',
    'Automacoes para reduzir retrabalho no atendimento',
    'Gestao de equipe e perfis de acesso',
    'Indicadores de desempenho para decisao rapida',
  ],
};

const valueCards = [
  {
    title: 'Atendimento centralizado',
    description:
      'Conversa, historico e contexto em uma fila unica para toda a equipe.',
    icon: MessageSquareMore,
  },
  {
    title: 'Processo comercial claro',
    description:
      'CRM conectado ao atendimento para acompanhar cada oportunidade.',
    icon: Workflow,
  },
  {
    title: 'Governanca operacional',
    description:
      'Permissoes, padrao de fluxo e visibilidade para crescer com controle.',
    icon: ShieldCheck,
  },
];

const capabilities = [
  'Inbox multiatendente com distribuicao de conversas.',
  'CRM com pipeline para leads e oportunidades.',
  'Campanhas e listas para operacao comercial.',
  'Automacoes para reduzir retrabalho no atendimento.',
  'Gestao de equipe e perfis de acesso.',
  'Indicadores de desempenho para decisao rapida.',
];

const implementationFlow = [
  'Diagnostico da operacao e definicao do plano inicial.',
  'Integracao do numero no WhatsApp Business Platform.',
  'Configuracao de equipe, funil e regras operacionais.',
  'Go-live com acompanhamento e ajustes de melhoria.',
];

const integrationChecklist = [
  'Conta Meta Business validada e com acesso administrativo.',
  'Numero pronto para API oficial (sem uso no app comum).',
  'Dados da empresa para validacao quando necessario.',
  'Responsavel interno para aprovar etapas do onboarding.',
];

export default function HomePage() {
  return (
    <main className="relative h-dvh overflow-y-auto">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_6%,rgba(56,145,255,0.16),transparent_30%),radial-gradient(circle_at_84%_88%,rgba(22,152,196,0.12),transparent_28%)]" />

      <div className="relative z-10 mx-auto w-full max-w-[1080px] px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pt-8">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background-panel/25 px-4 py-3 backdrop-blur-sm sm:px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/brand/autoszap-mark.png"
              alt="AutosZap"
              width={40}
              height={40}
              className="h-9 w-9 object-contain"
              priority
            />
            <div>
              <p className="font-heading text-lg font-semibold tracking-tight">AutosZap</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Atendimento & CRM
              </p>
            </div>
          </Link>

          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <Button asChild variant="secondary" className="flex-1 sm:flex-none">
              <Link href="/como-integrar">Como integrar numero</Link>
            </Button>
            <Button asChild className="flex-1 sm:flex-none">
              <Link href="/login">Entrar na plataforma</Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-stretch">
          <div className="space-y-5">
            <p className="inline-flex rounded-full border border-primary/30 bg-primary-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              Plataforma B2B para WhatsApp
            </p>

            <div className="space-y-3">
              <h1 className="font-heading text-[clamp(2.2rem,4.8vw,3.7rem)] font-semibold leading-[0.94] tracking-tight">
                Home clean, operacao organizada e resultado real para sua equipe.
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                O AutoZap une atendimento, CRM e automacao em uma experiencia unica. Voce ganha velocidade no dia a dia sem abrir mao de controle e qualidade.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Button asChild className="min-w-[190px]">
                <a href="#quero-ser-cliente">
                  Quero ser cliente
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="secondary" className="min-w-[190px]">
                <Link href="/como-integrar">Ver guia de integracao</Link>
              </Button>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-background-panel/30 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Atendimento</p>
                <p className="mt-1 text-sm font-medium">Fila unica e contexto completo</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background-panel/30 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Comercial</p>
                <p className="mt-1 text-sm font-medium">Funil com previsibilidade</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background-panel/30 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Gestao</p>
                <p className="mt-1 text-sm font-medium">Decisao com indicadores</p>
              </div>
            </div>
          </div>

          <Card className="rounded-[24px] p-0">
            <CardContent className="space-y-4 p-5 sm:p-6">
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary/85">Resumo executivo</p>
              <h2 className="font-heading text-2xl leading-tight">AutoZap em tres pilares</h2>
              <div className="space-y-2.5">
                {valueCards.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div key={item.title} className="rounded-lg border border-border/70 bg-background-panel/35 px-3 py-3">
                      <div className="flex items-start gap-2.5">
                        <div className="inline-flex rounded-md border border-primary/30 bg-primary-soft p-1.5 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{item.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-14 space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-primary/85">Visual do produto</p>
            <h2 className="font-heading text-2xl sm:text-[2rem]">Como a plataforma aparece para sua operacao</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Uma vitrine objetiva dos principais modulos, pensada para mostrar valor pratico sem poluicao visual.
            </p>
          </div>

          <ScreenshotShowcase />
        </section>

        <section className="mt-14 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="rounded-[24px] p-0">
            <CardContent className="space-y-3 p-5 sm:p-6">
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary/85">Modulos principais</p>
              <h2 className="font-heading text-2xl leading-tight">Tudo que sustenta a rotina da equipe</h2>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {capabilities.map((item) => (
                  <div key={item} className="flex items-start gap-2 rounded-lg border border-border/70 bg-background-panel/35 px-3 py-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm text-foreground/88">{item}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] p-0">
            <CardContent className="space-y-3 p-5 sm:p-6">
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary/85">Implantacao</p>
              <h2 className="font-heading text-2xl leading-tight">Fluxo simples de entrada</h2>
              <div className="space-y-2.5">
                {implementationFlow.map((step, index) => (
                  <div key={step} className="flex items-start gap-3 rounded-lg border border-border/70 bg-background-panel/35 px-3 py-2.5">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary-soft text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <p className="text-sm text-foreground/88">{step}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-14 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card className="rounded-[24px] p-0">
            <CardContent className="space-y-3 p-5 sm:p-6">
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary/85">Integracao de numero</p>
              <h2 className="font-heading text-2xl leading-tight">Preparacao para conectar com seguranca</h2>
              <div className="space-y-2">
                {integrationChecklist.map((item) => (
                  <div key={item} className="flex items-start gap-2 rounded-lg border border-border/70 bg-background-panel/35 px-3 py-2.5">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm text-foreground/88">{item}</p>
                  </div>
                ))}
              </div>
              <Button asChild variant="secondary" className="w-full sm:w-auto">
                <Link href="/como-integrar">Acessar guia completo</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] p-0">
            <CardContent className="space-y-4 p-5 sm:p-6">
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary/85">Pronto para iniciar</p>
              <h2 className="font-heading text-2xl leading-tight">Onboarding com acompanhamento real</h2>
              <p className="text-sm text-muted-foreground">
                Nao existe cadastro automatico. Nossa equipe alinha seu cenario e conduz a implantacao para voce entrar com padrao profissional.
              </p>
              <div className="space-y-2">
                {[
                  'Diagnostico comercial e operacional da empresa.',
                  'Definicao de estrategia para numero e conta Meta.',
                  'Plano de entrada com foco em resultado pratico.',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2 rounded-lg border border-border/70 bg-background-panel/35 px-3 py-2.5">
                    <UsersRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm text-foreground/88">{item}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section id="quero-ser-cliente" className="mt-14 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <LeadInterestForm />

          <Card className="rounded-[24px] p-0">
            <CardContent className="space-y-4 p-5 sm:p-6">
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary/85">Proximo passo</p>
              <h2 className="font-heading text-2xl leading-tight">Seu interesse entra direto na fila comercial</h2>
              <p className="text-sm text-muted-foreground">
                Assim que recebermos seus dados, retornamos com orientacao sobre integracao e melhor formato de implantacao para sua equipe.
              </p>
              <div className="rounded-xl border border-primary/30 bg-primary-soft px-3 py-2.5 text-xs text-primary">
                Liberacao de cliente acontece apos validacao comercial e tecnica.
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
