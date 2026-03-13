'use client';

import Image from 'next/image';
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
      <div className="flex w-full max-w-[440px] flex-col gap-4">
        <Card className="w-full rounded-[28px] border-white/8 bg-[linear-gradient(180deg,rgba(7,20,38,0.94),rgba(4,16,31,0.98))] p-0 shadow-[0_24px_60px_rgba(2,10,22,0.34)] backdrop-blur-xl">
          <CardHeader className="p-5 pb-2 sm:p-6 sm:pb-2">
            <div className="mb-4 flex items-center gap-3 lg:hidden">
              <Image
                src="/brand/autoszap-mark.png"
                alt="AutosZap"
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
                priority
              />
              <div>
                <p className="font-heading text-lg font-semibold leading-none">AutosZap</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Atendimento & CRM</p>
              </div>
            </div>
            <CardTitle className="text-[30px] leading-[1.02] sm:text-3xl">Bem-vindo de volta</CardTitle>
            <CardDescription className="text-sm leading-6 sm:text-base">
              Entre com sua conta para continuar no AutosZap.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-5 sm:p-6 sm:pt-5">
            <form
              className="space-y-3.5 sm:space-y-4"
              autoComplete="off"
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
                  router.push('/app/inbox');
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Falha no login.');
                }
              })}
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="off"
                  inputMode="email"
                  placeholder="voce@empresa.com"
                  className="h-11 rounded-2xl px-4 text-[15px] sm:h-10 sm:rounded-xl sm:px-3.5 sm:text-sm"
                  {...form.register('email')}
                />
                <p className="text-xs text-danger">{form.formState.errors.email?.message}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  <Link href="/forgot-password" className="text-xs font-medium text-primary sm:text-sm">
                    Esqueceu a senha?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="off"
                    placeholder="Sua senha"
                    className="h-11 rounded-2xl px-4 pr-11 text-[15px] sm:h-10 sm:rounded-xl sm:px-3.5 sm:pr-10 sm:text-sm"
                    {...form.register('password')}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition hover:bg-white/5"
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-danger">{form.formState.errors.password?.message}</p>
              </div>
              <Button type="submit" size="lg" className="mt-1 h-11 w-full rounded-2xl text-[15px] sm:h-11 sm:rounded-xl sm:text-sm">
                Entrar
              </Button>
            </form>
            <p className="mt-5 text-center text-sm leading-6 text-muted-foreground">
              Nao tem uma conta?{' '}
              <Link href="/register" className="font-semibold text-primary">
                Criar conta gratis
              </Link>
            </p>
          </CardContent>
        </Card>

        <PlatformDownloads />
      </div>
    </AuthShell>
  );
}
