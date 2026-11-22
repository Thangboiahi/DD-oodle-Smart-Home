'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Layers,
  Eye,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Home,
  KeyRound,
} from 'lucide-react';
import {
  HomeTemplateId,
  Layout3DPin,
  WaterTelemetryPayload,
  PowerTelemetryPayload,
} from '@/lib/protocol/contract';
import { ResolvedEntitlements } from '@/lib/entitlements/resolver';
import { VirtualDeviceInstance } from '@/lib/simulator/types';

interface Home3DTwinViewProps {
  devices: Record<string, VirtualDeviceInstance>;
  entitlements: ResolvedEntitlements;
  onSendCommand: (deviceId: string, set: Record<string, boolean | number>) => void;
  onClearPhysicalFault?: (deviceId: string) => void;
  onInspectDevice?: (deviceId: string) => void;
}

// Template Room Blueprint Definitions
interface RoomBlueprint {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  color: number;
  floorType: 'wood' | 'tile' | 'marble' | 'outdoor';
}

const TEMPLATE_ROOMS: Record<HomeTemplateId, RoomBlueprint[]> = {
  compact: [
    { id: 'room_living', name: 'Studio Living & Bed', x: -1, z: 0, w: 4.5, d: 4.5, color: 0x22303c, floorType: 'wood' },
    { id: 'room_bath', name: 'Bath & Utilities', x: 2.2, z: -1, w: 2.0, d: 2.5, color: 0x1b2836, floorType: 'tile' },
    { id: 'room_terrace', name: 'Roof Tank', x: 2.2, z: 1.5, w: 2.0, d: 2.0, color: 0x17222e, floorType: 'outdoor' },
  ],
  '1bhk': [
    { id: 'room_living', name: 'Living & Dining', x: -2, z: 0, w: 4.5, d: 5, color: 0x22303c, floorType: 'wood' },
    { id: 'room_bedroom', name: 'Master Bedroom', x: 2, z: -1, w: 3.5, d: 3.2, color: 0x243442, floorType: 'wood' },
    { id: 'room_bath', name: 'Master Bath', x: 2, z: 1.8, w: 3.5, d: 2.2, color: 0x1b2836, floorType: 'tile' },
    { id: 'room_terrace', name: 'Terrace Tank', x: -2, z: 3.5, w: 4.5, d: 1.8, color: 0x17222e, floorType: 'outdoor' },
  ],
  '2bhk': [
    { id: 'room_living', name: 'Living Room', x: -2.2, z: -0.5, w: 4.8, d: 4.5, color: 0x22303c, floorType: 'marble' },
    { id: 'room_bedroom', name: 'Master Bedroom', x: 2.2, z: -1.2, w: 3.8, d: 3.2, color: 0x243442, floorType: 'wood' },
    { id: 'room_bath', name: 'Master Bath', x: 2.2, z: 1.6, w: 3.8, d: 2.2, color: 0x1b2836, floorType: 'tile' },
    { id: 'room_terrace', name: 'Terrace Tank', x: -2.2, z: 2.8, w: 4.8, d: 2.0, color: 0x17222e, floorType: 'outdoor' },
    { id: 'room_garage', name: 'Driveway & Car', x: -2.2, z: -3.8, w: 4.8, d: 2.4, color: 0x1a232f, floorType: 'outdoor' },
  ],
  '3bhk': [
    { id: 'room_living', name: 'Grand Living & Dining', x: -2.5, z: 0, w: 5.5, d: 5.2, color: 0x22303c, floorType: 'marble' },
    { id: 'room_bedroom', name: 'Master Suite', x: 2.5, z: -1.5, w: 4.2, d: 3.5, color: 0x243442, floorType: 'wood' },
    { id: 'room_bath', name: 'Master Bath', x: 2.5, z: 1.6, w: 4.2, d: 2.4, color: 0x1b2836, floorType: 'tile' },
    { id: 'room_terrace', name: 'Terrace Tank', x: -2.5, z: 3.8, w: 5.5, d: 2.2, color: 0x17222e, floorType: 'outdoor' },
    { id: 'room_garage', name: 'Garage & Car', x: -2.5, z: -3.8, w: 5.5, d: 2.4, color: 0x1a232f, floorType: 'outdoor' },
  ],
  duplex: [
    { id: 'room_living', name: 'Ground Living / Dining', x: -2.5, z: 0, w: 5.2, d: 5.0, color: 0x22303c, floorType: 'marble' },
    { id: 'room_bedroom', name: 'Upper Master Suite', x: 2.2, z: -1.2, w: 4.0, d: 3.4, color: 0x243442, floorType: 'wood' },
    { id: 'room_bath', name: 'Upper Bath', x: 2.2, z: 1.6, w: 4.0, d: 2.2, color: 0x1b2836, floorType: 'tile' },
    { id: 'room_terrace', name: 'Roof Deck Tank', x: -2.5, z: 3.5, w: 5.2, d: 2.0, color: 0x17222e, floorType: 'outdoor' },
    { id: 'room_garage', name: 'Portico Garage', x: -2.5, z: -3.6, w: 5.2, d: 2.2, color: 0x1a232f, floorType: 'outdoor' },
  ],
};

// Fixture 3D Pin Coordinates per template
const FIXTURE_PINS: Record<HomeTemplateId, Layout3DPin[]> = {
  '2bhk': [
    { device_id: 'dd_pwr01_a1b2c3', room_id: 'room_living', x: -2.2, y: 1.2, z: -0.5, fixture_type: 'light' },
    { device_id: 'dd_pwr02_d4e5f6', room_id: 'room_bedroom', x: 2.2, y: 2.1, z: -1.2, fixture_type: 'fan' },
    { device_id: 'dd_pwr03_g7h8i9', room_id: 'room_bath', x: 2.2, y: 1.4, z: 1.6, fixture_type: 'geyser' },
    { device_id: 'dd_wat01_j1k2l3', room_id: 'room_terrace', x: -2.2, y: 0.8, z: 2.8, fixture_type: 'tank' },
    { device_id: 'dd_hub01_u7v8w9', room_id: 'room_living', x: -3.8, y: 0.8, z: -0.5, fixture_type: 'hub' },
    { device_id: 'dd_veh01_m4n5p6', room_id: 'room_garage', x: -2.2, y: 0.5, z: -3.8, fixture_type: 'sensor' },
  ],
  '1bhk': [
    { device_id: 'dd_pwr01_a1b2c3', room_id: 'room_living', x: -2.0, y: 1.2, z: 0, fixture_type: 'light' },
    { device_id: 'dd_pwr02_d4e5f6', room_id: 'room_bedroom', x: 2.0, y: 2.1, z: -1.0, fixture_type: 'fan' },
    { device_id: 'dd_pwr03_g7h8i9', room_id: 'room_bath', x: 2.0, y: 1.4, z: 1.8, fixture_type: 'geyser' },
    { device_id: 'dd_wat01_j1k2l3', room_id: 'room_terrace', x: -2.0, y: 0.8, z: 3.5, fixture_type: 'tank' },
    { device_id: 'dd_hub01_u7v8w9', room_id: 'room_living', x: -3.5, y: 0.8, z: 0, fixture_type: 'hub' },
    { device_id: 'dd_veh01_m4n5p6', room_id: 'room_living', x: 0, y: 0.5, z: -2.0, fixture_type: 'sensor' },
  ],
  '3bhk': [
    { device_id: 'dd_pwr01_a1b2c3', room_id: 'room_living', x: -2.5, y: 1.2, z: 0, fixture_type: 'light' },
    { device_id: 'dd_pwr02_d4e5f6', room_id: 'room_bedroom', x: 2.5, y: 2.1, z: -1.5, fixture_type: 'fan' },
    { device_id: 'dd_pwr03_g7h8i9', room_id: 'room_bath', x: 2.5, y: 1.4, z: 1.6, fixture_type: 'geyser' },
    { device_id: 'dd_wat01_j1k2l3', room_id: 'room_terrace', x: -2.5, y: 0.8, z: 3.8, fixture_type: 'tank' },
    { device_id: 'dd_hub01_u7v8w9', room_id: 'room_living', x: -4.5, y: 0.8, z: 0, fixture_type: 'hub' },
    { device_id: 'dd_veh01_m4n5p6', room_id: 'room_garage', x: -2.5, y: 0.5, z: -3.8, fixture_type: 'sensor' },
  ],
  duplex: [
    { device_id: 'dd_pwr01_a1b2c3', room_id: 'room_living', x: -2.5, y: 1.2, z: 0, fixture_type: 'light' },
    { device_id: 'dd_pwr02_d4e5f6', room_id: 'room_bedroom', x: 2.2, y: 2.1, z: -1.2, fixture_type: 'fan' },
    { device_id: 'dd_pwr03_g7h8i9', room_id: 'room_bath', x: 2.2, y: 1.4, z: 1.6, fixture_type: 'geyser' },
    { device_id: 'dd_wat01_j1k2l3', room_id: 'room_terrace', x: -2.5, y: 0.8, z: 3.5, fixture_type: 'tank' },
    { device_id: 'dd_hub01_u7v8w9', room_id: 'room_living', x: -4.2, y: 0.8, z: 0, fixture_type: 'hub' },
    { device_id: 'dd_veh01_m4n5p6', room_id: 'room_garage', x: -2.5, y: 0.5, z: -3.6, fixture_type: 'sensor' },
  ],
  compact: [
    { device_id: 'dd_pwr01_a1b2c3', room_id: 'room_living', x: -1, y: 1.2, z: 0, fixture_type: 'light' },
    { device_id: 'dd_pwr02_d4e5f6', room_id: 'room_living', x: -1, y: 2.1, z: 1, fixture_type: 'fan' },
    { device_id: 'dd_pwr03_g7h8i9', room_id: 'room_bath', x: 2.2, y: 1.4, z: -1, fixture_type: 'geyser' },
    { device_id: 'dd_wat01_j1k2l3', room_id: 'room_terrace', x: 2.2, y: 0.8, z: 1.5, fixture_type: 'tank' },
    { device_id: 'dd_hub01_u7v8w9', room_id: 'room_living', x: -2.5, y: 0.8, z: 0, fixture_type: 'hub' },
    { device_id: 'dd_veh01_m4n5p6', room_id: 'room_living', x: 0, y: 0.5, z: -1.5, fixture_type: 'sensor' },
  ],
};

export const Home3DTwinView: React.FC<Home3DTwinViewProps> = ({
  devices,
  entitlements,
  onSendCommand,
  onInspectDevice,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const fanBladesRef = useRef<THREE.Group | null>(null);
  const waterMeshRef = useRef<THREE.Mesh | null>(null);
  const interactivePinsRef = useRef<THREE.Mesh[]>([]);

  // Ref to hold devices for the animation loop without triggering re-renders
  const devicesRef = useRef(devices);

  const [activeTemplate, setActiveTemplate] = useState<HomeTemplateId>('2bhk');
  const [ecoMode, setEcoMode] = useState<boolean>(!entitlements.canUse3DHomeView);
  const [hudCollapsed, setHudCollapsed] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<'iso' | 'top' | 'living' | 'bedroom' | 'terrace'>('iso');
  const [selectedPinDeviceId, setSelectedPinDeviceId] = useState<string | null>('dd_pwr01_a1b2c3');

  // Selected device for inspector drawer
  const selectedDev = selectedPinDeviceId ? devices[selectedPinDeviceId] : null;

  // Detect Software WebGL
  const isSoftwareGl = typeof window !== 'undefined' && (() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return true;
    }
  })();

  // Build Procedural 3D Scene
  useEffect(() => {
    if (ecoMode || !mountRef.current) return;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);
    scene.fog = new THREE.FogExp2(0x090d16, 0.035);
    sceneRef.current = scene;

    // 2. Camera setup
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight || 500;
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(11, 13, 15);
    camera.lookAt(0, 0.5, 0);
    cameraRef.current = camera;

    // 3. Renderer setup conforming to threejs skill standards
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Studio Lighting Rig
    const ambient = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 1.2);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.8);
    dirLight.position.set(12, 18, 10);
    if (!isSoftwareGl) {
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 40;
      dirLight.shadow.camera.left = -10;
      dirLight.shadow.camera.right = 10;
      dirLight.shadow.camera.top = 10;
      dirLight.shadow.camera.bottom = -10;
      dirLight.shadow.bias = -0.0005;
    }
    scene.add(dirLight);

    // Ground plane (Contact shadow grounding)
    const groundGeo = new THREE.PlaneGeometry(35, 35);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x070b12,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = !isSoftwareGl;
    scene.add(ground);

    // 5. Build Architectural Rooms
    const rooms = TEMPLATE_ROOMS[activeTemplate];
    const roomGroup = new THREE.Group();

    rooms.forEach((r) => {
      // Floor Slab
      const floorGeo = new THREE.BoxGeometry(r.w, 0.15, r.d);
      const floorMat = new THREE.MeshStandardMaterial({
        color: r.color,
        roughness: r.floorType === 'marble' ? 0.2 : 0.6,
        metalness: r.floorType === 'marble' ? 0.3 : 0.05,
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.position.set(r.x, 0.075, r.z);
      floor.receiveShadow = !isSoftwareGl;
      roomGroup.add(floor);

      // Low perimeter cutaway walls
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x2d3e50,
        roughness: 0.8,
        metalness: 0.1,
        transparent: true,
        opacity: 0.65,
      });

      // North wall
      const northWall = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.8, 0.08), wallMat);
      northWall.position.set(r.x, 0.45, r.z - r.d / 2);
      northWall.castShadow = !isSoftwareGl;
      roomGroup.add(northWall);

      // West wall
      const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, r.d), wallMat);
      westWall.position.set(r.x - r.w / 2, 0.45, r.z);
      westWall.castShadow = !isSoftwareGl;
      roomGroup.add(westWall);
    });

    scene.add(roomGroup);

    // 6. Build Composite 3D Fixtures & Props
    const pins = FIXTURE_PINS[activeTemplate];
    interactivePinsRef.current = [];

    pins.forEach((pin) => {
      const pinGroup = new THREE.Group();
      pinGroup.position.set(pin.x, pin.y, pin.z);

      // Representative 3D Fixture Object
      if (pin.fixture_type === 'fan') {
        // Ceiling Fan Model
        const fanGroup = new THREE.Group();
        const rod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 0.5, 12),
          new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.8, roughness: 0.2 })
        );
        rod.position.y = 0.25;
        fanGroup.add(rod);

        const motor = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16),
          new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.6, roughness: 0.3 })
        );
        motor.position.y = 0;
        fanGroup.add(motor);

        const bladesGroup = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const blade = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.015, 0.8),
            new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.4 })
          );
          blade.rotation.y = (i * 2 * Math.PI) / 3;
          blade.position.set(0, 0, 0.4);
          blade.rotation.x = 0.05;
          bladesGroup.add(blade);
        }
        fanGroup.add(bladesGroup);
        fanBladesRef.current = bladesGroup;
        pinGroup.add(fanGroup);
      } else if (pin.fixture_type === 'tank') {
        // Overhead Tank Model
        const tankBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.45, 0.9, 20),
          new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4, metalness: 0.2 })
        );
        tankBody.position.y = 0.45;
        pinGroup.add(tankBody);

        // Water surface
        const water = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.6, 16),
          new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.8,
            roughness: 0.1,
          })
        );
        water.position.y = 0.3;
        pinGroup.add(water);
        waterMeshRef.current = water;
      } else if (pin.fixture_type === 'geyser') {
        // 16A Geyser Appliance
        const geyser = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.2, 0.55, 16),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.3 })
        );
        geyser.position.y = 0.25;
        pinGroup.add(geyser);
      } else if (pin.fixture_type === 'hub') {
        // HUB-01 Smart Hub Puck
        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.22, 0.06, 24),
          new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.8 })
        );
        hub.position.y = 0.03;
        pinGroup.add(hub);
      } else if (pin.fixture_type === 'sensor' && pin.device_id.includes('veh')) {
        // Stylized Vehicle in garage
        const car = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 0.35, 1.4),
          new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.3, metalness: 0.7 })
        );
        car.position.y = 0.2;
        pinGroup.add(car);
      } else {
        // Smart Light Wall Switch
        const switchPlate = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 0.25, 0.04),
          new THREE.MeshStandardMaterial({ color: 0xf4f4f5, roughness: 0.4, metalness: 0.2 })
        );
        switchPlate.position.y = 0.1;
        pinGroup.add(switchPlate);
      }

      // Interactive Glowing Pin Ring
      const markerGeo = new THREE.TorusGeometry(0.35, 0.04, 12, 24);
      const devState = devicesRef.current[pin.device_id]?.state.state;
      const hasActiveLoad = Object.values(devState || {}).some((v) => v === true || Number(v) > 0);
      const isFault = devicesRef.current[pin.device_id]?.state.fault !== null;

      const markerMat = new THREE.MeshStandardMaterial({
        color: isFault ? 0xf43f5e : hasActiveLoad ? 0x10b981 : 0x64748b,
        emissive: isFault ? 0x881337 : hasActiveLoad ? 0x064e3b : 0x0f172a,
        emissiveIntensity: hasActiveLoad || isFault ? 1.5 : 0.2,
        roughness: 0.2,
      });

      const pinMarker = new THREE.Mesh(markerGeo, markerMat);
      pinMarker.rotation.x = Math.PI / 2;
      pinMarker.position.y = 0.05;
      pinMarker.userData = { deviceId: pin.device_id, room: pin.room_id };

      pinGroup.add(pinMarker);
      interactivePinsRef.current.push(pinMarker);

      scene.add(pinGroup);
    });

    // 7. Raycasting interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (event: MouseEvent) => {
      if (!mountRef.current || !cameraRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(interactivePinsRef.current);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hit.userData.deviceId) {
          setSelectedPinDeviceId(hit.userData.deviceId);
        }
      }
    };

    const canvasEl = renderer.domElement;
    canvasEl.addEventListener('pointerdown', handlePointerDown);

    // 8. Continuous Render Loop with Damping
    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);

      // Rotate ceiling fan blades if fan_speed > 0
      const currentDevices = devicesRef.current;
      const pwr02 = currentDevices['dd_pwr02_d4e5f6'];
      const fanSpeed = Number(pwr02?.state.state.fan_speed ?? 0);
      if (fanBladesRef.current && fanSpeed > 0) {
        fanBladesRef.current.rotation.y += fanSpeed * 0.08;
      }

      // Smooth camera interpolation to target preset
      if (cameraRef.current) {
        let targetX = 11, targetY = 13, targetZ = 15;
        let lookX = 0, lookY = 0.5, lookZ = 0;

        if (cameraPreset === 'top') {
          targetX = 0.1; targetY = 20; targetZ = 0.1;
        } else if (cameraPreset === 'living') {
          targetX = -2; targetY = 4; targetZ = 5;
          lookX = -2; lookY = 0.5; lookZ = 0;
        } else if (cameraPreset === 'bedroom') {
          targetX = 2; targetY = 4; targetZ = 4;
          lookX = 2; lookY = 0.5; lookZ = -1.2;
        } else if (cameraPreset === 'terrace') {
          targetX = -2; targetY = 4; targetZ = 7;
          lookX = -2; lookY = 0.5; lookZ = 3;
        }

        cameraRef.current.position.x = THREE.MathUtils.damp(cameraRef.current.position.x, targetX, 4, 0.016);
        cameraRef.current.position.y = THREE.MathUtils.damp(cameraRef.current.position.y, targetY, 4, 0.016);
        cameraRef.current.position.z = THREE.MathUtils.damp(cameraRef.current.position.z, targetZ, 4, 0.016);
        cameraRef.current.lookAt(lookX, lookY, lookZ);
      }

      renderer.render(scene, camera);
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight || 500;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      canvasEl.removeEventListener('pointerdown', handlePointerDown);
      renderer.dispose();
      scene.clear();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [activeTemplate, ecoMode, cameraPreset, isSoftwareGl]);

  // Synchronize 3D pin colors and water level when devices change without tearing down the scene
  useEffect(() => {
    devicesRef.current = devices;
    interactivePinsRef.current.forEach((pin) => {
      const devId = pin.userData.deviceId;
      const dev = devices[devId];
      if (dev && pin.material instanceof THREE.MeshStandardMaterial) {
        const hasActiveLoad = Object.values(dev.state.state || {}).some((v) => v === true || Number(v) > 0);
        const isFault = dev.state.fault !== null;
        pin.material.color.setHex(isFault ? 0xf43f5e : hasActiveLoad ? 0x10b981 : 0x64748b);
        pin.material.emissive.setHex(isFault ? 0x881337 : hasActiveLoad ? 0x064e3b : 0x0f172a);
        pin.material.emissiveIntensity = hasActiveLoad || isFault ? 1.5 : 0.2;
      }
    });

    // Update water mesh scale based on WAT-01 level_pct
    const wat01 = devices['dd_wat01_j1k2l3'];
    const levelPct = (wat01?.telemetry as WaterTelemetryPayload)?.level_pct ?? 70;
    if (waterMeshRef.current) {
      const scaleY = Math.max(0.05, Math.min(1.0, levelPct / 100));
      waterMeshRef.current.scale.set(1, scaleY, 1);
    }
  }, [devices]);

  // Handle Actuation from 3D Inspector
  const handleToggleLoad = (dev: VirtualDeviceInstance, key: string, nextVal: boolean | number) => {
    onSendCommand(dev.device_id, { [key]: nextVal });
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl backdrop-blur-md overflow-hidden text-slate-100 flex flex-col">
      {/* Top Bar Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Home className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">
                {ecoMode ? 'Eco 2D Room Grid Floor Plan' : '3D Home Digital Twin View'}
              </h3>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                {activeTemplate.toUpperCase()} Template &bull; {FIXTURE_PINS[activeTemplate].length} Fixture Pins
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400">
              Interactive Architectural Mesh &bull; Raycasting Inspection &bull; G10 Latched Locks
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Template Switcher Pills */}
          <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs font-mono">
            {(['1bhk', '2bhk', '3bhk', 'duplex', 'compact'] as HomeTemplateId[]).map((tmpl) => (
              <button
                key={tmpl}
                onClick={() => setActiveTemplate(tmpl)}
                className={`px-2.5 py-1 rounded uppercase font-bold transition ${
                  activeTemplate === tmpl
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tmpl}
              </button>
            ))}
          </div>

          {/* Eco 2D Mode Fallback Toggle */}
          <button
            onClick={() => setEcoMode(!ecoMode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 border ${
              ecoMode
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Clean fallback to high-efficiency 2D grid for low-end / battery saver mode"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{ecoMode ? '3D Twin' : 'Eco 2D Mode'}</span>
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div className="relative w-full h-[480px] sm:h-[520px] bg-slate-950 overflow-hidden">
        {/* Render Option A: 3D Three.js Viewport */}
        {!ecoMode ? (
          <div className="w-full h-full relative">
            {/* Dedicated Three.js canvas mount */}
            <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

            {/* Viewport Top Watermark / Instructions */}
            <div className="absolute top-3 left-4 z-10 pointer-events-none">
              <span className="text-[10px] font-mono text-slate-400 bg-slate-950/80 px-2 py-1 rounded border border-slate-800 backdrop-blur">
                Click glowing fixture rings to inspect &amp; actuate
              </span>
            </div>

            {/* UNIFIED COLLAPSIBLE BOTTOM CONTROL DOCK (Three.js Skill Directive #5) */}
            <div
              className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[94%] max-w-[860px] transition-all duration-300 ${
                hudCollapsed ? 'translate-y-[85%]' : 'translate-y-0'
              }`}
            >
              {/* Collapse / Expand Toggle Button */}
              <div className="flex justify-center -mb-2">
                <button
                  onClick={() => setHudCollapsed(!hudCollapsed)}
                  className="px-3 py-1 rounded-t-lg bg-slate-900 border-t border-x border-slate-700 text-[10px] font-mono text-slate-400 hover:text-white flex items-center gap-1 shadow-md"
                >
                  {hudCollapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  <span>{hudCollapsed ? 'Show Controls Dock' : 'Hide Dock (Zen Mode)'}</span>
                </button>
              </div>

              {/* Glassmorphic Dock Container */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/95 backdrop-blur-md p-3.5 shadow-2xl space-y-3 font-mono text-xs">
                {/* Camera View Switcher Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Camera Presets:</span>
                  </span>

                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        { id: 'iso', label: 'Isometric' },
                        { id: 'top', label: 'Top-Down Blueprint' },
                        { id: 'living', label: 'Living' },
                        { id: 'bedroom', label: 'Master Suite' },
                        { id: 'terrace', label: 'Roof Terrace' },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setCameraPreset(p.id)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold transition ${
                          cameraPreset === p.id
                            ? 'bg-emerald-500 text-slate-950 shadow'
                            : 'bg-slate-800/80 text-slate-400 hover:text-white'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fixture Inspection Sub-Panel */}
                {selectedDev && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-100">{selectedDev.name}</span>
                        <span className="text-[10px] text-slate-400">({selectedDev.module_code})</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                          {selectedDev.room_id.replace('room_', '')}
                        </span>
                      </div>

                      {/* G10 Latched Fault Pill */}
                      {selectedDev.state.fault !== null ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          LATCHED FAULT: {selectedDev.state.fault}
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-emerald-400" />
                          Normal
                        </span>
                      )}
                    </div>

                    {/* Actuation Controls & Telemetry */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/60">
                      {/* Telemetry Summary */}
                      <div className="text-[11px] text-slate-400 space-x-3">
                        {selectedDev.module_code === 'PWR-03' && (
                          <span>
                            Power:{' '}
                            <strong className="text-amber-400">
                              {(selectedDev.telemetry as PowerTelemetryPayload)?.p ?? 0} W
                            </strong>{' '}
                            &bull; Runtime:{' '}
                            {(selectedDev.telemetry as PowerTelemetryPayload)?.runtime_min ?? 0} min
                          </span>
                        )}
                        {selectedDev.module_code === 'WAT-01' && (
                          <span>
                            Level:{' '}
                            <strong className="text-sky-400">
                              {(selectedDev.telemetry as WaterTelemetryPayload)?.level_pct ?? 0}%
                            </strong>{' '}
                            ({(selectedDev.telemetry as WaterTelemetryPayload)?.level_cm ?? 0} cm)
                          </span>
                        )}
                        {selectedDev.module_code === 'PWR-02' && (
                          <span>
                            Speed:{' '}
                            <strong className="text-emerald-400">
                              {Number(selectedDev.state.state.fan_speed ?? 0)} / 4
                            </strong>
                          </span>
                        )}
                        {selectedDev.module_code === 'PWR-01' && (
                          <span>
                            Relays:{' '}
                            {['ch1', 'ch2', 'ch3', 'ch4'].map((ch) => (
                              <span key={ch} className="ml-1">
                                {ch.toUpperCase()}:{' '}
                                <strong className={selectedDev.state.state[ch] ? 'text-emerald-400' : 'text-slate-500'}>
                                  {selectedDev.state.state[ch] ? 'ON' : 'OFF'}
                                </strong>
                              </span>
                            ))}
                          </span>
                        )}
                      </div>

                      {/* Control Actuators */}
                      <div className="flex flex-wrap items-center gap-2">
                        {selectedDev.state.fault !== null ? (
                          <span className="px-2.5 py-1 rounded bg-rose-950/80 border border-rose-600/70 text-rose-200 font-mono text-[10px] flex items-center gap-1.5">
                            <KeyRound className="w-3 h-3 text-rose-400 shrink-0" />
                            <span>G10 Locked · Hold physical device button 3s to clear</span>
                          </span>
                        ) : selectedDev.module_code === 'PWR-02' ? (
                          <div className="flex gap-1">
                            {[0, 1, 2, 3, 4].map((spd) => (
                              <button
                                key={spd}
                                onClick={() => handleToggleLoad(selectedDev, 'fan_speed', spd)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                                  Number(selectedDev.state.state.fan_speed ?? 0) === spd
                                    ? 'bg-emerald-500 text-slate-950'
                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                }`}
                              >
                                {spd === 0 ? 'OFF' : `${spd}`}
                              </button>
                            ))}
                          </div>
                        ) : selectedDev.module_code === 'PWR-03' ? (
                          <button
                            onClick={() =>
                              handleToggleLoad(selectedDev, 'ch1', !selectedDev.state.state.ch1)
                            }
                            className={`px-3 py-1 rounded font-bold text-xs transition ${
                              selectedDev.state.state.ch1
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {selectedDev.state.state.ch1 ? 'Turn Geyser OFF' : 'Turn Geyser ON (45m)'}
                          </button>
                        ) : selectedDev.module_code === 'WAT-01' ? (
                          <button
                            onClick={() =>
                              handleToggleLoad(selectedDev, 'pump_on', !selectedDev.state.state.pump_on)
                            }
                            className={`px-3 py-1 rounded font-bold text-xs transition ${
                              selectedDev.state.state.pump_on
                                ? 'bg-sky-500 text-slate-950'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {selectedDev.state.state.pump_on ? 'Stop Pump' : 'Start Pump (30s)'}
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              handleToggleLoad(selectedDev, 'ch1', !selectedDev.state.state.ch1)
                            }
                            className={`px-3 py-1 rounded font-bold text-xs transition ${
                              selectedDev.state.state.ch1
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {selectedDev.state.state.ch1 ? 'Turn Ch1 OFF' : 'Turn Ch1 ON'}
                          </button>
                        )}
                        {onInspectDevice && (
                          <button
                            type="button"
                            onClick={() => onInspectDevice(selectedDev.device_id)}
                            className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-mono transition"
                          >
                            Inspector →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Render Option B: Eco 2D Room Grid Floor Plan (Core Anti-Bricking Floor) */
          <div className="w-full h-full p-4 overflow-y-auto space-y-4 font-mono">
            {/* Anti-Bricking Floor Notice */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-emerald-300">
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>
                  <strong>Eco 2D Room Grid Active:</strong> Ultra-fast, zero-battery overhead floor plan
                  with 100% control functionality and hardware safety guardrails.
                </span>
              </div>
              <span className="text-[10px] bg-emerald-900/40 text-emerald-300 px-2 py-0.5 rounded border border-emerald-700/40">
                Free Forever Floor
              </span>
            </div>

            {/* Room Blueprint Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {TEMPLATE_ROOMS[activeTemplate].map((room) => {
                const roomPins = FIXTURE_PINS[activeTemplate].filter((p) => p.room_id === room.id);
                return (
                  <div
                    key={room.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-bold text-xs text-slate-200">{room.name}</span>
                      <span className="text-[10px] text-slate-500 uppercase">{room.floorType}</span>
                    </div>

                    {/* Fixtures in room */}
                    <div className="space-y-2">
                      {roomPins.map((pin) => {
                        const dev = devices[pin.device_id];
                        if (!dev) return null;
                        const isFault = dev.state.fault !== null;
                        return (
                          <div
                            key={pin.device_id}
                            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition ${
                              isFault
                                ? 'border-rose-700/60 bg-rose-950/30'
                                : 'border-slate-800 bg-slate-950/60'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-200">{dev.name}</span>
                                <span className="text-[10px] text-slate-400">({dev.module_code})</span>
                              </div>
                              {isFault ? (
                                <p className="text-[10px] text-rose-400 font-bold">
                                  FAULT: {dev.state.fault}
                                </p>
                              ) : (
                                <p className="text-[10px] text-slate-400">
                                  Mode: {dev.state.operation_mode}
                                </p>
                              )}
                            </div>

                            <button
                              onClick={() => setSelectedPinDeviceId(dev.device_id)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-emerald-400 transition"
                            >
                              Inspect
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
