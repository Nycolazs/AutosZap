'use client';

import { ColumnDef } from '@tanstack/react-table';
import { RadioTower } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CrudPage } from '@/components/shared/crud-page';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/api-client';
import {
  Instance,
  WhatsAppInstanceDiagnostics,
  WhatsAppTemplateSummary,
} from '@/lib/types';

const schema = z.object({
  name: z.string().min(2),
  provider: z.string().min(2),
  status: z.string().optional(),
  mode: z.string().optional(),
  phoneNumber: z.string().optional(),
  businessAccountId: z.string().optional(),
  phoneNumberId: z.string().optional(),
  accessToken: z.string().optional(),
  webhookVerifyToken: z.string().optional(),
  appSecret: z.string().optional(),
});

const columns: ColumnDef<Instance>[] = [
  { accessorKey: 'name', header: 'Instancia' },
  { accessorKey: 'provider', header: 'Provider' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'mode', header: 'Modo' },
  {
    accessorKey: 'phoneNumber',
    header: 'Numero conectado',
  },
  {
    id: 'test',
    header: 'Integracao',
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={async (event) => {
            event.stopPropagation();
            const response = await apiRequest<{ detail: string; simulated: boolean }>(
              `instances/${row.original.id}/test`,
              { method: 'POST' },
            );
            toast.success(response.simulated ? 'Teste dev executado.' : response.detail);
          }}
        >
          Testar
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={async (event) => {
            event.stopPropagation();
            const response = await apiRequest<WhatsAppInstanceDiagnostics>(
              `instances/${row.original.id}/sync`,
              { method: 'POST' },
            );
            toast.success(
              response.simulated
                ? 'Sync em modo dev.'
                : `${response.phoneNumber?.displayPhoneNumber ?? 'Numero validado'} • ${response.templates.length} templates`,
            );
          }}
        >
          Sync Meta
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={async (event) => {
            event.stopPropagation();
            const response = await apiRequest<{ detail: string; simulated: boolean }>(
              `instances/${row.original.id}/subscribe-app`,
              { method: 'POST' },
            );
            toast.success(response.simulated ? 'Subscribe simulado.' : response.detail);
          }}
        >
          Subscribe
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={async (event) => {
            event.stopPropagation();
            const templates = await apiRequest<WhatsAppTemplateSummary[]>(
              `instances/${row.original.id}/templates`,
            );
            toast.success(
              templates.length
                ? `${templates.length} templates carregados. Primeira: ${templates[0]?.name}`
                : 'Nenhum template retornado pela WABA.',
            );
          }}
        >
          Templates
        </Button>
      </div>
    ),
  },
];

export default function InstancesPage() {
  return (
    <CrudPage
      title="Instancias"
      description="Configure canais oficiais da Meta com credenciais, webhook verify token, app secret, sync da WABA e testes reais da Cloud API."
      endpoint="instances"
      queryKey="instances"
      columns={columns}
      schema={schema}
      defaultValues={{
        name: '',
        provider: 'META_WHATSAPP',
        status: 'DISCONNECTED',
        mode: 'DEV',
        phoneNumber: '',
        businessAccountId: '',
        phoneNumberId: '',
        accessToken: '',
        webhookVerifyToken: '',
        appSecret: '',
      }}
      fields={[
        { name: 'name', label: 'Nome' },
        {
          name: 'provider',
          label: 'Provider',
          type: 'select',
          options: [{ label: 'Meta WhatsApp', value: 'META_WHATSAPP' }],
        },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { label: 'Conectada', value: 'CONNECTED' },
            { label: 'Desconectada', value: 'DISCONNECTED' },
            { label: 'Sincronizando', value: 'SYNCING' },
          ],
        },
        {
          name: 'mode',
          label: 'Modo',
          type: 'select',
          options: [
            { label: 'DEV', value: 'DEV' },
            { label: 'SANDBOX', value: 'SANDBOX' },
            { label: 'PRODUCTION', value: 'PRODUCTION' },
          ],
        },
        { name: 'phoneNumber', label: 'Numero' },
        { name: 'businessAccountId', label: 'Business Account ID' },
        { name: 'phoneNumberId', label: 'Phone Number ID' },
        { name: 'accessToken', label: 'Access Token', type: 'password' },
        { name: 'webhookVerifyToken', label: 'Webhook Verify Token', type: 'password' },
        { name: 'appSecret', label: 'App Secret', type: 'password' },
      ]}
      icon={RadioTower}
      createLabel="Nova instancia"
      emptyDescription="Cadastre canais e credenciais para operar com Meta oficial ou fallback de desenvolvimento."
    />
  );
}
