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
import { Layout3DPlacement, Layout3DSurface } from '@/lib/protocol/contract';
import { VirtualDeviceInstance } from '@/lib/simulator/types';
import {
  HardwareArchetype,
  HardwareModelRuntime,
  buildHardwareModel,
  resolveHardwareArchetype,
} from '@/lib/twin/hardwareModelRegistry';

export type WallCardinalKey = 'north' | 'south' | 'east' | 'west';

export interface SnapSurfaceUserData {
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
  interactiveControlMeshes: THREE.Mesh[];
  hardwareModels: Map<string, HardwareModelRuntime>;
  dispose: () => void;
}

interface ThemePalette {
  wallMain: number;
  wallParapet: number;
  baseboard: number;
  trimFrame: number;
  slabEdge: number;
  glassTint: number;
}

function getArchitecturePalette(isLightTheme: boolean): ThemePalette {
  if (isLightTheme) {
    return {
      wallMain: 0xf4f1ea,
      wallParapet: 0xe6e2d8,
      baseboard: 0xcbd5e1,
      trimFrame: 0x475569,
      slabEdge: 0xdbe2ea,
      glassTint: 0x93c5fd,
    };
  }
  // Luminous architectural twilight palette (crisp off-white & cool sandstone — NEVER pitch-black slabs)
  return {
    wallMain: 0xd8dee9,
    wallParapet: 0xbac4d4,
    baseboard: 0x64748b,
    trimFrame: 0x334155,
    slabEdge: 0x475569,
    glassTint: 0x7dd3fc,
  };
}

function buildWallSideGroup(params: {
  length: number;
  height: number;
  thickness: number;
  sideDef: WallSideDef;
  wallMat: THREE.MeshStandardMaterial;
  parapetMat: THREE.MeshStandardMaterial;
  baseboardMat: THREE.MeshStandardMaterial;
  frameMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshStandardMaterial;
  castShadow: boolean;
  disposables: THREE.BufferGeometry[];
}): THREE.Group | null {
  const {
    length,
    height,
    thickness,
    sideDef,
    wallMat,
    parapetMat,
    baseboardMat,
    frameMat,
    glassMat,
    castShadow,
    disposables,
  } = params;

  if (sideDef.kind === 'open') return null;

  const group = new THREE.Group();

  const addBox = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.MeshStandardMaterial,
    shadows: boolean = castShadow
  ) => {
    if (w <= 0.01 || h <= 0.01 || d <= 0.01) return;
    const geo = new THREE.BoxGeometry(w, h, d);
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    group.add(mesh);
  };

  if (sideDef.kind === 'parapet') {
    const pH = Math.min(height, 0.92);
    addBox(length, pH, thickness, 0, pH / 2, 0, parapetMat);
    // Coping cap along top of parapet
    addBox(length + 0.04, 0.06, thickness + 0.05, 0, pH + 0.03, 0, baseboardMat, false);
    return group;
  }

  if (sideDef.kind === 'solid') {
    addBox(length, height, thickness, 0, height / 2, 0, wallMat);
    // Crisp interior/exterior baseboard trim
    addBox(length - 0.02, 0.11, thickness + 0.03, 0, 0.055, 0, baseboardMat, false);
    return group;
  }

  const openingW = Math.min(length - 0.5, sideDef.openingWidth ?? 1.2);
  const centerOffset = THREE.MathUtils.clamp(
    (sideDef.offsetRatio ?? 0) * length,
    -(length / 2 - openingW / 2 - 0.25),
    length / 2 - openingW / 2 - 0.25
  );
  const leftEnd = centerOffset - openingW / 2;
  const rightStart = centerOffset + openingW / 2;
  const leftLen = leftEnd - -length / 2;
  const rightLen = length / 2 - rightStart;

  if (sideDef.kind === 'doorway') {
    const doorH = Math.min(height - 0.35, 2.08);
    const lintelH = Math.max(0.2, height - doorH);

    // Left pier + baseboard
    if (leftLen > 0.04) {
      addBox(leftLen, height, thickness, -length / 2 + leftLen / 2, height / 2, 0, wallMat);
      addBox(leftLen, 0.11, thickness + 0.03, -length / 2 + leftLen / 2, 0.055, 0, baseboardMat, false);
    }
    // Right pier + baseboard
    if (rightLen > 0.04) {
      addBox(rightLen, height, thickness, rightStart + rightLen / 2, height / 2, 0, wallMat);
      addBox(rightLen, 0.11, thickness + 0.03, rightStart + rightLen / 2, 0.055, 0, baseboardMat, false);
    }
    // Lintel above doorway
    addBox(openingW, lintelH, thickness, centerOffset, doorH + lintelH / 2, 0, wallMat);
    // Subtle architectural doorway frame posts & header
    addBox(0.05, doorH, thickness + 0.04, leftEnd + 0.025, doorH / 2, 0, frameMat, false);
    addBox(0.05, doorH, thickness + 0.04, rightStart - 0.025, doorH / 2, 0, frameMat, false);
    addBox(openingW, 0.05, thickness + 0.04, centerOffset, doorH - 0.025, 0, frameMat, false);
    return group;
  }

  // Window wall: left pier, right pier, sill, header, subtle frame, translucent glass pane
  const sillH = 0.85;
  const winH = Math.min(height - sillH - 0.38, 1.28);
  const headerH = Math.max(0.22, height - sillH - winH);

  if (leftLen > 0.04) {
    addBox(leftLen, height, thickness, -length / 2 + leftLen / 2, height / 2, 0, wallMat);
  }
  if (rightLen > 0.04) {
    addBox(rightLen, height, thickness, rightStart + rightLen / 2, height / 2, 0, wallMat);
  }
  // Full continuous baseboard under window wall
  addBox(length - 0.02, 0.11, thickness + 0.03, 0, 0.055, 0, baseboardMat, false);
  // Sill & Header
  addBox(openingW, sillH, thickness, centerOffset, sillH / 2, 0, wallMat);
  addBox(openingW, headerH, thickness, centerOffset, sillH + winH + headerH / 2, 0, wallMat);
  // Window sill ledge + thin mullion frame
  addBox(openingW + 0.04, 0.05, thickness + 0.06, centerOffset, sillH + 0.02, 0, frameMat, false);
  addBox(openingW + 0.04, 0.04, thickness + 0.04, centerOffset, sillH + winH - 0.02, 0, frameMat, false);
  addBox(0.04, winH, thickness + 0.03, leftEnd + 0.02, sillH + winH / 2, 0, frameMat, false);
  addBox(0.04, winH, thickness + 0.03, rightStart - 0.02, sillH + winH / 2, 0, frameMat, false);
  // Translucent window glazing
  addBox(openingW - 0.06, winH - 0.06, 0.025, centerOffset, sillH + winH / 2, 0, glassMat, false);

  return group;
}

export function buildHomeArchitecture(params: {
  blueprint: HomeArchitectureBlueprint;
  devices: Record<string, VirtualDeviceInstance>;
  isLightTheme: boolean;
  isSoftwareGl: boolean;
  maxAnisotropy: number;
}): BuiltArchitectureScene {
  const { blueprint, devices, isLightTheme, isSoftwareGl, maxAnisotropy } = params;
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
  const interactiveControlMeshes: THREE.Mesh[] = [];
  const hardwareModels = new Map<string, HardwareModelRuntime>();
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

    floorRooms.forEach((room: ArchitecturalRoomSpec) => {
      // 1. Structural Sub-Slab (crisp architectural bevel plinth)
      const baseGeo = new THREE.BoxGeometry(room.w + 0.06, slabH * 0.78, room.d + 0.06);
      disposablesGeo.push(baseGeo);
      const baseMesh = new THREE.Mesh(baseGeo, slabEdgeMat);
      baseMesh.position.set(room.x, (slabH * 0.78) / 2, room.z);
      baseMesh.receiveShadow = castShadows;
      baseMesh.castShadow = castShadows;
      floorGroup.add(baseMesh);

      // 2. Textured Room Floor Finish Surface (offset slightly above sub-slab so zero Z-fighting)
      const tex = getFloorTex(room.floorType);
      const finishMat = trackMat(
        new THREE.MeshStandardMaterial({
          map: tex,
          color: room.accentTint ? new THREE.Color(room.accentTint) : 0xffffff,
          roughness:
            room.floorType === 'marble'
              ? 0.28
              : room.floorType === 'tile'
              ? 0.38
              : room.floorType === 'wood'
              ? 0.58
              : 0.78,
          metalness: room.floorType === 'marble' ? 0.12 : 0.04,
          transparent: true,
          opacity: 1,
        })
      );

      const roomWallH = room.wallHeight ?? floorSpec.wallHeight;
      const slabTopY = slabH + 0.01;

      const finishGeo = new THREE.BoxGeometry(room.w - 0.04, slabH * 0.28, room.d - 0.04);
      disposablesGeo.push(finishGeo);
      const finishMesh = new THREE.Mesh(finishGeo, finishMat);
      finishMesh.position.set(room.x, slabH * 0.78 + (slabH * 0.28) / 2, room.z);
      finishMesh.receiveShadow = castShadows;
      finishMesh.userData = {
        kind: 'room',
        roomId: room.id,
        floorId: room.floorId,
      };
      floorGroup.add(finishMesh);
      roomHitMeshes.push(finishMesh);

      // Floor surface snap target (used during Customize 3D Tap-to-Snap placement)
      const floorSnapGeo = new THREE.PlaneGeometry(room.w - 0.12, room.d - 0.12);
      disposablesGeo.push(floorSnapGeo);
      const floorSnapMesh = new THREE.Mesh(floorSnapGeo, invisibleSnapMat);
      floorSnapMesh.rotation.x = -Math.PI / 2;
      floorSnapMesh.position.set(room.x, slabTopY + 0.015, room.z);
      floorSnapMesh.userData = {
        kind: 'snap_surface',
        roomId: room.id,
        floorId: room.floorId,
        surface: 'floor',
        roomX: room.x,
        roomZ: room.z,
        roomW: room.w,
        roomD: room.d,
        slabTopY,
        wallHeight: roomWallH,
      } satisfies SnapSurfaceUserData;
      floorGroup.add(floorSnapMesh);
      snapSurfaceMeshes.push(floorSnapMesh);

      // Ceiling surface snap target for non-outdoor rooms (e.g., snapping ceiling fans/lights)
      if (room.floorType !== 'outdoor' && roomWallH >= 1.8) {
        const ceilSnapGeo = new THREE.PlaneGeometry(room.w * 0.55, room.d * 0.55);
        disposablesGeo.push(ceilSnapGeo);
        const ceilSnapMesh = new THREE.Mesh(ceilSnapGeo, invisibleSnapMat);
        ceilSnapMesh.rotation.x = Math.PI / 2;
        ceilSnapMesh.position.set(room.x, slabTopY + roomWallH - 0.06, room.z);
        ceilSnapMesh.userData = {
          kind: 'snap_surface',
          roomId: room.id,
          floorId: room.floorId,
          surface: 'ceiling',
          roomX: room.x,
          roomZ: room.z,
          roomW: room.w,
          roomD: room.d,
          slabTopY,
          wallHeight: roomWallH,
        } satisfies SnapSurfaceUserData;
        floorGroup.add(ceilSnapMesh);
        snapSurfaceMeshes.push(ceilSnapMesh);
      }

      // 3. Four Directional Walls (each wrapped for smooth Auto-Cutaway scaling from floor top)
      const sides: Array<{
        key: 'north' | 'south' | 'east' | 'west';
        def: WallSideDef;
        len: number;
        posX: number;
        posZ: number;
        rotY: number;
        nx: number;
        nz: number;
      }> = [
        {
          key: 'north',
          def: room.walls.north,
          len: room.w,
          posX: room.x,
          posZ: room.z - room.d / 2,
          rotY: 0,
          nx: 0,
          nz: -1,
        },
        {
          key: 'south',
          def: room.walls.south,
          len: room.w,
          posX: room.x,
          posZ: room.z + room.d / 2,
          rotY: 0,
          nx: 0,
          nz: 1,
        },
        {
          key: 'east',
          def: room.walls.east,
          len: room.d,
          posX: room.x + room.w / 2,
          posZ: room.z,
          rotY: Math.PI / 2,
          nx: 1,
          nz: 0,
        },
        {
          key: 'west',
          def: room.walls.west,
          len: room.d,
          posX: room.x - room.w / 2,
          posZ: room.z,
          rotY: Math.PI / 2,
          nx: -1,
          nz: 0,
        },
      ];

      for (const s of sides) {
        const thickness = s.def.exterior ? 0.14 : 0.1;
        const wallSideGroup = buildWallSideGroup({
          length: s.len,
          height: roomWallH,
          thickness,
          sideDef: s.def,
          wallMat,
          parapetMat,
          baseboardMat,
          frameMat,
          glassMat,
          castShadow: castShadows,
          disposables: disposablesGeo,
        });

        if (!wallSideGroup) continue;
        wallSideGroup.position.set(s.posX, slabTopY, s.posZ);
        wallSideGroup.rotation.y = s.rotY;
        floorGroup.add(wallSideGroup);

        // Tag an interior-facing snap plane on this wall for Tap-to-Snap placement
        const snapH = s.def.kind === 'parapet' ? Math.min(roomWallH, 0.92) : roomWallH;
        const wallSnapGeo = new THREE.PlaneGeometry(s.len - 0.14, snapH);
        disposablesGeo.push(wallSnapGeo);
        const wallSnapMesh = new THREE.Mesh(wallSnapGeo, invisibleSnapMat);
        wallSnapMesh.position.set(0, snapH / 2, 0);
        wallSnapMesh.userData = {
          kind: 'snap_surface',
          roomId: room.id,
          floorId: room.floorId,
          surface: s.key,
          roomX: room.x,
          roomZ: room.z,
          roomW: room.w,
          roomD: room.d,
          slabTopY,
          wallHeight: snapH,
        } satisfies SnapSurfaceUserData;
        wallSideGroup.add(wallSnapMesh);
        snapSurfaceMeshes.push(wallSnapMesh);

        wallCutaways.push({
          group: wallSideGroup,
          floorId: floorSpec.id,
          roomId: room.id,
          wallKey: s.key,
          normalX: s.nx,
          normalZ: s.nz,
          roomCenterX: room.x,
          roomCenterZ: room.z,
          isParapet: s.def.kind === 'parapet',
          currentScaleY: 1,
        });
      }
    });

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
    const clampedAlong = THREE.MathUtils.clamp(placement.offset_along, -0.44, 0.44);

    if (
      placement.surface === 'north' ||
      placement.surface === 'south' ||
      placement.surface === 'east' ||
      placement.surface === 'west'
    ) {
      const wallDef = room.walls[placement.surface];
      const inset = (wallDef.exterior ? 0.07 : 0.05) + 0.015;
      const maxElev = Math.max(0.45, roomWallH - 0.25);
      const elev = THREE.MathUtils.clamp(placement.elevation_m, 0.3, maxElev);
      const mountY = slabTopY + elev;

      if (placement.surface === 'north') {
        return {
          pos: new THREE.Vector3(room.x + clampedAlong * room.w, mountY, room.z - room.d / 2 + inset),
          yaw: 0 + extraYaw,
          wallKey: 'north',
          scale,
        };
      }
      if (placement.surface === 'south') {
        return {
          pos: new THREE.Vector3(room.x + clampedAlong * room.w, mountY, room.z + room.d / 2 - inset),
          yaw: Math.PI + extraYaw,
          wallKey: 'south',
          scale,
        };
      }
      if (placement.surface === 'west') {
        return {
          pos: new THREE.Vector3(room.x - room.w / 2 + inset, mountY, room.z + clampedAlong * room.d),
          yaw: Math.PI / 2 + extraYaw,
          wallKey: 'west',
          scale,
        };
      }
      return {
        pos: new THREE.Vector3(room.x + room.w / 2 - inset, mountY, room.z + clampedAlong * room.d),
        yaw: -Math.PI / 2 + extraYaw,
        wallKey: 'east',
        scale,
      };
    }

    if (placement.surface === 'ceiling') {
      const cx = room.x + THREE.MathUtils.clamp(placement.offset_along, -room.w * 0.42, room.w * 0.42);
      const cz = room.z + THREE.MathUtils.clamp(placement.offset_z ?? 0, -room.d * 0.42, room.d * 0.42);
      const mountY = slabTopY + Math.max(0.8, roomWallH - 0.24);
      return {
        pos: new THREE.Vector3(cx, mountY, cz),
        yaw: extraYaw,
        wallKey: null,
        scale,
      };
    }

    // Floor / Terrace surface placement
    const fx = room.x + THREE.MathUtils.clamp(placement.offset_along, -room.w * 0.44, room.w * 0.44);
    const fz = room.z + THREE.MathUtils.clamp(placement.offset_z ?? 0, -room.d * 0.44, room.d * 0.44);
    const elev = THREE.MathUtils.clamp(placement.elevation_m, 0.01, Math.max(0.2, roomWallH - 0.3));
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

  return {
    rootGroup,
    floors,
    wallCutaways,
    roomHitMeshes,
    snapSurfaceMeshes,
    interactiveControlMeshes,
    hardwareModels,
    dispose: () => {
      hardwareModels.forEach((m) => m.dispose());
      disposablesGeo.forEach((g) => g.dispose());
      disposablesMat.forEach((m) => m.dispose());
      disposablesTex.forEach((t) => t.dispose());
    },
  };
}
