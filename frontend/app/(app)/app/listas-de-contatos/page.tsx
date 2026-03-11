'use client';

import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { ListChecks } from 'lucide-react';
import { z } from 'zod';
import { CrudPage } from '@/components/shared/crud-page';
import { apiRequest } from '@/lib/api-client';
import { Contact, PaginatedResponse } from '@/lib/types';

type ContactList = { id: string; name: string; description?: string | null; items: Array<{ contact: Contact }> };

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  contactIds: z.array(z.string()).optional(),
});

const columns: ColumnDef<ContactList>[] = [
  { accessorKey: 'name', header: 'Lista' },
  { accessorKey: 'description', header: 'Descricao' },
  {
    id: 'count',
    header: 'Contatos',
    cell: ({ row }) => row.original.items?.length ?? 0,
  },
];

export default function ContactListsPage() {
  const contactsQuery = useQuery({
    queryKey: ['contacts-options'],
    queryFn: () => apiRequest<PaginatedResponse<Contact>>('contacts?limit=100'),
  });

  return (
    <CrudPage
      title="Listas de contatos"
      description="Monte bases reaproveitaveis para campanhas e operacoes recorrentes."
      endpoint="lists"
      queryKey="lists"
      columns={columns}
      schema={schema}
      defaultValues={{ name: '', description: '', contactIds: [] }}
      fields={[
        { name: 'name', label: 'Nome' },
        { name: 'description', label: 'Descricao', type: 'textarea' },
        {
          name: 'contactIds',
          label: 'Contatos da lista',
          type: 'multiselect',
          options: contactsQuery.data?.data.map((contact) => ({ label: contact.name, value: contact.id })) ?? [],
        },
      ]}
      mapToFormValues={(list) => ({
        name: list.name,
        description: list.description ?? '',
        contactIds: list.items?.map((item) => item.contact.id) ?? [],
      })}
      icon={ListChecks}
      createLabel="Nova lista"
      emptyDescription="Crie listas para organizar importacoes, campanhas e publico alvo."
    />
  );
}
