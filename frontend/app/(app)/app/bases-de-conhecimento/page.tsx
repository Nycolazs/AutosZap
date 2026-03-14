'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpenText } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

type KnowledgeBase = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  status: string;
  documentCount?: number;
  documents?: Array<{ id: string; title: string; type: string; content: string; createdAt: string }>;
};

export default function KnowledgeBasesPage() {
  const queryClient = useQueryClient();
  const [selectedBase, setSelectedBase] = useState<KnowledgeBase | null>(null);
  const [baseDialogOpen, setBaseDialogOpen] = useState(false);
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const basesQuery = useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: () => apiRequest<KnowledgeBase[]>('knowledge-bases'),
  });
  const detailQuery = useQuery({
    queryKey: ['knowledge-base-detail', selectedBase?.id],
    enabled: Boolean(selectedBase?.id),
    queryFn: () => apiRequest<KnowledgeBase>(`knowledge-bases/${selectedBase?.id}`),
  });

  const createBaseMutation = useMutation({
    mutationFn: (payload: { name: string; description: string; type: string; status: string }) =>
      apiRequest(selectedBase ? `knowledge-bases/${selectedBase.id}` : 'knowledge-bases', {
        method: selectedBase ? 'PATCH' : 'POST',
        body: payload,
      }),
    onSuccess: async () => {
      setBaseDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
      toast.success('Base salva.');
    },
  });

  const createDocMutation = useMutation({
    mutationFn: (payload: { title: string; type: string; sourceUrl?: string; content: string }) =>
      apiRequest('knowledge-documents', {
        method: 'POST',
        body: {
          ...payload,
          knowledgeBaseId: selectedBase?.id,
          status: 'ACTIVE',
        },
      }),
    onSuccess: async () => {
      setDocDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['knowledge-base-detail', selectedBase?.id] });
      toast.success('Documento salvo.');
    },
  });

  const bases = basesQuery.data ?? [];
  const detail = detailQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bases de conhecimento"
        description="Organize conteudos textuais e URLs para alimentar assistentes e playbooks operacionais."
        action={
          <Button
            onClick={() => {
              setSelectedBase(null);
              setBaseDialogOpen(true);
            }}
          >
            Nova base
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          {bases.map((base) => (
            <Card key={base.id}>
              <CardContent className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{base.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{base.description}</p>
                  <p className="mt-2 text-xs text-primary">
                    {base.type} • {base.documentCount ?? 0} documentos
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelectedBase(base);
                  }}
                >
                  Abrir
                </Button>
              </CardContent>
            </Card>
          ))}
          {!bases.length ? (
            <Card>
              <CardContent className="flex min-h-72 flex-col items-center justify-center text-center">
                <BookOpenText className="h-10 w-10 text-primary" />
                <p className="mt-4 font-heading text-xl font-semibold">Nenhuma base cadastrada</p>
                <p className="mt-2 text-sm text-muted-foreground">Crie bases para estruturar conhecimento interno e futuras buscas semanticas.</p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="p-0">
          <CardHeader className="flex items-center justify-between gap-4 p-5">
            <div>
              <CardTitle>{detail?.name ?? 'Selecione uma base'}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {detail?.description ?? 'Ao selecionar uma base, os documentos aparecem aqui.'}
              </p>
            </div>
            {detail ? (
              <Button onClick={() => setDocDialogOpen(true)}>Novo documento</Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-0">
            {detail?.documents?.map((document) => (
              <div key={document.id} className="rounded-[24px] border border-border bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{document.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {document.type} • {formatDate(document.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await apiRequest(`knowledge-documents/${document.id}`, { method: 'DELETE' });
                        await queryClient.invalidateQueries({ queryKey: ['knowledge-base-detail', selectedBase?.id] });
                        toast.success('Documento removido.');
                      } catch (error) {
                        const message =
                          error instanceof Error
                            ? error.message
                            : 'Nao foi possivel remover o documento.';
                        toast.error(message);
                      }
                    }}
                  >
                    Remover
                  </Button>
                </div>
                <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">{document.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={baseDialogOpen} onOpenChange={setBaseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedBase ? 'Editar base' : 'Nova base'}</DialogTitle>
            <DialogDescription>Estruture conhecimento interno com status e tipo definidos.</DialogDescription>
          </DialogHeader>
          <KnowledgeBaseForm
            key={selectedBase?.id ?? 'new-base'}
            defaultValues={selectedBase}
            onSubmit={(values) => createBaseMutation.mutate(values)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo documento</DialogTitle>
            <DialogDescription>Cadastre texto ou URL para uso futuro em embeddings e assistentes.</DialogDescription>
          </DialogHeader>
          <KnowledgeDocumentForm key={selectedBase?.id ?? 'new-doc'} onSubmit={(values) => createDocMutation.mutate(values)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KnowledgeBaseForm({
  defaultValues,
  onSubmit,
}: {
  defaultValues: KnowledgeBase | null;
  onSubmit: (values: { name: string; description: string; type: string; status: string }) => void;
}) {
  const [name, setName] = useState(defaultValues?.name ?? '');
  const [description, setDescription] = useState(defaultValues?.description ?? '');
  const [type, setType] = useState(defaultValues?.type ?? 'INTERNAL');
  const [status, setStatus] = useState(defaultValues?.status ?? 'ACTIVE');

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ name, description, type, status });
      }}
    >
      <div className="space-y-2">
        <Label>Nome</Label>
        <Input value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Descrição</Label>
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <NativeSelect value={type} onChange={(event) => setType(event.target.value)}>
            <option value="INTERNAL">Internal</option>
            <option value="FAQ">FAQ</option>
            <option value="URL">URL</option>
            <option value="MIXED">Mixed</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <NativeSelect value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="ACTIVE">Ativa</option>
            <option value="DRAFT">Rascunho</option>
            <option value="INACTIVE">Inativa</option>
          </NativeSelect>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2.5 border-t border-border pt-4 sm:flex-row sm:justify-end sm:gap-3">
        <Button type="submit">Salvar</Button>
      </div>
    </form>
  );
}

function KnowledgeDocumentForm({
  onSubmit,
}: {
  onSubmit: (values: { title: string; type: string; sourceUrl?: string; content: string }) => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('TEXT');
  const [sourceUrl, setSourceUrl] = useState('');
  const [content, setContent] = useState('');

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ title, type, sourceUrl, content });
      }}
    >
      <div className="space-y-2">
        <Label>Titulo</Label>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Tipo</Label>
        <NativeSelect value={type} onChange={(event) => setType(event.target.value)}>
          <option value="TEXT">Texto</option>
          <option value="URL">URL</option>
          <option value="NOTE">Nota</option>
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label>URL fonte</Label>
        <Input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Conteudo</Label>
        <Textarea value={content} onChange={(event) => setContent(event.target.value)} />
      </div>
      <div className="flex flex-col-reverse gap-2.5 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Button type="submit">Salvar documento</Button>
      </div>
    </form>
  );
}
