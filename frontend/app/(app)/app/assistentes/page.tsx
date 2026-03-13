'use client';

import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Bot } from 'lucide-react';
import { z } from 'zod';
import { CrudPage } from '@/components/shared/crud-page';
import { apiRequest } from '@/lib/api-client';
import { Assistant } from '@/lib/types';

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  objective: z.string().optional(),
  systemPrompt: z.string().min(10),
  temperature: z.string().min(1),
  model: z.string().min(2),
  status: z.string().optional(),
  knowledgeBaseIds: z.array(z.string()).optional(),
  toolIds: z.array(z.string()).optional(),
});

const columns: ColumnDef<Assistant>[] = [
  { accessorKey: 'name', header: 'Assistente' },
  { accessorKey: 'model', header: 'Modelo' },
  { accessorKey: 'status', header: 'Status' },
  {
    id: 'rels',
    header: 'Vinculos',
    cell: ({ row }) => `${row.original.knowledgeBases.length} bases • ${row.original.tools.length} tools`,
  },
];

export default function AssistantsPage() {
  const basesQuery = useQuery({
    queryKey: ['knowledge-bases-options'],
    queryFn: () => apiRequest<Array<{ id: string; name: string }>>('knowledge-bases'),
  });

  const toolsQuery = useQuery({
    queryKey: ['ai-tools-options'],
    queryFn: () => apiRequest<Array<{ id: string; name: string }>>('ai-tools'),
  });

  return (
    <CrudPage
      title="Assistentes de IA"
      description="Gerencie prompts, conhecimento e ferramental para futuros fluxos com LLM."
      endpoint="assistants"
      queryKey="assistants"
      columns={columns}
      schema={schema}
      defaultValues={{
        name: '',
        description: '',
        objective: '',
        systemPrompt: '',
        temperature: '0.2',
        model: 'gpt-4.1-mini',
        status: 'ACTIVE',
        knowledgeBaseIds: [],
        toolIds: [],
      }}
      mapToFormValues={(assistant) => ({
        name: assistant.name,
        description: assistant.description ?? '',
        objective: assistant.objective ?? '',
        systemPrompt: assistant.systemPrompt,
        temperature: String(assistant.temperature),
        model: assistant.model,
        status: assistant.status,
        knowledgeBaseIds: assistant.knowledgeBases.map((item) => item.id),
        toolIds: assistant.tools.map((item) => item.id),
      })}
      mapToPayload={(values) => ({ ...values, temperature: Number(values.temperature) })}
      fields={[
        { name: 'name', label: 'Nome' },
        { name: 'description', label: 'Descrição', type: 'textarea' },
        { name: 'objective', label: 'Objetivo' },
        { name: 'systemPrompt', label: 'Prompt do sistema', type: 'textarea' },
        { name: 'temperature', label: 'Temperatura', type: 'number' },
        { name: 'model', label: 'Modelo' },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { label: 'Ativo', value: 'ACTIVE' },
            { label: 'Inativo', value: 'INACTIVE' },
          ],
        },
        {
          name: 'knowledgeBaseIds',
          label: 'Bases vinculadas',
          type: 'multiselect',
          options: basesQuery.data?.map((item) => ({ label: item.name, value: item.id })) ?? [],
        },
        {
          name: 'toolIds',
          label: 'Ferramentas vinculadas',
          type: 'multiselect',
          options: toolsQuery.data?.map((item) => ({ label: item.name, value: item.id })) ?? [],
        },
      ]}
      icon={Bot}
      createLabel="Novo assistente"
      emptyDescription="Crie assistentes com prompt, conhecimento e tools para evolucao futura."
    />
  );
}
