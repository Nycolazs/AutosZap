'use client';

import { ColumnDef } from '@tanstack/react-table';
import { UsersRound } from 'lucide-react';
import { z } from 'zod';
import { CrudPage } from '@/components/shared/crud-page';

type TeamMember = {
  id: string;
  name: string;
  email: string;
  title?: string | null;
  role: string;
  status: string;
};

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  title: z.string().optional(),
  role: z.string().min(1),
  status: z.string().optional(),
});

const columns: ColumnDef<TeamMember>[] = [
  { accessorKey: 'name', header: 'Nome' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'title', header: 'Cargo' },
  { accessorKey: 'role', header: 'Perfil' },
  { accessorKey: 'status', header: 'Status' },
];

export default function TeamPage() {
  return (
    <CrudPage
      title="Equipe"
      description="Gerencie pessoas, cargos e convites pendentes na workspace."
      endpoint="team"
      queryKey="team"
      columns={columns}
      schema={schema}
      defaultValues={{ name: '', email: '', title: '', role: 'AGENT', status: 'PENDING' }}
      fields={[
        { name: 'name', label: 'Nome' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'title', label: 'Cargo' },
        {
          name: 'role',
          label: 'Perfil',
          type: 'select',
          options: [
            { label: 'Admin', value: 'ADMIN' },
            { label: 'Manager', value: 'MANAGER' },
            { label: 'Agent', value: 'AGENT' },
          ],
        },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { label: 'Pendente', value: 'PENDING' },
            { label: 'Ativo', value: 'ACTIVE' },
            { label: 'Inativo', value: 'INACTIVE' },
          ],
        },
      ]}
      icon={UsersRound}
      createLabel="Convidar membro"
      emptyDescription="Convide membros para operar a inbox, CRM e campanhas em equipe."
    />
  );
}
