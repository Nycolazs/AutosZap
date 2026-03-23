'use client';

import {
  FolderTree,
  Headset,
  MessageSquareText,
  Trash2,
  Plus,
  X,
  GripVertical,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { KeywordsInput } from './keywords-input';
import type { MenuDraft, MenuNodeDraft, NodeType } from '../_lib/types';
import { emptyNodeDraft, findNodeInTree } from '../_lib/types';

// ----- Node type selector -----

const NODE_TYPES: { value: NodeType; label: string; icon: typeof MessageSquareText; color: string; desc: string }[] = [
  {
    value: 'message',
    label: 'Mensagem',
    icon: MessageSquareText,
    color: 'text-blue-400 bg-blue-500/10 border-blue-400/30',
    desc: 'Envia uma mensagem ao cliente',
  },
  {
    value: 'submenu',
    label: 'Submenu',
    icon: FolderTree,
    color: 'text-violet-400 bg-violet-500/10 border-violet-400/30',
    desc: 'Abre um novo nível de opções',
  },
  {
    value: 'talk_to_agent',
    label: 'Atendente',
    icon: Headset,
    color: 'text-amber-400 bg-amber-500/10 border-amber-400/30',
    desc: 'Transfere para um atendente humano',
  },
];

// ----- Menu settings panel (when start node is selected) -----

function MenuSettingsPanel({
  draft,
  onUpdateDraft,
}: {
  draft: MenuDraft;
  onUpdateDraft: (updates: Partial<MenuDraft>) => void;
}) {
  return (
    <div className="space-y-5 p-4">
      <div>
        <h3 className="text-sm font-semibold">Configurações do menu</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Defina as propriedades gerais deste menu interativo.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Nome do menu</Label>
        <Input
          placeholder="Ex: Menu principal"
          value={draft.name}
          onChange={(e) => onUpdateDraft({ name: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Descrição interna (opcional)</Label>
        <Input
          placeholder="Descrição para organização interna"
          value={draft.description}
          onChange={(e) => onUpdateDraft({ description: e.target.value })}
        />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border p-3">
        <div>
          <p className="text-xs font-medium">Menu ativo</p>
          <p className="text-[10px] text-muted-foreground">
            {draft.isActive ? 'Respondendo automaticamente' : 'Pausado, não responde'}
          </p>
        </div>
        <Switch
          checked={draft.isActive}
          onCheckedChange={(v) => onUpdateDraft({ isActive: v })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Palavras-chave de ativação</Label>
        <p className="text-[10px] text-muted-foreground">
          O menu será ativado quando o cliente enviar uma dessas palavras.
        </p>
        <KeywordsInput
          value={draft.triggerKeywords}
          onChange={(v) => onUpdateDraft({ triggerKeywords: v })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Mensagem inicial (opcional)</Label>
        <Textarea
          placeholder="Ex: Olá! Como posso ajudar? Selecione uma opção:"
          value={draft.headerText}
          onChange={(e) => onUpdateDraft({ headerText: e.target.value })}
          className="min-h-[72px] resize-none text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Rodapé (opcional)</Label>
        <Textarea
          placeholder="Ex: Para falar com um atendente, digite 0."
          value={draft.footerText}
          onChange={(e) => onUpdateDraft({ footerText: e.target.value })}
          className="min-h-[48px] resize-none text-sm"
        />
      </div>
    </div>
  );
}

// ----- Node editor panel (when an option node is selected) -----

function NodeEditorPanel({
  node,
  draft,
  onUpdateNode,
  onDeleteNode,
  onAddChild,
  onMoveNode,
}: {
  node: MenuNodeDraft;
  draft: MenuDraft;
  onUpdateNode: (id: string, updates: Partial<MenuNodeDraft>) => void;
  onDeleteNode: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onMoveNode: (id: string, direction: 'up' | 'down') => void;
}) {
  const hasChildren = node.children.length > 0;
  const currentType = hasChildren && node.type !== 'talk_to_agent' ? 'submenu' : node.type;

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">Editar opção</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Configure o comportamento desta opção do menu.
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            title="Mover para cima"
            onClick={() => onMoveNode(node._tempId, 'up')}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            title="Mover para baixo"
            onClick={() => onMoveNode(node._tempId, 'down')}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Rótulo da opção</Label>
        <Input
          placeholder="Ex: Suporte Técnico"
          value={node.label}
          onChange={(e) => onUpdateNode(node._tempId, { label: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Tipo da ação</Label>
        <div className="grid gap-2">
          {NODE_TYPES.map((t) => {
            const Icon = t.icon;
            const isSelected = currentType === t.value;
            const isDisabled = t.value !== 'submenu' && hasChildren;

            return (
              <button
                key={t.value}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) return;
                  onUpdateNode(node._tempId, { type: t.value });
                }}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3 text-left transition',
                  isSelected
                    ? t.color + ' border-current/30'
                    : 'border-border hover:border-muted-foreground/30',
                  isDisabled && 'cursor-not-allowed opacity-40',
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    isSelected ? t.color : 'bg-muted/50',
                  )}
                >
                  <Icon className={cn('h-4 w-4', isSelected ? '' : 'text-muted-foreground')} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {currentType === 'message' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Mensagem de resposta</Label>
          <Textarea
            placeholder="Mensagem enviada ao cliente ao selecionar esta opção..."
            value={node.message}
            onChange={(e) => onUpdateNode(node._tempId, { message: e.target.value })}
            className="min-h-[96px] resize-none text-sm"
          />
        </div>
      )}

      {currentType === 'talk_to_agent' && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-3">
          <div className="flex items-start gap-2">
            <Headset className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <p className="text-xs font-medium text-amber-400">Falar com atendente</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Ao selecionar esta opção, o cliente será direcionado para um atendente humano
                disponível na fila de atendimento.
              </p>
            </div>
          </div>
        </div>
      )}

      {currentType === 'submenu' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Sub-opções ({node.children.length})</Label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onAddChild(node._tempId)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Adicionar
            </Button>
          </div>
          {node.children.length > 0 && (
            <div className="space-y-1.5">
              {node.children.map((child, i) => (
                <div
                  key={child._tempId}
                  className="flex items-center gap-2 rounded-lg border border-border p-2"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-muted-foreground bg-muted/50">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {child.label || <span className="italic text-muted-foreground">Sem rótulo</span>}
                  </span>
                  <NodeTypeBadge type={child.type} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-red-400 hover:bg-red-500/10 hover:text-red-400"
          onClick={() => onDeleteNode(node._tempId)}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Remover opção
        </Button>
      </div>
    </div>
  );
}

function NodeTypeBadge({ type }: { type: NodeType }) {
  const cfg = {
    message: { icon: MessageSquareText, color: 'text-blue-400', label: 'Msg' },
    submenu: { icon: FolderTree, color: 'text-violet-400', label: 'Sub' },
    talk_to_agent: { icon: Headset, color: 'text-amber-400', label: 'Agente' },
  };
  const c = cfg[type] || cfg.message;
  const Icon = c.icon;

  return (
    <div className={cn('flex items-center gap-0.5', c.color)}>
      <Icon className="h-3 w-3" />
      <span className="text-[10px]">{c.label}</span>
    </div>
  );
}

// ----- Main EditPanel -----

export function EditPanel({
  draft,
  selectedNodeId,
  onUpdateDraft,
  onUpdateNode,
  onDeleteNode,
  onAddChild,
  onMoveNode,
  onClose,
}: {
  draft: MenuDraft;
  selectedNodeId: string;
  onUpdateDraft: (updates: Partial<MenuDraft>) => void;
  onUpdateNode: (id: string, updates: Partial<MenuNodeDraft>) => void;
  onDeleteNode: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onMoveNode: (id: string, direction: 'up' | 'down') => void;
  onClose: () => void;
}) {
  const isStartNode = selectedNodeId === '__start__';
  const selectedNode = isStartNode ? null : findNodeInTree(draft.nodes, selectedNodeId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isStartNode ? 'Menu' : 'Opção'}
        </h2>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isStartNode ? (
          <MenuSettingsPanel draft={draft} onUpdateDraft={onUpdateDraft} />
        ) : selectedNode ? (
          <NodeEditorPanel
            node={selectedNode}
            draft={draft}
            onUpdateNode={onUpdateNode}
            onDeleteNode={(id) => {
              onDeleteNode(id);
              onClose();
            }}
            onAddChild={onAddChild}
            onMoveNode={onMoveNode}
          />
        ) : (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Nó não encontrado.
          </div>
        )}
      </div>
    </div>
  );
}
