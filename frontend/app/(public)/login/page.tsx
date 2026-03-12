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
      <Card className="w-full max-w-[500px] border-white/6 p-0">
        <CardHeader className="p-6 pb-2">
          <CardTitle className="text-3xl">Bem-vindo de volta</CardTitle>
          <CardDescription className="text-base">
            Entre com sua conta para continuar no AutosZap.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-5">
          <form
            className="space-y-4"
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
              <Input id="email" type="email" autoComplete="off" {...form.register('email')} />
              <p className="text-xs text-danger">{form.formState.errors.email?.message}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <Link href="/forgot-password" className="text-sm text-primary">
                  Esqueceu a senha?
                </Link>
              </div>
              <div className="relative">
                <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="off" {...form.register('password')} />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-danger">{form.formState.errors.password?.message}</p>
            </div>
            <Button type="submit" size="lg" className="w-full">
              Entrar
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Nao tem uma conta?{' '}
            <Link href="/register" className="font-semibold text-primary">
              Criar conta gratis
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
