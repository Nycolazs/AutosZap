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
      <div className="desktop-low-height-auth-aside sticky top-0 hidden h-dvh w-[48%] shrink-0 flex-col justify-center overflow-y-auto overflow-x-hidden px-6 py-7 xl:w-[50%] xl:px-7 2xl:w-[55%] 2xl:px-12 2xl:py-9 lg:flex">
        {/* Background layers */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_24%,rgba(56,148,255,0.28),transparent_38%),radial-gradient(circle_at_78%_78%,rgba(20,160,195,0.20),transparent_30%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,rgba(4,17,36,0.88)_0%,rgba(3,12,24,0.70)_50%,rgba(2,10,20,0.90)_100%)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/[0.06]" />

        {/* Content */}
        <div className="desktop-low-height-auth-aside-inner relative z-10 mx-auto w-full max-w-[460px]">
          <Link href="/login" className="desktop-low-height-auth-brand mb-5 flex w-fit items-center gap-3">
            <Image
              src="/brand/autoszap-mark.png"
              alt="AutosZap"
              width={48}
              height={48}
              className="h-10 w-10 shrink-0 object-contain"
              priority
            />
            <div>
              <p className="font-heading text-[22px] font-semibold tracking-tight text-foreground">AutosZap</p>
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Atendimento & CRM</p>
            </div>
          </Link>

          <div className="mb-3 inline-flex rounded-full border border-primary/25 bg-primary-soft px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
            {eyebrow}
          </div>

          <h1 className="font-heading text-[clamp(1.95rem,2.3vw,2.5rem)] font-semibold leading-[0.95] tracking-tight text-foreground">
            {title}{' '}<span className="text-primary">{accent}</span>
          </h1>

          <p className="desktop-low-height-auth-copy mt-3 text-[13px] leading-[1.65] text-muted-foreground">
            {description}
          </p>

          <div className="desktop-low-height-auth-bullets mt-5 flex flex-col gap-2.5">
            {bullets.map((bullet) => {
              const Icon = bullet.icon;
              return (
                <div key={bullet.text} className="flex items-center gap-3">
                  <div className="shrink-0 rounded-xl bg-[linear-gradient(135deg,rgba(50,151,255,0.24),rgba(50,151,255,0.1))] p-2 text-primary shadow-[0_4px_12px_rgba(50,151,255,0.2)] ring-1 ring-primary/25">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-[13px] font-medium text-foreground/85">{bullet.text}</p>
                </div>
              );
            })}
          </div>

          <div className="desktop-low-height-auth-highlight glass-panel mt-6 rounded-xl border-white/8 p-4 shadow-[0_10px_28px_rgba(2,10,22,0.26)]">
            <p className="text-[12px] italic leading-[1.6] text-foreground/75">
              &ldquo;Centralizamos atendimento, pipeline comercial e disparos sem perder a qualidade operacional.&rdquo;
            </p>
            <div className="mt-3 flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(50,151,255,0.25),rgba(50,151,255,0.10))] text-[10px] font-bold text-primary ring-1 ring-primary/25">
                AS
              </div>
              <div>
                <p className="text-[12px] font-semibold">Equipe AutosZap</p>
                <p className="text-[10px] text-muted-foreground">Simplicidade, agilidade e eficiência para o seu negócio</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel: always full-height, centers content independently ── */}
      <div className="desktop-low-height-auth-main flex min-h-dvh flex-1 flex-col items-center justify-start overflow-y-auto px-4 pb-5 pt-5 sm:px-6 sm:pt-7 lg:justify-center lg:px-6 lg:pt-4 2xl:px-8">
        {/* Mobile logo — visible only below lg */}
        <div className="mb-4 flex w-full max-w-[420px] items-center gap-2.5 lg:hidden">
          <Image
            src="/brand/autoszap-mark.png"
            alt="AutosZap"
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
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
