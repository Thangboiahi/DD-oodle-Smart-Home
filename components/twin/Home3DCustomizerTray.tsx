'use client';

import React, { useMemo } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Box,
  Check,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Eye,
  EyeOff,
  Home,
  Layers,
  LayoutGrid,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  HomeLayout3D,
  HomeTemplateId,
  Layout3DFloor,
  Layout3DPlacement,
  Layout3DRoom,
  Layout3DSurface,
} from '@/lib/protocol/contract';
import { VirtualDeviceInstance } from '@/lib/simulator/types';
import {
  ROOM_ACCENT_TINTS,
  clampNumber,
  defaultPlacementForDevice,
  findNonOverlappingRoomPosition,
  snapToHalfMeter,
} from '@/lib/twin/layout3DStore';
import { cn } from '@/lib/utils';

export type CustomizerTab = 'templates' | 'floors' | 'rooms' | 'modules';

export interface Home3DCustomizerTrayProps {
  layout: HomeLayout3D;
  devices: Record<string, VirtualDeviceInstance>;
  activeTab: CustomizerTab;
  onTabChange: (tab: CustomizerTab) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
  selectedPlacementDeviceId: string | null;
  onSelectPlacementDevice: (deviceId: string | null) => void;
  snapTargetDeviceId: string | null;
  onStartSnapPlacement: (deviceId: string) => void;
  onCancelSnapPlacement: () => void;
  onApplyTemplate: (templateId: HomeTemplateId) => void;
  onResetTemplate: () => void;
  onMutateLayout: (updater: (prev: HomeLayout3D) => HomeLayout3D) => void;
  autoCutaway: boolean;
  onToggleAutoCutaway: () => void;
  showRoomLabels: boolean;
  onToggleRoomLabels: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  saving: boolean;
  isDirty: boolean;
  onClose: () => void;
  isLightTheme: boolean;
  isAdminInstaller?: boolean;
}

const FLOOR_MATERIALS: Array<{ id: Layout3DRoom['floor_type']; label: string }> = [
  { id: 'marble', label: 'Marble' },
  { id: 'wood', label: 'Wood' },
  { id: 'tile', label: 'Tile' },
  { id: 'kitchen_tile', label: 'Kitchen' },
  { id: 'outdoor', label: 'Terrace' },
  { id: 'garage', label: 'Garage' },
];

const SURFACE_OPTIONS: Array<{ id: Layout3DSurface; label: string }> = [
  { id: 'north', label: 'N Wall' },
  { id: 'south', label: 'S Wall' },
  { id: 'east', label: 'E Wall' },
  { id: 'west', label: 'W Wall' },
  { id: 'floor', label: 'Floor' },
  { id: 'ceiling', label: 'Ceiling' },
];

const TEMPLATES: Array<{ id: HomeTemplateId; label: string; desc: string }> = [
  { id: '1bhk', label: '1BHK', desc: 'Living, 1 Bed, Kitchen, Bath, Roof' },
  { id: '2bhk', label: '2BHK', desc: 'Living, 2 Bed, Kitchen, Bath, Terrace' },
  { id: '3bhk', label: '3BHK', desc: 'Large Living, 3 Bed, Porch, Terrace' },
  { id: 'duplex', label: 'Duplex', desc: 'Ground + First Floor + Roof Terrace' },
  { id: 'compact', label: 'Compact', desc: 'Studio + Kitchen + Bath + Terrace' },
];

export const Home3DCustomizerTray: React.FC<Home3DCustomizerTrayProps> = ({
  layout,
  devices,
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapsed,
  selectedRoomId,
  onSelectRoom,
  selectedPlacementDeviceId,
  onSelectPlacementDevice,
  snapTargetDeviceId,
  onStartSnapPlacement,
  onCancelSnapPlacement,
  onApplyTemplate,
  onResetTemplate,
  onMutateLayout,
  autoCutaway,
  onToggleAutoCutaway,
  showRoomLabels,
  onToggleRoomLabels,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  saving,
  isDirty,
  onClose,
  isLightTheme,
  isAdminInstaller = false,
}) => {
  const floors = useMemo(
    () => [...(layout.floors ?? [])].sort((a, b) => a.order - b.order),
    [layout.floors]
  );
  const rooms = useMemo(() => layout.rooms ?? [], [layout.rooms]);
  const placements = useMemo(() => layout.placements ?? [], [layout.placements]);
  const devicesList = useMemo(() => Object.values(devices), [devices]);

  const placementByDeviceId = useMemo(
    () => new Map(placements.map((p) => [p.device_id, p])),
    [placements]
  );
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const floorById = useMemo(() => new Map(floors.map((f) => [f.id, f])), [floors]);

  const activeRoom =
    (selectedRoomId ? roomById.get(selectedRoomId) : null) ?? rooms[0] ?? null;

  const activePlacementDev = selectedPlacementDeviceId
    ? devices[selectedPlacementDeviceId] ?? null
    : null;
  const activePlacement = selectedPlacementDeviceId
    ? placementByDeviceId.get(selectedPlacementDeviceId) ?? null
    : null;

  // Group all home devices by their placed or assigned room
  const groupedDevices = useMemo(() => {
    const groups = new Map<string, VirtualDeviceInstance[]>();
    for (const r of rooms) {
      groups.set(r.id, []);
    }
    const unassigned: VirtualDeviceInstance[] = [];

    for (const dev of devicesList) {
      const p = placementByDeviceId.get(dev.device_id);
      const targetRoomId = p?.room_id ?? dev.room_id;
      if (targetRoomId && groups.has(targetRoomId)) {
        groups.get(targetRoomId)?.push(dev);
      } else {
        unassigned.push(dev);
      }
    }
    return { groups, unassigned };
  }, [devicesList, rooms, placementByDeviceId]);

  const traySurface = isLightTheme
    ? 'bg-[rgba(255,255,255,0.95)] border-slate-300 text-slate-900'
    : 'bg-[rgba(15,23,42,0.94)] border-slate-700 text-slate-100';

  const chipSurface = isLightTheme
    ? 'bg-slate-100 border-slate-300 text-slate-800 hover:border-accent'
    : 'bg-slate-800/90 border-slate-700 text-slate-200 hover:border-accent';

  const inputClass = isLightTheme
    ? 'bg-white border border-slate-300 text-slate-900 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-accent'
    : 'bg-slate-800 border border-slate-600 text-slate-100 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-accent';

  // --- Tap-to-Snap Active Floating Prompt (Ultra-Slim, Zero Scene Obstruction) ---
  if (snapTargetDeviceId) {
    const snapDev = devices[snapTargetDeviceId];
    return (
      <div className="absolute bottom-3 inset-x-3 z-30 flex justify-center pointer-events-none">
        <div
          className={cn(
            'pointer-events-auto inline-flex items-center gap-2 rounded-full border border-accent px-3.5 py-2 shadow-2xl text-xs max-w-full',
            traySurface
          )}
        >
          <Crosshair className="h-4 w-4 text-accent animate-pulse shrink-0" />
          <span className="truncate font-medium">
            Tap any 3D wall, floor, or ceiling to snap{' '}
            <strong className="text-accent">{snapDev?.name ?? snapTargetDeviceId}</strong>
          </span>
          <button
            type="button"
            onClick={onCancelSnapPlacement}
            className="inline-flex h-6 items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/40 px-2.5 text-[11px] font-semibold text-rose-500 hover:bg-rose-500/25 cursor-pointer shrink-0"
          >
            <X className="h-3 w-3" />
            <span>Cancel</span>
          </button>
        </div>
      </div>
    );
  }

  // --- Floor Manager Mutations ---
  const handleAddFloor = () => {
    if (floors.length >= 8) return;
    const nextIdx = floors.length;
    const newId = `fl_${Date.now().toString(36).slice(-4)}`;
    const label = nextIdx === 1 ? 'First Floor' : nextIdx === 2 ? 'Second Floor' : `Floor ${nextIdx}`;
    const shortLabel = `${nextIdx}F`;
    const newFloor: Layout3DFloor = {
      id: newId,
      label,
      short_label: shortLabel,
      order: nextIdx,
      wall_height: 2.65,
      slab_thickness: 0.18,
      visible: true,
    };
    const defaultRoom: Layout3DRoom = {
      id: `room_${Date.now().toString(36).slice(-4)}`,
      name: `${label} Hall`,
      short_name: `${shortLabel} Hall`,
      floor_id: newId,
      x: 0,
      z: 0,
      w: 4.5,
      d: 4.0,
      floor_type: 'marble',
      accent_tint: null,
    };
    onMutateLayout((prev) => ({
      ...prev,
      floors: [...(prev.floors ?? []), newFloor],
      rooms: [...(prev.rooms ?? []), defaultRoom],
    }));
    onSelectRoom(defaultRoom.id);
  };

  const handleRenameFloor = (floorId: string, nextLabel: string) => {
    onMutateLayout((prev) => ({
      ...prev,
      floors: (prev.floors ?? []).map((f) =>
        f.id === floorId
          ? {
              ...f,
              label: nextLabel,
              short_label: nextLabel.trim().slice(0, 4).toUpperCase() || f.short_label,
            }
          : f
      ),
    }));
  };

  const handleToggleFloorVisibility = (floorId: string) => {
    onMutateLayout((prev) => ({
      ...prev,
      floors: (prev.floors ?? []).map((f) =>
        f.id === floorId ? { ...f, visible: f.visible === false ? true : false } : f
      ),
    }));
  };

  const handleReorderFloor = (floorId: string, dir: -1 | 1) => {
    const idx = floors.findIndex((f) => f.id === floorId);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= floors.length) return;
    const reordered = [...floors];
    const [item] = reordered.splice(idx, 1);
    reordered.splice(swapIdx, 0, item);
    const normalized = reordered.map((f, i) => ({ ...f, order: i }));
    onMutateLayout((prev) => ({
      ...prev,
      floors: normalized,
    }));
  };

  const handleDeleteFloor = (floorId: string) => {
    if (floors.length <= 1) return;
    const fallbackFloor = floors.find((f) => f.id !== floorId);
    if (!fallbackFloor) return;

    onMutateLayout((prev) => {
      const remainingFloors = (prev.floors ?? [])
        .filter((f) => f.id !== floorId)
        .sort((a, b) => a.order - b.order)
        .map((f, i) => ({ ...f, order: i }));

      const remainingRooms = (prev.rooms ?? []).filter((r) => r.floor_id !== floorId);
      const fallbackRoom = remainingRooms[0];
      const remainingRoomIds = new Set(remainingRooms.map((r) => r.id));

      const nextPlacements = (prev.placements ?? []).map((p) => {
        if (remainingRoomIds.has(p.room_id)) return p;
        return fallbackRoom
          ? { ...p, room_id: fallbackRoom.id, floor_id: fallbackRoom.floor_id }
          : p;
      });

      return {
        ...prev,
        floors: remainingFloors,
        rooms: remainingRooms,
        placements: nextPlacements,
      };
    });
  };

  // --- Room Builder Mutations ---
  const handleAddRoom = (targetFloorId: string) => {
    if (rooms.length >= 40) return;
    const floorRooms = rooms.filter((r) => r.floor_id === targetFloorId);
    const w = 3.5;
    const d = 3.5;
    const pos = findNonOverlappingRoomPosition(floorRooms, w, d);
    const idx = floorRooms.length + 1;
    const newRoom: Layout3DRoom = {
      id: `room_${Date.now().toString(36).slice(-5)}`,
      name: `Room ${idx}`,
      short_name: `Room ${idx}`,
      floor_id: targetFloorId,
      x: pos.x,
      z: pos.z,
      w,
      d,
      floor_type: targetFloorId === 'roof' ? 'outdoor' : 'tile',
      accent_tint: null,
    };
    onMutateLayout((prev) => ({
      ...prev,
      rooms: [...(prev.rooms ?? []), newRoom],
    }));
    onSelectRoom(newRoom.id);
  };

  const handleUpdateRoom = (roomId: string, patch: Partial<Layout3DRoom>) => {
    onMutateLayout((prev) => ({
      ...prev,
      rooms: (prev.rooms ?? []).map((r) => {
        if (r.id !== roomId) return r;
        const next: Layout3DRoom = { ...r, ...patch };
        if (patch.name !== undefined) {
          next.short_name = patch.name.trim().slice(0, 14) || r.short_name;
        }
        return next;
      }),
    }));
  };

  const handleDeleteRoom = (roomId: string) => {
    if (rooms.length <= 1) return;
    const fallbackRoom = rooms.find((r) => r.id !== roomId);
    if (!fallbackRoom) return;
    onMutateLayout((prev) => ({
      ...prev,
      rooms: (prev.rooms ?? []).filter((r) => r.id !== roomId),
      placements: (prev.placements ?? []).map((p) =>
        p.room_id === roomId
          ? { ...p, room_id: fallbackRoom.id, floor_id: fallbackRoom.floor_id }
          : p
      ),
    }));
    onSelectRoom(fallbackRoom.id);
  };

  // --- Module Placement Mutations ---
  const ensureAndMutatePlacement = (
    deviceId: string,
    updater: (current: Layout3DPlacement, room: Layout3DRoom) => Layout3DPlacement
  ) => {
    const dev = devices[deviceId];
    if (!dev) return;
    onMutateLayout((prev) => {
      const prevRooms = prev.rooms ?? [];
      const prevPlacements = prev.placements ?? [];
      const existing = prevPlacements.find((p) => p.device_id === deviceId);
      const room =
        prevRooms.find((r) => r.id === (existing?.room_id ?? dev.room_id)) ?? prevRooms[0];
      if (!room) return prev;

      const base = existing ?? defaultPlacementForDevice(dev, room, 0);
      const nextPlacement = updater(base, room);
      const exists = prevPlacements.some((p) => p.device_id === deviceId);

      return {
        ...prev,
        placements: exists
          ? prevPlacements.map((p) => (p.device_id === deviceId ? nextPlacement : p))
          : [...prevPlacements, nextPlacement],
      };
    });
  };

  // --- Collapsed Mini Bar (Auto-Minimizes While Orbiting) ---
  if (collapsed) {
    return (
      <div className="absolute bottom-3 inset-x-3 z-30 flex justify-center pointer-events-none">
        <div
          className={cn(
            'pointer-events-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 shadow-2xl text-xs max-w-full',
            traySurface
          )}
        >
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="inline-flex h-7 items-center gap-1 rounded-full bg-accent px-2.5 text-[11px] font-semibold text-[var(--dd-accent-fg)] cursor-pointer shrink-0"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            <span>{isAdminInstaller ? 'DFY 3D Studio' : '3D Studio'}</span>
          </button>

          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 disabled:opacity-35 hover:border-accent cursor-pointer shrink-0"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 disabled:opacity-35 hover:border-accent cursor-pointer shrink-0"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold cursor-pointer shrink-0',
              isDirty
                ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                : 'border border-border/70 hover:border-accent'
            )}
          >
            <Save className="h-3 w-3" />
            <span>{saving ? 'Saving...' : isDirty ? 'Save*' : 'Saved'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Exit Customize 3D"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-surface-elevated cursor-pointer shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const activePlacementRoom = activePlacement
    ? roomById.get(activePlacement.room_id) ?? rooms[0]
    : activePlacementDev
    ? roomById.get(activePlacementDev.room_id) ?? rooms[0]
    : null;
  const activePlacementFloor = activePlacementRoom
    ? floorById.get(activePlacementRoom.floor_id)
    : null;
  const activePlacementWallH =
    activePlacementRoom?.wall_height ?? activePlacementFloor?.wall_height ?? 2.65;
  const activeSurface: Layout3DSurface = activePlacement?.surface ?? 'north';
  const isWallSurface =
    activeSurface === 'north' ||
    activeSurface === 'south' ||
    activeSurface === 'east' ||
    activeSurface === 'west';

  return (
    <div className="absolute bottom-2.5 inset-x-2.5 z-30 flex justify-center pointer-events-none">
      <div
        className={cn(
          'pointer-events-auto w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col overflow-hidden text-xs',
          traySurface
        )}
      >
        {/* Top Studio Bar: Tabs + Undo/Redo/Save/Collapse/Close */}
        <div className="flex items-center justify-between gap-1.5 border-b border-border/60 px-2.5 py-1.5">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'templates', label: 'Templates', icon: Home },
                { id: 'floors', label: `Floors (${floors.length})`, icon: Layers },
                { id: 'rooms', label: `Rooms (${rooms.length})`, icon: LayoutGrid },
                { id: 'modules', label: `Modules (${devicesList.length})`, icon: Box },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0',
                    active
                      ? 'bg-accent text-[var(--dd-accent-fg)]'
                      : 'opacity-75 hover:opacity-100 hover:bg-surface-elevated/60'
                  )}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo"
              aria-label="Undo"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 disabled:opacity-35 hover:border-accent cursor-pointer"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo"
              aria-label="Redo"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 disabled:opacity-35 hover:border-accent cursor-pointer"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold cursor-pointer',
                isDirty
                  ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                  : 'border border-border/60 hover:border-accent'
              )}
            >
              <Save className="h-3 w-3" />
              <span className="hidden sm:inline">{saving ? 'Saving' : isDirty ? 'Save*' : 'Saved'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleCollapsed}
              title="Minimize tray to inspect 3D"
              aria-label="Minimize tray"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 hover:border-accent cursor-pointer"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close Customize 3D"
              aria-label="Close Customize 3D"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-surface-elevated cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Collapsible Tab Body */}
        <div className="max-h-[38vh] overflow-y-auto dd-scroll p-2.5 space-y-2.5">
          {/* TAB 1: TEMPLATES & VIEW OPTIONS */}
          {activeTab === 'templates' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">
                  Start from an Indian Home Template (layout_3d)
                </span>
                <button
                  type="button"
                  onClick={onResetTemplate}
                  className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-2 py-1 text-[10px] font-mono font-semibold hover:border-accent cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3 text-accent" />
                  <span>Reset Template</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {TEMPLATES.map((t) => {
                  const active = layout.template_id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onApplyTemplate(t.id)}
                      className={cn(
                        'rounded-xl border p-2 text-left transition-colors cursor-pointer space-y-0.5',
                        active
                          ? 'border-accent bg-accent-soft text-accent'
                          : chipSurface
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-xs">{t.label}</span>
                        {active && <Check className="h-3 w-3 shrink-0" />}
                      </div>
                      <div className="text-[10px] opacity-70 leading-tight">{t.desc}</div>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
                <button
                  type="button"
                  onClick={onToggleAutoCutaway}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium cursor-pointer',
                    autoCutaway ? 'border-accent bg-accent-soft text-accent' : chipSurface
                  )}
                >
                  <span>Auto-Cutaway Walls:</span>
                  <strong className="font-mono">{autoCutaway ? 'ON' : 'OFF'}</strong>
                </button>
                <button
                  type="button"
                  onClick={onToggleRoomLabels}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium cursor-pointer',
                    showRoomLabels ? 'border-accent bg-accent-soft text-accent' : chipSurface
                  )}
                >
                  <span>Room Name Labels:</span>
                  <strong className="font-mono">{showRoomLabels ? 'ON' : 'OFF'}</strong>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: FLOOR MANAGER */}
          {activeTab === 'floors' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">
                  Floors (Bottom to Top) · Max 8
                </span>
                <button
                  type="button"
                  onClick={handleAddFloor}
                  disabled={floors.length >= 8}
                  className="inline-flex h-7 items-center gap-1 rounded-lg bg-accent px-2.5 text-[11px] font-semibold text-[var(--dd-accent-fg)] disabled:opacity-40 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Floor</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {floors.map((fl, idx) => {
                  const roomCount = rooms.filter((r) => r.floor_id === fl.id).length;
                  const isVisible = fl.visible !== false;
                  return (
                    <div
                      key={fl.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-surface-elevated/50 px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent shrink-0">
                          {fl.short_label}
                        </span>
                        <input
                          type="text"
                          aria-label={`Floor ${fl.id} name`}
                          value={fl.label}
                          onChange={(e) => handleRenameFloor(fl.id, e.target.value)}
                          className={cn(inputClass, 'min-w-[110px] flex-1 max-w-[170px]')}
                        />
                        <span className="text-[10px] font-mono opacity-65 whitespace-nowrap">
                          {roomCount} rm
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleFloorVisibility(fl.id)}
                          title={isVisible ? 'Hide floor in 3D' : 'Show floor in 3D'}
                          className={cn(
                            'inline-flex h-7 w-7 items-center justify-center rounded-lg border cursor-pointer',
                            isVisible
                              ? 'border-border/60 text-accent hover:border-accent'
                              : 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                          )}
                        >
                          {isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReorderFloor(fl.id, 1)}
                          disabled={idx === floors.length - 1}
                          title="Move floor up"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 disabled:opacity-30 hover:border-accent cursor-pointer"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReorderFloor(fl.id, -1)}
                          disabled={idx === 0}
                          title="Move floor down"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 disabled:opacity-30 hover:border-accent cursor-pointer"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFloor(fl.id)}
                          disabled={floors.length <= 1}
                          title="Delete floor"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 text-rose-400 disabled:opacity-30 hover:border-rose-500 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: ROOM BUILDER */}
          {activeTab === 'rooms' && (
            <div className="space-y-2.5">
              {/* Room Selector Strip + Add Room */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1">
                  {rooms.map((rm) => {
                    const active = activeRoom?.id === rm.id;
                    const fl = floorById.get(rm.floor_id);
                    return (
                      <button
                        key={rm.id}
                        type="button"
                        onClick={() => onSelectRoom(rm.id)}
                        className={cn(
                          'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium whitespace-nowrap cursor-pointer shrink-0',
                          active
                            ? 'border-accent bg-accent text-[var(--dd-accent-fg)] font-semibold'
                            : chipSurface
                        )}
                      >
                        <span>{rm.short_name}</span>
                        <span className="font-mono text-[9px] opacity-75">{fl?.short_label}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => handleAddRoom(activeRoom?.floor_id ?? floors[0]?.id ?? 'gf')}
                  disabled={rooms.length >= 40}
                  className="inline-flex h-7 items-center gap-1 rounded-lg bg-accent px-2.5 text-[11px] font-semibold text-[var(--dd-accent-fg)] shrink-0 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Room</span>
                </button>
              </div>

              {activeRoom && (
                <div className="rounded-xl border border-border/60 bg-surface-elevated/40 p-2.5 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex-1 min-w-[130px] space-y-0.5">
                      <span className="text-[10px] font-mono opacity-70 block">Room Name</span>
                      <input
                        type="text"
                        value={activeRoom.name}
                        onChange={(e) => handleUpdateRoom(activeRoom.id, { name: e.target.value })}
                        className={cn(inputClass, 'w-full')}
                      />
                    </label>
                    <label className="w-28 space-y-0.5">
                      <span className="text-[10px] font-mono opacity-70 block">Floor</span>
                      <select
                        value={activeRoom.floor_id}
                        onChange={(e) =>
                          handleUpdateRoom(activeRoom.id, { floor_id: e.target.value })
                        }
                        className={cn(inputClass, 'w-full')}
                      >
                        {floors.map((fl) => (
                          <option key={fl.id} value={fl.id}>
                            {fl.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="w-24 space-y-0.5">
                      <span className="text-[10px] font-mono opacity-70 block">Surface</span>
                      <select
                        value={activeRoom.floor_type}
                        onChange={(e) =>
                          handleUpdateRoom(activeRoom.id, {
                            floor_type: e.target.value as Layout3DRoom['floor_type'],
                          })
                        }
                        className={cn(inputClass, 'w-full')}
                      >
                        {FLOOR_MATERIALS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleDeleteRoom(activeRoom.id)}
                      disabled={rooms.length <= 1}
                      title="Delete Room"
                      className="mt-4 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 text-rose-400 disabled:opacity-30 hover:border-rose-500 cursor-pointer shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Dimensions & 0.5m Grid Position */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-[11px]">
                    <div className="space-y-0.5">
                      <span className="text-[10px] opacity-70 block">Width ({activeRoom.w.toFixed(1)}m)</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRoom(activeRoom.id, {
                              w: clampNumber(snapToHalfMeter(activeRoom.w - 0.5), 1.5, 12),
                            })
                          }
                          className="h-7 w-7 rounded border border-border/70 font-bold hover:border-accent cursor-pointer"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRoom(activeRoom.id, {
                              w: clampNumber(snapToHalfMeter(activeRoom.w + 0.5), 1.5, 12),
                            })
                          }
                          className="h-7 w-7 rounded border border-border/70 font-bold hover:border-accent cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] opacity-70 block">Depth ({activeRoom.d.toFixed(1)}m)</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRoom(activeRoom.id, {
                              d: clampNumber(snapToHalfMeter(activeRoom.d - 0.5), 1.5, 12),
                            })
                          }
                          className="h-7 w-7 rounded border border-border/70 font-bold hover:border-accent cursor-pointer"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRoom(activeRoom.id, {
                              d: clampNumber(snapToHalfMeter(activeRoom.d + 0.5), 1.5, 12),
                            })
                          }
                          className="h-7 w-7 rounded border border-border/70 font-bold hover:border-accent cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] opacity-70 block">
                        Wall H ({(activeRoom.wall_height ?? floorById.get(activeRoom.floor_id)?.wall_height ?? 2.65).toFixed(1)}m)
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const cur =
                              activeRoom.wall_height ??
                              floorById.get(activeRoom.floor_id)?.wall_height ??
                              2.65;
                            handleUpdateRoom(activeRoom.id, {
                              wall_height: Number(clampNumber(cur - 0.2, 0.9, 3.8).toFixed(1)),
                            });
                          }}
                          className="h-7 w-7 rounded border border-border/70 font-bold hover:border-accent cursor-pointer"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const cur =
                              activeRoom.wall_height ??
                              floorById.get(activeRoom.floor_id)?.wall_height ??
                              2.65;
                            handleUpdateRoom(activeRoom.id, {
                              wall_height: Number(clampNumber(cur + 0.2, 0.9, 3.8).toFixed(1)),
                            });
                          }}
                          className="h-7 w-7 rounded border border-border/70 font-bold hover:border-accent cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] opacity-70 block">Pos X ({activeRoom.x.toFixed(1)}m)</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRoom(activeRoom.id, {
                              x: snapToHalfMeter(activeRoom.x - 0.5),
                            })
                          }
                          className="h-7 w-7 rounded border border-border/70 font-bold hover:border-accent cursor-pointer"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRoom(activeRoom.id, {
                              x: snapToHalfMeter(activeRoom.x + 0.5),
                            })
                          }
                          className="h-7 w-7 rounded border border-border/70 font-bold hover:border-accent cursor-pointer"
                        >
                          →
                        </button>
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] opacity-70 block">Pos Z ({activeRoom.z.toFixed(1)}m)</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRoom(activeRoom.id, {
                              z: snapToHalfMeter(activeRoom.z - 0.5),
                            })
                          }
                          className="h-7 w-7 rounded border border-border/70 font-bold hover:border-accent cursor-pointer"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRoom(activeRoom.id, {
                              z: snapToHalfMeter(activeRoom.z + 0.5),
                            })
                          }
                          className="h-7 w-7 rounded border border-border/70 font-bold hover:border-accent cursor-pointer"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Subtle Floor Accent Tint */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-mono opacity-70 mr-1">Floor Tint:</span>
                    {ROOM_ACCENT_TINTS.map((tint) => {
                      const active = (activeRoom.accent_tint ?? null) === tint.hex;
                      return (
                        <button
                          key={tint.id}
                          type="button"
                          onClick={() => handleUpdateRoom(activeRoom.id, { accent_tint: tint.hex })}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] cursor-pointer',
                            active ? 'border-accent bg-accent-soft text-accent font-semibold' : chipSurface
                          )}
                        >
                          {tint.hex && (
                            <span
                              className="h-2.5 w-2.5 rounded-full border border-slate-400/60"
                              style={{ backgroundColor: tint.hex }}
                            />
                          )}
                          <span>{tint.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SMART MODULE & MONITOR PLACEMENT */}
          {activeTab === 'modules' && (
            <div className="space-y-2.5">
              {/* Grouped Device Selector */}
              <div className="space-y-1.5">
                {rooms.map((rm) => {
                  const list = groupedDevices.groups.get(rm.id) ?? [];
                  if (list.length === 0) return null;
                  return (
                    <div key={rm.id} className="space-y-1">
                      <div className="text-[10px] font-mono uppercase opacity-65">
                        {rm.name} ({list.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {list.map((dev) => {
                          const p = placementByDeviceId.get(dev.device_id);
                          const isSelected = selectedPlacementDeviceId === dev.device_id;
                          return (
                            <button
                              key={dev.device_id}
                              type="button"
                              onClick={() => onSelectPlacementDevice(dev.device_id)}
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] transition-colors cursor-pointer',
                                isSelected
                                  ? 'border-accent bg-accent text-[var(--dd-accent-fg)] font-semibold'
                                  : p?.hidden
                                  ? 'border-dashed border-border/70 opacity-55 hover:opacity-90'
                                  : chipSurface
                              )}
                            >
                              <span className="truncate max-w-[130px]">{dev.name}</span>
                              <span className="font-mono text-[9px] opacity-80">
                                {p?.hidden ? 'HIDDEN' : p?.surface.toUpperCase() ?? dev.module_code}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {groupedDevices.unassigned.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono uppercase opacity-65">Other Modules</div>
                    <div className="flex flex-wrap gap-1.5">
                      {groupedDevices.unassigned.map((dev) => {
                        const isSelected = selectedPlacementDeviceId === dev.device_id;
                        return (
                          <button
                            key={dev.device_id}
                            type="button"
                            onClick={() => onSelectPlacementDevice(dev.device_id)}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] cursor-pointer',
                              isSelected
                                ? 'border-accent bg-accent text-[var(--dd-accent-fg)] font-semibold'
                                : chipSurface
                            )}
                          >
                            <span>{dev.name}</span>
                            <span className="font-mono text-[9px] opacity-80">{dev.module_code}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Selected Module Surface Placement & Fine-Tune Controls */}
              {activePlacementDev ? (
                <div className="rounded-xl border border-accent/40 bg-surface-elevated/50 p-2.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-xs truncate">
                        {activePlacementDev.name}{' '}
                        <span className="font-mono text-[10px] text-accent">
                          ({activePlacementDev.module_code})
                        </span>
                      </div>
                      <div className="text-[10px] font-mono opacity-65">
                        {activePlacement?.hidden
                          ? 'Removed from 3D view'
                          : `${activePlacementRoom?.name ?? 'Room'} · ${activeSurface.toUpperCase()} surface`}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onStartSnapPlacement(activePlacementDev.device_id)}
                        className="inline-flex h-7 items-center gap-1 rounded-lg bg-accent px-2.5 text-[11px] font-semibold text-[var(--dd-accent-fg)] cursor-pointer"
                      >
                        <Crosshair className="h-3.5 w-3.5" />
                        <span>Tap 3D Surface to Snap</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          ensureAndMutatePlacement(activePlacementDev.device_id, (cur) => ({
                            ...cur,
                            hidden: !cur.hidden,
                          }))
                        }
                        className={cn(
                          'inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium cursor-pointer',
                          activePlacement?.hidden
                            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-500'
                            : 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                        )}
                      >
                        {activePlacement?.hidden ? (
                          <>
                            <Eye className="h-3 w-3" />
                            <span>Restore</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3 w-3" />
                            <span>Remove</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Room & Quick Surface Picker */}
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Assigned room in 3D"
                      value={activePlacementRoom?.id ?? ''}
                      onChange={(e) => {
                        const targetRm = roomById.get(e.target.value);
                        if (!targetRm) return;
                        ensureAndMutatePlacement(activePlacementDev.device_id, (cur) => ({
                          ...cur,
                          room_id: targetRm.id,
                          floor_id: targetRm.floor_id,
                          hidden: false,
                        }));
                      }}
                      className={cn(inputClass, 'min-w-[130px]')}
                    >
                      {rooms.map((rm) => (
                        <option key={rm.id} value={rm.id}>
                          {rm.name} ({floorById.get(rm.floor_id)?.short_label})
                        </option>
                      ))}
                    </select>

                    <div className="flex flex-wrap items-center gap-1">
                      {SURFACE_OPTIONS.map((surf) => (
                        <button
                          key={surf.id}
                          type="button"
                          onClick={() =>
                            ensureAndMutatePlacement(activePlacementDev.device_id, (cur) => ({
                              ...cur,
                              surface: surf.id,
                              hidden: false,
                              offset_along: 0,
                              offset_z: 0,
                              elevation_m:
                                surf.id === 'floor'
                                  ? 0.01
                                  : surf.id === 'ceiling'
                                  ? Math.max(0.8, activePlacementWallH - 0.24)
                                  : 1.28,
                            }))
                          }
                          className={cn(
                            'h-7 rounded-lg border px-2 font-mono text-[10px] font-semibold cursor-pointer',
                            activeSurface === surf.id
                              ? 'border-accent bg-accent-soft text-accent'
                              : chipSurface
                          )}
                        >
                          {surf.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fine-Tune Controls: Move Along Wall, Elevation, Rotate 90°, Scale */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[10px]">
                    <label className="space-y-0.5">
                      <span className="opacity-75 block">
                        {isWallSurface
                          ? `Along Wall (${Math.round((activePlacement?.offset_along ?? 0) * 100)}%)`
                          : `Offset X (${(activePlacement?.offset_along ?? 0).toFixed(1)}m)`}
                      </span>
                      <input
                        type="range"
                        min={isWallSurface ? -0.42 : -(activePlacementRoom?.w ?? 4) * 0.4}
                        max={isWallSurface ? 0.42 : (activePlacementRoom?.w ?? 4) * 0.4}
                        step={isWallSurface ? 0.02 : 0.25}
                        value={activePlacement?.offset_along ?? 0}
                        onChange={(e) =>
                          ensureAndMutatePlacement(activePlacementDev.device_id, (cur) => ({
                            ...cur,
                            offset_along: Number(e.target.value),
                            hidden: false,
                          }))
                        }
                        className="w-full accent-[var(--dd-accent)] cursor-pointer"
                      />
                    </label>

                    {isWallSurface ? (
                      <label className="space-y-0.5">
                        <span className="opacity-75 block">
                          Height ({(activePlacement?.elevation_m ?? 1.28).toFixed(2)}m)
                        </span>
                        <input
                          type="range"
                          min={0.35}
                          max={Math.max(0.6, activePlacementWallH - 0.25)}
                          step={0.05}
                          value={activePlacement?.elevation_m ?? 1.28}
                          onChange={(e) =>
                            ensureAndMutatePlacement(activePlacementDev.device_id, (cur) => ({
                              ...cur,
                              elevation_m: Number(e.target.value),
                              hidden: false,
                            }))
                          }
                          className="w-full accent-[var(--dd-accent)] cursor-pointer"
                        />
                      </label>
                    ) : (
                      <label className="space-y-0.5">
                        <span className="opacity-75 block">
                          Offset Z ({(activePlacement?.offset_z ?? 0).toFixed(1)}m)
                        </span>
                        <input
                          type="range"
                          min={-(activePlacementRoom?.d ?? 4) * 0.4}
                          max={(activePlacementRoom?.d ?? 4) * 0.4}
                          step={0.25}
                          value={activePlacement?.offset_z ?? 0}
                          onChange={(e) =>
                            ensureAndMutatePlacement(activePlacementDev.device_id, (cur) => ({
                              ...cur,
                              offset_z: Number(e.target.value),
                              hidden: false,
                            }))
                          }
                          className="w-full accent-[var(--dd-accent)] cursor-pointer"
                        />
                      </label>
                    )}

                    <label className="space-y-0.5">
                      <span className="opacity-75 block">
                        Scale ({(activePlacement?.scale ?? 1).toFixed(2)}x)
                      </span>
                      <input
                        type="range"
                        min={0.7}
                        max={1.5}
                        step={0.05}
                        value={activePlacement?.scale ?? 1}
                        onChange={(e) =>
                          ensureAndMutatePlacement(activePlacementDev.device_id, (cur) => ({
                            ...cur,
                            scale: Number(e.target.value),
                            hidden: false,
                          }))
                        }
                        className="w-full accent-[var(--dd-accent)] cursor-pointer"
                      />
                    </label>

                    <div className="space-y-0.5">
                      <span className="opacity-75 block">
                        Rotate ({activePlacement?.rotation_deg ?? 0}°)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          ensureAndMutatePlacement(activePlacementDev.device_id, (cur) => ({
                            ...cur,
                            rotation_deg: ((cur.rotation_deg ?? 0) + 90) % 360,
                            hidden: false,
                          }))
                        }
                        className="inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg border border-border/70 hover:border-accent font-semibold cursor-pointer"
                      >
                        <RotateCw className="h-3 w-3 text-accent" />
                        <span>+90°</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 px-3 py-2 text-[11px] font-mono opacity-70 text-center">
                  Select any module above to snap it onto a 3D wall, floor, or ceiling.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
