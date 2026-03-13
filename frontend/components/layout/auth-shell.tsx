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
    <div className="relative min-h-screen overflow-hidden px-5 py-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(50,151,255,0.2),transparent_30%),radial-gradient(circle_at_85%_80%,rgba(25,183,215,0.18),transparent_20%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[1560px] items-center">
        <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-center lg:gap-16 xl:grid-cols-[minmax(0,880px)_460px] xl:justify-between xl:gap-24">
        <section className="flex max-w-[760px] flex-col justify-center px-2 lg:px-4">
          <Link href="/login" className="mb-10 flex w-fit items-center gap-4">
            <Image
              src="/brand/autoszap-mark.png"
              alt="AutosZap"
              width={84}
              height={84}
              className="h-16 w-16 shrink-0 object-contain lg:h-20 lg:w-20"
              priority
            />
            <div>
              <p className="font-heading text-[30px] font-semibold tracking-tight text-foreground lg:text-[36px]">AutosZap</p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Atendimento & CRM</p>
            </div>
          </Link>

          <div className="mb-5 inline-flex w-fit rounded-full border border-primary/25 bg-primary-soft px-3.5 py-1.5 text-xs font-semibold text-primary">
            {eyebrow}
          </div>
          <h1 className="max-w-[680px] font-heading text-4xl font-semibold leading-[1.02] tracking-tight text-foreground md:text-5xl">
            {title} <span className="text-primary">{accent}</span>
          </h1>
          <p className="mt-5 max-w-[600px] text-lg leading-8 text-muted-foreground">{description}</p>

          <div className="mt-8 max-w-[620px] space-y-3.5">
            {bullets.map((bullet) => {
              const Icon = bullet.icon;
              return (
                <div key={bullet.text} className="flex items-center gap-3.5">
                  <div className="rounded-2xl border border-primary/15 bg-primary-soft p-2.5 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-base text-foreground/88">{bullet.text}</p>
                </div>
              );
            })}
          </div>

          <div className="glass-panel mt-10 max-w-[520px] rounded-[26px] border-white/6 p-5">
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

        <section className="flex justify-center lg:justify-end">{children}</section>
        </div>
      </div>
    </div>
  );
}
