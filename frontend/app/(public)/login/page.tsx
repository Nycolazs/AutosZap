'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AuthPageSwitch } from '@/components/auth/auth-page-switch';
import { AuthShell } from '@/components/layout/auth-shell';
import { SocialLoginButtons } from '@/components/auth/social-login-buttons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resolvePostAuthRedirect } from '@/lib/auth-redirect';

const schema = z.object({
  email: z.string().email('Informe um email valido.'),
  password: z.string().min(6, 'A senha deve ter no minimo 6 caracteres.'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const isElectronRuntime =
    typeof navigator !== 'undefined' &&
    navigator.userAgent.toLowerCase().includes('electron');
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  return (
    <AuthShell
      eyebrow="PLATAFORMA COMPLETA"
      title="Venda mais pelo"
      accent="WhatsApp"
      description="Gerencie conversas, distribua atendimento, opere seu CRM e prepare campanhas com a mesma sofisticacao visual de uma plataforma enterprise."
    >
      <div
        className="desktop-low-height-auth-stack flex w-full max-w-[400px] flex-col gap-2.5 xl:max-w-[410px]"
        data-deploy-marker="frontend-2026-03-14-01"
      >
        <div className="flex flex-col gap-2.5 px-1 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="ghost" size="sm" className="h-9 rounded-lg px-2.5 text-[12px]">
            <Link href="/">
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar para home
            </Link>
          </Button>
          <AuthPageSwitch active="login" />
        </div>

        <Card className="w-full rounded-[22px] border-border/70 bg-background-panel/45 p-0 shadow-[0_14px_30px_rgba(2,10,22,0.26)] backdrop-blur-xl">
          <CardHeader className="p-4 pb-2 sm:p-[1.125rem] sm:pb-2.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-primary/85">Acesso da plataforma</p>
            <CardTitle className="text-[20px] font-semibold leading-snug tracking-tight sm:text-[22px]">Bem-vindo de volta</CardTitle>
            <CardDescription className="text-[12px] leading-5">
              Entre com sua conta para continuar no AutosZap.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 pt-2 sm:p-[1.125rem] sm:pt-2">
            <form
              className="space-y-2.5"
              autoComplete="on"
              onSubmit={form.handleSubmit(async (values) => {
                try {
                  const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(values),
                  });
                  const data = (await response.json()) as {
                    message?: string | string[];
                    user?: {
                      isPlatformAdmin?: boolean;
                      companyId?: string | null;
                    };
                  };

                  if (!response.ok) {
                    toast.error(Array.isArray(data.message) ? data.message.join(', ') : data.message ?? 'Falha no login.');
                    return;
                  }

                  toast.success('Sessao iniciada com sucesso.');
                  const nextPath = data.user?.isPlatformAdmin
                    ? '/platform'
                    : await resolvePostAuthRedirect();
                  router.push(nextPath);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Falha no login.');
                }
              })}
            >
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[12px]">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="voce@empresa.com"
                  className="h-10 w-full rounded-xl px-3 text-[13px]"
                  {...form.register('email')}
                />
                {form.formState.errors.email?.message ? (
                  <p className="text-xs text-danger">{form.formState.errors.email.message}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-[12px]">Senha</Label>
                  <Link href="/forgot-password" className="text-[12px] font-medium text-primary">
                    Esqueceu a senha?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Sua senha"
                    className="h-10 w-full rounded-xl px-3 pr-10 text-[13px]"
                    {...form.register('password')}
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition hover:bg-white/5"
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {form.formState.errors.password?.message ? (
                  <p className="text-xs text-danger">{form.formState.errors.password.message}</p>
                ) : null}
              </div>

              <Button type="submit" size="lg" className="mt-1 h-10 w-full rounded-xl text-[13px] font-semibold">
                Entrar
              </Button>

              <SocialLoginButtons mode="login" />
            </form>
          </CardContent>
        </Card>

      </div>
    </AuthShell>
  );
}
