'use client';

import React, { useMemo, useState } from 'react';
import {
  Box,
  Cable,
  ChevronDown,
  ChevronUp,
  Copy,
  Cpu,
  Crosshair,
  Eye,
  EyeOff,
  Home,
  Layers,
  Magnet,
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
  Layout3DAppliance,
  Layout3DFloor,
  Layout3DPlacement,
  Layout3DRoom,
  Layout3DSurface,
  PhysicalApplianceKind,
  StructuralElement,
  StructuralElementKind,
  StructuralElementVariant,
} from '@/lib/protocol/contract';
import { VirtualDeviceInstance } from '@/lib/simulator/types';
import {
  ROOM_ACCENT_TINTS,
  clampNumber,
  defaultPlacementForDevice,
  findNonOverlappingRoomPosition,
  snapToHalfMeter,
} from '@/lib/twin/layout3DStore';
import {
  MODULAR_BLOCK_CATALOG,
  PHYSICAL_APPLIANCES_CATALOG,
  STRUCTURE_MATERIAL_TINTS,
  getDeviceBindableChannels,
  getDeviceSurfaceRuleLabel,
  snapGridHalfMeter,
  snapOpeningToWall,
  snapStructuralRotation,
  snapWallEndpointsMagnetic,
} from '@/lib/twin/modularKit';
import { PrecisionSlider, ThemedColorPicker, ThemedSelect } from '@/components/ui';
import { cn } from '@/lib/utils';

export type CustomizerTab = 'build' | 'devices' | 'appliances';

export interface Home3DCustomizerTrayProps {
  layout: HomeLayout3D;
  devices: Record<string, VirtualDeviceInstance>;
  activeTab: CustomizerTab;
  onTabChange: (tab: CustomizerTab) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  activeBuildFloorId: string;
  onSelectBuildFloor: (floorId: string) => void;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
  selectedElementId: string | null;
  onSelectElement: (elementId: string | null) => void;
  pendingBuildKind: StructuralElementKind | null;
  onStartBuildPlacement: (kind: StructuralElementKind) => void;
  onCancelBuildPlacement: () => void;
  selectedPlacementDeviceId: string | null;
  onSelectPlacementDevice: (deviceId: string | null) => void;
  snapTargetDeviceId: string | null;
  onStartSnapPlacement: (deviceId: string) => void;
  onCancelSnapPlacement: () => void;
  selectedApplianceId: string | null;
  onSelectAppliance: (applianceId: string | null) => void;
  pendingApplianceKind: PhysicalApplianceKind | null;
  onStartAppliancePlacement: (kind: PhysicalApplianceKind) => void;
  onCancelAppliancePlacement: () => void;
  xrayWiring: boolean;
  onToggleXrayWiring: () => void;
  onApplyTemplate: (templateId: HomeTemplateId) => void;
  onResetTemplate: () => void;
  onMutateLayout: (updater: (prev: HomeLayout3D) => HomeLayout3D) => void;
  autoCutaway: boolean;
  onToggleAutoCutaway: () => void;
  showRoomLabels: boolean;
  onToggleRoomLabels: () => void;
  naturalSnap: boolean;
  onToggleNaturalSnap: () => void;
  onPreviewElement?: (elementId: string, patch: Partial<StructuralElement>) => void;
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

const TEMPLATES: Array<{ id: HomeTemplateId; label: string }> = [
  { id: '1bhk', label: '1BHK' },
  { id: '2bhk', label: '2BHK' },
  { id: '3bhk', label: '3BHK' },
  { id: 'duplex', label: 'Duplex' },
  { id: 'compact', label: 'Compact' },
];

const SURFACE_OPTIONS: Array<{ id: Layout3DSurface; label: string }> = [
  { id: 'north', label: 'N Wall' },
  { id: 'south', label: 'S Wall' },
  { id: 'east', label: 'E Wall' },
  { id: 'west', label: 'W Wall' },
  { id: 'floor', label: 'Floor' },
  { id: 'ceiling', label: 'Ceiling' },
];

export const Home3DCustomizerTray: React.FC<Home3DCustomizerTrayProps> = ({
  layout,
  devices,
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapsed,
  activeBuildFloorId,
  onSelectBuildFloor,
  selectedRoomId,
  onSelectRoom,
  selectedElementId,
  onSelectElement,
  pendingBuildKind,
  onStartBuildPlacement,
  onCancelBuildPlacement,
  selectedPlacementDeviceId,
  onSelectPlacementDevice,
  snapTargetDeviceId,
  onStartSnapPlacement,
  onCancelSnapPlacement,
  selectedApplianceId,
  onSelectAppliance,
  pendingApplianceKind,
  onStartAppliancePlacement,
  onCancelAppliancePlacement,
  xrayWiring,
  onToggleXrayWiring,
  onApplyTemplate,
  onResetTemplate,
  onMutateLayout,
  autoCutaway,
  onToggleAutoCutaway,
  showRoomLabels,
  onToggleRoomLabels,
  naturalSnap,
  onToggleNaturalSnap,
  onPreviewElement,
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
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const floors = useMemo(
    () => [...(layout.floors ?? [])].sort((a, b) => a.order - b.order),
    [layout.floors]
  );
  const rooms = useMemo(() => layout.rooms ?? [], [layout.rooms]);
  const placements = useMemo(() => layout.placements ?? [], [layout.placements]);
  const structureElements = useMemo(
    () => layout.structure?.elements ?? [],
    [layout.structure?.elements]
  );
  const appliances = useMemo(() => layout.appliances ?? [], [layout.appliances]);
  const devicesList = useMemo(() => Object.values(devices), [devices]);
  const bindableChannels = useMemo(() => getDeviceBindableChannels(devices), [devices]);

  const placementByDeviceId = useMemo(
    () => new Map(placements.map((p) => [p.device_id, p])),
    [placements]
  );
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const floorById = useMemo(() => new Map(floors.map((f) => [f.id, f])), [floors]);

  const activeFloorObj =
    floorById.get(activeBuildFloorId) ?? floors[0] ?? null;

  const activeRoom =
    (selectedRoomId ? roomById.get(selectedRoomId) : null) ??
    rooms.find((r) => r.floor_id === activeBuildFloorId) ??
    rooms[0] ??
    null;

  const activeElement =
    (selectedElementId ? structureElements.find((e) => e.id === selectedElementId) : null) ??
    null;

  const activePlacementDev = selectedPlacementDeviceId
    ? devices[selectedPlacementDeviceId] ?? null
    : null;
  const activePlacement = selectedPlacementDeviceId
    ? placementByDeviceId.get(selectedPlacementDeviceId) ?? null
    : null;

  const activeAppliance =
    (selectedApplianceId ? appliances.find((a) => a.id === selectedApplianceId) : null) ??
    appliances[0] ??
    null;

  const traySurface = isLightTheme
    ? 'bg-[rgba(255,255,255,0.96)] border-slate-300 text-slate-900'
    : 'bg-[rgba(15,23,42,0.95)] border-slate-700 text-slate-100';

  const chipSurface = isLightTheme
    ? 'bg-slate-100 border-slate-300 text-slate-800 hover:border-accent'
    : 'bg-slate-800/90 border-slate-700 text-slate-200 hover:border-accent';

  const inputClass = isLightTheme
    ? 'bg-white border border-slate-300 text-slate-900 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-accent'
    : 'bg-slate-800 border border-slate-600 text-slate-100 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-accent';

  // --- Active Placement Floating Pill (Zero Scene Obstruction) ---
  if (pendingBuildKind || snapTargetDeviceId || pendingApplianceKind) {
    let promptTitle = '';
    let onCancel = onCancelBuildPlacement;
    if (pendingBuildKind) {
      const preset = MODULAR_BLOCK_CATALOG.find((b) => b.kind === pendingBuildKind);
      promptTitle = preset
        ? `${preset.label}: ${preset.hint} (Green = valid, Red = invalid)`
        : `Tap 3D to place ${pendingBuildKind}`;
      onCancel = onCancelBuildPlacement;
    } else if (snapTargetDeviceId) {
      const snapDev = devices[snapTargetDeviceId];
      const rule = snapDev ? getDeviceSurfaceRuleLabel(snapDev) : 'Valid Surface';
      promptTitle = `Tap 3D (${rule}) to snap ${snapDev?.name ?? snapTargetDeviceId} · Green = valid`;
      onCancel = onCancelSnapPlacement;
    } else if (pendingApplianceKind) {
      const preset = PHYSICAL_APPLIANCES_CATALOG.find((a) => a.kind === pendingApplianceKind);
      promptTitle = preset
        ? `Tap ${preset.surfaceRuleLabel} for ${preset.label} · Green = valid`
        : 'Tap valid 3D surface';
      onCancel = onCancelAppliancePlacement;
    }

    return (
      <div className="absolute bottom-3 inset-x-3 z-30 flex justify-center pointer-events-none">
        <div
          className={cn(
            'pointer-events-auto inline-flex items-center gap-2 rounded-full border border-accent px-3 py-2 shadow-2xl text-xs max-w-full',
            traySurface
          )}
        >
          <Crosshair className="h-4 w-4 text-emerald-500 animate-pulse shrink-0" />
          <span className="truncate font-medium text-[11px]">{promptTitle}</span>
          <button
            type="button"
            onClick={onToggleNaturalSnap}
            title="Toggle Auto-Snap vs Free placement"
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] font-mono font-semibold cursor-pointer shrink-0',
              naturalSnap
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-500'
                : 'border-amber-500/50 bg-amber-500/15 text-amber-500'
            )}
          >
            <Magnet className="h-3 w-3" />
            <span>{naturalSnap ? 'Auto-Snap: ON' : 'Free'}</span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-6 items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/40 px-2.5 text-[11px] font-semibold text-rose-500 hover:bg-rose-500/25 cursor-pointer shrink-0"
          >
            <X className="h-3 w-3" />
            <span>Cancel</span>
          </button>
        </div>
      </div>
    );
  }

  // --- Floor & Structure Mutations ---
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
    onSelectBuildFloor(newId);
    onSelectRoom(defaultRoom.id);
  };

  const handleToggleFloorVisibility = (floorId: string) => {
    onMutateLayout((prev) => ({
      ...prev,
      floors: (prev.floors ?? []).map((f) =>
        f.id === floorId ? { ...f, visible: f.visible === false ? true : false } : f
      ),
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

      return {
        ...prev,
        floors: remainingFloors,
        rooms: remainingRooms,
        placements: (prev.placements ?? []).map((p) =>
          remainingRoomIds.has(p.room_id)
            ? p
            : fallbackRoom
            ? { ...p, room_id: fallbackRoom.id, floor_id: fallbackRoom.floor_id }
            : p
        ),
        structure: prev.structure
          ? { elements: prev.structure.elements.filter((el) => el.floorId !== floorId) }
          : undefined,
        appliances: (prev.appliances ?? []).filter((a) => a.floor_id !== floorId),
      };
    });
    onSelectBuildFloor(fallbackFloor.id);
  };

  const handleAddRoom = (targetFloorId: string) => {
    if (rooms.length >= 40) return;
    const floorRooms = rooms.filter((r) => r.floor_id === targetFloorId);
    const pos = findNonOverlappingRoomPosition(floorRooms, 3.5, 3.5);
    const idx = floorRooms.length + 1;
    const newRoom: Layout3DRoom = {
      id: `room_${Date.now().toString(36).slice(-5)}`,
      name: `Room ${idx}`,
      short_name: `Room ${idx}`,
      floor_id: targetFloorId,
      x: pos.x,
      z: pos.z,
      w: 3.5,
      d: 3.5,
      floor_type: targetFloorId === 'roof' ? 'outdoor' : 'tile',
      accent_tint: null,
    };
    onMutateLayout((prev) => ({
      ...prev,
      rooms: [...(prev.rooms ?? []), newRoom],
    }));
    onSelectElement(null);
    onSelectRoom(newRoom.id);
  };

  const handleUpdateRoom = (roomId: string, patch: Partial<Layout3DRoom>) => {
    onMutateLayout((prev) => {
      const nextRooms = (prev.rooms ?? []).map((r) => {
        if (r.id !== roomId) return r;
        const next: Layout3DRoom = { ...r, ...patch };
        if (patch.name !== undefined) {
          next.short_name = patch.name.trim().slice(0, 14) || r.short_name;
        }
        return next;
      });
      const updatedRoom = nextRooms.find((r) => r.id === roomId);
      const nextElements =
        updatedRoom && prev.structure?.elements
          ? prev.structure.elements.map((el) =>
              el.id === `el_floor_${roomId}`
                ? {
                    ...el,
                    x: updatedRoom.x,
                    z: updatedRoom.z,
                    w: updatedRoom.w,
                    d: updatedRoom.d,
                    tint: updatedRoom.accent_tint ?? el.tint,
                  }
                : el
            )
          : prev.structure?.elements;
      return {
        ...prev,
        rooms: nextRooms,
        ...(nextElements ? { structure: { elements: nextElements } } : {}),
      };
    });
  };

  const handleUpdateElement = (elementId: string, patch: Partial<StructuralElement>) => {
    onMutateLayout((prev) => {
      const existing = prev.structure?.elements ?? [];
      const target = existing.find((el) => el.id === elementId);
      if (!target) return prev;

      let updated: StructuralElement = { ...target, ...patch };
      if (updated.kind === 'door' || updated.kind === 'window') {
        const parentWall = updated.parentWallId
          ? existing.find((e) => e.id === updated.parentWallId && e.kind === 'wall')
          : undefined;
        if (parentWall) {
          const snappedOp = snapOpeningToWall(updated, parentWall, {
            naturalSnap: naturalSnap && patch.y === undefined,
          });
          if (snappedOp) updated = snappedOp;
        }
      } else if (naturalSnap && (patch.x !== undefined || patch.z !== undefined) && (updated.kind === 'wall' || updated.kind === 'fence')) {
        updated = snapWallEndpointsMagnetic(updated, existing, 0.25);
      }

      // Cascade position/rotation changes to child openings when a wall moves/rotates/resizes
      const nextElements = existing.map((el) => {
        if (el.id === elementId) return updated;
        if (
          (el.kind === 'door' || el.kind === 'window') &&
          el.parentWallId === elementId &&
          updated.kind === 'wall'
        ) {
          return snapOpeningToWall(el, updated, { naturalSnap }) ?? el;
        }
        return el;
      });

      // Keep corresponding room footprint synced if editing a room's floor slab
      const nextRooms =
        updated.kind === 'floor' && updated.roomId
          ? (prev.rooms ?? []).map((rm) =>
              rm.id === updated.roomId
                ? {
                    ...rm,
                    x: updated.x,
                    z: updated.z,
                    w: clampNumber(updated.w, 1.5, 14),
                    d: clampNumber(updated.d, 1.5, 14),
                    accent_tint: updated.tint !== undefined ? updated.tint : rm.accent_tint,
                  }
                : rm
            )
          : prev.rooms;

      return {
        ...prev,
        rooms: nextRooms,
        structure: { elements: nextElements },
      };
    });
  };

  const handleDuplicateElement = (elementId: string) => {
    const src = structureElements.find((el) => el.id === elementId);
    if (!src || structureElements.length >= 160) return;
    const dupId = `mod_${src.kind}_${Date.now().toString(36).slice(-4)}`;
    let dup: StructuralElement;
    if ((src.kind === 'door' || src.kind === 'window') && src.parentWallId) {
      const parentWall = structureElements.find((e) => e.id === src.parentWallId);
      const nextRatio = (src.wallOffsetRatio ?? 0) >= 0.1 ? (src.wallOffsetRatio ?? 0) - 0.28 : (src.wallOffsetRatio ?? 0) + 0.28;
      dup =
        (parentWall
          ? snapOpeningToWall(
              { ...src, id: dupId, wallOffsetRatio: nextRatio },
              parentWall,
              { naturalSnap }
            )
          : null) ?? { ...src, id: dupId, x: src.x + 0.5, z: src.z + 0.5 };
    } else {
      dup = {
        ...src,
        id: dupId,
        roomId: undefined,
        wallSide: undefined,
        x: Number((src.x + 0.5).toFixed(2)),
        z: Number((src.z + 0.5).toFixed(2)),
      };
    }
    onMutateLayout((prev) => ({
      ...prev,
      structure: {
        elements: [...(prev.structure?.elements ?? []).slice(0, 159), dup],
      },
    }));
    onSelectElement(dupId);
  };

  const handleConvertWallOrOpening = (
    elementId: string,
    target: 'wall' | 'window' | 'door'
  ) => {
    const src = structureElements.find((el) => el.id === elementId);
    if (!src) return;

    if (src.kind === 'wall' && (target === 'window' || target === 'door')) {
      const floorObj = floorById.get(src.floorId);
      const wallBaseY = src.y ?? floorObj?.slab_thickness ?? 0.18;
      const newOpId = `mod_${target}_${Date.now().toString(36).slice(-4)}`;
      const baseOp: StructuralElement = {
        id: newOpId,
        kind: target,
        variant: target === 'window' ? 'casement' : 'hinged_single',
        floorId: src.floorId,
        roomId: src.roomId,
        x: src.x,
        z: src.z,
        y: target === 'window' ? wallBaseY + 1.0 : wallBaseY,
        w: Math.min(Math.max(0.6, src.w - 0.4), target === 'window' ? 1.3 : 1.05),
        d: src.d,
        h: target === 'window' ? Math.min(1.25, Math.max(0.5, src.h - 1.2)) : Math.min(2.08, Math.max(1.2, src.h - 0.25)),
        rotationDeg: src.rotationDeg,
        parentWallId: src.id,
        wallOffsetRatio: 0,
        wallSide: src.wallSide,
      };
      const snapped = snapOpeningToWall(baseOp, src, { naturalSnap }) ?? baseOp;
      onMutateLayout((prev) => {
        const filtered = (prev.structure?.elements ?? []).filter(
          (e) => !((e.kind === 'door' || e.kind === 'window') && e.parentWallId === src.id)
        );
        return {
          ...prev,
          structure: { elements: [...filtered.slice(0, 159), snapped] },
        };
      });
      onSelectElement(newOpId);
      return;
    }

    if ((src.kind === 'door' || src.kind === 'window') && target === 'wall') {
      const parentId = src.parentWallId ?? null;
      onMutateLayout((prev) => ({
        ...prev,
        structure: {
          elements: (prev.structure?.elements ?? []).filter((e) => e.id !== src.id),
        },
      }));
      onSelectElement(parentId);
      return;
    }

    if ((src.kind === 'door' && target === 'window') || (src.kind === 'window' && target === 'door')) {
      const parentWall = src.parentWallId
        ? structureElements.find((e) => e.id === src.parentWallId)
        : undefined;
      const wallBaseY = parentWall?.y ?? 0.18;
      const converted: StructuralElement = {
        ...src,
        kind: target,
        variant: target === 'window' ? 'casement' : 'hinged_single',
        y: target === 'window' ? wallBaseY + 1.0 : wallBaseY,
        h: target === 'window' ? 1.25 : 2.08,
        w: target === 'window' ? Math.max(src.w, 1.2) : Math.min(src.w, 1.2),
      };
      const finalEl = parentWall ? snapOpeningToWall(converted, parentWall, { naturalSnap }) ?? converted : converted;
      onMutateLayout((prev) => ({
        ...prev,
        structure: {
          elements: (prev.structure?.elements ?? []).map((e) => (e.id === src.id ? finalEl : e)),
        },
      }));
    }
  };

  const handleDeleteElement = (elementId: string) => {
    onMutateLayout((prev) => ({
      ...prev,
      structure: {
        elements: (prev.structure?.elements ?? []).filter(
          (el) => el.id !== elementId && el.parentWallId !== elementId
        ),
      },
    }));
    onSelectElement(null);
  };

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

  const updateAppliance = (applianceId: string, patch: Partial<Layout3DAppliance>) => {
    onMutateLayout((prev) => ({
      ...prev,
      appliances: (prev.appliances ?? []).map((a) =>
        a.id === applianceId ? { ...a, ...patch } : a
      ),
    }));
  };

  const deleteAppliance = (applianceId: string) => {
    onMutateLayout((prev) => ({
      ...prev,
      appliances: (prev.appliances ?? []).filter((a) => a.id !== applianceId),
    }));
    onSelectAppliance(null);
  };

  // --- Collapsed Slim Bar ---
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
            onClick={onToggleNaturalSnap}
            title="Toggle Auto-Snap vs Free mode"
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[10px] font-mono font-semibold cursor-pointer shrink-0',
              naturalSnap
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-500'
                : 'border-amber-500/50 bg-amber-500/15 text-amber-500'
            )}
          >
            <Magnet className="h-3 w-3" />
            <span>{naturalSnap ? 'Auto-Snap: ON' : 'Free'}</span>
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
            <span>{saving ? 'Saving' : isDirty ? 'Save*' : 'Saved'}</span>
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

  const floorElements = structureElements.filter(
    (el) => el.floorId === activeBuildFloorId
  );
  const posStep = naturalSnap ? 0.5 : 0.1;
  const dimStep = naturalSnap ? 0.5 : 0.1;

  return (
    <div className="absolute bottom-2 inset-x-2 z-30 flex justify-center pointer-events-none">
      <div
        className={cn(
          'pointer-events-auto w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col overflow-hidden text-xs',
          traySurface
        )}
      >
        {/* Top Studio Bar: 3 Clean Tabs + Auto-Snap/Free Toggle + Undo/Redo/Save/Minimize/Close */}
        <div className="flex items-center justify-between gap-1 border-b border-border/60 px-2 py-1.5">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'build', label: 'Build', icon: Layers },
                { id: 'devices', label: `Devices (${devicesList.length})`, icon: Cpu },
                { id: 'appliances', label: `Appliances (${appliances.length})`, icon: Cable },
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
              onClick={onToggleNaturalSnap}
              title={
                naturalSnap
                  ? 'Auto-Snap ON: 0.5m grid, corner magnets & ergonomic Indian mounting heights. Tap for Free mode.'
                  : 'Free Mode: unrestricted X/Y/Z & smooth rotation. Tap to enable Auto-Snap.'
              }
              aria-pressed={naturalSnap}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[10px] font-mono font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0',
                naturalSnap
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-500'
                  : 'border-amber-500/50 bg-amber-500/15 text-amber-500'
              )}
            >
              <Magnet className="h-3 w-3 shrink-0" />
              <span>{naturalSnap ? 'Auto-Snap: ON' : 'Free'}</span>
            </button>
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
                'inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold cursor-pointer',
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
              title="Minimize studio tray"
              aria-label="Minimize studio tray"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 hover:border-accent cursor-pointer"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Exit 3D Studio"
              aria-label="Exit 3D Studio"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-surface-elevated cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Slim Scrollable Body (max 34vh on 360px phones) */}
        <div className="max-h-[34vh] overflow-y-auto dd-scroll p-2.5 space-y-2">
          {/* ================================================================ */}
          {/* TAB 1: BUILD (STRUCTURE)                                         */}
          {/* ================================================================ */}
          {activeTab === 'build' && (
            <div className="space-y-2">
              {/* Floor Selector + Add Floor + Template Toggle */}
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1">
                  {floors.map((fl) => {
                    const active = activeFloorObj?.id === fl.id;
                    return (
                      <button
                        key={fl.id}
                        type="button"
                        onClick={() => onSelectBuildFloor(fl.id)}
                        className={cn(
                          'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-mono font-semibold whitespace-nowrap cursor-pointer shrink-0',
                          active
                            ? 'border-accent bg-accent text-[var(--dd-accent-fg)]'
                            : chipSurface,
                          fl.visible === false && 'opacity-50'
                        )}
                      >
                        <span>{fl.short_label}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={handleAddFloor}
                    disabled={floors.length >= 8}
                    className={cn(
                      'inline-flex h-7 items-center gap-0.5 rounded-full border px-2 text-[10px] font-semibold cursor-pointer shrink-0',
                      chipSurface
                    )}
                  >
                    <Plus className="h-3 w-3 text-accent" />
                    <span>Floor</span>
                  </button>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {activeFloorObj && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleToggleFloorVisibility(activeFloorObj.id)}
                        title="Toggle floor visibility"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 hover:border-accent cursor-pointer"
                      >
                        {activeFloorObj.visible === false ? (
                          <EyeOff className="h-3 w-3 text-rose-400" />
                        ) : (
                          <Eye className="h-3 w-3 text-accent" />
                        )}
                      </button>
                      {floors.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteFloor(activeFloorObj.id)}
                          title="Delete active floor"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 text-rose-400 hover:border-rose-500 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setTemplatesOpen((v) => !v)}
                    className={cn(
                      'inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[10px] font-mono font-semibold cursor-pointer',
                      templatesOpen ? 'border-accent bg-accent-soft text-accent' : chipSurface
                    )}
                  >
                    <Home className="h-3 w-3" />
                    <span>{layout.template_id.toUpperCase()}</span>
                  </button>
                </div>
              </div>

              {/* Optional Quick Indian Template & View Bar */}
              {templatesOpen && (
                <div className="rounded-xl border border-border/60 bg-surface-elevated/50 p-2 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onApplyTemplate(t.id)}
                        className={cn(
                          'h-6 rounded-lg border px-2 font-mono text-[10px] font-bold cursor-pointer',
                          layout.template_id === t.id
                            ? 'border-accent bg-accent text-[var(--dd-accent-fg)]'
                            : chipSurface
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={onResetTemplate}
                      className="inline-flex h-6 items-center gap-1 rounded-lg border border-border/70 px-2 font-mono text-[10px] hover:border-accent cursor-pointer ml-auto"
                    >
                      <RotateCcw className="h-2.5 w-2.5 text-accent" />
                      <span>Reset</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={onToggleAutoCutaway}
                      className={cn(
                        'rounded-md border px-2 py-0.5 text-[10px] font-mono cursor-pointer',
                        autoCutaway ? 'border-accent bg-accent-soft text-accent' : chipSurface
                      )}
                    >
                      Cutaway: {autoCutaway ? 'ON' : 'OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={onToggleRoomLabels}
                      className={cn(
                        'rounded-md border px-2 py-0.5 text-[10px] font-mono cursor-pointer',
                        showRoomLabels ? 'border-accent bg-accent-soft text-accent' : chipSurface
                      )}
                    >
                      Labels: {showRoomLabels ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              )}

              {/* Modular Structural Block Palette (Tap -> Tap 3D Grid or Wall) */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {MODULAR_BLOCK_CATALOG.map((blk) => (
                  <button
                    key={blk.kind}
                    type="button"
                    onClick={() => onStartBuildPlacement(blk.kind)}
                    className={cn(
                      'inline-flex h-7 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-semibold whitespace-nowrap cursor-pointer shrink-0',
                      chipSurface
                    )}
                  >
                    <Plus className="h-3 w-3 text-accent" />
                    <span>{blk.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleAddRoom(activeFloorObj?.id ?? 'gf')}
                  className={cn(
                    'inline-flex h-7 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-semibold whitespace-nowrap cursor-pointer shrink-0',
                    chipSurface
                  )}
                >
                  <Box className="h-3 w-3 text-accent" />
                  <span>+ Room</span>
                </button>
              </div>

              {/* Contextual Structural Element Inspector (ALL Template & Custom Structures) */}
              {activeElement ? (
                <div className="rounded-xl border border-accent/40 bg-surface-elevated/55 p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono text-[11px] font-bold uppercase text-accent">
                        {activeElement.kind} · {activeElement.variant.replace(/_/g, ' ')}
                      </span>
                      <span className="ml-2 font-mono text-[10px] opacity-70 tabular-nums">
                        {activeElement.w.toFixed(1)}×{activeElement.d.toFixed(2)}×{activeElement.h.toFixed(2)}m · {activeElement.rotationDeg}°
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateElement(activeElement.id, {
                            rotationDeg: snapStructuralRotation(activeElement.rotationDeg + 90),
                          })
                        }
                        title="Rotate +90°"
                        className="inline-flex h-6 items-center gap-1 rounded-lg border border-border/70 px-2 text-[10px] font-mono font-semibold hover:border-accent cursor-pointer"
                      >
                        <RotateCw className="h-3 w-3 text-accent" />
                        <span>90°</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicateElement(activeElement.id)}
                        title="Duplicate element"
                        aria-label="Duplicate element"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-border/70 hover:border-accent cursor-pointer"
                      >
                        <Copy className="h-3 w-3 text-accent" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteElement(activeElement.id)}
                        title="Delete block"
                        aria-label="Delete block"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectElement(null)}
                        aria-label="Clear block selection"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-lg hover:bg-surface-elevated cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* Move / Nudge (X / Y / Z or Wall Offset) + Resize (W / D / H) */}
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] tabular-nums">
                    {(activeElement.kind === 'door' || activeElement.kind === 'window') && activeElement.parentWallId ? (
                      <div className="w-full grid grid-cols-2 gap-2">
                        <PrecisionSlider
                          compact
                          label="Along Wall"
                          min={-0.42}
                          max={0.42}
                          step={0.02}
                          value={activeElement.wallOffsetRatio ?? 0}
                          onChange={(val) =>
                            handleUpdateElement(activeElement.id, { wallOffsetRatio: val })
                          }
                        />
                        <div className="flex items-center justify-between gap-1 rounded-lg border border-border/60 px-2 py-1">
                          <span>Y {(activeElement.y ?? 0).toFixed(2)}m</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateElement(activeElement.id, {
                                  y: clampNumber(Number(((activeElement.y ?? 0) - 0.1).toFixed(2)), 0, 3.2),
                                })
                              }
                              className="h-5 w-5 rounded border border-border/70 hover:border-accent cursor-pointer"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateElement(activeElement.id, {
                                  y: clampNumber(Number(((activeElement.y ?? 0) + 0.1).toFixed(2)), 0, 3.2),
                                })
                              }
                              className="h-5 w-5 rounded border border-border/70 hover:border-accent cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="opacity-70">Pos</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateElement(activeElement.id, {
                              x: Number((activeElement.x - posStep).toFixed(2)),
                            })
                          }
                          className="rounded border border-border/70 px-1.5 py-0.5 hover:border-accent cursor-pointer"
                        >
                          X-
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateElement(activeElement.id, {
                              x: Number((activeElement.x + posStep).toFixed(2)),
                            })
                          }
                          className="rounded border border-border/70 px-1.5 py-0.5 hover:border-accent cursor-pointer"
                        >
                          X+
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateElement(activeElement.id, {
                              z: Number((activeElement.z - posStep).toFixed(2)),
                            })
                          }
                          className="rounded border border-border/70 px-1.5 py-0.5 hover:border-accent cursor-pointer"
                        >
                          Z-
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateElement(activeElement.id, {
                              z: Number((activeElement.z + posStep).toFixed(2)),
                            })
                          }
                          className="rounded border border-border/70 px-1.5 py-0.5 hover:border-accent cursor-pointer"
                        >
                          Z+
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateElement(activeElement.id, {
                              y: clampNumber(Number(((activeElement.y ?? 0) - 0.1).toFixed(2)), -0.2, 12),
                            })
                          }
                          className="rounded border border-border/70 px-1.5 py-0.5 hover:border-accent cursor-pointer"
                        >
                          Y-
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateElement(activeElement.id, {
                              y: clampNumber(Number(((activeElement.y ?? 0) + 0.1).toFixed(2)), -0.2, 12),
                            })
                          }
                          className="rounded border border-border/70 px-1.5 py-0.5 hover:border-accent cursor-pointer"
                        >
                          Y+
                        </button>
                      </div>
                    )}

                    {/* Resize W / D / H */}
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="opacity-70">Size</span>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateElement(activeElement.id, {
                            w: clampNumber(
                              Number((activeElement.w - (activeElement.kind === 'door' || activeElement.kind === 'window' ? 0.15 : dimStep)).toFixed(2)),
                              0.4,
                              18
                            ),
                          })
                        }
                        className="rounded border border-border/70 px-1.5 py-0.5 hover:border-accent cursor-pointer"
                      >
                        W-
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateElement(activeElement.id, {
                            w: clampNumber(
                              Number((activeElement.w + (activeElement.kind === 'door' || activeElement.kind === 'window' ? 0.15 : dimStep)).toFixed(2)),
                              0.4,
                              18
                            ),
                          })
                        }
                        className="rounded border border-border/70 px-1.5 py-0.5 hover:border-accent cursor-pointer"
                      >
                        W+
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateElement(activeElement.id, {
                            d: clampNumber(
                              Number(
                                (
                                  activeElement.d -
                                  (activeElement.kind === 'wall' || activeElement.kind === 'fence' ? 0.04 : dimStep)
                                ).toFixed(2)
                              ),
                              0.08,
                              18
                            ),
                          })
                        }
                        className="rounded border border-border/70 px-1.5 py-0.5 hover:border-accent cursor-pointer"
                      >
                        D-
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateElement(activeElement.id, {
                            d: clampNumber(
                              Number(
                                (
                                  activeElement.d +
                                  (activeElement.kind === 'wall' || activeElement.kind === 'fence' ? 0.04 : dimStep)
                                ).toFixed(2)
                              ),
                              0.08,
                              18
                            ),
                          })
                        }
                        className="rounded border border-border/70 px-1.5 py-0.5 hover:border-accent cursor-pointer"
                      >
                        D+
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateElement(activeElement.id, {
                            h: clampNumber(Number((activeElement.h - 0.25).toFixed(2)), 0.04, 5),
                          })
                        }
                        className="rounded border border-border/70 px-1.5 py-0.5 hover:border-accent cursor-pointer"
                      >
                        H-
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateElement(activeElement.id, {
                            h: clampNumber(Number((activeElement.h + 0.25).toFixed(2)), 0.04, 5),
                          })
                        }
                        className="rounded border border-border/70 px-1.5 py-0.5 hover:border-accent cursor-pointer"
                      >
                        H+
                      </button>
                    </div>
                  </div>

                  {/* Smooth Rotation Slider when Free Mode is Active */}
                  {!naturalSnap && !(activeElement.kind === 'door' || activeElement.kind === 'window') && (
                    <PrecisionSlider
                      compact
                      label="Free Angle"
                      unit="°"
                      min={0}
                      max={359}
                      step={1}
                      value={activeElement.rotationDeg}
                      onChange={(deg) => onPreviewElement?.(activeElement.id, { rotationDeg: deg })}
                      onRelease={(deg) => handleUpdateElement(activeElement.id, { rotationDeg: deg })}
                    />
                  )}

                  {/* Variant, Wall<->Window<->Door Conversion & Material Tint */}
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                    {MODULAR_BLOCK_CATALOG.find((b) => b.kind === activeElement.kind)?.variants.map(
                      (v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() =>
                            handleUpdateElement(activeElement.id, {
                              variant: v.id as StructuralElementVariant,
                              ...(v.id === 'parapet'
                                ? { h: Math.min(activeElement.h, 0.92) }
                                : v.id === 'solid_wall' && activeElement.h < 1.5
                                ? { h: activeFloorObj?.wall_height ?? 2.65 }
                                : {}),
                            })
                          }
                          className={cn(
                            'rounded-md border px-2 py-0.5 cursor-pointer',
                            activeElement.variant === v.id
                              ? 'border-accent bg-accent-soft text-accent font-semibold'
                              : chipSurface
                          )}
                        >
                          {v.label}
                        </button>
                      )
                    )}

                    {/* Wall <-> Window <-> Door Conversion Controls */}
                    {activeElement.kind === 'wall' && activeElement.variant !== 'pillar' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleConvertWallOrOpening(activeElement.id, 'window')}
                          className="rounded-md border border-cyan-500/45 bg-cyan-500/10 px-2 py-0.5 text-cyan-500 hover:bg-cyan-500/20 cursor-pointer"
                        >
                          + Window
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConvertWallOrOpening(activeElement.id, 'door')}
                          className="rounded-md border border-amber-500/45 bg-amber-500/10 px-2 py-0.5 text-amber-500 hover:bg-amber-500/20 cursor-pointer"
                        >
                          + Door
                        </button>
                      </>
                    )}
                    {activeElement.kind === 'window' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleConvertWallOrOpening(activeElement.id, 'door')}
                          className="rounded-md border border-amber-500/45 bg-amber-500/10 px-2 py-0.5 text-amber-500 hover:bg-amber-500/20 cursor-pointer"
                        >
                          → Door
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConvertWallOrOpening(activeElement.id, 'wall')}
                          className="rounded-md border border-border/70 px-2 py-0.5 hover:border-accent cursor-pointer"
                        >
                          → Solid Wall
                        </button>
                      </>
                    )}
                    {activeElement.kind === 'door' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleConvertWallOrOpening(activeElement.id, 'window')}
                          className="rounded-md border border-cyan-500/45 bg-cyan-500/10 px-2 py-0.5 text-cyan-500 hover:bg-cyan-500/20 cursor-pointer"
                        >
                          → Window
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConvertWallOrOpening(activeElement.id, 'wall')}
                          className="rounded-md border border-border/70 px-2 py-0.5 hover:border-accent cursor-pointer"
                        >
                          → Solid Wall
                        </button>
                      </>
                    )}

                    <div className="flex items-center gap-1 ml-auto">
                      {STRUCTURE_MATERIAL_TINTS.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleUpdateElement(activeElement.id, { tint: t.hex })}
                          title={`Tint: ${t.label}`}
                          className={cn(
                            'inline-flex h-5 w-5 items-center justify-center rounded-full border cursor-pointer',
                            (activeElement.tint ?? null) === t.hex
                              ? 'border-accent ring-1 ring-accent'
                              : 'border-border/70'
                          )}
                          style={{ backgroundColor: t.hex ?? 'transparent' }}
                        >
                          {!t.hex && <span className="text-[8px]">×</span>}
                        </button>
                      ))}
                      <ThemedColorPicker
                        ariaLabel="Custom material color"
                        value={activeElement.tint ?? '#f5e6d3'}
                        onChange={(hex) => handleUpdateElement(activeElement.id, { tint: hex })}
                        className="scale-90 origin-right"
                      />
                    </div>
                  </div>
                </div>
              ) : activeRoom ? (
                <div className="rounded-xl border border-border/60 bg-surface-elevated/40 p-2 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="min-w-[130px] max-w-[180px]">
                      <ThemedSelect
                        size="xs"
                        ariaLabel="Select room to edit"
                        value={activeRoom.id}
                        onChange={onSelectRoom}
                        options={rooms.map((rm) => ({
                          value: rm.id,
                          label: rm.name,
                          badge: floorById.get(rm.floor_id)?.short_label,
                        }))}
                      />
                    </div>

                    <div className="flex items-center gap-1 font-mono text-[10px]">
                      <span>W {activeRoom.w.toFixed(1)}</span>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateRoom(activeRoom.id, {
                            w: clampNumber(snapToHalfMeter(activeRoom.w - 0.5), 1.5, 12),
                          })
                        }
                        className="h-6 w-6 rounded border border-border/70 hover:border-accent cursor-pointer"
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
                        className="h-6 w-6 rounded border border-border/70 hover:border-accent cursor-pointer"
                      >
                        +
                      </button>
                      <span className="ml-1">D {activeRoom.d.toFixed(1)}</span>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateRoom(activeRoom.id, {
                            d: clampNumber(snapToHalfMeter(activeRoom.d - 0.5), 1.5, 12),
                          })
                        }
                        className="h-6 w-6 rounded border border-border/70 hover:border-accent cursor-pointer"
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
                        className="h-6 w-6 rounded border border-border/70 hover:border-accent cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {ROOM_ACCENT_TINTS.map((tint) => (
                      <button
                        key={tint.id}
                        type="button"
                        onClick={() => handleUpdateRoom(activeRoom.id, { accent_tint: tint.hex })}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] cursor-pointer',
                          (activeRoom.accent_tint ?? null) === tint.hex
                            ? 'border-accent bg-accent-soft text-accent font-semibold'
                            : chipSurface
                        )}
                      >
                        {tint.hex && (
                          <span
                            className="h-2 w-2 rounded-full border border-slate-400/60"
                            style={{ backgroundColor: tint.hex }}
                          />
                        )}
                        <span>{tint.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Quick Selector for ALL Structural Elements on Active Floor */}
              {floorElements.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
                  <span className="text-[9px] font-mono uppercase opacity-60 shrink-0">
                    Structures ({floorElements.length}):
                  </span>
                  {floorElements.map((el) => {
                    const roomLabel = el.roomId ? roomById.get(el.roomId)?.short_name : null;
                    const sideTag = el.wallSide ? ` ${el.wallSide[0].toUpperCase()}` : '';
                    const chipLabel = roomLabel
                      ? `${el.kind}:${roomLabel}${sideTag}`
                      : `${el.kind}:${el.variant.split('_')[0]}`;
                    return (
                      <button
                        key={el.id}
                        type="button"
                        onClick={() => onSelectElement(el.id)}
                        className={cn(
                          'rounded-md border px-1.5 py-0.5 font-mono text-[9px] whitespace-nowrap cursor-pointer shrink-0',
                          selectedElementId === el.id
                            ? 'border-accent bg-accent text-[var(--dd-accent-fg)] font-semibold'
                            : chipSurface
                        )}
                      >
                        {chipLabel}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 2: DEVICES & CONTROLS (REAL-WORLD SYNC)                      */}
          {/* ================================================================ */}
          {activeTab === 'devices' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {devicesList.map((dev) => {
                  const p = placementByDeviceId.get(dev.device_id);
                  const isLinked = Boolean(p && !p.hidden);
                  const isSelected = selectedPlacementDeviceId === dev.device_id;
                  return (
                    <button
                      key={dev.device_id}
                      type="button"
                      onClick={() => onSelectPlacementDevice(dev.device_id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-xl border px-2 py-1 text-[11px] transition-colors cursor-pointer',
                        isSelected
                          ? 'border-accent bg-accent text-[var(--dd-accent-fg)] font-semibold'
                          : chipSurface
                      )}
                    >
                      <span className="truncate max-w-[125px]">{dev.name}</span>
                      <span
                        className={cn(
                          'rounded px-1 py-0.2 font-mono text-[9px] font-bold',
                          isSelected
                            ? 'bg-black/20 text-current'
                            : isLinked
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : 'bg-amber-500/15 text-amber-500'
                        )}
                      >
                        {isLinked ? 'Linked' : 'Unplaced'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {activePlacementDev ? (
                <div className="rounded-xl border border-accent/40 bg-surface-elevated/50 p-2 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-xs truncate">
                        {activePlacementDev.name}{' '}
                        <span className="font-mono text-[10px] text-accent">
                          ({activePlacementDev.module_code})
                        </span>
                      </div>
                      <div className="text-[10px] font-mono opacity-70">
                        Rule: {getDeviceSurfaceRuleLabel(activePlacementDev)} ·{' '}
                        {activePlacement?.hidden
                          ? 'Unplaced'
                          : `${activePlacementRoom?.name ?? 'Room'} (${activeSurface.toUpperCase()})`}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onStartSnapPlacement(activePlacementDev.device_id)}
                        className="inline-flex h-7 items-center gap-1 rounded-lg bg-accent px-2.5 text-[11px] font-semibold text-[var(--dd-accent-fg)] cursor-pointer"
                      >
                        <Crosshair className="h-3.5 w-3.5" />
                        <span>Snap in 3D</span>
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
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Surface & Fine-Tune */}
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
                          'h-6 rounded-md border px-2 font-mono text-[10px] font-semibold cursor-pointer',
                          activeSurface === surf.id
                            ? 'border-accent bg-accent-soft text-accent'
                            : chipSurface
                        )}
                      >
                        {surf.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        ensureAndMutatePlacement(activePlacementDev.device_id, (cur) => ({
                          ...cur,
                          rotation_deg: ((cur.rotation_deg ?? 0) + 90) % 360,
                          hidden: false,
                        }))
                      }
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-border/70 px-2 font-mono text-[10px] hover:border-accent cursor-pointer ml-auto"
                    >
                      <RotateCw className="h-3 w-3 text-accent" />
                      <span>+90°</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 font-mono text-[10px]">
                    <PrecisionSlider
                      compact
                      label={isWallSurface ? 'Along Wall' : 'Offset X'}
                      unit={isWallSurface ? '' : 'm'}
                      min={isWallSurface ? -0.42 : -(activePlacementRoom?.w ?? 4) * 0.4}
                      max={isWallSurface ? 0.42 : (activePlacementRoom?.w ?? 4) * 0.4}
                      step={isWallSurface ? 0.02 : 0.25}
                      value={activePlacement?.offset_along ?? 0}
                      onChange={(val) =>
                        ensureAndMutatePlacement(activePlacementDev.device_id, (cur) => ({
                          ...cur,
                          offset_along: val,
                          hidden: false,
                        }))
                      }
                    />
                    <PrecisionSlider
                      compact
                      label={isWallSurface ? 'Height (m)' : 'Offset Z'}
                      unit="m"
                      min={isWallSurface ? 0.25 : -(activePlacementRoom?.d ?? 4) * 0.45}
                      max={
                        isWallSurface
                          ? Math.max(0.6, activePlacementWallH - 0.15)
                          : (activePlacementRoom?.d ?? 4) * 0.45
                      }
                      step={isWallSurface ? 0.05 : naturalSnap ? 0.25 : 0.05}
                      value={
                        isWallSurface
                          ? activePlacement?.elevation_m ?? 1.25
                          : activePlacement?.offset_z ?? 0
                      }
                      onChange={(val) =>
                        ensureAndMutatePlacement(activePlacementDev.device_id, (cur) =>
                          isWallSurface
                            ? { ...cur, elevation_m: val, hidden: false }
                            : { ...cur, offset_z: val, hidden: false }
                        )
                      }
                    />
                  </div>
                  {!naturalSnap && (
                    <PrecisionSlider
                      compact
                      label="Free Rotation"
                      unit="°"
                      min={0}
                      max={359}
                      step={1}
                      value={activePlacement?.rotation_deg ?? 0}
                      onChange={(deg) =>
                        ensureAndMutatePlacement(activePlacementDev.device_id, (cur) => ({
                          ...cur,
                          rotation_deg: deg,
                          hidden: false,
                        }))
                      }
                    />
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 px-3 py-2 text-[11px] font-mono opacity-70 text-center">
                  Select a real paired device above, then tap Snap in 3D (Green = valid surface).
                </div>
              )}
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 3: APPLIANCES & WIRING                                       */}
          {/* ================================================================ */}
          {activeTab === 'appliances' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">
                  Tap appliance → tap valid 3D surface
                </span>
                <button
                  type="button"
                  onClick={onToggleXrayWiring}
                  className={cn(
                    'inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[10px] font-mono font-semibold cursor-pointer shrink-0',
                    xrayWiring
                      ? 'border-cyan-400 bg-cyan-500/15 text-cyan-400'
                      : chipSurface
                  )}
                >
                  <Cable className="h-3 w-3" />
                  <span>X-Ray Wiring: {xrayWiring ? 'ON' : 'OFF'}</span>
                </button>
              </div>

              {/* 8 Physical Appliances Palette */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {PHYSICAL_APPLIANCES_CATALOG.map((preset) => (
                  <button
                    key={preset.kind}
                    type="button"
                    onClick={() => onStartAppliancePlacement(preset.kind)}
                    className={cn(
                      'inline-flex h-7 items-center gap-1 rounded-xl border px-2 text-[11px] font-medium whitespace-nowrap cursor-pointer shrink-0',
                      chipSurface
                    )}
                  >
                    <Plus className="h-3 w-3 text-accent" />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>

              {/* Placed Appliances List */}
              {appliances.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {appliances.map((app) => {
                    const selected = activeAppliance?.id === app.id;
                    const linkedDev = app.linked_device_id ? devices[app.linked_device_id] : null;
                    return (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => onSelectAppliance(app.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-xl border px-2 py-1 text-[11px] cursor-pointer',
                          selected
                            ? 'border-accent bg-accent text-[var(--dd-accent-fg)] font-semibold'
                            : chipSurface
                        )}
                      >
                        <span>{app.label}</span>
                        <span
                          className={cn(
                            'rounded px-1 font-mono text-[9px]',
                            selected
                              ? 'bg-black/20'
                              : linkedDev
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : 'bg-amber-500/15 text-amber-500'
                          )}
                        >
                          {linkedDev ? `${app.linked_channel_key ?? 'ON'}` : 'Unbound'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Selected Appliance Channel Linker */}
              {activeAppliance ? (
                <div className="rounded-xl border border-accent/40 bg-surface-elevated/50 p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-xs truncate">
                        {activeAppliance.label} ·{' '}
                        <span className="font-mono text-[10px] text-accent">
                          {roomById.get(activeAppliance.room_id)?.short_name ?? activeAppliance.room_id} ({activeAppliance.surface.toUpperCase()})
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          updateAppliance(activeAppliance.id, {
                            rotation_deg: (activeAppliance.rotation_deg + 90) % 360,
                          })
                        }
                        className="inline-flex h-6 items-center gap-1 rounded-lg border border-border/70 px-2 text-[10px] font-mono hover:border-accent cursor-pointer"
                      >
                        <RotateCw className="h-3 w-3 text-accent" />
                        <span>90°</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteAppliance(activeAppliance.id)}
                        title="Remove appliance"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-mono opacity-75 block">
                      Bind to Real Device Channel (Live X-Ray Wire)
                    </span>
                      <ThemedSelect
                      size="xs"
                      ariaLabel="Bind appliance to real device channel"
                      value={
                        activeAppliance.linked_device_id && activeAppliance.linked_channel_key
                          ? `${activeAppliance.linked_device_id}::${activeAppliance.linked_channel_key}`
                          : ''
                      }
                      onChange={(raw) => {
                        if (!raw) {
                          updateAppliance(activeAppliance.id, {
                            linked_device_id: null,
                            linked_channel_key: null,
                          });
                          return;
                        }
                        const [devId, chKey] = raw.split('::');
                        updateAppliance(activeAppliance.id, {
                          linked_device_id: devId,
                          linked_channel_key: chKey,
                        });
                      }}
                      options={[
                        {
                          value: '',
                          label: 'Unbound (Select Switch / Relay Channel)',
                        },
                        ...bindableChannels.map((ch) => ({
                          value: `${ch.deviceId}::${ch.channelKey}`,
                          label: ch.fullLabel,
                          badge: ch.moduleCode,
                        })),
                      ]}
                    />
                    {!naturalSnap && (
                      <div className="pt-1">
                        <PrecisionSlider
                          compact
                          label="Free Rotation"
                          unit="°"
                          min={0}
                          max={359}
                          step={1}
                          value={activeAppliance.rotation_deg}
                          onChange={(deg) =>
                            updateAppliance(activeAppliance.id, { rotation_deg: deg })
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 px-3 py-2 text-[11px] font-mono opacity-70 text-center">
                  Pick any appliance above and tap its valid 3D surface (Ceiling, Wall, or Roof/Ground) to place &amp; wire.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
