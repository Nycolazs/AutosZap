'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AuthShell } from '@/components/layout/auth-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z
  .object({
    password: z.string().min(6, 'A senha precisa ter ao menos 6 caracteres.'),
    confirmPassword: z.string().min(6, 'Confirme a nova senha.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas nao conferem.',
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const { token } = use(params);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  return (
    <AuthShell
      eyebrow="RESET DE ACESSO"
      title="Defina uma nova senha para o"
      accent="AutosZap"
      description="Use o token gerado para redefinir sua senha e recuperar acesso a sua workspace."
    >
      <Card className="w-full max-w-[520px] p-0">
        <CardHeader className="p-8 pb-2">
          <CardTitle className="text-4xl">Redefinir senha</CardTitle>
          <CardDescription className="text-base">
            Sua nova senha sera aplicada imediatamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8 pt-6">
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...values,
                  token,
                }),
              });
              const data = (await response.json()) as { message?: string | string[] };

              if (!response.ok) {
                toast.error(Array.isArray(data.message) ? data.message.join(', ') : data.message ?? 'Falha ao redefinir.');
                return;
              }

              toast.success('Senha redefinida com sucesso.');
              router.push('/login');
            })}
          >
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <Input id="password" type="password" {...form.register('password')} />
              <p className="text-xs text-danger">{form.formState.errors.password?.message}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input id="confirmPassword" type="password" {...form.register('confirmPassword')} />
              <p className="text-xs text-danger">{form.formState.errors.confirmPassword?.message}</p>
            </div>
            <Button type="submit" size="lg" className="w-full">
              Atualizar senha
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
