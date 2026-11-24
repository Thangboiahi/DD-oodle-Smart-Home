/**
 * DD oodle Smart Home — Procedural Multi-Floor Architectural Mesh Builder (Phase 10B)
 *
 * Builds crisp, bright architectural floor slabs, baseboards, doorways (with lintels),
 * glazed windows, roof parapets, auto-cutaway dollhouse wall groups, and floor-parented
 * device pins. Tracks all created geometries, materials, and textures for 100% clean disposal.
 */

import * as THREE from 'three';
import {
  ArchitecturalRoomSpec,
  FloorId,
  FloorSpec,
  HomeArchitectureBlueprint,
  RoomFloorMaterialKind,
  WallSideDef,
  createArchitecturalFloorTexture,
  getFloorForRoom,
} from '@/lib/twin/architectureBlueprints';
import {
  Layout3DPlacement,
  Layout3DSurface,
  StructuralElement,
  SurfaceTagType,
} from '@/lib/protocol/contract';
import {
  StructuralSurfaceUserData,
  createModularGroundTexture,
  generateDefaultStructureFromBlueprint,
} from '@/lib/twin/modularKit';
import { VirtualDeviceInstance } from '@/lib/simulator/types';
import {
  HardwareArchetype,
  HardwareModelRuntime,
  buildHardwareModel,
  resolveHardwareArchetype,
} from '@/lib/twin/hardwareModelRegistry';
import {
  ApplianceModelRuntime,
  XRayWiringRuntime,
  buildPhysicalApplianceModel,
  buildXRayWiringGroup,
} from '@/lib/twin/applianceMeshBuilder';

export type { StructuralSurfaceUserData } from '@/lib/twin/modularKit';

export type WallCardinalKey = 'north' | 'south' | 'east' | 'west';

export interface SnapSurfaceUserData extends StructuralSurfaceUserData {
  kind: 'snap_surface';
  roomId: string;
  floorId: FloorId;
  surface: Layout3DSurface;
  roomX: number;
  roomZ: number;
  roomW: number;
  roomD: number;
  slabTopY: number;
  wallHeight: number;
}

export interface WallCutawayEntry {
  group: THREE.Group;
  floorId: FloorId;
  roomId: string;
  wallKey: WallCardinalKey;
  normalX: number;
  normalZ: number;
  roomCenterX: number;
  roomCenterZ: number;
  isParapet: boolean;
  currentScaleY: number;
}

export interface FloorRuntimeEntry {
  spec: FloorSpec;
  index: number;
  group: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  currentLiftY: number;
  currentOpacity: number;
}

export interface BuiltArchitectureScene {
  rootGroup: THREE.Group;
  floors: FloorRuntimeEntry[];
  wallCutaways: WallCutawayEntry[];
  roomHitMeshes: THREE.Mesh[];
  snapSurfaceMeshes: THREE.Mesh[];
  ceilingRaycastMeshes: THREE.Mesh[];
  structuralMeshes: THREE.Mesh[];
  elementGroups: Map<string, THREE.Object3D[]>;
  elementSpecs: Map<string, StructuralElement>;
  interactiveControlMeshes: THREE.Mesh[];
  hardwareModels: Map<string, HardwareModelRuntime>;
  applianceModels: Map<string, ApplianceModelRuntime>;
  applianceInteractiveMeshes: THREE.Mesh[];
  xrayWiring: XRayWiringRuntime | null;
  dispose: () => void;
}

interface ThemePalette {
  wallMain: number;
  wallParapet: number;
  baseboard: number;
  trimFrame: number;
  doorLeaf: number;
  slabEdge: number;
  glassTint: number;
  fenceMetal: number;
  roofTile: number;
  canopyWood: number;
}

function getArchitecturePalette(isLightTheme: boolean): ThemePalette {
  if (isLightTheme) {
    return {
      wallMain: 0xf4f1ea,
      wallParapet: 0xe6e2d8,
      baseboard: 0xcbd5e1,
      trimFrame: 0x475569,
      doorLeaf: 0x9a6b47,
      slabEdge: 0xdbe2ea,
      glassTint: 0x93c5fd,
      fenceMetal: 0x334155,
      roofTile: 0xb45309,
      canopyWood: 0x92400e,
    };
  }
  // Luminous architectural twilight palette (crisp off-white & cool sandstone — NEVER pitch-black slabs)
  return {
    wallMain: 0xd8dee9,
    wallParapet: 0xbac4d4,
    baseboard: 0x64748b,
    trimFrame: 0x334155,
    doorLeaf: 0x7c5338,
    slabEdge: 0x475569,
    glassTint: 0x7dd3fc,
    fenceMetal: 0x475569,
    roofTile: 0x9a3412,
    canopyWood: 0x78350f,
  };
}

function registerElementObject(
  elementGroups: Map<string, THREE.Object3D[]>,
  elementId: string,
  obj: THREE.Object3D
) {
  const existing = elementGroups.get(elementId);
  if (existing) {
    existing.push(obj);
  } else {
    elementGroups.set(elementId, [obj]);
  }
}

function tagStructuralMesh<T extends THREE.Mesh>(
  mesh: T,
  meta: StructuralSurfaceUserData,
  structuralMeshes: THREE.Mesh[],
  extra?: Record<string, unknown>,
  elementGroups?: Map<string, THREE.Object3D[]>
): T {
  mesh.userData = {
    ...(extra ?? {}),
    surfaceType: meta.surfaceType,
    elementId: meta.elementId,
    floorId: meta.floorId,
    roomId: meta.roomId,
    normal: meta.normal,
  };
  structuralMeshes.push(mesh);
  if (elementGroups) {
    registerElementObject(elementGroups, meta.elementId, mesh);
  }
  return mesh;
}

function buildModularWallWithOpeningsGroup(params: {
  wallEl: StructuralElement;
  openings: StructuralElement[];
  wallMat: THREE.MeshStandardMaterial;
  parapetMat: THREE.MeshStandardMaterial;
  baseboardMat: THREE.MeshStandardMaterial;
  frameMat: THREE.MeshStandardMaterial;
  doorLeafMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshStandardMaterial;
  castShadow: boolean;
  disposables: THREE.BufferGeometry[];
  disposablesMat: THREE.Material[];
  floorMats: THREE.MeshStandardMaterial[];
  structuralMeshes: THREE.Mesh[];
  elementGroups: Map<string, THREE.Object3D[]>;
  floorId: FloorId;
  roomId: string | null;
  normal: [number, number, number];
}): THREE.Group {
  const {
    wallEl,
    openings,
    wallMat,
    parapetMat,
    baseboardMat,
    frameMat,
    doorLeafMat,
    glassMat,
    castShadow,
    disposables,
    disposablesMat,
    floorMats,
    structuralMeshes,
    elementGroups,
    floorId,
    roomId,
    normal,
  } = params;

  const length = Math.max(0.4, wallEl.w);
  const height = Math.max(0.2, wallEl.h);
  const thickness = Math.max(0.06, wallEl.d);
  const wallBaseY = wallEl.y ?? 0.18;

  const group = new THREE.Group();

  const addBox = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.MeshStandardMaterial,
    surfaceType: SurfaceTagType,
    elementId: string,
    shadows: boolean = castShadow
  ) => {
    if (w <= 0.01 || h <= 0.01 || d <= 0.01) return;
    const geo = new THREE.BoxGeometry(w, h, d);
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    tagStructuralMesh(
      mesh,
      {
        surfaceType,
        elementId,
        floorId,
        roomId,
        normal,
      },
      structuralMeshes,
      undefined,
      elementGroups
    );
    group.add(mesh);
  };

  // Parapet or wall without openings
  if (wallEl.variant === 'parapet' && openings.length === 0) {
    const pH = height;
    addBox(length, pH, thickness, 0, pH / 2, 0, parapetMat, 'wall', wallEl.id);
    addBox(length + 0.04, 0.06, thickness + 0.05, 0, pH + 0.03, 0, baseboardMat, 'wall', wallEl.id, false);
    return group;
  }

  if (openings.length === 0 || length < 0.9) {
    addBox(length, height, thickness, 0, height / 2, 0, wallMat, 'wall', wallEl.id);
    addBox(length - 0.02, 0.11, thickness + 0.03, 0, 0.055, 0, baseboardMat, 'wall', wallEl.id, false);
    return group;
  }

  // Sort & layout 1..N openings along the wall span [-length/2, +length/2]
  interface LaidOpening {
    el: StructuralElement;
    start: number;
    end: number;
    span: number;
    center: number;
  }
  const laid: LaidOpening[] = [];
  const sorted = [...openings].sort((a, b) => (a.wallOffsetRatio ?? 0) - (b.wallOffsetRatio ?? 0));
  let cursorMin = -length / 2 + 0.15;

  for (const op of sorted) {
    const span = THREE.MathUtils.clamp(op.w, 0.45, Math.max(0.5, length - 0.35));
    const rawCenter = THREE.MathUtils.clamp(
      (op.wallOffsetRatio ?? 0) * length,
      -(length / 2 - span / 2 - 0.15),
      length / 2 - span / 2 - 0.15
    );
    const start = Math.max(cursorMin, rawCenter - span / 2);
    const end = start + span;
    if (end > length / 2 - 0.12) continue;
    laid.push({ el: op, start, end, span, center: (start + end) / 2 });
    cursorMin = end + 0.12;
  }

  if (laid.length === 0) {
    addBox(length, height, thickness, 0, height / 2, 0, wallMat, 'wall', wallEl.id);
    addBox(length - 0.02, 0.11, thickness + 0.03, 0, 0.055, 0, baseboardMat, 'wall', wallEl.id, false);
    return group;
  }

  // Solid full-height masonry piers between wall start, openings, and wall end
  let segStart = -length / 2;
  for (const item of laid) {
    const pierW = item.start - segStart;
    if (pierW > 0.03) {
      const cx = segStart + pierW / 2;
      addBox(pierW, height, thickness, cx, height / 2, 0, wallMat, 'wall', wallEl.id);
      addBox(pierW, 0.11, thickness + 0.03, cx, 0.055, 0, baseboardMat, 'wall', wallEl.id, false);
    }
    segStart = item.end;
  }
  const tailW = length / 2 - segStart;
  if (tailW > 0.03) {
    const cx = segStart + tailW / 2;
    addBox(tailW, height, thickness, cx, height / 2, 0, wallMat, 'wall', wallEl.id);
    addBox(tailW, 0.11, thickness + 0.03, cx, 0.055, 0, baseboardMat, 'wall', wallEl.id, false);
  }

  // Render each Door or Window opening with its own elementId
  for (const item of laid) {
    const op = item.el;
    const opMat = op.tint
      ? (() => {
          const m = new THREE.MeshStandardMaterial({
            color: new THREE.Color(op.tint),
            roughness: 0.5,
            metalness: 0.14,
            transparent: true,
            opacity: 1,
          });
          disposablesMat.push(m);
          floorMats.push(m);
          return m;
        })()
      : op.kind === 'door'
      ? doorLeafMat
      : frameMat;

    if (op.kind === 'door') {
      const doorH = THREE.MathUtils.clamp(op.h || 2.08, 1.0, Math.max(1.1, height - 0.14));
      const sillGap = THREE.MathUtils.clamp((op.y ?? wallBaseY) - wallBaseY, 0, Math.max(0, height - doorH - 0.1));
      const doorTop = sillGap + doorH;
      const lintelH = Math.max(0.08, height - doorTop);

      if (sillGap > 0.04) {
        addBox(item.span, sillGap, thickness, item.center, sillGap / 2, 0, wallMat, 'wall', wallEl.id);
      }
      addBox(item.span, lintelH, thickness, item.center, doorTop + lintelH / 2, 0, wallMat, 'wall', wallEl.id);

      // Doorway frame posts & header (tagged `door` + opening ID)
      addBox(0.05, doorH, thickness + 0.04, item.start + 0.025, sillGap + doorH / 2, 0, frameMat, 'door', op.id, false);
      addBox(0.05, doorH, thickness + 0.04, item.end - 0.025, sillGap + doorH / 2, 0, frameMat, 'door', op.id, false);
      addBox(item.span, 0.05, thickness + 0.04, item.center, doorTop - 0.025, 0, frameMat, 'door', op.id, false);

      if (op.variant === 'double_entry' && item.span >= 1.1) {
        const halfLeafW = Math.max(0.35, (item.span - 0.14) / 2);
        for (const sideSign of [-1, 1]) {
          const hingePivot = new THREE.Group();
          hingePivot.position.set(sideSign < 0 ? item.start + 0.05 : item.end - 0.05, sillGap, 0);
          hingePivot.rotation.y = sideSign < 0 ? -Math.PI / 6.5 : Math.PI / 6.5;

          const leafGeo = new THREE.BoxGeometry(halfLeafW, doorH - 0.06, 0.04);
          disposables.push(leafGeo);
          const leafMesh = new THREE.Mesh(leafGeo, opMat);
          leafMesh.position.set(sideSign < 0 ? halfLeafW / 2 : -halfLeafW / 2, (doorH - 0.06) / 2, 0);
          leafMesh.castShadow = castShadow;
          leafMesh.receiveShadow = castShadow;
          tagStructuralMesh(
            leafMesh,
            { surfaceType: 'door', elementId: op.id, floorId, roomId, normal },
            structuralMeshes,
            undefined,
            elementGroups
          );
          hingePivot.add(leafMesh);
          group.add(hingePivot);
        }
      } else {
        const leafW = Math.max(0.42, item.span - 0.12);
        const hingeGroup = new THREE.Group();
        hingeGroup.position.set(item.start + 0.05, sillGap, 0);
        hingeGroup.rotation.y = -Math.PI / 6.5;

        const leafGeo = new THREE.BoxGeometry(leafW, doorH - 0.06, 0.04);
        disposables.push(leafGeo);
        const leafMesh = new THREE.Mesh(leafGeo, opMat);
        leafMesh.position.set(leafW / 2, (doorH - 0.06) / 2, 0);
        leafMesh.castShadow = castShadow;
        leafMesh.receiveShadow = castShadow;
        tagStructuralMesh(
          leafMesh,
          { surfaceType: 'door', elementId: op.id, floorId, roomId, normal },
          structuralMeshes,
          undefined,
          elementGroups
        );
        hingeGroup.add(leafMesh);

        const handleGeo = new THREE.BoxGeometry(0.1, 0.03, 0.08);
        disposables.push(handleGeo);
        const handleMesh = new THREE.Mesh(handleGeo, frameMat);
        handleMesh.position.set(Math.max(0.18, leafW - 0.12), Math.min(1.02, doorH * 0.48), 0);
        tagStructuralMesh(
          handleMesh,
          { surfaceType: 'door', elementId: op.id, floorId, roomId, normal },
          structuralMeshes,
          undefined,
          elementGroups
        );
        hingeGroup.add(handleMesh);
        group.add(hingeGroup);
      }
    } else {
      // Window opening
      const sillH = THREE.MathUtils.clamp((op.y ?? wallBaseY + 1.0) - wallBaseY, 0.2, Math.max(0.25, height - 0.65));
      const winH = THREE.MathUtils.clamp(op.h || 1.25, 0.35, Math.max(0.4, height - sillH - 0.16));
      const headerH = Math.max(0.12, height - sillH - winH);

      addBox(item.span, sillH, thickness, item.center, sillH / 2, 0, wallMat, 'wall', wallEl.id);
      addBox(item.span, 0.11, thickness + 0.03, item.center, 0.055, 0, baseboardMat, 'wall', wallEl.id, false);
      addBox(item.span, headerH, thickness, item.center, sillH + winH + headerH / 2, 0, wallMat, 'wall', wallEl.id);

      const frameUsed = op.tint ? opMat : frameMat;
      addBox(item.span + 0.04, 0.05, thickness + 0.06, item.center, sillH + 0.02, 0, frameUsed, 'window', op.id, false);
      addBox(item.span + 0.04, 0.04, thickness + 0.04, item.center, sillH + winH - 0.02, 0, frameUsed, 'window', op.id, false);
      addBox(0.04, winH, thickness + 0.03, item.start + 0.02, sillH + winH / 2, 0, frameUsed, 'window', op.id, false);
      addBox(0.04, winH, thickness + 0.03, item.end - 0.02, sillH + winH / 2, 0, frameUsed, 'window', op.id, false);
      if (op.variant === 'sliding_glass') {
        addBox(0.035, winH - 0.04, thickness + 0.035, item.center, sillH + winH / 2, 0, frameUsed, 'window', op.id, false);
      }
      addBox(item.span - 0.06, winH - 0.06, 0.025, item.center, sillH + winH / 2, 0, glassMat, 'window', op.id, false);
    }
  }

  return group;
}

export function buildHomeArchitecture(params: {
  blueprint: HomeArchitectureBlueprint;
  devices: Record<string, VirtualDeviceInstance>;
  isLightTheme: boolean;
  isSoftwareGl: boolean;
  maxAnisotropy: number;
  xrayWiring?: boolean;
  selectedApplianceId?: string | null;
}): BuiltArchitectureScene {
  const {
    blueprint,
    devices,
    isLightTheme,
    isSoftwareGl,
    maxAnisotropy,
    xrayWiring = false,
    selectedApplianceId = null,
  } = params;
  const palette = getArchitecturePalette(isLightTheme);
  const castShadows = !isSoftwareGl;

  const disposablesGeo: THREE.BufferGeometry[] = [];
  const disposablesMat: THREE.Material[] = [];
  const disposablesTex: THREE.Texture[] = [];

  const rootGroup = new THREE.Group();
  const floors: FloorRuntimeEntry[] = [];
  const wallCutaways: WallCutawayEntry[] = [];
  const roomHitMeshes: THREE.Mesh[] = [];
  const snapSurfaceMeshes: THREE.Mesh[] = [];
  const ceilingRaycastMeshes: THREE.Mesh[] = [];
  const structuralMeshes: THREE.Mesh[] = [];
  const elementGroups = new Map<string, THREE.Object3D[]>();
  const elementSpecs = new Map<string, StructuralElement>();
  const interactiveControlMeshes: THREE.Mesh[] = [];
  const hardwareModels = new Map<string, HardwareModelRuntime>();
  const applianceModels = new Map<string, ApplianceModelRuntime>();
  const applianceInteractiveMeshes: THREE.Mesh[] = [];
  const invisibleSnapMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.001,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  disposablesMat.push(invisibleSnapMat);

  // Cache procedural sRGB textures per floor material kind
  const floorTexCache = new Map<RoomFloorMaterialKind, THREE.CanvasTexture>();
  const getFloorTex = (kind: RoomFloorMaterialKind) => {
    let tex = floorTexCache.get(kind);
    if (!tex) {
      tex = createArchitecturalFloorTexture(kind, isLightTheme, maxAnisotropy);
      floorTexCache.set(kind, tex);
      disposablesTex.push(tex);
    }
    return tex;
  };

  // Cache procedural sRGB textures for modular ground primitives (`courtyard_lawn`, `concrete_driveway`)
  const groundTexCache = new Map<'courtyard_lawn' | 'concrete_driveway', THREE.CanvasTexture>();
  const getGroundTex = (kind: 'courtyard_lawn' | 'concrete_driveway') => {
    let tex = groundTexCache.get(kind);
    if (!tex) {
      tex = createModularGroundTexture(kind, isLightTheme, maxAnisotropy);
      groundTexCache.set(kind, tex);
      disposablesTex.push(tex);
    }
    return tex;
  };

  const effectiveStructure =
    blueprint.structure && blueprint.structure.elements.length > 0
      ? blueprint.structure
      : generateDefaultStructureFromBlueprint(blueprint);
  for (const el of effectiveStructure.elements) {
    elementSpecs.set(el.id, el);
  }

  const roomByIdForStruct = new Map(blueprint.rooms.map((r) => [r.id, r]));
  const floorElementsByRoomId = new Map<string, StructuralElement>();
  const wallElementsByRoomSide = new Map<string, StructuralElement>();
  const openingsByParentWallId = new Map<string, StructuralElement[]>();
  const elementById = new Map(effectiveStructure.elements.map((e) => [e.id, e]));

  for (const el of effectiveStructure.elements) {
    if (el.kind === 'floor' && el.roomId && !floorElementsByRoomId.has(el.roomId)) {
      floorElementsByRoomId.set(el.roomId, el);
    }
    if (el.kind === 'wall' && el.roomId && el.wallSide && !wallElementsByRoomSide.has(`${el.roomId}:${el.wallSide}`)) {
      wallElementsByRoomSide.set(`${el.roomId}:${el.wallSide}`, el);
    }
    if ((el.kind === 'door' || el.kind === 'window') && el.parentWallId) {
      const list = openingsByParentWallId.get(el.parentWallId);
      if (list) list.push(el);
      else openingsByParentWallId.set(el.parentWallId, [el]);
    }
  }

  const floorGroupMap = new Map<FloorId, FloorRuntimeEntry>();

  blueprint.floors.forEach((floorSpec, floorIdx) => {
    const floorGroup = new THREE.Group();
    floorGroup.position.set(0, floorSpec.baseY, 0);
    rootGroup.add(floorGroup);

    const floorMats: THREE.MeshStandardMaterial[] = [];
    const trackMat = (mat: THREE.MeshStandardMaterial) => {
      disposablesMat.push(mat);
      floorMats.push(mat);
      return mat;
    };

    const wallMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.wallMain,
        roughness: 0.78,
        metalness: 0.04,
        transparent: true,
        opacity: 1,
      })
    );
    const parapetMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.wallParapet,
        roughness: 0.84,
        metalness: 0.04,
        transparent: true,
        opacity: 1,
      })
    );
    const baseboardMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.baseboard,
        roughness: 0.55,
        metalness: 0.12,
        transparent: true,
        opacity: 1,
      })
    );
    const frameMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.trimFrame,
        roughness: 0.42,
        metalness: 0.35,
        transparent: true,
        opacity: 1,
      })
    );
    const doorLeafMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.doorLeaf,
        roughness: 0.56,
        metalness: 0.08,
        transparent: true,
        opacity: 1,
      })
    );
    const fenceMetalMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.fenceMetal,
        roughness: 0.38,
        metalness: 0.52,
        transparent: true,
        opacity: 1,
      })
    );
    const roofTileMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.roofTile,
        roughness: 0.7,
        metalness: 0.08,
        transparent: true,
        opacity: 1,
      })
    );
    const canopyWoodMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.canopyWood,
        roughness: 0.62,
        metalness: 0.06,
        transparent: true,
        opacity: 1,
      })
    );
    const slabEdgeMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.slabEdge,
        roughness: 0.72,
        metalness: 0.08,
        transparent: true,
        opacity: 1,
      })
    );
    const glassMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.glassTint,
        roughness: 0.12,
        metalness: 0.15,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      })
    );

    const floorRooms = blueprint.rooms.filter((r) => r.floorId === floorSpec.id);
    const slabH = floorSpec.slabThickness;

    // 1. Per-Room Floor/Ceiling Invisible Snap Planes (using live structural dimensions if present)
    floorRooms.forEach((room: ArchitecturalRoomSpec) => {
      const floorEl = floorElementsByRoomId.get(room.id);
      const rx = floorEl?.x ?? room.x;
      const rz = floorEl?.z ?? room.z;
      const rw = floorEl?.w ?? room.w;
      const rd = floorEl?.d ?? room.d;
      const rSlabH = floorEl?.h ?? slabH;
      const roomWallH = room.wallHeight ?? floorSpec.wallHeight;
      const slabTopY = rSlabH + 0.01;

      if (floorEl) {
        const floorSnapGeo = new THREE.PlaneGeometry(Math.max(0.4, rw - 0.12), Math.max(0.4, rd - 0.12));
        disposablesGeo.push(floorSnapGeo);
        const floorSnapMesh = new THREE.Mesh(floorSnapGeo, invisibleSnapMat);
        floorSnapMesh.rotation.x = -Math.PI / 2;
        floorSnapMesh.position.set(rx, slabTopY + 0.015, rz);
        const floorSnapUserData: SnapSurfaceUserData = {
          kind: 'snap_surface',
          surfaceType: 'floor',
          elementId: floorEl.id,
          roomId: room.id,
          floorId: room.floorId,
          normal: [0, 1, 0],
          surface: 'floor',
          roomX: rx,
          roomZ: rz,
          roomW: rw,
          roomD: rd,
          slabTopY,
          wallHeight: roomWallH,
        };
        floorSnapMesh.userData = floorSnapUserData;
        floorGroup.add(floorSnapMesh);
        snapSurfaceMeshes.push(floorSnapMesh);
        structuralMeshes.push(floorSnapMesh);
      }

      if (room.floorType !== 'outdoor' && roomWallH >= 1.8) {
        const ceilSnapGeo = new THREE.PlaneGeometry(Math.max(0.4, rw - 0.12), Math.max(0.4, rd - 0.12));
        disposablesGeo.push(ceilSnapGeo);
        const ceilSnapMesh = new THREE.Mesh(ceilSnapGeo, invisibleSnapMat);
        ceilSnapMesh.rotation.x = Math.PI / 2;
        ceilSnapMesh.position.set(rx, slabTopY + roomWallH - 0.05, rz);
        const ceilSnapUserData: SnapSurfaceUserData = {
          kind: 'snap_surface',
          surfaceType: 'ceiling',
          elementId: `el_ceiling_${room.id}`,
          roomId: room.id,
          floorId: room.floorId,
          normal: [0, -1, 0],
          surface: 'ceiling',
          roomX: rx,
          roomZ: rz,
          roomW: rw,
          roomD: rd,
          slabTopY,
          wallHeight: roomWallH,
        };
        ceilSnapMesh.userData = ceilSnapUserData;
        floorGroup.add(ceilSnapMesh);
        snapSurfaceMeshes.push(ceilSnapMesh);
        ceilingRaycastMeshes.push(ceilSnapMesh);
        structuralMeshes.push(ceilSnapMesh);
      }
    });

    // Auto-generate lightweight per-floor ceiling raycast plane spanning all enclosed rooms on this floor
    const enclosedFloorRooms = floorRooms.filter(
      (r) => r.floorType !== 'outdoor' && (r.wallHeight ?? floorSpec.wallHeight) >= 1.8
    );
    if (enclosedFloorRooms.length > 0 && floorSpec.id !== 'roof') {
      let cMinX = Infinity;
      let cMaxX = -Infinity;
      let cMinZ = Infinity;
      let cMaxZ = -Infinity;
      for (const r of enclosedFloorRooms) {
        cMinX = Math.min(cMinX, r.x - r.w / 2);
        cMaxX = Math.max(cMaxX, r.x + r.w / 2);
        cMinZ = Math.min(cMinZ, r.z - r.d / 2);
        cMaxZ = Math.max(cMaxZ, r.z + r.d / 2);
      }
      const spanW = Math.max(1, cMaxX - cMinX);
      const spanD = Math.max(1, cMaxZ - cMinZ);
      const floorCeilGeo = new THREE.PlaneGeometry(spanW, spanD);
      disposablesGeo.push(floorCeilGeo);
      const floorCeilMesh = new THREE.Mesh(floorCeilGeo, invisibleSnapMat);
      floorCeilMesh.rotation.x = Math.PI / 2;
      floorCeilMesh.position.set(
        (cMinX + cMaxX) / 2,
        slabH + floorSpec.wallHeight - 0.04,
        (cMinZ + cMaxZ) / 2
      );
      tagStructuralMesh(
        floorCeilMesh,
        {
          surfaceType: 'ceiling',
          elementId: `el_ceiling_floor_${floorSpec.id}`,
          floorId: floorSpec.id,
          roomId: null,
          normal: [0, -1, 0],
        },
        structuralMeshes
      );
      floorGroup.add(floorCeilMesh);
      ceilingRaycastMeshes.push(floorCeilMesh);
    }

    // 2. Unified Render of ALL Structural Elements (Template + Custom) for this Floor
    const floorStructuralElements = effectiveStructure.elements.filter(
      (el) => el.floorId === floorSpec.id
    );
    const floorRoofTerraceRoomIds = new Set(
      floorStructuralElements.filter((e) => e.kind === 'floor' && e.roomId).map((e) => e.roomId!)
    );

    for (const el of floorStructuralElements) {
      const elY = el.y ?? 0;
      const rotRad = THREE.MathUtils.degToRad(el.rotationDeg || 0);
      const normalX = Number(Math.sin(rotRad).toFixed(3));
      const normalZ = Number(Math.cos(rotRad).toFixed(3));
      const elNormal: [number, number, number] =
        el.kind === 'ground' || el.kind === 'floor' || el.kind === 'roof'
          ? [0, 1, 0]
          : el.wallSide === 'north'
          ? [0, 0, -1]
          : el.wallSide === 'south'
          ? [0, 0, 1]
          : el.wallSide === 'east'
          ? [1, 0, 0]
          : el.wallSide === 'west'
          ? [-1, 0, 0]
          : [normalX, 0, normalZ];

      if (el.kind === 'ground') {
        const groundVariant = el.variant === 'concrete_driveway' ? 'concrete_driveway' : 'courtyard_lawn';
        const gTex = getGroundTex(groundVariant);
        const gMat = trackMat(
          new THREE.MeshStandardMaterial({
            map: gTex,
            color: el.tint ? new THREE.Color(el.tint) : 0xffffff,
            roughness: groundVariant === 'concrete_driveway' ? 0.78 : 0.92,
            metalness: 0.02,
            transparent: true,
            opacity: 1,
          })
        );
        const gH = Math.max(0.016, el.h);
        const gGeo = new THREE.BoxGeometry(el.w, gH, el.d);
        disposablesGeo.push(gGeo);
        const gMesh = new THREE.Mesh(gGeo, gMat);
        gMesh.position.set(el.x, elY + gH / 2, el.z);
        gMesh.rotation.y = rotRad;
        gMesh.receiveShadow = castShadows;
        tagStructuralMesh(
          gMesh,
          {
            surfaceType: 'ground',
            elementId: el.id,
            floorId: el.floorId,
            roomId: el.roomId ?? null,
            normal: [0, 1, 0],
          },
          structuralMeshes,
          undefined,
          elementGroups
        );
        floorGroup.add(gMesh);
        continue;
      }

      if (el.kind === 'fence') {
        const fenceGroup = new THREE.Group();
        fenceGroup.position.set(el.x, elY, el.z);
        fenceGroup.rotation.y = rotRad;
        registerElementObject(elementGroups, el.id, fenceGroup);

        const customFenceMat = el.tint
          ? trackMat(
              new THREE.MeshStandardMaterial({
                color: new THREE.Color(el.tint),
                roughness: 0.55,
                metalness: 0.15,
                transparent: true,
                opacity: 1,
              })
            )
          : null;

        if (el.variant === 'main_gate') {
          const postW = 0.22;
          const postH = el.h + 0.12;
          const leafW = Math.max(0.4, (el.w - postW * 2 - 0.08) / 2);

          for (const sideSign of [-1, 1]) {
            const pGeo = new THREE.BoxGeometry(postW, postH, 0.24);
            disposablesGeo.push(pGeo);
            const pMesh = new THREE.Mesh(pGeo, customFenceMat ?? parapetMat);
            pMesh.position.set(sideSign * (el.w / 2 - postW / 2), postH / 2, 0);
            pMesh.castShadow = castShadows;
            pMesh.receiveShadow = castShadows;
            tagStructuralMesh(
              pMesh,
              {
                surfaceType: 'wall',
                elementId: el.id,
                floorId: el.floorId,
                roomId: el.roomId ?? null,
                normal: elNormal,
              },
              structuralMeshes
            );
            fenceGroup.add(pMesh);
          }

          for (const sideSign of [-1, 1]) {
            const pivot = new THREE.Group();
            pivot.position.set(sideSign * (el.w / 2 - postW - 0.02), 0, 0);
            pivot.rotation.y = sideSign * -0.22;
            const gLeafGeo = new THREE.BoxGeometry(leafW, Math.max(0.2, el.h - 0.08), 0.06);
            disposablesGeo.push(gLeafGeo);
            const gLeaf = new THREE.Mesh(gLeafGeo, customFenceMat ?? fenceMetalMat);
            gLeaf.position.set(-sideSign * (leafW / 2), (el.h - 0.08) / 2 + 0.04, 0);
            gLeaf.castShadow = castShadows;
            tagStructuralMesh(
              gLeaf,
              {
                surfaceType: 'door',
                elementId: el.id,
                floorId: el.floorId,
                roomId: el.roomId ?? null,
                normal: elNormal,
              },
              structuralMeshes
            );
            pivot.add(gLeaf);
            fenceGroup.add(pivot);
          }
        } else {
          const baseH = Math.min(0.45, el.h * 0.45);
          const railH = Math.max(0.2, el.h - baseH);
          const fBaseGeo = new THREE.BoxGeometry(el.w, baseH, el.d);
          disposablesGeo.push(fBaseGeo);
          const fBase = new THREE.Mesh(fBaseGeo, customFenceMat ?? parapetMat);
          fBase.position.set(0, baseH / 2, 0);
          fBase.castShadow = castShadows;
          fBase.receiveShadow = castShadows;
          tagStructuralMesh(
            fBase,
            {
              surfaceType: 'wall',
              elementId: el.id,
              floorId: el.floorId,
              roomId: el.roomId ?? null,
              normal: elNormal,
            },
            structuralMeshes
          );
          fenceGroup.add(fBase);

          const fTopGeo = new THREE.BoxGeometry(Math.max(0.2, el.w - 0.04), railH, Math.max(0.05, el.d * 0.45));
          disposablesGeo.push(fTopGeo);
          const fTop = new THREE.Mesh(fTopGeo, customFenceMat ?? fenceMetalMat);
          fTop.position.set(0, baseH + railH / 2, 0);
          fTop.castShadow = castShadows;
          tagStructuralMesh(
            fTop,
            {
              surfaceType: 'wall',
              elementId: el.id,
              floorId: el.floorId,
              roomId: el.roomId ?? null,
              normal: elNormal,
            },
            structuralMeshes
          );
          fenceGroup.add(fTop);
        }

        floorGroup.add(fenceGroup);
        continue;
      }

      if (el.kind === 'floor') {
        const roomSpec = el.roomId ? roomByIdForStruct.get(el.roomId) : undefined;
        const floorKind: RoomFloorMaterialKind =
          el.variant === 'marble'
            ? 'marble'
            : el.variant === 'wood'
            ? 'wood'
            : el.variant === 'tile'
            ? roomSpec?.floorType === 'kitchen_tile'
              ? 'kitchen_tile'
              : 'tile'
            : roomSpec?.floorType === 'outdoor'
            ? 'outdoor'
            : 'garage';

        const fGroup = new THREE.Group();
        fGroup.position.set(el.x, elY, el.z);
        fGroup.rotation.y = rotRad;
        registerElementObject(elementGroups, el.id, fGroup);

        const slabThick = Math.max(0.04, el.h);
        const baseGeo = new THREE.BoxGeometry(el.w + 0.06, slabThick * 0.78, el.d + 0.06);
        disposablesGeo.push(baseGeo);
        const baseMesh = new THREE.Mesh(baseGeo, slabEdgeMat);
        baseMesh.position.set(0, (slabThick * 0.78) / 2, 0);
        baseMesh.receiveShadow = castShadows;
        baseMesh.castShadow = castShadows;
        tagStructuralMesh(
          baseMesh,
          {
            surfaceType: 'floor',
            elementId: el.id,
            floorId: el.floorId,
            roomId: el.roomId ?? null,
            normal: [0, 1, 0],
          },
          structuralMeshes
        );
        fGroup.add(baseMesh);

        const finishTint = el.tint ?? roomSpec?.accentTint ?? null;
        const finishMat = trackMat(
          new THREE.MeshStandardMaterial({
            map: getFloorTex(floorKind),
            color: finishTint ? new THREE.Color(finishTint) : 0xffffff,
            roughness:
              floorKind === 'marble'
                ? 0.28
                : floorKind === 'tile' || floorKind === 'kitchen_tile'
                ? 0.38
                : floorKind === 'wood'
                ? 0.58
                : 0.78,
            metalness: floorKind === 'marble' ? 0.12 : 0.04,
            transparent: true,
            opacity: 1,
          })
        );
        const finishGeo = new THREE.BoxGeometry(
          Math.max(0.2, el.w - 0.04),
          slabThick * 0.28,
          Math.max(0.2, el.d - 0.04)
        );
        disposablesGeo.push(finishGeo);
        const finishMesh = new THREE.Mesh(finishGeo, finishMat);
        finishMesh.position.set(0, slabThick * 0.78 + (slabThick * 0.28) / 2, 0);
        finishMesh.receiveShadow = castShadows;
        tagStructuralMesh(
          finishMesh,
          {
            surfaceType: 'floor',
            elementId: el.id,
            floorId: el.floorId,
            roomId: el.roomId ?? null,
            normal: [0, 1, 0],
          },
          structuralMeshes,
          el.roomId ? { kind: 'room' } : undefined
        );
        fGroup.add(finishMesh);
        if (el.roomId) {
          roomHitMeshes.push(finishMesh);
        }
        floorGroup.add(fGroup);
        continue;
      }

      if (el.kind === 'wall' && el.variant === 'pillar') {
        const pilMat = el.tint
          ? trackMat(
              new THREE.MeshStandardMaterial({
                color: new THREE.Color(el.tint),
                roughness: 0.6,
                metalness: 0.08,
                transparent: true,
                opacity: 1,
              })
            )
          : baseboardMat;
        const pilGeo = new THREE.BoxGeometry(el.w, el.h, el.d);
        disposablesGeo.push(pilGeo);
        const pilMesh = new THREE.Mesh(pilGeo, pilMat);
        pilMesh.position.set(el.x, elY + el.h / 2, el.z);
        pilMesh.rotation.y = rotRad;
        pilMesh.castShadow = castShadows;
        pilMesh.receiveShadow = castShadows;
        tagStructuralMesh(
          pilMesh,
          {
            surfaceType: 'wall',
            elementId: el.id,
            floorId: el.floorId,
            roomId: el.roomId ?? null,
            normal: elNormal,
          },
          structuralMeshes,
          undefined,
          elementGroups
        );
        floorGroup.add(pilMesh);
        continue;
      }

      if (el.kind === 'wall') {
        const customWallMat = el.tint
          ? trackMat(
              new THREE.MeshStandardMaterial({
                color: new THREE.Color(el.tint),
                roughness: 0.78,
                metalness: 0.04,
                transparent: true,
                opacity: 1,
              })
            )
          : wallMat;
        const openings = openingsByParentWallId.get(el.id) ?? [];
        const wallGroup = buildModularWallWithOpeningsGroup({
          wallEl: el,
          openings,
          wallMat: customWallMat,
          parapetMat: el.tint ? customWallMat : parapetMat,
          baseboardMat,
          frameMat,
          doorLeafMat,
          glassMat,
          castShadow: castShadows,
          disposables: disposablesGeo,
          disposablesMat,
          floorMats,
          structuralMeshes,
          elementGroups,
          floorId: el.floorId,
          roomId: el.roomId ?? null,
          normal: elNormal,
        });
        wallGroup.position.set(el.x, elY, el.z);
        wallGroup.rotation.y = rotRad;
        registerElementObject(elementGroups, el.id, wallGroup);
        floorGroup.add(wallGroup);

        // Interior-facing snap plane & Auto-Cutaway tracking for room walls
        const roomSpec = el.roomId ? roomByIdForStruct.get(el.roomId) : undefined;
        if (roomSpec && el.wallSide) {
          const wallSnapGeo = new THREE.PlaneGeometry(Math.max(0.2, el.w - 0.14), el.h);
          disposablesGeo.push(wallSnapGeo);
          const wallSnapMesh = new THREE.Mesh(wallSnapGeo, invisibleSnapMat);
          wallSnapMesh.position.set(0, el.h / 2, 0);
          const wallSnapUserData: SnapSurfaceUserData = {
            kind: 'snap_surface',
            surfaceType: 'wall',
            elementId: el.id,
            roomId: roomSpec.id,
            floorId: el.floorId,
            normal: elNormal,
            surface: el.wallSide,
            roomX: roomSpec.x,
            roomZ: roomSpec.z,
            roomW: roomSpec.w,
            roomD: roomSpec.d,
            slabTopY: elY + 0.01,
            wallHeight: el.h,
          };
          wallSnapMesh.userData = wallSnapUserData;
          wallGroup.add(wallSnapMesh);
          snapSurfaceMeshes.push(wallSnapMesh);
          structuralMeshes.push(wallSnapMesh);

          wallCutaways.push({
            group: wallGroup,
            floorId: floorSpec.id,
            roomId: roomSpec.id,
            wallKey: el.wallSide,
            normalX: elNormal[0],
            normalZ: elNormal[2],
            roomCenterX: roomSpec.x,
            roomCenterZ: roomSpec.z,
            isParapet: el.variant === 'parapet',
            currentScaleY: 1,
          });
        }
        continue;
      }

      if (el.kind === 'roof') {
        const roofGroup = new THREE.Group();
        roofGroup.position.set(el.x, elY, el.z);
        roofGroup.rotation.y = rotRad;
        registerElementObject(elementGroups, el.id, roofGroup);

        const customRoofMat = el.tint
          ? trackMat(
              new THREE.MeshStandardMaterial({
                color: new THREE.Color(el.tint),
                roughness: 0.68,
                metalness: 0.08,
                transparent: true,
                opacity: 1,
              })
            )
          : null;

        if (el.variant === 'sloped_roof') {
          const halfD = el.d / 2 + 0.12;
          const slopeLen = Math.hypot(halfD, el.h);
          const slopeAngle = Math.atan2(el.h, halfD);
          for (const sideSign of [-1, 1]) {
            const pGeo = new THREE.BoxGeometry(el.w + 0.2, 0.06, slopeLen);
            disposablesGeo.push(pGeo);
            const pMesh = new THREE.Mesh(pGeo, customRoofMat ?? roofTileMat);
            pMesh.position.set(0, el.h * 0.5, sideSign * (halfD / 2));
            pMesh.rotation.x = sideSign * slopeAngle;
            pMesh.castShadow = castShadows;
            pMesh.receiveShadow = castShadows;
            tagStructuralMesh(
              pMesh,
              {
                surfaceType: 'roof',
                elementId: el.id,
                floorId: el.floorId,
                roomId: el.roomId ?? null,
                normal: [0, 1, 0],
              },
              structuralMeshes
            );
            roofGroup.add(pMesh);
          }
        } else if (el.variant === 'canopy') {
          const beamGeo = new THREE.BoxGeometry(el.w, 0.09, 0.09);
          disposablesGeo.push(beamGeo);
          for (const zOff of [-el.d / 2 + 0.06, el.d / 2 - 0.06]) {
            const beam = new THREE.Mesh(beamGeo, frameMat);
            beam.position.set(0, 0, zOff);
            beam.castShadow = castShadows;
            tagStructuralMesh(
              beam,
              {
                surfaceType: 'roof',
                elementId: el.id,
                floorId: el.floorId,
                roomId: el.roomId ?? null,
                normal: [0, 1, 0],
              },
              structuralMeshes
            );
            roofGroup.add(beam);
          }

          const slatCount = Math.max(3, Math.floor(el.w / 0.35));
          const slatGeo = new THREE.BoxGeometry(0.06, 0.06, Math.max(0.2, el.d - 0.04));
          disposablesGeo.push(slatGeo);
          for (let i = 0; i < slatCount; i++) {
            const ratio = slatCount === 1 ? 0 : i / (slatCount - 1) - 0.5;
            const slat = new THREE.Mesh(slatGeo, customRoofMat ?? canopyWoodMat);
            slat.position.set(ratio * Math.max(0.2, el.w - 0.2), 0.04, 0);
            slat.castShadow = castShadows;
            tagStructuralMesh(
              slat,
              {
                surfaceType: 'roof',
                elementId: el.id,
                floorId: el.floorId,
                roomId: el.roomId ?? null,
                normal: [0, 1, 0],
              },
              structuralMeshes
            );
            roofGroup.add(slat);
          }
        } else {
          // rcc_terrace: render full RCC slab when standalone, plus coping trim strip
          const hasMatchingFloor = Boolean(el.roomId && floorRoofTerraceRoomIds.has(el.roomId) && el.id.startsWith('el_roof_terrace_'));
          if (!hasMatchingFloor) {
            const slabGeo = new THREE.BoxGeometry(el.w, Math.max(0.08, el.h), el.d);
            disposablesGeo.push(slabGeo);
            const slabMesh = new THREE.Mesh(slabGeo, customRoofMat ?? wallMat);
            slabMesh.position.set(0, Math.max(0.08, el.h) / 2, 0);
            slabMesh.castShadow = castShadows;
            slabMesh.receiveShadow = castShadows;
            tagStructuralMesh(
              slabMesh,
              {
                surfaceType: 'roof',
                elementId: el.id,
                floorId: el.floorId,
                roomId: el.roomId ?? null,
                normal: [0, 1, 0],
              },
              structuralMeshes
            );
            roofGroup.add(slabMesh);
          }
          const trimGeo = new THREE.BoxGeometry(el.w + 0.08, 0.04, el.d + 0.08);
          disposablesGeo.push(trimGeo);
          const trimMesh = new THREE.Mesh(trimGeo, customRoofMat ?? slabEdgeMat);
          trimMesh.position.set(0, el.h + 0.015, 0);
          trimMesh.receiveShadow = castShadows;
          tagStructuralMesh(
            trimMesh,
            {
              surfaceType: 'roof',
              elementId: el.id,
              floorId: el.floorId,
              roomId: el.roomId ?? null,
              normal: [0, 1, 0],
            },
            structuralMeshes
          );
          roofGroup.add(trimMesh);
        }

        floorGroup.add(roofGroup);
        continue;
      }

      // Standalone Door or Window when not attached to an active parent wall
      const parentWallExists = Boolean(el.parentWallId && elementById.has(el.parentWallId));
      if ((el.kind === 'door' || el.kind === 'window') && !parentWallExists) {
        const opGroup = new THREE.Group();
        opGroup.position.set(el.x, elY, el.z);
        opGroup.rotation.y = rotRad;
        registerElementObject(elementGroups, el.id, opGroup);

        const opMat = el.tint
          ? trackMat(
              new THREE.MeshStandardMaterial({
                color: new THREE.Color(el.tint),
                roughness: 0.5,
                metalness: 0.15,
                transparent: true,
                opacity: 1,
              })
            )
          : el.kind === 'door'
          ? doorLeafMat
          : frameMat;

        if (el.kind === 'door') {
          const dFrameGeo = new THREE.BoxGeometry(el.w, el.h, el.d + 0.06);
          disposablesGeo.push(dFrameGeo);
          const dFrame = new THREE.Mesh(dFrameGeo, frameMat);
          dFrame.position.set(0, el.h / 2, 0);
          tagStructuralMesh(
            dFrame,
            {
              surfaceType: 'door',
              elementId: el.id,
              floorId: el.floorId,
              roomId: el.roomId ?? null,
              normal: elNormal,
            },
            structuralMeshes
          );
          opGroup.add(dFrame);

          const leafPivot = new THREE.Group();
          leafPivot.position.set(-el.w / 2 + 0.06, 0, 0);
          leafPivot.rotation.y = -Math.PI / 5.5;
          const leafGeo = new THREE.BoxGeometry(Math.max(0.4, el.w - 0.1), Math.max(0.4, el.h - 0.06), 0.045);
          disposablesGeo.push(leafGeo);
          const leaf = new THREE.Mesh(leafGeo, opMat);
          leaf.position.set(Math.max(0.2, (el.w - 0.1) / 2), Math.max(0.2, (el.h - 0.06) / 2), 0);
          tagStructuralMesh(
            leaf,
            {
              surfaceType: 'door',
              elementId: el.id,
              floorId: el.floorId,
              roomId: el.roomId ?? null,
              normal: elNormal,
            },
            structuralMeshes
          );
          leafPivot.add(leaf);
          opGroup.add(leafPivot);
        } else {
          const sillGeo = new THREE.BoxGeometry(el.w + 0.06, 0.06, el.d + 0.09);
          disposablesGeo.push(sillGeo);
          const sill = new THREE.Mesh(sillGeo, opMat);
          sill.position.set(0, 0, 0);
          tagStructuralMesh(
            sill,
            {
              surfaceType: 'window',
              elementId: el.id,
              floorId: el.floorId,
              roomId: el.roomId ?? null,
              normal: elNormal,
            },
            structuralMeshes
          );
          opGroup.add(sill);

          const paneGeo = new THREE.BoxGeometry(Math.max(0.3, el.w - 0.08), Math.max(0.35, el.h - 0.08), el.d + 0.03);
          disposablesGeo.push(paneGeo);
          const pane = new THREE.Mesh(paneGeo, glassMat);
          pane.position.set(0, el.h / 2, 0);
          tagStructuralMesh(
            pane,
            {
              surfaceType: 'window',
              elementId: el.id,
              floorId: el.floorId,
              roomId: el.roomId ?? null,
              normal: elNormal,
            },
            structuralMeshes
          );
          opGroup.add(pane);
        }

        floorGroup.add(opGroup);
      }
    }

    // Subtle architectural staircase risers on Duplex Ground Floor for instant vertical spatial cue
    if (blueprint.templateId === 'duplex' && floorSpec.id === 'gf') {
      const stairGroup = new THREE.Group();
      const stepCount = 9;
      for (let i = 0; i < stepCount; i++) {
        const stepGeo = new THREE.BoxGeometry(0.9, 0.14, 0.28);
        disposablesGeo.push(stepGeo);
        const step = new THREE.Mesh(stepGeo, baseboardMat);
        step.position.set(0.55, slabH + 0.1 + i * 0.26, -1.45 + i * 0.28);
        step.castShadow = castShadows;
        step.receiveShadow = castShadows;
        tagStructuralMesh(
          step,
          {
            surfaceType: 'floor',
            elementId: `el_stairs_${floorSpec.id}`,
            floorId: floorSpec.id,
            roomId: floorRooms[0]?.id ?? null,
            normal: [0, 1, 0],
          },
          structuralMeshes
        );
        stairGroup.add(step);
      }
      floorGroup.add(stairGroup);
    }

    // Subtle rooftop stairwell mumty / access pad on Roof Terrace
    if (floorSpec.id === 'roof') {
      const roofRoom = floorRooms[0];
      if (roofRoom) {
        const padGeo = new THREE.BoxGeometry(1.5, 0.12, 1.5);
        disposablesGeo.push(padGeo);
        const pad = new THREE.Mesh(padGeo, baseboardMat);
        pad.position.set(roofRoom.x + roofRoom.w * 0.26, slabH + 0.06, roofRoom.z - roofRoom.d * 0.2);
        pad.receiveShadow = castShadows;
        tagStructuralMesh(
          pad,
          {
            surfaceType: 'roof',
            elementId: `el_roof_pad_${floorSpec.id}`,
            floorId: floorSpec.id,
            roomId: roofRoom.id,
            normal: [0, 1, 0],
          },
          structuralMeshes
        );
        floorGroup.add(pad);
      }
    }

    const initiallyVisible = floorSpec.visible !== false;
    floorGroup.visible = initiallyVisible;

    const entry: FloorRuntimeEntry = {
      spec: floorSpec,
      index: floorIdx,
      group: floorGroup,
      materials: floorMats,
      currentLiftY: 0,
      currentOpacity: initiallyVisible ? 1 : 0,
    };
    floors.push(entry);
    floorGroupMap.set(floorSpec.id, entry);
  });

  // Helper: computes exact flush wall-mount coordinates & inward facing yaw for wall-mounted hardware
  const isWallMountedArchetype = (arch: HardwareArchetype) =>
    arch === 'switchboard' ||
    arch === 'fan_regulator' ||
    arch === 'slider_dimmer' ||
    arch === 'smart_plug_oled' ||
    arch === 'smart_lock' ||
    arch === 'security_cam' ||
    arch === 'sensor_pod';

  const pickWallMount = (
    room: ArchitecturalRoomSpec,
    slabTopY: number,
    arch: HardwareArchetype,
    slotIndex: number
  ): {
    pos: THREE.Vector3;
    yaw: number;
    wallKey: WallCardinalKey | null;
  } => {
    if (!isWallMountedArchetype(arch)) {
      if (arch === 'water_tank') {
        return {
          pos: new THREE.Vector3(room.x - room.w * 0.22, slabTopY + 0.01, room.z),
          yaw: 0,
          wallKey: null,
        };
      }
      if (arch === 'hub_oled') {
        return {
          pos: new THREE.Vector3(room.x + room.w * 0.24, slabTopY + 0.01, room.z - room.d * 0.28),
          yaw: 0,
          wallKey: null,
        };
      }
      // vehicle_unit
      return {
        pos: new THREE.Vector3(room.x, slabTopY + 0.01, room.z),
        yaw: 0,
        wallKey: null,
      };
    }

    // Prefer solid walls first, then doorway piers, then window piers (avoiding open walls)
    const wallOrder: WallCardinalKey[] = ['north', 'west', 'east', 'south'];
    const scoreWall = (key: WallCardinalKey) => {
      const def = room.walls[key];
      if (def.kind === 'solid') return 3;
      if (def.kind === 'doorway') return 2;
      if (def.kind === 'window') return 1;
      return 0;
    };
    const sortedWalls = [...wallOrder].sort((a, b) => scoreWall(b) - scoreWall(a));
    const chosenWall = sortedWalls[slotIndex % sortedWalls.length] ?? 'north';
    const wallDef = room.walls[chosenWall];
    const inset = (wallDef.exterior ? 0.07 : 0.05) + 0.012;
    const mountY = slabTopY + 1.28;

    // Place on solid pier side if wall has a centered window/doorway opening
    const pierShift = wallDef.kind === 'window' || wallDef.kind === 'doorway' ? -0.34 : 0;

    if (chosenWall === 'north') {
      return {
        pos: new THREE.Vector3(room.x + room.w * pierShift, mountY, room.z - room.d / 2 + inset),
        yaw: 0, // Local +Z faces South (+Z) into the room
        wallKey: 'north',
      };
    }
    if (chosenWall === 'south') {
      return {
        pos: new THREE.Vector3(room.x + room.w * pierShift, mountY, room.z + room.d / 2 - inset),
        yaw: Math.PI, // Local +Z faces North (-Z) into the room
        wallKey: 'south',
      };
    }
    if (chosenWall === 'west') {
      return {
        pos: new THREE.Vector3(room.x - room.w / 2 + inset, mountY, room.z + room.d * pierShift),
        yaw: Math.PI / 2, // Local +Z faces East (+X) into the room
        wallKey: 'west',
      };
    }
    return {
      pos: new THREE.Vector3(room.x + room.w / 2 - inset, mountY, room.z + room.d * pierShift),
      yaw: -Math.PI / 2, // Local +Z faces West (-X) into the room
      wallKey: 'east',
    };
  };

  const resolveMountFromPlacement = (
    placement: Layout3DPlacement,
    room: ArchitecturalRoomSpec,
    slabTopY: number,
    roomWallH: number
  ): {
    pos: THREE.Vector3;
    yaw: number;
    wallKey: WallCardinalKey | null;
    scale: number;
  } => {
    const extraYaw = THREE.MathUtils.degToRad(placement.rotation_deg || 0);
    const scale = THREE.MathUtils.clamp(placement.scale || 1, 0.7, 1.5);
    const clampedAlong = THREE.MathUtils.clamp(placement.offset_along, -0.46, 0.46);
    const floorEl = floorElementsByRoomId.get(room.id);
    const rx = floorEl?.x ?? room.x;
    const rz = floorEl?.z ?? room.z;
    const rw = floorEl?.w ?? room.w;
    const rd = floorEl?.d ?? room.d;

    if (
      placement.surface === 'north' ||
      placement.surface === 'south' ||
      placement.surface === 'east' ||
      placement.surface === 'west'
    ) {
      const liveWallEl = wallElementsByRoomSide.get(`${room.id}:${placement.surface}`);
      const wallDef = room.walls[placement.surface];
      const wallThick = liveWallEl?.d ?? (wallDef.exterior ? 0.14 : 0.1);
      const inset = wallThick / 2 + 0.02;
      const effWallH = liveWallEl?.h ?? roomWallH;
      const maxElev = Math.max(0.45, effWallH - 0.15);
      const elev = THREE.MathUtils.clamp(placement.elevation_m, 0.2, maxElev);
      const mountY = (liveWallEl?.y ?? slabTopY) + elev;

      if (liveWallEl) {
        const wRad = THREE.MathUtils.degToRad(liveWallEl.rotationDeg || 0);
        const alongX = Math.cos(wRad);
        const alongZ = -Math.sin(wRad);
        // Pick wall normal pointing into room center (rx, rz)
        let nx = Math.sin(wRad);
        let nz = Math.cos(wRad);
        const toRoomX = rx - liveWallEl.x;
        const toRoomZ = rz - liveWallEl.z;
        if (toRoomX * nx + toRoomZ * nz < 0) {
          nx = -nx;
          nz = -nz;
        }
        const baseYaw = Math.atan2(nx, nz);
        const alongDist = clampedAlong * liveWallEl.w;
        return {
          pos: new THREE.Vector3(
            liveWallEl.x + alongX * alongDist + nx * inset,
            mountY,
            liveWallEl.z + alongZ * alongDist + nz * inset
          ),
          yaw: baseYaw + extraYaw,
          wallKey: placement.surface,
          scale,
        };
      }

      if (placement.surface === 'north') {
        return {
          pos: new THREE.Vector3(rx + clampedAlong * rw, mountY, rz - rd / 2 + inset),
          yaw: 0 + extraYaw,
          wallKey: 'north',
          scale,
        };
      }
      if (placement.surface === 'south') {
        return {
          pos: new THREE.Vector3(rx + clampedAlong * rw, mountY, rz + rd / 2 - inset),
          yaw: Math.PI + extraYaw,
          wallKey: 'south',
          scale,
        };
      }
      if (placement.surface === 'west') {
        return {
          pos: new THREE.Vector3(rx - rw / 2 + inset, mountY, rz + clampedAlong * rd),
          yaw: Math.PI / 2 + extraYaw,
          wallKey: 'west',
          scale,
        };
      }
      return {
        pos: new THREE.Vector3(rx + rw / 2 - inset, mountY, rz + clampedAlong * rd),
        yaw: -Math.PI / 2 + extraYaw,
        wallKey: 'east',
        scale,
      };
    }

    if (placement.surface === 'ceiling') {
      const cx = rx + THREE.MathUtils.clamp(placement.offset_along, -rw * 0.44, rw * 0.44);
      const cz = rz + THREE.MathUtils.clamp(placement.offset_z ?? 0, -rd * 0.44, rd * 0.44);
      const ceilElev =
        Number.isFinite(placement.elevation_m) && placement.elevation_m > 0.5
          ? THREE.MathUtils.clamp(placement.elevation_m, 0.6, roomWallH + 0.5)
          : Math.max(0.8, roomWallH - 0.06);
      return {
        pos: new THREE.Vector3(cx, slabTopY + ceilElev, cz),
        yaw: extraYaw,
        wallKey: null,
        scale,
      };
    }

    // Floor / Terrace surface placement
    const fx = rx + THREE.MathUtils.clamp(placement.offset_along, -rw * 0.46, rw * 0.46);
    const fz = rz + THREE.MathUtils.clamp(placement.offset_z ?? 0, -rd * 0.46, rd * 0.46);
    const elev = THREE.MathUtils.clamp(placement.elevation_m, 0.01, Math.max(0.2, roomWallH + 0.5));
    return {
      pos: new THREE.Vector3(fx, slabTopY + elev, fz),
      yaw: extraYaw,
      wallKey: null,
      scale,
    };
  };

  // Build Capability-Driven Procedural 3D Hardware Models (Phase 10C + Phase 10D Placements)
  const roomById = new Map(blueprint.rooms.map((r) => [r.id, r]));
  const placementByDeviceId = new Map(
    (blueprint.placements ?? []).map((p) => [p.device_id, p])
  );
  const roomWallSlotCounts = new Map<string, number>();

  // Combine blueprint pins + placements + any extra devices in `devices` (scales to all 42 modules!)
  const placedDeviceIds = new Set<string>();
  const mountJobs: Array<{ device: VirtualDeviceInstance; roomId: string }> = [];

  for (const p of blueprint.placements ?? []) {
    const dev = devices[p.device_id];
    if (!dev || placedDeviceIds.has(dev.device_id)) continue;
    placedDeviceIds.add(dev.device_id);
    mountJobs.push({ device: dev, roomId: p.room_id });
  }
  for (const pin of blueprint.pins) {
    const dev = devices[pin.device_id];
    if (!dev || placedDeviceIds.has(dev.device_id)) continue;
    placedDeviceIds.add(dev.device_id);
    mountJobs.push({ device: dev, roomId: pin.room_id });
  }
  for (const dev of Object.values(devices)) {
    if (placedDeviceIds.has(dev.device_id)) continue;
    const targetRoomId = roomById.has(dev.room_id) ? dev.room_id : blueprint.rooms[0]?.id ?? 'room_living';
    mountJobs.push({ device: dev, roomId: targetRoomId });
  }

  for (const job of mountJobs) {
    const customPlacement = placementByDeviceId.get(job.device.device_id);
    if (customPlacement?.hidden) continue;

    const room = roomById.get(job.roomId) ?? blueprint.rooms[0];
    if (!room) continue;
    const floorSpec = getFloorForRoom(blueprint, room.id);
    const floorEntry = floorGroupMap.get(floorSpec.id) ?? floors[0];
    const slabTopY = floorSpec.slabThickness + 0.01;
    const roomWallH = room.wallHeight ?? floorSpec.wallHeight;
    const arch = resolveHardwareArchetype(job.device);

    let mountPos: THREE.Vector3;
    let mountYaw: number;
    let mountWallKey: WallCardinalKey | null;
    let modelScale = 1;

    if (customPlacement) {
      const resolved = resolveMountFromPlacement(customPlacement, room, slabTopY, roomWallH);
      mountPos = resolved.pos;
      mountYaw = resolved.yaw;
      mountWallKey = resolved.wallKey;
      modelScale = resolved.scale;
    } else {
      const slotIdx = roomWallSlotCounts.get(room.id) ?? 0;
      if (isWallMountedArchetype(arch)) {
        roomWallSlotCounts.set(room.id, slotIdx + 1);
      }
      const mount = pickWallMount(room, slabTopY, arch, slotIdx);
      mountPos = mount.pos;
      mountYaw = mount.yaw;
      mountWallKey = mount.wallKey;
    }

    const model = buildHardwareModel({
      device: job.device,
      roomId: room.id,
      floorId: floorSpec.id,
      roomCenterLocal: new THREE.Vector3(room.x, slabTopY, room.z),
      roomCeilingLocalY: slabTopY + roomWallH,
      mountPositionLocal: mountPos,
      facingYaw: mountYaw,
      mountWallKey,
      isLightTheme,
      castShadows,
      maxAnisotropy,
    });

    if (modelScale !== 1) {
      model.rootGroup.scale.setScalar(modelScale);
    }

    floorEntry.group.add(model.rootGroup);
    if (model.companionGroup) {
      floorEntry.group.add(model.companionGroup);
    }
    floorEntry.materials.push(...model.materials);
    interactiveControlMeshes.push(...model.interactiveMeshes);
    hardwareModels.set(job.device.device_id, model);
  }

  // Build Phase 11C Physical Appliances & Optional Live X-Ray Conduit Wiring
  const applianceList = blueprint.appliances ?? [];
  for (const app of applianceList) {
    const room = roomById.get(app.room_id) ?? blueprint.rooms[0];
    if (!room) continue;
    const floorSpec = getFloorForRoom(blueprint, room.id);
    const floorEntry = floorGroupMap.get(floorSpec.id) ?? floors[0];
    const slabTopY = floorSpec.slabThickness + 0.01;
    const roomWallH = room.wallHeight ?? floorSpec.wallHeight;

    const appPlacement: Layout3DPlacement = {
      device_id: app.id,
      room_id: room.id,
      floor_id: floorSpec.id,
      surface: app.surface,
      offset_along: app.offset_along,
      offset_z: app.offset_z,
      elevation_m: app.elevation_m,
      rotation_deg: app.rotation_deg,
      scale: 1,
    };
    const resolved = resolveMountFromPlacement(appPlacement, room, slabTopY, roomWallH);

    // For ceiling appliances, mount flush to ceiling plane when elevation wasn't overridden lower
    if (app.surface === 'ceiling' && !Number.isFinite(app.elevation_m)) {
      resolved.pos.y = slabTopY + roomWallH - 0.06;
    }

    const appModel = buildPhysicalApplianceModel({
      appliance: app,
      mountPositionLocal: resolved.pos,
      facingYaw: resolved.yaw,
      isLightTheme,
      isSelected: selectedApplianceId === app.id,
      castShadows,
    });
    appModel.updateFromDevices(devices);
    floorEntry.group.add(appModel.rootGroup);
    floorEntry.materials.push(...appModel.materials);
    applianceInteractiveMeshes.push(...appModel.interactiveMeshes);
    applianceModels.set(app.id, appModel);
  }

  let xrayWiringRuntime: XRayWiringRuntime | null = null;
  if (xrayWiring && applianceList.length > 0) {
    const floorBaseYMap = new Map(blueprint.floors.map((f) => [f.id, f.baseY]));
    xrayWiringRuntime = buildXRayWiringGroup({
      appliances: applianceList,
      applianceModels,
      hardwareModels,
      floorBaseYMap,
      devices,
    });
    rootGroup.add(xrayWiringRuntime.group);
  }

  return {
    rootGroup,
    floors,
    wallCutaways,
    roomHitMeshes,
    snapSurfaceMeshes,
    ceilingRaycastMeshes,
    structuralMeshes,
    elementGroups,
    elementSpecs,
    interactiveControlMeshes,
    hardwareModels,
    applianceModels,
    applianceInteractiveMeshes,
    xrayWiring: xrayWiringRuntime,
    dispose: () => {
      hardwareModels.forEach((m) => m.dispose());
      applianceModels.forEach((a) => a.dispose());
      xrayWiringRuntime?.dispose();
      disposablesGeo.forEach((g) => g.dispose());
      disposablesMat.forEach((m) => m.dispose());
      disposablesTex.forEach((t) => t.dispose());
    },
  };
}
