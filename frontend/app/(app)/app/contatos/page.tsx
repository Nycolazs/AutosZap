'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { FilterBar } from '@/components/shared/filter-bar';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { Contact, PaginatedResponse, Tag } from '@/lib/types';
import { applyBrazilPhoneMask, cn, formatBrazilPhone, formatDate, normalizePhone } from '@/lib/utils';
import { ContactRound } from 'lucide-react';

const schema = z.object({
  name: z.string().min(2),
  phone: z
    .string()
    .min(1, 'Informe o telefone.')
    .refine((value) => {
      const digits = normalizePhone(value);
      return digits.length === 10 || digits.length === 11;
    }, 'Use o formato (99) 99999-9999.'),
  email: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  notes: z.string().optional(),
  tagIds: z.array(z.string()).optional(),
});

type FormValues = z.infer<typeof schema>;

const columns: ColumnDef<Contact>[] = [
  { accessorKey: 'name', header: 'Nome' },
  {
    accessorKey: 'phone',
    header: 'Telefone',
    cell: ({ row }) => formatBrazilPhone(row.original.phone),
  },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'company', header: 'Empresa' },
  {
    accessorKey: 'lastInteractionAt',
    header: 'Última interação',
    cell: ({ row }) => formatDate(row.original.lastInteractionAt),
  },
];

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const contactsQuery = useQuery({
    queryKey: ['contacts', search],
    queryFn: () => apiRequest<PaginatedResponse<Contact>>(`contacts?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });
  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: () => apiRequest<Tag[]>('tags'),
  });
  const contactDetailQuery = useQuery({
    queryKey: ['contact-detail', selectedContact?.id],
    enabled: Boolean(selectedContact?.id),
    queryFn: () => apiRequest<Contact>(`contacts/${selectedContact?.id}`),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      company: '',
      jobTitle: '',
      notes: '',
      tagIds: [],
    },
  });
  const selectedTagIds = useWatch({
    control: form.control,
    name: 'tagIds',
  });

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) =>
      apiRequest(selectedContact ? `contacts/${selectedContact.id}` : 'contacts', {
        method: selectedContact ? 'PATCH' : 'POST',
        body: {
          ...values,
          phone: normalizePhone(values.phone),
          tagIds: values.tagIds ?? [],
        },
      }),
    onSuccess: async () => {
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contato salvo.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const contacts = contactsQuery.data?.data ?? [];
  const detail = contactDetailQuery.data;
  const availableTags = tagsQuery.data ?? [];

  function toggleTag(tagId: string) {
    const current = selectedTagIds ?? [];
    const next = current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId];
    form.setValue('tagIds', next, { shouldDirty: true });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contatos"
        description="Centralize telefone, empresa, tags e histórico de interações ligadas a campanhas e conversas."
        action={
          <Button
            onClick={() => {
              setSelectedContact(null);
              form.reset({ name: '', phone: '', email: '', company: '', jobTitle: '', notes: '', tagIds: [] });
              setDialogOpen(true);
            }}
          >
            Novo contato
          </Button>
        }
      />

      <FilterBar search={search} onSearchChange={setSearch} />

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card className="p-0">
          <CardContent className="p-4">
            {contacts.length ? (
              <DataTable
                columns={columns}
                data={contacts}
                onRowClick={(contact) => {
                  setSelectedContact(contact);
                  form.reset({
                    name: contact.name,
                    phone: applyBrazilPhoneMask(contact.phone),
                    email: contact.email ?? '',
                    company: contact.company ?? '',
                    jobTitle: contact.jobTitle ?? '',
                    notes: contact.notes ?? '',
                    tagIds: contact.tags?.map((tag) => tag.id) ?? [],
                  });
                }}
              />
            ) : (
              <EmptyState
                icon={ContactRound}
                title="Nenhum contato"
                description="Os contatos da seed ou novos cadastros aparecerao aqui para nutricao, CRM e inbox."
              />
            )}
          </CardContent>
        </Card>

        <Card className="p-0 xl:sticky xl:top-5 xl:self-start">
          <CardHeader className="p-4 sm:p-5">
            <CardTitle>Detalhe do contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
            {detail ? (
              <>
                <div className="space-y-2">
                  <div>
                    <h3 className="font-heading text-[24px] font-semibold leading-tight">{detail.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{detail.company ?? 'Sem empresa'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{formatBrazilPhone(detail.phone)}</Badge>
                    {detail.email ? <Badge variant="secondary">{detail.email}</Badge> : null}
                  </div>
                </div>
                <div className="rounded-[24px] border border-border bg-white/[0.03] p-4">
                  <p className="text-sm text-muted-foreground">{detail.jobTitle ?? 'Sem cargo informado'}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Última interação: {formatDate(detail.lastInteractionAt)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.tags?.length ? (
                      detail.tags.map((tag) => (
                        <Badge key={tag.id} variant="secondary">
                          {tag.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">Nenhuma tag vinculada.</span>
                    )}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setDialogOpen(true);
                  }}
                >
                  Editar contato
                </Button>
                <div className="space-y-3">
                  <p className="font-medium">Timeline</p>
                  {detail.timeline?.map((item, index) => (
                    <div key={`${item.title}-${index}`} className="rounded-2xl border border-border bg-background-panel p-3">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(item.date)}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState
                icon={ContactRound}
                title="Selecione um contato"
                description="Ao selecionar um contato, voce visualiza tags, dados principais e uma timeline simples."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedContact ? 'Editar contato' : 'Novo contato'}</DialogTitle>
            <DialogDescription>Cadastre e edite contatos com persistencia real no banco.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input {...form.register('name')} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  placeholder="(99) 99999-9999"
                  {...form.register('phone', {
                    onChange: (event) => {
                      const masked = applyBrazilPhoneMask(event.target.value);
                      form.setValue('phone', masked, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    },
                  })}
                />
                {form.formState.errors.phone ? (
                  <p className="text-xs text-danger">{form.formState.errors.phone.message}</p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input {...form.register('email')} />
              </div>
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Input {...form.register('company')} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Cargo</Label>
                <Input {...form.register('jobTitle')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              {availableTags.length ? (
                <div className="grid gap-2 rounded-[24px] border border-border bg-background-panel/80 p-3 sm:grid-cols-2">
                  {availableTags.map((tag) => {
                    const active = (selectedTagIds ?? []).includes(tag.id);

                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className={cn(
                          'flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-2 text-left transition',
                          active
                            ? 'border-primary/60 bg-primary/15 text-foreground'
                            : 'border-border bg-white/[0.02] text-muted-foreground hover:border-primary/40 hover:text-foreground',
                        )}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                        <span className="text-sm font-medium">{tag.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-border bg-background-panel/70 px-4 py-5 text-sm text-muted-foreground">
                  Nenhuma tag cadastrada ainda. Crie tags em <span className="text-foreground">Workspace &gt; Tags</span> para associar ao contato.
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea {...form.register('notes')} />
            </div>
            <div className="flex flex-col-reverse gap-2.5 border-t border-border pt-4 sm:flex-row sm:justify-end sm:gap-3">
              <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
