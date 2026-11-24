/**
 * DD oodle Smart Home — Capability-Driven Procedural 3D Hardware Model Registry (Phase 10C)
 *
 * Dynamically maps ANY of the 42 DD oodle modules from its `module_code` & `capabilities[]`
 * into realistic multi-part procedural Three.js hardware models with:
 * - Physical tilting 3D rocker switches + glowing LED bars + room light-cone feedback (PWR-01)
 * - Wall-mounted 3D rotary stepped fan dial (0–4) + integrated tactile slider + spinning ceiling fan (PWR-02)
 * - Draggable 3D tactile wall sliders with glowing level bars (PWR-04 / PWR-09 / ranged level)
 * - Live high-contrast dynamic CanvasTexture OLED/LCD displays (PWR-03, HUB-01, G12 sensors)
 * - Translucent rooftop water tank with animated water level + TANK_LINK_LOST ring + pump box (WAT-01)
 * - Generic Phase 2/3 fallbacks (smart lock handle, mini security camera, vehicle unit, sensor pod)
 * - Universal G10 latched fault red 3D safety shroud ("HOLD PHYSICAL BUTTON 3s") — NEVER remotely clearable
 * - Strict G12 read-only sensor enforcement (display-only screens; NEVER emit .../cmd)
 */

import * as THREE from 'three';
import {
  DeviceCapability,
  HubTelemetryPayload,
  LevelCapability,
  PowerTelemetryPayload,
  VehicleTelemetryPayload,
  WaterTelemetryPayload,
} from '@/lib/protocol/contract';
import { VirtualDeviceInstance } from '@/lib/simulator/types';
import { FloorId } from '@/lib/twin/architectureBlueprints';

export type HardwareArchetype =
  | 'switchboard'
  | 'fan_regulator'
  | 'slider_dimmer'
  | 'smart_plug_oled'
  | 'water_tank'
  | 'hub_oled'
  | 'vehicle_unit'
  | 'smart_lock'
  | 'security_cam'
  | 'sensor_pod';

export type HardwareControlKind =
  | 'rocker'
  | 'fan_step'
  | 'slider_track'
  | 'readonly_screen'
  | 'body';

export interface HardwareControlUserData {
  kind: 'device_control' | 'device_body';
  deviceId: string;
  roomId: string;
  floorId: FloorId;
  controlKind: HardwareControlKind;
  capKey?: string;
  stepValue?: number;
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  trackLength?: number;
  trackAxis?: 'x' | 'y';
  readOnly?: boolean;
  label?: string;
}

export interface HardwareModelRuntime {
  deviceId: string;
  roomId: string;
  floorId: FloorId;
  archetype: HardwareArchetype;
  rootGroup: THREE.Group;
  /** Companion meshes placed elsewhere in the room (e.g., ceiling fan or room light-cone) */
  companionGroup: THREE.Group | null;
  /** World-space unit normal pointing straight out of the hardware faceplate */
  frontNormal: THREE.Vector3;
  /** Ideal close-up inspection distance along frontNormal (meters) */
  focusDistance: number;
  /** Vertical target offset from rootGroup origin when focusing */
  focusTargetOffsetY: number;
  /** Wall key ('north' | 'south' | 'east' | 'west' | null) this model is mounted on */
  mountWallKey: 'north' | 'south' | 'east' | 'west' | null;
  /** Raycastable meshes for direct 3D interaction (controls first, body fallback) */
  interactiveMeshes: THREE.Mesh[];
  /** Standard materials tracked for multi-floor opacity transitions */
  materials: THREE.MeshStandardMaterial[];
  /** Syncs all 3D visual states & CanvasTextures from live device telemetry/state */
  updateFromDevice: (device: VirtualDeviceInstance, tariffInr: number) => void;
  /** Temporarily previews a slider value during active 3D drag */
  previewSliderValue: (capKey: string, value: number) => void;
  /** Smooth per-frame physical damping, fan blade rotation, water level, fault pulse */
  animate: (dtSec: number, elapsedSec: number) => void;
  /** Disposes every geometry, material, and CanvasTexture owned by this model */
  dispose: () => void;
}

export interface BuildHardwareModelParams {
  device: VirtualDeviceInstance;
  roomId: string;
  floorId: FloorId;
  roomCenterLocal: THREE.Vector3;
  roomCeilingLocalY: number;
  mountPositionLocal: THREE.Vector3;
  facingYaw: number;
  mountWallKey: 'north' | 'south' | 'east' | 'west' | null;
  isLightTheme: boolean;
  castShadows: boolean;
  maxAnisotropy: number;
}

// ============================================================================
// Capability-Driven Archetype Classifier (Scales to All 42 Modules)
// ============================================================================

export function resolveHardwareArchetype(device: VirtualDeviceInstance): HardwareArchetype {
  const code = String(device.module_code || '').toUpperCase();
  const caps = device.info?.capabilities ?? [];
  const hasCapType = (t: DeviceCapability['type']) => caps.some((c) => c.type === t);

  if (code.startsWith('WAT-') || hasCapType('water_level_pct') || hasCapType('pump_switch')) {
    return 'water_tank';
  }
  if (code.startsWith('VEH-') || hasCapType('gps_track')) {
    return 'vehicle_unit';
  }
  if (code.startsWith('HUB-') || hasCapType('hub_status')) {
    return 'hub_oled';
  }
  if (hasCapType('lock_state')) {
    return 'smart_lock';
  }
  if (hasCapType('video_stream')) {
    return 'security_cam';
  }

  const switchCaps = caps.filter((c) => c.type === 'switch');
  const levelCaps = caps.filter((c): c is LevelCapability => c.type === 'level');
  const hasSteppedFan = levelCaps.some((c) => c.max <= 5);
  const hasRangedSlider = levelCaps.some((c) => c.max > 5);
  const hasPowerMeter =
    hasCapType('power_meter') ||
    hasCapType('kwh') ||
    caps.some((c) => c.type === 'sensor' && (c.key === 'v' || c.key === 'kwh' || c.key === 'i'));

  if (code === 'PWR-03' || (switchCaps.length === 1 && hasPowerMeter && !hasSteppedFan && !hasRangedSlider)) {
    return 'smart_plug_oled';
  }
  if (code === 'PWR-02' || (hasSteppedFan && switchCaps.length <= 2)) {
    return 'fan_regulator';
  }
  if (code === 'PWR-04' || code === 'PWR-09' || (hasRangedSlider && switchCaps.length === 0)) {
    return 'slider_dimmer';
  }
  if (switchCaps.length > 0) {
    return 'switchboard';
  }

  // Fallback for all G12 read-only sensors, air quality, temperature/humidity, vitals pods
  return 'sensor_pod';
}

// ============================================================================
// Reusable CanvasTexture Manager (Dirty-String Cached, sRGB + Anisotropy)
// ============================================================================

interface CachedCanvasScreen {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  texture: THREE.CanvasTexture;
  lastSignature: string;
  redrawIfChanged: (signature: string, drawFn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) => void;
}

function createCachedCanvasScreen(
  width: number,
  height: number,
  maxAnisotropy: number,
  disposablesTex: THREE.Texture[]
): CachedCanvasScreen {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  disposablesTex.push(texture);

  const screen: CachedCanvasScreen = {
    canvas,
    ctx,
    texture,
    lastSignature: '',
    redrawIfChanged(signature, drawFn) {
      if (this.lastSignature === signature || !this.ctx) return;
      this.lastSignature = signature;
      drawFn(this.ctx, width, height);
      this.texture.needsUpdate = true;
    },
  };
  return screen;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ============================================================================
// Universal G10 Latched Fault 3D Safety Shroud Helper
// ============================================================================

interface FaultShroudRuntime {
  group: THREE.Group;
  shroudMat: THREE.MeshStandardMaterial;
  screen: CachedCanvasScreen;
  active: boolean;
  update: (faultCode: string | null) => void;
  animate: (elapsedSec: number) => void;
}

function createG10FaultShroud(params: {
  width: number;
  height: number;
  depth: number;
  zOffset: number;
  yOffset?: number;
  maxAnisotropy: number;
  disposablesGeo: THREE.BufferGeometry[];
  disposablesMat: THREE.Material[];
  disposablesTex: THREE.Texture[];
}): FaultShroudRuntime {
  const { width, height, depth, zOffset, yOffset = 0, maxAnisotropy, disposablesGeo, disposablesMat, disposablesTex } =
    params;

  const group = new THREE.Group();
  group.position.set(0, yOffset, zOffset);
  group.visible = false;

  // Translucent red safety cover physically encasing the locked switch/control face
  const shroudGeo = new THREE.BoxGeometry(width + 0.04, height + 0.04, depth);
  disposablesGeo.push(shroudGeo);
  const shroudMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    emissive: 0xe11d48,
    emissiveIntensity: 0.75,
    roughness: 0.22,
    metalness: 0.1,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  disposablesMat.push(shroudMat);
  const shroudMesh = new THREE.Mesh(shroudGeo, shroudMat);
  group.add(shroudMesh);

  // Glowing perimeter lockout rails (top & bottom)
  const railGeo = new THREE.BoxGeometry(width + 0.055, 0.022, depth + 0.01);
  disposablesGeo.push(railGeo);
  const railMat = new THREE.MeshStandardMaterial({
    color: 0xfb7185,
    emissive: 0xf43f5e,
    emissiveIntensity: 1.35,
    roughness: 0.25,
  });
  disposablesMat.push(railMat);
  const topRail = new THREE.Mesh(railGeo, railMat);
  topRail.position.y = height / 2 + 0.02;
  const botRail = new THREE.Mesh(railGeo, railMat);
  botRail.position.y = -height / 2 - 0.02;
  group.add(topRail, botRail);

  // Crisp floating warning placard directly above the shroud: "HOLD PHYSICAL BUTTON 3s"
  const screen = createCachedCanvasScreen(512, 160, maxAnisotropy, disposablesTex);
  const placardGeo = new THREE.PlaneGeometry(Math.max(width + 0.14, 0.56), 0.18);
  disposablesGeo.push(placardGeo);
  const placardMat = new THREE.MeshBasicMaterial({
    map: screen.texture,
    transparent: false,
    toneMapped: false,
  });
  disposablesMat.push(placardMat);
  const placard = new THREE.Mesh(placardGeo, placardMat);
  placard.position.set(0, height / 2 + 0.135, depth / 2 + 0.012);
  group.add(placard);

  const runtime: FaultShroudRuntime = {
    group,
    shroudMat,
    screen,
    active: false,
    update(faultCode) {
      const hasFault = faultCode !== null && faultCode.length > 0;
      this.active = hasFault;
      this.group.visible = hasFault;
      if (!hasFault) return;
      this.screen.redrawIfChanged(faultCode, (ctx, w, h) => {
        ctx.fillStyle = '#4c0519';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#fb7185';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);

        ctx.fillStyle = '#fda4af';
        ctx.font = '700 30px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`LOCKED: ${faultCode}`, w / 2, 58);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 32px system-ui, -apple-system, sans-serif';
        ctx.fillText('HOLD PHYSICAL BUTTON 3s', w / 2, 118);
      });
    },
    animate(elapsedSec) {
      if (!this.active) return;
      const pulse = 0.55 + Math.sin(elapsedSec * 5.2) * 0.25;
      this.shroudMat.emissiveIntensity = pulse + 0.35;
      this.shroudMat.opacity = 0.28 + pulse * 0.18;
    },
  };

  return runtime;
}

// ============================================================================
// Reusable Sub-Assembly Builders (Rockers, Fan Dial, Tactile Slider)
// ============================================================================

interface RockerRuntime {
  capKey: string;
  pivot: THREE.Group;
  ledMat: THREE.MeshStandardMaterial;
  targetAngle: number;
  currentAngle: number;
}

function buildPhysicalRocker(params: {
  capKey: string;
  label: string;
  deviceId: string;
  roomId: string;
  floorId: FloorId;
  width: number;
  height: number;
  accentOnHex: number;
  bodyHex?: number;
  disposablesGeo: THREE.BufferGeometry[];
  disposablesMat: THREE.Material[];
  trackMat: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial;
  interactiveMeshes: THREE.Mesh[];
}): { container: THREE.Group; runtime: RockerRuntime } {
  const {
    capKey,
    label,
    deviceId,
    roomId,
    floorId,
    width,
    height,
    accentOnHex,
    bodyHex = 0xf8fafc,
    disposablesGeo,
    trackMat,
    interactiveMeshes,
  } = params;

  const container = new THREE.Group();

  // Recessed well bezel
  const wellGeo = new THREE.BoxGeometry(width + 0.016, height + 0.016, 0.018);
  disposablesGeo.push(wellGeo);
  const wellMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.65,
      metalness: 0.15,
      transparent: true,
    })
  );
  const well = new THREE.Mesh(wellGeo, wellMat);
  well.position.z = 0.008;
  container.add(well);

  // Pivoting rocker paddle
  const pivot = new THREE.Group();
  pivot.position.set(0, 0, 0.02);
  container.add(pivot);

  const paddleGeo = new THREE.BoxGeometry(width, height, 0.028);
  disposablesGeo.push(paddleGeo);
  const paddleMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: bodyHex,
      roughness: 0.28,
      metalness: 0.08,
      transparent: true,
    })
  );
  const paddle = new THREE.Mesh(paddleGeo, paddleMat);
  paddle.position.z = 0.006;
  paddle.userData = {
    kind: 'device_control',
    deviceId,
    roomId,
    floorId,
    controlKind: 'rocker',
    capKey,
    label,
  } satisfies HardwareControlUserData;
  pivot.add(paddle);
  interactiveMeshes.push(paddle);

  // Tactile horizontal ridge at bottom edge of rocker
  const ridgeGeo = new THREE.BoxGeometry(width * 0.72, 0.009, 0.01);
  disposablesGeo.push(ridgeGeo);
  const ridgeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.4,
      metalness: 0.2,
      transparent: true,
    })
  );
  const ridge = new THREE.Mesh(ridgeGeo, ridgeMat);
  ridge.position.set(0, -height * 0.34, 0.022);
  pivot.add(ridge);

  // Glowing Status LED bar embedded in upper third of rocker
  const ledGeo = new THREE.BoxGeometry(width * 0.54, 0.011, 0.008);
  disposablesGeo.push(ledGeo);
  const ledMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: accentOnHex,
      emissive: accentOnHex,
      emissiveIntensity: 0.12,
      roughness: 0.18,
      transparent: true,
    })
  );
  const led = new THREE.Mesh(ledGeo, ledMat);
  led.position.set(0, height * 0.3, 0.022);
  led.userData = paddle.userData;
  pivot.add(led);
  interactiveMeshes.push(led);

  return {
    container,
    runtime: {
      capKey,
      pivot,
      ledMat,
      targetAngle: -0.22,
      currentAngle: -0.22,
    },
  };
}

interface FanDialRuntime {
  capKey: string;
  knobPivot: THREE.Group;
  pipMats: THREE.MeshStandardMaterial[];
  targetAngle: number;
  currentAngle: number;
}

function buildRotaryFanDial(params: {
  capKey: string;
  label: string;
  deviceId: string;
  roomId: string;
  floorId: FloorId;
  radius: number;
  disposablesGeo: THREE.BufferGeometry[];
  trackMat: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial;
  interactiveMeshes: THREE.Mesh[];
}): { container: THREE.Group; runtime: FanDialRuntime } {
  const { capKey, label, deviceId, roomId, floorId, radius, disposablesGeo, trackMat, interactiveMeshes } = params;

  const container = new THREE.Group();

  // Recessed circular bezel collar
  const collarGeo = new THREE.CylinderGeometry(radius * 1.18, radius * 1.24, 0.024, 28);
  disposablesGeo.push(collarGeo);
  const collarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.35,
      metalness: 0.45,
      transparent: true,
    })
  );
  const collar = new THREE.Mesh(collarGeo, collarMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.z = 0.012;
  container.add(collar);

  // Rotating knurled dial knob (rotates around local Z)
  const knobPivot = new THREE.Group();
  knobPivot.position.set(0, 0, 0.024);
  container.add(knobPivot);

  const knobGeo = new THREE.CylinderGeometry(radius * 0.84, radius * 0.92, 0.044, 24);
  disposablesGeo.push(knobGeo);
  const knobMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.28,
      metalness: 0.22,
      transparent: true,
    })
  );
  const knob = new THREE.Mesh(knobGeo, knobMat);
  knob.rotation.x = Math.PI / 2;
  knob.position.z = 0.016;
  // Tapping the central dial cycles fan speed cleanly (stepValue: -1 signals cycle)
  knob.userData = {
    kind: 'device_control',
    deviceId,
    roomId,
    floorId,
    controlKind: 'fan_step',
    capKey,
    stepValue: -1,
    label: `${label} (Cycle)`,
  } satisfies HardwareControlUserData;
  knobPivot.add(knob);
  interactiveMeshes.push(knob);

  // Glowing cyan indicator needle bar on top of knob
  const needleGeo = new THREE.BoxGeometry(0.014, radius * 0.62, 0.012);
  disposablesGeo.push(needleGeo);
  const needleMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.35,
      roughness: 0.2,
      transparent: true,
    })
  );
  const needle = new THREE.Mesh(needleGeo, needleMat);
  needle.position.set(0, radius * 0.24, 0.04);
  knobPivot.add(needle);

  // 5 Clickable step detent LEDs arranged around upper arc: OFF(0), 1, 2, 3, 4
  // Angles from left (-120 deg) clockwise across top to right (+120 deg)
  const pipMats: THREE.MeshStandardMaterial[] = [];
  const pipGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.016, 12);
  const pipHitGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.026, 10);
  disposablesGeo.push(pipGeo, pipHitGeo);

  for (let step = 0; step <= 4; step++) {
    // Angle in Z-plane: step 0 at bottom-left, step 2 at top, step 4 at bottom-right
    const theta = THREE.MathUtils.degToRad(130 - step * 65);
    const px = Math.cos(theta) * (radius * 1.48);
    const py = Math.sin(theta) * (radius * 1.48);

    const pipMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: step === 0 ? 0x94a3b8 : 0x06b6d4,
        emissive: step === 0 ? 0x334155 : 0x0284c7,
        emissiveIntensity: 0.15,
        roughness: 0.22,
        transparent: true,
      })
    );
    pipMats.push(pipMat);

    const pip = new THREE.Mesh(pipGeo, pipMat);
    pip.rotation.x = Math.PI / 2;
    pip.position.set(px, py, 0.022);
    pip.userData = {
      kind: 'device_control',
      deviceId,
      roomId,
      floorId,
      controlKind: 'fan_step',
      capKey,
      stepValue: step,
      label: step === 0 ? 'Fan OFF' : `Fan Speed ${step}`,
    } satisfies HardwareControlUserData;
    container.add(pip);
    interactiveMeshes.push(pip);
  }

  return {
    container,
    runtime: {
      capKey,
      knobPivot,
      pipMats,
      targetAngle: THREE.MathUtils.degToRad(40),
      currentAngle: THREE.MathUtils.degToRad(40),
    },
  };
}

interface SliderRuntime {
  capKey: string;
  min: number;
  max: number;
  trackLength: number;
  thumbMesh: THREE.Mesh;
  fillMesh: THREE.Mesh;
  targetNorm: number;
  currentNorm: number;
}

function buildVerticalSliderControl(params: {
  capKey: string;
  label: string;
  min: number;
  max: number;
  step: number;
  trackLength: number;
  deviceId: string;
  roomId: string;
  floorId: FloorId;
  disposablesGeo: THREE.BufferGeometry[];
  trackMat: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial;
  interactiveMeshes: THREE.Mesh[];
}): { container: THREE.Group; runtime: SliderRuntime } {
  const {
    capKey,
    label,
    min,
    max,
    step,
    trackLength,
    deviceId,
    roomId,
    floorId,
    disposablesGeo,
    trackMat,
    interactiveMeshes,
  } = params;

  const container = new THREE.Group();

  const sliderUserData: HardwareControlUserData = {
    kind: 'device_control',
    deviceId,
    roomId,
    floorId,
    controlKind: 'slider_track',
    capKey,
    sliderMin: min,
    sliderMax: max,
    sliderStep: step,
    trackLength,
    trackAxis: 'y',
    label,
  };

  // Recessed track trough
  const troughGeo = new THREE.BoxGeometry(0.036, trackLength + 0.02, 0.016);
  disposablesGeo.push(troughGeo);
  const troughMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.6,
      metalness: 0.25,
      transparent: true,
    })
  );
  const trough = new THREE.Mesh(troughGeo, troughMat);
  trough.position.z = 0.01;
  trough.userData = sliderUserData;
  container.add(trough);
  interactiveMeshes.push(trough);

  // Invisible wider touch-friendly drag plane along the track
  const dragHitGeo = new THREE.PlaneGeometry(0.11, trackLength + 0.06);
  disposablesGeo.push(dragHitGeo);
  const dragHitMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.001,
      depthWrite: false,
    })
  );
  const dragHit = new THREE.Mesh(dragHitGeo, dragHitMat);
  dragHit.position.z = 0.025;
  dragHit.userData = sliderUserData;
  container.add(dragHit);
  interactiveMeshes.push(dragHit);

  // Glowing active level bar inside trough (scales vertically from bottom)
  const fillGeo = new THREE.BoxGeometry(0.018, trackLength, 0.012);
  fillGeo.translate(0, trackLength / 2, 0);
  disposablesGeo.push(fillGeo);
  const fillMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.25,
      roughness: 0.2,
      transparent: true,
    })
  );
  const fillMesh = new THREE.Mesh(fillGeo, fillMat);
  fillMesh.position.set(0, -trackLength / 2, 0.018);
  container.add(fillMesh);

  // Tactile 3D beveled thumb knob
  const thumbGeo = new THREE.BoxGeometry(0.068, 0.036, 0.034);
  disposablesGeo.push(thumbGeo);
  const thumbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.22,
      metalness: 0.3,
      transparent: true,
    })
  );
  const thumbMesh = new THREE.Mesh(thumbGeo, thumbMat);
  thumbMesh.position.set(0, 0, 0.032);
  thumbMesh.userData = sliderUserData;
  container.add(thumbMesh);
  interactiveMeshes.push(thumbMesh);

  return {
    container,
    runtime: {
      capKey,
      min,
      max,
      trackLength,
      thumbMesh,
      fillMesh,
      targetNorm: 0.5,
      currentNorm: 0.5,
    },
  };
}

// ============================================================================
// Main Factory: Builds Exact Procedural 3D Hardware Model for Any Device
// ============================================================================

export function buildHardwareModel(params: BuildHardwareModelParams): HardwareModelRuntime {
  const {
    device,
    roomId,
    floorId,
    roomCenterLocal,
    roomCeilingLocalY,
    mountPositionLocal,
    facingYaw,
    mountWallKey,
    isLightTheme,
    castShadows,
    maxAnisotropy,
  } = params;

  const archetype = resolveHardwareArchetype(device);
  const disposablesGeo: THREE.BufferGeometry[] = [];
  const disposablesMat: THREE.Material[] = [];
  const disposablesTex: THREE.Texture[] = [];
  const trackedStandardMats: THREE.MeshStandardMaterial[] = [];
  const interactiveMeshes: THREE.Mesh[] = [];

  const trackMat = (mat: THREE.MeshStandardMaterial) => {
    disposablesMat.push(mat);
    trackedStandardMats.push(mat);
    return mat;
  };

  const rootGroup = new THREE.Group();
  rootGroup.position.copy(mountPositionLocal);
  rootGroup.rotation.y = facingYaw;

  // World-space normal facing straight out of local +Z
  const frontNormal = new THREE.Vector3(Math.sin(facingYaw), 0, Math.cos(facingYaw)).normalize();

  let companionGroup: THREE.Group | null = null;
  let focusDistance = 1.45;
  let focusTargetOffsetY = 0;

  const rockers: RockerRuntime[] = [];
  const fanDials: FanDialRuntime[] = [];
  const sliders: SliderRuntime[] = [];
  let faultShroud: FaultShroudRuntime | null = null;

  // Specialized animation handles
  let ceilingFanBlades: THREE.Group | null = null;
  let targetFanSpeed = 0;
  let currentFanSpeed = 0;
  let lightConeMat: THREE.MeshBasicMaterial | null = null;
  let lightFixtureMat: THREE.MeshStandardMaterial | null = null;
  let targetLightLevel = 0;
  let currentLightLevel = 0;
  let waterColumnMesh: THREE.Mesh | null = null;
  let waterSurfaceMesh: THREE.Mesh | null = null;
  let targetWaterPct = 0.7;
  let currentWaterPct = 0.7;
  let tankLinkLostRing: THREE.Mesh | null = null;
  let tankLinkLostMat: THREE.MeshStandardMaterial | null = null;
  let isTankLinkLost = false;
  let oledScreen: CachedCanvasScreen | null = null;
  let lockLeverPivot: THREE.Group | null = null;
  let targetLockAngle = 0;
  let vehicleBeaconMat: THREE.MeshStandardMaterial | null = null;

  const bodyUserData: HardwareControlUserData = {
    kind: 'device_body',
    deviceId: device.device_id,
    roomId,
    floorId,
    controlKind: 'body',
    readOnly: archetype === 'sensor_pod' || archetype === 'hub_oled' || archetype === 'security_cam',
    label: device.name,
  };

  // Shared Indian Modular Faceplate Palette (bright architectural satin polycarbonate)
  const plateColor = isLightTheme ? 0xf8fafc : 0xe2e8f0;
  const trimColor = isLightTheme ? 0x64748b : 0x475569;

  const buildModularPlate = (w: number, h: number, d: number = 0.036) => {
    const outerGeo = new THREE.BoxGeometry(w, h, d);
    const innerGeo = new THREE.BoxGeometry(w - 0.045, h - 0.045, d + 0.008);
    disposablesGeo.push(outerGeo, innerGeo);

    const outerMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: plateColor,
        roughness: 0.32,
        metalness: 0.14,
        transparent: true,
      })
    );
    const innerMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: trimColor,
        roughness: 0.42,
        metalness: 0.35,
        transparent: true,
      })
    );

    const outer = new THREE.Mesh(outerGeo, outerMat);
    outer.position.z = d / 2;
    outer.castShadow = castShadows;
    outer.receiveShadow = castShadows;
    outer.userData = bodyUserData;
    rootGroup.add(outer);
    interactiveMeshes.push(outer);

    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.position.z = d / 2 + 0.003;
    rootGroup.add(inner);

    const faceGeo = new THREE.BoxGeometry(w - 0.068, h - 0.068, d + 0.012);
    disposablesGeo.push(faceGeo);
    const face = new THREE.Mesh(faceGeo, outerMat);
    face.position.z = d / 2 + 0.005;
    face.userData = bodyUserData;
    rootGroup.add(face);
    interactiveMeshes.push(face);
  };

  // ==========================================================================
  // 1. 3D WALL SWITCHBOARD (PWR-01 & Multi-Gang Switch Modules)
  // ==========================================================================
  if (archetype === 'switchboard') {
    const switchCaps = (device.info?.capabilities ?? []).filter((c) => c.type === 'switch');
    const fanCap = (device.info?.capabilities ?? []).find(
      (c): c is LevelCapability => c.type === 'level' && c.max <= 5
    );
    const gangCount = Math.max(1, switchCaps.length);
    const hasFanDial = Boolean(fanCap);

    const rockerW = 0.082;
    const rockerH = 0.175;
    const gap = 0.026;
    const dialSpace = hasFanDial ? 0.22 : 0;
    const plateW = Math.max(0.46, gangCount * (rockerW + gap) + dialSpace + 0.14);
    const plateH = 0.36;

    buildModularPlate(plateW, plateH, 0.036);
    focusDistance = Math.max(1.18, plateW * 2.15);

    // Top Silkscreen Header Strip (CanvasTexture showing Module + Channel Names + Live Watts)
    oledScreen = createCachedCanvasScreen(512, 96, maxAnisotropy, disposablesTex);
    const headerGeo = new THREE.PlaneGeometry(plateW - 0.09, 0.068);
    disposablesGeo.push(headerGeo);
    const headerMat = new THREE.MeshBasicMaterial({
      map: oledScreen.texture,
      toneMapped: false,
    });
    disposablesMat.push(headerMat);
    const headerMesh = new THREE.Mesh(headerGeo, headerMat);
    headerMesh.position.set(0, plateH / 2 - 0.068, 0.044);
    headerMesh.userData = bodyUserData;
    rootGroup.add(headerMesh);

    const startX = -plateW / 2 + 0.09 + rockerW / 2;
    switchCaps.forEach((cap, idx) => {
      const { container, runtime } = buildPhysicalRocker({
        capKey: cap.key,
        label: cap.label,
        deviceId: device.device_id,
        roomId,
        floorId,
        width: rockerW,
        height: rockerH,
        accentOnHex: 0x10b981,
        disposablesGeo,
        disposablesMat,
        trackMat,
        interactiveMeshes,
      });
      container.position.set(startX + idx * (rockerW + gap), -0.028, 0.036);
      rootGroup.add(container);
      rockers.push(runtime);
    });

    if (fanCap) {
      const { container, runtime } = buildRotaryFanDial({
        capKey: fanCap.key,
        label: fanCap.label,
        deviceId: device.device_id,
        roomId,
        floorId,
        radius: 0.056,
        disposablesGeo,
        trackMat,
        interactiveMeshes,
      });
      container.position.set(plateW / 2 - 0.145, -0.028, 0.036);
      rootGroup.add(container);
      fanDials.push(runtime);
    }

    // Companion Room Ceiling Downlight + Subtle Light-Cone Feedback when switches toggle ON
    companionGroup = new THREE.Group();
    companionGroup.position.set(roomCenterLocal.x, roomCeilingLocalY - 0.05, roomCenterLocal.z);

    const canopyGeo = new THREE.CylinderGeometry(0.22, 0.24, 0.045, 24);
    const lensGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.015, 24);
    const coneGeo = new THREE.ConeGeometry(1.35, 2.0, 24, 1, true);
    disposablesGeo.push(canopyGeo, lensGeo, coneGeo);

    const canopy = new THREE.Mesh(
      canopyGeo,
      trackMat(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.4, transparent: true }))
    );
    companionGroup.add(canopy);

    lightFixtureMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xfde68a,
        emissiveIntensity: 0.15,
        roughness: 0.2,
        transparent: true,
      })
    );
    const lens = new THREE.Mesh(lensGeo, lightFixtureMat);
    lens.position.y = -0.025;
    companionGroup.add(lens);

    lightConeMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    disposablesMat.push(lightConeMat);
    const cone = new THREE.Mesh(coneGeo, lightConeMat);
    cone.position.y = -1.03;
    companionGroup.add(cone);

    faultShroud = createG10FaultShroud({
      width: plateW,
      height: plateH,
      depth: 0.09,
      zOffset: 0.048,
      maxAnisotropy,
      disposablesGeo,
      disposablesMat,
      disposablesTex,
    });
    rootGroup.add(faultShroud.group);
  }

  // ==========================================================================
  // 2. 3D FAN REGULATOR, INTEGRATED DIMMER SLIDER & CEILING FAN (PWR-02)
  // ==========================================================================
  else if (archetype === 'fan_regulator') {
    const caps = device.info?.capabilities ?? [];
    const fanCap =
      caps.find((c): c is LevelCapability => c.type === 'level' && c.max <= 5) ??
      ({ key: 'fan_speed', type: 'level', label: 'Fan Speed', min: 0, max: 4, step: 1 } as LevelCapability);
    const sliderCap = caps.find((c): c is LevelCapability => c.type === 'level' && c.max > 5);
    const switchCap = caps.find((c) => c.type === 'switch');

    const plateW = sliderCap && switchCap ? 0.56 : sliderCap || switchCap ? 0.44 : 0.34;
    const plateH = 0.38;
    buildModularPlate(plateW, plateH, 0.036);
    focusDistance = 1.22;

    // Header OLED readout strip
    oledScreen = createCachedCanvasScreen(512, 96, maxAnisotropy, disposablesTex);
    const headerGeo = new THREE.PlaneGeometry(plateW - 0.08, 0.068);
    disposablesGeo.push(headerGeo);
    const headerMat = new THREE.MeshBasicMaterial({ map: oledScreen.texture, toneMapped: false });
    disposablesMat.push(headerMat);
    const headerMesh = new THREE.Mesh(headerGeo, headerMat);
    headerMesh.position.set(0, plateH / 2 - 0.068, 0.044);
    headerMesh.userData = bodyUserData;
    rootGroup.add(headerMesh);

    // Rotary stepped dial (0–4)
    const dialX = sliderCap && switchCap ? -0.14 : sliderCap || switchCap ? -0.09 : 0;
    const { container: dialGroup, runtime: dialRuntime } = buildRotaryFanDial({
      capKey: fanCap.key,
      label: fanCap.label,
      deviceId: device.device_id,
      roomId,
      floorId,
      radius: 0.064,
      disposablesGeo,
      trackMat,
      interactiveMeshes,
    });
    dialGroup.position.set(dialX, -0.035, 0.036);
    rootGroup.add(dialGroup);
    fanDials.push(dialRuntime);

    // Optional Tactile 3D Dimmer Slider (e.g., PWR-02 dimmer_pct 0–100)
    if (sliderCap) {
      const sliderX = switchCap ? 0.055 : 0.115;
      const { container: sliderGroup, runtime: sliderRuntime } = buildVerticalSliderControl({
        capKey: sliderCap.key,
        label: sliderCap.label,
        min: sliderCap.min,
        max: sliderCap.max,
        step: sliderCap.step ?? 5,
        trackLength: 0.18,
        deviceId: device.device_id,
        roomId,
        floorId,
        disposablesGeo,
        trackMat,
        interactiveMeshes,
      });
      sliderGroup.position.set(sliderX, -0.035, 0.036);
      rootGroup.add(sliderGroup);
      sliders.push(sliderRuntime);
    }

    // Optional physical rocker (e.g., PWR-02 ch1 Warm Lamp)
    if (switchCap) {
      const { container: rockerGroup, runtime: rockerRuntime } = buildPhysicalRocker({
        capKey: switchCap.key,
        label: switchCap.label,
        deviceId: device.device_id,
        roomId,
        floorId,
        width: 0.088,
        height: 0.175,
        accentOnHex: 0xf59e0b,
        disposablesGeo,
        disposablesMat,
        trackMat,
        interactiveMeshes,
      });
      rockerGroup.position.set(plateW / 2 - 0.1, -0.035, 0.036);
      rootGroup.add(rockerGroup);
      rockers.push(rockerRuntime);
    }

    // Companion Overhead 3D Ceiling Fan in the Room Center (Blades Spin at Speed 0–4)
    companionGroup = new THREE.Group();
    companionGroup.position.set(roomCenterLocal.x, roomCeilingLocalY - 0.38, roomCenterLocal.z);

    const canopyGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.08, 18);
    const rodGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.36, 12);
    const motorGeo = new THREE.CylinderGeometry(0.19, 0.21, 0.095, 24);
    const trimRingGeo = new THREE.TorusGeometry(0.205, 0.014, 10, 24);
    disposablesGeo.push(canopyGeo, rodGeo, motorGeo, trimRingGeo);

    const chromeMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.78, roughness: 0.22, transparent: true })
    );
    const motorMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.55, roughness: 0.3, transparent: true })
    );
    const brassMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.72, roughness: 0.28, transparent: true })
    );

    const canopy = new THREE.Mesh(canopyGeo, chromeMat);
    canopy.position.y = 0.35;
    const rod = new THREE.Mesh(rodGeo, chromeMat);
    rod.position.y = 0.18;
    const motor = new THREE.Mesh(motorGeo, motorMat);
    motor.castShadow = castShadows;
    const trimRing = new THREE.Mesh(trimRingGeo, brassMat);
    trimRing.rotation.x = Math.PI / 2;
    trimRing.position.y = -0.025;
    companionGroup.add(canopy, rod, motor, trimRing);

    const bladesGroup = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(0.135, 0.016, 0.76);
    const shankGeo = new THREE.BoxGeometry(0.06, 0.02, 0.14);
    disposablesGeo.push(bladeGeo, shankGeo);
    const bladeMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: isLightTheme ? 0x64748b : 0x94a3b8,
        roughness: 0.35,
        metalness: 0.32,
        transparent: true,
      })
    );
    for (let i = 0; i < 3; i++) {
      const ang = (i * 2 * Math.PI) / 3;
      const bladeWrap = new THREE.Group();
      bladeWrap.rotation.y = ang;
      const shank = new THREE.Mesh(shankGeo, brassMat);
      shank.position.set(0, -0.005, 0.22);
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(0, -0.005, 0.62);
      blade.rotation.z = 0.09; // subtle aerodynamic pitch
      blade.castShadow = castShadows;
      blade.userData = bodyUserData;
      bladeWrap.add(shank, blade);
      bladesGroup.add(bladeWrap);
      interactiveMeshes.push(blade);
    }
    companionGroup.add(bladesGroup);
    ceilingFanBlades = bladesGroup;

    faultShroud = createG10FaultShroud({
      width: plateW,
      height: plateH,
      depth: 0.095,
      zOffset: 0.05,
      maxAnisotropy,
      disposablesGeo,
      disposablesMat,
      disposablesTex,
    });
    rootGroup.add(faultShroud.group);
  }

  // ==========================================================================
  // 3. 3D TACTILE SLIDER (PWR-04 Dimmer / PWR-09 Curtain / Ranged Level 0–100)
  // ==========================================================================
  else if (archetype === 'slider_dimmer') {
    const levelCap =
      (device.info?.capabilities ?? []).find((c): c is LevelCapability => c.type === 'level') ??
      ({ key: 'level', type: 'level', label: 'Level', min: 0, max: 100, step: 5 } as LevelCapability);

    const plateW = 0.28;
    const plateH = 0.42;
    buildModularPlate(plateW, plateH, 0.036);
    focusDistance = 1.1;

    oledScreen = createCachedCanvasScreen(256, 96, maxAnisotropy, disposablesTex);
    const screenGeo = new THREE.PlaneGeometry(0.2, 0.072);
    disposablesGeo.push(screenGeo);
    const screenMat = new THREE.MeshBasicMaterial({ map: oledScreen.texture, toneMapped: false });
    disposablesMat.push(screenMat);
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 0.135, 0.044);
    rootGroup.add(screenMesh);

    const { container: sliderGroup, runtime: sliderRuntime } = buildVerticalSliderControl({
      capKey: levelCap.key,
      label: levelCap.label,
      min: levelCap.min,
      max: levelCap.max,
      step: levelCap.step ?? 5,
      trackLength: 0.22,
      deviceId: device.device_id,
      roomId,
      floorId,
      disposablesGeo,
      trackMat,
      interactiveMeshes,
    });
    sliderGroup.position.set(0, -0.045, 0.036);
    rootGroup.add(sliderGroup);
    sliders.push(sliderRuntime);

    faultShroud = createG10FaultShroud({
      width: plateW,
      height: plateH,
      depth: 0.09,
      zOffset: 0.048,
      maxAnisotropy,
      disposablesGeo,
      disposablesMat,
      disposablesTex,
    });
    rootGroup.add(faultShroud.group);
  }

  // ==========================================================================
  // 4. 3D 16A HEAVY APPLIANCE SWITCH & LIVE OLED MONITOR (PWR-03)
  // ==========================================================================
  else if (archetype === 'smart_plug_oled') {
    const switchCap =
      (device.info?.capabilities ?? []).find((c) => c.type === 'switch') ??
      ({ key: 'ch1', type: 'switch', label: '16A Heavy Load' } as DeviceCapability);

    const plateW = 0.48;
    const plateH = 0.36;
    buildModularPlate(plateW, plateH, 0.044);
    focusDistance = 1.22;

    // Recessed Dark OLED Bezel on Left Side
    const bezelGeo = new THREE.BoxGeometry(0.255, 0.225, 0.016);
    disposablesGeo.push(bezelGeo);
    const bezel = new THREE.Mesh(
      bezelGeo,
      trackMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.22, metalness: 0.45, transparent: true }))
    );
    bezel.position.set(-0.072, 0, 0.048);
    rootGroup.add(bezel);

    // Live Dynamic CanvasTexture OLED Monitor Screen
    oledScreen = createCachedCanvasScreen(512, 384, maxAnisotropy, disposablesTex);
    const screenGeo = new THREE.PlaneGeometry(0.236, 0.205);
    disposablesGeo.push(screenGeo);
    const screenMat = new THREE.MeshBasicMaterial({ map: oledScreen.texture, toneMapped: false });
    disposablesMat.push(screenMat);
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(-0.072, 0, 0.058);
    screenMesh.userData = bodyUserData;
    rootGroup.add(screenMesh);
    interactiveMeshes.push(screenMesh);

    // Heavy 16A Physical Rocker Switch on Right Side
    const { container: rockerGroup, runtime: rockerRuntime } = buildPhysicalRocker({
      capKey: switchCap.key,
      label: switchCap.label,
      deviceId: device.device_id,
      roomId,
      floorId,
      width: 0.11,
      height: 0.21,
      accentOnHex: 0xf59e0b,
      bodyHex: 0xfef2f2,
      disposablesGeo,
      disposablesMat,
      trackMat,
      interactiveMeshes,
    });
    rockerGroup.position.set(0.132, 0, 0.042);
    rootGroup.add(rockerGroup);
    rockers.push(rockerRuntime);

    // Companion Storage Geyser Cylinder mounted higher on the same wall for instant room recognition
    const geyserBodyGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.52, 20);
    const geyserCapGeo = new THREE.SphereGeometry(0.18, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const pipeGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.28, 10);
    disposablesGeo.push(geyserBodyGeo, geyserCapGeo, pipeGeo);
    const geyserMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.2, transparent: true })
    );
    const copperMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.35, metalness: 0.72, transparent: true })
    );

    const geyserGroup = new THREE.Group();
    geyserGroup.position.set(0.46, 0.45, 0.2);
    const gBody = new THREE.Mesh(geyserBodyGeo, geyserMat);
    gBody.castShadow = castShadows;
    gBody.userData = bodyUserData;
    const gTop = new THREE.Mesh(geyserCapGeo, geyserMat);
    gTop.position.y = 0.26;
    const pipeL = new THREE.Mesh(pipeGeo, copperMat);
    pipeL.position.set(-0.07, -0.36, 0);
    const pipeR = new THREE.Mesh(pipeGeo, copperMat);
    pipeR.position.set(0.07, -0.36, 0);
    geyserGroup.add(gBody, gTop, pipeL, pipeR);
    rootGroup.add(geyserGroup);
    interactiveMeshes.push(gBody);

    // G10 Latched Fault 3D Safety Shroud over the 16A faceplate
    faultShroud = createG10FaultShroud({
      width: plateW,
      height: plateH,
      depth: 0.1,
      zOffset: 0.056,
      maxAnisotropy,
      disposablesGeo,
      disposablesMat,
      disposablesTex,
    });
    rootGroup.add(faultShroud.group);
  }

  // ==========================================================================
  // 5. 3D OVERHEAD WATER TANK & WALL/PEDESTAL PUMP SWITCH BOX (WAT-01)
  // ==========================================================================
  else if (archetype === 'water_tank') {
    focusDistance = 2.35;
    focusTargetOffsetY = 0.65;

    const pumpCap =
      (device.info?.capabilities ?? []).find((c) => c.type === 'pump_switch' || c.type === 'switch') ??
      ({ key: 'pump_on', type: 'pump_switch', label: 'Water Pump' } as DeviceCapability);

    // Concrete/Steel Rooftop Stand
    const standGeo = new THREE.CylinderGeometry(0.58, 0.64, 0.18, 24);
    const tankShellGeo = new THREE.CylinderGeometry(0.52, 0.52, 1.08, 28, 1, false);
    const tankLidGeo = new THREE.CylinderGeometry(0.24, 0.26, 0.08, 20);
    const ribGeo = new THREE.TorusGeometry(0.525, 0.018, 10, 28);
    disposablesGeo.push(standGeo, tankShellGeo, tankLidGeo, ribGeo);

    const standMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.72, metalness: 0.12, transparent: true })
    );
    const stand = new THREE.Mesh(standGeo, standMat);
    stand.position.y = 0.09;
    stand.receiveShadow = castShadows;
    stand.userData = bodyUserData;
    rootGroup.add(stand);

    // Translucent Cylindrical Rooftop Water Tank Shell
    const shellMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe0f2fe,
        roughness: 0.22,
        metalness: 0.08,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      })
    );
    const tankShell = new THREE.Mesh(tankShellGeo, shellMat);
    tankShell.position.y = 0.72;
    tankShell.userData = bodyUserData;
    rootGroup.add(tankShell);
    interactiveMeshes.push(tankShell);

    // Horizontal Corrugated Tank Ribs (Classic Indian Overhead Sintex-style silhouette)
    const ribMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.38, metalness: 0.16, transparent: true })
    );
    [0.36, 0.64, 0.92, 1.18].forEach((ry) => {
      const rib = new THREE.Mesh(ribGeo, ribMat);
      rib.rotation.x = Math.PI / 2;
      rib.position.y = ry;
      rootGroup.add(rib);
    });

    const lid = new THREE.Mesh(tankLidGeo, ribMat);
    lid.position.y = 1.3;
    lid.castShadow = castShadows;
    rootGroup.add(lid);

    // Animated Blue Interior Water Mesh (Scales vertically from base of tank!)
    const waterH = 0.96;
    const waterGeo = new THREE.CylinderGeometry(0.47, 0.47, waterH, 24);
    waterGeo.translate(0, waterH / 2, 0);
    disposablesGeo.push(waterGeo);
    const waterMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        emissive: 0x0369a1,
        emissiveIntensity: 0.28,
        roughness: 0.14,
        metalness: 0.08,
        transparent: true,
        opacity: 0.82,
      })
    );
    waterColumnMesh = new THREE.Mesh(waterGeo, waterMat);
    waterColumnMesh.position.y = 0.2;
    rootGroup.add(waterColumnMesh);

    const surfaceGeo = new THREE.CircleGeometry(0.468, 24);
    disposablesGeo.push(surfaceGeo);
    const surfaceMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.4,
        roughness: 0.08,
        transparent: true,
        opacity: 0.9,
      })
    );
    waterSurfaceMesh = new THREE.Mesh(surfaceGeo, surfaceMat);
    waterSurfaceMesh.rotation.x = -Math.PI / 2;
    waterSurfaceMesh.position.y = 0.2 + waterH * 0.7;
    rootGroup.add(waterSurfaceMesh);

    // TANK_LINK_LOST Warning Ring around top rim
    const warnRingGeo = new THREE.TorusGeometry(0.58, 0.03, 12, 32);
    disposablesGeo.push(warnRingGeo);
    tankLinkLostMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 1.5,
        roughness: 0.2,
        transparent: true,
      })
    );
    tankLinkLostRing = new THREE.Mesh(warnRingGeo, tankLinkLostMat);
    tankLinkLostRing.rotation.x = Math.PI / 2;
    tankLinkLostRing.position.y = 1.24;
    tankLinkLostRing.visible = false;
    rootGroup.add(tankLinkLostRing);

    // Floating Live % / L/min / RSSI OLED Telemetry Display Mounted Above Tank
    oledScreen = createCachedCanvasScreen(512, 224, maxAnisotropy, disposablesTex);
    const boardGeo = new THREE.BoxGeometry(0.76, 0.34, 0.028);
    const boardFaceGeo = new THREE.PlaneGeometry(0.72, 0.3);
    disposablesGeo.push(boardGeo, boardFaceGeo);
    const boardMesh = new THREE.Mesh(
      boardGeo,
      trackMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.5, transparent: true }))
    );
    boardMesh.position.set(0, 1.56, 0.22);
    const boardFace = new THREE.Mesh(
      boardFaceGeo,
      (() => {
        const m = new THREE.MeshBasicMaterial({ map: oledScreen.texture, toneMapped: false });
        disposablesMat.push(m);
        return m;
      })()
    );
    boardFace.position.set(0, 1.56, 0.236);
    boardFace.userData = bodyUserData;
    rootGroup.add(boardMesh, boardFace);
    interactiveMeshes.push(boardFace);

    // Pedestal Pump Control Box Mounted on Front of Tank Base (Direct Clickable Pump Rocker!)
    const pumpBoxGroup = new THREE.Group();
    pumpBoxGroup.position.set(0, 0.44, 0.62);
    rootGroup.add(pumpBoxGroup);

    const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.44, 12);
    const boxGeo = new THREE.BoxGeometry(0.32, 0.3, 0.08);
    disposablesGeo.push(postGeo, boxGeo);
    const post = new THREE.Mesh(postGeo, standMat);
    post.position.y = -0.22;
    const pBox = new THREE.Mesh(
      boxGeo,
      trackMat(new THREE.MeshStandardMaterial({ color: plateColor, roughness: 0.32, metalness: 0.16, transparent: true }))
    );
    pBox.castShadow = castShadows;
    pBox.userData = bodyUserData;
    pumpBoxGroup.add(post, pBox);
    interactiveMeshes.push(pBox);

    const { container: pumpRockerGroup, runtime: pumpRockerRuntime } = buildPhysicalRocker({
      capKey: pumpCap.key,
      label: pumpCap.label,
      deviceId: device.device_id,
      roomId,
      floorId,
      width: 0.11,
      height: 0.18,
      accentOnHex: 0x0ea5e9,
      disposablesGeo,
      disposablesMat,
      trackMat,
      interactiveMeshes,
    });
    pumpRockerGroup.position.set(0, 0, 0.042);
    pumpBoxGroup.add(pumpRockerGroup);
    rockers.push(pumpRockerRuntime);

    // G10 Dry-Run Safety Shroud over the Pump Control Box
    faultShroud = createG10FaultShroud({
      width: 0.34,
      height: 0.32,
      depth: 0.11,
      zOffset: 0.055,
      maxAnisotropy,
      disposablesGeo,
      disposablesMat,
      disposablesTex,
    });
    pumpBoxGroup.add(faultShroud.group);
  }

  // ==========================================================================
  // 6. 3D SMART HUB WITH LIVE OLED DISPLAY (HUB-01)
  // ==========================================================================
  else if (archetype === 'hub_oled') {
    focusDistance = 1.25;
    focusTargetOffsetY = 0.24;

    // Slim tabletop console pedestal
    const tableGeo = new THREE.BoxGeometry(0.62, 0.34, 0.38);
    const chassisGeo = new THREE.BoxGeometry(0.42, 0.11, 0.28);
    const ledRingGeo = new THREE.BoxGeometry(0.43, 0.014, 0.29);
    const screenHoodGeo = new THREE.BoxGeometry(0.36, 0.2, 0.03);
    disposablesGeo.push(tableGeo, chassisGeo, ledRingGeo, screenHoodGeo);

    const tableMat = trackMat(
      new THREE.MeshStandardMaterial({ color: isLightTheme ? 0xcbd5e1 : 0x334155, roughness: 0.6, transparent: true })
    );
    const chassisMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.26, metalness: 0.68, transparent: true })
    );
    const ledMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x0891b2,
        emissiveIntensity: 1.15,
        roughness: 0.2,
        transparent: true,
      })
    );

    const table = new THREE.Mesh(tableGeo, tableMat);
    table.position.y = 0.17;
    table.castShadow = castShadows;
    table.receiveShadow = castShadows;
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.395;
    chassis.castShadow = castShadows;
    chassis.userData = bodyUserData;
    const ledRing = new THREE.Mesh(ledRingGeo, ledMat);
    ledRing.position.y = 0.35;

    // Angled OLED Telemetry Display Screen (G12 Read-Only)
    const hoodGroup = new THREE.Group();
    hoodGroup.position.set(0, 0.52, -0.02);
    hoodGroup.rotation.x = -0.22;

    const hood = new THREE.Mesh(screenHoodGeo, chassisMat);
    oledScreen = createCachedCanvasScreen(512, 256, maxAnisotropy, disposablesTex);
    const scrGeo = new THREE.PlaneGeometry(0.33, 0.175);
    disposablesGeo.push(scrGeo);
    const scrMat = new THREE.MeshBasicMaterial({ map: oledScreen.texture, toneMapped: false });
    disposablesMat.push(scrMat);
    const scr = new THREE.Mesh(scrGeo, scrMat);
    scr.position.z = 0.017;
    scr.userData = {
      kind: 'device_control',
      deviceId: device.device_id,
      roomId,
      floorId,
      controlKind: 'readonly_screen',
      readOnly: true,
      label: `${device.name} Status`,
    } satisfies HardwareControlUserData;

    hoodGroup.add(hood, scr);
    rootGroup.add(table, chassis, ledRing, hoodGroup);
    interactiveMeshes.push(chassis, scr);
  }

  // ==========================================================================
  // 7. COMPOSITE 3D VEHICLE UNIT (VEH-01)
  // ==========================================================================
  else if (archetype === 'vehicle_unit') {
    focusDistance = 2.8;
    focusTargetOffsetY = 0.45;

    const chassisGeo = new THREE.BoxGeometry(1.12, 0.36, 2.2);
    const cabinGeo = new THREE.BoxGeometry(0.96, 0.34, 1.12);
    const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.14, 18);
    const headlightGeo = new THREE.BoxGeometry(0.22, 0.08, 0.04);
    const beaconGeo = new THREE.BoxGeometry(0.56, 0.045, 0.12);
    disposablesGeo.push(chassisGeo, cabinGeo, wheelGeo, headlightGeo, beaconGeo);

    const bodyMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.24, metalness: 0.62, transparent: true })
    );
    const glassMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.12, metalness: 0.4, transparent: true })
    );
    const tireMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85, metalness: 0.08, transparent: true })
    );
    const lampMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfde047,
        emissiveIntensity: 0.95,
        roughness: 0.2,
        transparent: true,
      })
    );
    vehicleBeaconMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 1.1,
        roughness: 0.2,
        transparent: true,
      })
    );

    const chassis = new THREE.Mesh(chassisGeo, bodyMat);
    chassis.position.y = 0.32;
    chassis.castShadow = castShadows;
    chassis.userData = bodyUserData;
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 0.64, -0.1);
    cabin.castShadow = castShadows;
    cabin.userData = bodyUserData;
    const beacon = new THREE.Mesh(beaconGeo, vehicleBeaconMat);
    beacon.position.set(0, 0.84, -0.1);

    rootGroup.add(chassis, cabin, beacon);
    interactiveMeshes.push(chassis, cabin);

    // 4 Wheels
    const wheelOffsets: Array<[number, number]> = [
      [-0.56, 0.68],
      [0.56, 0.68],
      [-0.56, -0.68],
      [0.56, -0.68],
    ];
    wheelOffsets.forEach(([wx, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, tireMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.2, wz);
      rootGroup.add(wheel);
    });

    // Headlights
    [-0.38, 0.38].forEach((hx) => {
      const lamp = new THREE.Mesh(headlightGeo, lampMat);
      lamp.position.set(hx, 0.36, 1.1);
      rootGroup.add(lamp);
    });

    // Floating Vehicle Telemetry HUD Board above hood
    oledScreen = createCachedCanvasScreen(512, 160, maxAnisotropy, disposablesTex);
    const hudGeo = new THREE.PlaneGeometry(0.95, 0.3);
    disposablesGeo.push(hudGeo);
    const hudMat = new THREE.MeshBasicMaterial({ map: oledScreen.texture, toneMapped: false });
    disposablesMat.push(hudMat);
    const hud = new THREE.Mesh(hudGeo, hudMat);
    hud.position.set(0, 1.12, 0.2);
    hud.userData = {
      kind: 'device_control',
      deviceId: device.device_id,
      roomId,
      floorId,
      controlKind: 'readonly_screen',
      readOnly: true,
      label: `${device.name} Telemetry`,
    } satisfies HardwareControlUserData;
    rootGroup.add(hud);
    interactiveMeshes.push(hud);
  }

  // ==========================================================================
  // 8. PHASE 2/3 GENERIC FALLBACK: 3D SMART LOCK HANDLE (lock_state)
  // ==========================================================================
  else if (archetype === 'smart_lock') {
    const lockCap =
      (device.info?.capabilities ?? []).find((c) => c.type === 'lock_state') ??
      ({ key: 'locked', type: 'lock_state', label: 'Smart Lock' } as DeviceCapability);

    focusDistance = 1.1;
    const escGeo = new THREE.BoxGeometry(0.11, 0.38, 0.036);
    const padGeo = new THREE.BoxGeometry(0.082, 0.14, 0.01);
    const leverGeo = new THREE.BoxGeometry(0.16, 0.032, 0.028);
    disposablesGeo.push(escGeo, padGeo, leverGeo);

    const metalMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.24, metalness: 0.78, transparent: true })
    );
    const padMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.16, metalness: 0.35, transparent: true })
    );

    const esc = new THREE.Mesh(escGeo, metalMat);
    esc.position.z = 0.018;
    esc.userData = bodyUserData;
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(0, 0.09, 0.038);

    lockLeverPivot = new THREE.Group();
    lockLeverPivot.position.set(-0.02, -0.04, 0.048);
    const lever = new THREE.Mesh(leverGeo, metalMat);
    lever.position.x = 0.06;
    lever.userData = {
      kind: 'device_control',
      deviceId: device.device_id,
      roomId,
      floorId,
      controlKind: 'rocker',
      capKey: lockCap.key,
      label: lockCap.label,
    } satisfies HardwareControlUserData;
    lockLeverPivot.add(lever);

    rootGroup.add(esc, pad, lockLeverPivot);
    interactiveMeshes.push(esc, lever);

    faultShroud = createG10FaultShroud({
      width: 0.24,
      height: 0.42,
      depth: 0.12,
      zOffset: 0.06,
      maxAnisotropy,
      disposablesGeo,
      disposablesMat,
      disposablesTex,
    });
    rootGroup.add(faultShroud.group);
  }

  // ==========================================================================
  // 9. PHASE 2/3 GENERIC FALLBACK: 3D MINI SECURITY CAMERA (video_stream)
  // ==========================================================================
  else if (archetype === 'security_cam') {
    focusDistance = 1.15;
    const baseGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.03, 18);
    const armGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.12, 12);
    const bodyGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.18, 20);
    const lensGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.02, 18);
    disposablesGeo.push(baseGeo, armGeo, bodyGeo, lensGeo);

    const camMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.28, metalness: 0.2, transparent: true })
    );
    const lensMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.08, metalness: 0.85, transparent: true })
    );

    const base = new THREE.Mesh(baseGeo, camMat);
    base.rotation.x = Math.PI / 2;
    base.position.z = 0.015;
    const arm = new THREE.Mesh(armGeo, camMat);
    arm.rotation.x = Math.PI / 2;
    arm.position.z = 0.075;
    const barrel = new THREE.Mesh(bodyGeo, camMat);
    barrel.rotation.x = Math.PI / 2 + 0.18;
    barrel.position.set(0, -0.02, 0.16);
    barrel.userData = {
      kind: 'device_control',
      deviceId: device.device_id,
      roomId,
      floorId,
      controlKind: 'readonly_screen',
      readOnly: true,
      label: device.name,
    } satisfies HardwareControlUserData;
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.rotation.x = Math.PI / 2 + 0.18;
    lens.position.set(0, -0.036, 0.25);

    rootGroup.add(base, arm, barrel, lens);
    interactiveMeshes.push(barrel);
  }

  // ==========================================================================
  // 10. G12 READ-ONLY 3D SENSOR POD / LIVE LCD DISPLAY (All Other Modules)
  // ==========================================================================
  else {
    focusDistance = 1.15;
    const plateW = 0.36;
    const plateH = 0.28;
    buildModularPlate(plateW, plateH, 0.032);

    oledScreen = createCachedCanvasScreen(512, 320, maxAnisotropy, disposablesTex);
    const scrGeo = new THREE.PlaneGeometry(0.28, 0.19);
    disposablesGeo.push(scrGeo);
    const scrMat = new THREE.MeshBasicMaterial({ map: oledScreen.texture, toneMapped: false });
    disposablesMat.push(scrMat);
    const scr = new THREE.Mesh(scrGeo, scrMat);
    scr.position.z = 0.044;
    // G12 strict read-only screen: NEVER emits .../cmd
    scr.userData = {
      kind: 'device_control',
      deviceId: device.device_id,
      roomId,
      floorId,
      controlKind: 'readonly_screen',
      readOnly: true,
      label: `${device.name} (Read-Only Sensor)`,
    } satisfies HardwareControlUserData;
    rootGroup.add(scr);
    interactiveMeshes.push(scr);
  }

  // ==========================================================================
  // Live Telemetry & State Updater (Dirty-Flag CanvasTexture Redraws)
  // ==========================================================================
  const updateFromDevice = (dev: VirtualDeviceInstance, tariffInr: number) => {
    const isFaulted = dev.state.fault !== null && dev.state.fault !== undefined;
    const stateMap = dev.state.state || {};

    // 1. Update Universal G10 Latched Fault Shroud
    if (faultShroud) {
      faultShroud.update(isFaulted ? String(dev.state.fault) : null);
    }

    // 2. Update Physical Rockers (G10 fault forces rockers visually OFF!)
    let activeSwitchCount = 0;
    for (const r of rockers) {
      const isOn = !isFaulted && Boolean(stateMap[r.capKey]);
      if (isOn) activeSwitchCount++;
      r.targetAngle = isOn ? 0.24 : -0.24;
      r.ledMat.emissiveIntensity = isOn ? 1.55 : 0.08;
      r.ledMat.color.setHex(isOn ? r.ledMat.emissive.getHex() : 0x64748b);
    }

    // Room lighting cone intensity from switchboard loads
    if (lightConeMat && lightFixtureMat) {
      targetLightLevel = isFaulted ? 0 : Math.min(1, activeSwitchCount / Math.max(1, Math.min(2, rockers.length)));
    }

    // 3. Update Rotary Fan Dials & Overhead Ceiling Fan Speed
    for (const dial of fanDials) {
      const spd = isFaulted ? 0 : Math.max(0, Math.min(4, Math.round(Number(stateMap[dial.capKey] ?? 0))));
      // Needle points to active step pip (0 at +130 deg -> 4 at -130 deg, matching pip layout)
      dial.targetAngle = THREE.MathUtils.degToRad(40 - spd * 65);
      dial.pipMats.forEach((mat, idx) => {
        const active = idx === spd;
        const lit = spd > 0 && idx > 0 && idx <= spd;
        mat.emissiveIntensity = active ? 1.75 : lit ? 0.85 : 0.08;
        mat.color.setHex(active ? 0x38bdf8 : lit ? 0x0ea5e9 : 0x475569);
      });
      targetFanSpeed = spd;
    }

    // 4. Update Tactile Sliders
    for (const sl of sliders) {
      const raw = isFaulted ? sl.min : Number(stateMap[sl.capKey] ?? sl.min);
      const span = Math.max(1, sl.max - sl.min);
      sl.targetNorm = THREE.MathUtils.clamp((raw - sl.min) / span, 0, 1);
    }

    // 5. Smart Lock Lever Angle
    if (lockLeverPivot) {
      const locked = Boolean(stateMap.locked ?? stateMap.lock ?? true);
      targetLockAngle = locked ? 0 : -0.35;
    }

    // 6. Archetype-Specific Live CanvasTexture Screens & Water/Vehicle States
    if (archetype === 'switchboard' && oledScreen) {
      const p = Number((dev.telemetry as PowerTelemetryPayload)?.p ?? 0);
      const activeTags = rockers
        .map((r) => `${r.capKey.toUpperCase()}:${!isFaulted && Boolean(stateMap[r.capKey]) ? 'ON' : '--'}`)
        .join(' ');
      const sig = `${dev.module_code}|${p.toFixed(0)}|${activeTags}|${dev.state.fault ?? 'ok'}`;
      oledScreen.redrawIfChanged(sig, (ctx, w, h) => {
        ctx.fillStyle = '#0f172a';
        drawRoundedRect(ctx, 0, 0, w, h, 14);
        ctx.fill();
        ctx.strokeStyle = isFaulted ? '#f43f5e' : '#0284c7';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = '700 24px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${dev.module_code} · ${dev.name.slice(0, 14)}`, 18, 36);

        ctx.fillStyle = '#f8fafc';
        ctx.font = '700 26px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(p)} W`, w - 18, 36);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '600 20px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(activeTags, 18, 74);
      });
    } else if (archetype === 'fan_regulator' && oledScreen) {
      const fanSpd = isFaulted ? 0 : Math.round(Number(stateMap.fan_speed ?? 0));
      const dim = isFaulted ? 0 : Math.round(Number(stateMap.dimmer_pct ?? 0));
      const p = Number((dev.telemetry as PowerTelemetryPayload)?.p ?? 0);
      const sig = `${fanSpd}|${dim}|${p.toFixed(0)}|${dev.state.fault ?? 'ok'}`;
      oledScreen.redrawIfChanged(sig, (ctx, w, h) => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = isFaulted ? '#f43f5e' : '#0ea5e9';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, w - 4, h - 4);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '700 28px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`FAN ${fanSpd}/4`, 20, 44);

        ctx.fillStyle = '#fde68a';
        ctx.textAlign = 'center';
        ctx.fillText(`DIM ${dim}%`, w / 2 + 12, 44);

        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(p)} W`, w - 20, 44);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 18px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('TAP DIAL STEPS OR DRAG SLIDER', 20, 78);
      });
    } else if (archetype === 'slider_dimmer' && oledScreen) {
      const sl = sliders[0];
      const val = sl ? Math.round(Number(stateMap[sl.capKey] ?? sl.min)) : 0;
      const sig = `${dev.module_code}|${val}`;
      oledScreen.redrawIfChanged(sig, (ctx, w, h) => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#38bdf8';
        ctx.font = '800 44px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${val}%`, w / 2, 62);
      });
    } else if (archetype === 'smart_plug_oled' && oledScreen) {
      const pt = dev.telemetry as PowerTelemetryPayload;
      const p = Number(pt?.p ?? 0);
      const v = Number(pt?.v ?? 230);
      const rt = Number(pt?.runtime_min ?? 0);
      const maxRt = Number(dev.config?.guardrails?.max_runtime_min ?? 45);
      const dailyInr = Math.round((p / 1000) * 1.5 * Math.max(1, tariffInr));
      const isOn = !isFaulted && Boolean(stateMap.ch1);
      const sig = `${p.toFixed(0)}|${v.toFixed(0)}|${dailyInr}|${rt}|${maxRt}|${isOn}|${dev.state.fault ?? 'ok'}`;
      oledScreen.redrawIfChanged(sig, (ctx, w, h) => {
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = isFaulted ? '#f43f5e' : isOn ? '#f59e0b' : '#334155';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);

        // Header line
        ctx.fillStyle = isFaulted ? '#fb7185' : isOn ? '#fbbf24' : '#94a3b8';
        ctx.font = '700 28px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`16A SMART · ${isFaulted ? 'LOCKED' : isOn ? 'HEATING' : 'STANDBY'}`, 24, 52);

        // Main Hero Wattage
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 84px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(`${Math.round(p)} W`, 24, 158);

        // Divider
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(24, 186, w - 48, 4);

        // Voltage & Daily Cost Row (requested format: 1982 W | 231V | ₹193/d)
        ctx.fillStyle = '#38bdf8';
        ctx.font = '700 38px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(`${Math.round(v)} V`, 24, 246);

        ctx.fillStyle = '#34d399';
        ctx.textAlign = 'right';
        ctx.fillText(`₹${dailyInr}/d`, w - 24, 246);

        // Runtime guardrail bar
        ctx.textAlign = 'left';
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '600 26px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(`RUN ${rt}/${maxRt}m`, 24, 310);

        const barW = w - 48;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(24, 330, barW, 20);
        const pct = Math.max(0, Math.min(1, rt / Math.max(1, maxRt)));
        ctx.fillStyle = pct > 0.85 || isFaulted ? '#f43f5e' : '#f59e0b';
        ctx.fillRect(24, 330, barW * pct, 20);
      });
    } else if (archetype === 'water_tank') {
      const wt = dev.telemetry as WaterTelemetryPayload;
      const pct = Math.max(0, Math.min(100, Number(wt?.level_pct ?? 65)));
      const flow = Number(wt?.flow_lpm ?? 0);
      const rssi = Number(wt?.tank_rssi ?? -72);
      const linkOk = wt?.tank_link !== false;
      const pumpOn = !isFaulted && Boolean(stateMap.pump_on);

      targetWaterPct = pct / 100;
      isTankLinkLost = !linkOk;
      if (tankLinkLostRing) {
        tankLinkLostRing.visible = isTankLinkLost;
      }

      if (oledScreen) {
        const sig = `${pct.toFixed(0)}|${flow.toFixed(1)}|${rssi}|${linkOk}|${pumpOn}|${dev.state.fault ?? 'ok'}`;
        oledScreen.redrawIfChanged(sig, (ctx, w, h) => {
          ctx.fillStyle = '#020617';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = !linkOk ? '#f59e0b' : isFaulted ? '#f43f5e' : '#0ea5e9';
          ctx.lineWidth = 8;
          ctx.strokeRect(4, 4, w - 8, h - 8);

          ctx.fillStyle = '#38bdf8';
          ctx.font = '800 66px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`${Math.round(pct)}%`, 24, 86);

          ctx.fillStyle = pumpOn ? '#34d399' : '#94a3b8';
          ctx.font = '700 32px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.textAlign = 'right';
          ctx.fillText(`${flow.toFixed(1)} L/m`, w - 24, 62);
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '600 24px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillText(pumpOn ? 'PUMP ON' : 'PUMP IDLE', w - 24, 102);

          if (!linkOk) {
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(20, 126, w - 40, 72);
            ctx.fillStyle = '#0f172a';
            ctx.font = '800 30px ui-monospace, SFMono-Regular, Menlo, monospace';
            ctx.textAlign = 'center';
            ctx.fillText('TANK_LINK_LOST', w / 2, 173);
          } else {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '600 26px ui-monospace, SFMono-Regular, Menlo, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`RSSI ${rssi} dBm`, 24, 176);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#34d399';
            ctx.fillText('SUB-GHZ OK', w - 24, 176);
          }
        });
      }
    } else if (archetype === 'hub_oled' && oledScreen) {
      const ht = dev.telemetry as HubTelemetryPayload;
      const clients = Number(ht?.connected_devices ?? dev.info?.local_clients ?? 5);
      const uplink = ht?.cloud_uplink !== false;
      const ip = ht?.local_ip ?? '192.168.1.50';
      const sig = `${clients}|${uplink}|${ip}|${dev.state.operation_mode}`;
      oledScreen.redrawIfChanged(sig, (ctx, w, h) => {
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);

        ctx.fillStyle = '#22d3ee';
        ctx.font = '800 34px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'left';
        ctx.fillText('DD OODLE HUB-01', 24, 54);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 54px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(`${clients} Clients`, 24, 134);

        ctx.fillStyle = uplink ? '#34d399' : '#fbbf24';
        ctx.font = '700 30px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(uplink ? 'ETH OK · CLOUD' : 'LOCAL LAN HUB', 24, 192);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 24px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(ip, 24, 232);
      });
    } else if (archetype === 'vehicle_unit' && oledScreen) {
      const vt = dev.telemetry as VehicleTelemetryPayload;
      const speed = Number(vt?.speed_kmh ?? 0);
      const ign = Boolean(vt?.ignition ?? dev.state.ignition);
      const immob = vt?.immobilize_status ?? dev.state.immobilize ?? 'RELEASED';
      const bat = Number(vt?.bat_pct ?? 95);

      if (vehicleBeaconMat) {
        const isImmob = immob === 'ENGAGED';
        vehicleBeaconMat.color.setHex(isImmob ? 0xf43f5e : ign ? 0x38bdf8 : 0x10b981);
        vehicleBeaconMat.emissive.setHex(isImmob ? 0xe11d48 : ign ? 0x0284c7 : 0x059669);
      }

      const sig = `${speed.toFixed(0)}|${ign}|${immob}|${bat}`;
      oledScreen.redrawIfChanged(sig, (ctx, w, h) => {
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = immob === 'ENGAGED' ? '#f43f5e' : '#0ea5e9';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);

        ctx.fillStyle = '#f8fafc';
        ctx.font = '800 36px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`VEH-01 · ${ign ? `${Math.round(speed)} km/h` : 'PARKED'}`, 24, 62);

        ctx.fillStyle = immob === 'ENGAGED' ? '#fb7185' : '#34d399';
        ctx.font = '700 30px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(immob === 'ENGAGED' ? 'IMMOBILIZER ENGAGED' : `IGN ${ign ? 'ON' : 'OFF'} · BAT ${bat}%`, 24, 122);
      });
    } else if (archetype === 'sensor_pod' && oledScreen) {
      // G12 Read-only sensor display pod — renders up to 2 primary sensor readings dynamically
      const sensorCaps = (dev.info?.capabilities ?? []).filter(
        (c) => c.type === 'sensor' || c.type === 'sensor_gauge' || c.type === 'vitals'
      );
      const telemetryObj = dev.telemetry as Record<string, unknown>;
      const line1Cap = sensorCaps[0];
      const line2Cap = sensorCaps[1];
      const v1 = line1Cap ? telemetryObj?.[line1Cap.key] ?? stateMap[line1Cap.key] ?? '--' : '--';
      const v2 = line2Cap ? telemetryObj?.[line2Cap.key] ?? stateMap[line2Cap.key] ?? '--' : '';
      const text1 = line1Cap ? `${v1}${line1Cap.unit ? ` ${line1Cap.unit}` : ''}` : dev.state.operation_mode;
      const text2 = line2Cap ? `${v2}${line2Cap.unit ? ` ${line2Cap.unit}` : ''}` : 'READ-ONLY SENSOR';
      const sig = `${dev.module_code}|${text1}|${text2}`;
      oledScreen.redrawIfChanged(sig, (ctx, w, h) => {
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 28px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${dev.module_code} · ${dev.name.slice(0, 14)}`, 24, 56);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 66px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(text1, 24, 164);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '700 36px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(text2, 24, 246);

        ctx.fillStyle = '#64748b';
        ctx.font = '600 20px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText('G12 DISPLAY-ONLY SENSOR', 24, 294);
      });
    }
  };

  const previewSliderValue = (capKey: string, value: number) => {
    for (const sl of sliders) {
      if (sl.capKey === capKey) {
        const span = Math.max(1, sl.max - sl.min);
        sl.targetNorm = THREE.MathUtils.clamp((value - sl.min) / span, 0, 1);
      }
    }
  };

  // Run initial state sync immediately
  updateFromDevice(device, 8.5);

  // Per-frame physical animation (Zero GC)
  const animate = (dtSec: number, elapsedSec: number) => {
    const dt = Math.min(0.05, Math.max(0.001, dtSec));

    for (const r of rockers) {
      r.currentAngle = THREE.MathUtils.damp(r.currentAngle, r.targetAngle, 16, dt);
      r.pivot.rotation.x = r.currentAngle;
    }

    for (const d of fanDials) {
      d.currentAngle = THREE.MathUtils.damp(d.currentAngle, d.targetAngle, 14, dt);
      d.knobPivot.rotation.z = d.currentAngle;
    }

    for (const sl of sliders) {
      sl.currentNorm = THREE.MathUtils.damp(sl.currentNorm, sl.targetNorm, 18, dt);
      const yPos = -sl.trackLength / 2 + sl.currentNorm * sl.trackLength;
      sl.thumbMesh.position.y = yPos;
      sl.fillMesh.scale.y = Math.max(0.02, sl.currentNorm);
    }

    if (ceilingFanBlades) {
      currentFanSpeed = THREE.MathUtils.damp(currentFanSpeed, targetFanSpeed, 3.2, dt);
      if (currentFanSpeed > 0.01) {
        ceilingFanBlades.rotation.y += currentFanSpeed * dt * 4.4;
      }
    }

    if (lightConeMat && lightFixtureMat) {
      currentLightLevel = THREE.MathUtils.damp(currentLightLevel, targetLightLevel, 8, dt);
      lightConeMat.opacity = currentLightLevel * (isLightTheme ? 0.14 : 0.22);
      lightFixtureMat.emissiveIntensity = 0.12 + currentLightLevel * 1.4;
    }

    if (waterColumnMesh && waterSurfaceMesh) {
      currentWaterPct = THREE.MathUtils.damp(currentWaterPct, targetWaterPct, 4.5, dt);
      const clampedScale = Math.max(0.04, Math.min(1, currentWaterPct));
      waterColumnMesh.scale.y = clampedScale;
      waterSurfaceMesh.position.y = 0.2 + 0.96 * clampedScale + Math.sin(elapsedSec * 2.4) * 0.006;
    }

    if (tankLinkLostRing && tankLinkLostMat && isTankLinkLost) {
      tankLinkLostMat.emissiveIntensity = 1.0 + Math.sin(elapsedSec * 5.0) * 0.65;
    }

    if (lockLeverPivot) {
      lockLeverPivot.rotation.z = THREE.MathUtils.damp(lockLeverPivot.rotation.z, targetLockAngle, 14, dt);
    }

    if (faultShroud) {
      faultShroud.animate(elapsedSec);
    }
  };

  return {
    deviceId: device.device_id,
    roomId,
    floorId,
    archetype,
    rootGroup,
    companionGroup,
    frontNormal,
    focusDistance,
    focusTargetOffsetY,
    mountWallKey,
    interactiveMeshes,
    materials: trackedStandardMats,
    updateFromDevice,
    previewSliderValue,
    animate,
    dispose: () => {
      disposablesGeo.forEach((g) => g.dispose());
      disposablesMat.forEach((m) => m.dispose());
      disposablesTex.forEach((t) => t.dispose());
    },
  };
}
