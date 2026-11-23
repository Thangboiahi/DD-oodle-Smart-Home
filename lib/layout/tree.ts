export type LayoutItemSize = 'S' | 'M' | 'L' | 'Full';

export interface LayoutContainer {
  id: string;
  title: string;
  kind: 'room' | 'custom';
  roomId?: string;
  itemIds: string[];
}

export interface LayoutTreeWidgetNode {
  type: 'widget';
  id: string;
}

export interface LayoutTreeContainerNode {
  type: 'container';
  id: string;
  title: string;
  kind: 'room' | 'custom';
  roomId?: string;
  children: LayoutTreeNode[];
}

export type LayoutTreeNode = LayoutTreeContainerNode | LayoutTreeWidgetNode;

export interface Layout2DGraph {
  /** Legacy flat mirror maintained for backward compatibility */
  containers: LayoutContainer[];
  /** Authoritative recursive nested container tree (max visual depth 3: depths 0, 1, 2) */
  layout_tree: LayoutTreeContainerNode[];
  itemSizes: Record<string, LayoutItemSize>;
  /** Hidden widget/device IDs (monitors and hardware modules) */
  hiddenItems: string[];
  /** Hidden container IDs (rooms and custom zones) */
  hiddenContainers: string[];
  /** UI-only display aliases keyed by container ID, monitor ID, or hardware device_id */
  customTitles: Record<string, string>;
  /** Owner-synced hardware room overrides (homes/{home_id}/devices/{device_id}.room_id) */
  deviceRoomOverrides: Record<string, string>;
}

export interface FlattenedContainerEntry {
  container: LayoutTreeContainerNode;
  depth: number;
  parentId: string | null;
  pathLabel: string;
}

export const MAX_NESTING_DEPTH = 3; // Depths 0, 1, 2 (3 visual levels max on mobile)

const DEFAULT_TREE: LayoutTreeContainerNode[] = [
  {
    type: 'container',
    id: 'zone_monitors',
    title: 'Telemetry & Quick Scenes',
    kind: 'custom',
    children: [
      { type: 'widget', id: 'mon_energy' },
      { type: 'widget', id: 'mon_water' },
      { type: 'widget', id: 'mon_hub' },
      { type: 'widget', id: 'mon_vehicle' },
      { type: 'widget', id: 'mon_scenes' },
    ],
  },
  {
    type: 'container',
    id: 'room_living',
    title: 'Living Room',
    kind: 'room',
    roomId: 'room_living',
    children: [
      { type: 'widget', id: 'dd_pwr01_a1b2c3' },
      { type: 'widget', id: 'dd_hub01_u7v8w9' },
    ],
  },
  {
    type: 'container',
    id: 'room_bedroom',
    title: 'Master Bedroom',
    kind: 'room',
    roomId: 'room_bedroom',
    children: [{ type: 'widget', id: 'dd_pwr02_d4e5f6' }],
  },
  {
    type: 'container',
    id: 'room_bath',
    title: 'Master Bath',
    kind: 'room',
    roomId: 'room_bath',
    children: [{ type: 'widget', id: 'dd_pwr03_g7h8i9' }],
  },
  {
    type: 'container',
    id: 'room_terrace',
    title: 'Terrace & Tank',
    kind: 'room',
    roomId: 'room_terrace',
    children: [{ type: 'widget', id: 'dd_wat01_j1k2l3' }],
  },
  {
    type: 'container',
    id: 'room_garage',
    title: 'Garage & Vehicle',
    kind: 'room',
    roomId: 'room_garage',
    children: [{ type: 'widget', id: 'dd_veh01_m4n5p6' }],
  },
];

export function deriveLegacyContainers(tree: LayoutTreeContainerNode[]): LayoutContainer[] {
  const result: LayoutContainer[] = [];
  const visit = (nodes: LayoutTreeContainerNode[]) => {
    for (const c of nodes) {
      const itemIds = c.children
        .filter((ch): ch is LayoutTreeWidgetNode => ch.type === 'widget')
        .map((ch) => ch.id);
      result.push({
        id: c.id,
        title: c.title,
        kind: c.kind,
        roomId: c.roomId,
        itemIds,
      });
      const childContainers = c.children.filter(
        (ch): ch is LayoutTreeContainerNode => ch.type === 'container'
      );
      if (childContainers.length > 0) {
        visit(childContainers);
      }
    }
  };
  visit(tree);
  return result;
}

export const DEFAULT_LAYOUT_2D: Layout2DGraph = {
  containers: deriveLegacyContainers(DEFAULT_TREE),
  layout_tree: DEFAULT_TREE,
  itemSizes: {
    mon_scenes: 'Full',
  },
  hiddenItems: ['mon_faults', 'mon_analytics'],
  hiddenContainers: [],
  customTitles: {},
  deviceRoomOverrides: {},
};

function sanitizeTreeNodes(
  nodes: unknown,
  depth: number,
  seenContainerIds: Set<string>,
  seenWidgetIds: Set<string>
): LayoutTreeNode[] {
  if (!Array.isArray(nodes)) return [];
  const out: LayoutTreeNode[] = [];

  for (const raw of nodes) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    if (item.type === 'widget' && typeof item.id === 'string' && item.id.trim()) {
      if (seenWidgetIds.has(item.id)) continue;
      seenWidgetIds.add(item.id);
      out.push({ type: 'widget', id: item.id });
    } else if (
      item.type === 'container' &&
      typeof item.id === 'string' &&
      item.id.trim() &&
      depth < MAX_NESTING_DEPTH
    ) {
      if (seenContainerIds.has(item.id)) continue;
      seenContainerIds.add(item.id);
      const children = sanitizeTreeNodes(item.children, depth + 1, seenContainerIds, seenWidgetIds);
      out.push({
        type: 'container',
        id: item.id,
        title: typeof item.title === 'string' && item.title.trim() ? item.title : 'Zone',
        kind: item.kind === 'room' ? 'room' : 'custom',
        roomId: typeof item.roomId === 'string' ? item.roomId : undefined,
        children,
      });
    }
  }
  return out;
}

/**
 * Migrates legacy flat `containers[]` or sanitizes a persisted `layout_tree` safely.
 */
export function normalizeLayout2D(raw?: Partial<Layout2DGraph> | null): Layout2DGraph {
  if (!raw) return DEFAULT_LAYOUT_2D;

  let tree: LayoutTreeContainerNode[] = [];

  if (Array.isArray(raw.layout_tree) && raw.layout_tree.length > 0) {
    const seenC = new Set<string>();
    const seenW = new Set<string>();
    const sanitized = sanitizeTreeNodes(raw.layout_tree, 0, seenC, seenW);
    tree = sanitized.filter((n): n is LayoutTreeContainerNode => n.type === 'container');
  } else if (Array.isArray(raw.containers) && raw.containers.length > 0) {
    const seenC = new Set<string>();
    const seenW = new Set<string>();
    for (const c of raw.containers) {
      if (!c || typeof c.id !== 'string' || seenC.has(c.id)) continue;
      seenC.add(c.id);
      const children: LayoutTreeNode[] = [];
      for (const itemId of c.itemIds ?? []) {
        if (typeof itemId === 'string' && !seenW.has(itemId)) {
          seenW.add(itemId);
          children.push({ type: 'widget', id: itemId });
        }
      }
      tree.push({
        type: 'container',
        id: c.id,
        title: c.title || 'Zone',
        kind: c.kind === 'room' ? 'room' : 'custom',
        roomId: c.roomId,
        children,
      });
    }
  }

  if (tree.length === 0) {
    tree = DEFAULT_TREE;
  }

  return {
    containers: deriveLegacyContainers(tree),
    layout_tree: tree,
    itemSizes: { ...DEFAULT_LAYOUT_2D.itemSizes, ...(raw.itemSizes ?? {}) },
    hiddenItems: Array.isArray(raw.hiddenItems) ? raw.hiddenItems : DEFAULT_LAYOUT_2D.hiddenItems,
    hiddenContainers: Array.isArray(raw.hiddenContainers) ? raw.hiddenContainers : [],
    customTitles:
      raw.customTitles && typeof raw.customTitles === 'object' ? { ...raw.customTitles } : {},
    deviceRoomOverrides:
      raw.deviceRoomOverrides && typeof raw.deviceRoomOverrides === 'object'
        ? { ...raw.deviceRoomOverrides }
        : {},
  };
}

export function withSyncedTree(
  layout: Layout2DGraph,
  nextTree: LayoutTreeContainerNode[],
  patch?: Partial<Omit<Layout2DGraph, 'layout_tree' | 'containers'>>
): Layout2DGraph {
  return {
    ...layout,
    ...patch,
    layout_tree: nextTree,
    containers: deriveLegacyContainers(nextTree),
  };
}

export function getDisplayTitle(
  customTitles: Record<string, string> | undefined,
  id: string,
  fallback: string
): string {
  const alias = customTitles?.[id]?.trim();
  return alias && alias.length > 0 ? alias : fallback;
}

export function findContainerById(
  roots: LayoutTreeContainerNode[],
  id: string
): LayoutTreeContainerNode | null {
  for (const node of roots) {
    if (node.id === id) return node;
    const childContainers = node.children.filter(
      (ch): ch is LayoutTreeContainerNode => ch.type === 'container'
    );
    const found = findContainerById(childContainers, id);
    if (found) return found;
  }
  return null;
}

export function getContainerDepth(
  roots: LayoutTreeContainerNode[],
  targetId: string,
  depth = 0
): number {
  for (const node of roots) {
    if (node.id === targetId) return depth;
    const childContainers = node.children.filter(
      (ch): ch is LayoutTreeContainerNode => ch.type === 'container'
    );
    const found = getContainerDepth(childContainers, targetId, depth + 1);
    if (found !== -1) return found;
  }
  return -1;
}

export function getSubtreeMaxRelativeDepth(container: LayoutTreeContainerNode): number {
  const childContainers = container.children.filter(
    (ch): ch is LayoutTreeContainerNode => ch.type === 'container'
  );
  if (childContainers.length === 0) return 0;
  let maxChild = 0;
  for (const child of childContainers) {
    maxChild = Math.max(maxChild, 1 + getSubtreeMaxRelativeDepth(child));
  }
  return maxChild;
}

export function isDescendantOrSelf(
  container: LayoutTreeContainerNode,
  potentialDescendantId: string
): boolean {
  if (container.id === potentialDescendantId) return true;
  for (const ch of container.children) {
    if (ch.type === 'container' && isDescendantOrSelf(ch, potentialDescendantId)) {
      return true;
    }
  }
  return false;
}

export function findParentContainerId(
  roots: LayoutTreeContainerNode[],
  nodeId: string,
  parentId: string | null = null
): string | null | undefined {
  for (const node of roots) {
    if (node.id === nodeId) return parentId;
    for (const ch of node.children) {
      if (ch.type === 'widget' && ch.id === nodeId) return node.id;
      if (ch.type === 'container') {
        if (ch.id === nodeId) return node.id;
        const found = findParentContainerId([ch], nodeId, node.id);
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
}

export function canMoveContainerInto(
  roots: LayoutTreeContainerNode[],
  draggedContainerId: string,
  targetParentId: string | null
): { allowed: boolean; reason?: string } {
  const dragged = findContainerById(roots, draggedContainerId);
  if (!dragged) return { allowed: false, reason: 'Container not found.' };

  // Moving to root level is always valid
  if (targetParentId === null) {
    return { allowed: true };
  }

  // Block dropping a container into itself or any of its descendants
  if (isDescendantOrSelf(dragged, targetParentId)) {
    return {
      allowed: false,
      reason: 'Cannot nest a container inside itself or one of its own sub-containers.',
    };
  }

  const targetDepth = getContainerDepth(roots, targetParentId);
  if (targetDepth === -1) {
    return { allowed: false, reason: 'Target container not found.' };
  }

  const draggedSubtreeDepth = getSubtreeMaxRelativeDepth(dragged);
  if (targetDepth + 1 + draggedSubtreeDepth >= MAX_NESTING_DEPTH) {
    return {
      allowed: false,
      reason: `Max nesting depth (${MAX_NESTING_DEPTH} levels) reached for mobile clarity.`,
    };
  }

  return { allowed: true };
}

export function flattenContainersWithMeta(
  roots: LayoutTreeContainerNode[],
  customTitles?: Record<string, string>,
  depth = 0,
  parentId: string | null = null,
  prefix = ''
): FlattenedContainerEntry[] {
  const entries: FlattenedContainerEntry[] = [];
  for (const c of roots) {
    const label = getDisplayTitle(customTitles, c.id, c.title);
    const pathLabel = prefix ? `${prefix} › ${label}` : label;
    entries.push({ container: c, depth, parentId, pathLabel });
    const childContainers = c.children.filter(
      (ch): ch is LayoutTreeContainerNode => ch.type === 'container'
    );
    if (childContainers.length > 0) {
      entries.push(
        ...flattenContainersWithMeta(childContainers, customTitles, depth + 1, c.id, pathLabel)
      );
    }
  }
  return entries;
}

export function collectAllWidgetIds(roots: LayoutTreeContainerNode[]): Set<string> {
  const ids = new Set<string>();
  const visit = (nodes: LayoutTreeNode[]) => {
    for (const n of nodes) {
      if (n.type === 'widget') {
        ids.add(n.id);
      } else {
        visit(n.children);
      }
    }
  };
  visit(roots);
  return ids;
}

export function countVisibleWidgetsInSubtree(
  container: LayoutTreeContainerNode,
  hiddenItems: string[],
  hiddenContainers: string[]
): number {
  if (hiddenContainers.includes(container.id)) return 0;
  let total = 0;
  for (const child of container.children) {
    if (child.type === 'widget') {
      if (!hiddenItems.includes(child.id)) total += 1;
    } else {
      total += countVisibleWidgetsInSubtree(child, hiddenItems, hiddenContainers);
    }
  }
  return total;
}

function removeWidgetFromTree(
  roots: LayoutTreeContainerNode[],
  widgetId: string
): LayoutTreeContainerNode[] {
  return roots.map((c) => ({
    ...c,
    children: c.children
      .filter((ch) => !(ch.type === 'widget' && ch.id === widgetId))
      .map((ch) =>
        ch.type === 'container'
          ? removeWidgetFromTree([ch], widgetId)[0]
          : ch
      ),
  }));
}

export function moveWidgetInTree(
  roots: LayoutTreeContainerNode[],
  widgetId: string,
  targetContainerId: string,
  insertBeforeWidgetId?: string
): LayoutTreeContainerNode[] {
  const cleaned = removeWidgetFromTree(roots, widgetId);
  const newNode: LayoutTreeWidgetNode = { type: 'widget', id: widgetId };

  const insertInto = (nodes: LayoutTreeContainerNode[]): LayoutTreeContainerNode[] =>
    nodes.map((c) => {
      if (c.id === targetContainerId) {
        const nextChildren = [...c.children];
        if (insertBeforeWidgetId) {
          const idx = nextChildren.findIndex(
            (ch) => ch.type === 'widget' && ch.id === insertBeforeWidgetId
          );
          if (idx >= 0) {
            nextChildren.splice(idx, 0, newNode);
            return { ...c, children: nextChildren };
          }
        }
        // Insert after last widget (before child containers) for neat visual grouping
        const firstChildContainerIdx = nextChildren.findIndex((ch) => ch.type === 'container');
        if (firstChildContainerIdx >= 0) {
          nextChildren.splice(firstChildContainerIdx, 0, newNode);
        } else {
          nextChildren.push(newNode);
        }
        return { ...c, children: nextChildren };
      }

      return {
        ...c,
        children: c.children.map((ch) =>
          ch.type === 'container' ? insertInto([ch])[0] : ch
        ),
      };
    });

  return insertInto(cleaned);
}

function extractContainerFromTree(
  roots: LayoutTreeContainerNode[],
  containerId: string
): { tree: LayoutTreeContainerNode[]; extracted: LayoutTreeContainerNode | null } {
  let extracted: LayoutTreeContainerNode | null = null;

  const strip = (nodes: LayoutTreeContainerNode[]): LayoutTreeContainerNode[] => {
    const out: LayoutTreeContainerNode[] = [];
    for (const c of nodes) {
      if (c.id === containerId) {
        extracted = c;
        continue;
      }
      const nextChildren: LayoutTreeNode[] = [];
      for (const ch of c.children) {
        if (ch.type === 'container') {
          if (ch.id === containerId) {
            extracted = ch;
            continue;
          }
          const [updatedChild] = strip([ch]);
          if (updatedChild) nextChildren.push(updatedChild);
        } else {
          nextChildren.push(ch);
        }
      }
      out.push({ ...c, children: nextChildren });
    }
    return out;
  };

  const tree = strip(roots);
  return { tree, extracted };
}

export function moveContainerInTree(
  roots: LayoutTreeContainerNode[],
  containerId: string,
  targetParentId: string | null,
  insertIndex?: number
): LayoutTreeContainerNode[] {
  const check = canMoveContainerInto(roots, containerId, targetParentId);
  if (!check.allowed) return roots;

  const { tree: withoutDragged, extracted } = extractContainerFromTree(roots, containerId);
  if (!extracted) return roots;

  if (targetParentId === null) {
    const nextRoots = [...withoutDragged];
    if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= nextRoots.length) {
      nextRoots.splice(insertIndex, 0, extracted);
    } else {
      nextRoots.push(extracted);
    }
    return nextRoots;
  }

  const insertInto = (nodes: LayoutTreeContainerNode[]): LayoutTreeContainerNode[] =>
    nodes.map((c) => {
      if (c.id === targetParentId) {
        const nextChildren = [...c.children];
        if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= nextChildren.length) {
          nextChildren.splice(insertIndex, 0, extracted);
        } else {
          nextChildren.push(extracted);
        }
        return { ...c, children: nextChildren };
      }
      return {
        ...c,
        children: c.children.map((ch) =>
          ch.type === 'container' ? insertInto([ch])[0] : ch
        ),
      };
    });

  return insertInto(withoutDragged);
}

export function reorderContainerAmongSiblings(
  roots: LayoutTreeContainerNode[],
  containerId: string,
  delta: -1 | 1
): LayoutTreeContainerNode[] {
  const rootIdx = roots.findIndex((c) => c.id === containerId);
  if (rootIdx !== -1) {
    const target = rootIdx + delta;
    if (target < 0 || target >= roots.length) return roots;
    const next = [...roots];
    const [removed] = next.splice(rootIdx, 1);
    next.splice(target, 0, removed);
    return next;
  }

  const updateChildren = (nodes: LayoutTreeContainerNode[]): LayoutTreeContainerNode[] =>
    nodes.map((c) => {
      const childContainers = c.children.filter(
        (ch): ch is LayoutTreeContainerNode => ch.type === 'container'
      );
      const posInContainers = childContainers.findIndex((ch) => ch.id === containerId);
      if (posInContainers !== -1) {
        const target = posInContainers + delta;
        if (target < 0 || target >= childContainers.length) return c;
        const reorderedContainers = [...childContainers];
        const [removed] = reorderedContainers.splice(posInContainers, 1);
        reorderedContainers.splice(target, 0, removed);
        const widgets = c.children.filter((ch) => ch.type === 'widget');
        return { ...c, children: [...widgets, ...reorderedContainers] };
      }
      return {
        ...c,
        children: c.children.map((ch) =>
          ch.type === 'container' ? updateChildren([ch])[0] : ch
        ),
      };
    });

  return updateChildren(roots);
}

export function addContainerToTree(
  roots: LayoutTreeContainerNode[],
  newContainer: LayoutTreeContainerNode,
  parentId: string | null
): LayoutTreeContainerNode[] {
  if (!parentId) {
    return [newContainer, ...roots];
  }
  const parentDepth = getContainerDepth(roots, parentId);
  if (parentDepth === -1 || parentDepth + 1 >= MAX_NESTING_DEPTH) {
    return roots;
  }

  const insertInto = (nodes: LayoutTreeContainerNode[]): LayoutTreeContainerNode[] =>
    nodes.map((c) => {
      if (c.id === parentId) {
        return { ...c, children: [...c.children, newContainer] };
      }
      return {
        ...c,
        children: c.children.map((ch) =>
          ch.type === 'container' ? insertInto([ch])[0] : ch
        ),
      };
    });

  return insertInto(roots);
}

export function deleteCustomContainerFromTree(
  roots: LayoutTreeContainerNode[],
  containerId: string
): LayoutTreeContainerNode[] {
  const target = findContainerById(roots, containerId);
  if (!target || target.kind !== 'custom') return roots;

  const parentId = findParentContainerId(roots, containerId) ?? null;
  const { tree: withoutTarget } = extractContainerFromTree(roots, containerId);

  // Rescue children (both widgets and child containers) so nothing is ever lost
  const rescuedWidgets = target.children.filter(
    (ch): ch is LayoutTreeWidgetNode => ch.type === 'widget'
  );
  const rescuedContainers = target.children.filter(
    (ch): ch is LayoutTreeContainerNode => ch.type === 'container'
  );

  if (parentId) {
    const rescueIntoParent = (nodes: LayoutTreeContainerNode[]): LayoutTreeContainerNode[] =>
      nodes.map((c) => {
        if (c.id === parentId) {
          return { ...c, children: [...c.children, ...rescuedWidgets, ...rescuedContainers] };
        }
        return {
          ...c,
          children: c.children.map((ch) =>
            ch.type === 'container' ? rescueIntoParent([ch])[0] : ch
          ),
        };
      });
    return rescueIntoParent(withoutTarget);
  }

  // Root deletion: rescued child containers become root containers, rescued widgets move to first remaining container
  const nextRoots = [...withoutTarget, ...rescuedContainers];
  if (rescuedWidgets.length > 0 && nextRoots.length > 0) {
    nextRoots[0] = {
      ...nextRoots[0],
      children: [...nextRoots[0].children, ...rescuedWidgets],
    };
  }
  return nextRoots;
}
