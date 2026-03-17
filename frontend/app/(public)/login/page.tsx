'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
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
      description="Gerencie conversas, distribua atendimento, opere seu CRM e prepare campanhas com a mesma sofisticação visual de uma plataforma enterprise."
    >
      <div
        className="flex w-full max-w-[420px] flex-col gap-2"
        data-deploy-marker="frontend-2026-03-14-01"
      >
        <Card className="w-full rounded-[20px] border-white/8 bg-[linear-gradient(180deg,rgba(7,20,38,0.95),rgba(4,15,29,0.99))] p-0 shadow-[0_16px_38px_rgba(2,10,22,0.34)] backdrop-blur-xl">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-[19px] font-semibold leading-snug tracking-tight">Bem-vindo de volta</CardTitle>
            <CardDescription className="text-[11px] leading-4">
              Entre com sua conta para continuar no AutosZap.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-3">
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
                  const data = (await response.json()) as { message?: string | string[] };

                  if (!response.ok) {
                    toast.error(Array.isArray(data.message) ? data.message.join(', ') : data.message ?? 'Falha no login.');
                    return;
                  }

                  toast.success('Sessao iniciada com sucesso.');
                  router.push('/app');
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Falha no login.');
                }
              })}
            >
              <div className="space-y-1">
                <Label htmlFor="email" className="text-[11px]">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="voce@empresa.com"
                  className="h-8 w-full rounded-md px-3 text-[13px]"
                  {...form.register('email')}
                />
                {form.formState.errors.email?.message ? (
                  <p className="text-xs text-danger">{form.formState.errors.email.message}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-[11px]">Senha</Label>
                  <Link href="/forgot-password" className="text-[11px] font-medium text-primary">
                    Esqueceu a senha?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Sua senha"
                    className="h-8 w-full rounded-md px-3 pr-9 text-[13px]"
                    {...form.register('password')}
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition hover:bg-white/5"
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {form.formState.errors.password?.message ? (
                  <p className="text-xs text-danger">{form.formState.errors.password.message}</p>
                ) : null}
              </div>
              <Button type="submit" size="lg" className="mt-0.5 h-8 w-full rounded-md text-[13px] font-semibold">
                Entrar
              </Button>
            </form>
            <p className="mt-3 text-center text-[11px] leading-4 text-muted-foreground">
              Nao tem uma conta?{' '}
              <Link href="/register" className="font-semibold text-primary">
                Criar conta gratis
              </Link>
            </p>
          </CardContent>
        </Card>

        {isElectronRuntime ? null : <PlatformDownloads />}
      </div>
    </AuthShell>
  );
}
