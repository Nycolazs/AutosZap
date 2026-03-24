export type NodeType = 'message' | 'submenu' | 'talk_to_agent';

export type MenuNode = {
  id: string;
  menuId: string;
  parentId: string | null;
  label: string;
  message: string;
  type: string;
  order: number;
  positionX: number | null;
  positionY: number | null;
  createdAt: string;
  children?: MenuNode[];
};

export type MenuTreeNode = Omit<MenuNode, 'children'> & {
  children: MenuTreeNode[];
};

export type AutoResponseMenu = {
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

export type MenuNodeDraft = {
  _tempId: string;
  label: string;
  message: string;
  type: NodeType;
  order: number;
  positionX: number | null;
  positionY: number | null;
  children: MenuNodeDraft[];
};

export type MenuDraft = {
  name: string;
  description: string;
  isActive: boolean;
  triggerKeywords: string[];
  headerText: string;
  footerText: string;
  nodes: MenuNodeDraft[];
  /** Position of the start node in the canvas */
  startPosition: { x: number; y: number } | null;
};

// --- Utility functions ---

let _counter = 0;
export function tempId(): string {
  return `tmp_${Date.now()}_${++_counter}`;
}

export function emptyNodeDraft(type: NodeType = 'message'): MenuNodeDraft {
  return {
    _tempId: tempId(),
    label: '',
    message: '',
    type,
    order: 0,
    positionX: null,
    positionY: null,
    children: [],
  };
}

export function emptyMenuDraft(): MenuDraft {
  return {
    name: '',
    description: '',
    isActive: false,
    triggerKeywords: [],
    headerText: '',
    footerText: '',
    nodes: [],
    startPosition: null,
  };
}

export function buildTree(nodes: MenuNode[]): MenuTreeNode[] {
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
  for (const n of map.values()) {
    n.children.sort((a, b) => a.order - b.order);
  }

  return roots;
}

export function menuToEditDraft(menu: AutoResponseMenu): MenuDraft {
  const tree = buildTree(menu.nodes);

  function toNodeDraft(node: MenuTreeNode): MenuNodeDraft {
    const hasChildren = (node.children ?? []).length > 0;
    const nodeType: NodeType =
      node.type === 'talk_to_agent'
        ? 'talk_to_agent'
        : hasChildren
          ? 'submenu'
          : (node.type as NodeType) || 'message';

    return {
      _tempId: node.id,
      label: node.label,
      message: node.message,
      type: nodeType,
      order: node.order,
      positionX: node.positionX,
      positionY: node.positionY,
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
    startPosition: null,
  };
}

// Tree manipulation helpers (immutable)

export function findNodeInTree(nodes: MenuNodeDraft[], id: string): MenuNodeDraft | null {
  for (const node of nodes) {
    if (node._tempId === id) return node;
    const found = findNodeInTree(node.children, id);
    if (found) return found;
  }
  return null;
}

export function updateNodeInTree(
  nodes: MenuNodeDraft[],
  id: string,
  updates: Partial<MenuNodeDraft>,
): MenuNodeDraft[] {
  return nodes.map((node) => {
    if (node._tempId === id) return { ...node, ...updates };
    return { ...node, children: updateNodeInTree(node.children, id, updates) };
  });
}

export function removeNodeFromTree(nodes: MenuNodeDraft[], id: string): MenuNodeDraft[] {
  return nodes
    .filter((node) => node._tempId !== id)
    .map((node) => ({ ...node, children: removeNodeFromTree(node.children, id) }));
}

export function addChildToNode(
  nodes: MenuNodeDraft[],
  parentId: string | null,
  newNode: MenuNodeDraft,
): MenuNodeDraft[] {
  if (parentId === null) {
    return [...nodes, { ...newNode, order: nodes.length }];
  }
  return nodes.map((node) => {
    if (node._tempId === parentId) {
      return {
        ...node,
        type: 'submenu' as NodeType,
        children: [...node.children, { ...newNode, order: node.children.length }],
      };
    }
    return { ...node, children: addChildToNode(node.children, parentId, newNode) };
  });
}

export function draftToPayload(
  draft: MenuDraft,
  nodePositions: Map<string, { x: number; y: number }>,
) {
  function nodeToPayload(node: MenuNodeDraft, index: number): Record<string, unknown> {
    const pos = nodePositions.get(node._tempId);
    const x = pos?.x ?? node.positionX;
    const y = pos?.y ?? node.positionY;

    const payload: Record<string, unknown> = {
      label: node.label,
      message: node.type === 'talk_to_agent' ? '' : node.message,
      type: node.type,
      order: index,
      children: node.children
        .filter((n) => n.label.trim())
        .map((n, i) => nodeToPayload(n, i)),
    };

    // Only include positions when they have actual values
    if (x != null) payload.positionX = x;
    if (y != null) payload.positionY = y;

    return payload;
  }

  return {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    isActive: draft.isActive,
    triggerKeywords: draft.triggerKeywords,
    headerText: draft.headerText.trim() || undefined,
    footerText: draft.footerText.trim() || undefined,
    nodes: draft.nodes
      .filter((n) => n.label.trim())
      .map((n, i) => nodeToPayload(n, i)),
  };
}

export function countAllNodes(nodes: MenuNodeDraft[]): number {
  let count = 0;
  for (const n of nodes) {
    count += 1 + countAllNodes(n.children);
  }
  return count;
}

export function hasValidationErrors(draft: MenuDraft): string | null {
  if (draft.name.trim().length < 2) return 'Informe ao menos 2 caracteres no nome do menu.';
  const validNodes = draft.nodes.filter((n) => n.label.trim());
  if (validNodes.length === 0) return 'Adicione pelo menos uma opção ao menu.';
  return null;
}
