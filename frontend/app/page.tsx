import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Clock,
  Headset,
  Layers3,
  Lock,
  Menu,
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
import { MobileNav } from '@/components/marketing/mobile-nav';

export const metadata: Metadata = {
  title: 'AutosZap — Plataforma Completa de Atendimento e CRM para WhatsApp',
  description:
    'Atendimento profissional pelo WhatsApp. Inbox multiatendente, CRM com pipeline, campanhas, automações e gestão de equipe — tudo em uma única plataforma.',
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
    'Atendimento profissional pelo WhatsApp. Inbox multiatendente, CRM com pipeline, campanhas, automações e gestão de equipe — tudo em uma única plataforma.',
  offers: { '@type': 'Offer', category: 'SaaS' },
  featureList: [
    'Inbox multiatendente com distribuição de conversas',
    'CRM com pipeline para leads e oportunidades',
    'Campanhas e listas para operação comercial',
    'Automações para reduzir retrabalho no atendimento',
    'Gestão de equipe e perfis de acesso',
    'Indicadores de desempenho para decisão rápida',
  ],
};

/* ── data ── */

const features = [
  {
    icon: MessageCircleMore,
    title: 'Inbox Multiatendente',
    description: 'Todas as conversas em uma fila única. Distribua entre atendentes e mantenha histórico completo.',
  },
  {
    icon: Layers3,
    title: 'CRM com Pipeline',
    description: 'Pipeline visual para acompanhar cada oportunidade do primeiro contato ao fechamento.',
  },
  {
    icon: Send,
    title: 'Campanhas em Massa',
    description: 'Mensagens segmentadas com templates aprovados, agendamento e métricas de entrega.',
  },
  {
    icon: Bot,
    title: 'Automações Inteligentes',
    description: 'Fluxos automáticos para qualificar leads e distribuir conversas por equipe ou horário.',
  },
  {
    icon: Users,
    title: 'Gestão de Equipe',
    description: 'Perfis de acesso, permissões por função e monitoramento de produtividade.',
  },
  {
    icon: BarChart3,
    title: 'Relatórios e Métricas',
    description: 'Dashboard com SLA, tempo de resposta e performance individual de cada atendente.',
  },
];

const benefits = [
  { icon: Zap, title: 'Respostas rápidas', description: 'Filas inteligentes e respostas pré-configuradas.' },
  { icon: Lock, title: 'API Oficial Meta', description: 'Sem risco de bloqueio, com selo verificado.' },
  { icon: Smartphone, title: 'Qualquer dispositivo', description: 'Web responsivo, sem instalar nada.' },
  { icon: ShieldCheck, title: 'Dados seguros', description: 'Criptografia e banco isolado. LGPD.' },
];

const steps = [
  { number: '01', title: 'Cadastre sua empresa', description: 'Crie uma conta em segundos — basta nome, e-mail e dados da empresa. Teste grátis por 7 dias sem cartão.' },
  { number: '02', title: 'Configure o WhatsApp', description: 'Conecte sua conta da API oficial da Meta. Insira o token e o número — a plataforma faz o resto.' },
  { number: '03', title: 'Monte sua equipe', description: 'Gere códigos de convite para cada membro. Eles criam a própria conta, já vinculada à sua empresa.' },
  { number: '04', title: 'Atenda e venda', description: 'Use o inbox, CRM, campanhas e automações para escalar seu atendimento pelo WhatsApp.' },
];


const faqs = [
  { q: 'O teste gratuito tem alguma limitação?', a: 'Não. Você tem acesso a todos os módulos por 7 dias, sem cartão de crédito e sem compromisso. É o mesmo plano dos clientes pagantes.' },
  { q: 'Como adiciono minha equipe?', a: 'Na área de equipe, gere um código de convite para cada membro. Eles se cadastram sozinhos e já entram vinculados à sua empresa com o papel correto.' },
  { q: 'Preciso de conta no Meta Business?', a: 'Sim. Para usar a API oficial do WhatsApp, é necessário ter uma conta verificada no Meta Business. Temos um guia passo a passo na plataforma.' },
  { q: 'Posso usar meu número atual do WhatsApp?', a: 'Sim, é possível migrar seu número para a API oficial. Também é possível usar um número novo, dedicado ao atendimento profissional.' },
  { q: 'Quantos atendentes posso ter?', a: 'Sem limite. Adicione quantos atendentes precisar, com controle total de permissões e papéis por usuário.' },
  { q: 'Meus dados e os dos clientes ficam seguros?', a: 'Sim. Cada empresa tem banco de dados isolado, tokens criptografados com AES-256 e conformidade com a LGPD.' },
];

/* ── glass helpers ── */
const glass = 'rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl';
const glassHover = `${glass} transition-all duration-300 hover:border-blue-500/20 hover:bg-white/[0.06]`;

const navLinks = [
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#produto', label: 'Produto' },
  { href: '#faq', label: 'FAQ' },
];

export default function HomePage() {
  return (
    <main className="relative min-h-dvh overflow-x-hidden scroll-smooth bg-[#060918] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── ambient gradients ── */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-[30%] -top-[20%] h-[500px] w-[500px] rounded-full bg-blue-600/[0.08] blur-[120px] sm:h-[700px] sm:w-[700px]" />
        <div className="absolute -right-[20%] top-[30%] h-[350px] w-[350px] rounded-full bg-cyan-500/[0.06] blur-[100px] sm:h-[500px] sm:w-[500px]" />
        <div className="absolute -left-[10%] top-[60%] h-[300px] w-[300px] rounded-full bg-blue-500/[0.05] blur-[100px] sm:h-[400px] sm:w-[400px]" />
      </div>

      {/* ════════════════ HEADER ════════════════ */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#060918]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-8 sm:py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/brand/autoszap-mark.png"
              alt="AutosZap"
              width={36}
              height={36}
              className="h-7 w-7 object-contain sm:h-8 sm:w-8"
              priority
            />
            <span className="font-heading text-base font-bold tracking-tight sm:text-lg">AutosZap</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-white/60 md:flex">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="transition-colors hover:text-white">
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden text-sm text-white/70 hover:text-white sm:inline-flex">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild className="hidden bg-blue-600 text-sm text-white hover:bg-blue-700 sm:inline-flex">
              <Link href="/register">
                Começar grátis
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
            {/* mobile nav */}
            <MobileNav links={navLinks} />
          </div>
        </div>
      </header>

      <div className="relative z-10">
        {/* ════════════════ HERO ════════════════ */}
        <section className="mx-auto max-w-7xl px-4 pb-14 pt-10 sm:px-8 sm:pb-20 sm:pt-24 lg:pt-32">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] font-medium text-blue-400 sm:gap-2 sm:px-4 sm:py-1.5 sm:text-xs">
              <Rocket className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Plataforma para WhatsApp Business
            </div>

            <h1 className="font-heading text-[2rem] font-bold leading-[1.1] tracking-tight sm:text-[clamp(2.4rem,5.5vw,4.2rem)] sm:leading-[1.05]">
              Atendimento, CRM e automação{' '}
              <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">
                em uma única plataforma
              </span>
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/55 sm:mt-6 sm:text-lg">
              Gerencie conversas, distribua atendimento, opere seu CRM e prepare campanhas
              — tudo conectado à API oficial do WhatsApp.
            </p>

            <div className="mt-6 flex flex-col items-center gap-2.5 sm:mt-8 sm:flex-row sm:justify-center sm:gap-3">
              <Button asChild size="lg" className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto sm:px-8">
                <Link href="/register">
                  Começar grátis
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="w-full border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08] sm:w-auto">
                <a href="#produto">Ver a plataforma</a>
              </Button>
            </div>

            {/* trust badges */}
            <div className="mx-auto mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-white/35 sm:mt-12 sm:gap-x-8 sm:text-xs">
              <span className="flex items-center gap-1.5"><Lock className="h-3 w-3 text-blue-400/60" /> API Oficial Meta</span>
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-blue-400/60" /> Dados criptografados</span>
              <span className="flex items-center gap-1.5"><Users className="h-3 w-3 text-blue-400/60" /> Sem limite de atendentes</span>
            </div>
          </div>
        </section>

        {/* ════════════════ FUNCIONALIDADES ════════════════ */}
        <section id="funcionalidades" className="scroll-mt-16 mx-auto max-w-7xl px-4 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-400 sm:text-xs">Funcionalidades</p>
            <h2 className="mt-2 font-heading text-2xl font-bold tracking-tight sm:mt-3 sm:text-4xl">
              Tudo que sua equipe precisa
            </h2>
            <p className="mt-2 text-sm text-white/50 sm:mt-3 sm:text-base">
              Módulos integrados do primeiro contato ao pós-venda.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {features.map((feat) => {
              const Icon = feat.icon;
              return (
                <div key={feat.title} className={`${glassHover} p-5 sm:p-6`}>
                  <div className="mb-3 inline-flex rounded-xl border border-blue-500/20 bg-blue-500/10 p-2 text-blue-400 sm:mb-4 sm:p-2.5">
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <h3 className="text-base font-semibold sm:text-lg">{feat.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-white/50 sm:mt-2 sm:text-sm">{feat.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ════════════════ BENEFÍCIOS ════════════════ */}
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-400 sm:text-xs">Por que AutosZap</p>
            <h2 className="mt-2 font-heading text-2xl font-bold tracking-tight sm:mt-3 sm:text-4xl">
              Vantagens que fazem diferença
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {benefits.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className={`${glassHover} p-4 text-center sm:p-6`}>
                  <div className="mx-auto mb-3 inline-flex rounded-xl border border-blue-500/20 bg-blue-500/10 p-2 text-blue-400 sm:mb-4 sm:p-3">
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  </div>
                  <h3 className="text-[13px] font-semibold sm:text-base">{item.title}</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/50 sm:mt-2 sm:text-sm">{item.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ════════════════ PRODUTO (showcase) ════════════════ */}
        <section id="produto" className="scroll-mt-16 mx-auto max-w-7xl px-4 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-400 sm:text-xs">Produto</p>
            <h2 className="mt-2 font-heading text-2xl font-bold tracking-tight sm:mt-3 sm:text-4xl">
              Conheça os módulos
            </h2>
            <p className="mt-2 text-sm text-white/50 sm:mt-3 sm:text-base">
              Explore cada área e veja como o AutosZap organiza sua operação.
            </p>
          </div>

          <ScreenshotShowcase />
        </section>

        {/* ════════════════ COMO FUNCIONA ════════════════ */}
        <section id="como-funciona" className="scroll-mt-16 mx-auto max-w-7xl px-4 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-400 sm:text-xs">Como funciona</p>
            <h2 className="mt-2 font-heading text-2xl font-bold tracking-tight sm:mt-3 sm:text-4xl">
              4 passos para começar
            </h2>
            <p className="mt-2 text-sm text-white/50 sm:mt-3 sm:text-base">
              Comece a usar em poucos minutos, sem complicação.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {steps.map((step) => (
              <div key={step.number} className={`${glass} relative p-4 sm:p-6`}>
                <span className="text-2xl font-black text-blue-500/15 sm:text-4xl">{step.number}</span>
                <h3 className="mt-1 text-[13px] font-semibold sm:mt-2 sm:text-base">{step.title}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-white/50 sm:mt-2 sm:text-sm">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════ FAQ ════════════════ */}
        <section id="faq" className="scroll-mt-16 mx-auto max-w-4xl px-4 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-400 sm:text-xs">FAQ</p>
            <h2 className="mt-2 font-heading text-2xl font-bold tracking-tight sm:mt-3 sm:text-4xl">
              Perguntas frequentes
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {faqs.map((faq) => (
              <div key={faq.q} className={`${glass} p-4 sm:p-5`}>
                <h3 className="text-[13px] font-semibold sm:text-sm">{faq.q}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-white/50 sm:mt-2 sm:text-sm">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════ CTA + FORM ════════════════ */}
        <section id="contato" className="scroll-mt-16 mx-auto max-w-7xl px-4 py-14 sm:px-8 sm:py-20">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <LeadInterestForm />

            <div className="space-y-5 sm:space-y-6 lg:pt-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-400 sm:text-xs">Próximo passo</p>
                <h2 className="mt-2 font-heading text-2xl font-bold tracking-tight sm:mt-3 sm:text-4xl">
                  Pronto para profissionalizar seu atendimento?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-white/50 sm:mt-3 sm:text-base">
                  Preencha o formulário e nosso time comercial entra em contato.
                </p>
              </div>

              <div className="space-y-2.5 sm:space-y-3">
                {[
                  { icon: Headset, text: 'Onboarding com acompanhamento dedicado' },
                  { icon: Clock, text: 'Implantação em até 7 dias úteis' },
                  { icon: ShieldCheck, text: 'Dados isolados e criptografados' },
                  { icon: Star, text: 'Suporte prioritário nos primeiros 30 dias' },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.text} className="flex items-center gap-2.5 sm:gap-3">
                      <div className="inline-flex shrink-0 rounded-lg border border-blue-500/20 bg-blue-500/10 p-1.5 text-blue-400 sm:p-2">
                        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                      <p className="text-[13px] text-white/70 sm:text-sm">{item.text}</p>
                    </div>
                  );
                })}
              </div>

              <div className={`${glass} p-3 sm:p-4`}>
                <p className="text-[11px] text-white/40 sm:text-xs">
                  A liberação de acesso acontece após validação comercial e técnica.
                  Nosso time alinha cenário, objetivos e conduz a integração completa.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════ FOOTER ════════════════ */}
        <footer className="border-t border-white/[0.06] bg-[#050816]">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-12">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {/* brand */}
              <div className="space-y-3 sm:space-y-4">
                <Link href="/" className="flex items-center gap-2">
                  <Image
                    src="/brand/autoszap-mark.png"
                    alt="AutosZap"
                    width={28}
                    height={28}
                    className="h-6 w-6 object-contain sm:h-7 sm:w-7"
                  />
                  <span className="font-heading text-base font-bold tracking-tight sm:text-lg">AutosZap</span>
                </Link>
                <p className="text-[13px] leading-relaxed text-white/40 sm:text-sm">
                  Plataforma profissional de atendimento, CRM e automação para WhatsApp Business.
                </p>
              </div>

              {/* produto */}
              <div>
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30 sm:mb-3 sm:text-xs">Produto</p>
                <ul className="space-y-1.5 text-[13px] text-white/50 sm:space-y-2 sm:text-sm">
                  <li><a href="#funcionalidades" className="transition-colors hover:text-white">Funcionalidades</a></li>
                  <li><a href="#produto" className="transition-colors hover:text-white">Módulos</a></li>
                  <li><a href="#como-funciona" className="transition-colors hover:text-white">Como funciona</a></li>
                  <li><a href="#faq" className="transition-colors hover:text-white">FAQ</a></li>
                </ul>
              </div>

              {/* empresa */}
              <div>
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30 sm:mb-3 sm:text-xs">Empresa</p>
                <ul className="space-y-1.5 text-[13px] text-white/50 sm:space-y-2 sm:text-sm">
                  <li><Link href="/como-integrar" className="transition-colors hover:text-white">Guia de integração</Link></li>
                  <li><a href="#contato" className="transition-colors hover:text-white">Falar com vendas</a></li>
                  <li><Link href="/login" className="transition-colors hover:text-white">Acessar plataforma</Link></li>
                </ul>
              </div>

              {/* contato */}
              <div>
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30 sm:mb-3 sm:text-xs">Contato</p>
                <ul className="space-y-1.5 text-[13px] text-white/50 sm:space-y-2 sm:text-sm">
                  <li className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-blue-400" />
                    <a href="#contato" className="transition-colors hover:text-white">Formulário de contato</a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-white/[0.06] pt-5 text-[11px] text-white/30 sm:mt-10 sm:flex-row sm:pt-6 sm:text-xs">
              <p>&copy; {new Date().getFullYear()} AutosZap. Todos os direitos reservados.</p>
              <p>API oficial do WhatsApp Business Platform da Meta.</p>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
