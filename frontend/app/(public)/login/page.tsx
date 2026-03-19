'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AuthShell } from '@/components/layout/auth-shell';
import { PlatformDownloads } from '@/components/auth/platform-downloads';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
        className="flex w-full max-w-[440px] flex-col gap-3"
        data-deploy-marker="frontend-2026-03-14-01"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <Button asChild variant="ghost" size="sm" className="h-9 rounded-lg px-2.5 text-[12px]">
            <Link href="/">
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar para home
            </Link>
          </Button>
          <p className="text-[11px] leading-4 text-muted-foreground">
            Ainda nao e cliente?{' '}
            <Link href="/#quero-ser-cliente" className="font-semibold text-primary">
              Quero ser cliente
            </Link>
          </p>
        </div>

        <Card className="w-full rounded-[24px] border-border/70 bg-background-panel/45 p-0 shadow-[0_16px_36px_rgba(2,10,22,0.28)] backdrop-blur-xl">
          <CardHeader className="p-5 pb-2 sm:p-6 sm:pb-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-primary/85">Acesso da plataforma</p>
            <CardTitle className="text-[24px] font-semibold leading-snug tracking-tight">Bem-vindo de volta</CardTitle>
            <CardDescription className="text-[12px] leading-5">
              Entre com sua conta para continuar no AutosZap.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 pt-2 sm:p-6 sm:pt-2">
            <form
              className="space-y-3"
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
                    };
                  };

                  if (!response.ok) {
                    toast.error(Array.isArray(data.message) ? data.message.join(', ') : data.message ?? 'Falha no login.');
                    return;
                  }

                  toast.success('Sessao iniciada com sucesso.');
                  router.push(data.user?.isPlatformAdmin ? '/platform' : '/app');
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
                  className="h-11 w-full rounded-xl px-3 text-[14px]"
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
                    className="h-11 w-full rounded-xl px-3 pr-10 text-[14px]"
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

              <Button type="submit" size="lg" className="mt-1 h-11 w-full rounded-xl text-[14px] font-semibold">
                Entrar
              </Button>
            </form>
          </CardContent>
        </Card>

        {isElectronRuntime ? null : <PlatformDownloads />}
      </div>
    </AuthShell>
  );
}
