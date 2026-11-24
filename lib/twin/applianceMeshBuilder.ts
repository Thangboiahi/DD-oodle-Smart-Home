/**
 * DD oodle Smart Home — Phase 11C Physical Appliances & Live X-Ray Wiring 3D Builder
 *
 * Renders physical 3D appliances (`ceiling_light`, `dimmer_light`, `ceiling_fan`,
 * `wall_fan`, `geyser`, `ac`, `exhaust`, `water_tank`), syncs live state from
 * bound real device channels, and draws X-Ray conduit wiring from appliances to
 * their linked hardware switchboards/relays.
 */

import * as THREE from 'three';
import { Layout3DAppliance } from '@/lib/protocol/contract';
import { VirtualDeviceInstance } from '@/lib/simulator/types';
import { FloorId } from '@/lib/twin/architectureBlueprints';
import { HardwareModelRuntime } from '@/lib/twin/hardwareModelRegistry';

export interface ApplianceControlUserData {
  kind: 'appliance';
  applianceId: string;
  floorId: FloorId;
  roomId: string;
}

export interface ApplianceModelRuntime {
  applianceId: string;
  floorId: FloorId;
  roomId: string;
  rootGroup: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  interactiveMeshes: THREE.Mesh[];
  updateFromDevices: (devices: Record<string, VirtualDeviceInstance>) => void;
  animate: (dtSec: number, elapsedSec: number) => void;
  dispose: () => void;
}

export interface XRayWiringRuntime {
  group: THREE.Group;
  dispose: () => void;
}

function readChannelNormalized(
  appliance: Layout3DAppliance,
  devices: Record<string, VirtualDeviceInstance>
): { linked: boolean; active: boolean; levelRatio: number; waterPct: number | null } {
  if (!appliance.linked_device_id) {
    return { linked: false, active: false, levelRatio: 0, waterPct: null };
  }
  const dev = devices[appliance.linked_device_id];
  if (!dev) {
    return { linked: false, active: false, levelRatio: 0, waterPct: null };
  }
  const waterPct =
    typeof (dev.telemetry as { level_pct?: unknown })?.level_pct === 'number'
      ? Number((dev.telemetry as { level_pct: number }).level_pct)
      : null;

  const key = appliance.linked_channel_key;
  if (!key) {
    const anyOn = Object.values(dev.state.state).some(
      (v) => v === true || (typeof v === 'number' && v > 0)
    );
    return { linked: true, active: anyOn, levelRatio: anyOn ? 1 : 0, waterPct };
  }

  const raw = dev.state.state[key];
  if (typeof raw === 'boolean') {
    return { linked: true, active: raw, levelRatio: raw ? 1 : 0, waterPct };
  }
  if (typeof raw === 'number') {
    const cap = dev.info?.capabilities?.find((c) => c.key === key);
    const maxVal = cap && 'max' in cap && typeof cap.max === 'number' ? cap.max : raw <= 4 ? 4 : 100;
    const ratio = maxVal > 0 ? Math.max(0, Math.min(1, raw / maxVal)) : 0;
    return { linked: true, active: raw > 0, levelRatio: ratio, waterPct };
  }
  return { linked: true, active: false, levelRatio: 0, waterPct };
}

export function buildPhysicalApplianceModel(params: {
  appliance: Layout3DAppliance;
  mountPositionLocal: THREE.Vector3;
  facingYaw: number;
  isLightTheme: boolean;
  isSelected: boolean;
  castShadows: boolean;
}): ApplianceModelRuntime {
  const { appliance, mountPositionLocal, facingYaw, isLightTheme, isSelected, castShadows } = params;

  const disposablesGeo: THREE.BufferGeometry[] = [];
  const disposablesMat: THREE.Material[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const interactiveMeshes: THREE.Mesh[] = [];

  const trackMat = (mat: THREE.MeshStandardMaterial) => {
    disposablesMat.push(mat);
    materials.push(mat);
    return mat;
  };

  const rootGroup = new THREE.Group();
  rootGroup.position.copy(mountPositionLocal);
  rootGroup.rotation.y = facingYaw;

  const bodyColor = isLightTheme ? 0xf8fafc : 0xe2e8f0;
  const trimColor = isLightTheme ? 0x475569 : 0x334155;
  const bodyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.4,
      metalness: 0.15,
      transparent: true,
      opacity: 1,
    })
  );
  const trimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: trimColor,
      roughness: 0.35,
      metalness: 0.45,
      transparent: true,
      opacity: 1,
    })
  );
  const emissiveMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.15,
      roughness: 0.25,
      transparent: true,
      opacity: 1,
    })
  );

  let spinRotor: THREE.Group | null = null;
  let acLouver: THREE.Mesh | null = null;
  let waterColMesh: THREE.Mesh | null = null;
  let waterColMat: THREE.MeshStandardMaterial | null = null;
  let targetSpinRate = 0;
  let currentSpinRate = 0;
  let isActive = false;
  let currentLevelRatio = 0;

  const tagMesh = (mesh: THREE.Mesh) => {
    mesh.userData = {
      kind: 'appliance',
      applianceId: appliance.id,
      floorId: appliance.floor_id,
      roomId: appliance.room_id,
    } satisfies ApplianceControlUserData;
    interactiveMeshes.push(mesh);
    return mesh;
  };

  if (appliance.kind === 'ceiling_light' || appliance.kind === 'dimmer_light') {
    const isDimmer = appliance.kind === 'dimmer_light';
    const bezelGeo = new THREE.CylinderGeometry(isDimmer ? 0.2 : 0.16, isDimmer ? 0.22 : 0.17, 0.04, 20);
    disposablesGeo.push(bezelGeo);
    const bezel = tagMesh(new THREE.Mesh(bezelGeo, trimMat));
    bezel.castShadow = castShadows;
    rootGroup.add(bezel);

    const lensGeo = new THREE.CylinderGeometry(isDimmer ? 0.16 : 0.13, isDimmer ? 0.16 : 0.13, 0.02, 20);
    disposablesGeo.push(lensGeo);
    const lens = tagMesh(new THREE.Mesh(lensGeo, emissiveMat));
    lens.position.y = -0.025;
    rootGroup.add(lens);
  } else if (appliance.kind === 'ceiling_fan') {
    const rodGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.18, 12);
    disposablesGeo.push(rodGeo);
    const rod = tagMesh(new THREE.Mesh(rodGeo, trimMat));
    rod.position.y = 0.08;
    rootGroup.add(rod);

    const motorGeo = new THREE.CylinderGeometry(0.11, 0.12, 0.07, 18);
    disposablesGeo.push(motorGeo);
    const motor = tagMesh(new THREE.Mesh(motorGeo, bodyMat));
    motor.castShadow = castShadows;
    rootGroup.add(motor);

    const rotor = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(0.42, 0.015, 0.085);
    disposablesGeo.push(bladeGeo);
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Group();
      arm.rotation.y = (i * Math.PI * 2) / 3;
      const blade = tagMesh(new THREE.Mesh(bladeGeo, bodyMat));
      blade.position.x = 0.27;
      blade.rotation.x = 0.12;
      blade.castShadow = castShadows;
      arm.add(blade);
      rotor.add(arm);
    }
    rootGroup.add(rotor);
    spinRotor = rotor;
  } else if (appliance.kind === 'wall_fan') {
    const baseGeo = new THREE.BoxGeometry(0.14, 0.18, 0.05);
    disposablesGeo.push(baseGeo);
    const base = tagMesh(new THREE.Mesh(baseGeo, trimMat));
    base.position.z = 0.025;
    rootGroup.add(base);

    const cageGeo = new THREE.TorusGeometry(0.17, 0.015, 10, 24);
    disposablesGeo.push(cageGeo);
    const cage = tagMesh(new THREE.Mesh(cageGeo, trimMat));
    cage.position.set(0, 0.05, 0.13);
    rootGroup.add(cage);

    const rotor = new THREE.Group();
    rotor.position.set(0, 0.05, 0.13);
    const bladeGeo = new THREE.BoxGeometry(0.24, 0.045, 0.014);
    disposablesGeo.push(bladeGeo);
    for (let i = 0; i < 3; i++) {
      const b = tagMesh(new THREE.Mesh(bladeGeo, bodyMat));
      b.rotation.z = (i * Math.PI) / 3;
      rotor.add(b);
    }
    rootGroup.add(rotor);
    spinRotor = rotor;
  } else if (appliance.kind === 'geyser') {
    const tankGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.44, 18);
    disposablesGeo.push(tankGeo);
    const tank = tagMesh(new THREE.Mesh(tankGeo, bodyMat));
    tank.position.z = 0.16;
    tank.castShadow = castShadows;
    rootGroup.add(tank);

    const bandGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.07, 18);
    disposablesGeo.push(bandGeo);
    const band = tagMesh(new THREE.Mesh(bandGeo, trimMat));
    band.position.set(0, -0.1, 0.16);
    rootGroup.add(band);

    const ledGeo = new THREE.SphereGeometry(0.022, 10, 10);
    disposablesGeo.push(ledGeo);
    const led = tagMesh(new THREE.Mesh(ledGeo, emissiveMat));
    led.position.set(0, -0.1, 0.325);
    rootGroup.add(led);
  } else if (appliance.kind === 'ac') {
    const unitGeo = new THREE.BoxGeometry(0.68, 0.2, 0.16);
    disposablesGeo.push(unitGeo);
    const unit = tagMesh(new THREE.Mesh(unitGeo, bodyMat));
    unit.position.z = 0.08;
    unit.castShadow = castShadows;
    rootGroup.add(unit);

    const louverGeo = new THREE.BoxGeometry(0.58, 0.03, 0.04);
    disposablesGeo.push(louverGeo);
    acLouver = tagMesh(new THREE.Mesh(louverGeo, trimMat));
    acLouver.position.set(0, -0.08, 0.15);
    rootGroup.add(acLouver);

    const stripGeo = new THREE.BoxGeometry(0.14, 0.02, 0.015);
    disposablesGeo.push(stripGeo);
    const strip = tagMesh(new THREE.Mesh(stripGeo, emissiveMat));
    strip.position.set(0.2, 0.03, 0.162);
    rootGroup.add(strip);
  } else if (appliance.kind === 'exhaust') {
    const frameGeo = new THREE.BoxGeometry(0.28, 0.28, 0.08);
    disposablesGeo.push(frameGeo);
    const frame = tagMesh(new THREE.Mesh(frameGeo, trimMat));
    frame.position.z = 0.04;
    rootGroup.add(frame);

    const rotor = new THREE.Group();
    rotor.position.z = 0.06;
    const bladeGeo = new THREE.BoxGeometry(0.2, 0.045, 0.015);
    disposablesGeo.push(bladeGeo);
    for (let i = 0; i < 2; i++) {
      const b = tagMesh(new THREE.Mesh(bladeGeo, bodyMat));
      b.rotation.z = (i * Math.PI) / 2;
      rotor.add(b);
    }
    rootGroup.add(rotor);
    spinRotor = rotor;
  } else {
    // water_tank
    const shellGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.85, 22);
    disposablesGeo.push(shellGeo);
    const shellMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.45,
        metalness: 0.1,
        transparent: true,
        opacity: 0.55,
      })
    );
    const shell = tagMesh(new THREE.Mesh(shellGeo, shellMat));
    shell.position.y = 0.43;
    shell.castShadow = castShadows;
    rootGroup.add(shell);

    const lidGeo = new THREE.CylinderGeometry(0.24, 0.26, 0.05, 16);
    disposablesGeo.push(lidGeo);
    const lid = tagMesh(new THREE.Mesh(lidGeo, trimMat));
    lid.position.y = 0.88;
    rootGroup.add(lid);

    const waterGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.76, 18);
    disposablesGeo.push(waterGeo);
    waterColMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.35,
        roughness: 0.18,
        transparent: true,
        opacity: 0.85,
      })
    );
    waterColMesh = new THREE.Mesh(waterGeo, waterColMat);
    waterColMesh.position.y = 0.42;
    rootGroup.add(waterColMesh);
  }

  // Subtle selection highlight ring when selected inside Studio
  if (isSelected) {
    const ringGeo = new THREE.RingGeometry(0.24, 0.29, 24);
    disposablesGeo.push(ringGeo);
    const ringMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 0.9,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      })
    );
    const ring = new THREE.Mesh(ringGeo, ringMat);
    if (appliance.kind === 'ceiling_light' || appliance.kind === 'dimmer_light' || appliance.kind === 'ceiling_fan' || appliance.kind === 'water_tank') {
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
    } else {
      ring.position.z = 0.02;
    }
    rootGroup.add(ring);
  }

  const updateFromDevices = (devices: Record<string, VirtualDeviceInstance>) => {
    const state = readChannelNormalized(appliance, devices);
    isActive = state.active;
    currentLevelRatio = state.levelRatio;

    if (appliance.kind === 'ceiling_light' || appliance.kind === 'dimmer_light') {
      emissiveMat.color.setHex(isActive ? 0xfef08a : 0xcbd5e1);
      emissiveMat.emissive.setHex(isActive ? 0xfbbf24 : 0x475569);
      emissiveMat.emissiveIntensity = isActive ? 0.65 + currentLevelRatio * 1.45 : 0.08;
    } else if (appliance.kind === 'geyser') {
      emissiveMat.color.setHex(isActive ? 0xfb7185 : 0x64748b);
      emissiveMat.emissive.setHex(isActive ? 0xf43f5e : 0x334155);
      emissiveMat.emissiveIntensity = isActive ? 1.4 : 0.15;
    } else if (appliance.kind === 'ac') {
      emissiveMat.color.setHex(isActive ? 0x34d399 : 0x64748b);
      emissiveMat.emissive.setHex(isActive ? 0x10b981 : 0x334155);
      emissiveMat.emissiveIntensity = isActive ? 1.25 : 0.12;
      if (acLouver) {
        acLouver.rotation.x = isActive ? 0.55 : 0;
      }
    }

    if (spinRotor) {
      targetSpinRate = isActive ? 3.5 + currentLevelRatio * 9.5 : 0;
    }

    if (waterColMesh && waterColMat) {
      const pct = state.waterPct ?? (isActive ? 78 : 55);
      const ratio = Math.max(0.08, Math.min(1, pct / 100));
      waterColMesh.scale.y = ratio;
      waterColMesh.position.y = 0.05 + (0.76 * ratio) / 2;
      waterColMat.emissiveIntensity = isActive ? 0.6 : 0.25;
    }
  };

  const animate = (dtSec: number) => {
    if (spinRotor) {
      currentSpinRate = THREE.MathUtils.damp(currentSpinRate, targetSpinRate, 4.5, dtSec);
      if (currentSpinRate > 0.02) {
        if (appliance.kind === 'ceiling_fan') {
          spinRotor.rotation.y += currentSpinRate * dtSec;
        } else {
          spinRotor.rotation.z += currentSpinRate * dtSec;
        }
      }
    }
  };

  return {
    applianceId: appliance.id,
    floorId: appliance.floor_id,
    roomId: appliance.room_id,
    rootGroup,
    materials,
    interactiveMeshes,
    updateFromDevices,
    animate,
    dispose: () => {
      disposablesGeo.forEach((g) => g.dispose());
      disposablesMat.forEach((m) => m.dispose());
    },
  };
}

/**
 * Builds glowing X-Ray electrical conduit paths connecting placed appliances to their
 * linked real hardware control modules inside the 3D Twin scene.
 */
export function buildXRayWiringGroup(params: {
  appliances: Layout3DAppliance[];
  applianceModels: Map<string, ApplianceModelRuntime>;
  hardwareModels: Map<string, HardwareModelRuntime>;
  floorBaseYMap: Map<FloorId, number>;
  devices: Record<string, VirtualDeviceInstance>;
}): XRayWiringRuntime {
  const { appliances, applianceModels, hardwareModels, floorBaseYMap, devices } = params;
  const group = new THREE.Group();
  const disposablesGeo: THREE.BufferGeometry[] = [];
  const disposablesMat: THREE.Material[] = [];

  for (const app of appliances) {
    const appModel = applianceModels.get(app.id);
    if (!appModel) continue;

    const appBaseY = floorBaseYMap.get(app.floor_id) ?? 0;
    const start = new THREE.Vector3(
      appModel.rootGroup.position.x,
      appBaseY + appModel.rootGroup.position.y,
      appModel.rootGroup.position.z
    );

    const hwModel = app.linked_device_id ? hardwareModels.get(app.linked_device_id) : undefined;
    if (!hwModel) {
      // Unbound appliance indicator stub
      const stubGeo = new THREE.SphereGeometry(0.055, 10, 10);
      disposablesGeo.push(stubGeo);
      const stubMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      });
      disposablesMat.push(stubMat);
      const stub = new THREE.Mesh(stubGeo, stubMat);
      stub.position.copy(start);
      stub.renderOrder = 25;
      group.add(stub);
      continue;
    }

    const hwBaseY = floorBaseYMap.get(hwModel.floorId) ?? 0;
    const end = new THREE.Vector3(
      hwModel.rootGroup.position.x,
      hwBaseY + hwModel.rootGroup.position.y,
      hwModel.rootGroup.position.z
    );

    const state = readChannelNormalized(app, devices);
    const wireColor = state.active ? 0x10b981 : 0x22d3ee;

    // Clean architectural ceiling-drop orthogonal conduit path
    const ceilingDropY = Math.max(start.y, end.y) + 0.18;
    const pts = [
      start,
      new THREE.Vector3(start.x, ceilingDropY, start.z),
      new THREE.Vector3(end.x, ceilingDropY, end.z),
      end,
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    disposablesGeo.push(lineGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: wireColor,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
    });
    disposablesMat.push(lineMat);
    const line = new THREE.Line(lineGeo, lineMat);
    line.renderOrder = 24;
    group.add(line);

    const nodeGeo = new THREE.SphereGeometry(0.048, 10, 10);
    disposablesGeo.push(nodeGeo);
    const nodeMat = new THREE.MeshBasicMaterial({
      color: wireColor,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    disposablesMat.push(nodeMat);
    const sNode = new THREE.Mesh(nodeGeo, nodeMat);
    sNode.position.copy(start);
    sNode.renderOrder = 25;
    const eNode = new THREE.Mesh(nodeGeo, nodeMat);
    eNode.position.copy(end);
    eNode.renderOrder = 25;
    group.add(sNode, eNode);
  }

  return {
    group,
    dispose: () => {
      disposablesGeo.forEach((g) => g.dispose());
      disposablesMat.forEach((m) => m.dispose());
    },
  };
}
