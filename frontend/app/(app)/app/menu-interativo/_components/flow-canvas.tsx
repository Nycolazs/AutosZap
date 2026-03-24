'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeProps,
  type NodeChange,
  BackgroundVariant,
  ConnectionLineType,
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
const NODE_H_START = 100;
const NODE_H_OPTION = 80;
const H_GAP = 40;
const V_GAP = 70;

function computeLayout(draft: MenuDraft) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const startId = '__start__';

  // Collect items for width calculation
  const itemWidths = new Map<string, number>();
  const itemChildren = new Map<string, string[]>();

  function registerItem(node: MenuNodeDraft, parentId: string) {
    itemChildren.set(node._tempId, node.children.map((c) => c._tempId));

    const edgeColor =
      node.type === 'talk_to_agent'
        ? '#fbbf24'
        : node.type === 'submenu' || node.children.length > 0
          ? '#a78bfa'
          : '#60a5fa';

    edges.push({
      id: `e-${parentId}-${node._tempId}`,
      source: parentId,
      target: node._tempId,
      type: 'smoothstep',
      style: { stroke: edgeColor, strokeWidth: 2, opacity: 0.6 },
      pathOptions: { borderRadius: 16 },
    });
    node.children.forEach((child) => registerItem(child, node._tempId));
  }

  itemChildren.set(startId, draft.nodes.map((n) => n._tempId));
  draft.nodes.forEach((rootNode) => registerItem(rootNode, startId));

  // Calculate subtree widths bottom-up
  function getWidth(id: string): number {
    const kids = itemChildren.get(id) ?? [];
    if (kids.length === 0) {
      itemWidths.set(id, NODE_W);
      return NODE_W;
    }
    const w = kids.reduce((sum, cid) => sum + getWidth(cid) + H_GAP, -H_GAP);
    const result = Math.max(NODE_W, w);
    itemWidths.set(id, result);
    return result;
  }
  getWidth(startId);

  // Check if node has a saved position
  function hasSavedPosition(node: MenuNodeDraft): boolean {
    return node.positionX !== null && node.positionY !== null;
  }

  // Position nodes top-down
  function positionChildren(parentId: string, cx: number, parentY: number, parentH: number) {
    const kids = itemChildren.get(parentId) ?? [];
    if (kids.length === 0) return;

    const widths = kids.map((cid) => itemWidths.get(cid) ?? NODE_W);
    const totalW = widths.reduce((s, w) => s + w + H_GAP, -H_GAP);
    let curX = cx - totalW / 2;
    const childY = parentY + parentH + V_GAP;

    for (let i = 0; i < kids.length; i++) {
      const childCx = curX + widths[i] / 2;
      const childNode = findDraftNode(draft.nodes, kids[i]);

      if (childNode) {
        const useSaved = hasSavedPosition(childNode);
        const posX = useSaved ? childNode.positionX! : childCx - NODE_W / 2;
        const posY = useSaved ? childNode.positionY! : childY;

        const isAgent = childNode.type === 'talk_to_agent';
        const hasChildren = childNode.children.length > 0;
        const hasError = !childNode.label.trim();

        nodes.push({
          id: kids[i],
          type: 'optionNode',
          position: { x: posX, y: posY },
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

        // Use the layout center for child positioning (not saved position)
        positionChildren(kids[i], childCx, useSaved ? posY : childY, NODE_H_OPTION);
      }

      curX += widths[i] + H_GAP;
    }
  }

  // Start node
  const startX = draft.startPosition?.x ?? 0 - NODE_W / 2;
  const startY = draft.startPosition?.y ?? 0;

  nodes.push({
    id: startId,
    type: 'startNode',
    position: { x: startX, y: startY },
    data: {
      name: draft.name || 'Novo menu',
      headerText: draft.headerText,
      isActive: draft.isActive,
      nodeCount: countNodes(draft.nodes),
    },
    draggable: true,
    selectable: true,
  });

  positionChildren(startId, startX + NODE_W / 2, startY, NODE_H_START);

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

      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          '!rounded-full !border-2 !bg-background',
          d.nodeType === 'submenu' || d.hasChildren
            ? '!h-3 !w-3 !border-muted-foreground/40'
            : '!h-1 !w-1 !border-transparent !opacity-0',
        )}
      />
    </div>
  );
}

// ----- Node types registry (must be stable reference outside component) -----

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
  onNodePositionsChange,
}: {
  draft: MenuDraft;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onAddNode: (parentId: string | null) => void;
  onNodePositionsChange: (positions: Map<string, { x: number; y: number }>) => void;
}) {
  const reactFlow = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const prevStructureRef = useRef('');
  const positionsRef = useRef(new Map<string, { x: number; y: number }>());

  // Compute structure key to detect tree changes (add/remove nodes)
  const structureKey = useMemo(() => {
    function getKey(ns: MenuNodeDraft[]): string {
      return ns.map((n) => `${n._tempId}[${getKey(n.children)}]`).join(',');
    }
    return getKey(draft.nodes);
  }, [draft.nodes]);

  // Re-layout when structure changes
  useEffect(() => {
    const { nodes: layoutNodes, edges: layoutEdges } = computeLayout(draft);
    const structureChanged = structureKey !== prevStructureRef.current;

    if (structureChanged) {
      setNodes(layoutNodes);
      setEdges(layoutEdges);
      prevStructureRef.current = structureKey;

      // Save initial positions
      positionsRef.current = new Map(layoutNodes.map((n) => [n.id, n.position]));

      setTimeout(() => {
        reactFlow.fitView({ padding: 0.25, duration: 300 });
      }, 50);
    } else {
      // Only data changed (labels etc) - update data without moving
      setNodes((prev) => {
        const dataMap = new Map(layoutNodes.map((n) => [n.id, n.data]));
        return prev.map((n) => ({
          ...n,
          data: dataMap.get(n.id) ?? n.data,
        }));
      });
      setEdges(layoutEdges);
    }
  }, [draft, structureKey, setNodes, setEdges, reactFlow]);

  // Handle node changes (position drag)
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);

      // Track position changes from dragging
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          positionsRef.current.set(change.id, change.position);
        }
      }

      // When drag ends, notify parent
      const hasDragEnd = changes.some(
        (c) => c.type === 'position' && c.dragging === false,
      );
      if (hasDragEnd) {
        onNodePositionsChange(new Map(positionsRef.current));
      }
    },
    [onNodesChange, onNodePositionsChange],
  );

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
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.15}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        className="bg-transparent"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="hsl(var(--muted-foreground) / 0.15)"
        />
        <Controls
          showInteractive={false}
          className="!rounded-xl !border-border !bg-background !shadow-lg [&>button]:!border-border [&>button]:!bg-background [&>button]:!text-muted-foreground hover:[&>button]:!bg-muted"
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
  onNodePositionsChange: (positions: Map<string, { x: number; y: number }>) => void;
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
