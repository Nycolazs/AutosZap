import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, FileText, KeyRound, Smartphone, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Como integrar seu numero ao AutosZap',
  description:
    'Guia completo de como integrar seu numero de WhatsApp ao AutosZap. Passo a passo para conectar com a API oficial do WhatsApp Business Platform.',
  alternates: { canonical: 'https://autoszap.com/como-integrar' },
};

const steps = [
  {
    title: '1. Definir qual numero sera usado',
    description:
      'Escolha se voce vai usar um numero novo dedicado ao AutoZap ou migrar um numero ja existente para a API oficial.',
    icon: Smartphone,
  },
  {
    title: '2. Preparar conta Meta Business',
    description:
      'A empresa precisa ter acesso ao Meta Business Manager e permissao para configurar o WhatsApp Business Platform.',
    icon: FileText,
  },
  {
    title: '3. Configurar app e credenciais',
    description:
      'Com o suporte do AutoZap, criamos as configuracoes de App, Phone Number ID, Business Account ID e tokens necessarios.',
    icon: KeyRound,
  },
  {
    title: '4. Conectar no AutoZap e validar',
    description:
      'Inserimos os dados no modulo de integracoes, testamos recebimento/envio e ativamos o fluxo de atendimento da equipe.',
    icon: Wrench,
  },
];

const optionCards = [
  {
    title: 'Opcao recomendada para iniciar rapido',
    subtitle: 'Usar um numero novo exclusivo para a operacao no AutoZap.',
    points: [
      'Evita impacto imediato em um numero que ja esta em uso.',
      'Processo tecnico costuma ser mais previsivel.',
      'Bom para empresas que querem iniciar com baixo risco operacional.',
    ],
  },
  {
    title: 'Opcao para quem ja tem base no numero atual',
    subtitle: 'Migrar o numero atual para o WhatsApp Business Platform.',
    points: [
      'Mantem continuidade no numero que os clientes ja conhecem.',
      'Exige planejamento para nao interromper atendimento durante a migracao.',
      'Ideal quando ha necessidade de preservar identidade comercial existente.',
    ],
  },
];

const prerequisites = [
  'Acesso administrativo ao Meta Business Manager da empresa.',
  'Numero apto para API oficial (sem vinculo simultaneo ao app WhatsApp comum).',
  'Responsavel interno para validar etapas durante a configuracao.',
  'Politicas de uso e modelo de atendimento definidos (comercial, suporte, pos-venda).',
];

const bestPractices = [
  'Evite depender de apenas uma pessoa para credenciais e configuracoes.',
  'Defina desde o inicio quem responde cada tipo de conversa.',
  'Configure mensagens e fluxo base antes de liberar para toda a equipe.',
  'Monitore os primeiros dias com foco em tempo de resposta e qualidade.',
];

export default function HowToIntegratePage() {
  return (
    <main className="h-dvh overflow-y-auto">
      <div className="mx-auto w-full max-w-[980px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="secondary">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Voltar para a home
            </Link>
          </Button>
          <Button asChild>
            <Link href="/#quero-ser-cliente">
              Quero ajuda para integrar
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <Card className="rounded-[28px] p-0">
          <CardContent className="space-y-3 p-5 sm:p-7">
            <p className="text-[11px] uppercase tracking-[0.18em] text-primary/85">Guia de onboarding comercial</p>
            <h1 className="font-heading text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-[0.98] tracking-tight">
              Como integrar um numero ao AutoZap
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Este guia foi feito para clientes sem perfil tecnico avancado. O objetivo e mostrar de forma clara o que voce precisa preparar e como o time AutoZap apoia cada etapa da integracao.
            </p>
          </CardContent>
        </Card>

        <section className="mt-6 space-y-3">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.title} className="rounded-[22px] p-0">
                <CardContent className="flex gap-3 p-4 sm:p-5">
                  <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary-soft text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="font-heading text-xl leading-tight">{step.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-2">
          {optionCards.map((option) => (
            <Card key={option.title} className="rounded-[22px] p-0">
              <CardContent className="space-y-3 p-4 sm:p-5">
                <h3 className="font-heading text-xl leading-tight">{option.title}</h3>
                <p className="text-sm text-muted-foreground">{option.subtitle}</p>
                <div className="space-y-2">
                  {option.points.map((point) => (
                    <div key={point} className="flex items-start gap-2 rounded-lg border border-border/70 bg-background-panel/45 px-3 py-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <p className="text-sm text-foreground/90">{point}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-2">
          <Card className="rounded-[22px] p-0">
            <CardContent className="space-y-3 p-4 sm:p-5">
              <h3 className="font-heading text-xl leading-tight">Pre-requisitos</h3>
              <div className="space-y-2">
                {prerequisites.map((item) => (
                  <div key={item} className="flex items-start gap-2 rounded-lg border border-border/70 bg-background-panel/45 px-3 py-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm text-foreground/90">{item}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[22px] p-0">
            <CardContent className="space-y-3 p-4 sm:p-5">
              <h3 className="font-heading text-xl leading-tight">Boas praticas</h3>
              <div className="space-y-2">
                {bestPractices.map((item) => (
                  <div key={item} className="flex items-start gap-2 rounded-lg border border-border/70 bg-background-panel/45 px-3 py-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm text-foreground/90">{item}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-6">
          <Card className="rounded-[22px] border-danger/25 p-0">
            <CardContent className="space-y-2 p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-danger" />
                <p className="text-sm font-semibold">Aviso importante</p>
              </div>
              <p className="text-sm text-muted-foreground">
                O AutoZap nao depende que voce seja tecnico para concluir a integracao. Nosso time orienta o processo para reduzir risco e evitar configuracoes incorretas de token, app e webhook.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
