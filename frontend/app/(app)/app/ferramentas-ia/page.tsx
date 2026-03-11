'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Wrench } from 'lucide-react';
import { z } from 'zod';
import { CrudPage } from '@/components/shared/crud-page';

type AiTool = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  endpoint?: string | null;
  action?: string | null;
  status: string;
};

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  type: z.string().min(2),
  endpoint: z.string().optional(),
  action: z.string().optional(),
  status: z.string().optional(),
});

const columns: ColumnDef<AiTool>[] = [
  { accessorKey: 'name', header: 'Ferramenta' },
  { accessorKey: 'type', header: 'Tipo' },
  { accessorKey: 'endpoint', header: 'Endpoint' },
  { accessorKey: 'status', header: 'Status' },
];

export default function AiToolsPage() {
  return (
    <CrudPage
      title="Ferramentas de IA"
      description="Cadastre actions internas ou endpoints externos para uso futuro pelos assistentes."
      endpoint="ai-tools"
      queryKey="ai-tools"
      columns={columns}
      schema={schema}
      defaultValues={{ name: '', description: '', type: 'internal', endpoint: '', action: '', status: 'ACTIVE' }}
      fields={[
        { name: 'name', label: 'Nome' },
        { name: 'description', label: 'Descricao', type: 'textarea' },
        { name: 'type', label: 'Tipo' },
        { name: 'endpoint', label: 'Endpoint' },
        { name: 'action', label: 'Action' },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { label: 'Ativa', value: 'ACTIVE' },
            { label: 'Rascunho', value: 'DRAFT' },
            { label: 'Inativa', value: 'INACTIVE' },
          ],
        },
      ]}
      icon={Wrench}
      createLabel="Nova ferramenta"
      emptyDescription="Crie ferramentas para futuras integrações entre assistentes e seu stack."
    />
  );
}
