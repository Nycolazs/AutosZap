'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { PlayCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CrudPage } from '@/components/shared/crud-page';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/api-client';
import { Campaign, Contact } from '@/lib/types';

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

type CampaignFormValues = z.infer<typeof schema>;

type CampaignRow = Campaign & {
  instanceId?: string | null;
  targetConfig?: {
    listIds?: string[];
    tagIds?: string[];
    groupIds?: string[];
    contactIds?: string[];
  } | null;
};

type NamedOption = { id: string; name: string };

const AUDIENCE_OPTIONS = [
  { label: 'Contatos', value: 'CUSTOM' },
  { label: 'Lista', value: 'LIST' },
  { label: 'Tag', value: 'TAG' },
  { label: 'Grupo', value: 'GROUP' },
];

export default function CampaignsPage() {
  const queryClient = useQueryClient();

  const listsQuery = useQuery({
    queryKey: ['lists-options'],
    queryFn: () => apiRequest<NamedOption[]>('lists'),
  });

  const tagsQuery = useQuery({
    queryKey: ['tags-options'],
    queryFn: () => apiRequest<NamedOption[]>('tags'),
  });

  const groupsQuery = useQuery({
    queryKey: ['groups-options'],
    queryFn: () => apiRequest<NamedOption[]>('groups'),
  });

  const contactsQuery = useQuery({
    queryKey: ['contacts-campaign-options'],
    queryFn: () => apiRequest<{ data: Contact[] }>('contacts?limit=100'),
  });

  const instancesQuery = useQuery({
    queryKey: ['instances-options'],
    queryFn: () => apiRequest<Array<{ id: string; name: string }>>('instances'),
  });

  const sendMutation = useMutation({
    mutationFn: (campaignId: string) =>
      apiRequest(`campaigns/${campaignId}/send`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success('Campanha enviada.');
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const columns = useMemo<ColumnDef<CampaignRow>[]>(
    () => [
      { accessorKey: 'name', header: 'Campanha' },
      {
        accessorKey: 'audienceType',
        header: 'Publico',
        cell: ({ row }) => formatAudienceType(row.original.audienceType),
      },
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
            onClick={(event) => {
              event.stopPropagation();
              sendMutation.mutate(row.original.id);
            }}
            disabled={sendMutation.isPending}
          >
            <PlayCircle className="h-4 w-4" />
            Enviar
          </Button>
        ),
      },
    ],
    [sendMutation],
  );

  const targetOptionsByAudience = useMemo(
    () => ({
      CUSTOM: (contactsQuery.data?.data ?? []).map((item) => ({
        label: item.name,
        value: item.id,
      })),
      LIST: (listsQuery.data ?? []).map((item) => ({
        label: item.name,
        value: item.id,
      })),
      TAG: (tagsQuery.data ?? []).map((item) => ({
        label: item.name,
        value: item.id,
      })),
      GROUP: (groupsQuery.data ?? []).map((item) => ({
        label: item.name,
        value: item.id,
      })),
    }),
    [contactsQuery.data, groupsQuery.data, listsQuery.data, tagsQuery.data],
  );

  return (
    <CrudPage<CampaignRow, CampaignFormValues>
      title="Disparos"
      description="Crie campanhas, selecione publico, agende envios e monitore resultados."
      endpoint="campaigns"
      queryKey="campaigns"
      columns={columns}
      schema={schema}
      defaultValues={{
        name: '',
        description: '',
        audienceType: 'CUSTOM',
        instanceId: '',
        message: '',
        scheduledAt: '',
        status: 'DRAFT',
        targetIds: [],
      }}
      mapToFormValues={(item) => ({
        name: item.name,
        description: item.description ?? '',
        audienceType: item.audienceType,
        instanceId: item.instanceId ?? '',
        message: item.message,
        scheduledAt: item.scheduledAt ?? '',
        status: item.status,
        targetIds:
          item.audienceType === 'LIST'
            ? item.targetConfig?.listIds ?? []
            : item.audienceType === 'TAG'
              ? item.targetConfig?.tagIds ?? []
              : item.audienceType === 'GROUP'
                ? item.targetConfig?.groupIds ?? []
                : item.targetConfig?.contactIds ?? [],
      })}
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
              : values.audienceType === 'GROUP'
                ? { groupIds: values.targetIds }
                : { contactIds: values.targetIds },
      })}
      fields={[
        { name: 'name', label: 'Nome' },
        { name: 'description', label: 'Descricao', type: 'textarea' },
        {
          name: 'audienceType',
          label: 'Tipo de publico',
          type: 'select',
          options: AUDIENCE_OPTIONS,
        },
        {
          name: 'targetIds',
          label: 'Publico alvo',
          type: 'multiselect',
          options: (values) =>
            targetOptionsByAudience[
              (values.audienceType as keyof typeof targetOptionsByAudience) ?? 'CUSTOM'
            ] ?? [],
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

function formatAudienceType(value: string) {
  if (value === 'CUSTOM') return 'CONTATOS';
  if (value === 'LIST') return 'LISTA';
  if (value === 'TAG') return 'TAG';
  if (value === 'GROUP') return 'GRUPO';
  return value;
}
