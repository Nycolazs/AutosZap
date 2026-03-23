'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeProps,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Headset,
  MessageSquareText,
  FolderTree,
  Plus,
  Zap,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MenuDraft, MenuNodeDraft, NodeType } from '../_lib/types';

// ----- Tree layout algorithm -----

const NODE_W = 260;
const NODE_H_START = 90;
const NODE_H_OPTION = 76;
const H_GAP = 32;
const V_GAP = 56;

type LayoutItem = {
  id: string;
  children: string[];
  width: number;
};

function computeLayout(draft: MenuDraft) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const startId = '__start__';

  // Collect all items for width calculation
  const items = new Map<string, LayoutItem>();

  function registerNode(node: MenuNodeDraft, parentId: string) {
    items.set(node._tempId, {
      id: node._tempId,
      children: node.children.map((c) => c._tempId),
      width: 0,
    });
    edges.push({
      id: `e-${parentId}-${node._tempId}`,
      source: parentId,
      target: node._tempId,
      type: 'smoothstep',
      style: { stroke: 'hsl(var(--primary) / 0.3)', strokeWidth: 2 },
      animated: false,
    });
    node.children.forEach((child) => registerNode(child, node._tempId));
  }

  // Start node
  items.set(startId, {
    id: startId,
    children: draft.nodes.map((n) => n._tempId),
    width: 0,
  });

  draft.nodes.forEach((rootNode) => registerNode(rootNode, startId));

  // Calculate subtree widths (bottom-up)
  function getWidth(id: string): number {
    const item = items.get(id)!;
    if (item.children.length === 0) {
      item.width = NODE_W;
      return NODE_W;
    }
    const childrenWidth = item.children.reduce(
      (sum, cid) => sum + getWidth(cid) + H_GAP,
      -H_GAP,
    );
    item.width = Math.max(NODE_W, childrenWidth);
    return item.width;
  }

  getWidth(startId);

  // Position nodes (top-down)
  function positionNode(id: string, cx: number, y: number) {
    const item = items.get(id)!;

    if (id === startId) {
      nodes.push({
        id: startId,
        type: 'startNode',
        position: { x: cx - NODE_W / 2, y },
        data: {
          name: draft.name || 'Novo menu',
          headerText: draft.headerText,
          isActive: draft.isActive,
          nodeCount: countNodes(draft.nodes),
        },
        draggable: true,
        selectable: true,
      });
    }

    const kids = item.children;
    if (kids.length > 0) {
      const widths = kids.map((cid) => items.get(cid)!.width);
      const totalW = widths.reduce((s, w) => s + w + H_GAP, -H_GAP);
      let curX = cx - totalW / 2;
      const childY = y + (id === startId ? NODE_H_START : NODE_H_OPTION) + V_GAP;

      for (let i = 0; i < kids.length; i++) {
        const childCx = curX + widths[i] / 2;
        const childNode = findDraftNode(draft.nodes, kids[i]);

        if (childNode) {
          const isAgent = childNode.type === 'talk_to_agent';
          const hasChildren = childNode.children.length > 0;
          const hasError = !childNode.label.trim();

          nodes.push({
            id: kids[i],
            type: 'optionNode',
            position: { x: childCx - NODE_W / 2, y: childY },
            data: {
              label: childNode.label,
              message: childNode.message,
              nodeType: childNode.type as NodeType,
              order: i + 1,
              hasChildren,
              isAgent,
              hasError,
            },
            draggable: true,
            selectable: true,
          });
        }

        positionNode(kids[i], childCx, childY);
        curX += widths[i] + H_GAP;
      }
    }
  }

  positionNode(startId, 0, 0);

  return { nodes, edges };
}

function findDraftNode(nodes: MenuNodeDraft[], id: string): MenuNodeDraft | null {
  for (const n of nodes) {
    if (n._tempId === id) return n;
    const found = findDraftNode(n.children, id);
    if (found) return found;
  }
  return null;
}

function countNodes(nodes: MenuNodeDraft[]): number {
  return nodes.reduce((s, n) => s + 1 + countNodes(n.children), 0);
}

// ----- Custom Node: Start -----

function StartNodeComponent({ data, selected }: NodeProps) {
  const d = data as {
    name: string;
    headerText: string;
    isActive: boolean;
    nodeCount: number;
  };

  return (
    <div
      className={cn(
        'group relative rounded-2xl border-2 bg-background px-4 py-3 shadow-lg transition-all',
        'w-[260px]',
        selected
          ? 'border-primary shadow-primary/20'
          : 'border-primary/40 hover:border-primary/60',
      )}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <Zap className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{d.name || 'Novo menu'}</p>
          <p className="text-[10px] text-muted-foreground">
            {d.nodeCount} {d.nodeCount === 1 ? 'opção' : 'opções'}
          </p>
        </div>
        <div
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            d.isActive ? 'bg-emerald-400' : 'bg-muted-foreground/30',
          )}
          title={d.isActive ? 'Ativo' : 'Inativo'}
        />
      </div>
      {d.headerText && (
        <p className="mt-1.5 line-clamp-1 text-[11px] text-muted-foreground">{d.headerText}</p>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !rounded-full !border-2 !border-primary !bg-background"
      />
    </div>
  );
}

// ----- Custom Node: Option -----

function OptionNodeComponent({ data, selected }: NodeProps) {
  const d = data as {
    label: string;
    message: string;
    nodeType: NodeType;
    order: number;
    hasChildren: boolean;
    isAgent: boolean;
    hasError: boolean;
  };

  const typeConfig = {
    message: {
      icon: MessageSquareText,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      borderSelected: 'border-blue-400',
      borderDefault: 'border-blue-400/30 hover:border-blue-400/50',
      label: 'Mensagem',
    },
    submenu: {
      icon: FolderTree,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
      borderSelected: 'border-violet-400',
      borderDefault: 'border-violet-400/30 hover:border-violet-400/50',
      label: 'Submenu',
    },
    talk_to_agent: {
      icon: Headset,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      borderSelected: 'border-amber-400',
      borderDefault: 'border-amber-400/30 hover:border-amber-400/50',
      label: 'Atendente',
    },
  };

  const cfg = typeConfig[d.nodeType] || typeConfig.message;
  const Icon = cfg.icon;

  return (
    <div
      className={cn(
        'group relative rounded-xl border-2 bg-background px-3 py-2.5 shadow-md transition-all',
        'w-[260px]',
        d.hasError && 'border-red-400/60',
        !d.hasError && (selected ? cfg.borderSelected : cfg.borderDefault),
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !rounded-full !border-2 !border-muted-foreground/40 !bg-background"
      />

      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold bg-muted/50 text-muted-foreground">
          {d.order}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-[13px] font-medium', !d.label && 'italic text-muted-foreground')}>
            {d.label || 'Sem rótulo'}
          </p>
        </div>
        <div className={cn('flex h-6 items-center gap-1 rounded-md px-1.5', cfg.bg)}>
          <Icon className={cn('h-3 w-3', cfg.color)} />
          <span className={cn('text-[10px] font-medium', cfg.color)}>{cfg.label}</span>
        </div>
      </div>

      {d.nodeType === 'message' && d.message && (
        <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{d.message}</p>
      )}

      {d.hasError && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-red-400">
          <AlertCircle className="h-3 w-3" />
          Rótulo obrigatório
        </div>
      )}

      {(d.nodeType === 'submenu' || d.hasChildren) && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-3 !w-3 !rounded-full !border-2 !border-muted-foreground/40 !bg-background"
        />
      )}
    </div>
  );
}

// ----- Node types registry (must be outside component) -----

const nodeTypes = {
  startNode: StartNodeComponent,
  optionNode: OptionNodeComponent,
};

// ----- FlowCanvas (inner, needs ReactFlowProvider) -----

function FlowCanvasInner({
  draft,
  selectedNodeId,
  onSelectNode,
  onAddNode,
}: {
  draft: MenuDraft;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onAddNode: (parentId: string | null) => void;
}) {
  const reactFlow = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const prevStructureRef = useRef('');

  // Compute structure key to detect tree changes
  const structureKey = useMemo(() => {
    function getKey(nodes: MenuNodeDraft[]): string {
      return nodes.map((n) => `${n._tempId}[${getKey(n.children)}]`).join(',');
    }
    return getKey(draft.nodes) + `|${draft.name}|${draft.isActive}|${draft.headerText}`;
  }, [draft]);

  // Re-layout when structure changes
  useEffect(() => {
    const { nodes: layoutNodes, edges: layoutEdges } = computeLayout(draft);

    if (structureKey !== prevStructureRef.current) {
      // Structure changed - full re-layout
      setNodes(layoutNodes);
      setEdges(layoutEdges);
      prevStructureRef.current = structureKey;

      // Fit view after layout
      setTimeout(() => {
        reactFlow.fitView({ padding: 0.2, duration: 300 });
      }, 50);
    } else {
      // Only data changed - update data without moving positions
      setNodes((prev) => {
        const posMap = new Map(prev.map((n) => [n.id, n.position]));
        return layoutNodes.map((n) => ({
          ...n,
          position: posMap.get(n.id) ?? n.position,
        }));
      });
      setEdges(layoutEdges);
    }
  }, [draft, structureKey, setNodes, setEdges, reactFlow]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectNode(node.id === '__start__' ? '__start__' : node.id);
    },
    [onSelectNode],
  );

  const handlePaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  // Highlight selected node
  const nodesWithSelection = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
      })),
    [nodes, selectedNodeId],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodesWithSelection}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        className="bg-transparent"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--muted-foreground) / 0.15)" />
        <Controls
          showInteractive={false}
          className="!rounded-xl !border-border !bg-background !shadow-lg [&>button]:!border-border [&>button]:!bg-background [&>button]:!text-muted-foreground hover:[&>button]:!bg-muted"
        />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'startNode') return 'hsl(var(--primary))';
            const d = n.data as { nodeType?: string };
            if (d.nodeType === 'talk_to_agent') return '#fbbf24';
            if (d.nodeType === 'submenu') return '#a78bfa';
            return '#60a5fa';
          }}
          maskColor="hsl(var(--background) / 0.8)"
          className="!rounded-xl !border-border !bg-background/80"
        />
      </ReactFlow>

      {/* Floating add button */}
      <button
        type="button"
        onClick={() => onAddNode(selectedNodeId === '__start__' ? null : selectedNodeId)}
        className={cn(
          'absolute bottom-6 right-6 z-10 flex h-12 w-12 items-center justify-center',
          'rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25',
          'transition-all hover:scale-105 hover:shadow-xl hover:shadow-primary/30',
          'active:scale-95',
        )}
        title="Adicionar opção"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

// ----- Exported component with provider -----

export function FlowCanvas(props: {
  draft: MenuDraft;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onAddNode: (parentId: string | null) => void;
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
