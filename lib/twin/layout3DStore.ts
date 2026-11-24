/**
 * DD oodle Smart Home — 3D Home Twin Layout Store, Grid Snapper & Persistence (Phase 10D)
 *
 * Extends Firestore `homes/{home_id}/layout_3d` cleanly with optional `floors[]`,
 * `rooms[]`, and surface-mounted `placements[]` while staying 100% backward-compatible
 * with `template_id`, `eco_fallback`, and `pins[]`.
 * Persists immediately to localStorage (offline/demo) and syncs to Firestore when signed in.
 */

import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  HomeLayout3D,
  HomeLayout3DStructure,
  HomeTemplateId,
  Layout3DFloor,
  Layout3DPin,
  Layout3DPlacement,
  Layout3DRoom,
  Layout3DSurface,
  StructuralElement,
} from '@/lib/protocol/contract';
import { VirtualDeviceInstance } from '@/lib/simulator/types';
import {
  ArchitecturalRoomSpec,
  FloorSpec,
  HOME_ARCHITECTURE_BLUEPRINTS,
  HomeArchitectureBlueprint,
} from '@/lib/twin/architectureBlueprints';
import {
  generateDefaultStructureFromBlueprint,
  snapStructuralElementToGrid,
} from '@/lib/twin/modularKit';
import { HardwareArchetype, resolveHardwareArchetype } from '@/lib/twin/hardwareModelRegistry';
import { auth, db } from '@/lib/firebase/client';

const LAYOUT_3D_STORAGE_PREFIX = 'dd_oodle_layout3d_v2:';

export const ROOM_ACCENT_TINTS: Array<{ id: string; label: string; hex: string | null }> = [
  { id: 'none', label: 'Natural', hex: null },
  { id: 'warm_sand', label: 'Sand', hex: '#f5e6d3' },
  { id: 'cool_mist', label: 'Mist', hex: '#dbeafe' },
  { id: 'sage', label: 'Sage', hex: '#dcfce7' },
  { id: 'slate', label: 'Slate', hex: '#cbd5e1' },
  { id: 'amber', label: 'Amber', hex: '#fef3c7' },
];

export function snapToHalfMeter(value: number): number {
  return Math.round(value * 2) / 2;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isWallMountedArchetype(arch: HardwareArchetype): boolean {
  return (
    arch === 'switchboard' ||
    arch === 'fan_regulator' ||
    arch === 'slider_dimmer' ||
    arch === 'smart_plug_oled' ||
    arch === 'smart_lock' ||
    arch === 'security_cam' ||
    arch === 'sensor_pod'
  );
}

function archetypeToLegacyFixtureType(arch: HardwareArchetype): Layout3DPin['fixture_type'] {
  switch (arch) {
    case 'switchboard':
    case 'slider_dimmer':
      return 'light';
    case 'fan_regulator':
      return 'fan';
    case 'smart_plug_oled':
      return 'geyser';
    case 'water_tank':
      return 'tank';
    case 'hub_oled':
      return 'hub';
    default:
      return 'sensor';
  }
}

export function defaultPlacementForDevice(
  device: VirtualDeviceInstance,
  room: Layout3DRoom,
  slotIndex: number
): Layout3DPlacement {
  const arch = resolveHardwareArchetype(device);
  if (!isWallMountedArchetype(arch)) {
    if (arch === 'water_tank') {
      return {
        device_id: device.device_id,
        room_id: room.id,
        floor_id: room.floor_id,
        surface: 'floor',
        offset_along: -room.w * 0.22,
        offset_z: 0,
        elevation_m: 0.01,
        rotation_deg: 0,
        scale: 1,
      };
    }
    if (arch === 'hub_oled') {
      return {
        device_id: device.device_id,
        room_id: room.id,
        floor_id: room.floor_id,
        surface: 'floor',
        offset_along: room.w * 0.24,
        offset_z: -room.d * 0.28,
        elevation_m: 0.01,
        rotation_deg: 0,
        scale: 1,
      };
    }
    return {
      device_id: device.device_id,
      room_id: room.id,
      floor_id: room.floor_id,
      surface: 'floor',
      offset_along: 0,
      offset_z: 0,
      elevation_m: 0.01,
      rotation_deg: 0,
      scale: 1,
    };
  }

  const wallChoices: Layout3DSurface[] = ['north', 'west', 'east', 'south'];
  const surface = wallChoices[slotIndex % wallChoices.length] ?? 'north';
  return {
    device_id: device.device_id,
    room_id: room.id,
    floor_id: room.floor_id,
    surface,
    offset_along: slotIndex % 2 === 0 ? -0.26 : 0.26,
    elevation_m: 1.28,
    rotation_deg: 0,
    scale: 1,
  };
}

/**
 * Computes backward-compatible legacy `pins[]` coordinates from `floors`, `rooms`, and `placements`.
 */
export function syncLegacyPinsFromLayout(
  layout: HomeLayout3D,
  devices: Record<string, VirtualDeviceInstance>
): Layout3DPin[] {
  const floors = layout.floors ?? [];
  const rooms = layout.rooms ?? [];
  const placements = layout.placements ?? [];
  if (floors.length === 0 || rooms.length === 0 || placements.length === 0) {
    return layout.pins;
  }

  const orderedFloors = [...floors].sort((a, b) => a.order - b.order);
  const floorBaseY = new Map<string, number>();
  let runningY = 0;
  for (const fl of orderedFloors) {
    floorBaseY.set(fl.id, runningY);
    runningY += (fl.wall_height || 2.65) + (fl.slab_thickness ?? 0.18) + 0.03;
  }

  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const pins: Layout3DPin[] = [];

  for (const p of placements) {
    if (p.hidden) continue;
    const room = roomById.get(p.room_id);
    if (!room) continue;
    const baseY = floorBaseY.get(room.floor_id) ?? 0;
    const dev = devices[p.device_id];
    const arch: HardwareArchetype = dev ? resolveHardwareArchetype(dev) : 'sensor_pod';

    let x = room.x;
    let z = room.z;
    if (p.surface === 'north') {
      x = room.x + p.offset_along * room.w;
      z = room.z - room.d / 2 + 0.12;
    } else if (p.surface === 'south') {
      x = room.x + p.offset_along * room.w;
      z = room.z + room.d / 2 - 0.12;
    } else if (p.surface === 'west') {
      x = room.x - room.w / 2 + 0.12;
      z = room.z + p.offset_along * room.d;
    } else if (p.surface === 'east') {
      x = room.x + room.w / 2 - 0.12;
      z = room.z + p.offset_along * room.d;
    } else {
      x = room.x + p.offset_along;
      z = room.z + (p.offset_z ?? 0);
    }

    pins.push({
      device_id: p.device_id,
      room_id: room.id,
      x: Number(x.toFixed(2)),
      y: Number((baseY + 0.18 + p.elevation_m).toFixed(2)),
      z: Number(z.toFixed(2)),
      fixture_type: archetypeToLegacyFixtureType(arch),
    });
  }

  return pins;
}

/**
 * Generates a complete, editable `HomeLayout3D` initialized from any of the 5 Indian templates.
 */
export function createLayout3DFromTemplate(
  templateId: HomeTemplateId,
  devices: Record<string, VirtualDeviceInstance>,
  ecoFallback: boolean = false
): HomeLayout3D {
  const baseBp = HOME_ARCHITECTURE_BLUEPRINTS[templateId] ?? HOME_ARCHITECTURE_BLUEPRINTS['2bhk'];

  const floors: Layout3DFloor[] = baseBp.floors.map((fl, idx) => ({
    id: fl.id,
    label: fl.label,
    short_label: fl.shortLabel,
    order: idx,
    wall_height: fl.wallHeight,
    slab_thickness: fl.slabThickness,
    visible: true,
  }));

  const rooms: Layout3DRoom[] = baseBp.rooms.map((rm) => ({
    id: rm.id,
    name: rm.name,
    short_name: rm.shortName,
    floor_id: rm.floorId,
    x: rm.x,
    z: rm.z,
    w: rm.w,
    d: rm.d,
    floor_type: rm.floorType,
    accent_tint: null,
  }));

  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const wallSlotCounts = new Map<string, number>();
  const placements: Layout3DPlacement[] = [];
  const placedIds = new Set<string>();

  // Place blueprint default pins first
  for (const pin of baseBp.pins) {
    const dev = devices[pin.device_id];
    if (!dev) continue;
    const rm = roomById.get(pin.room_id) ?? rooms[0];
    if (!rm) continue;
    const slot = wallSlotCounts.get(rm.id) ?? 0;
    const arch = resolveHardwareArchetype(dev);
    if (isWallMountedArchetype(arch)) {
      wallSlotCounts.set(rm.id, slot + 1);
    }
    placements.push(defaultPlacementForDevice(dev, rm, slot));
    placedIds.add(dev.device_id);
  }

  // Auto-place any additional provisioned modules from the 42-module catalog
  for (const dev of Object.values(devices)) {
    if (placedIds.has(dev.device_id)) continue;
    const rm = roomById.get(dev.room_id) ?? rooms[0];
    if (!rm) continue;
    const slot = wallSlotCounts.get(rm.id) ?? 0;
    const arch = resolveHardwareArchetype(dev);
    if (isWallMountedArchetype(arch)) {
      wallSlotCounts.set(rm.id, slot + 1);
    }
    placements.push(defaultPlacementForDevice(dev, rm, slot));
    placedIds.add(dev.device_id);
  }

  const layout: HomeLayout3D = {
    template_id: templateId,
    eco_fallback: ecoFallback,
    pins: baseBp.pins,
    floors,
    rooms,
    placements,
  };
  layout.pins = syncLegacyPinsFromLayout(layout, devices);
  const compiledForStructure = layout3DToBlueprint(layout, devices);
  layout.structure = generateDefaultStructureFromBlueprint(compiledForStructure);
  return layout;
}

/**
 * Ensures any legacy or pre-12B `HomeLayout3D` has its template structures materialized
 * into editable `structure.elements[]` so every floor, wall, door, window, fence, ground,
 * and roof can be selected, moved, resized, rotated, or deleted in 3D Edit Mode.
 */
export function ensureMaterializedStructure(
  layout: HomeLayout3D,
  devices: Record<string, VirtualDeviceInstance>
): HomeLayout3D {
  if (layout.structure && Array.isArray(layout.structure.elements) && layout.structure.elements.length > 0) {
    return layout;
  }
  const compiled = layout3DToBlueprint(layout, devices);
  return {
    ...layout,
    structure: generateDefaultStructureFromBlueprint(compiled),
  };
}

function sanitizeStructureElements(elements: StructuralElement[]): HomeLayout3DStructure {
  const capped = elements.slice(0, 160);
  const validIds = new Set(capped.map((e) => e.id));
  const cleaned: StructuralElement[] = [];

  for (const el of capped) {
    if ((el.kind === 'door' || el.kind === 'window') && el.parentWallId && !validIds.has(el.parentWallId)) {
      // If parent wall was deleted, keep only if it has valid standalone coordinates or skip orphaned template opening
      const hasStandalonePos = Number.isFinite(el.x) && Number.isFinite(el.z);
      if (!hasStandalonePos) continue;
    }
    const fixed = snapStructuralElementToGrid(el, capped, { naturalSnap: false });
    if (fixed) cleaned.push(fixed);
  }
  return { elements: cleaned };
}

/**
 * Compiles any `HomeLayout3D` (legacy, Phase 10D custom, or Phase 11A modular) into a renderable `HomeArchitectureBlueprint`.
 */
export function layout3DToBlueprint(
  layout: HomeLayout3D,
  devices: Record<string, VirtualDeviceInstance>
): HomeArchitectureBlueprint {
  const baseBp =
    HOME_ARCHITECTURE_BLUEPRINTS[layout.template_id] ?? HOME_ARCHITECTURE_BLUEPRINTS['2bhk'];

  // Legacy layout_3d (only template_id + pins[])
  if (!layout.floors || layout.floors.length === 0 || !layout.rooms || layout.rooms.length === 0) {
    const legacyBp: HomeArchitectureBlueprint = {
      ...baseBp,
      pins: layout.pins.length > 0 ? layout.pins : baseBp.pins,
      placements: layout.placements,
      appliances: layout.appliances,
    };
    return {
      ...legacyBp,
      structure:
        layout.structure && Array.isArray(layout.structure.elements) && layout.structure.elements.length > 0
          ? sanitizeStructureElements(layout.structure.elements)
          : generateDefaultStructureFromBlueprint(legacyBp),
    };
  }

  const orderedFloors = [...layout.floors].sort((a, b) => a.order - b.order);
  const floors: FloorSpec[] = [];
  let runningY = 0;

  for (const fl of orderedFloors) {
    const slab = fl.slab_thickness ?? (fl.id === 'roof' ? 0.16 : 0.18);
    const wallH = clampNumber(fl.wall_height || 2.65, 0.75, 4.2);
    floors.push({
      id: fl.id,
      shortLabel: fl.short_label || fl.label.slice(0, 4).toUpperCase(),
      label: fl.label,
      baseY: Number(runningY.toFixed(3)),
      wallHeight: wallH,
      slabThickness: slab,
      visible: fl.visible !== false,
    });
    runningY += wallH + slab + 0.03;
  }

  // Reuse rich template wall definitions when room ID matches template; otherwise build clean architectural walls
  const templateRoomById = new Map(baseBp.rooms.map((r) => [r.id, r]));

  const rooms: ArchitecturalRoomSpec[] = layout.rooms.map((rm) => {
    const tmpl = templateRoomById.get(rm.id);
    const isRoof = rm.floor_id === 'roof' || rm.floor_type === 'outdoor';
    const isGarage = rm.floor_type === 'garage';
    const defaultWalls = isRoof
      ? {
          north: { kind: 'parapet' as const, exterior: true },
          south: { kind: 'parapet' as const, exterior: true },
          east: { kind: 'parapet' as const, exterior: true },
          west: { kind: 'parapet' as const, exterior: true },
        }
      : isGarage
      ? {
          north: { kind: 'open' as const },
          south: { kind: 'open' as const },
          east: { kind: 'parapet' as const, exterior: true },
          west: { kind: 'parapet' as const, exterior: true },
        }
      : {
          north: { kind: 'window' as const, openingWidth: Math.min(1.5, rm.w * 0.4), exterior: true },
          south: { kind: 'doorway' as const, openingWidth: Math.min(1.1, rm.w * 0.35), exterior: false },
          east: { kind: 'solid' as const, exterior: true },
          west: { kind: 'solid' as const, exterior: true },
        };

    return {
      id: rm.id,
      name: rm.name,
      shortName: rm.short_name || rm.name.slice(0, 12),
      floorId: rm.floor_id,
      x: rm.x,
      z: rm.z,
      w: clampNumber(rm.w, 1.5, 14),
      d: clampNumber(rm.d, 1.5, 14),
      wallHeight: rm.wall_height,
      floorType: rm.floor_type,
      accentTint: rm.accent_tint ?? null,
      walls: tmpl ? tmpl.walls : defaultWalls,
    };
  });

  // Compute dynamic house bounding center & radius so camera framing always fits custom floorplans
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const r of rooms) {
    minX = Math.min(minX, r.x - r.w / 2);
    maxX = Math.max(maxX, r.x + r.w / 2);
    minZ = Math.min(minZ, r.z - r.d / 2);
    maxZ = Math.max(maxZ, r.z + r.d / 2);
  }
  const centerX = Number.isFinite(minX) ? (minX + maxX) / 2 : 0;
  const centerZ = Number.isFinite(minZ) ? (minZ + maxZ) / 2 : 0;
  const spanX = Number.isFinite(minX) ? maxX - minX : 8;
  const spanZ = Number.isFinite(minZ) ? maxZ - minZ : 8;
  const houseRadius = Math.max(6.2, Math.hypot(spanX, spanZ) * 0.72);

  const compiledBp: HomeArchitectureBlueprint = {
    templateId: layout.template_id,
    label: baseBp.label,
    floors,
    rooms,
    pins: syncLegacyPinsFromLayout(layout, devices),
    placements: layout.placements,
    appliances: layout.appliances,
    houseRadius,
    centerX,
    centerZ,
  };

  return {
    ...compiledBp,
    structure:
      layout.structure && Array.isArray(layout.structure.elements) && layout.structure.elements.length > 0
        ? sanitizeStructureElements(layout.structure.elements)
        : generateDefaultStructureFromBlueprint(compiledBp),
  };
}

/**
 * Finds a clean non-overlapping 0.5m-snapped position for a new room on the chosen floor.
 */
export function findNonOverlappingRoomPosition(
  existingRoomsOnFloor: Layout3DRoom[],
  w: number,
  d: number
): { x: number; z: number } {
  if (existingRoomsOnFloor.length === 0) {
    return { x: 0, z: 0 };
  }

  const overlaps = (cx: number, cz: number) =>
    existingRoomsOnFloor.some((r) => {
      const dx = Math.abs(cx - r.x);
      const dz = Math.abs(cz - r.z);
      return dx < (w + r.w) / 2 - 0.1 && dz < (d + r.d) / 2 - 0.1;
    });

  // Try snapping cleanly beside each existing room along east/south/west/north edges
  for (const r of existingRoomsOnFloor) {
    const candidates = [
      { x: snapToHalfMeter(r.x + (r.w + w) / 2), z: snapToHalfMeter(r.z) },
      { x: snapToHalfMeter(r.x), z: snapToHalfMeter(r.z + (r.d + d) / 2) },
      { x: snapToHalfMeter(r.x - (r.w + w) / 2), z: snapToHalfMeter(r.z) },
      { x: snapToHalfMeter(r.x), z: snapToHalfMeter(r.z - (r.d + d) / 2) },
    ];
    for (const c of candidates) {
      if (!overlaps(c.x, c.z)) return c;
    }
  }

  const maxX = Math.max(...existingRoomsOnFloor.map((r) => r.x + r.w / 2));
  return { x: snapToHalfMeter(maxX + w / 2 + 0.5), z: 0 };
}

// ============================================================================
// Persistence: localStorage (instant offline/demo) + Firestore `homes/{home_id}`
// ============================================================================

export function loadLocalLayout3D(homeId: string): HomeLayout3D | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${LAYOUT_3D_STORAGE_PREFIX}${homeId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomeLayout3D;
    if (!parsed || typeof parsed.template_id !== 'string' || !Array.isArray(parsed.pins)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchFirestoreLayout3D(homeId: string): Promise<HomeLayout3D | null> {
  if (!auth.currentUser) return null;
  try {
    const snap = await getDoc(doc(db, 'homes', homeId));
    if (!snap.exists()) return null;
    const data = snap.data() as { layout_3d?: HomeLayout3D };
    if (!data?.layout_3d || !data.layout_3d.template_id) return null;
    return data.layout_3d;
  } catch {
    // Graceful fallback to localStorage in offline/demo mode
    return null;
  }
}

export async function saveHomeLayout3D(
  homeId: string,
  layout: HomeLayout3D,
  devices: Record<string, VirtualDeviceInstance>
): Promise<{ savedLocal: boolean; savedCloud: boolean }> {
  const sanitized: HomeLayout3D = {
    template_id: layout.template_id,
    eco_fallback: Boolean(layout.eco_fallback),
    pins: syncLegacyPinsFromLayout(layout, devices).slice(0, 64),
    ...(layout.floors ? { floors: layout.floors.slice(0, 8) } : {}),
    ...(layout.rooms ? { rooms: layout.rooms.slice(0, 40) } : {}),
    ...(layout.placements ? { placements: layout.placements.slice(0, 64) } : {}),
    ...(layout.structure && Array.isArray(layout.structure.elements)
      ? { structure: { elements: layout.structure.elements.slice(0, 160) } }
      : {}),
    ...(Array.isArray(layout.appliances)
      ? { appliances: layout.appliances.slice(0, 64) }
      : {}),
  };

  let savedLocal = false;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(`${LAYOUT_3D_STORAGE_PREFIX}${homeId}`, JSON.stringify(sanitized));
      window.dispatchEvent(
        new CustomEvent('ddoodle:layout3d-sync', { detail: { homeId, layout: sanitized } })
      );
      savedLocal = true;
    } catch {
      savedLocal = false;
    }
  }

  let savedCloud = false;
  if (auth.currentUser) {
    try {
      await updateDoc(doc(db, 'homes', homeId), {
        layout_3d: sanitized,
        updatedAt: serverTimestamp(),
      });
      savedCloud = true;
    } catch {
      // Offline or unprovisioned demo home doc — local persistence still succeeds cleanly
      savedCloud = false;
    }
  }

  return { savedLocal, savedCloud };
}
