'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import {
  DefaultValues,
  FieldValues,
  Path,
  Resolver,
  SubmitHandler,
  useForm,
  useWatch,
} from 'react-hook-form';
import { ZodSchema } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type FieldOption = {
  label: string;
  value: string;
};

type FieldConfig<TFormValues extends FieldValues> = {
  name: Path<TFormValues>;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'email' | 'password' | 'color' | 'select' | 'multiselect';
  placeholder?: string;
  options?: FieldOption[];
};

export function EntityFormDialog<TFormValues extends FieldValues>({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  schema,
  defaultValues,
  fields,
  onSubmit,
  submitLabel = 'Salvar',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  trigger?: React.ReactNode;
  schema: ZodSchema<TFormValues>;
  defaultValues: DefaultValues<TFormValues>;
  fields: Array<FieldConfig<TFormValues>>;
  onSubmit: SubmitHandler<TFormValues>;
  submitLabel?: string;
}) {
  const form = useForm<TFormValues>({
    resolver: zodResolver(schema as never) as Resolver<TFormValues>,
    defaultValues,
  });
  const watchedValues = useWatch({
    control: form.control,
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            await onSubmit(values);
            onOpenChange(false);
          })}
        >
          {fields.map((field) => {
            const error = form.formState.errors[field.name]?.message as string | undefined;
            const value = watchedValues[field.name as keyof typeof watchedValues];

            return (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={field.name}>{field.label}</Label>
                {field.type === 'textarea' ? (
                  <Textarea id={field.name} placeholder={field.placeholder} {...form.register(field.name)} />
                ) : field.type === 'select' ? (
                  <select
                    id={field.name}
                    className="h-12 w-full rounded-2xl border border-border bg-background-panel px-4 text-sm text-foreground"
                    {...form.register(field.name)}
                  >
                    <option value="">Selecione</option>
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'multiselect' ? (
                  <select
                    id={field.name}
                    multiple
                    value={(value as string[] | undefined) ?? []}
                    className="min-h-32 w-full rounded-2xl border border-border bg-background-panel px-4 py-3 text-sm text-foreground"
                    onChange={(event) =>
                      form.setValue(
                        field.name,
                        Array.from(event.target.selectedOptions).map((option) => option.value) as never,
                      )
                    }
                  >
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={field.name}
                    type={field.type ?? 'text'}
                    placeholder={field.placeholder}
                    {...form.register(field.name)}
                  />
                )}
                {error ? <p className="text-xs text-danger">{error}</p> : null}
              </div>
            );
          })}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
