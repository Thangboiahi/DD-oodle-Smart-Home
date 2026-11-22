'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Check,
  ChevronRight,
  EyeOff,
  FolderPlus,
  GripVertical,
  LayoutGrid,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DynamicCapabilityCard } from '@/components/capabilities/DynamicCapabilityCard';
import { simulatorEngine } from '@/lib/simulator/engine';
import { Badge, Button, EmptyState, triggerHaptic, useToast } from '@/components/ui';
import { CollapsibleSection } from './CollapsibleSection';
import {
  Layout2DGraph,
  LayoutContainer,
  LayoutItemSize,
  useWorkspace,
} from './WorkspaceProvider';
import { MONITOR_CATALOG, StandaloneMonitorWidget } from './StandaloneMonitors';

const SIZE_COL_CLASSES: Record<LayoutItemSize, string> = {
  S: 'col-span-1',
  M: 'col-span-1',
  L: 'col-span-1 md:col-span-2',
  Full: 'col-span-1 md:col-span-2 xl:col-span-3',
};

const SIZE_ORDER: LayoutItemSize[] = ['S', 'M', 'L', 'Full'];

export interface UniversalLayoutStudioProps {
  selectedRoomFilter: string;
  hasPlusHistory: boolean;
  onInspectDevice: (deviceId: string) => void;
}

export const UniversalLayoutStudio: React.FC<UniversalLayoutStudioProps> = ({
  selectedRoomFilter,
  hasPlusHistory,
  onInspectDevice,
}) => {
  const {
    prefs,
    snapshot,
    editLayoutMode,
    setEditLayoutMode,
    setLayout2D,
    resetLayout2D,
  } = useWorkspace();
  const { pushToast } = useToast();

  const layout = prefs.layout2D;
  const isOwner = prefs.userRole === 'OWNER';

  const [historyPast, setHistoryPast] = useState<Layout2DGraph[]>([]);
  const [historyFuture, setHistoryFuture] = useState<Layout2DGraph[]>([]);
  const [draggedItem, setDraggedItem] = useState<{ itemId: string; fromContainerId: string } | null>(null);
  const [dragOverContainerId, setDragOverContainerId] = useState<string | null>(null);
  const [moveMenuForItem, setMoveMenuForItem] = useState<{ itemId: string; fromContainerId: string } | null>(null);
  const [widgetCatalogOpen, setWidgetCatalogOpen] = useState(false);
  const [newContainerTitle, setNewContainerTitle] = useState('');
  const [renamingContainerId, setRenamingContainerId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const devicesList = Object.values(snapshot.devices);
  const hubMembers = devicesList
    .filter((d) => d.module_code !== 'HUB-01')
    .map((d) => ({
      device_id: d.device_id,
      name: d.name,
      module_code: d.module_code,
      via: d.state.via,
    }));

  const commitLayout = (next: Layout2DGraph, announcement?: string) => {
    setHistoryPast((prev) => [...prev.slice(-19), layout]);
    setHistoryFuture([]);
    setLayout2D(next);
    if (announcement) setLiveAnnouncement(announcement);
  };

  const handleUndo = () => {
    if (historyPast.length === 0) return;
    const prev = historyPast[historyPast.length - 1];
    setHistoryPast((p) => p.slice(0, -1));
    setHistoryFuture((f) => [layout, ...f]);
    setLayout2D(prev);
    triggerHaptic('step', prefs.hapticsEnabled);
    setLiveAnnouncement('Layout change undone.');
  };

  const handleRedo = () => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryFuture((f) => f.slice(1));
    setHistoryPast((p) => [...p, layout]);
    setLayout2D(next);
    triggerHaptic('step', prefs.hapticsEnabled);
    setLiveAnnouncement('Layout change redone.');
  };

  const moveItemToContainer = (
    itemId: string,
    fromContainerId: string,
    toContainerId: string,
    insertIndex?: number
  ) => {
    if (!itemId) return;
    const isDevice = Boolean(snapshot.devices[itemId]);
    const targetContainer = layout.containers.find((c) => c.id === toContainerId);
    if (!targetContainer) return;

    const nextContainers = layout.containers.map((c) => {
      const cleaned = c.itemIds.filter((id) => id !== itemId);
      if (c.id !== toContainerId) {
        return { ...c, itemIds: cleaned };
      }
      const nextIds = [...cleaned];
      if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= nextIds.length) {
        nextIds.splice(insertIndex, 0, itemId);
      } else {
        nextIds.push(itemId);
      }
      return { ...c, itemIds: nextIds };
    });

    // Hardware-Safe Persistence Split:
    // Only OWNER role mutates shared room_id mapping when moving a hardware device into a room container.
    let nextOverrides = layout.deviceRoomOverrides;
    if (isDevice && targetContainer.kind === 'room' && targetContainer.roomId) {
      if (isOwner) {
        nextOverrides = { ...layout.deviceRoomOverrides, [itemId]: targetContainer.roomId };
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ddoodle:device-room-sync', {
              detail: {
                homeId: prefs.activeHomeId,
                deviceId: itemId,
                roomId: targetContainer.roomId,
              },
            })
          );
        }
      } else {
        pushToast({
          title: 'Personal Layout Updated',
          description: 'Member role keeps shared home room_id unchanged.',
          tone: 'info',
        });
      }
    }

    triggerHaptic('drag', prefs.hapticsEnabled);
    commitLayout(
      {
        ...layout,
        containers: nextContainers,
        deviceRoomOverrides: nextOverrides,
      },
      `Moved ${snapshot.devices[itemId]?.name ?? itemId} to ${targetContainer.title}`
    );
    setMoveMenuForItem(null);
  };

  const moveContainerOrder = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= layout.containers.length) return;
    const next = [...layout.containers];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    triggerHaptic('step', prefs.hapticsEnabled);
    commitLayout({ ...layout, containers: next }, `Reordered ${removed.title}`);
  };

  const addCustomContainer = () => {
    const title = newContainerTitle.trim();
    if (!title) return;
    const id = `custom_${Date.now().toString(36)}`;
    const newContainer: LayoutContainer = {
      id,
      title,
      kind: 'custom',
      itemIds: [],
    };
    setNewContainerTitle('');
    triggerHaptic('tap', prefs.hapticsEnabled);
    commitLayout(
      { ...layout, containers: [newContainer, ...layout.containers] },
      `Created custom container ${title}`
    );
  };

  const deleteCustomContainer = (containerId: string) => {
    const target = layout.containers.find((c) => c.id === containerId);
    if (!target || target.kind !== 'custom') return;
    const remaining = layout.containers.filter((c) => c.id !== containerId);
    const fallbackId = remaining[0]?.id;
    const reassigned = remaining.map((c) =>
      c.id === fallbackId ? { ...c, itemIds: [...c.itemIds, ...target.itemIds] } : c
    );
    commitLayout({ ...layout, containers: reassigned }, `Deleted container ${target.title}`);
  };

  const setItemSize = (itemId: string, size: LayoutItemSize) => {
    triggerHaptic('step', prefs.hapticsEnabled);
    commitLayout({
      ...layout,
      itemSizes: { ...layout.itemSizes, [itemId]: size },
    });
  };

  const toggleHideMonitor = (itemId: string) => {
    const isHidden = layout.hiddenItems.includes(itemId);
    if (isHidden) {
      const nextHidden = layout.hiddenItems.filter((id) => id !== itemId);
      const firstContainer = layout.containers[0];
      const alreadyPlaced = layout.containers.some((c) => c.itemIds.includes(itemId));
      const nextContainers = alreadyPlaced
        ? layout.containers
        : layout.containers.map((c) =>
            c.id === firstContainer?.id ? { ...c, itemIds: [...c.itemIds, itemId] } : c
          );
      commitLayout({ ...layout, hiddenItems: nextHidden, containers: nextContainers });
    } else {
      commitLayout({ ...layout, hiddenItems: [...layout.hiddenItems, itemId] });
    }
  };

  const visibleContainers = layout.containers.filter((c) => {
    if (selectedRoomFilter === 'all') return true;
    return c.roomId === selectedRoomFilter || c.id === selectedRoomFilter;
  });

  return (
    <div className="space-y-4">
      {/* Screen reader live announcement for layout moves */}
      <div className="sr-only" aria-live="polite">
        {liveAnnouncement}
      </div>

      {/* Floating Animated Edit Mode Toolbar */}
      <AnimatePresence>
        {editLayoutMode && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="sticky top-16 z-20 rounded-[var(--dd-radius-card)] border border-primary-border bg-surface/95 backdrop-blur-md p-3 shadow-xl space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="accent">EDIT LAYOUT MODE</Badge>
                <span className="text-xs text-foreground-secondary">
                  {isOwner
                    ? 'Owner mode: room transfers sync device room_id.'
                    : 'Member mode: personal layout_2d only.'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={historyPast.length === 0}
                  onClick={handleUndo}
                  title="Undo layout change"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  <span>Undo</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={historyFuture.length === 0}
                  onClick={handleRedo}
                  title="Redo layout change"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                  <span>Redo</span>
                </Button>
                <Button
                  variant={widgetCatalogOpen ? 'accent' : 'secondary'}
                  size="sm"
                  onClick={() => setWidgetCatalogOpen((o) => !o)}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>+ Widget Catalog</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resetLayout2D();
                    setHistoryPast([]);
                    setHistoryFuture([]);
                    pushToast({ title: 'Dashboard Layout Reset to Default', tone: 'info' });
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setEditLayoutMode(false)}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Done</span>
                </Button>
              </div>
            </div>

            {/* + Add Container Bar */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/70">
              <input
                type="text"
                value={newContainerTitle}
                onChange={(e) => setNewContainerTitle(e.target.value)}
                placeholder="New container name (e.g. Favorites, Evening Controls, Upstairs)..."
                className="flex-1 min-w-[200px] h-9 rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated px-3 text-xs text-foreground focus:outline-none focus:border-primary"
              />
              <Button variant="secondary" size="sm" onClick={addCustomContainer}>
                <FolderPlus className="h-3.5 w-3.5" />
                <span>+ Add Container</span>
              </Button>
            </div>

            {/* + Widget Catalog */}
            {widgetCatalogOpen && (
              <div className="pt-2 border-t border-border/70 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {MONITOR_CATALOG.map((mon) => {
                  const visible = !layout.hiddenItems.includes(mon.id);
                  return (
                    <button
                      key={mon.id}
                      type="button"
                      onClick={() => toggleHideMonitor(mon.id)}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-[var(--dd-radius-control)] border px-2.5 py-2 text-left text-xs transition-colors cursor-pointer',
                        visible
                          ? 'border-primary-border bg-primary-soft text-foreground'
                          : 'border-border bg-surface-elevated text-foreground-secondary'
                      )}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{mon.title}</div>
                        <div className="text-[10px] text-foreground-muted truncate">{mon.category}</div>
                      </div>
                      <Badge variant={visible ? 'accent' : 'neutral'}>
                        {visible ? 'Shown' : 'Hidden'}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Containers & Rooms */}
      <div className="space-y-4">
        {visibleContainers.map((container, containerIdx) => {
          const activeItemIds = container.itemIds.filter(
            (id) => !layout.hiddenItems.includes(id)
          );
          const isDropTarget = dragOverContainerId === container.id;

          return (
            <div
              key={container.id}
              onDragOver={(e) => {
                if (!editLayoutMode) return;
                e.preventDefault();
                if (dragOverContainerId !== container.id) {
                  setDragOverContainerId(container.id);
                }
              }}
              onDragLeave={() => {
                if (dragOverContainerId === container.id) {
                  setDragOverContainerId(null);
                }
              }}
              onDrop={(e) => {
                if (!editLayoutMode) return;
                e.preventDefault();
                setDragOverContainerId(null);
                const payload = draggedItem ?? (() => {
                  try {
                    return JSON.parse(e.dataTransfer.getData('application/json')) as {
                      itemId: string;
                      fromContainerId: string;
                    };
                  } catch {
                    return null;
                  }
                })();
                if (payload) {
                  moveItemToContainer(payload.itemId, payload.fromContainerId, container.id);
                }
                setDraggedItem(null);
              }}
              className={cn(
                'rounded-[var(--dd-radius-card)] transition-all duration-150',
                isDropTarget && 'ring-2 ring-primary bg-primary-soft/20'
              )}
            >
              <CollapsibleSection
                sectionId={`layout_container_${container.id}`}
                title={container.title}
                subtitle={`${activeItemIds.length} item${activeItemIds.length === 1 ? '' : 's'}`}
                badge={
                  <Badge variant={container.kind === 'custom' ? 'accent' : 'mono'}>
                    {container.kind === 'custom' ? 'CUSTOM ZONE' : container.roomId ?? 'ROOM'}
                  </Badge>
                }
                actions={
                  editLayoutMode ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={containerIdx === 0}
                        aria-label={`Move ${container.title} up`}
                        onClick={() => moveContainerOrder(containerIdx, -1)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-surface text-foreground-muted hover:text-foreground disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={containerIdx === layout.containers.length - 1}
                        aria-label={`Move ${container.title} down`}
                        onClick={() => moveContainerOrder(containerIdx, 1)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-surface text-foreground-muted hover:text-foreground disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      {container.kind === 'custom' && (
                        <>
                          <button
                            type="button"
                            aria-label={`Rename ${container.title}`}
                            onClick={() => {
                              setRenamingContainerId(container.id);
                              setRenameDraft(container.title);
                            }}
                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-surface text-foreground-muted hover:text-foreground cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${container.title}`}
                            onClick={() => deleteCustomContainer(container.id)}
                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-surface text-danger hover:bg-danger-soft cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  ) : undefined
                }
              >
                {renamingContainerId === container.id && (
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      className="flex-1 h-9 rounded border border-border bg-surface-elevated px-2.5 text-xs text-foreground"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        if (renameDraft.trim()) {
                          commitLayout({
                            ...layout,
                            containers: layout.containers.map((c) =>
                              c.id === container.id ? { ...c, title: renameDraft.trim() } : c
                            ),
                          });
                        }
                        setRenamingContainerId(null);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                )}

                {activeItemIds.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<Plus className="h-4 w-4" />}
                    title="Drop any module or monitor here"
                    description={
                      editLayoutMode
                        ? 'Drag a card from another room or use "Move to..." on any item.'
                        : 'Enable Customize Layout to organize controls and telemetry here.'
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 dd-grid-gap">
                    {activeItemIds.map((itemId, itemIdx) => {
                      const device = snapshot.devices[itemId];
                      const isMonitor = !device;
                      const size: LayoutItemSize =
                        layout.itemSizes[itemId] ?? (itemId === 'mon_scenes' ? 'Full' : 'M');

                      return (
                        <motion.div
                          key={itemId}
                          layout={prefs.motionMode !== 'eco'}
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          draggable={editLayoutMode}
                          onDragStart={(e) => {
                            if (!editLayoutMode) return;
                            const dragEv = e as unknown as React.DragEvent<HTMLDivElement>;
                            setDraggedItem({ itemId, fromContainerId: container.id });
                            triggerHaptic('drag', prefs.hapticsEnabled);
                            if (dragEv.dataTransfer) {
                              dragEv.dataTransfer.effectAllowed = 'move';
                              dragEv.dataTransfer.setData(
                                'application/json',
                                JSON.stringify({ itemId, fromContainerId: container.id })
                              );
                            }
                          }}
                          onDragOver={(e) => {
                            if (!editLayoutMode) return;
                            e.preventDefault();
                          }}
                          onDrop={(e) => {
                            if (!editLayoutMode) return;
                            e.preventDefault();
                            e.stopPropagation();
                            if (draggedItem && draggedItem.itemId !== itemId) {
                              moveItemToContainer(
                                draggedItem.itemId,
                                draggedItem.fromContainerId,
                                container.id,
                                itemIdx
                              );
                            }
                            setDraggedItem(null);
                            setDragOverContainerId(null);
                          }}
                          onDragEnd={() => {
                            setDraggedItem(null);
                            setDragOverContainerId(null);
                          }}
                          className={cn(
                            'relative space-y-1.5 rounded-[var(--dd-radius-card)]',
                            SIZE_COL_CLASSES[size],
                            editLayoutMode && 'ring-1 ring-border-strong/70 p-1.5 bg-surface-elevated/40',
                            draggedItem?.itemId === itemId && 'opacity-50'
                          )}
                        >
                          {/* Edit Mode Item Header Bar */}
                          {editLayoutMode && (
                            <div className="flex flex-wrap items-center justify-between gap-1 px-1 pb-0.5">
                              <div className="inline-flex items-center gap-1 text-[10px] font-mono text-foreground-muted">
                                <GripVertical className="h-3.5 w-3.5 cursor-grab text-primary" />
                                <span className="truncate max-w-[110px]">
                                  {device ? device.module_code : 'WIDGET'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                {/* Resize S / M / L / Full */}
                                <div className="inline-flex rounded border border-border bg-surface p-0.5">
                                  {SIZE_ORDER.map((sz) => (
                                    <button
                                      key={sz}
                                      type="button"
                                      onClick={() => setItemSize(itemId, sz)}
                                      className={cn(
                                        'px-1.5 py-0.5 rounded text-[9px] font-mono cursor-pointer',
                                        size === sz
                                          ? 'bg-primary text-primary-foreground font-bold'
                                          : 'text-foreground-muted hover:text-foreground'
                                      )}
                                    >
                                      {sz}
                                    </button>
                                  ))}
                                </div>

                                {/* 1-Tap Move To... Menu (Mobile-friendly cross-container transfer) */}
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMoveMenuForItem((cur) =>
                                        cur?.itemId === itemId
                                          ? null
                                          : { itemId, fromContainerId: container.id }
                                      )
                                    }
                                    className="inline-flex items-center gap-1 h-6 px-2 rounded border border-border bg-surface text-[10px] font-mono text-foreground-secondary hover:text-primary cursor-pointer"
                                  >
                                    <ArrowRightLeft className="h-2.5 w-2.5" />
                                    <span>Move to</span>
                                  </button>

                                  {moveMenuForItem?.itemId === itemId && (
                                    <div className="absolute right-0 mt-1 w-48 rounded-lg border border-border-strong bg-surface p-1 shadow-xl z-40">
                                      {layout.containers.map((dest) => (
                                        <button
                                          key={dest.id}
                                          type="button"
                                          disabled={dest.id === container.id}
                                          onClick={() =>
                                            moveItemToContainer(itemId, container.id, dest.id)
                                          }
                                          className="w-full text-left px-2.5 py-1.5 rounded text-[11px] text-foreground hover:bg-surface-muted disabled:opacity-40 cursor-pointer truncate"
                                        >
                                          {dest.title}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {isMonitor && (
                                  <button
                                    type="button"
                                    title="Hide widget"
                                    aria-label="Hide widget"
                                    onClick={() => toggleHideMonitor(itemId)}
                                    className="h-6 w-6 inline-flex items-center justify-center rounded border border-border bg-surface text-foreground-muted hover:text-danger cursor-pointer"
                                  >
                                    <EyeOff className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Item Card Renderer */}
                          {device ? (
                            <div className="space-y-1">
                              {!editLayoutMode && (
                                <div className="flex items-center justify-between gap-2 px-0.5">
                                  <span className="text-[10px] font-mono text-foreground-muted">
                                    {device.device_id}
                                  </span>
                                  <Link
                                    href={
                                      device.module_code === 'VEH-01'
                                        ? `/vehicles/${device.device_id}`
                                        : `/devices/${device.device_id}`
                                    }
                                    className="inline-flex items-center gap-0.5 text-[11px] font-mono text-foreground-muted hover:text-primary transition-colors"
                                  >
                                    <span>Full Control</span>
                                    <ChevronRight className="h-3 w-3" />
                                  </Link>
                                </div>
                              )}

                              <DynamicCapabilityCard
                                device={device}
                                tariffInr={prefs.tariffInr}
                                hasPlusHistory={hasPlusHistory}
                                connectedHubMembers={
                                  device.module_code === 'HUB-01' ? hubMembers : undefined
                                }
                                onSendCommand={(deviceId, set) =>
                                  simulatorEngine.sendCommand(deviceId, set, 'pwa_cloud')
                                }
                                onTriggerCrash={() => simulatorEngine.triggerVehicleCrash()}
                                onInspect={onInspectDevice}
                                onOpenLocalAccess={(deviceId) => onInspectDevice(deviceId)}
                              />
                            </div>
                          ) : (
                            <StandaloneMonitorWidget monitorId={itemId} />
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </CollapsibleSection>
            </div>
          );
        })}
      </div>
    </div>
  );
};
