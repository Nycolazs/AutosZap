'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Loader2,
  MessageSquare,
  PencilLine,
  Plus,
  Power,
  PowerOff,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { cn, formatDate } from '@/lib/utils';

type MenuNode = {
  id: string;
  menuId: string;
  parentId: string | null;
  label: string;
  message: string;
  order: number;
  createdAt: string;
  children?: MenuNode[];
};

type MenuTreeNode = Omit<MenuNode, 'children'> & {
  children: MenuTreeNode[];
};

type MenuNodeDraft = {
  id?: string;
  label: string;
  message: string;
  order: number;
  parentId?: string | null;
  children: MenuNodeDraft[];
};

type AutoResponseMenu = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  triggerKeywords: string[];
  headerText: string | null;
  footerText: string | null;
  nodes: MenuNode[];
  createdAt: string;
  updatedAt: string;
  _count?: { nodes: number };
};

type MenuDraft = {
  name: string;
  description: string;
  isActive: boolean;
  triggerKeywords: string[];
  headerText: string;
  footerText: string;
  nodes: MenuNodeDraft[];
};

function buildTree(nodes: MenuNode[]): MenuTreeNode[] {
  const map = new Map<string, MenuTreeNode>();
  const roots: MenuTreeNode[] = [];

  for (const node of nodes) {
    map.set(node.id, { ...node, children: [] });
  }

  for (const node of nodes) {
    const mapped = map.get(node.id)!;
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(mapped);
    } else {
      roots.push(mapped);
    }
  }

  roots.sort((a, b) => a.order - b.order);
  for (const node of map.values()) {
    node.children.sort((a, b) => a.order - b.order);
  }

  return roots;
}

function emptyNodeDraft(): MenuNodeDraft {
  return { label: '', message: '', order: 0, children: [] };
}

function emptyMenuDraft(): MenuDraft {
  return {
    name: '',
    description: '',
    isActive: false,
    triggerKeywords: [],
    headerText: '',
    footerText: '',
    nodes: [emptyNodeDraft()],
  };
}

function menuToEditDraft(menu: AutoResponseMenu): MenuDraft {
  const tree = buildTree(menu.nodes);

  function toNodeDraft(node: MenuTreeNode): MenuNodeDraft {
    return {
      id: node.id,
      label: node.label,
      message: node.message,
      order: node.order,
      children: (node.children ?? []).map(toNodeDraft),
    };
  }

  return {
    name: menu.name,
    description: menu.description ?? '',
    isActive: menu.isActive,
    triggerKeywords: menu.triggerKeywords,
    headerText: menu.headerText ?? '',
    footerText: menu.footerText ?? '',
    nodes: tree.map(toNodeDraft),
  };
}

function NodeEditor({
  node,
  depth,
  index,
  onChange,
  onRemove,
}: {
  node: MenuNodeDraft;
  depth: number;
  index: number;
  onChange: (node: MenuNodeDraft) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const depthColors = ['border-primary/40', 'border-emerald-400/40', 'border-amber-400/40', 'border-violet-400/40'];
  const borderColor = depthColors[Math.min(depth, depthColors.length - 1)];
  const optionNumber = index + 1;

  return (
    <div className={cn('rounded-xl border-l-2 bg-white/[0.02] p-3', borderColor)}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={cn(
            'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:text-foreground',
            !hasChildren && 'opacity-0 pointer-events-none',
          )}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
              {optionNumber}
            </span>
            <Input
              placeholder="Rótulo da opção (ex: Suporte Técnico)"
              value={node.label}
              onChange={(e) => onChange({ ...node, label: e.target.value })}
              className="h-8 flex-1 text-sm"
            />
          </div>
          <Textarea
            placeholder="Mensagem enviada ao cliente ao selecionar esta opção..."
            value={node.message}
            onChange={(e) => onChange({ ...node, message: e.target.value })}
            className="min-h-[64px] resize-none text-sm"
          />
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={() =>
              onChange({
                ...node,
                children: [...node.children, { ...emptyNodeDraft(), order: node.children.length }],
              })
            }
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/6 hover:text-primary"
            title="Adicionar sub-opção"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/6 hover:text-danger"
            title="Remover opção"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {hasChildren && expanded && (
        <div className="ml-8 mt-3 space-y-2">
          {node.children.map((child, childIndex) => (
            <NodeEditor
              key={`${depth}-${childIndex}`}
              node={child}
              depth={depth + 1}
              index={childIndex}
              onChange={(updated) => {
                const updatedChildren = [...node.children];
                updatedChildren[childIndex] = updated;
                onChange({ ...node, children: updatedChildren });
              }}
              onRemove={() => {
                onChange({ ...node, children: node.children.filter((_, i) => i !== childIndex) });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FlowPreviewNode({
  node,
  depth,
  index,
}: {
  node: MenuTreeNode;
  depth: number;
  index: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const depthBg = ['bg-primary/10', 'bg-emerald-500/10', 'bg-amber-500/10', 'bg-violet-500/10'];
  const depthText = ['text-primary', 'text-emerald-400', 'text-amber-400', 'text-violet-400'];

  return (
    <div className="relative pl-6">
      <div className="absolute left-0 top-0 h-full w-[1px] bg-border" />
      <div className="absolute left-0 top-[18px] h-[1px] w-4 bg-border" />
      <div className={cn('mb-2 rounded-xl p-3', depthBg[Math.min(depth, 3)])}>
        <div className="flex items-start gap-2">
          <span className={cn('mt-0.5 text-[11px] font-bold tabular-nums', depthText[Math.min(depth, 3)])}>
            {index + 1}.
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium leading-4">{node.label || '(sem rótulo)'}</p>
            {node.message && (
              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{node.message}</p>
            )}
          </div>
          {hasChildren && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="shrink-0 text-muted-foreground transition hover:text-foreground"
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
      {hasChildren && expanded && (
        <div className="ml-4">
          {node.children.map((child, i) => (
            <FlowPreviewNode key={child.id} node={child} depth={depth + 1} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function KeywordsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const addKeyword = () => {
    const kw = input.trim().toLowerCase();
    if (kw && !value.includes(kw)) {
      onChange([...value, kw]);
    }
    setInput('');
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="Ex: oi, olá, menu..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addKeyword();
            }
          }}
          className="flex-1"
        />
        <Button type="button" variant="secondary" size="sm" onClick={addKeyword}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((kw) => (
            <span
              key={kw}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary"
            >
              {kw}
              <button
                type="button"
                onClick={() => onChange(value.filter((k) => k !== kw))}
                className="text-primary/60 hover:text-primary"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AutoResponseMenuPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState<AutoResponseMenu | null>(null);
  const [previewMenu, setPreviewMenu] = useState<AutoResponseMenu | null>(null);
  const [draft, setDraft] = useState<MenuDraft>(emptyMenuDraft());
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');

  const menusQuery = useQuery({
    queryKey: ['auto-response-menus'],
    queryFn: () => apiRequest<AutoResponseMenu[]>('auto-response-menus'),
  });

  const saveMutation = useMutation({
    mutationFn: (d: MenuDraft) => {
      if (d.name.trim().length < 2) throw new Error('Informe ao menos 2 caracteres no nome.');

      const payload = {
        name: d.name.trim(),
        description: d.description.trim() || undefined,
        isActive: d.isActive,
        triggerKeywords: d.triggerKeywords,
        headerText: d.headerText.trim() || undefined,
        footerText: d.footerText.trim() || undefined,
        nodes: d.nodes
          .filter((n) => n.label.trim())
          .map((n, i) => ({ ...n, order: i })),
      };

      if (selectedMenu) {
        return apiRequest<AutoResponseMenu>(`auto-response-menus/${selectedMenu.id}`, {
          method: 'PATCH',
          body: payload,
        });
      }

      return apiRequest<AutoResponseMenu>('auto-response-menus', {
        method: 'POST',
        body: payload,
      });
    },
    onSuccess: async () => {
      toast.success(selectedMenu ? 'Menu atualizado.' : 'Menu criado.');
      setDialogOpen(false);
      setSelectedMenu(null);
      await queryClient.invalidateQueries({ queryKey: ['auto-response-menus'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<AutoResponseMenu>(`auto-response-menus/${id}/toggle-active`, { method: 'PATCH' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auto-response-menus'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`auto-response-menus/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Menu removido.');
      if (previewMenu) setPreviewMenu(null);
      await queryClient.invalidateQueries({ queryKey: ['auto-response-menus'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openCreate = () => {
    setSelectedMenu(null);
    setDraft(emptyMenuDraft());
    setActiveTab('editor');
    setDialogOpen(true);
  };

  const openEdit = (menu: AutoResponseMenu) => {
    setSelectedMenu(menu);
    setDraft(menuToEditDraft(menu));
    setActiveTab('editor');
    setDialogOpen(true);
  };

  const menus = menusQuery.data ?? [];

  function nodeDraftPreviewTree(nodes: MenuNodeDraft[]): MenuTreeNode[] {
    return nodes
      .filter((n) => n.label.trim())
      .map((n, i) => ({
        id: `preview-${i}`,
        menuId: 'preview',
        parentId: null,
        label: n.label,
        message: n.message,
        order: i,
        createdAt: '',
        children: nodeDraftPreviewTree(n.children),
      }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menu Interativo"
        description="Configure menus de resposta automatica com opcoes interativas para seus clientes."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo menu
          </Button>
        }
      />

      {menusQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : menus.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="Nenhum menu criado"
          description="Crie menus interativos para guiar seus clientes com opcoes automaticas."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {menus.map((menu) => (
            <Card
              key={menu.id}
              className={cn(
                'cursor-pointer p-0 transition hover:border-primary/30',
                previewMenu?.id === menu.id ? 'border-primary/50 ring-1 ring-primary/20' : '',
              )}
              onClick={() => setPreviewMenu(previewMenu?.id === menu.id ? null : menu)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-[15px]">{menu.name}</h3>
                      <Badge
                        className={cn(
                          'shrink-0 text-[10px]',
                          menu.isActive
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-border bg-white/[0.04] text-muted-foreground',
                        )}
                      >
                        {menu.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    {menu.description && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{menu.description}</p>
                    )}
                    {menu.triggerKeywords.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {menu.triggerKeywords.slice(0, 4).map((kw) => (
                          <span
                            key={kw}
                            className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {kw}
                          </span>
                        ))}
                        {menu.triggerKeywords.length > 4 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{menu.triggerKeywords.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="mt-2 text-[10px] text-muted-foreground/60">
                      {(menu._count?.nodes ?? menu.nodes.length)} opcoes · Atualizado {formatDate(menu.updatedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(menu)}
                      className="h-8 w-8 p-0"
                      title="Editar"
                    >
                      <PencilLine className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleMutation.mutate(menu.id)}
                      disabled={toggleMutation.isPending}
                      className="h-8 w-8 p-0"
                      title={menu.isActive ? 'Desativar' : 'Ativar'}
                    >
                      {menu.isActive ? (
                        <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Power className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Remover">
                          <Trash2 className="h-3.5 w-3.5 text-danger" />
                        </Button>
                      }
                      title="Remover menu"
                      description="Esta acao nao pode ser desfeita."
                      actionLabel="Remover"
                      onConfirm={() => deleteMutation.mutate(menu.id)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Flow Preview Panel */}
      {previewMenu && (
        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border p-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="h-4 w-4 text-primary" />
              Fluxo: {previewMenu.name}
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPreviewMenu(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-4">
            {previewMenu.headerText && (
              <div className="mb-4 rounded-xl border border-primary/20 bg-primary/[0.05] p-3 text-sm">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-primary/60">Mensagem inicial</p>
                <p className="text-foreground">{previewMenu.headerText}</p>
              </div>
            )}
            <div className="space-y-1">
              {buildTree(previewMenu.nodes).map((node, i) => (
                <FlowPreviewNode key={node.id} node={node} depth={0} index={i} />
              ))}
            </div>
            {previewMenu.footerText && (
              <div className="mt-4 rounded-xl border border-border bg-white/[0.03] p-3 text-sm">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Rodapé</p>
                <p className="text-muted-foreground">{previewMenu.footerText}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setSelectedMenu(null); }}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-1.5rem)] sm:w-[min(1040px,calc(100vw-1.5rem))] sm:max-w-none">
          <DialogHeader className="shrink-0 pr-10">
            <DialogTitle>{selectedMenu ? 'Editar menu' : 'Novo menu interativo'}</DialogTitle>
            <DialogDescription>
              Configure um menu automatico com opcoes que o cliente pode selecionar digitando o numero.
            </DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <div className="shrink-0 flex gap-0 rounded-xl bg-white/[0.04] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={cn(
                'flex-1 rounded-lg py-1.5 text-[13px] font-medium transition',
                activeTab === 'editor' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Editor
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={cn(
                'flex-1 rounded-lg py-1.5 text-[13px] font-medium transition',
                activeTab === 'preview' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Visualizar fluxo
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {activeTab === 'editor' ? (
              <div className="space-y-5 py-1">
                {/* Name + Active */}
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label>Nome do menu</Label>
                    <Input
                      placeholder="Ex: Menu principal"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-0.5">
                    <Switch
                      checked={draft.isActive}
                      onCheckedChange={(v) => setDraft({ ...draft, isActive: v })}
                    />
                    <Label className="text-[12px] text-muted-foreground">
                      {draft.isActive ? 'Ativo' : 'Inativo'}
                    </Label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Descricao (opcional)</Label>
                  <Input
                    placeholder="Descricao interna do menu"
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Palavras-chave de ativacao</Label>
                  <p className="text-[11px] text-muted-foreground">
                    O menu sera ativado quando o cliente enviar uma dessas palavras.
                  </p>
                  <KeywordsInput
                    value={draft.triggerKeywords}
                    onChange={(v) => setDraft({ ...draft, triggerKeywords: v })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Mensagem inicial (opcional)</Label>
                  <Textarea
                    placeholder="Ex: Ola! Como posso ajudar? Selecione uma opcao:"
                    value={draft.headerText}
                    onChange={(e) => setDraft({ ...draft, headerText: e.target.value })}
                    className="min-h-[64px] resize-none text-sm"
                  />
                </div>

                {/* Nodes */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Opcoes do menu</Label>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          nodes: [...draft.nodes, { ...emptyNodeDraft(), order: draft.nodes.length }],
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar opcao
                    </Button>
                  </div>
                  {draft.nodes.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border py-6 text-center text-[13px] text-muted-foreground">
                      Nenhuma opcao adicionada ainda.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {draft.nodes.map((node, i) => (
                        <NodeEditor
                          key={i}
                          node={node}
                          depth={0}
                          index={i}
                          onChange={(updated) => {
                            const updated_nodes = [...draft.nodes];
                            updated_nodes[i] = updated;
                            setDraft({ ...draft, nodes: updated_nodes });
                          }}
                          onRemove={() =>
                            setDraft({ ...draft, nodes: draft.nodes.filter((_, idx) => idx !== i) })
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Rodape (opcional)</Label>
                  <Textarea
                    placeholder="Ex: Para falar com um atendente, digite 0."
                    value={draft.footerText}
                    onChange={(e) => setDraft({ ...draft, footerText: e.target.value })}
                    className="min-h-[48px] resize-none text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-1">
                {draft.headerText.trim() && (
                  <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-primary/60">
                      Mensagem inicial
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{draft.headerText}</p>
                  </div>
                )}
                {draft.nodes.filter((n) => n.label.trim()).length === 0 ? (
                  <div className="py-8 text-center">
                    <MessageSquare className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">Adicione opcoes para visualizar o fluxo</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {nodeDraftPreviewTree(draft.nodes).map((node, i) => (
                      <FlowPreviewNode key={i} node={node} depth={0} index={i} />
                    ))}
                  </div>
                )}
                {draft.footerText.trim() && (
                  <div className="rounded-xl border border-border bg-white/[0.03] p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      Rodape
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{draft.footerText}</p>
                  </div>
                )}
                <div className="rounded-xl border border-border bg-white/[0.03] p-3">
                  <div className="flex items-start gap-2">
                    <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <p className="text-[11px] text-muted-foreground">
                      O cliente digita o numero da opcao (1, 2, 3...) para navegar. Sub-opcoes sao apresentadas apos a selecao do nivel anterior.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end sm:gap-3">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {selectedMenu ? 'Salvar alterações' : 'Criar menu'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
