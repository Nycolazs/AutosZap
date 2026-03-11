'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AuthShell } from '@/components/layout/auth-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z
  .object({
    name: z.string().min(2, 'Informe seu nome.'),
    companyName: z.string().min(2, 'Informe o nome da empresa.'),
    email: z.string().email('Informe um email valido.'),
    password: z.string().min(6, 'A senha precisa ter ao menos 6 caracteres.'),
    confirmPassword: z.string().min(6, 'Confirme sua senha.'),
    acceptTerms: z.boolean().refine((value) => value, 'Aceite os termos para continuar.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas nao conferem.',
  });

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      acceptTerms: true,
    },
  });
  const acceptTerms = useWatch({
    control: form.control,
    name: 'acceptTerms',
  });

  return (
    <AuthShell
      eyebrow="WORKSPACE NOVA"
      title="Estruture sua operacao com"
      accent="AutosZap"
      description="Crie sua workspace inicial, adicione sua equipe e comece com uma base pronta para integracao oficial com WhatsApp Business Platform."
    >
      <Card className="w-full max-w-[560px] p-0">
        <CardHeader className="p-8 pb-2">
          <CardTitle className="text-4xl">Crie sua conta</CardTitle>
          <CardDescription className="text-base">
            Em poucos minutos sua workspace inicial estara pronta.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8 pt-6">
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              try {
                const response = await fetch('/api/auth/register', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(values),
                });
                const data = (await response.json()) as { message?: string | string[] };

                if (!response.ok) {
                  toast.error(Array.isArray(data.message) ? data.message.join(', ') : data.message ?? 'Falha no cadastro.');
                  return;
                }

                toast.success('Conta criada com sucesso.');
                router.push('/app/inbox');
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Falha no cadastro.');
              }
            })}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Seu nome</Label>
                <Input id="name" {...form.register('name')} />
                <p className="text-xs text-danger">{form.formState.errors.name?.message}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName">Empresa</Label>
                <Input id="companyName" {...form.register('companyName')} />
                <p className="text-xs text-danger">{form.formState.errors.companyName?.message}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...form.register('email')} />
              <p className="text-xs text-danger">{form.formState.errors.email?.message}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" {...form.register('password')} />
                <p className="text-xs text-danger">{form.formState.errors.password?.message}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar senha</Label>
                <Input id="confirmPassword" type="password" {...form.register('confirmPassword')} />
                <p className="text-xs text-danger">{form.formState.errors.confirmPassword?.message}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-white/[0.03] px-4 py-3">
              <Checkbox
                checked={acceptTerms}
                onCheckedChange={(checked) => form.setValue('acceptTerms', Boolean(checked))}
              />
              <Label htmlFor="acceptTerms" className="text-sm text-muted-foreground">
                Aceito os termos de uso e privacidade para criar minha workspace.
              </Label>
            </div>
            <p className="text-xs text-danger">{form.formState.errors.acceptTerms?.message}</p>
            <Button type="submit" size="lg" className="w-full">
              Criar conta
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Ja possui conta?{' '}
            <Link href="/login" className="font-semibold text-primary">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
