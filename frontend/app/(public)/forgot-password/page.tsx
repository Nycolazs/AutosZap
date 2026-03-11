'use client';

import Link from 'next/link';
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
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
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [devToken, setDevToken] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  return (
    <AuthShell
      eyebrow="RECUPERACAO SEGURA"
      title="Recupere seu acesso ao"
      accent="AutoZap"
      description="Solicite um token de redefinicao. Em ambiente local, o token tambem fica visivel para agilizar testes."
    >
      <Card className="w-full max-w-[520px] p-0">
        <CardHeader className="p-8 pb-2">
          <CardTitle className="text-4xl">Esqueceu sua senha?</CardTitle>
          <CardDescription className="text-base">
            Informe seu email e iremos gerar um token de redefinicao.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-8 pt-6">
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values),
              });
              const data = (await response.json()) as { devToken?: string; message?: string | string[] };

              if (!response.ok) {
                toast.error(Array.isArray(data.message) ? data.message.join(', ') : data.message ?? 'Falha ao gerar token.');
                return;
              }

              setDevToken(data.devToken ?? null);
              toast.success('Solicitacao processada.');
            })}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...form.register('email')} />
              <p className="text-xs text-danger">{form.formState.errors.email?.message}</p>
            </div>
            <Button type="submit" size="lg" className="w-full">
              Gerar token de reset
            </Button>
          </form>
          {devToken ? (
            <div className="rounded-2xl border border-primary/25 bg-primary-soft p-4 text-sm">
              <p className="font-medium text-primary">Token de desenvolvimento</p>
              <p className="mt-2 break-all text-foreground">{devToken}</p>
              <Link href={`/reset-password/${devToken}`} className="mt-3 inline-flex font-semibold text-primary">
                Abrir tela de redefinicao
              </Link>
            </div>
          ) : null}
          <Link href="/login" className="text-sm text-primary">
            Voltar para login
          </Link>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
