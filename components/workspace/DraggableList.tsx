'use client';

import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspace } from './WorkspaceProvider';

export interface DraggableItem {
  id: string;
  label?: string;
}

export interface DraggableListProps<T extends DraggableItem> {
  listId: string;
  items: T[];
  renderItem: (item: T, dragHandle: React.ReactNode) => React.ReactNode;
  className?: string;
  itemClassName?: string;
}

/**
 * Touch & Pointer Friendly Drag-to-Reorder Container.
 * Uses explicit drag handles + keyboard/mobile reorder arrows so mobile scrolling is never hijacked.
 */
export function DraggableList<T extends DraggableItem>({
  listId,
  items,
  renderItem,
  className,
  itemClassName,
}: DraggableListProps<T>) {
  const { getOrderList, setOrderList } = useWorkspace();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);

  const savedOrder = getOrderList(listId);

  const orderedItems = useMemo(() => {
    if (!savedOrder || savedOrder.length === 0) return items;
    const map = new Map(items.map((item) => [item.id, item]));
    const result: T[] = [];
    for (const id of savedOrder) {
      const found = map.get(id);
      if (found) {
        result.push(found);
        map.delete(id);
      }
    }
    for (const remaining of map.values()) {
      result.push(remaining);
    }
    return result;
  }, [items, savedOrder]);

  const moveItem = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= orderedItems.length || fromIndex === toIndex) return;
    const next = [...orderedItems];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setOrderList(
      listId,
      next.map((i) => i.id)
    );
  };

  return (
    <div className={cn('grid dd-grid-gap', className)}>
      {orderedItems.map((item, idx) => {
        const isDragging = draggingId === item.id;
        const isOver = dragOverId === item.id && draggingId !== item.id;

        const handle = (
          <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-elevated p-0.5">
            <span
              role="button"
              tabIndex={0}
              title="Drag handle to reorder"
              aria-label={`Drag to reorder ${item.label ?? item.id}`}
              onPointerDown={() => setArmedId(item.id)}
              onPointerUp={() => setArmedId(null)}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-foreground-muted hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
            <button
              type="button"
              disabled={idx === 0}
              aria-label={`Move ${item.label ?? item.id} earlier`}
              onClick={() => moveItem(idx, idx - 1)}
              className="inline-flex h-6 w-5 items-center justify-center rounded text-foreground-muted hover:text-foreground disabled:opacity-30 cursor-pointer"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              disabled={idx === orderedItems.length - 1}
              aria-label={`Move ${item.label ?? item.id} later`}
              onClick={() => moveItem(idx, idx + 1)}
              className="inline-flex h-6 w-5 items-center justify-center rounded text-foreground-muted hover:text-foreground disabled:opacity-30 cursor-pointer"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
          </div>
        );

        return (
          <div
            key={item.id}
            draggable={armedId === item.id}
            onDragStart={(e) => {
              setDraggingId(item.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', item.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverId !== item.id) setDragOverId(item.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const sourceId = e.dataTransfer.getData('text/plain') || draggingId;
              if (sourceId && sourceId !== item.id) {
                const fromIdx = orderedItems.findIndex((i) => i.id === sourceId);
                if (fromIdx !== -1) moveItem(fromIdx, idx);
              }
              setDraggingId(null);
              setDragOverId(null);
              setArmedId(null);
            }}
            onDragEnd={() => {
              setDraggingId(null);
              setDragOverId(null);
              setArmedId(null);
            }}
            className={cn(
              'transition-all duration-150',
              isDragging && 'opacity-50 scale-[0.99]',
              isOver && 'ring-2 ring-accent/60 rounded-[var(--dd-radius-card)]',
              itemClassName
            )}
          >
            {renderItem(item, handle)}
          </div>
        );
      })}
    </div>
  );
}
