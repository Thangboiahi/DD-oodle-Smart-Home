/**
 * DD oodle Smart Home — Architectural Multi-Floor & Multi-Room 3D Blueprints
 *
 * Preserves 100% compatibility with Firestore `homes/{home_id}/layout_3d`
 * (`HomeTemplateId` & `Layout3DPin` from `lib/protocol/contract.ts`).
 * Generates procedural sRGB canvas textures (zero external asset / 404 dependencies).
 */

import * as THREE from 'three';
import {
  HomeLayout3DStructure,
  HomeTemplateId,
  Layout3DAppliance,
  Layout3DPin,
  Layout3DPlacement,
} from '@/lib/protocol/contract';

export type FloorId = string;
export type FloorFilter = 'all' | FloorId;
export type RoomFloorMaterialKind =
  | 'marble'
  | 'wood'
  | 'tile'
  | 'kitchen_tile'
  | 'outdoor'
  | 'garage';

export interface FloorSpec {
  id: FloorId;
  shortLabel: string;
  label: string;
  baseY: number;
  wallHeight: number;
  slabThickness: number;
  visible?: boolean;
}

export interface WallSideDef {
  kind: 'solid' | 'doorway' | 'window' | 'parapet' | 'open';
  /** Normalized offset along the wall (-0.25 .. 0.25) for doorways/windows */
  offsetRatio?: number;
  /** Width in meters of the doorway or window opening */
  openingWidth?: number;
  /** True for exterior perimeter walls (slightly thicker) */
  exterior?: boolean;
}

export interface ArchitecturalRoomSpec {
  id: string;
  name: string;
  shortName: string;
  floorId: FloorId;
  x: number;
  z: number;
  w: number;
  d: number;
  wallHeight?: number;
  floorType: RoomFloorMaterialKind;
  accentTint?: string | null;
  walls: {
    north: WallSideDef;
    south: WallSideDef;
    east: WallSideDef;
    west: WallSideDef;
  };
}

export interface HomeArchitectureBlueprint {
  templateId: HomeTemplateId;
  label: string;
  floors: FloorSpec[];
  rooms: ArchitecturalRoomSpec[];
  pins: Layout3DPin[];
  placements?: Layout3DPlacement[];
  structure?: HomeLayout3DStructure;
  appliances?: Layout3DAppliance[];
  /** Approximate bounding radius for whole-house camera framing */
  houseRadius: number;
  /** Center X/Z of the footprint */
  centerX: number;
  centerZ: number;
}

const SINGLE_STORY_FLOORS: FloorSpec[] = [
  {
    id: 'gf',
    shortLabel: 'GF',
    label: 'Ground Floor',
    baseY: 0,
    wallHeight: 2.65,
    slabThickness: 0.18,
  },
  {
    id: 'roof',
    shortLabel: 'Roof',
    label: 'Roof Terrace',
    baseY: 2.86,
    wallHeight: 0.92,
    slabThickness: 0.16,
  },
];

const DUPLEX_FLOORS: FloorSpec[] = [
  {
    id: 'gf',
    shortLabel: 'GF',
    label: 'Ground Floor',
    baseY: 0,
    wallHeight: 2.65,
    slabThickness: 0.18,
  },
  {
    id: '1f',
    shortLabel: '1F',
    label: 'First Floor',
    baseY: 2.86,
    wallHeight: 2.55,
    slabThickness: 0.18,
  },
  {
    id: 'roof',
    shortLabel: 'Roof',
    label: 'Roof Terrace',
    baseY: 5.62,
    wallHeight: 0.92,
    slabThickness: 0.16,
  },
];

const DEFAULT_2BHK_ROOMS: ArchitecturalRoomSpec[] = [
  {
    id: 'room_living',
    name: 'Living & Dining',
    shortName: 'Living',
    floorId: 'gf',
    x: -2.1,
    z: 0.2,
    w: 4.8,
    d: 4.4,
    floorType: 'marble',
    walls: {
      north: { kind: 'window', openingWidth: 1.9, exterior: true },
      south: { kind: 'doorway', openingWidth: 1.35, offsetRatio: -0.1, exterior: true },
      east: { kind: 'doorway', openingWidth: 1.1, offsetRatio: -0.15 },
      west: { kind: 'window', openingWidth: 1.7, exterior: true },
    },
  },
  {
    id: 'room_bedroom',
    name: 'Master Bedroom',
    shortName: 'Master Bed',
    floorId: 'gf',
    x: 2.25,
    z: -0.9,
    w: 3.9,
    d: 3.4,
    floorType: 'wood',
    walls: {
      north: { kind: 'window', openingWidth: 1.6, exterior: true },
      south: { kind: 'doorway', openingWidth: 0.95, offsetRatio: -0.18 },
      east: { kind: 'window', openingWidth: 1.4, exterior: true },
      west: { kind: 'open' },
    },
  },
  {
    id: 'room_kitchen',
    name: 'Kitchen & Utility',
    shortName: 'Kitchen',
    floorId: 'gf',
    x: -2.1,
    z: -3.2,
    w: 4.8,
    d: 2.4,
    floorType: 'kitchen_tile',
    walls: {
      north: { kind: 'window', openingWidth: 1.5, exterior: true },
      south: { kind: 'doorway', openingWidth: 1.15, offsetRatio: 0.15 },
      east: { kind: 'solid' },
      west: { kind: 'window', openingWidth: 1.0, exterior: true },
    },
  },
  {
    id: 'room_bath',
    name: 'Master Bath',
    shortName: 'Bath',
    floorId: 'gf',
    x: 2.25,
    z: 1.6,
    w: 3.9,
    d: 1.6,
    floorType: 'tile',
    walls: {
      north: { kind: 'open' },
      south: { kind: 'window', openingWidth: 0.9, exterior: true },
      east: { kind: 'solid', exterior: true },
      west: { kind: 'solid' },
    },
  },
  {
    id: 'room_garage',
    name: 'Portico & Driveway',
    shortName: 'Driveway',
    floorId: 'gf',
    x: -2.1,
    z: 3.7,
    w: 4.8,
    d: 2.6,
    floorType: 'garage',
    walls: {
      north: { kind: 'open' },
      south: { kind: 'open' },
      east: { kind: 'parapet', exterior: true },
      west: { kind: 'parapet', exterior: true },
    },
  },
  {
    id: 'room_terrace',
    name: 'Roof Terrace & Tank',
    shortName: 'Terrace',
    floorId: 'roof',
    x: 0.05,
    z: -0.5,
    w: 8.6,
    d: 6.4,
    floorType: 'outdoor',
    walls: {
      north: { kind: 'parapet', exterior: true },
      south: { kind: 'parapet', exterior: true },
      east: { kind: 'parapet', exterior: true },
      west: { kind: 'parapet', exterior: true },
    },
  },
];

const COMPACT_ROOMS: ArchitecturalRoomSpec[] = [
  {
    id: 'room_living',
    name: 'Studio Living & Bed',
    shortName: 'Studio',
    floorId: 'gf',
    x: -1.2,
    z: 0,
    w: 4.6,
    d: 4.4,
    floorType: 'wood',
    walls: {
      north: { kind: 'window', openingWidth: 1.8, exterior: true },
      south: { kind: 'doorway', openingWidth: 1.2, exterior: true },
      east: { kind: 'doorway', openingWidth: 0.95, offsetRatio: -0.15 },
      west: { kind: 'window', openingWidth: 1.5, exterior: true },
    },
  },
  {
    id: 'room_kitchen',
    name: 'Kitchenette',
    shortName: 'Kitchen',
    floorId: 'gf',
    x: 2.25,
    z: -1.1,
    w: 2.3,
    d: 2.2,
    floorType: 'kitchen_tile',
    walls: {
      north: { kind: 'window', openingWidth: 1.0, exterior: true },
      south: { kind: 'solid' },
      east: { kind: 'solid', exterior: true },
      west: { kind: 'open' },
    },
  },
  {
    id: 'room_bath',
    name: 'Bath & Utilities',
    shortName: 'Bath',
    floorId: 'gf',
    x: 2.25,
    z: 1.1,
    w: 2.3,
    d: 2.2,
    floorType: 'tile',
    walls: {
      north: { kind: 'open' },
      south: { kind: 'window', openingWidth: 0.8, exterior: true },
      east: { kind: 'solid', exterior: true },
      west: { kind: 'doorway', openingWidth: 0.85 },
    },
  },
  {
    id: 'room_terrace',
    name: 'Roof Terrace & Tank',
    shortName: 'Terrace',
    floorId: 'roof',
    x: 0.05,
    z: 0,
    w: 6.9,
    d: 4.4,
    floorType: 'outdoor',
    walls: {
      north: { kind: 'parapet', exterior: true },
      south: { kind: 'parapet', exterior: true },
      east: { kind: 'parapet', exterior: true },
      west: { kind: 'parapet', exterior: true },
    },
  },
];

const ONE_BHK_ROOMS: ArchitecturalRoomSpec[] = [
  {
    id: 'room_living',
    name: 'Living & Dining',
    shortName: 'Living',
    floorId: 'gf',
    x: -2.0,
    z: 0.4,
    w: 4.4,
    d: 4.4,
    floorType: 'marble',
    walls: {
      north: { kind: 'doorway', openingWidth: 1.2 },
      south: { kind: 'doorway', openingWidth: 1.25, exterior: true },
      east: { kind: 'doorway', openingWidth: 1.0, offsetRatio: -0.15 },
      west: { kind: 'window', openingWidth: 1.6, exterior: true },
    },
  },
  {
    id: 'room_kitchen',
    name: 'Kitchen',
    shortName: 'Kitchen',
    floorId: 'gf',
    x: -2.0,
    z: -2.8,
    w: 4.4,
    d: 2.0,
    floorType: 'kitchen_tile',
    walls: {
      north: { kind: 'window', openingWidth: 1.4, exterior: true },
      south: { kind: 'open' },
      east: { kind: 'solid' },
      west: { kind: 'window', openingWidth: 0.9, exterior: true },
    },
  },
  {
    id: 'room_bedroom',
    name: 'Master Bedroom',
    shortName: 'Master Bed',
    floorId: 'gf',
    x: 2.0,
    z: -0.8,
    w: 3.6,
    d: 3.4,
    floorType: 'wood',
    walls: {
      north: { kind: 'window', openingWidth: 1.5, exterior: true },
      south: { kind: 'doorway', openingWidth: 0.9 },
      east: { kind: 'window', openingWidth: 1.3, exterior: true },
      west: { kind: 'open' },
    },
  },
  {
    id: 'room_bath',
    name: 'Master Bath',
    shortName: 'Bath',
    floorId: 'gf',
    x: 2.0,
    z: 1.75,
    w: 3.6,
    d: 1.7,
    floorType: 'tile',
    walls: {
      north: { kind: 'open' },
      south: { kind: 'window', openingWidth: 0.85, exterior: true },
      east: { kind: 'solid', exterior: true },
      west: { kind: 'solid' },
    },
  },
  {
    id: 'room_terrace',
    name: 'Roof Terrace & Tank',
    shortName: 'Terrace',
    floorId: 'roof',
    x: -0.1,
    z: -0.5,
    w: 8.0,
    d: 6.0,
    floorType: 'outdoor',
    walls: {
      north: { kind: 'parapet', exterior: true },
      south: { kind: 'parapet', exterior: true },
      east: { kind: 'parapet', exterior: true },
      west: { kind: 'parapet', exterior: true },
    },
  },
];

const THREE_BHK_ROOMS: ArchitecturalRoomSpec[] = [
  {
    id: 'room_living',
    name: 'Grand Living & Dining',
    shortName: 'Living',
    floorId: 'gf',
    x: -2.4,
    z: 0.2,
    w: 5.4,
    d: 4.8,
    floorType: 'marble',
    walls: {
      north: { kind: 'doorway', openingWidth: 1.4 },
      south: { kind: 'doorway', openingWidth: 1.5, exterior: true },
      east: { kind: 'doorway', openingWidth: 1.2, offsetRatio: -0.1 },
      west: { kind: 'window', openingWidth: 2.1, exterior: true },
    },
  },
  {
    id: 'room_kitchen',
    name: 'Chef Kitchen',
    shortName: 'Kitchen',
    floorId: 'gf',
    x: -2.4,
    z: -3.4,
    w: 5.4,
    d: 2.4,
    floorType: 'kitchen_tile',
    walls: {
      north: { kind: 'window', openingWidth: 1.8, exterior: true },
      south: { kind: 'open' },
      east: { kind: 'solid' },
      west: { kind: 'window', openingWidth: 1.1, exterior: true },
    },
  },
  {
    id: 'room_bedroom',
    name: 'Master Suite',
    shortName: 'Master Bed',
    floorId: 'gf',
    x: 2.5,
    z: -1.1,
    w: 4.4,
    d: 3.8,
    floorType: 'wood',
    walls: {
      north: { kind: 'window', openingWidth: 1.8, exterior: true },
      south: { kind: 'doorway', openingWidth: 0.95 },
      east: { kind: 'window', openingWidth: 1.6, exterior: true },
      west: { kind: 'open' },
    },
  },
  {
    id: 'room_bath',
    name: 'Master Bath',
    shortName: 'Bath',
    floorId: 'gf',
    x: 2.5,
    z: 1.7,
    w: 4.4,
    d: 1.8,
    floorType: 'tile',
    walls: {
      north: { kind: 'open' },
      south: { kind: 'window', openingWidth: 1.0, exterior: true },
      east: { kind: 'solid', exterior: true },
      west: { kind: 'solid' },
    },
  },
  {
    id: 'room_garage',
    name: 'Garage & EV Bay',
    shortName: 'Garage',
    floorId: 'gf',
    x: -2.4,
    z: 3.9,
    w: 5.4,
    d: 2.6,
    floorType: 'garage',
    walls: {
      north: { kind: 'open' },
      south: { kind: 'open' },
      east: { kind: 'parapet', exterior: true },
      west: { kind: 'parapet', exterior: true },
    },
  },
  {
    id: 'room_terrace',
    name: 'Roof Terrace & Tank',
    shortName: 'Terrace',
    floorId: 'roof',
    x: 0.0,
    z: -0.6,
    w: 9.8,
    d: 7.0,
    floorType: 'outdoor',
    walls: {
      north: { kind: 'parapet', exterior: true },
      south: { kind: 'parapet', exterior: true },
      east: { kind: 'parapet', exterior: true },
      west: { kind: 'parapet', exterior: true },
    },
  },
];

const DUPLEX_ROOMS: ArchitecturalRoomSpec[] = [
  // Ground Floor
  {
    id: 'room_living',
    name: 'Ground Living & Dining',
    shortName: 'Living',
    floorId: 'gf',
    x: -1.6,
    z: 0.4,
    w: 5.0,
    d: 4.6,
    floorType: 'marble',
    walls: {
      north: { kind: 'doorway', openingWidth: 1.4 },
      south: { kind: 'doorway', openingWidth: 1.5, exterior: true },
      east: { kind: 'window', openingWidth: 1.8, exterior: true },
      west: { kind: 'window', openingWidth: 1.9, exterior: true },
    },
  },
  {
    id: 'room_kitchen',
    name: 'Ground Kitchen',
    shortName: 'Kitchen',
    floorId: 'gf',
    x: 2.4,
    z: 0.4,
    w: 3.0,
    d: 4.6,
    floorType: 'kitchen_tile',
    walls: {
      north: { kind: 'window', openingWidth: 1.4, exterior: true },
      south: { kind: 'window', openingWidth: 1.1, exterior: true },
      east: { kind: 'solid', exterior: true },
      west: { kind: 'doorway', openingWidth: 1.2 },
    },
  },
  {
    id: 'room_garage',
    name: 'Portico Garage',
    shortName: 'Garage',
    floorId: 'gf',
    x: -1.6,
    z: 4.0,
    w: 5.0,
    d: 2.6,
    floorType: 'garage',
    walls: {
      north: { kind: 'open' },
      south: { kind: 'open' },
      east: { kind: 'parapet', exterior: true },
      west: { kind: 'parapet', exterior: true },
    },
  },
  // First Floor (Stacked cleanly directly above Ground Floor!)
  {
    id: 'room_bedroom',
    name: 'Master Suite (1F)',
    shortName: 'Master Bed',
    floorId: '1f',
    x: -1.6,
    z: 0.4,
    w: 5.0,
    d: 4.6,
    floorType: 'wood',
    walls: {
      north: { kind: 'window', openingWidth: 2.0, exterior: true },
      south: { kind: 'window', openingWidth: 1.8, exterior: true },
      east: { kind: 'doorway', openingWidth: 1.0 },
      west: { kind: 'window', openingWidth: 1.6, exterior: true },
    },
  },
  {
    id: 'room_bath',
    name: 'Master Bath (1F)',
    shortName: 'Master Bath',
    floorId: '1f',
    x: 2.4,
    z: 0.4,
    w: 3.0,
    d: 4.6,
    floorType: 'tile',
    walls: {
      north: { kind: 'window', openingWidth: 1.1, exterior: true },
      south: { kind: 'solid', exterior: true },
      east: { kind: 'solid', exterior: true },
      west: { kind: 'open' },
    },
  },
  // Roof Terrace (Stacked above 1F!)
  {
    id: 'room_terrace',
    name: 'Roof Terrace & Tank',
    shortName: 'Roof Deck',
    floorId: 'roof',
    x: -0.1,
    z: 0.4,
    w: 8.0,
    d: 4.6,
    floorType: 'outdoor',
    walls: {
      north: { kind: 'parapet', exterior: true },
      south: { kind: 'parapet', exterior: true },
      east: { kind: 'parapet', exterior: true },
      west: { kind: 'parapet', exterior: true },
    },
  },
];

function buildPinsForRooms(
  floors: FloorSpec[],
  rooms: ArchitecturalRoomSpec[]
): Layout3DPin[] {
  const floorById = new Map(floors.map((f) => [f.id, f]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  const roomBaseY = (roomId: string): number => {
    const rm = roomById.get(roomId);
    if (!rm) return 0;
    const fl = floorById.get(rm.floorId);
    return (fl?.baseY ?? 0) + (fl?.slabThickness ?? 0.18);
  };

  const living = roomById.get('room_living') ?? rooms[0];
  const bedroom = roomById.get('room_bedroom') ?? living;
  const bath = roomById.get('room_bath') ?? living;
  const terrace = roomById.get('room_terrace') ?? living;
  const garage = roomById.get('room_garage') ?? living;

  return [
    {
      device_id: 'dd_pwr01_a1b2c3',
      room_id: living.id,
      x: living.x - living.w * 0.28,
      y: roomBaseY(living.id) + 1.15,
      z: living.z - living.d * 0.42,
      fixture_type: 'light',
    },
    {
      device_id: 'dd_pwr02_d4e5f6',
      room_id: bedroom.id,
      x: bedroom.x,
      y: roomBaseY(bedroom.id) + 2.1,
      z: bedroom.z,
      fixture_type: 'fan',
    },
    {
      device_id: 'dd_pwr03_g7h8i9',
      room_id: bath.id,
      x: bath.x + bath.w * 0.15,
      y: roomBaseY(bath.id) + 1.35,
      z: bath.z - bath.d * 0.25,
      fixture_type: 'geyser',
    },
    {
      device_id: 'dd_wat01_j1k2l3',
      room_id: terrace.id,
      x: terrace.x - terrace.w * 0.22,
      y: roomBaseY(terrace.id) + 0.05,
      z: terrace.z,
      fixture_type: 'tank',
    },
    {
      device_id: 'dd_hub01_u7v8w9',
      room_id: living.id,
      x: living.x + living.w * 0.24,
      y: roomBaseY(living.id) + 0.42,
      z: living.z - living.d * 0.28,
      fixture_type: 'hub',
    },
    {
      device_id: 'dd_veh01_m4n5p6',
      room_id: garage.id,
      x: garage.x,
      y: roomBaseY(garage.id) + 0.04,
      z: garage.z,
      fixture_type: 'sensor',
    },
  ];
}

export const HOME_ARCHITECTURE_BLUEPRINTS: Record<HomeTemplateId, HomeArchitectureBlueprint> = {
  compact: {
    templateId: 'compact',
    label: 'Compact Studio',
    floors: SINGLE_STORY_FLOORS,
    rooms: COMPACT_ROOMS,
    pins: buildPinsForRooms(SINGLE_STORY_FLOORS, COMPACT_ROOMS),
    houseRadius: 6.2,
    centerX: 0,
    centerZ: 0,
  },
  '1bhk': {
    templateId: '1bhk',
    label: '1BHK Apartment',
    floors: SINGLE_STORY_FLOORS,
    rooms: ONE_BHK_ROOMS,
    pins: buildPinsForRooms(SINGLE_STORY_FLOORS, ONE_BHK_ROOMS),
    houseRadius: 7.2,
    centerX: 0,
    centerZ: -0.3,
  },
  '2bhk': {
    templateId: '2bhk',
    label: '2BHK Residence',
    floors: SINGLE_STORY_FLOORS,
    rooms: DEFAULT_2BHK_ROOMS,
    pins: buildPinsForRooms(SINGLE_STORY_FLOORS, DEFAULT_2BHK_ROOMS),
    houseRadius: 8.6,
    centerX: 0,
    centerZ: 0.2,
  },
  '3bhk': {
    templateId: '3bhk',
    label: '3BHK Villa',
    floors: SINGLE_STORY_FLOORS,
    rooms: THREE_BHK_ROOMS,
    pins: buildPinsForRooms(SINGLE_STORY_FLOORS, THREE_BHK_ROOMS),
    houseRadius: 9.6,
    centerX: 0,
    centerZ: 0.2,
  },
  duplex: {
    templateId: 'duplex',
    label: 'Duplex Residence',
    floors: DUPLEX_FLOORS,
    rooms: DUPLEX_ROOMS,
    pins: buildPinsForRooms(DUPLEX_FLOORS, DUPLEX_ROOMS),
    houseRadius: 8.8,
    centerX: 0.2,
    centerZ: 1.2,
  },
};

export function getFloorForRoom(
  blueprint: HomeArchitectureBlueprint,
  roomId: string
): FloorSpec {
  const room = blueprint.rooms.find((r) => r.id === roomId);
  const floor = blueprint.floors.find((f) => f.id === room?.floorId);
  return floor ?? blueprint.floors[0];
}

/**
 * Generates crisp procedural sRGB architectural floor textures via HTML5 Canvas
 * (zero network / external file dependencies).
 */
export function createArchitecturalFloorTexture(
  kind: RoomFloorMaterialKind,
  isLightTheme: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    if (kind === 'wood') {
      ctx.fillStyle = isLightTheme ? '#d6b48a' : '#8d6c4d';
      ctx.fillRect(0, 0, size, size);
      const planks = 8;
      const plankH = size / planks;
      for (let i = 0; i < planks; i++) {
        const y = i * plankH;
        const shade = (i % 3) * 6 - 6;
        ctx.fillStyle = isLightTheme
          ? `rgb(${212 + shade}, ${178 + shade}, ${138 + shade})`
          : `rgb(${144 + shade}, ${112 + shade}, ${82 + shade})`;
        ctx.fillRect(0, y, size, plankH - 1.5);
        // Subtle grain streaks
        ctx.strokeStyle = isLightTheme ? 'rgba(120, 82, 42, 0.14)' : 'rgba(40, 24, 12, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + plankH * 0.45);
        ctx.lineTo(size, y + plankH * 0.48);
        ctx.stroke();
        // Plank end joint
        const jointX = ((i * 73) % 180) + 32;
        ctx.fillStyle = isLightTheme ? 'rgba(92, 62, 34, 0.24)' : 'rgba(26, 16, 8, 0.38)';
        ctx.fillRect(jointX, y, 1.5, plankH);
      }
    } else if (kind === 'marble') {
      ctx.fillStyle = isLightTheme ? '#f3efe6' : '#c6ccd4';
      ctx.fillRect(0, 0, size, size);
      // Tile grout grid (4x4)
      ctx.strokeStyle = isLightTheme ? 'rgba(148, 138, 122, 0.26)' : 'rgba(71, 85, 105, 0.35)';
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
      // Delicate diagonal veining
      ctx.strokeStyle = isLightTheme ? 'rgba(180, 168, 150, 0.22)' : 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1.4;
      for (let v = 0; v < 5; v++) {
        ctx.beginPath();
        ctx.moveTo(v * 52, 0);
        ctx.bezierCurveTo(v * 52 + 24, 80, v * 52 - 18, 170, v * 52 + 30, size);
        ctx.stroke();
      }
    } else if (kind === 'tile') {
      ctx.fillStyle = isLightTheme ? '#dcecf2' : '#7ea2b8';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = isLightTheme ? 'rgba(100, 135, 155, 0.3)' : 'rgba(30, 58, 76, 0.42)';
      ctx.lineWidth = 2;
      const step = size / 6;
      for (let i = 0; i <= 6; i++) {
        ctx.beginPath();
        ctx.moveTo(i * step, 0);
        ctx.lineTo(i * step, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * step);
        ctx.lineTo(size, i * step);
        ctx.stroke();
      }
    } else if (kind === 'kitchen_tile') {
      ctx.fillStyle = isLightTheme ? '#e4ddd2' : '#96938c';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = isLightTheme ? 'rgba(120, 110, 98, 0.32)' : 'rgba(42, 42, 40, 0.4)';
      ctx.lineWidth = 2;
      const step = size / 4;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if ((r + c) % 2 === 0) {
            ctx.fillStyle = isLightTheme ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
            ctx.fillRect(c * step, r * step, step, step);
          }
          ctx.strokeRect(c * step, r * step, step, step);
        }
      }
    } else if (kind === 'garage') {
      ctx.fillStyle = isLightTheme ? '#cbd5e1' : '#586578';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = isLightTheme ? 'rgba(71, 85, 105, 0.28)' : 'rgba(148, 163, 184, 0.22)';
      ctx.lineWidth = 2;
      ctx.strokeRect(6, 6, size - 12, size - 12);
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(size / 2, 16);
      ctx.lineTo(size / 2, size - 16);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // Outdoor terrace pavers
      ctx.fillStyle = isLightTheme ? '#dde3ea' : '#7b8798';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = isLightTheme ? 'rgba(100, 116, 139, 0.3)' : 'rgba(30, 41, 59, 0.42)';
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
  tex.repeat.set(2, 2);
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  tex.needsUpdate = true;
  return tex;
}
