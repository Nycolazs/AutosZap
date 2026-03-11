'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/api-client';
import { PipelineStage } from '@/lib/types';
import { Workflow } from 'lucide-react';

type PipelineResponse = {
  id: string;
  name: string;
  stages: PipelineStage[];
};

const schema = z.object({
  pipelineId: z.string().min(1),
  name: z.string().min(2),
  color: z.string().min(4),
  order: z.string().min(1),
  probability: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const [selectedStage, setSelectedStage] = useState<PipelineStage | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pipelineQuery = useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: () => apiRequest<PipelineResponse>('pipeline-stages'),
  });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) =>
      apiRequest(selectedStage ? `pipeline-stages/${selectedStage.id}` : 'pipeline-stages', {
        method: selectedStage ? 'PATCH' : 'POST',
        body: {
          ...values,
          order: Number(values.order),
          probability: Number(values.probability),
        },
      }),
    onSuccess: async () => {
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
      toast.success('Etapa salva.');
    },
  });

  const stages = pipelineQuery.data?.stages ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        description="Configure as etapas do funil comercial com ordem, cor e probabilidade."
        action={
          <Button
            onClick={() => {
              setSelectedStage(null);
              form.reset({
                pipelineId: pipelineQuery.data?.id ?? '',
                name: '',
                color: '#3297ff',
                order: String(stages.length + 1),
                probability: '10',
              });
              setDialogOpen(true);
            }}
          >
            Nova etapa
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stages.map((stage) => (
          <Card key={stage.id}>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
                  <div>
                    <p className="font-medium">{stage.name}</p>
                    <p className="text-xs text-muted-foreground">Ordem #{stage.order}</p>
                  </div>
                </div>
                <span className="text-sm text-primary">{stage.probability}%</span>
              </div>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setSelectedStage(stage);
                  form.reset({
                    pipelineId: pipelineQuery.data?.id ?? '',
                    name: stage.name,
                    color: stage.color,
                    order: String(stage.order),
                    probability: String(stage.probability),
                  });
                  setDialogOpen(true);
                }}
              >
                Editar etapa
              </Button>
            </CardContent>
          </Card>
        ))}
        {!stages.length ? (
          <Card>
            <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
              <Workflow className="h-10 w-10 text-primary" />
              <p className="mt-4 font-heading text-xl font-semibold">Nenhuma etapa configurada</p>
              <p className="mt-2 text-sm text-muted-foreground">Crie as colunas que estruturam seu processo comercial.</p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedStage ? 'Editar etapa' : 'Nova etapa'}</DialogTitle>
            <DialogDescription>Persistencia real da configuracao do pipeline.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
            <input type="hidden" {...form.register('pipelineId')} value={pipelineQuery.data?.id ?? ''} />
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input {...form.register('name')} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Cor</Label>
                <Input type="color" {...form.register('color')} />
              </div>
              <div className="space-y-2">
                <Label>Ordem</Label>
                <Input type="number" {...form.register('order')} />
              </div>
              <div className="space-y-2">
                <Label>Probabilidade</Label>
                <Input type="number" {...form.register('probability')} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
