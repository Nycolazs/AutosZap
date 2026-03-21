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

export default function RegisterPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
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
      router.push('/app');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Erro ao criar conta.',
      );
    }
  };

  // ── Step 1: Choose mode ──
  if (mode === null) {
    return (
      <AuthShell
        eyebrow="CRIAR CONTA"
        title="Comece a usar o"
        accent="AutosZap"
        description="Escolha como deseja se cadastrar na plataforma."
      >
        <div className="flex w-full max-w-[440px] flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-9 rounded-lg px-2.5 text-[12px]"
            >
              <Link href="/">
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar para home
              </Link>
            </Button>
            <p className="text-[11px] leading-4 text-muted-foreground">
              Ja tem conta?{' '}
              <Link href="/login" className="font-semibold text-primary">
                Entrar
              </Link>
            </p>
          </div>

          <Card className="w-full rounded-[24px] border-border/70 bg-background-panel/45 p-0 shadow-[0_16px_36px_rgba(2,10,22,0.28)] backdrop-blur-xl">
            <CardHeader className="p-5 pb-2 sm:p-6 sm:pb-3">
              <div className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                <Sparkles className="h-3 w-3" />7 dias gratis
              </div>
              <CardTitle className="text-[24px] font-semibold leading-snug tracking-tight">
                Como deseja comecar?
              </CardTitle>
              <CardDescription className="text-[12px] leading-5">
                Crie uma nova empresa ou entre em uma empresa existente com um
                codigo de convite.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-3 p-5 pt-2 sm:p-6 sm:pt-2">
              <button
                type="button"
                onClick={() => setMode('create')}
                className="group flex items-center gap-4 rounded-2xl border border-border/70 bg-white/[0.03] p-4 text-left transition hover:border-primary/40 hover:bg-primary/[0.06]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary/20">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-foreground">
                    Cadastrar nova empresa
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    Crie sua conta e configure a empresa do zero
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:text-primary" />
              </button>

              <button
                type="button"
                onClick={() => setMode('join')}
                className="group flex items-center gap-4 rounded-2xl border border-border/70 bg-white/[0.03] p-4 text-left transition hover:border-primary/40 hover:bg-primary/[0.06]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary/20">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-foreground">
                    Entrar com codigo de convite
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    Meu administrador me enviou um codigo
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:text-primary" />
              </button>

              <div className="pt-1">
                <SocialLoginButtons mode="register" />
              </div>

              <p className="text-center text-[10px] text-muted-foreground">
                7 dias de acesso completo. Sem cartao de credito.
              </p>
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
        <div className="flex w-full max-w-[440px] flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-lg px-2.5 text-[12px]"
              onClick={() => setMode(null)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </Button>
            <p className="text-[11px] leading-4 text-muted-foreground">
              Ja tem conta?{' '}
              <Link href="/login" className="font-semibold text-primary">
                Entrar
              </Link>
            </p>
          </div>

          <Card className="w-full rounded-[24px] border-border/70 bg-background-panel/45 p-0 shadow-[0_16px_36px_rgba(2,10,22,0.28)] backdrop-blur-xl">
            <CardHeader className="p-5 pb-2 sm:p-6 sm:pb-3">
              <div className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                <Building2 className="h-3 w-3" />
                Nova empresa
              </div>
              <CardTitle className="text-[24px] font-semibold leading-snug tracking-tight">
                Cadastrar empresa
              </CardTitle>
              <CardDescription className="text-[12px] leading-5">
                Voce sera o administrador desta empresa.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 pt-2 sm:p-6 sm:pt-2">
              <form
                className="space-y-3"
                autoComplete="on"
                onSubmit={createForm.handleSubmit(handleRegister)}
              >
                {/* Company info */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="companyName" className="text-[12px]">
                      Nome da empresa
                    </Label>
                    <Input
                      id="companyName"
                      autoComplete="organization"
                      placeholder="Minha Empresa"
                      className="h-11 w-full rounded-xl px-3 text-[14px]"
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
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-primary/40"
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="create-name" className="text-[12px]">
                      Seu nome
                    </Label>
                    <Input
                      id="create-name"
                      autoComplete="name"
                      placeholder="Seu nome"
                      className="h-11 w-full rounded-xl px-3 text-[14px]"
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
                      className="h-11 w-full rounded-xl px-3 text-[14px]"
                      {...createForm.register('email')}
                    />
                    {createForm.formState.errors.email?.message ? (
                      <p className="text-xs text-danger">
                        {createForm.formState.errors.email.message}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
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
                        className="h-11 w-full rounded-xl px-3 pr-10 text-[14px]"
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
                      className="h-11 w-full rounded-xl px-3 text-[14px]"
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
                  className="mt-1 h-11 w-full rounded-xl text-[14px] font-semibold"
                >
                  {createForm.formState.isSubmitting
                    ? 'Criando empresa...'
                    : 'Criar empresa e conta'}
                </Button>

                <p className="text-center text-[10px] text-muted-foreground">
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
      <div className="flex w-full max-w-[440px] flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 rounded-lg px-2.5 text-[12px]"
            onClick={() => {
              setMode(null);
              setInviteValidated(false);
              setInviteInfo(null);
              joinForm.reset();
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Button>
          <p className="text-[11px] leading-4 text-muted-foreground">
            Ja tem conta?{' '}
            <Link href="/login" className="font-semibold text-primary">
              Entrar
            </Link>
          </p>
        </div>

        <Card className="w-full rounded-[24px] border-border/70 bg-background-panel/45 p-0 shadow-[0_16px_36px_rgba(2,10,22,0.28)] backdrop-blur-xl">
          <CardHeader className="p-5 pb-2 sm:p-6 sm:pb-3">
            <div className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft px-2.5 py-0.5 text-[10px] font-semibold text-primary">
              <KeyRound className="h-3 w-3" />
              Convite
            </div>
            <CardTitle className="text-[24px] font-semibold leading-snug tracking-tight">
              {inviteValidated ? 'Quase la!' : 'Codigo de convite'}
            </CardTitle>
            <CardDescription className="text-[12px] leading-5">
              {inviteValidated
                ? `Voce esta entrando na empresa ${inviteInfo?.companyName}. Complete seus dados.`
                : 'Insira o codigo de 6 digitos recebido do administrador.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 pt-2 sm:p-6 sm:pt-2">
            <form
              className="space-y-3"
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
                    className="h-11 flex-1 rounded-xl px-3 text-center font-mono text-[16px] uppercase tracking-[0.3em]"
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
                      className="h-11 rounded-xl px-4"
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
                    <div className="flex h-11 items-center px-2 text-green-500">
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
                <div className="rounded-xl border border-primary/20 bg-primary/[0.06] p-3">
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

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="join-name" className="text-[12px]">
                        Seu nome
                      </Label>
                      <Input
                        id="join-name"
                        autoComplete="name"
                        placeholder="Seu nome"
                        className="h-11 w-full rounded-xl px-3 text-[14px]"
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
                        className="h-11 w-full rounded-xl px-3 text-[14px]"
                        {...joinForm.register('email')}
                      />
                      {joinForm.formState.errors.email?.message ? (
                        <p className="text-xs text-danger">
                          {joinForm.formState.errors.email.message}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
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
                          className="h-11 w-full rounded-xl px-3 pr-10 text-[14px]"
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
                        className="h-11 w-full rounded-xl px-3 text-[14px]"
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
                    className="mt-1 h-11 w-full rounded-xl text-[14px] font-semibold"
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
