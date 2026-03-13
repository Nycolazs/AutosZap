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
import { MultiOptionSelector } from '@/components/shared/multi-option-selector';
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
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type FieldOption = {
  label: string;
  value: string;
  color?: string;
};

type FieldConfig<TFormValues extends FieldValues> = {
  name: Path<TFormValues>;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'email' | 'password' | 'color' | 'select' | 'multiselect';
  placeholder?: string;
  options?: FieldOption[] | ((values: TFormValues) => FieldOption[]);
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
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={form.handleSubmit(async (values) => {
            await onSubmit(values);
            onOpenChange(false);
          })}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 sm:pr-2">
            {fields.map((field) => {
              const error = form.formState.errors[field.name]?.message as string | undefined;
              const value = watchedValues[field.name as keyof typeof watchedValues];
              const resolvedOptions =
                typeof field.options === 'function'
                  ? field.options(watchedValues as TFormValues)
                  : (field.options ?? []);

              return (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={field.name}>{field.label}</Label>
                  {field.type === 'textarea' ? (
                    <Textarea id={field.name} placeholder={field.placeholder} {...form.register(field.name)} />
                  ) : field.type === 'select' ? (
                    <NativeSelect id={field.name} {...form.register(field.name)}>
                      <option value="">Selecione</option>
                      {resolvedOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : field.type === 'multiselect' ? (
                    <MultiOptionSelector
                      options={resolvedOptions}
                      value={(value as string[] | undefined) ?? []}
                      onChange={(next) => form.setValue(field.name, next as never, { shouldDirty: true })}
                    />
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
          </div>
          <div className="mt-4 flex shrink-0 flex-col-reverse gap-2.5 border-t border-border pt-4 sm:flex-row sm:justify-end sm:gap-3">
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
