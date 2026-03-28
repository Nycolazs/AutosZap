import Image from 'next/image';
import Link from 'next/link';
import { BriefcaseBusiness, MessageSquareText, Workflow } from 'lucide-react';

const bullets = [
  { icon: MessageSquareText, text: 'Inbox multiatendente com histórico unificado' },
  { icon: BriefcaseBusiness, text: 'CRM com pipeline, listas, tags e campanhas' },
  { icon: Workflow, text: 'Camada pronta para automação e integração com a Meta' },
];

export function AuthShell({
  eyebrow,
  title,
  accent,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      {/* ── Left panel: occupies its own sticky viewport height, independent of right column ── */}
      <div className="desktop-low-height-auth-aside auth-left-panel sticky top-0 hidden h-dvh w-[41%] shrink-0 flex-col justify-center overflow-y-auto overflow-x-hidden px-4 py-5 xl:w-[43%] xl:px-5 2xl:w-[46%] 2xl:px-8 2xl:py-7 lg:flex">
        {/* Background layers */}
        <div className="auth-left-gradient-accent pointer-events-none absolute inset-0" />
        <div className="auth-left-gradient-overlay pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-border" />

        {/* Content */}
        <div className="desktop-low-height-auth-aside-inner relative z-10 mx-auto w-full max-w-[390px] 2xl:max-w-[410px]">
          <Link href="/login" className="desktop-low-height-auth-brand mb-4 flex w-fit items-center gap-2.5">
            <Image
              src="/brand/autoszap-mark.png"
              alt="AutosZap"
              width={48}
              height={48}
              className="brand-logo-shadow h-9 w-9 shrink-0 object-contain"
              priority
            />
            <div>
              <p className="font-heading text-[20px] font-semibold tracking-tight text-foreground">AutosZap</p>
              <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Atendimento & CRM</p>
            </div>
          </Link>

          <div className="mb-2.5 inline-flex rounded-full border border-primary/25 bg-primary-soft px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-primary">
            {eyebrow}
          </div>

          <h1 className="font-heading text-[clamp(1.55rem,1.8vw,2.1rem)] font-semibold leading-[1] tracking-tight text-foreground">
            {title}{' '}<span className="text-primary">{accent}</span>
          </h1>

          <p className="desktop-low-height-auth-copy mt-2.5 text-[12px] leading-[1.58] text-muted-foreground">
            {description}
          </p>

          <div className="desktop-low-height-auth-bullets mt-4 flex flex-col gap-2">
            {bullets.map((bullet) => {
              const Icon = bullet.icon;
              return (
                <div key={bullet.text} className="flex items-center gap-2.5">
                  <div className="shrink-0 rounded-lg bg-[linear-gradient(135deg,rgba(50,151,255,0.24),rgba(50,151,255,0.1))] p-1.5 text-primary shadow-[0_4px_12px_rgba(50,151,255,0.2)] ring-1 ring-primary/25">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-[12px] font-medium leading-[1.45] text-foreground/85">{bullet.text}</p>
                </div>
              );
            })}
          </div>

          <div className="desktop-low-height-auth-highlight glass-panel mt-5 rounded-xl border-border p-3.5 shadow-[0_10px_28px_rgba(2,10,22,0.1)]">
            <p className="text-[11px] italic leading-[1.55] text-foreground/75">
              &ldquo;Centralizamos atendimento, pipeline comercial e disparos sem perder a qualidade operacional.&rdquo;
            </p>
            <div className="mt-2.5 flex items-center gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(50,151,255,0.25),rgba(50,151,255,0.10))] text-[9px] font-bold text-primary ring-1 ring-primary/25">
                AS
              </div>
              <div>
                <p className="text-[11px] font-semibold">Equipe AutosZap</p>
                <p className="text-[9px] text-muted-foreground">Simplicidade, agilidade e eficiência para o seu negócio</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel: always full-height, centers content independently ── */}
      <div className="desktop-low-height-auth-main flex min-h-dvh flex-1 flex-col items-center justify-start overflow-y-auto px-4 pb-5 pt-4 sm:px-5 sm:pb-6 sm:pt-5 lg:justify-center lg:px-6 lg:py-5 2xl:px-9">
        {/* Mobile logo — visible only below lg */}
        <div className="mb-3.5 flex w-full max-w-[430px] items-center gap-2.5 lg:hidden">
          <Image
            src="/brand/autoszap-mark.png"
            alt="AutosZap"
            width={32}
            height={32}
            className="brand-logo-shadow h-8 w-8 object-contain"
            priority
          />
          <div>
            <p className="font-heading text-[15px] font-semibold leading-none">AutosZap</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Atendimento & CRM</p>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
