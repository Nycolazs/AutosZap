'use client';

import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';
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
import { useTheme } from 'next-themes';
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
        ? 'var(--menu-flow-edge-agent)'
        : node.type === 'submenu' || node.children.length > 0
          ? 'var(--menu-flow-edge-submenu)'
          : 'var(--menu-flow-edge-message)';

    edges.push({
      id: `e-${parentId}-${node._tempId}`,
      source: parentId,
      target: node._tempId,
      type: 'smoothstep',
      style: { stroke: edgeColor, strokeWidth: 2.5, opacity: 0.92 },
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
        'group relative w-[260px] rounded-[22px] border bg-[var(--menu-flow-start-bg)] px-4 py-3 text-[var(--menu-flow-node-text)] shadow-[var(--menu-flow-node-shadow)] backdrop-blur-sm transition-all',
        'w-[260px]',
        selected
          ? 'border-[var(--menu-flow-start-border-strong)] shadow-[var(--menu-flow-node-shadow-selected)]'
          : 'border-[var(--menu-flow-start-border)] hover:border-[var(--menu-flow-start-border-strong)]',
      )}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--menu-flow-start-pill-border)] bg-[var(--menu-flow-start-pill-bg)]">
          <Zap className="h-4 w-4 text-[var(--menu-flow-start-accent)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--menu-flow-node-text)]">
            {d.name || 'Novo menu'}
          </p>
          <p className="text-[10px] text-[var(--menu-flow-node-meta)]">
            {d.nodeCount} {d.nodeCount === 1 ? 'opção' : 'opções'}
          </p>
        </div>
        <div
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            d.isActive ? 'bg-emerald-400' : 'bg-[var(--menu-flow-node-dot)]',
          )}
          title={d.isActive ? 'Ativo' : 'Inativo'}
        />
      </div>
      {d.headerText && (
        <p className="mt-1.5 line-clamp-1 text-[11px] text-[var(--menu-flow-node-meta)]">
          {d.headerText}
        </p>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !rounded-full !border-2 !border-[var(--menu-flow-start-accent)] !bg-[var(--menu-flow-handle-bg)]"
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
      color: 'text-[var(--menu-flow-message-accent)]',
      bg: 'bg-[var(--menu-flow-message-surface)]',
      chipBorder: 'border-[var(--menu-flow-message-border)]',
      borderSelected: 'border-[var(--menu-flow-message-border-strong)]',
      borderDefault: 'border-[var(--menu-flow-message-border)] hover:border-[var(--menu-flow-message-border-strong)]',
      label: 'Mensagem',
    },
    submenu: {
      icon: FolderTree,
      color: 'text-[var(--menu-flow-submenu-accent)]',
      bg: 'bg-[var(--menu-flow-submenu-surface)]',
      chipBorder: 'border-[var(--menu-flow-submenu-border)]',
      borderSelected: 'border-[var(--menu-flow-submenu-border-strong)]',
      borderDefault: 'border-[var(--menu-flow-submenu-border)] hover:border-[var(--menu-flow-submenu-border-strong)]',
      label: 'Submenu',
    },
    talk_to_agent: {
      icon: Headset,
      color: 'text-[var(--menu-flow-agent-accent)]',
      bg: 'bg-[var(--menu-flow-agent-surface)]',
      chipBorder: 'border-[var(--menu-flow-agent-border)]',
      borderSelected: 'border-[var(--menu-flow-agent-border-strong)]',
      borderDefault: 'border-[var(--menu-flow-agent-border)] hover:border-[var(--menu-flow-agent-border-strong)]',
      label: 'Atendente',
    },
  };

  const cfg = typeConfig[d.nodeType] || typeConfig.message;
  const Icon = cfg.icon;

  return (
    <div
      className={cn(
        'group relative w-[260px] rounded-[20px] border bg-[var(--menu-flow-node-bg)] px-3 py-2.5 text-[var(--menu-flow-node-text)] shadow-[var(--menu-flow-node-shadow)] backdrop-blur-sm transition-all',
        'w-[260px]',
        d.hasError && 'border-red-400/60',
        !d.hasError &&
          (selected
            ? `${cfg.borderSelected} shadow-[var(--menu-flow-node-shadow-selected)]`
            : cfg.borderDefault),
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !rounded-full !border-2 !border-[var(--menu-flow-handle-border)] !bg-[var(--menu-flow-handle-bg)]"
      />

      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-[var(--menu-flow-order-border)] bg-[var(--menu-flow-order-bg)] text-[11px] font-bold text-[var(--menu-flow-order-text)]">
          {d.order}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate text-[13px] font-medium text-[var(--menu-flow-node-text)]',
              !d.label && 'italic text-[var(--menu-flow-node-meta)]',
            )}
          >
            {d.label || 'Sem rótulo'}
          </p>
        </div>
        <div
          className={cn(
            'flex h-6 items-center gap-1 rounded-md border px-1.5',
            cfg.bg,
            cfg.chipBorder,
          )}
        >
          <Icon className={cn('h-3 w-3', cfg.color)} />
          <span className={cn('text-[10px] font-medium', cfg.color)}>{cfg.label}</span>
        </div>
      </div>

      {d.nodeType === 'message' && d.message && (
        <p className="mt-1 line-clamp-1 text-[11px] text-[var(--menu-flow-node-meta)]">
          {d.message}
        </p>
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
          '!rounded-full !border-2 !bg-[var(--menu-flow-handle-bg)]',
          d.nodeType === 'submenu' || d.hasChildren
            ? '!h-3 !w-3 !border-[var(--menu-flow-handle-border)]'
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
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const reactFlow = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const prevStructureRef = useRef('');
  const positionsRef = useRef(new Map<string, { x: number; y: number }>());
  const flowThemeVars = useMemo(
    () =>
      ({
        '--menu-flow-canvas-bg': isLight
          ? 'linear-gradient(180deg, rgba(245,248,252,0.96), rgba(237,242,249,0.96))'
          : 'linear-gradient(180deg, rgba(7,17,31,0.96), rgba(4,13,25,0.98))',
        '--menu-flow-node-bg': isLight
          ? 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,250,255,0.98))'
          : 'linear-gradient(180deg, rgba(12,26,44,0.98), rgba(9,20,36,0.98))',
        '--menu-flow-start-bg': isLight
          ? 'linear-gradient(180deg, rgba(255,255,255,0.99), rgba(244,248,255,0.99))'
          : 'linear-gradient(180deg, rgba(15,31,54,0.99), rgba(10,22,40,0.99))',
        '--menu-flow-node-text': isLight ? '#0f1a2e' : '#eff6ff',
        '--menu-flow-node-meta': isLight ? 'rgba(15,26,46,0.68)' : 'rgba(233,237,239,0.68)',
        '--menu-flow-node-dot': isLight ? 'rgba(15,26,46,0.18)' : 'rgba(255,255,255,0.18)',
        '--menu-flow-node-shadow': isLight
          ? '0 18px 36px rgba(30,70,130,0.10)'
          : '0 20px 42px rgba(2,10,22,0.34)',
        '--menu-flow-node-shadow-selected': isLight
          ? '0 0 0 1px rgba(43,125,233,0.14), 0 18px 40px rgba(30,70,130,0.14)'
          : '0 0 0 1px rgba(74,162,255,0.18), 0 20px 46px rgba(2,10,22,0.42)',
        '--menu-flow-order-bg': isLight ? 'rgba(226,236,248,0.92)' : 'rgba(255,255,255,0.08)',
        '--menu-flow-order-border': isLight
          ? 'rgba(30,70,130,0.10)'
          : 'rgba(255,255,255,0.08)',
        '--menu-flow-order-text': isLight ? '#60758f' : '#9fb4d1',
        '--menu-flow-handle-bg': isLight ? '#ffffff' : '#0c1a2c',
        '--menu-flow-handle-border': isLight
          ? 'rgba(30,70,130,0.24)'
          : 'rgba(135,181,255,0.34)',
        '--menu-flow-start-accent': isLight ? '#2563eb' : '#7eb8ff',
        '--menu-flow-start-pill-bg': isLight
          ? 'rgba(43,125,233,0.10)'
          : 'rgba(50,151,255,0.16)',
        '--menu-flow-start-pill-border': isLight
          ? 'rgba(43,125,233,0.16)'
          : 'rgba(126,184,255,0.18)',
        '--menu-flow-start-border': isLight
          ? 'rgba(43,125,233,0.20)'
          : 'rgba(126,184,255,0.22)',
        '--menu-flow-start-border-strong': isLight
          ? 'rgba(43,125,233,0.42)'
          : 'rgba(126,184,255,0.42)',
        '--menu-flow-message-accent': isLight ? '#2563eb' : '#7eb8ff',
        '--menu-flow-message-surface': isLight
          ? 'rgba(37,99,235,0.08)'
          : 'rgba(96,165,250,0.16)',
        '--menu-flow-message-border': isLight
          ? 'rgba(37,99,235,0.16)'
          : 'rgba(126,184,255,0.20)',
        '--menu-flow-message-border-strong': isLight
          ? 'rgba(37,99,235,0.34)'
          : 'rgba(126,184,255,0.42)',
        '--menu-flow-submenu-accent': isLight ? '#7c3aed' : '#c4b5fd',
        '--menu-flow-submenu-surface': isLight
          ? 'rgba(124,58,237,0.08)'
          : 'rgba(167,139,250,0.16)',
        '--menu-flow-submenu-border': isLight
          ? 'rgba(124,58,237,0.16)'
          : 'rgba(196,181,253,0.20)',
        '--menu-flow-submenu-border-strong': isLight
          ? 'rgba(124,58,237,0.34)'
          : 'rgba(196,181,253,0.42)',
        '--menu-flow-agent-accent': isLight ? '#d97706' : '#fbbf24',
        '--menu-flow-agent-surface': isLight
          ? 'rgba(217,119,6,0.08)'
          : 'rgba(251,191,36,0.16)',
        '--menu-flow-agent-border': isLight
          ? 'rgba(217,119,6,0.16)'
          : 'rgba(251,191,36,0.20)',
        '--menu-flow-agent-border-strong': isLight
          ? 'rgba(217,119,6,0.34)'
          : 'rgba(251,191,36,0.42)',
        '--menu-flow-edge-message': isLight ? 'rgba(37,99,235,0.70)' : 'rgba(96,165,250,0.82)',
        '--menu-flow-edge-submenu': isLight ? 'rgba(124,58,237,0.70)' : 'rgba(167,139,250,0.82)',
        '--menu-flow-edge-agent': isLight ? 'rgba(217,119,6,0.74)' : 'rgba(251,191,36,0.86)',
        '--xy-background-color': 'transparent',
        '--xy-background-pattern-dots-color': isLight
          ? 'rgba(30,70,130,0.14)'
          : 'rgba(142,163,196,0.18)',
        '--xy-controls-button-background-color': isLight
          ? 'rgba(255,255,255,0.96)'
          : 'rgba(12,26,44,0.96)',
        '--xy-controls-button-background-color-hover': isLight
          ? 'rgba(226,236,248,0.96)'
          : 'rgba(21,39,65,0.96)',
        '--xy-controls-button-color': isLight ? '#0f1a2e' : '#eff6ff',
        '--xy-controls-button-color-hover': isLight ? '#0f1a2e' : '#eff6ff',
        '--xy-controls-button-border-color': isLight
          ? 'rgba(30,70,130,0.12)'
          : 'rgba(135,181,255,0.14)',
        '--xy-controls-box-shadow': isLight
          ? '0 14px 30px rgba(30,70,130,0.10)'
          : '0 18px 36px rgba(2,10,22,0.34)',
      }) as CSSProperties,
    [isLight],
  );

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
    <div
      className="h-full w-full bg-[var(--menu-flow-canvas-bg)]"
      style={flowThemeVars}
    >
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
        colorMode={isLight ? 'light' : 'dark'}
        proOptions={{ hideAttribution: true }}
        className="bg-transparent"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
        />
        <Controls
          showInteractive={false}
          className="!overflow-hidden !rounded-2xl !border !border-[var(--xy-controls-button-border-color)] !bg-[var(--xy-controls-button-background-color)] !shadow-[var(--xy-controls-box-shadow)] [&>button]:!border-b-[var(--xy-controls-button-border-color)] [&>button]:!bg-[var(--xy-controls-button-background-color)] [&>button]:!text-[var(--xy-controls-button-color)] hover:[&>button]:!bg-[var(--xy-controls-button-background-color-hover)]"
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
