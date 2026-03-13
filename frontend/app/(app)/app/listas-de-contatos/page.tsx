'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { ListChecks, Trash2 } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FilterBar } from '@/components/shared/filter-bar';
import { MultiOptionSelector } from '@/components/shared/multi-option-selector';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { Contact, PaginatedResponse } from '@/lib/types';
import { cn, formatBrazilPhone } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  contactIds: z.array(z.string()).optional(),
});

type FormValues = z.infer<typeof schema>;

type ContactList = {
  id: string;
  name: string;
  description?: string | null;
  items: Array<{ contact: Contact }>;
};

export default function ContactListsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [editingList, setEditingList] = useState<ContactList | null>(null);

  const listsQuery = useQuery({
    queryKey: ['lists'],
    queryFn: () => apiRequest<ContactList[]>('lists'),
  });

  const contactsQuery = useQuery({
    queryKey: ['contacts-options'],
    queryFn: () => apiRequest<PaginatedResponse<Contact>>('contacts?limit=100'),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      contactIds: [],
    },
  });

  const selectedContactIds = useWatch({
    control: form.control,
    name: 'contactIds',
  });

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) =>
      apiRequest<ContactList>(editingList ? `lists/${editingList.id}` : 'lists', {
        method: editingList ? 'PATCH' : 'POST',
        body: values,
      }),
    onSuccess: async (result: ContactList) => {
      toast.success(editingList ? 'Lista atualizada.' : 'Lista criada.');
      setDialogOpen(false);
      setEditingList(null);
      setSelectedListId(result.id);
      await queryClient.invalidateQueries({ queryKey: ['lists'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`lists/${id}`, { method: 'DELETE' }),
    onSuccess: async (_, id) => {
      toast.success('Lista removida.');
      if (selectedListId === id) {
        setSelectedListId(null);
      }
      await queryClient.invalidateQueries({ queryKey: ['lists'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const lists = useMemo(() => listsQuery.data ?? [], [listsQuery.data]);
  const availableContacts = useMemo(() => contactsQuery.data?.data ?? [], [contactsQuery.data]);

  const filteredLists = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return lists;
    }

    return lists.filter((list) => {
      const haystack = [
        list.name,
        list.description,
        ...list.items.map((item) => item.contact.name),
        ...list.items.map((item) => item.contact.phone),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [lists, search]);

  const selectedList = useMemo(() => {
    if (!filteredLists.length) {
      return null;
    }

    if (selectedListId) {
      return filteredLists.find((list) => list.id === selectedListId) ?? filteredLists[0] ?? null;
    }

    return filteredLists[0] ?? null;
  }, [filteredLists, selectedListId]);

  useEffect(() => {
    if (!dialogOpen) {
      return;
    }

    form.reset({
      name: editingList?.name ?? '',
      description: editingList?.description ?? '',
      contactIds: editingList?.items.map((item) => item.contact.id) ?? [],
    });
  }, [dialogOpen, editingList, form]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Listas de contatos"
        description="Monte bases reaproveitaveis para campanhas e operacoes recorrentes."
        action={
          <Button
            onClick={() => {
              setEditingList(null);
              setDialogOpen(true);
            }}
          >
            Nova lista
          </Button>
        }
      />

      <FilterBar search={search} onSearchChange={setSearch} />

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="p-0">
          <CardContent className="p-4">
            {filteredLists.length ? (
              <div className="space-y-2">
                {filteredLists.map((list) => {
                  const active = selectedList?.id === list.id;

                  return (
                    <button
                      key={list.id}
                      type="button"
                      className={cn(
                        'w-full rounded-[22px] border px-4 py-4 text-left transition',
                        active
                          ? 'border-primary/35 bg-primary-soft'
                          : 'border-transparent bg-white/[0.03] hover:border-border',
                      )}
                      onClick={() => setSelectedListId(list.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{list.name}</p>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {list.description || 'Sem descricao'}
                          </p>
                        </div>
                        <Badge variant="secondary">{list.items.length}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={ListChecks}
                title="Nenhuma lista ativa"
                description={
                  availableContacts.length
                    ? `Voce ja tem ${availableContacts.length} contato(s) cadastrado(s). Crie uma lista para agrupa-los e usar em campanhas.`
                    : 'Crie sua primeira lista para organizar contatos em campanhas e operacoes.'
                }
              />
            )}
          </CardContent>
        </Card>

        <Card className="p-0">
          <CardHeader className="p-5 pb-0">
            <CardTitle>{selectedList ? selectedList.name : 'Contatos da lista'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            {selectedList ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-border bg-white/[0.03] p-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Descrição</p>
                    <p className="mt-1 text-sm text-foreground/80">
                      {selectedList.description || 'Sem descricao'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{selectedList.items.length} contato(s)</Badge>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingList(selectedList);
                        setDialogOpen(true);
                      }}
                    >
                      Editar lista
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      }
                      title="Excluir lista"
                      description="A lista sera removida da visualizacao. Os contatos continuarao cadastrados."
                      actionLabel="Excluir"
                      onConfirm={() => deleteMutation.mutate(selectedList.id)}
                    />
                  </div>
                </div>

                {selectedList.items.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {selectedList.items.map(({ contact }) => (
                      <div
                        key={contact.id}
                        className="rounded-[22px] border border-border bg-white/[0.03] p-4"
                      >
                        <p className="font-medium">{contact.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatBrazilPhone(contact.phone)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {contact.company || 'Sem empresa'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={ListChecks}
                    title="Nenhum contato nesta lista"
                    description={
                      availableContacts.length
                        ? 'Edite a lista para selecionar os contatos que devem fazer parte dela.'
                        : 'Cadastre contatos primeiro e depois vincule-os a esta lista.'
                    }
                  />
                )}
              </>
            ) : (
              <EmptyState
                icon={ListChecks}
                title="Selecione uma lista"
                description={
                  availableContacts.length
                    ? `Existem ${availableContacts.length} contato(s) disponiveis para organizar em listas.`
                    : 'Quando voce criar uma lista, os contatos associados aparecerao aqui.'
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingList ? 'Editar lista' : 'Nova lista'}</DialogTitle>
            <DialogDescription>
              Selecione os contatos que devem compor essa base para campanhas e operacoes recorrentes.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          >
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input {...form.register('name')} />
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea {...form.register('description')} />
            </div>

            <div className="space-y-2">
              <Label>Contatos da lista</Label>
              <MultiOptionSelector
                options={availableContacts.map((contact) => ({
                  label: `${contact.name} • ${formatBrazilPhone(contact.phone)}`,
                  value: contact.id,
                }))}
                value={selectedContactIds ?? []}
                onChange={(next) =>
                  form.setValue('contactIds', next, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                emptyMessage="Nenhum contato cadastrado ainda. Crie contatos antes de montar uma lista."
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">{editingList ? 'Salvar alterações' : 'Criar lista'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
