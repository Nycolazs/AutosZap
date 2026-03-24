'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AuthPageSwitch } from '@/components/auth/auth-page-switch';
import { AuthShell } from '@/components/layout/auth-shell';
import { SocialLoginButtons } from '@/components/auth/social-login-buttons';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resolvePostAuthRedirect } from '@/lib/auth-redirect';
import { cn } from '@/lib/utils';

/* ── Segments ── */

const SEGMENTS = [
  'Automotivo',
  'Imobiliario',
  'Varejo',
  'Saude e Estetica',
  'Educacao',
  'Servicos Financeiros',
  'Tecnologia',
  'Alimentacao e Restaurantes',
  'Juridico',
  'Marketing e Publicidade',
  'E-commerce',
  'Turismo e Hotelaria',
  'Servicos Gerais',
  'Outro',
] as const;

/* ── Schemas ── */

const createCompanySchema = z
  .object({
    name: z.string().trim().min(2, 'Informe seu nome.'),
    email: z.string().email('Informe um email valido.'),
    companyName: z.string().trim().min(2, 'Informe o nome da empresa.'),
    segment: z.string().min(1, 'Selecione o segmento.'),
    password: z.string().min(6, 'A senha deve ter no minimo 6 caracteres.'),
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      message: 'Voce precisa aceitar os termos.',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas nao coincidem.',
    path: ['confirmPassword'],
  });

const joinCompanySchema = z
  .object({
    inviteCode: z.string().trim().min(4, 'Informe o codigo de convite.'),
    name: z.string().trim().min(2, 'Informe seu nome.'),
    email: z.string().email('Informe um email valido.'),
    password: z.string().min(6, 'A senha deve ter no minimo 6 caracteres.'),
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      message: 'Voce precisa aceitar os termos.',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas nao coincidem.',
    path: ['confirmPassword'],
  });

type CreateCompanyValues = z.infer<typeof createCompanySchema>;
type JoinCompanyValues = z.infer<typeof joinCompanySchema>;

/* ── Role label map ── */

const roleLabelMap: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  AGENT: 'Atendente',
  SELLER: 'Vendedor',
};

/* ── Component ── */

type Mode = null | 'create' | 'join';
type RegisterMode = Exclude<Mode, null>;

const registerOptions = [
  {
    mode: 'create' as const,
    title: 'Cadastrar nova empresa',
    description:
      'Crie seu workspace e comece a operar com tudo configurado desde o primeiro acesso.',
    icon: Building2,
    badge: 'Comecar do zero',
    shortLabel: 'Nova empresa',
    cta: 'Continuar cadastro',
    highlights: [
      'Voce entra como administrador principal',
      'Ativacao rapida com 7 dias gratis',
    ],
    helper:
      'Se preferir, voce tambem pode criar a conta usando Google ou Facebook.',
  },
  {
    mode: 'join' as const,
    title: 'Entrar com codigo de convite',
    description:
      'Use o codigo enviado pelo administrador para acessar uma empresa existente sem recriar nada.',
    icon: KeyRound,
    badge: 'Entrar na equipe',
    shortLabel: 'Tenho convite',
    cta: 'Informar codigo',
    highlights: [
      'Valide o convite antes de concluir o acesso',
      'Depois escolha a forma mais rapida de entrar',
    ],
    helper:
      'O login social fica disponivel assim que o codigo da equipe for validado.',
  },
] as const;

function RegisterModeSwitch({
  value,
  onChange,
}: {
  value: RegisterMode;
  onChange: (mode: RegisterMode) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-[18px] border border-white/[0.08] bg-black/10 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      {registerOptions.map((option) => {
        const Icon = option.icon;

        return (
          <button
            key={option.mode}
            type="button"
            onClick={() => onChange(option.mode)}
            className={cn(
              'flex h-8 items-center justify-center gap-1.5 rounded-[13px] px-2.5 text-[11px] font-semibold transition',
              value === option.mode
                ? 'bg-primary/10 text-foreground ring-1 ring-inset ring-primary/15 shadow-[0_10px_24px_rgba(3,12,24,0.18)]'
                : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
            )}
            aria-pressed={value === option.mode}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="truncate">{option.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [selectedMode, setSelectedMode] = useState<RegisterMode>('create');
  const [showPassword, setShowPassword] = useState(false);

  // Invite code validation state
  const [inviteValidated, setInviteValidated] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{
    companyName: string;
    role: string;
    title?: string;
  } | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);

  const createForm = useForm<CreateCompanyValues>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: {
      name: '',
      email: '',
      companyName: '',
      segment: '',
      password: '',
      confirmPassword: '',
      acceptTerms: undefined as unknown as true,
    },
  });

  const joinForm = useForm<JoinCompanyValues>({
    resolver: zodResolver(joinCompanySchema),
    defaultValues: {
      inviteCode: '',
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptTerms: undefined as unknown as true,
    },
  });

  const resetJoinFlow = () => {
    setInviteValidated(false);
    setInviteInfo(null);
    joinForm.reset();
  };

  const openMode = (nextMode: RegisterMode) => {
    setSelectedMode(nextMode);
    if (nextMode === 'join') {
      resetJoinFlow();
    }
    setMode(nextMode);
  };

  const returnToChooser = () => {
    if (mode === 'join') {
      resetJoinFlow();
    }
    setMode(null);
  };

  const handleValidateInvite = async () => {
    const code = joinForm.getValues('inviteCode').trim();
    if (code.length < 4) {
      joinForm.setError('inviteCode', {
        message: 'Informe o codigo de convite.',
      });
      return;
    }

    setValidatingCode(true);
    try {
      const response = await fetch('/api/auth/validate-invite-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json()) as {
        valid?: boolean;
        companyName?: string;
        role?: string;
        title?: string;
        message?: string | string[];
      };

      if (!response.ok) {
        joinForm.setError('inviteCode', {
          message:
            (Array.isArray(data.message)
              ? data.message.join(', ')
              : data.message) ?? 'Codigo invalido.',
        });
        return;
      }

      setInviteInfo({
        companyName: data.companyName ?? 'Empresa',
        role: data.role ?? 'SELLER',
        title: data.title,
      });
      setInviteValidated(true);
    } catch {
      joinForm.setError('inviteCode', {
        message: 'Erro ao validar codigo. Tente novamente.',
      });
    } finally {
      setValidatingCode(false);
    }
  };

  const handleRegister = async (
    values: CreateCompanyValues | JoinCompanyValues,
  ) => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = (await response.json()) as {
        message?: string | string[];
        user?: { isPlatformAdmin?: boolean };
      };

      if (!response.ok) {
        toast.error(
          Array.isArray(data.message)
            ? data.message.join(', ')
            : (data.message ?? 'Erro ao criar conta.'),
        );
        return;
      }

      toast.success('Conta criada com sucesso! Bem-vindo ao AutosZap.');
      const nextPath = await resolvePostAuthRedirect();
      router.push(nextPath);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Erro ao criar conta.',
      );
    }
  };

  // ── Step 1: Choose mode ──
  if (mode === null) {
    const activeOption =
      registerOptions.find((option) => option.mode === selectedMode) ??
      registerOptions[0];
    const ActiveIcon = activeOption.icon;

    return (
      <AuthShell
        eyebrow="CRIAR CONTA"
        title="Comece a usar o"
        accent="AutosZap"
        description="Escolha como deseja se cadastrar na plataforma."
      >
        <div className="flex w-full max-w-[420px] flex-col gap-2.5 xl:max-w-[430px]">
          <div className="flex flex-col gap-2.5 px-1 sm:flex-row sm:items-center sm:justify-between">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-9 w-fit rounded-lg px-2.5 text-[12px]"
            >
              <Link href="/">
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar para home
              </Link>
            </Button>
            <AuthPageSwitch active="register" />
          </div>

          <Card className="w-full overflow-hidden rounded-[24px] border-border/70 bg-background-panel/45 p-0 shadow-[0_16px_34px_rgba(2,10,22,0.28)] backdrop-blur-xl">
            <CardHeader className="relative gap-2.5 border-b border-white/[0.06] p-3.5 pb-3.5 sm:p-4 sm:pb-3.5">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(circle_at_top_left,rgba(50,151,255,0.14),transparent_65%)]" />
              <div className="relative mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                <Sparkles className="h-3 w-3" />7 dias gratis
              </div>
              <CardTitle className="relative text-[20px] font-semibold leading-snug tracking-tight sm:text-[22px]">
                Como deseja comecar?
              </CardTitle>
              <CardDescription className="relative max-w-[42ch] text-[12px] leading-5">
                Crie uma nova empresa ou entre em uma empresa existente com um
                codigo de convite.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3 p-3.5 pt-3 sm:p-4 sm:pt-3.5">
              <RegisterModeSwitch
                value={selectedMode}
                onChange={setSelectedMode}
              />

              <div className="rounded-[20px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.018))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] bg-primary/10 text-primary ring-1 ring-primary/15">
                    <ActiveIcon className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[16px] font-semibold leading-tight text-foreground sm:text-[17px]">
                        {activeOption.title}
                      </p>
                      <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
                        {activeOption.badge}
                      </div>
                    </div>
                    <p className="mt-1.5 max-w-[30ch] text-[11px] leading-[1.55] text-muted-foreground sm:text-[12px]">
                      {activeOption.description}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-1.5">
                  {activeOption.highlights.map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-2 text-[11px] leading-[1.45] text-foreground/88"
                    >
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  size="lg"
                  className="mt-3 h-10 w-full rounded-[13px] text-[13px] font-semibold shadow-[0_12px_24px_rgba(50,151,255,0.18)]"
                  onClick={() => openMode(selectedMode)}
                >
                  {activeOption.cta}
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <p className="mt-2 text-[10px] leading-[1.45] text-muted-foreground">
                  {activeOption.helper}
                </p>
              </div>

              {selectedMode === 'create' ? (
                <>
                  <SocialLoginButtons mode="register" />
                  <p className="text-center text-[9px] text-muted-foreground">
                    7 dias de acesso completo. Sem cartao de credito.
                  </p>
                </>
              ) : (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-[10px] leading-[1.5] text-muted-foreground">
                  Depois de validar o convite, voce pode entrar com email e
                  senha ou usar um provedor social.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AuthShell>
    );
  }

  // ── Step 2a: Create company ──
  if (mode === 'create') {
    return (
      <AuthShell
        eyebrow="CADASTRAR EMPRESA"
        title="Comece a usar o"
        accent="AutosZap"
        description="Preencha os dados da empresa e crie sua conta de administrador."
      >
        <div className="flex w-full max-w-[420px] flex-col gap-2.5">
          <div className="flex flex-col gap-2.5 px-1 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-lg px-2.5 text-[12px]"
              onClick={returnToChooser}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </Button>
            <AuthPageSwitch active="register" />
          </div>

          <Card className="w-full rounded-[22px] border-border/70 bg-background-panel/45 p-0 shadow-[0_14px_30px_rgba(2,10,22,0.26)] backdrop-blur-xl">
            <CardHeader className="p-4 pb-2 sm:p-[1.125rem] sm:pb-2.5">
              <div className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                <Building2 className="h-3 w-3" />
                Nova empresa
              </div>
              <CardTitle className="text-[21px] font-semibold leading-snug tracking-tight sm:text-[22px]">
                Cadastrar empresa
              </CardTitle>
              <CardDescription className="text-[12px] leading-5">
                Voce sera o administrador desta empresa.
              </CardDescription>
              <div className="pt-2">
                <RegisterModeSwitch value="create" onChange={openMode} />
              </div>
            </CardHeader>

            <CardContent className="p-4 pt-2 sm:p-[1.125rem] sm:pt-2">
              <form
                className="space-y-2.5"
                autoComplete="on"
                onSubmit={createForm.handleSubmit(handleRegister)}
              >
                {/* Company info */}
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="companyName" className="text-[12px]">
                      Nome da empresa
                    </Label>
                    <Input
                      id="companyName"
                      autoComplete="organization"
                      placeholder="Minha Empresa"
                      className="h-10 w-full rounded-xl px-3 text-[13px]"
                      {...createForm.register('companyName')}
                    />
                    {createForm.formState.errors.companyName?.message ? (
                      <p className="text-xs text-danger">
                        {createForm.formState.errors.companyName.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="segment" className="text-[12px]">
                      Segmento
                    </Label>
                    <select
                      id="segment"
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                      {...createForm.register('segment')}
                    >
                      <option value="">Selecione...</option>
                      {SEGMENTS.map((seg) => (
                        <option key={seg} value={seg}>
                          {seg}
                        </option>
                      ))}
                    </select>
                    {createForm.formState.errors.segment?.message ? (
                      <p className="text-xs text-danger">
                        {createForm.formState.errors.segment.message}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* User info */}
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="create-name" className="text-[12px]">
                      Seu nome
                    </Label>
                    <Input
                      id="create-name"
                      autoComplete="name"
                      placeholder="Seu nome"
                      className="h-10 w-full rounded-xl px-3 text-[13px]"
                      {...createForm.register('name')}
                    />
                    {createForm.formState.errors.name?.message ? (
                      <p className="text-xs text-danger">
                        {createForm.formState.errors.name.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="create-email" className="text-[12px]">
                      Email
                    </Label>
                    <Input
                      id="create-email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="voce@empresa.com"
                      className="h-10 w-full rounded-xl px-3 text-[13px]"
                      {...createForm.register('email')}
                    />
                    {createForm.formState.errors.email?.message ? (
                      <p className="text-xs text-danger">
                        {createForm.formState.errors.email.message}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="create-password" className="text-[12px]">
                      Senha
                    </Label>
                    <div className="relative">
                      <Input
                        id="create-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Min. 6 caracteres"
                        className="h-10 w-full rounded-xl px-3 pr-10 text-[13px]"
                        {...createForm.register('password')}
                      />
                      <button
                        type="button"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition hover:bg-white/5"
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    {createForm.formState.errors.password?.message ? (
                      <p className="text-xs text-danger">
                        {createForm.formState.errors.password.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="create-confirm"
                      className="text-[12px]"
                    >
                      Confirmar senha
                    </Label>
                    <Input
                      id="create-confirm"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Repita a senha"
                      className="h-10 w-full rounded-xl px-3 text-[13px]"
                      {...createForm.register('confirmPassword')}
                    />
                    {createForm.formState.errors.confirmPassword?.message ? (
                      <p className="text-xs text-danger">
                        {createForm.formState.errors.confirmPassword.message}
                      </p>
                    ) : null}
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-2 rounded-lg p-1">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                    {...createForm.register('acceptTerms')}
                  />
                  <span className="text-[11px] leading-4 text-muted-foreground">
                    Ao criar minha conta, concordo com os termos de uso e
                    politica de privacidade do AutosZap.
                  </span>
                </label>
                {createForm.formState.errors.acceptTerms?.message ? (
                  <p className="px-1 text-xs text-danger">
                    {createForm.formState.errors.acceptTerms.message}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  size="lg"
                  disabled={createForm.formState.isSubmitting}
                  className="mt-1 h-10 w-full rounded-xl text-[13px] font-semibold"
                >
                  {createForm.formState.isSubmitting
                    ? 'Criando empresa...'
                    : 'Criar empresa e conta'}
                </Button>

                <p className="text-center text-[9px] text-muted-foreground">
                  7 dias de acesso completo. Sem cartao de credito.
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </AuthShell>
    );
  }

  // ── Step 2b: Join company with invite code ──
  return (
    <AuthShell
      eyebrow="CODIGO DE CONVITE"
      title="Entrar na equipe"
      accent="AutosZap"
      description="Insira o codigo de convite que o administrador da empresa compartilhou com voce."
    >
      <div className="flex w-full max-w-[420px] flex-col gap-2.5">
        <div className="flex flex-col gap-2.5 px-1 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 rounded-lg px-2.5 text-[12px]"
            onClick={returnToChooser}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Button>
          <AuthPageSwitch active="register" />
        </div>

        <Card className="w-full rounded-[22px] border-border/70 bg-background-panel/45 p-0 shadow-[0_14px_30px_rgba(2,10,22,0.26)] backdrop-blur-xl">
          <CardHeader className="p-4 pb-2 sm:p-[1.125rem] sm:pb-2.5">
            <div className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft px-2.5 py-0.5 text-[10px] font-semibold text-primary">
              <KeyRound className="h-3 w-3" />
              Convite
            </div>
            <CardTitle className="text-[21px] font-semibold leading-snug tracking-tight sm:text-[22px]">
              {inviteValidated ? 'Quase la!' : 'Codigo de convite'}
            </CardTitle>
            <CardDescription className="text-[12px] leading-5">
              {inviteValidated
                ? `Voce esta entrando na empresa ${inviteInfo?.companyName}. Complete seus dados.`
                : 'Insira o codigo de 6 digitos recebido do administrador.'}
            </CardDescription>
            <div className="pt-2">
              <RegisterModeSwitch value="join" onChange={openMode} />
            </div>
          </CardHeader>

          <CardContent className="p-4 pt-2 sm:p-[1.125rem] sm:pt-2">
            <form
              className="space-y-2.5"
              autoComplete="on"
              onSubmit={joinForm.handleSubmit(handleRegister)}
            >
              {/* Invite code input */}
              <div className="space-y-1.5">
                <Label htmlFor="inviteCode" className="text-[12px]">
                  Codigo de convite
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="inviteCode"
                    placeholder="Ex: AB3F7K"
                    autoComplete="off"
                  className="h-10 flex-1 rounded-xl px-3 text-center font-mono text-[15px] uppercase tracking-[0.24em]"
                    maxLength={8}
                    disabled={inviteValidated}
                    {...joinForm.register('inviteCode', {
                      onChange: () => {
                        if (inviteValidated) {
                          setInviteValidated(false);
                          setInviteInfo(null);
                        }
                      },
                    })}
                  />
                  {!inviteValidated ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10 rounded-xl px-4 text-[12px]"
                      onClick={handleValidateInvite}
                      disabled={validatingCode}
                    >
                      {validatingCode ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Validar'
                      )}
                    </Button>
                  ) : (
                    <div className="flex h-10 items-center px-2 text-green-500">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  )}
                </div>
                {joinForm.formState.errors.inviteCode?.message ? (
                  <p className="text-xs text-danger">
                    {joinForm.formState.errors.inviteCode.message}
                  </p>
                ) : null}
              </div>

              {/* Company info badge */}
              {inviteValidated && inviteInfo ? (
                <div className="rounded-xl border border-primary/20 bg-primary/[0.06] p-2.5">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="text-[13px] font-semibold text-foreground">
                      {inviteInfo.companyName}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      <UserPlus className="h-3 w-3" />
                      {roleLabelMap[inviteInfo.role] ?? inviteInfo.role}
                    </span>
                    {inviteInfo.title ? (
                      <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground">
                        {inviteInfo.title}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* After invite validated: social login + manual form */}
              {inviteValidated ? (
                <>
                  {/* Social login — fastest path */}
                  <SocialLoginButtons
                    mode="register"
                    inviteCode={joinForm.getValues('inviteCode').trim()}
                  />

                  {/* Manual form toggle */}
                  <div className="relative flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] text-muted-foreground">
                      ou preencha manualmente
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="join-name" className="text-[12px]">
                        Seu nome
                      </Label>
                      <Input
                        id="join-name"
                        autoComplete="name"
                        placeholder="Seu nome"
                        className="h-10 w-full rounded-xl px-3 text-[13px]"
                        {...joinForm.register('name')}
                      />
                      {joinForm.formState.errors.name?.message ? (
                        <p className="text-xs text-danger">
                          {joinForm.formState.errors.name.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="join-email" className="text-[12px]">
                        Email
                      </Label>
                      <Input
                        id="join-email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        placeholder="voce@empresa.com"
                        className="h-10 w-full rounded-xl px-3 text-[13px]"
                        {...joinForm.register('email')}
                      />
                      {joinForm.formState.errors.email?.message ? (
                        <p className="text-xs text-danger">
                          {joinForm.formState.errors.email.message}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="join-password" className="text-[12px]">
                        Senha
                      </Label>
                      <div className="relative">
                        <Input
                          id="join-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder="Min. 6 caracteres"
                          className="h-10 w-full rounded-xl px-3 pr-10 text-[13px]"
                          {...joinForm.register('password')}
                        />
                        <button
                          type="button"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition hover:bg-white/5"
                          onClick={() => setShowPassword((v) => !v)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      {joinForm.formState.errors.password?.message ? (
                        <p className="text-xs text-danger">
                          {joinForm.formState.errors.password.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="join-confirm" className="text-[12px]">
                        Confirmar senha
                      </Label>
                      <Input
                        id="join-confirm"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Repita a senha"
                        className="h-10 w-full rounded-xl px-3 text-[13px]"
                        {...joinForm.register('confirmPassword')}
                      />
                      {joinForm.formState.errors.confirmPassword?.message ? (
                        <p className="text-xs text-danger">
                          {joinForm.formState.errors.confirmPassword.message}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-start gap-2 rounded-lg p-1">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                      {...joinForm.register('acceptTerms')}
                    />
                    <span className="text-[11px] leading-4 text-muted-foreground">
                      Ao criar minha conta, concordo com os termos de uso e
                      politica de privacidade do AutosZap.
                    </span>
                  </label>
                  {joinForm.formState.errors.acceptTerms?.message ? (
                    <p className="px-1 text-xs text-danger">
                      {joinForm.formState.errors.acceptTerms.message}
                    </p>
                  ) : null}

                  <Button
                    type="submit"
                    size="lg"
                    disabled={joinForm.formState.isSubmitting}
                    className="mt-1 h-10 w-full rounded-xl text-[13px] font-semibold"
                  >
                    {joinForm.formState.isSubmitting
                      ? 'Criando conta...'
                      : 'Criar conta e entrar na equipe'}
                  </Button>
                </>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  );
}
