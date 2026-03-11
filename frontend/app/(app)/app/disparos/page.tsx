'use client';

import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { PlayCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CrudPage } from '@/components/shared/crud-page';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/api-client';
import { Campaign } from '@/lib/types';

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  audienceType: z.string().min(2),
  instanceId: z.string().optional(),
  message: z.string().min(10),
  scheduledAt: z.string().optional(),
  status: z.string().optional(),
  targetIds: z.array(z.string()).optional(),
});

const columns: ColumnDef<Campaign>[] = [
  { accessorKey: 'name', header: 'Campanha' },
  { accessorKey: 'audienceType', header: 'Publico' },
  { accessorKey: 'status', header: 'Status' },
  {
    id: 'metrics',
    header: 'Resultado',
    cell: ({ row }) => `${row.original.sentCount}/${row.original.recipientCount}`,
  },
  {
    id: 'send',
    header: 'Executar',
    cell: ({ row }) => (
      <Button
        variant="secondary"
        size="sm"
        onClick={async (event) => {
          event.stopPropagation();
          await apiRequest(`campaigns/${row.original.id}/send`, { method: 'POST' });
          toast.success('Campanha enviada.');
        }}
      >
        <PlayCircle className="h-4 w-4" />
        Enviar
      </Button>
    ),
  },
];

export default function CampaignsPage() {
  const listsQuery = useQuery({
    queryKey: ['lists-options'],
    queryFn: () => apiRequest<Array<{ id: string; name: string }>>('lists'),
  });
  const tagsQuery = useQuery({
    queryKey: ['tags-options'],
    queryFn: () => apiRequest<Array<{ id: string; name: string }>>('tags'),
  });
  const groupsQuery = useQuery({
    queryKey: ['groups-options'],
    queryFn: () => apiRequest<Array<{ id: string; name: string }>>('groups'),
  });
  const instancesQuery = useQuery({
    queryKey: ['instances-options'],
    queryFn: () => apiRequest<Array<{ id: string; name: string }>>('instances'),
  });

  return (
    <CrudPage
      title="Disparos"
      description="Crie campanhas, selecione publico, agende envios e monitore resultados."
      endpoint="campaigns"
      queryKey="campaigns"
      columns={columns}
      schema={schema}
      defaultValues={{
        name: '',
        description: '',
        audienceType: 'LIST',
        instanceId: '',
        message: '',
        scheduledAt: '',
        status: 'DRAFT',
        targetIds: [],
      }}
      mapToPayload={(values) => ({
        name: values.name,
        description: values.description,
        audienceType: values.audienceType,
        instanceId: values.instanceId,
        message: values.message,
        scheduledAt: values.scheduledAt,
        status: values.status,
        targetConfig:
          values.audienceType === 'LIST'
            ? { listIds: values.targetIds }
            : values.audienceType === 'TAG'
              ? { tagIds: values.targetIds }
              : { groupIds: values.targetIds },
      })}
      fields={[
        { name: 'name', label: 'Nome' },
        { name: 'description', label: 'Descricao', type: 'textarea' },
        {
          name: 'audienceType',
          label: 'Tipo de publico',
          type: 'select',
          options: [
            { label: 'Lista', value: 'LIST' },
            { label: 'Tag', value: 'TAG' },
            { label: 'Grupo', value: 'GROUP' },
          ],
        },
        {
          name: 'targetIds',
          label: 'Publico alvo',
          type: 'multiselect',
          options: [
            ...(listsQuery.data ?? []).map((item) => ({ label: `Lista • ${item.name}`, value: item.id })),
            ...(tagsQuery.data ?? []).map((item) => ({ label: `Tag • ${item.name}`, value: item.id })),
            ...(groupsQuery.data ?? []).map((item) => ({ label: `Grupo • ${item.name}`, value: item.id })),
          ],
        },
        {
          name: 'instanceId',
          label: 'Instancia',
          type: 'select',
          options: instancesQuery.data?.map((item) => ({ label: item.name, value: item.id })) ?? [],
        },
        { name: 'message', label: 'Mensagem', type: 'textarea' },
        { name: 'scheduledAt', label: 'Agendamento (ISO)' },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { label: 'Rascunho', value: 'DRAFT' },
            { label: 'Agendada', value: 'SCHEDULED' },
            { label: 'Enviada', value: 'SENT' },
          ],
        },
      ]}
      icon={Send}
      createLabel="Nova campanha"
      emptyDescription="Monte um publico, defina a mensagem e dispare usando a estrutura pronta para Meta."
    />
  );
}
