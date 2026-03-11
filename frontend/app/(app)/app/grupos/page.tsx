'use client';

import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Users } from 'lucide-react';
import { z } from 'zod';
import { CrudPage } from '@/components/shared/crud-page';
import { apiRequest } from '@/lib/api-client';
import { Contact, PaginatedResponse } from '@/lib/types';

type Group = { id: string; name: string; description?: string | null; members: Array<{ contact: Contact }> };

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  contactIds: z.array(z.string()).optional(),
});

const columns: ColumnDef<Group>[] = [
  { accessorKey: 'name', header: 'Grupo' },
  { accessorKey: 'description', header: 'Descricao' },
  {
    id: 'count',
    header: 'Contatos',
    cell: ({ row }) => row.original.members?.length ?? 0,
  },
];

export default function GroupsPage() {
  const contactsQuery = useQuery({
    queryKey: ['contacts-options'],
    queryFn: () => apiRequest<PaginatedResponse<Contact>>('contacts?limit=100'),
  });

  return (
    <CrudPage
      title="Grupos"
      description="Agrupe contatos por contexto comercial, evento ou operacao."
      endpoint="groups"
      queryKey="groups"
      columns={columns}
      schema={schema}
      defaultValues={{ name: '', description: '', contactIds: [] }}
      fields={[
        { name: 'name', label: 'Nome' },
        { name: 'description', label: 'Descricao', type: 'textarea' },
        {
          name: 'contactIds',
          label: 'Contatos vinculados',
          type: 'multiselect',
          options: contactsQuery.data?.data.map((contact) => ({ label: contact.name, value: contact.id })) ?? [],
        },
      ]}
      mapToFormValues={(group) => ({
        name: group.name,
        description: group.description ?? '',
        contactIds: group.members?.map((member) => member.contact.id) ?? [],
      })}
      icon={Users}
      createLabel="Novo grupo"
      emptyDescription="Crie grupos para usar em campanhas ou segmentacoes operacionais."
    />
  );
}
