'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RotateCcw, Layers, Cable } from 'lucide-react';
import { useThemeEngine } from '@/components/theme/ThemeEngineProvider';
import { buildCanonicalDevices } from '@/lib/data/canonicalSeed';
import {
  FloorFilter,
  HOME_ARCHITECTURE_BLUEPRINTS,
  HomeArchitectureBlueprint,
} from '@/lib/twin/architectureBlueprints';
import {
  BuiltArchitectureScene,
  buildHomeArchitecture,
} from '@/lib/twin/architectureMeshBuilder';
import { ApplianceControlUserData } from '@/lib/twin/applianceMeshBuilder';
import { HardwareControlUserData } from '@/lib/twin/hardwareModelRegistry';
import { Home3DCameraController } from '@/lib/twin/cameraController';
import { generateDefaultStructureFromBlueprint } from '@/lib/twin/modularKit';
import { PowerTelemetryPayload, WaterTelemetryPayload } from '@/lib/protocol/contract';
import { VirtualDeviceInstance } from '@/lib/simulator/types';

export interface MiniTwinCanvasProps {
  lampOn: boolean;
  fanSpeed: number;
  geyserOn: boolean;
  pumpOn: boolean;
  tankLevelPct: number;
  activeFloor: FloorFilter;
  xrayWiring: boolean;
  onFloorChange: (floor: FloorFilter) => void;
  onToggleXray: () => void;
  onToggleLamp: () => void;
  onCycleFan: (explicitSpeed?: number) => void;
  onToggleGeyser: () => void;
  onTogglePump: () => void;
}

function detectSoftwareWebGL(): boolean {
  if (typeof window === 'undefined') return false;
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
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 16, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.42)');
    grad.addColorStop(0.6, 'rgba(15, 23, 42, 0.16)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds the 2BHK Lamka Smart Residence architectural blueprint with real
 * surface-mounted hardware placements and physical 3D appliances (Ceiling LED, Bath Geyser).
 */
function buildShowcaseBlueprint(): HomeArchitectureBlueprint {
  const base = HOME_ARCHITECTURE_BLUEPRINTS['2bhk'];
  const withAppliances: HomeArchitectureBlueprint = {
    ...base,
    appliances: [
      {
        id: 'app_living_ceiling_led',
        kind: 'ceiling_light',
        label: 'Living Ceiling LED Panel',
        room_id: 'room_living',
        floor_id: 'gf',
        surface: 'ceiling',
        offset_along: -0.4,
        offset_z: 0.1,
        elevation_m: 2.58,
        rotation_deg: 0,
        linked_device_id: 'dd_pwr01_a1b2c3',
        linked_channel_key: 'ch1',
      },
      {
        id: 'app_bath_geyser_unit',
        kind: 'geyser',
        label: 'Master Bath 25L Storage Geyser',
        room_id: 'room_bath',
        floor_id: 'gf',
        surface: 'north',
        offset_along: -0.22,
        elevation_m: 1.82,
        rotation_deg: 0,
        linked_device_id: 'dd_pwr03_g7h8i9',
        linked_channel_key: 'switch',
      },
    ],
  };
  return {
    ...withAppliances,
    structure: generateDefaultStructureFromBlueprint(withAppliances),
  };
}

/**
 * Creates a clean copy of the 6 flagship devices for the landing 3D Twin showcase
 * so buildHomeArchitecture renders the exact console-grade procedural hardware models.
 */
function createInitialShowcaseDevices(): Record<string, VirtualDeviceInstance> {
  const all = buildCanonicalDevices();
  const flagshipIds = [
    'dd_pwr01_a1b2c3',
    'dd_pwr02_d4e5f6',
    'dd_pwr03_g7h8i9',
    'dd_wat01_j1k2l3',
    'dd_veh01_m4n5p6',
    'dd_hub01_q7r8s9',
  ];
  const subset: Record<string, VirtualDeviceInstance> = {};
  for (const id of flagshipIds) {
    if (all[id]) {
      subset[id] = structuredClone(all[id]);
    }
  }
  return subset;
}

export const MiniTwinCanvas: React.FC<MiniTwinCanvasProps> = ({
  lampOn,
  fanSpeed,
  geyserOn,
  pumpOn,
  tankLevelPct,
  activeFloor,
  xrayWiring,
  onFloorChange,
  onToggleXray,
  onToggleLamp,
  onCycleFan,
  onToggleGeyser,
  onTogglePump,
}) => {
  const { resolvedLightMode } = useThemeEngine();
  const mountRef = useRef<HTMLDivElement>(null);
  const roomLabelElsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controllerRef = useRef<Home3DCameraController | null>(null);
  const archRef = useRef<BuiltArchitectureScene | null>(null);

  const devicesRef = useRef<Record<string, VirtualDeviceInstance>>(createInitialShowcaseDevices());
  const activeFloorRef = useRef<FloorFilter>(activeFloor);
  activeFloorRef.current = activeFloor;

  const callbacksRef = useRef({
    onToggleLamp,
    onCycleFan,
    onToggleGeyser,
    onTogglePump,
  });
  callbacksRef.current = {
    onToggleLamp,
    onCycleFan,
    onToggleGeyser,
    onTogglePump,
  };

  const [hudNotice, setHudNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const triggerNotice = (msg: string) => {
    setHudNotice(msg);
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setHudNotice(null);
    }, 2400);
  };

  const isSoftwareGl = useMemo(() => detectSoftwareWebGL(), []);
  const blueprint = useMemo(() => buildShowcaseBlueprint(), []);
  const blueprintRef = useRef(blueprint);
  blueprintRef.current = blueprint;

  // Keep devicesRef state & telemetry synchronized in-place with props (zero geometry rebuilds!)
  useEffect(() => {
    const devs = devicesRef.current;

    const pwr01 = devs['dd_pwr01_a1b2c3'];
    if (pwr01) {
      pwr01.state.state.ch1 = lampOn;
      pwr01.state.state.ch2 = lampOn;
    }

    const pwr02 = devs['dd_pwr02_d4e5f6'];
    if (pwr02) {
      pwr02.state.state.fan_speed = fanSpeed;
    }

    const pwr03 = devs['dd_pwr03_g7h8i9'];
    if (pwr03) {
      pwr03.state.state.switch = geyserOn;
      const pTel = pwr03.telemetry as PowerTelemetryPayload;
      pTel.v = 231.4;
      pTel.i = geyserOn ? 8.75 : 0.0;
      pTel.p = geyserOn ? 2024.8 : 0.0;
      pTel.pf = geyserOn ? 0.99 : 1.0;
    }

    const wat01 = devs['dd_wat01_j1k2l3'];
    if (wat01) {
      wat01.state.state.pump = pumpOn;
      const wTel = wat01.telemetry as WaterTelemetryPayload;
      wTel.level_pct = tankLevelPct;
      wTel.level_cm = Math.round(180 - (tankLevelPct / 100) * 145);
      wTel.flow_lpm = pumpOn ? 18.4 : 0.0;
      wTel.tank_link = true;
    }

    const arch = archRef.current;
    if (!arch) return;

    arch.hardwareModels.forEach((model, devId) => {
      const dev = devs[devId];
      if (dev) {
        model.updateFromDevice(dev, 7.5);
      }
    });
    arch.applianceModels.forEach((appModel) => {
      appModel.updateFromDevices(devs);
    });
  }, [lampOn, fanSpeed, geyserOn, pumpOn, tankLevelPct]);

  // Mount Persistent Three.js Architectural Renderer, Studio Lighting, Free Orbit Camera & Raycaster
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = Math.max(300, container.clientWidth);
    const height = Math.max(300, container.clientHeight || 380);

    const bgHex = resolvedLightMode ? 0xeef3f8 : 0x131c2b;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, resolvedLightMode ? 0.014 : 0.017);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 120);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = resolvedLightMode ? 1.12 : 1.2;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Procedural Studio Reflection Environment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = resolvedLightMode ? 0.56 : 0.5;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Three-Point Architectural Lighting Rig
    const hemiLight = new THREE.HemisphereLight(
      resolvedLightMode ? 0xf0f9ff : 0xdbeafe,
      resolvedLightMode ? 0xcbd5e1 : 0x475569,
      resolvedLightMode ? 1.38 : 1.22
    );
    hemiLight.position.set(0, 24, 0);
    scene.add(hemiLight);

    const sunKey = new THREE.DirectionalLight(0xfff7ed, resolvedLightMode ? 1.75 : 1.62);
    sunKey.position.set(13, 22, 11);
    if (!isSoftwareGl) {
      sunKey.castShadow = true;
      sunKey.shadow.mapSize.width = 1024;
      sunKey.shadow.mapSize.height = 1024;
      sunKey.shadow.camera.near = 2;
      sunKey.shadow.camera.far = 48;
      sunKey.shadow.camera.left = -14;
      sunKey.shadow.camera.right = 14;
      sunKey.shadow.camera.top = 14;
      sunKey.shadow.camera.bottom = -14;
      sunKey.shadow.bias = -0.0005;
      sunKey.shadow.normalBias = 0.025;
      sunKey.shadow.radius = 3;
    }
    scene.add(sunKey);

    const warmFill = new THREE.DirectionalLight(0xfef3c7, resolvedLightMode ? 0.56 : 0.7);
    warmFill.position.set(-12, 11, -10);
    scene.add(warmFill);

    // Architectural Studio Plinth + Contact Shadow
    const groundGeo = new THREE.PlaneGeometry(72, 72);
    const groundMat = new THREE.MeshStandardMaterial({
      color: resolvedLightMode ? 0xe5ecf3 : 0x182234,
      roughness: 0.92,
      metalness: 0.04,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.04;
    ground.receiveShadow = !isSoftwareGl;
    scene.add(ground);

    const gridHelper = new THREE.GridHelper(
      32,
      32,
      resolvedLightMode ? 0xcbd5e1 : 0x334155,
      resolvedLightMode ? 0xdbe3ec : 0x233044
    );
    gridHelper.position.y = -0.03;
    scene.add(gridHelper);

    const shadowTex = createContactShadowTexture();
    const contactGeo = new THREE.PlaneGeometry(18, 18);
    const contactMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: resolvedLightMode ? 0.5 : 0.72,
    });
    const contactPlane = new THREE.Mesh(contactGeo, contactMat);
    contactPlane.rotation.x = -Math.PI / 2;
    contactPlane.position.set(blueprintRef.current.centerX, -0.015, blueprintRef.current.centerZ);
    scene.add(contactPlane);

    // Damped Orbit Camera Controller
    const controller = new Home3DCameraController(
      camera,
      renderer.domElement,
      isSoftwareGl
    );
    controller.snapToOverview(blueprintRef.current, 1.35);
    controllerRef.current = controller;

    // Direct 3D Raycast Interaction (click any 3D hardware switchboard, fan, geyser, or water tank!)
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const projVec = new THREE.Vector3();
    let downX = 0;
    let downY = 0;
    let lastHoverCheckMs = 0;

    const isFloorVisibleNow = (floorId: string) => {
      const sel = activeFloorRef.current;
      if (sel === 'all') return true;
      const bp = blueprintRef.current;
      const flIdx = bp.floors.findIndex((f) => f.id === floorId);
      const selIdx = bp.floors.findIndex((f) => f.id === sel);
      return flIdx <= selIdx;
    };

    const getInteractiveMeshes = () => {
      if (!archRef.current) return [];
      const controls = archRef.current.interactiveControlMeshes.filter((m) =>
        isFloorVisibleNow(String(m.userData.floorId ?? ''))
      );
      const apps = archRef.current.applianceInteractiveMeshes.filter((m) =>
        isFloorVisibleNow(String(m.userData.floorId ?? ''))
      );
      return [...controls, ...apps];
    };

    const setPointerNdc = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (ev: PointerEvent) => {
      downX = ev.clientX;
      downY = ev.clientY;
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (ev.pointerType !== 'mouse' || !archRef.current) return;
      const now = performance.now();
      if (now - lastHoverCheckMs < 80) return;
      lastHoverCheckMs = now;
      setPointerNdc(ev);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(getInteractiveMeshes(), false);
      renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
    };

    const dispatchDeviceTap = (deviceId: string, stepVal?: number) => {
      if (deviceId === 'dd_pwr01_a1b2c3') {
        callbacksRef.current.onToggleLamp();
        triggerNotice('PWR-01 · Living Room 4-Gang Switchboard toggled');
      } else if (deviceId === 'dd_pwr02_d4e5f6') {
        callbacksRef.current.onCycleFan(stepVal);
        triggerNotice('PWR-02 · Master Bed Ceiling Fan speed stepped');
      } else if (deviceId === 'dd_pwr03_g7h8i9') {
        callbacksRef.current.onToggleGeyser();
        triggerNotice('PWR-03 · Master Bath 16A Geyser relay toggled');
      } else if (deviceId === 'dd_wat01_j1k2l3') {
        callbacksRef.current.onTogglePump();
        triggerNotice('WAT-01 · Terrace Water Tank pump toggled');
      } else if (deviceId === 'dd_hub01_q7r8s9') {
        triggerNotice('HUB-01 · Local Home Hub (mDNS + Offline Rules active)');
      } else if (deviceId === 'dd_veh01_m4n5p6') {
        triggerNotice('VEH-01 · Driveway SUV 4G GPS & Crash Guard armed');
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      const moved = Math.hypot(ev.clientX - downX, ev.clientY - downY);
      if (moved > 6 || !archRef.current) return;

      setPointerNdc(ev);
      raycaster.setFromCamera(pointerNdc, camera);

      const hits = raycaster.intersectObjects(getInteractiveMeshes(), false);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        const appMeta = hitObj.userData as Partial<ApplianceControlUserData>;
        if (appMeta.kind === 'appliance' && appMeta.applianceId) {
          const appSpec = blueprintRef.current.appliances?.find(
            (a) => a.id === appMeta.applianceId
          );
          if (appSpec?.linked_device_id) {
            dispatchDeviceTap(appSpec.linked_device_id);
            return;
          }
        }

        const hwMeta = hitObj.userData as Partial<HardwareControlUserData>;
        if (hwMeta.deviceId) {
          const step =
            hwMeta.controlKind === 'fan_step' &&
            typeof hwMeta.stepValue === 'number' &&
            hwMeta.stepValue >= 0
              ? hwMeta.stepValue
              : undefined;
          dispatchDeviceTap(hwMeta.deviceId, step);
          return;
        }
      }
    };

    const canvasEl = renderer.domElement;
    canvasEl.style.touchAction = 'none';
    canvasEl.style.cursor = 'grab';
    canvasEl.addEventListener('pointerdown', onPointerDown);
    canvasEl.addEventListener('pointermove', onPointerMove);
    canvasEl.addEventListener('pointerup', onPointerUp);

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = Math.max(260, mountRef.current.clientWidth);
      const h = Math.max(260, mountRef.current.clientHeight);
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    const clock = new THREE.Clock();
    let elapsedTotal = 0;
    let frameId = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(0.05, Math.max(0.001, clock.getDelta()));
      elapsedTotal += dt;

      controller.update(dt);

      const builtArch = archRef.current;
      const bp = blueprintRef.current;

      if (builtArch) {
        // 1. Animate all procedural 3D hardware models (spinning ceiling fan, tilting rockers, water tank level, OLED displays)
        builtArch.hardwareModels.forEach((model) => {
          model.animate(dt, elapsedTotal);
        });
        builtArch.applianceModels.forEach((appModel) => {
          appModel.animate(dt, elapsedTotal);
        });

        // 2. Smooth Multi-Floor Vertical Separation & Opacity
        const selectedFloor = activeFloorRef.current;
        const selectedFloorIdx =
          selectedFloor === 'all'
            ? builtArch.floors.length - 1
            : builtArch.floors.findIndex((f) => f.spec.id === selectedFloor);

        for (const fl of builtArch.floors) {
          const isAbove = selectedFloor !== 'all' && fl.index > selectedFloorIdx;
          const isBelow = selectedFloor !== 'all' && fl.index < selectedFloorIdx;
          const targetLiftY = isAbove ? 2.8 * (fl.index - selectedFloorIdx) : 0;
          const targetOpacity = isAbove ? 0 : isBelow ? 0.72 : 1;

          fl.currentLiftY = THREE.MathUtils.damp(fl.currentLiftY, targetLiftY, 7, dt);
          fl.currentOpacity = THREE.MathUtils.damp(fl.currentOpacity, targetOpacity, 8, dt);
          fl.group.position.y = fl.spec.baseY + fl.currentLiftY;
          fl.group.visible = fl.currentOpacity > 0.03;

          if (fl.group.visible) {
            for (const mat of fl.materials) {
              const baseOp = mat.depthWrite === false ? 0.34 : 1;
              mat.opacity = baseOp * fl.currentOpacity;
            }
          }
        }

        // 3. Smart Dollhouse Wall Auto-Cutaway based on live camera viewing angle
        const camX = camera.position.x;
        const camZ = camera.position.z;
        for (const wall of builtArch.wallCutaways) {
          let targetScaleY = 1;
          const dx = camX - wall.roomCenterX;
          const dz = camZ - wall.roomCenterZ;
          const len = Math.hypot(dx, dz) || 1;
          const dot = (dx / len) * wall.normalX + (dz / len) * wall.normalZ;
          if (dot > 0.2) {
            targetScaleY = wall.isParapet ? 0.52 : 0.18;
          }
          wall.currentScaleY = THREE.MathUtils.damp(wall.currentScaleY, targetScaleY, 9, dt);
          wall.group.scale.y = wall.currentScaleY;
        }

        // 4. Project Room Labels cleanly in 3D space
        const rectW = canvasEl.clientWidth;
        const rectH = canvasEl.clientHeight;
        for (const room of bp.rooms) {
          const labelEl = roomLabelElsRef.current.get(room.id);
          if (!labelEl) continue;

          const flEntry = builtArch.floors.find((f) => f.spec.id === room.floorId);
          const visibleOnFloor =
            flEntry &&
            flEntry.group.visible &&
            (selectedFloor === 'all' ? room.floorId === 'gf' || room.id === 'room_terrace' : room.floorId === selectedFloor);

          if (!visibleOnFloor) {
            labelEl.style.opacity = '0';
            continue;
          }

          projVec.set(
            room.x,
            flEntry.group.position.y + flEntry.spec.slabThickness + 0.22,
            room.z
          );
          projVec.project(camera);

          const inFront = projVec.z >= -1 && projVec.z <= 1;
          const px = (projVec.x * 0.5 + 0.5) * rectW;
          const py = (-projVec.y * 0.5 + 0.5) * rectH;
          const inBounds = px > 40 && px < rectW - 40 && py > 46 && py < rectH - 44;

          if (!inFront || !inBounds) {
            labelEl.style.opacity = '0';
          } else {
            labelEl.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%)`;
            labelEl.style.opacity = '1';
          }
        }
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
      ro.disconnect();
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      canvasEl.removeEventListener('pointermove', onPointerMove);
      canvasEl.removeEventListener('pointerup', onPointerUp);
      controller.dispose();

      if (archRef.current) {
        scene.remove(archRef.current.rootGroup);
        archRef.current.dispose();
        archRef.current = null;
      }

      groundGeo.dispose();
      groundMat.dispose();
      contactGeo.dispose();
      contactMat.dispose();
      shadowTex.dispose();
      gridHelper.geometry.dispose();
      if (Array.isArray(gridHelper.material)) {
        gridHelper.material.forEach((m) => m.dispose());
      } else {
        gridHelper.material.dispose();
      }
      envTarget.dispose();
      scene.clear();

      try {
        renderer.forceContextLoss();
      } catch {
        // Ignore if context already lost
      }
      renderer.dispose();
      container.innerHTML = '';
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controllerRef.current = null;
    };
  }, [resolvedLightMode, isSoftwareGl]);

  // Build / hot-swap architectural residence mesh & procedural hardware models when theme or X-Ray mode changes
  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) return;

    if (archRef.current) {
      scene.remove(archRef.current.rootGroup);
      archRef.current.dispose();
      archRef.current = null;
    }

    const builtArch = buildHomeArchitecture({
      blueprint,
      devices: devicesRef.current,
      isLightTheme: resolvedLightMode,
      isSoftwareGl,
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
      xrayWiring,
      selectedApplianceId: null,
    });

    // Apply initial floor visibility synchronously before adding to scene
    const selectedFloor = activeFloorRef.current;
    const selectedFloorIdx =
      selectedFloor === 'all'
        ? builtArch.floors.length - 1
        : builtArch.floors.findIndex((f) => f.spec.id === selectedFloor);

    for (const fl of builtArch.floors) {
      const isAbove = selectedFloor !== 'all' && fl.index > selectedFloorIdx;
      const isBelow = selectedFloor !== 'all' && fl.index < selectedFloorIdx;
      const targetLiftY = isAbove ? 2.8 * (fl.index - selectedFloorIdx) : 0;
      const targetOpacity = isAbove ? 0 : isBelow ? 0.72 : 1;

      fl.currentLiftY = targetLiftY;
      fl.currentOpacity = targetOpacity;
      fl.group.position.y = fl.spec.baseY + targetLiftY;
      fl.group.visible = targetOpacity > 0.03;

      for (const mat of fl.materials) {
        const baseOp = mat.depthWrite === false ? 0.34 : 1;
        mat.opacity = baseOp * targetOpacity;
      }
    }

    scene.add(builtArch.rootGroup);
    archRef.current = builtArch;

    builtArch.hardwareModels.forEach((model, devId) => {
      const dev = devicesRef.current[devId];
      if (dev) model.updateFromDevice(dev, 7.5);
    });
    builtArch.applianceModels.forEach((appModel) => {
      appModel.updateFromDevices(devicesRef.current);
    });
  }, [blueprint, resolvedLightMode, isSoftwareGl, xrayWiring]);

  const handleResetView = () => {
    if (!controllerRef.current) return;
    const centerY = activeFloor === 'roof' ? 2.8 : 1.35;
    controllerRef.current.snapToOverview(blueprint, centerY);
  };

  return (
    <div className="relative w-full h-[360px] sm:h-[430px] rounded-xl overflow-hidden border border-slate-800/80 bg-slate-950 select-none">
      {/* WebGL Mount Target */}
      <div
        ref={mountRef}
        className="w-full h-full"
        aria-label="Interactive 3D Architectural Home Twin Preview"
      />

      {/* Floating 3D Projected Room Name Badges */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {blueprint.rooms.map((room) => (
          <div
            key={room.id}
            ref={(el) => {
              if (el) roomLabelElsRef.current.set(room.id, el);
              else roomLabelElsRef.current.delete(room.id);
            }}
            style={{ opacity: 0 }}
            className="absolute top-0 left-0 px-2 py-0.5 rounded-md bg-slate-950/75 border border-slate-700/70 backdrop-blur-sm text-[10px] font-mono text-slate-200 tracking-tight whitespace-nowrap transition-opacity duration-150 shadow-sm"
          >
            {room.shortName}
          </div>
        ))}
      </div>

      {/* Top-Left Architectural Telemetry Overlay */}
      <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
        <span className="px-2.5 py-1 rounded-md bg-slate-950/85 border border-slate-800 text-[10px] font-mono text-cyan-300 backdrop-blur-md">
          2BHK Lamka Smart Residence · Dollhouse Cutaway
        </span>
        <span className="hidden sm:inline-flex px-2 py-1 rounded-md bg-slate-950/80 border border-slate-800/90 text-[10px] font-mono text-slate-300 backdrop-blur-md tabular-nums">
          PWR-01 · PWR-02 ({fanSpeed}/4) · PWR-03 ({geyserOn ? '2025W' : '0W'}) · WAT-01 ({tankLevelPct}%)
        </span>
      </div>

      {/* Top-Right Interactive Camera & Layer Controls */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <div className="inline-flex items-center rounded-lg bg-slate-950/85 border border-slate-800 p-0.5 backdrop-blur-md">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'gf', label: 'GF' },
              { id: 'roof', label: 'Roof' },
            ] as const
          ).map((fl) => (
            <button
              key={fl.id}
              type="button"
              onClick={() => onFloorChange(fl.id)}
              className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold transition-colors ${
                activeFloor === fl.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {fl.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onToggleXray}
          title="Toggle 3D X-Ray Conduit Wiring"
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-mono font-semibold backdrop-blur-md transition-colors ${
            xrayWiring
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-slate-950/85 border-slate-800 text-slate-300 hover:border-slate-700'
          }`}
        >
          <Cable className="w-3 h-3" />
          <span className="hidden sm:inline">X-Ray</span>
        </button>

        <button
          type="button"
          onClick={handleResetView}
          title="Reset 3D Orbit Camera"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-950/85 border border-slate-800 hover:border-slate-700 text-[10px] font-mono text-slate-300 backdrop-blur-md transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>

      {/* Live Raycast Feedback Toast */}
      {hudNotice && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-slate-950/90 border border-cyan-500/40 text-[11px] font-mono text-cyan-200 shadow-lg backdrop-blur-md whitespace-nowrap">
          {hudNotice}
        </div>
      )}

      {/* Bottom Interactive Hint Bar */}
      <div className="pointer-events-none absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[10px] font-mono text-slate-400">
        <span className="px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800/80 backdrop-blur-sm">
          Drag to orbit · Scroll/pinch to zoom · Click any 3D switchboard, fan, geyser, or rooftop tank
        </span>
        <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 backdrop-blur-sm">
          <Layers className="w-3 h-3" /> Real Console 3D Engine
        </span>
      </div>
    </div>
  );
};
export default MiniTwinCanvas;
