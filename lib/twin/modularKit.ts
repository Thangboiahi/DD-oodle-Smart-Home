/**
 * DD oodle Smart Home — Phase 11A Modular 3D Architectural Kit & Grid Snapper
 *
 * Provides standardized 0.5m snap-to-grid building primitives grouped by `floorId`:
 *   - `ground` (courtyard_lawn, concrete_driveway)
 *   - `fence`  (boundary_fence, main_gate)
 *   - `floor`  (marble, wood, tile, concrete_slab)
 *   - `wall`   (solid_wall, parapet, pillar)
 *   - `window` (casement, sliding_glass — snaps strictly onto a parent `wall` segment)
 *   - `door`   (hinged_single, double_entry — snaps strictly onto a parent `wall` segment)
 *   - `roof`   (rcc_terrace, sloped_roof, canopy)
 *
 * Also synthesizes default modular `structure.elements[]` for all 5 Indian templates
 * (1BHK, 2BHK, 3BHK, Duplex, Compact) and any custom rooms.
 */

import * as THREE from 'three';
import {
  FloorSlabVariant,
  HomeLayout3DStructure,
  PhysicalApplianceKind,
  StructuralElement,
  StructuralElementKind,
  StructuralElementVariant,
  SurfaceTagType,
} from '@/lib/protocol/contract';
import type { VirtualDeviceInstance } from '@/lib/simulator/types';
import type {
  ArchitecturalRoomSpec,
  HomeArchitectureBlueprint,
  RoomFloorMaterialKind,
} from '@/lib/twin/architectureBlueprints';

export type {
  DoorVariant,
  FenceVariant,
  FloorSlabVariant,
  GroundMaterialVariant,
  HomeLayout3DStructure,
  PhysicalApplianceKind,
  RoofVariant,
  StructuralElement,
  StructuralElementKind,
  StructuralElementVariant,
  SurfaceTagType,
  WallVariant,
  WindowVariant,
} from '@/lib/protocol/contract';

export interface StructuralSurfaceUserData {
  surfaceType: SurfaceTagType;
  elementId: string;
  floorId: string;
  roomId: string | null;
  normal: [number, number, number];
}

export const MODULAR_GRID_STEP_M = 0.5;

export function snapGridHalfMeter(value: number): number {
  return Math.round(value / MODULAR_GRID_STEP_M) * MODULAR_GRID_STEP_M;
}

export function snapStructuralRotation(deg: number): number {
  const normalized = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  return normalized;
}

function clampVal(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mapRoomFloorToSlabVariant(kind: RoomFloorMaterialKind): FloorSlabVariant {
  if (kind === 'marble') return 'marble';
  if (kind === 'wood') return 'wood';
  if (kind === 'tile' || kind === 'kitchen_tile') return 'tile';
  return 'concrete_slab';
}

/**
 * Computes world-space center & rotation for a `window` or `door` snapped strictly
 * onto its parent `wall` segment. Returns `null` if no valid `wall` segment exists.
 */
export function snapOpeningToWall(
  opening: StructuralElement,
  parentWall: StructuralElement,
  options?: { naturalSnap?: boolean }
): StructuralElement | null {
  if (parentWall.kind !== 'wall' || parentWall.variant === 'pillar') {
    return null;
  }
  const naturalSnap = options?.naturalSnap ?? true;
  const safeSpan = Math.min(opening.w, Math.max(0.5, parentWall.w - 0.3));
  const maxRatio = Math.max(0, (parentWall.w - safeSpan) / (2 * Math.max(0.5, parentWall.w)) - 0.04);
  const ratio = clampVal(opening.wallOffsetRatio ?? 0, -maxRatio, maxRatio);
  const rad = THREE.MathUtils.degToRad(parentWall.rotationDeg);
  const alongX = Math.cos(rad);
  const alongZ = -Math.sin(rad);
  const offsetDist = ratio * parentWall.w;
  const wallBaseY = parentWall.y ?? 0.18;

  const naturalY =
    opening.kind === 'door'
      ? wallBaseY
      : Number((wallBaseY + 1.0).toFixed(2));

  return {
    ...opening,
    floorId: parentWall.floorId,
    roomId: opening.roomId ?? parentWall.roomId,
    parentWallId: parentWall.id,
    wallOffsetRatio: Number(ratio.toFixed(3)),
    w: Number(safeSpan.toFixed(2)),
    d: parentWall.d,
    y: naturalSnap ? naturalY : Number((opening.y ?? naturalY).toFixed(2)),
    x: Number((parentWall.x + alongX * offsetDist).toFixed(3)),
    z: Number((parentWall.z + alongZ * offsetDist).toFixed(3)),
    rotationDeg: naturalSnap
      ? snapStructuralRotation(parentWall.rotationDeg)
      : ((Math.round(parentWall.rotationDeg) % 360) + 360) % 360,
    wallSide: opening.wallSide ?? parentWall.wallSide,
  };
}

/**
 * Magnetically snaps wall/fence endpoints to nearby existing wall corners within `thresholdM` (default 0.25m).
 */
export function snapWallEndpointsMagnetic(
  candidate: StructuralElement,
  allElements: StructuralElement[],
  thresholdM: number = 0.25
): StructuralElement {
  if (
    (candidate.kind !== 'wall' && candidate.kind !== 'fence') ||
    candidate.variant === 'pillar'
  ) {
    return candidate;
  }

  const getEndpoints = (el: StructuralElement) => {
    const rad = THREE.MathUtils.degToRad(el.rotationDeg || 0);
    const hx = Math.cos(rad) * (el.w / 2);
    const hz = -Math.sin(rad) * (el.w / 2);
    return [
      { x: el.x - hx, z: el.z - hz },
      { x: el.x + hx, z: el.z + hz },
    ] as const;
  };

  const candEnds = getEndpoints(candidate);
  const peers = allElements.filter(
    (el) =>
      el.id !== candidate.id &&
      el.floorId === candidate.floorId &&
      (el.kind === 'wall' || el.kind === 'fence') &&
      el.variant !== 'pillar'
  );

  let bestDist = thresholdM;
  let shiftX = 0;
  let shiftZ = 0;
  let matched = false;

  for (const peer of peers) {
    const peerEnds = getEndpoints(peer);
    for (const cPt of candEnds) {
      for (const pPt of peerEnds) {
        const d = Math.hypot(pPt.x - cPt.x, pPt.z - cPt.z);
        if (d <= bestDist) {
          bestDist = d;
          shiftX = pPt.x - cPt.x;
          shiftZ = pPt.z - cPt.z;
          matched = true;
        }
      }
    }
  }

  if (!matched) return candidate;
  return {
    ...candidate,
    x: Number((candidate.x + shiftX).toFixed(3)),
    z: Number((candidate.z + shiftZ).toFixed(3)),
  };
}

/**
 * Enforces 0.5m grid + magnetic corner snapping in Auto-Snap mode, or clean bounds
 * clamping in Free mode, plus parent-wall attachment for `door` and `window` primitives.
 */
export function snapStructuralElementToGrid(
  element: StructuralElement,
  allElements: StructuralElement[],
  options?: { naturalSnap?: boolean }
): StructuralElement | null {
  const naturalSnap = options?.naturalSnap ?? true;

  if (element.kind === 'window' || element.kind === 'door') {
    const wallsOnFloor = allElements.filter(
      (el) => el.kind === 'wall' && el.variant !== 'pillar' && el.floorId === element.floorId
    );
    if (wallsOnFloor.length === 0) {
      if (!naturalSnap) {
        return {
          ...element,
          x: clampVal(Number(element.x) || 0, -40, 40),
          z: clampVal(Number(element.z) || 0, -40, 40),
          w: clampVal(Number(element.w) || 1.1, 0.4, 8),
          d: clampVal(Number(element.d) || 0.14, 0.06, 1),
          h: clampVal(Number(element.h) || 1.25, 0.3, 3.8),
          rotationDeg: ((Math.round(element.rotationDeg || 0) % 360) + 360) % 360,
        };
      }
      return null;
    }

    let parentWall =
      (element.parentWallId
        ? wallsOnFloor.find((w) => w.id === element.parentWallId)
        : undefined) ?? wallsOnFloor[0];

    if (!element.parentWallId) {
      let bestDist = Infinity;
      for (const w of wallsOnFloor) {
        const dist = Math.hypot(element.x - w.x, element.z - w.z);
        if (dist < bestDist) {
          bestDist = dist;
          parentWall = w;
        }
      }
    }

    return snapOpeningToWall(element, parentWall, { naturalSnap });
  }

  if (!naturalSnap) {
    return {
      ...element,
      x: clampVal(Number(element.x) || 0, -40, 40),
      z: clampVal(Number(element.z) || 0, -40, 40),
      y: element.y !== undefined ? clampVal(Number(element.y) || 0, -1, 20) : undefined,
      w: clampVal(Number(element.w) || 1, 0.15, 25),
      d:
        element.kind === 'wall' || element.kind === 'fence'
          ? clampVal(Number(element.d) || 0.14, 0.06, 2)
          : clampVal(Number(element.d) || 1, 0.15, 25),
      h: clampVal(Number(element.h) || 0.2, 0.02, 6),
      rotationDeg: ((Math.round(element.rotationDeg || 0) % 360) + 360) % 360,
    };
  }

  const baseSnapped: StructuralElement = {
    ...element,
    x: snapGridHalfMeter(element.x),
    z: snapGridHalfMeter(element.z),
    w: Math.max(0.5, snapGridHalfMeter(element.w)),
    d:
      element.kind === 'wall' || element.kind === 'fence'
        ? Math.max(0.08, Number(element.d.toFixed(2)))
        : Math.max(0.5, snapGridHalfMeter(element.d)),
    h: Math.max(0.02, Number(element.h.toFixed(2))),
    rotationDeg: snapStructuralRotation(element.rotationDeg),
  };

  return snapWallEndpointsMagnetic(baseSnapped, allElements, 0.25);
}

/**
 * Synthesizes standardized modular `StructuralElement[]` (ground, fence, floor, wall,
 * window, door, roof) for any template or custom home blueprint.
 */
export function generateDefaultStructureFromBlueprint(
  blueprint: HomeArchitectureBlueprint
): HomeLayout3DStructure {
  const elements: StructuralElement[] = [];

  const groundFloor = blueprint.floors[0];
  const groundFloorId = groundFloor?.id ?? 'gf';
  const gfRooms = blueprint.rooms.filter((r) => r.floorId === groundFloorId);

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const r of blueprint.rooms) {
    minX = Math.min(minX, r.x - r.w / 2);
    maxX = Math.max(maxX, r.x + r.w / 2);
    minZ = Math.min(minZ, r.z - r.d / 2);
    maxZ = Math.max(maxZ, r.z + r.d / 2);
  }
  if (!Number.isFinite(minX)) {
    minX = -4;
    maxX = 4;
    minZ = -4;
    maxZ = 4;
  }

  // 1. Ground Primitives (Courtyard Lawn + Concrete Driveway)
  const plotPad = 2.0;
  const plotMinX = snapGridHalfMeter(minX - plotPad);
  const plotMaxX = snapGridHalfMeter(maxX + plotPad);
  const plotMinZ = snapGridHalfMeter(minZ - plotPad);
  const plotMaxZ = snapGridHalfMeter(maxZ + plotPad + 1.0);
  const plotCenterX = snapGridHalfMeter((plotMinX + plotMaxX) / 2);
  const plotCenterZ = snapGridHalfMeter((plotMinZ + plotMaxZ) / 2);
  const plotW = Math.max(6, snapGridHalfMeter(plotMaxX - plotMinX));
  const plotD = Math.max(6, snapGridHalfMeter(plotMaxZ - plotMinZ));

  elements.push({
    id: `el_ground_lawn_${blueprint.templateId}`,
    kind: 'ground',
    variant: 'courtyard_lawn',
    floorId: groundFloorId,
    x: plotCenterX,
    z: plotCenterZ,
    y: -0.024,
    w: plotW,
    d: plotD,
    h: 0.024,
    rotationDeg: 0,
  });

  const garageRoom =
    gfRooms.find((r) => r.floorType === 'garage') ??
    gfRooms.find((r) => r.id.includes('living')) ??
    gfRooms[0];

  const driveW = garageRoom ? Math.max(2.5, snapGridHalfMeter(Math.min(garageRoom.w, 4.0))) : 3.0;
  const driveX = garageRoom ? snapGridHalfMeter(garageRoom.x) : plotCenterX;
  const driveStartZ = garageRoom ? garageRoom.z + garageRoom.d / 2 : maxZ;
  const driveLen = Math.max(1.5, snapGridHalfMeter(plotMaxZ - driveStartZ));
  const driveZ = snapGridHalfMeter(driveStartZ + driveLen / 2 - 0.25);

  elements.push({
    id: `el_ground_driveway_${blueprint.templateId}`,
    kind: 'ground',
    variant: 'concrete_driveway',
    floorId: groundFloorId,
    x: driveX,
    z: driveZ,
    y: -0.016,
    w: driveW,
    d: driveLen,
    h: 0.02,
    rotationDeg: 0,
  });

  // 2. Boundary Fence Segments + Main Entry Gate
  const fenceH = 1.05;
  const fenceT = 0.14;
  elements.push(
    {
      id: `el_fence_north_${blueprint.templateId}`,
      kind: 'fence',
      variant: 'boundary_fence',
      floorId: groundFloorId,
      x: plotCenterX,
      z: plotMinZ,
      y: 0,
      w: plotW,
      d: fenceT,
      h: fenceH,
      rotationDeg: 0,
    },
    {
      id: `el_fence_west_${blueprint.templateId}`,
      kind: 'fence',
      variant: 'boundary_fence',
      floorId: groundFloorId,
      x: plotMinX,
      z: plotCenterZ,
      y: 0,
      w: plotD,
      d: fenceT,
      h: fenceH,
      rotationDeg: 90,
    },
    {
      id: `el_fence_east_${blueprint.templateId}`,
      kind: 'fence',
      variant: 'boundary_fence',
      floorId: groundFloorId,
      x: plotMaxX,
      z: plotCenterZ,
      y: 0,
      w: plotD,
      d: fenceT,
      h: fenceH,
      rotationDeg: 90,
    }
  );

  // Split south boundary around main entry gate aligned to driveway
  const gateW = Math.min(driveW, 3.0);
  const gateCenterX = clampVal(driveX, plotMinX + gateW / 2 + 0.5, plotMaxX - gateW / 2 - 0.5);
  const leftSegW = snapGridHalfMeter(gateCenterX - gateW / 2 - plotMinX);
  const rightSegW = snapGridHalfMeter(plotMaxX - (gateCenterX + gateW / 2));

  if (leftSegW >= 0.5) {
    elements.push({
      id: `el_fence_south_w_${blueprint.templateId}`,
      kind: 'fence',
      variant: 'boundary_fence',
      floorId: groundFloorId,
      x: snapGridHalfMeter(plotMinX + leftSegW / 2),
      z: plotMaxZ,
      y: 0,
      w: leftSegW,
      d: fenceT,
      h: fenceH,
      rotationDeg: 0,
    });
  }
  if (rightSegW >= 0.5) {
    elements.push({
      id: `el_fence_south_e_${blueprint.templateId}`,
      kind: 'fence',
      variant: 'boundary_fence',
      floorId: groundFloorId,
      x: snapGridHalfMeter(plotMaxX - rightSegW / 2),
      z: plotMaxZ,
      y: 0,
      w: rightSegW,
      d: fenceT,
      h: fenceH,
      rotationDeg: 0,
    });
  }

  elements.push({
    id: `el_fence_gate_main_${blueprint.templateId}`,
    kind: 'fence',
    variant: 'main_gate',
    floorId: groundFloorId,
    x: snapGridHalfMeter(gateCenterX),
    z: plotMaxZ,
    y: 0,
    w: gateW,
    d: 0.16,
    h: 1.28,
    rotationDeg: 0,
  });

  // 3. Per-Floor / Per-Room Floors, Walls, Pillars, Doors, Windows & Roofs
  const floorById = new Map(blueprint.floors.map((f) => [f.id, f]));

  for (const room of blueprint.rooms) {
    const fl = floorById.get(room.floorId) ?? blueprint.floors[0];
    if (!fl) continue;
    const roomWallH = room.wallHeight ?? fl.wallHeight;
    const slabH = fl.slabThickness;

    // Floor slab element
    elements.push({
      id: `el_floor_${room.id}`,
      kind: 'floor',
      variant: mapRoomFloorToSlabVariant(room.floorType),
      floorId: room.floorId,
      roomId: room.id,
      x: snapGridHalfMeter(room.x),
      z: snapGridHalfMeter(room.z),
      y: 0,
      w: snapGridHalfMeter(room.w),
      d: snapGridHalfMeter(room.d),
      h: slabH,
      rotationDeg: 0,
    });

    // Corner pillar on exterior indoor/porch rooms
    if (room.floorType !== 'outdoor') {
      elements.push({
        id: `el_pillar_${room.id}_sw`,
        kind: 'wall',
        variant: 'pillar',
        floorId: room.floorId,
        roomId: room.id,
        x: Number((room.x - room.w / 2).toFixed(3)),
        z: Number((room.z + room.d / 2).toFixed(3)),
        y: slabH,
        w: 0.2,
        d: 0.2,
        h: roomWallH,
        rotationDeg: 0,
      });
    }

    const wallSides: Array<{
      side: 'north' | 'south' | 'east' | 'west';
      x: number;
      z: number;
      len: number;
      rot: number;
      def: ArchitecturalRoomSpec['walls']['north'];
    }> = [
      { side: 'north', x: room.x, z: room.z - room.d / 2, len: room.w, rot: 0, def: room.walls.north },
      { side: 'south', x: room.x, z: room.z + room.d / 2, len: room.w, rot: 0, def: room.walls.south },
      { side: 'east', x: room.x + room.w / 2, z: room.z, len: room.d, rot: 90, def: room.walls.east },
      { side: 'west', x: room.x - room.w / 2, z: room.z, len: room.d, rot: 90, def: room.walls.west },
    ];

    for (const s of wallSides) {
      if (s.def.kind === 'open') continue;
      const wallId = `el_wall_${room.id}_${s.side}`;
      const isParapet = s.def.kind === 'parapet';
      const wallThick = s.def.exterior ? 0.14 : 0.1;
      const wallEl: StructuralElement = {
        id: wallId,
        kind: 'wall',
        variant: isParapet ? 'parapet' : 'solid_wall',
        floorId: room.floorId,
        roomId: room.id,
        x: Number(s.x.toFixed(3)),
        z: Number(s.z.toFixed(3)),
        y: slabH,
        w: Number(s.len.toFixed(2)),
        d: wallThick,
        h: isParapet ? Math.min(roomWallH, 0.92) : roomWallH,
        rotationDeg: s.rot,
        wallSide: s.side,
      };
      elements.push(wallEl);

      if (s.def.kind === 'doorway') {
        const doorEl = snapOpeningToWall(
          {
            id: `el_door_${room.id}_${s.side}`,
            kind: 'door',
            variant: s.def.exterior ? 'double_entry' : 'hinged_single',
            floorId: room.floorId,
            roomId: room.id,
            x: wallEl.x,
            z: wallEl.z,
            y: slabH,
            w: Math.min(s.len - 0.5, s.def.openingWidth ?? 1.1),
            d: wallThick,
            h: Math.min(roomWallH - 0.35, 2.08),
            rotationDeg: wallEl.rotationDeg,
            parentWallId: wallId,
            wallOffsetRatio: s.def.offsetRatio ?? 0,
            wallSide: s.side,
          },
          wallEl
        );
        if (doorEl) elements.push(doorEl);
      } else if (s.def.kind === 'window') {
        const winEl = snapOpeningToWall(
          {
            id: `el_window_${room.id}_${s.side}`,
            kind: 'window',
            variant: (s.def.openingWidth ?? 1.2) >= 1.5 ? 'sliding_glass' : 'casement',
            floorId: room.floorId,
            roomId: room.id,
            x: wallEl.x,
            z: wallEl.z,
            y: slabH + 0.85,
            w: Math.min(s.len - 0.5, s.def.openingWidth ?? 1.3),
            d: wallThick,
            h: Math.min(roomWallH - 1.23, 1.28),
            rotationDeg: wallEl.rotationDeg,
            parentWallId: wallId,
            wallOffsetRatio: s.def.offsetRatio ?? 0,
            wallSide: s.side,
          },
          wallEl
        );
        if (winEl) elements.push(winEl);
      }
    }

    // Roof primitives: RCC Terrace Slab on roof rooms & architectural Porch Canopy over garage/entry
    if (room.floorId === 'roof' || room.floorType === 'outdoor') {
      elements.push({
        id: `el_roof_terrace_${room.id}`,
        kind: 'roof',
        variant: 'rcc_terrace',
        floorId: room.floorId,
        roomId: room.id,
        x: snapGridHalfMeter(room.x),
        z: snapGridHalfMeter(room.z),
        y: 0,
        w: snapGridHalfMeter(room.w),
        d: snapGridHalfMeter(room.d),
        h: slabH,
        rotationDeg: 0,
      });

      // Subtle rooftop pergola / sloped canopy over north-east corner of terrace
      elements.push({
        id: `el_roof_canopy_${room.id}`,
        kind: 'roof',
        variant: 'canopy',
        floorId: room.floorId,
        roomId: room.id,
        x: snapGridHalfMeter(room.x + room.w * 0.24),
        z: snapGridHalfMeter(room.z - room.d * 0.2),
        y: slabH + 2.05,
        w: Math.max(1.5, snapGridHalfMeter(Math.min(2.5, room.w * 0.34))),
        d: Math.max(1.5, snapGridHalfMeter(Math.min(2.0, room.d * 0.32))),
        h: 0.14,
        rotationDeg: 0,
      });
    } else if (room.floorType === 'garage') {
      elements.push({
        id: `el_roof_sloped_portico_${room.id}`,
        kind: 'roof',
        variant: 'sloped_roof',
        floorId: room.floorId,
        roomId: room.id,
        x: snapGridHalfMeter(room.x),
        z: snapGridHalfMeter(room.z),
        y: slabH + roomWallH - 0.12,
        w: snapGridHalfMeter(room.w),
        d: snapGridHalfMeter(room.d),
        h: 0.42,
        rotationDeg: 0,
      });
    }
  }

  return { elements };
}

/**
 * Generates procedural sRGB canvas textures for modular ground surfaces
 * (`courtyard_lawn`, `concrete_driveway`).
 */
export function createModularGroundTexture(
  kind: 'courtyard_lawn' | 'concrete_driveway',
  isLightTheme: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    if (kind === 'courtyard_lawn') {
      ctx.fillStyle = isLightTheme ? '#86b86b' : '#3a5a40';
      ctx.fillRect(0, 0, size, size);
      // Alternating subtle mowing bands
      const bands = 6;
      const bandW = size / bands;
      for (let i = 0; i < bands; i++) {
        ctx.fillStyle =
          i % 2 === 0
            ? isLightTheme
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(255,255,255,0.04)'
            : isLightTheme
            ? 'rgba(30,80,30,0.07)'
            : 'rgba(0,0,0,0.09)';
        ctx.fillRect(i * bandW, 0, bandW, size);
      }
      // Fine deterministic turf speckle
      ctx.fillStyle = isLightTheme ? 'rgba(60,110,45,0.16)' : 'rgba(130,190,120,0.12)';
      for (let i = 0; i < 180; i++) {
        const px = (i * 53) % size;
        const py = (i * 97) % size;
        ctx.fillRect(px, py, 2, 2);
      }
    } else {
      // Concrete driveway pavers
      ctx.fillStyle = isLightTheme ? '#cfd6de' : '#4a5568';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = isLightTheme ? 'rgba(100,116,139,0.28)' : 'rgba(15,23,42,0.38)';
      ctx.lineWidth = 2;
      const step = size / 4;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * step, 0);
        ctx.lineTo(i * step, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * step);
        ctx.lineTo(size, i * step);
        ctx.stroke();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(kind === 'courtyard_lawn' ? 4 : 2, kind === 'courtyard_lawn' ? 4 : 2);
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  tex.needsUpdate = true;
  return tex;
}

// ============================================================================
// Phase 11C: Modular Block Catalog, Surface Validation & Appliance Wiring
// ============================================================================

export interface ModularBlockPreset {
  kind: StructuralElementKind;
  label: string;
  defaultVariant: StructuralElementVariant;
  variants: Array<{ id: StructuralElementVariant; label: string }>;
  defaultW: number;
  defaultD: number;
  defaultH: number;
  requiresWall: boolean;
  hint: string;
}

export const MODULAR_BLOCK_CATALOG: ModularBlockPreset[] = [
  {
    kind: 'ground',
    label: 'Ground',
    defaultVariant: 'courtyard_lawn',
    variants: [
      { id: 'courtyard_lawn', label: 'Lawn' },
      { id: 'concrete_driveway', label: 'Driveway' },
    ],
    defaultW: 4.0,
    defaultD: 3.0,
    defaultH: 0.024,
    requiresWall: false,
    hint: 'Tap 3D grid to place lawn or driveway',
  },
  {
    kind: 'fence',
    label: 'Fence/Gate',
    defaultVariant: 'boundary_fence',
    variants: [
      { id: 'boundary_fence', label: 'Boundary Fence' },
      { id: 'main_gate', label: 'Main Gate' },
    ],
    defaultW: 3.0,
    defaultD: 0.16,
    defaultH: 1.1,
    requiresWall: false,
    hint: 'Tap 3D perimeter to place fence or entry gate',
  },
  {
    kind: 'floor',
    label: 'Floor',
    defaultVariant: 'marble',
    variants: [
      { id: 'marble', label: 'Marble' },
      { id: 'wood', label: 'Wood' },
      { id: 'tile', label: 'Tile' },
      { id: 'concrete_slab', label: 'Concrete' },
    ],
    defaultW: 3.5,
    defaultD: 3.5,
    defaultH: 0.18,
    requiresWall: false,
    hint: 'Tap floor grid to place slab',
  },
  {
    kind: 'wall',
    label: 'Wall',
    defaultVariant: 'solid_wall',
    variants: [
      { id: 'solid_wall', label: 'Solid Wall' },
      { id: 'parapet', label: 'Parapet' },
      { id: 'pillar', label: 'Pillar' },
    ],
    defaultW: 3.0,
    defaultD: 0.14,
    defaultH: 2.65,
    requiresWall: false,
    hint: 'Tap floor grid to place wall or pillar',
  },
  {
    kind: 'window',
    label: 'Window',
    defaultVariant: 'casement',
    variants: [
      { id: 'casement', label: 'Casement' },
      { id: 'sliding_glass', label: 'Sliding Glass' },
    ],
    defaultW: 1.3,
    defaultD: 0.14,
    defaultH: 1.25,
    requiresWall: true,
    hint: 'Tap an existing 3D WALL to snap window',
  },
  {
    kind: 'door',
    label: 'Door',
    defaultVariant: 'hinged_single',
    variants: [
      { id: 'hinged_single', label: 'Single Door' },
      { id: 'double_entry', label: 'Double Entry' },
    ],
    defaultW: 1.05,
    defaultD: 0.14,
    defaultH: 2.08,
    requiresWall: true,
    hint: 'Tap an existing 3D WALL to snap door',
  },
  {
    kind: 'roof',
    label: 'Roof',
    defaultVariant: 'rcc_terrace',
    variants: [
      { id: 'rcc_terrace', label: 'RCC Terrace' },
      { id: 'sloped_roof', label: 'Sloped Roof' },
      { id: 'canopy', label: 'Pergola Canopy' },
    ],
    defaultW: 3.5,
    defaultD: 3.0,
    defaultH: 0.35,
    requiresWall: false,
    hint: 'Tap upper grid or terrace to place roof',
  },
];

export const STRUCTURE_MATERIAL_TINTS: Array<{ id: string; label: string; hex: string | null }> = [
  { id: 'default', label: 'Default', hex: null },
  { id: 'sandstone', label: 'Sand', hex: '#f5e6d3' },
  { id: 'terracotta', label: 'Clay', hex: '#e7b89c' },
  { id: 'slate', label: 'Slate', hex: '#cbd5e1' },
  { id: 'sage', label: 'Sage', hex: '#d1fae5' },
  { id: 'sky', label: 'Mist', hex: '#dbeafe' },
];

export interface PhysicalAppliancePreset {
  kind: PhysicalApplianceKind;
  label: string;
  surfaceRuleLabel: string;
  validSurfaces: SurfaceTagType[];
  defaultElevationM: number;
}

export const PHYSICAL_APPLIANCES_CATALOG: PhysicalAppliancePreset[] = [
  {
    kind: 'ceiling_light',
    label: 'Ceiling Light',
    surfaceRuleLabel: 'Ceiling Only',
    validSurfaces: ['ceiling'],
    defaultElevationM: 2.45,
  },
  {
    kind: 'dimmer_light',
    label: 'Dimmer Light',
    surfaceRuleLabel: 'Ceiling Only',
    validSurfaces: ['ceiling'],
    defaultElevationM: 2.42,
  },
  {
    kind: 'ceiling_fan',
    label: 'Ceiling Fan',
    surfaceRuleLabel: 'Ceiling Only',
    validSurfaces: ['ceiling'],
    defaultElevationM: 2.38,
  },
  {
    kind: 'wall_fan',
    label: 'Wall Fan',
    surfaceRuleLabel: 'Wall Only',
    validSurfaces: ['wall'],
    defaultElevationM: 1.95,
  },
  {
    kind: 'geyser',
    label: 'Geyser',
    surfaceRuleLabel: 'Wall Only',
    validSurfaces: ['wall'],
    defaultElevationM: 1.75,
  },
  {
    kind: 'ac',
    label: 'Split AC',
    surfaceRuleLabel: 'Wall Only',
    validSurfaces: ['wall'],
    defaultElevationM: 2.15,
  },
  {
    kind: 'exhaust',
    label: 'Exhaust Fan',
    surfaceRuleLabel: 'Wall Only',
    validSurfaces: ['wall', 'window'],
    defaultElevationM: 2.0,
  },
  {
    kind: 'water_tank',
    label: 'Water Tank',
    surfaceRuleLabel: 'Roof / Ground Only',
    validSurfaces: ['roof', 'ground'],
    defaultElevationM: 0.02,
  },
];

export function isWallMountedModuleCode(device: VirtualDeviceInstance): boolean {
  const code = String(device.module_code || '').toUpperCase();
  if (code.startsWith('WAT-') || code.startsWith('HUB-') || code.startsWith('VEH-')) {
    return false;
  }
  const caps = device.info?.capabilities ?? [];
  if (caps.some((c) => c.type === 'water_level_pct' || c.type === 'pump_switch' || c.type === 'hub_status' || c.type === 'gps_track')) {
    return false;
  }
  return true;
}

export function getDeviceSurfaceRuleLabel(device: VirtualDeviceInstance): string {
  const code = String(device.module_code || '').toUpperCase();
  if (code.startsWith('WAT-')) return 'Roof / Ground / Wall';
  if (code.startsWith('HUB-')) return 'Wall / Floor';
  if (code.startsWith('VEH-')) return 'Garage / Driveway';
  return 'Wall Only';
}

export function isSurfaceValidForDevice(
  device: VirtualDeviceInstance,
  surfaceType: SurfaceTagType,
  roomFloorType?: RoomFloorMaterialKind | null,
  floorId?: string | null
): { valid: boolean; reason: string } {
  const code = String(device.module_code || '').toUpperCase();
  if (code.startsWith('WAT-')) {
    const isValidWat =
      surfaceType === 'roof' ||
      surfaceType === 'ground' ||
      surfaceType === 'wall' ||
      (surfaceType === 'floor' && (roomFloorType === 'outdoor' || floorId === 'roof'));
    return {
      valid: isValidWat,
      reason: isValidWat
        ? 'Valid Tank (Roof/Ground) or Pump Controller (Wall) surface'
        : 'WAT-01 snaps to Roof/Ground (Tank) or Utility Wall (Pump Controller)',
    };
  }
  if (code.startsWith('HUB-')) {
    const ok = surfaceType === 'wall' || surfaceType === 'floor';
    return {
      valid: ok,
      reason: ok ? 'Valid Wall or Floor/Shelf mount' : 'HUB-01 snaps to Wall or Floor/Shelf',
    };
  }
  if (code.startsWith('VEH-')) {
    const ok = surfaceType === 'floor' || surfaceType === 'ground';
    return {
      valid: ok,
      reason: ok ? 'Valid Driveway / Garage surface' : `${device.module_code} snaps ONLY to Garage Floor or Driveway`,
    };
  }
  const ok = surfaceType === 'wall';
  return {
    valid: ok,
    reason: ok ? 'Valid Wall mount surface' : 'Switches & wall controllers snap ONLY to Walls',
  };
}

/**
 * Returns ergonomic real-world Indian Auto-Snap mounting height & orientation
 * for any DD oodle module when `Auto-Snap: ON` is active.
 */
export function getNaturalDeviceMountSpec(
  device: VirtualDeviceInstance,
  surfaceType: SurfaceTagType,
  tappedElevationM?: number
): { elevationM: number; rotationDeg: number; normalOffsetM: number } {
  const code = String(device.module_code || '').toUpperCase();
  if (code.startsWith('VEH-')) {
    return { elevationM: 0.01, rotationDeg: 0, normalOffsetM: 0.02 };
  }
  if (code.startsWith('HUB-')) {
    return {
      elevationM: surfaceType === 'wall' ? 1.4 : 0.01,
      rotationDeg: 0,
      normalOffsetM: 0.02,
    };
  }
  if (code.startsWith('WAT-')) {
    return {
      elevationM: surfaceType === 'wall' ? 1.25 : 0.02,
      rotationDeg: 0,
      normalOffsetM: 0.02,
    };
  }
  if (code === 'PWR-03') {
    const lowSocket = tappedElevationM !== undefined && tappedElevationM < 0.85;
    return {
      elevationM: lowSocket ? 0.45 : 1.35,
      rotationDeg: 0,
      normalOffsetM: 0.02,
    };
  }
  // PWR-01, PWR-02, PWR-04/PWR-09, and all G12 sensor displays
  return { elevationM: 1.25, rotationDeg: 0, normalOffsetM: 0.02 };
}

/**
 * Returns ergonomic real-world Indian Auto-Snap mounting height & room-center snap rules
 * for controlled physical appliances (`Auto-Snap: ON`).
 */
export function getNaturalApplianceMountSpec(
  kind: PhysicalApplianceKind,
  roomWallH: number
): { elevationM: number; snapRoomCenterThresholdM: number; rotationDeg: number } {
  if (kind === 'ceiling_fan' || kind === 'ceiling_light' || kind === 'dimmer_light') {
    return {
      elevationM: Math.max(0.8, Number((roomWallH - 0.06).toFixed(2))),
      snapRoomCenterThresholdM: 1.25,
      rotationDeg: 0,
    };
  }
  if (kind === 'wall_fan' || kind === 'exhaust' || kind === 'ac') {
    return {
      elevationM: Math.min(2.2, Math.max(1.5, Number((roomWallH - 0.3).toFixed(2)))),
      snapRoomCenterThresholdM: 0,
      rotationDeg: 0,
    };
  }
  if (kind === 'geyser') {
    return {
      elevationM: Math.min(1.9, Math.max(1.3, Number((roomWallH - 0.45).toFixed(2)))),
      snapRoomCenterThresholdM: 0,
      rotationDeg: 0,
    };
  }
  // water_tank
  return { elevationM: 0.02, snapRoomCenterThresholdM: 0, rotationDeg: 0 };
}

export function isSurfaceValidForAppliance(
  kind: PhysicalApplianceKind,
  surfaceType: SurfaceTagType,
  roomFloorType?: RoomFloorMaterialKind | null,
  floorId?: string | null
): { valid: boolean; reason: string } {
  const preset = PHYSICAL_APPLIANCES_CATALOG.find((a) => a.kind === kind);
  if (!preset) return { valid: false, reason: 'Unknown appliance' };
  if (kind === 'water_tank') {
    const ok =
      surfaceType === 'roof' ||
      surfaceType === 'ground' ||
      (surfaceType === 'floor' && (roomFloorType === 'outdoor' || floorId === 'roof'));
    return {
      valid: ok,
      reason: ok ? 'Valid Roof/Ground tank surface' : 'Water Tank snaps ONLY to Roof or Ground',
    };
  }
  const ok = preset.validSurfaces.includes(surfaceType);
  return {
    valid: ok,
    reason: ok ? `Valid ${preset.surfaceRuleLabel}` : `${preset.label} requires ${preset.surfaceRuleLabel}`,
  };
}

export interface BindableDeviceChannel {
  deviceId: string;
  deviceName: string;
  moduleCode: string;
  channelKey: string;
  channelLabel: string;
  fullLabel: string;
  kind: 'switch' | 'level' | 'pump';
}

export function getDeviceBindableChannels(
  devices: Record<string, VirtualDeviceInstance>
): BindableDeviceChannel[] {
  const out: BindableDeviceChannel[] = [];
  for (const dev of Object.values(devices)) {
    const caps = dev.info?.capabilities ?? [];
    for (const cap of caps) {
      if (cap.type === 'switch') {
        out.push({
          deviceId: dev.device_id,
          deviceName: dev.name,
          moduleCode: dev.module_code,
          channelKey: cap.key,
          channelLabel: cap.label,
          fullLabel: `${dev.name} · ${cap.label}`,
          kind: 'switch',
        });
      } else if (cap.type === 'pump_switch') {
        out.push({
          deviceId: dev.device_id,
          deviceName: dev.name,
          moduleCode: dev.module_code,
          channelKey: cap.key,
          channelLabel: cap.label,
          fullLabel: `${dev.name} · ${cap.label}`,
          kind: 'pump',
        });
      } else if (cap.type === 'level') {
        out.push({
          deviceId: dev.device_id,
          deviceName: dev.name,
          moduleCode: dev.module_code,
          channelKey: cap.key,
          channelLabel: cap.label,
          fullLabel: `${dev.name} · ${cap.label}`,
          kind: 'level',
        });
      }
    }
  }
  return out;
}
