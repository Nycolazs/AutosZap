'use client';

import { useState, useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  GitBranch,
  Headset,
  Loader2,
  Plus,
  Power,
  PowerOff,
  Save,
  Search,
  Trash2,
  Undo2,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { apiRequest } from '@/lib/api-client';
import { cn, formatDate } from '@/lib/utils';
import { FlowCanvas } from './_components/flow-canvas';
import { EditPanel } from './_components/edit-panel';
import {
  type AutoResponseMenu,
  type MenuDraft,
  type MenuNodeDraft,
  type NodeType,
  emptyMenuDraft,
  emptyNodeDraft,
  menuToEditDraft,
  draftToPayload,
  hasValidationErrors,
  addChildToNode,
  updateNodeInTree,
  removeNodeFromTree,
  findNodeInTree,
  countAllNodes,
} from './_lib/types';

export default function MenuInterativoPage() {
  const queryClient = useQueryClient();

  // --- Data fetching ---
  const menusQuery = useQuery({
    queryKey: ['auto-response-menus'],
    queryFn: () => apiRequest<AutoResponseMenu[]>('auto-response-menus'),
  });

  const menus = menusQuery.data ?? [];

  // --- Local state ---
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MenuDraft | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // --- Computed ---
  const selectedMenu = useMemo(
    () => menus.find((m) => m.id === selectedMenuId) ?? null,
    [menus, selectedMenuId],
  );

  const anyActive = menus.some((m) => m.isActive);

  const filteredMenus = useMemo(() => {
    if (!searchQuery.trim()) return menus;
    const q = searchQuery.toLowerCase();
    return menus.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.triggerKeywords.some((kw) => kw.includes(q)),
    );
  }, [menus, searchQuery]);

  // --- Mutations ---
  const saveMutation = useMutation({
    mutationFn: (d: MenuDraft) => {
      const error = hasValidationErrors(d);
      if (error) throw new Error(error);

      const payload = draftToPayload(d);

      if (selectedMenuId && !isCreating) {
        return apiRequest<AutoResponseMenu>(`auto-response-menus/${selectedMenuId}`, {
          method: 'PATCH',
          body: payload,
        });
      }

      return apiRequest<AutoResponseMenu>('auto-response-menus', {
        method: 'POST',
        body: payload,
      });
    },
    onSuccess: async (menu) => {
      toast.success(isCreating ? 'Menu criado com sucesso!' : 'Menu salvo com sucesso!');
      setIsDirty(false);
      setIsCreating(false);
      if (menu) {
        setSelectedMenuId(menu.id);
        setDraft(menuToEditDraft(menu));
      }
      await queryClient.invalidateQueries({ queryKey: ['auto-response-menus'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`auto-response-menus/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Menu removido.');
      setSelectedMenuId(null);
      setDraft(null);
      setSelectedNodeId(null);
      setIsDirty(false);
      setIsCreating(false);
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

  const globalToggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest('auto-response-menus/global-toggle', {
        method: 'PATCH',
        body: { enabled },
      }),
    onSuccess: async (_, enabled) => {
      toast.success(enabled ? 'Todos os menus ativados.' : 'Todos os menus desativados.');
      await queryClient.invalidateQueries({ queryKey: ['auto-response-menus'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (menu: AutoResponseMenu) => {
      const d = menuToEditDraft(menu);
      const payload = draftToPayload({
        ...d,
        name: `${d.name} (cópia)`,
        isActive: false,
      });
      return apiRequest<AutoResponseMenu>('auto-response-menus', {
        method: 'POST',
        body: payload,
      });
    },
    onSuccess: async (menu) => {
      toast.success('Menu duplicado.');
      if (menu) {
        setSelectedMenuId(menu.id);
        setDraft(menuToEditDraft(menu));
        setIsCreating(false);
        setIsDirty(false);
      }
      await queryClient.invalidateQueries({ queryKey: ['auto-response-menus'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Actions ---
  const handleSelectMenu = useCallback(
    (menu: AutoResponseMenu) => {
      if (isDirty) {
        const confirm = window.confirm('Você tem alterações não salvas. Deseja descartar?');
        if (!confirm) return;
      }
      setSelectedMenuId(menu.id);
      setDraft(menuToEditDraft(menu));
      setSelectedNodeId(null);
      setIsDirty(false);
      setIsCreating(false);
    },
    [isDirty],
  );

  const handleCreateMenu = useCallback(() => {
    if (isDirty) {
      const confirm = window.confirm('Você tem alterações não salvas. Deseja descartar?');
      if (!confirm) return;
    }
    setSelectedMenuId(null);
    setDraft(emptyMenuDraft());
    setSelectedNodeId('__start__');
    setIsDirty(true);
    setIsCreating(true);
  }, [isDirty]);

  const handleCancel = useCallback(() => {
    if (isCreating) {
      setDraft(null);
      setSelectedMenuId(null);
    } else if (selectedMenu) {
      setDraft(menuToEditDraft(selectedMenu));
    }
    setSelectedNodeId(null);
    setIsDirty(false);
    setIsCreating(false);
  }, [isCreating, selectedMenu]);

  // --- Draft mutations ---
  const updateDraft = useCallback(
    (updates: Partial<MenuDraft>) => {
      if (!draft) return;
      setDraft({ ...draft, ...updates });
      setIsDirty(true);
    },
    [draft],
  );

  const updateNode = useCallback(
    (id: string, updates: Partial<MenuNodeDraft>) => {
      if (!draft) return;
      setDraft({ ...draft, nodes: updateNodeInTree(draft.nodes, id, updates) });
      setIsDirty(true);
    },
    [draft],
  );

  const deleteNode = useCallback(
    (id: string) => {
      if (!draft) return;
      setDraft({ ...draft, nodes: removeNodeFromTree(draft.nodes, id) });
      setIsDirty(true);
      if (selectedNodeId === id) setSelectedNodeId(null);
    },
    [draft, selectedNodeId],
  );

  const addNode = useCallback(
    (parentId: string | null) => {
      if (!draft) return;
      const newNode = emptyNodeDraft('message');
      setDraft({ ...draft, nodes: addChildToNode(draft.nodes, parentId, newNode) });
      setIsDirty(true);
      setSelectedNodeId(newNode._tempId);
    },
    [draft],
  );

  const addAgentNode = useCallback(
    (parentId: string | null) => {
      if (!draft) return;
      const agentNode = emptyNodeDraft('talk_to_agent');
      agentNode.label = 'Falar com atendente';
      setDraft({ ...draft, nodes: addChildToNode(draft.nodes, parentId, agentNode) });
      setIsDirty(true);
      setSelectedNodeId(agentNode._tempId);
    },
    [draft],
  );

  const moveNode = useCallback(
    (id: string, direction: 'up' | 'down') => {
      if (!draft) return;

      function moveInList(nodes: MenuNodeDraft[]): MenuNodeDraft[] {
        const idx = nodes.findIndex((n) => n._tempId === id);
        if (idx !== -1) {
          const newIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (newIdx < 0 || newIdx >= nodes.length) return nodes;
          const newNodes = [...nodes];
          [newNodes[idx], newNodes[newIdx]] = [newNodes[newIdx], newNodes[idx]];
          return newNodes.map((n, i) => ({ ...n, order: i }));
        }
        return nodes.map((n) => ({ ...n, children: moveInList(n.children) }));
      }

      setDraft({ ...draft, nodes: moveInList(draft.nodes) });
      setIsDirty(true);
    },
    [draft],
  );

  // --- Render ---
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col gap-3">
      {/* Top bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">Menu Interativo</h1>
          </div>

          {menus.length > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5">
              <div
                className={cn(
                  'h-2 w-2 rounded-full',
                  anyActive ? 'bg-emerald-400' : 'bg-muted-foreground/30',
                )}
              />
              <span className="text-xs text-muted-foreground">
                {anyActive ? 'Funcionalidade ativa' : 'Funcionalidade inativa'}
              </span>
              <Switch
                checked={anyActive}
                onCheckedChange={(v) => globalToggleMutation.mutate(v)}
                disabled={globalToggleMutation.isPending || menus.length === 0}
                className="scale-75"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isDirty && draft && (
            <>
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                Descartar
              </Button>
              <Button
                size="sm"
                onClick={() => saveMutation.mutate(draft)}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                {isCreating ? 'Criar menu' : 'Salvar'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
        {/* Left sidebar - Menu list */}
        <div className="flex w-64 shrink-0 flex-col border-r border-border bg-background">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {menusQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredMenus.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-muted-foreground">
                  {menus.length === 0 ? 'Nenhum menu criado' : 'Nenhum resultado'}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredMenus.map((menu) => {
                  const isSelected = selectedMenuId === menu.id && !isCreating;

                  return (
                    <button
                      key={menu.id}
                      type="button"
                      onClick={() => handleSelectMenu(menu)}
                      className={cn(
                        'group flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left transition',
                        isSelected
                          ? 'bg-primary/10 text-foreground'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                      )}
                    >
                      <div
                        className={cn(
                          'mt-0.5 h-2 w-2 shrink-0 rounded-full',
                          menu.isActive ? 'bg-emerald-400' : 'bg-muted-foreground/30',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{menu.name}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {menu._count?.nodes ?? menu.nodes.length} opções
                        </p>
                      </div>
                      <div
                        className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => toggleMutation.mutate(menu.id)}
                          className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-background"
                          title={menu.isActive ? 'Desativar' : 'Ativar'}
                        >
                          {menu.isActive ? (
                            <PowerOff className="h-3 w-3" />
                          ) : (
                            <Power className="h-3 w-3 text-emerald-400" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateMutation.mutate(menu)}
                          className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-background"
                          title="Duplicar"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom actions */}
          <div className="border-t border-border p-3 space-y-2">
            <Button size="sm" className="w-full" onClick={handleCreateMenu}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Novo menu
            </Button>
            {draft && (
              <Button
                size="sm"
                variant="secondary"
                className="w-full text-amber-400 border-amber-400/30 hover:bg-amber-500/10 hover:text-amber-400"
                onClick={() =>
                  addAgentNode(
                    selectedNodeId && selectedNodeId !== '__start__'
                      ? selectedNodeId
                      : null,
                  )
                }
              >
                <Headset className="mr-1.5 h-3.5 w-3.5" />
                Falar com atendente
              </Button>
            )}
          </div>
        </div>

        {/* Center - Flow canvas */}
        <div className="relative flex-1 bg-muted/20">
          {draft ? (
            <>
              <FlowCanvas
                draft={draft}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                onAddNode={addNode}
              />

              {/* Floating toolbar */}
              <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-border bg-background/95 px-3 py-1.5 shadow-lg backdrop-blur-sm">
                  <Badge
                    className={cn(
                      'text-[10px]',
                      draft.isActive
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-border bg-muted/50 text-muted-foreground',
                    )}
                  >
                    {draft.isActive ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <span className="text-sm font-medium">{draft.name || 'Novo menu'}</span>
                  {isDirty && (
                    <span className="h-2 w-2 rounded-full bg-amber-400" title="Alterações não salvas" />
                  )}
                </div>

                {selectedMenuId && !isCreating && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm" className="h-8 w-8 rounded-xl border border-border bg-background/95 p-0 shadow-lg backdrop-blur-sm">
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    }
                    title="Remover menu"
                    description={`O menu "${selectedMenu?.name}" será removido permanentemente. Esta ação não pode ser desfeita.`}
                    actionLabel="Remover"
                    onConfirm={() => {
                      if (selectedMenuId) deleteMutation.mutate(selectedMenuId);
                    }}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <GitBranch className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <h2 className="text-base font-semibold">
                  {menus.length === 0
                    ? 'Crie seu primeiro menu interativo'
                    : 'Selecione um menu para editar'}
                </h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {menus.length === 0
                    ? 'Monte fluxos de atendimento automatizado com opções clicáveis para seus clientes no WhatsApp.'
                    : 'Escolha um menu na lista ao lado ou crie um novo para começar a editar.'}
                </p>
              </div>
              {menus.length === 0 && (
                <Button onClick={handleCreateMenu}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Criar menu
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar - Edit panel */}
        {draft && selectedNodeId && (
          <div className="w-80 shrink-0 border-l border-border bg-background">
            <EditPanel
              draft={draft}
              selectedNodeId={selectedNodeId}
              onUpdateDraft={updateDraft}
              onUpdateNode={updateNode}
              onDeleteNode={deleteNode}
              onAddChild={addNode}
              onMoveNode={moveNode}
              onClose={() => setSelectedNodeId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
