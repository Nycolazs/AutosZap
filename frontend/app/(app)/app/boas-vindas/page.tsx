import Link from 'next/link';
import {
  ArrowRight,
  LifeBuoy,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const welcomeHighlights = [
  {
    icon: MessageSquareText,
    title: 'Sua conta ja esta conectada',
    description:
      'Voce entrou na empresa com o convite certo e pode começar a operar sem precisar configurar tudo do zero.',
  },
  {
    icon: ShieldCheck,
    title: 'Seu acesso respeita o seu papel',
    description:
      'As telas e permissoes liberadas dependem do papel definido pelo administrador da empresa.',
  },
  {
    icon: Sparkles,
    title: 'O proximo passo e simples',
    description:
      'Abra o inbox para ver a operacao ou fale com o time interno caso precise de ajuda para começar.',
  },
] as const;

export default function WelcomePage() {
  return (
    <div className="space-y-5 2xl:space-y-6">
      <PageHeader
        title="Boas-vindas ao AutosZap"
        description="Seu acesso foi ativado com sucesso. Agora voce ja pode entrar na operacao da empresa e conversar com o time."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/app/inbox">
                Abrir inbox
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/app/suporte">Preciso de ajuda</Link>
            </Button>
          </div>
        }
      />

      <Card className="overflow-hidden border-primary/20 bg-[radial-gradient(circle_at_top_left,rgba(50,151,255,0.18),transparent_45%),rgba(9,18,34,0.92)]">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)] sm:p-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Primeiro acesso
            </div>
            <div className="space-y-2">
              <h2 className="font-heading text-[24px] font-semibold tracking-tight text-foreground sm:text-[28px]">
                Tudo pronto para voce entrar na rotina da equipe
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                Esse acesso veio por um codigo de convite. Por isso, a empresa,
                o papel e as permissoes ja foram associados automaticamente a
                sua conta.
              </p>
            </div>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-black/10 p-4 sm:p-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary/85">
              Proximo passo
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Entre no inbox para ver as conversas disponiveis ou abra o suporte
              se precisar de orientacao inicial.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button asChild className="justify-between">
                <Link href="/app/inbox">
                  Ir para o inbox
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary" className="justify-between">
                <Link href="/app/suporte">
                  Falar com suporte
                  <LifeBuoy className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {welcomeHighlights.map((item) => {
          const Icon = item.icon;

          return (
            <Card
              key={item.title}
              className="h-full border-border/70 bg-background-panel/55"
            >
              <CardHeader className="gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-[18px]">{item.title}</CardTitle>
                  <CardDescription className="mt-1 text-sm leading-6">
                    {item.description}
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
