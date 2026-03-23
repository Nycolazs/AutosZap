'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const leadSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome.'),
  email: z.string().trim().email('Informe um email valido.'),
  phone: z
    .string()
    .trim()
    .max(32, 'Telefone muito longo.')
    .optional()
    .or(z.literal('')),
  companyName: z
    .string()
    .trim()
    .max(140, 'Nome da empresa muito longo.')
    .optional()
    .or(z.literal('')),
  attendantsCount: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((value) => {
      if (!value) {
        return true;
      }

      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5000;
    }, 'Informe de 1 a 5000 atendentes.'),
  notes: z
    .string()
    .trim()
    .max(1500, 'Observacoes muito longas.')
    .optional()
    .or(z.literal('')),
});

type LeadFormValues = z.infer<typeof leadSchema>;

export function LeadInterestForm() {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      companyName: '',
      attendantsCount: '',
      notes: '',
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Card className="rounded-[24px] border-border/70 bg-background-panel/35 p-0">
      <CardHeader className="p-5 pb-3 sm:p-6 sm:pb-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-primary/85">Quero ser cliente</p>
        <CardTitle className="text-2xl leading-tight sm:text-[1.7rem]">
          Fale com o time comercial do AutoZap
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Envie seus dados e retornamos com orientacao sobre integracao, prazos e melhor plano para sua operação.
        </p>
      </CardHeader>

      <CardContent className="space-y-4 p-5 pt-0 sm:p-6 sm:pt-1">
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit(async (values) => {
            setSuccessMessage(null);

            try {
              const response = await fetch('/api/lead-interests', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  ...values,
                  attendantsCount: values.attendantsCount
                    ? Number(values.attendantsCount)
                    : undefined,
                  source: 'landing-home',
                }),
              });

              const payload = (await response.json()) as {
                message?: string | string[];
              };

              if (!response.ok) {
                const message = Array.isArray(payload.message)
                  ? payload.message.join(', ')
                  : payload.message ?? 'Nao foi possivel enviar seu interesse agora.';
                toast.error(message);
                return;
              }

              const message = Array.isArray(payload.message)
                ? payload.message.join(', ')
                : payload.message ?? 'Interesse enviado com sucesso.';

              setSuccessMessage(message);
              toast.success('Recebemos seus dados.');
              form.reset({
                name: '',
                email: '',
                phone: '',
                companyName: '',
                attendantsCount: '',
                notes: '',
              });
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : 'Nao foi possivel enviar seu interesse agora.',
              );
            }
          })}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="lead-name">Nome *</Label>
              <Input id="lead-name" placeholder="Seu nome" {...form.register('name')} />
              {form.formState.errors.name?.message ? (
                <p className="text-xs text-danger">{form.formState.errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="lead-email">Email *</Label>
              <Input
                id="lead-email"
                type="email"
                placeholder="voce@empresa.com"
                {...form.register('email')}
              />
              {form.formState.errors.email?.message ? (
                <p className="text-xs text-danger">{form.formState.errors.email.message}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="lead-phone">Telefone / WhatsApp</Label>
              <Input
                id="lead-phone"
                placeholder="(11) 99999-9999"
                {...form.register('phone')}
              />
              {form.formState.errors.phone?.message ? (
                <p className="text-xs text-danger">{form.formState.errors.phone.message}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="lead-company">Empresa</Label>
              <Input
                id="lead-company"
                placeholder="Nome da empresa"
                {...form.register('companyName')}
              />
              {form.formState.errors.companyName?.message ? (
                <p className="text-xs text-danger">{form.formState.errors.companyName.message}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <div className="space-y-1">
              <Label htmlFor="lead-notes">Observacoes</Label>
              <Textarea
                id="lead-notes"
                placeholder="Exemplo: preciso integrar 2 numeros e organizar 6 atendentes no inbox."
                className="min-h-[110px]"
                {...form.register('notes')}
              />
              {form.formState.errors.notes?.message ? (
                <p className="text-xs text-danger">{form.formState.errors.notes.message}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="lead-attendants">Qtd. aproximada de atendentes</Label>
              <Input
                id="lead-attendants"
                type="number"
                min={1}
                max={5000}
                placeholder="Ex: 8"
                {...form.register('attendantsCount')}
              />
              {form.formState.errors.attendantsCount?.message ? (
                <p className="text-xs text-danger">
                  {form.formState.errors.attendantsCount.message}
                </p>
              ) : null}
            </div>
          </div>

          {successMessage ? (
            <div className="rounded-lg border border-primary/25 bg-primary-soft px-3 py-2 text-xs text-primary">
              {successMessage}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Sem cadastro automatico. Seu acesso e liberado somente apos alinhamento com nosso time.
            </p>
            <Button type="submit" disabled={isSubmitting} className="sm:min-w-[190px]">
              {isSubmitting ? 'Enviando...' : 'Quero ser cliente'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
