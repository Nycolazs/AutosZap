import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock,
  Headset,
  Layers3,
  Lock,
  MessageCircleMore,
  MessageSquare,
  Rocket,
  Send,
  ShieldCheck,
  Smartphone,
  Star,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import { LeadInterestForm } from '@/components/marketing/lead-interest-form';
import { ScreenshotShowcase } from '@/components/marketing/screenshot-showcase';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'AutosZap — Plataforma Completa de Atendimento e CRM para WhatsApp',
  description:
    'Atendimento profissional pelo WhatsApp. Inbox multiatendente, CRM com pipeline, campanhas, automacoes e gestao de equipe — tudo em uma unica plataforma.',
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
    'Atendimento profissional pelo WhatsApp. Inbox multiatendente, CRM com pipeline, campanhas, automacoes e gestao de equipe — tudo em uma unica plataforma.',
  offers: { '@type': 'Offer', category: 'SaaS' },
  featureList: [
    'Inbox multiatendente com distribuicao de conversas',
    'CRM com pipeline para leads e oportunidades',
    'Campanhas e listas para operacao comercial',
    'Automacoes para reduzir retrabalho no atendimento',
    'Gestao de equipe e perfis de acesso',
    'Indicadores de desempenho para decisao rapida',
  ],
};

/* ── data ── */

const features = [
  {
    icon: MessageCircleMore,
    title: 'Inbox Multiatendente',
    description: 'Todas as conversas do WhatsApp em uma fila unica. Distribua entre atendentes, mantenha historico completo e nunca perca o contexto.',
  },
  {
    icon: Layers3,
    title: 'CRM com Pipeline',
    description: 'Acompanhe cada oportunidade do primeiro contato ao fechamento. Pipeline visual com etapas, tags e indicadores de conversao.',
  },
  {
    icon: Send,
    title: 'Campanhas em Massa',
    description: 'Envie mensagens segmentadas para listas de contatos. Templates aprovados, agendamento e metricas de entrega em tempo real.',
  },
  {
    icon: Bot,
    title: 'Automacoes Inteligentes',
    description: 'Crie fluxos automaticos para qualificar leads, responder perguntas frequentes e distribuir conversas por equipe ou horario.',
  },
  {
    icon: Users,
    title: 'Gestao de Equipe',
    description: 'Perfis de acesso, permissoes por funcao, monitoramento de produtividade e controle total sobre quem faz o que na operacao.',
  },
  {
    icon: BarChart3,
    title: 'Relatorios e Metricas',
    description: 'Dashboard com indicadores de SLA, tempo de resposta, volume de conversas e performance individual de cada atendente.',
  },
];

const benefits = [
  { icon: Zap, title: 'Respostas mais rapidas', description: 'Reduza o tempo medio de resposta com filas inteligentes e respostas rapidas pre-configuradas.' },
  { icon: Lock, title: 'API Oficial do WhatsApp', description: 'Conexao direta com a API oficial da Meta. Sem risco de bloqueio, com selo de verificacao.' },
  { icon: Smartphone, title: 'Acesso de qualquer lugar', description: 'Plataforma web responsiva que funciona no desktop, tablet e celular sem instalar nada.' },
  { icon: ShieldCheck, title: 'Dados seguros', description: 'Criptografia em transito e em repouso. Banco de dados isolado por empresa. LGPD compliant.' },
];

const steps = [
  { number: '01', title: 'Fale com nosso time', description: 'Preencha o formulario e nossa equipe entra em contato para entender sua operacao.' },
  { number: '02', title: 'Configuracao guiada', description: 'Integramos seu numero, configuramos equipes, funil e regras operacionais.' },
  { number: '03', title: 'Treinamento da equipe', description: 'Capacitamos seus atendentes e gestores para extrair o maximo da plataforma.' },
  { number: '04', title: 'Go-live com suporte', description: 'Acompanhamos os primeiros dias e fazemos ajustes para garantir resultado.' },
];

const stats = [
  { value: '99.9%', label: 'Uptime garantido' },
  { value: '<2s', label: 'Tempo de resposta' },
  { value: '24/7', label: 'Monitoramento ativo' },
  { value: '100%', label: 'API Oficial Meta' },
];

const faqs = [
  { q: 'Preciso ter conta no Meta Business?', a: 'Sim, e necessario ter uma conta verificada no Meta Business Manager. Nossa equipe te ajuda em todo o processo de configuracao.' },
  { q: 'Posso usar meu numero atual?', a: 'Sim, voce pode migrar seu numero atual para a API oficial. Tambem e possivel usar um numero novo dedicado a operacao.' },
  { q: 'Quantos atendentes posso ter?', a: 'Nao ha limite de atendentes. Voce escala conforme sua operacao cresce, com controle total de permissoes e acessos.' },
  { q: 'O AutosZap funciona com WhatsApp normal?', a: 'Nao. Utilizamos exclusivamente a API oficial do WhatsApp Business Platform da Meta, garantindo estabilidade e conformidade.' },
  { q: 'Quanto tempo leva para comecar?', a: 'O onboarding completo leva de 3 a 7 dias uteis, dependendo da complexidade da sua operacao e da validacao da conta Meta.' },
  { q: 'Meus dados ficam seguros?', a: 'Sim. Cada empresa tem banco de dados isolado, com criptografia AES-256 e infraestrutura em conformidade com a LGPD.' },
];

/* ── glass card helper ── */
const glass = 'rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl';
const glassHover = `${glass} transition-all duration-300 hover:border-blue-500/20 hover:bg-white/[0.06]`;

export default function HomePage() {
  return (
    <main className="relative min-h-dvh bg-[#060918] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── ambient gradients ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-[30%] -top-[20%] h-[700px] w-[700px] rounded-full bg-blue-600/[0.08] blur-[120px]" />
        <div className="absolute -right-[20%] top-[30%] h-[500px] w-[500px] rounded-full bg-cyan-500/[0.06] blur-[100px]" />
        <div className="absolute -left-[10%] top-[60%] h-[400px] w-[400px] rounded-full bg-blue-500/[0.05] blur-[100px]" />
      </div>

      {/* ════════════════ HEADER ════════════════ */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#060918]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/brand/autoszap-mark.png"
              alt="AutosZap"
              width={36}
              height={36}
              className="h-8 w-8 object-contain"
              priority
            />
            <span className="font-heading text-lg font-bold tracking-tight">AutosZap</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-white/60 md:flex">
            <a href="#funcionalidades" className="transition-colors hover:text-white">Funcionalidades</a>
            <a href="#como-funciona" className="transition-colors hover:text-white">Como funciona</a>
            <a href="#produto" className="transition-colors hover:text-white">Produto</a>
            <a href="#faq" className="transition-colors hover:text-white">FAQ</a>
          </nav>

          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden text-white/70 hover:text-white sm:inline-flex">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild className="bg-blue-600 text-white hover:bg-blue-700">
              <a href="#contato">
                Falar com vendas
                <ArrowRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </header>

      <div className="relative z-10">
        {/* ════════════════ HERO ════════════════ */}
        <section className="mx-auto max-w-7xl px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:pt-32">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-1.5 text-xs font-medium text-blue-400">
              <Rocket className="h-3.5 w-3.5" />
              Plataforma profissional para WhatsApp Business
            </div>

            <h1 className="font-heading text-[clamp(2.4rem,5.5vw,4.2rem)] font-bold leading-[1.05] tracking-tight">
              Atendimento, CRM e automacao{' '}
              <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">
                em uma unica plataforma
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/55 sm:text-lg">
              Gerencie conversas, distribua atendimento, opere seu CRM e prepare campanhas
              com a mesma sofisticacao visual de uma plataforma premium — tudo conectado
              a API oficial do WhatsApp.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="bg-blue-600 px-8 text-white hover:bg-blue-700">
                <a href="#contato">
                  Comecar agora
                  <ArrowRight className="ml-1 h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]">
                <a href="#produto">Ver a plataforma</a>
              </Button>
            </div>

            {/* stats bar */}
            <div className="mx-auto mt-14 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className={`${glass} px-4 py-3 text-center`}>
                  <p className="text-xl font-bold text-blue-400 sm:text-2xl">{stat.value}</p>
                  <p className="mt-0.5 text-[11px] text-white/45">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════ FUNCIONALIDADES ════════════════ */}
        <section id="funcionalidades" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Funcionalidades</p>
            <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Tudo que sua equipe precisa em um so lugar
            </h2>
            <p className="mt-3 text-sm text-white/50 sm:text-base">
              Modulos integrados que cobrem toda a jornada — do primeiro contato ao pos-venda.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feat) => {
              const Icon = feat.icon;
              return (
                <div key={feat.title} className={`${glassHover} p-6`}>
                  <div className="mb-4 inline-flex rounded-xl border border-blue-500/20 bg-blue-500/10 p-2.5 text-blue-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">{feat.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/50">{feat.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ════════════════ BENEFÍCIOS ════════════════ */}
        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Por que AutosZap</p>
            <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Vantagens que fazem diferenca na operacao
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className={`${glassHover} p-6 text-center`}>
                  <div className="mx-auto mb-4 inline-flex rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-blue-400">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/50">{item.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ════════════════ PRODUTO (showcase) ════════════════ */}
        <section id="produto" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Produto</p>
            <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Conhega os modulos da plataforma
            </h2>
            <p className="mt-3 text-sm text-white/50 sm:text-base">
              Explore cada area e veja como o AutosZap organiza sua operacao.
            </p>
          </div>

          <ScreenshotShowcase />
        </section>

        {/* ════════════════ COMO FUNCIONA ════════════════ */}
        <section id="como-funciona" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Como funciona</p>
            <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Do primeiro contato ao go-live em 4 passos
            </h2>
            <p className="mt-3 text-sm text-white/50 sm:text-base">
              Sem cadastro automatico. Cada implantacao e conduzida pelo nosso time.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div key={step.number} className={`${glass} relative p-6`}>
                <span className="text-4xl font-black text-blue-500/15">{step.number}</span>
                <h3 className="mt-2 text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/50">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════ FAQ ════════════════ */}
        <section id="faq" className="mx-auto max-w-4xl px-5 py-20 sm:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">FAQ</p>
            <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Perguntas frequentes
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {faqs.map((faq) => (
              <div key={faq.q} className={`${glass} p-5`}>
                <h3 className="text-sm font-semibold">{faq.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/50">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════ CTA + FORM ════════════════ */}
        <section id="contato" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <LeadInterestForm />

            <div className="space-y-6 lg:pt-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Proximo passo</p>
                <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                  Pronto para profissionalizar seu atendimento?
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-white/50 sm:text-base">
                  Preencha o formulario ao lado e nosso time comercial entra em contato
                  para entender sua operacao e definir o melhor plano de implantacao.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { icon: Headset, text: 'Onboarding com acompanhamento dedicado' },
                  { icon: Clock, text: 'Implantacao em ate 7 dias uteis' },
                  { icon: ShieldCheck, text: 'Dados isolados e criptografados por empresa' },
                  { icon: Star, text: 'Suporte prioritario durante os primeiros 30 dias' },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.text} className="flex items-center gap-3">
                      <div className="inline-flex rounded-lg border border-blue-500/20 bg-blue-500/10 p-2 text-blue-400">
                        <Icon className="h-4 w-4" />
                      </div>
                      <p className="text-sm text-white/70">{item.text}</p>
                    </div>
                  );
                })}
              </div>

              <div className={`${glass} p-4`}>
                <p className="text-xs text-white/40">
                  A liberacao de acesso acontece apos validacao comercial e tecnica.
                  Nosso time alinha cenario, objetivos e conduz a integracao completa.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════ FOOTER ════════════════ */}
        <footer className="border-t border-white/[0.06] bg-[#050816]">
          <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {/* brand */}
              <div className="space-y-4">
                <Link href="/" className="flex items-center gap-2.5">
                  <Image
                    src="/brand/autoszap-mark.png"
                    alt="AutosZap"
                    width={32}
                    height={32}
                    className="h-7 w-7 object-contain"
                  />
                  <span className="font-heading text-lg font-bold tracking-tight">AutosZap</span>
                </Link>
                <p className="text-sm leading-relaxed text-white/40">
                  Plataforma profissional de atendimento, CRM e automacao para WhatsApp Business Platform.
                </p>
              </div>

              {/* produto */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-white/30">Produto</p>
                <ul className="space-y-2 text-sm text-white/50">
                  <li><a href="#funcionalidades" className="transition-colors hover:text-white">Funcionalidades</a></li>
                  <li><a href="#produto" className="transition-colors hover:text-white">Modulos</a></li>
                  <li><a href="#como-funciona" className="transition-colors hover:text-white">Como funciona</a></li>
                  <li><a href="#faq" className="transition-colors hover:text-white">FAQ</a></li>
                </ul>
              </div>

              {/* empresa */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-white/30">Empresa</p>
                <ul className="space-y-2 text-sm text-white/50">
                  <li><Link href="/como-integrar" className="transition-colors hover:text-white">Guia de integracao</Link></li>
                  <li><a href="#contato" className="transition-colors hover:text-white">Falar com vendas</a></li>
                  <li><Link href="/login" className="transition-colors hover:text-white">Acessar plataforma</Link></li>
                </ul>
              </div>

              {/* contato */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-white/30">Contato</p>
                <ul className="space-y-2 text-sm text-white/50">
                  <li className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-blue-400" />
                    <a href="#contato" className="transition-colors hover:text-white">Formulario de contato</a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/[0.06] pt-6 text-xs text-white/30 sm:flex-row">
              <p>&copy; {new Date().getFullYear()} AutosZap. Todos os direitos reservados.</p>
              <p>Construido com a API oficial do WhatsApp Business Platform da Meta.</p>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
