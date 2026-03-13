'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { KanbanBoard } from '@/components/crm/kanban-board';
import { FilterBar } from '@/components/shared/filter-bar';
import { MultiOptionSelector } from '@/components/shared/multi-option-selector';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { Lead, PaginatedResponse, PipelineStage, Tag, UserSummary } from '@/lib/types';

const leadSchema = z.object({
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
  contactId: z.string().optional(),
  assignedToId: z.string().optional(),
  name: z.string().min(2),
  company: z.string().optional(),
  value: z.string().min(1),
  notes: z.string().optional(),
  tagIds: z.array(z.string()).optional(),
});

type LeadFormValues = z.infer<typeof leadSchema>;

type PipelineResponse = {
  id: string;
  name: string;
  stages: PipelineStage[];
};

type ContactOption = { id: string; name: string; company?: string | null };

export default function CrmPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const pipelineQuery = useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: () => apiRequest<PipelineResponse>('pipeline-stages'),
  });

  const leadsQuery = useQuery({
    queryKey: ['leads', search],
    queryFn: () =>
      apiRequest<PaginatedResponse<Lead>>(`leads?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiRequest<UserSummary[]>('users'),
  });

  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: () => apiRequest<Tag[]>('tags'),
  });

  const contactsQuery = useQuery({
    queryKey: ['contacts-options'],
    queryFn: () => apiRequest<PaginatedResponse<ContactOption>>('contacts?limit=100'),
  });

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
  });
  const selectedTagIds = useWatch({
    control: form.control,
    name: 'tagIds',
  });

  const leads = useMemo(() => leadsQuery.data?.data ?? [], [leadsQuery.data]);
  const stages = useMemo(() => pipelineQuery.data?.stages ?? [], [pipelineQuery.data]);
  const leadsForBoard = useMemo(
    () =>
      leads.map((lead) => ({
        ...lead,
        stage: {
          ...lead.stage,
          probability: stages.find((stage) => stage.id === lead.stage.id)?.probability ?? 0,
        },
      })),
    [leads, stages],
  );

  const moveMutation = useMutation({
    mutationFn: ({ leadId, stageId, order }: { leadId: string; stageId: string; order: number }) =>
      apiRequest(`leads/${leadId}/reorder`, {
        method: 'PATCH',
        body: { stageId, order },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  });

  const saveMutation = useMutation({
    mutationFn: (values: LeadFormValues) =>
      apiRequest(selectedLead ? `leads/${selectedLead.id}` : 'leads', {
        method: selectedLead ? 'PATCH' : 'POST',
        body: values,
      }),
    onSuccess: async () => {
      toast.success(selectedLead ? 'Lead atualizado.' : 'Lead criado.');
      setDialogOpen(false);
      setSelectedLead(null);
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const defaultStageId = stages[0]?.id ?? '';

  const formDefaults = useMemo<LeadFormValues>(
    () =>
      selectedLead
        ? {
            pipelineId: pipelineQuery.data?.id ?? '',
            stageId: selectedLead.stage.id,
            contactId: '',
            assignedToId: selectedLead.assignedTo?.id,
            name: selectedLead.name,
            company: selectedLead.company ?? '',
            value: selectedLead.value,
            notes: selectedLead.notes ?? '',
            tagIds: selectedLead.tags.map((tag) => tag.id),
          }
        : {
            pipelineId: pipelineQuery.data?.id ?? '',
            stageId: defaultStageId,
            name: '',
            company: '',
            value: '0',
            notes: '',
            tagIds: [],
          },
    [defaultStageId, pipelineQuery.data?.id, selectedLead],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Kanban"
        description="Mova leads entre etapas, acompanhe valor estimado e mantenha o pipeline organizado em tempo real."
        action={
          <Button
            onClick={() => {
              form.reset(formDefaults);
              setSelectedLead(null);
              setDialogOpen(true);
            }}
          >
            Novo lead
          </Button>
        }
      />

      <FilterBar search={search} onSearchChange={setSearch} />

      <Card className="p-0">
        <CardContent className="p-3 sm:p-4">
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1">
            {stages.map((stage) => (
              <div
                key={stage.id}
                className="min-w-[168px] rounded-[20px] border border-border bg-white/[0.03] p-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <p className="text-sm font-semibold">{stage.name}</p>
                </div>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  {leads.filter((lead) => lead.stage.id === stage.id).length} leads
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stage.probability}% de probabilidade
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <KanbanBoard
        stages={stages}
        leads={leadsForBoard}
        onMoveLead={(leadId, stageId, order) => moveMutation.mutate({ leadId, stageId, order })}
        onCardClick={(lead) => {
          const fullLead = leads.find((item) => item.id === lead.id);
          if (!fullLead) return;
          setSelectedLead(fullLead);
          form.reset({
            pipelineId: pipelineQuery.data?.id ?? '',
            stageId: fullLead.stage.id,
            contactId: '',
            assignedToId: fullLead.assignedTo?.id,
            name: fullLead.name,
            company: fullLead.company ?? '',
            value: fullLead.value,
            notes: fullLead.notes ?? '',
            tagIds: fullLead.tags.map((tag) => tag.id),
          });
          setDialogOpen(true);
        }}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{selectedLead ? 'Editar lead' : 'Novo lead'}</DialogTitle>
            <DialogDescription>Persistência real no banco com alterações refletidas no board.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit((values) =>
              saveMutation.mutate({
                ...values,
                pipelineId: pipelineQuery.data?.id ?? '',
              }),
            )}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome do lead</Label>
                <Input {...form.register('name')} />
              </div>
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Input {...form.register('company')} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Etapa</Label>
                <NativeSelect {...form.register('stageId')}>
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label>Responsavel</Label>
                <NativeSelect {...form.register('assignedToId')}>
                  <option value="">Sem responsavel</option>
                  {usersQuery.data?.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Contato vinculado</Label>
                <NativeSelect {...form.register('contactId')}>
                  <option value="">Selecionar contato</option>
                  {contactsQuery.data?.data.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label>Valor estimado</Label>
                <Input {...form.register('value')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <MultiOptionSelector
                options={(tagsQuery.data ?? []).map((tag) => ({
                  label: tag.name,
                  value: tag.id,
                  color: tag.color,
                }))}
                value={selectedTagIds ?? []}
                onChange={(next) => form.setValue('tagIds', next, { shouldDirty: true })}
                emptyMessage="Nenhuma tag cadastrada ainda."
              />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea {...form.register('notes')} />
            </div>
            <div className="flex flex-col-reverse gap-2.5 border-t border-border pt-4 sm:flex-row sm:justify-end sm:gap-3">
              <Button variant="secondary" type="button" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">{selectedLead ? 'Salvar alterações' : 'Criar lead'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
