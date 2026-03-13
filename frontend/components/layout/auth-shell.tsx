import Image from 'next/image';
import Link from 'next/link';
import { BriefcaseBusiness, MessageSquareText, Workflow } from 'lucide-react';

const bullets = [
  { icon: MessageSquareText, text: 'Inbox multiatendente com histórico unificado' },
  { icon: BriefcaseBusiness, text: 'CRM com pipeline, listas, tags e campanhas' },
  { icon: Workflow, text: 'Camada pronta para automação e integração oficial com a Meta' },
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
    <div className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_14%,rgba(50,151,255,0.24),transparent_28%),radial-gradient(circle_at_84%_82%,rgba(25,183,215,0.2),transparent_20%)]" />
      <div className="absolute inset-y-0 left-0 hidden w-[42vw] bg-[linear-gradient(180deg,rgba(7,27,52,0.58),rgba(3,15,29,0))] lg:block" />
      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1360px] items-stretch lg:items-center">
        <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)] lg:items-center lg:gap-10 xl:grid-cols-[minmax(0,760px)_minmax(400px,440px)] xl:gap-14">
        <section className="order-2 flex max-w-[720px] flex-col justify-center px-1 sm:px-2 lg:order-1 lg:px-4">
          <Link href="/login" className="mb-5 flex w-fit items-center gap-3 sm:mb-7 sm:gap-4 lg:mb-10">
            <Image
              src="/brand/autoszap-mark.png"
              alt="AutosZap"
              width={84}
              height={84}
              className="h-12 w-12 shrink-0 object-contain sm:h-14 sm:w-14 lg:h-20 lg:w-20"
              priority
            />
            <div>
              <p className="font-heading text-[24px] font-semibold tracking-tight text-foreground sm:text-[28px] lg:text-[36px]">AutosZap</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:text-[11px] sm:tracking-[0.22em]">Atendimento & CRM</p>
            </div>
          </Link>

          <div className="mb-4 inline-flex w-fit rounded-full border border-primary/25 bg-primary-soft px-3 py-1 text-[11px] font-semibold text-primary sm:mb-5 sm:px-3.5 sm:py-1.5 sm:text-xs">
            {eyebrow}
          </div>
          <h1 className="max-w-[680px] font-heading text-[2.2rem] font-semibold leading-[0.98] tracking-tight text-foreground sm:text-4xl md:text-[3.25rem]">
            {title} <span className="text-primary">{accent}</span>
          </h1>
          <p className="mt-4 max-w-[560px] text-[15px] leading-7 text-muted-foreground sm:mt-5 sm:text-base sm:leading-8 lg:text-lg">
            {description}
          </p>

          <div className="mt-6 max-w-[620px] space-y-2.5 sm:mt-8 sm:space-y-3.5">
            {bullets.map((bullet, index) => {
              const Icon = bullet.icon;
              return (
                <div
                  key={bullet.text}
                  className={`items-center gap-3 sm:gap-3.5 ${index > 1 ? 'hidden sm:flex' : 'flex'}`}
                >
                  <div className="rounded-2xl border border-primary/15 bg-primary-soft p-2 text-primary sm:p-2.5">
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </div>
                  <p className="text-sm text-foreground/88 sm:text-base">{bullet.text}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap gap-2.5 lg:hidden">
            <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs text-foreground/80">
              Inbox centralizada
            </div>
            <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs text-foreground/80">
              CRM + campanhas
            </div>
          </div>

          <div className="glass-panel mt-10 hidden max-w-[520px] rounded-[26px] border-white/6 p-5 lg:block">
            <p className="text-lg italic text-foreground/82">
              &ldquo;Centralizamos atendimento, pipeline comercial e disparos sem perder a qualidade operacional.&rdquo;
            </p>
            <div className="mt-5 flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-base font-semibold text-primary">
                AS
              </div>
              <div>
                <p className="font-medium">Equipe AutosZap</p>
                <p className="text-xs text-muted-foreground">Setup local completo com backend real para desenvolvimento</p>
              </div>
            </div>
          </div>
        </section>

        <section className="order-1 flex justify-center lg:order-2 lg:justify-end lg:pl-4">{children}</section>
        </div>
      </div>
    </div>
  );
}
