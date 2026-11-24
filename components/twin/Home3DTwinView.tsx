'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Box,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Compass,
  Gauge,
  KeyRound,
  Layers,
  LayoutGrid,
  Maximize2,
  Minimize2,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  HomeLayout3D,
  HomeTemplateId,
  Layout3DAppliance,
  Layout3DPlacement,
  Layout3DSurface,
  LevelCapability,
  PhysicalApplianceKind,
  StructuralElement,
  StructuralElementKind,
  SurfaceTagType,
} from '@/lib/protocol/contract';
import { ResolvedEntitlements } from '@/lib/entitlements/resolver';
import { VirtualDeviceInstance } from '@/lib/simulator/types';
import { useWorkspace } from '@/components/workspace/WorkspaceProvider';
import {
  ArchitecturalRoomSpec,
  FloorFilter,
  getFloorForRoom,
} from '@/lib/twin/architectureBlueprints';
import {
  BuiltArchitectureScene,
  SnapSurfaceUserData,
  StructuralSurfaceUserData,
  buildHomeArchitecture,
} from '@/lib/twin/architectureMeshBuilder';
import { ApplianceControlUserData } from '@/lib/twin/applianceMeshBuilder';
import { HardwareControlUserData } from '@/lib/twin/hardwareModelRegistry';
import { CameraMode, Home3DCameraController } from '@/lib/twin/cameraController';
import {
  clampNumber,
  createLayout3DFromTemplate,
  ensureMaterializedStructure,
  fetchFirestoreLayout3D,
  layout3DToBlueprint,
  loadLocalLayout3D,
  saveHomeLayout3D,
  snapToHalfMeter,
} from '@/lib/twin/layout3DStore';
import {
  MODULAR_BLOCK_CATALOG,
  PHYSICAL_APPLIANCES_CATALOG,
  generateDefaultStructureFromBlueprint,
  getNaturalApplianceMountSpec,
  getNaturalDeviceMountSpec,
  isSurfaceValidForAppliance,
  isSurfaceValidForDevice,
  snapGridHalfMeter,
  snapOpeningToWall,
  snapWallEndpointsMagnetic,
} from '@/lib/twin/modularKit';
import {
  CustomizerTab,
  Home3DCustomizerTray,
} from '@/components/twin/Home3DCustomizerTray';
import { PrecisionSlider } from '@/components/ui/PrecisionSlider';
import { cn } from '@/lib/utils';

export interface Home3DTwinViewProps {
  devices: Record<string, VirtualDeviceInstance>;
  entitlements: ResolvedEntitlements;
  initialTemplate?: HomeTemplateId;
  homeId?: string;
  canCustomize?: boolean;
  isAdminInstaller?: boolean;
  defaultCustomizeOpen?: boolean;
  onLayoutSaved?: (layout: HomeLayout3D) => void;
  onSendCommand: (deviceId: string, set: Record<string, boolean | number>) => void;
  onClearPhysicalFault?: (deviceId: string) => void;
  onInspectDevice?: (deviceId: string) => void;
  onExitTo2D?: () => void;
}

// Module-scope reusable math objects (Zero GC inside render loop & raycasting)
const _projVec = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _dragPlane = new THREE.Plane();
const _dragHitWorld = new THREE.Vector3();
const _dragHitLocal = new THREE.Vector3();
const _sliderWorldNormal = new THREE.Vector3();
const _sliderWorldOrigin = new THREE.Vector3();
const _snapLocal = new THREE.Vector3();
const _faceNormal = new THREE.Vector3();
const _selBox = new THREE.Box3();
const _selSize = new THREE.Vector3();
const _selCenter = new THREE.Vector3();

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

export const Home3DTwinView: React.FC<Home3DTwinViewProps> = ({
  devices,
  entitlements,
  initialTemplate = '2bhk',
  homeId,
  canCustomize,
  isAdminInstaller = false,
  defaultCustomizeOpen = false,
  onLayoutSaved,
  onSendCommand,
  onInspectDevice,
  onExitTo2D,
}) => {
  const { resolvedLightMode, prefs } = useWorkspace();
  const tariffInr = prefs.tariffInr;
  const resolvedHomeId = homeId ?? prefs.activeHomeId ?? 'home_imphal_001';
  const allowCustomize = canCustomize ?? (isAdminInstaller || prefs.userRole === 'OWNER');

  const shellRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const roomLabelElsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Persistent Three.js handles (stable across live layout edits!)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controllerRef = useRef<Home3DCameraController | null>(null);
  const archRef = useRef<BuiltArchitectureScene | null>(null);
  const contactPlaneRef = useRef<THREE.Mesh | null>(null);
  const devicesRef = useRef(devices);
  const tariffInrRef = useRef(tariffInr);
  const onSendCommandRef = useRef(onSendCommand);

  // Managed Editable 3D Layout State (Synced with localStorage & Firestore `homes/{home_id}/layout_3d`)
  const [layout3D, setLayout3D] = useState<HomeLayout3D>(() => {
    const local = loadLocalLayout3D(resolvedHomeId);
    if (local && local.floors && local.floors.length > 0 && local.rooms && local.rooms.length > 0) {
      return ensureMaterializedStructure(local, devices);
    }
    return createLayout3DFromTemplate(local?.template_id ?? initialTemplate, devices);
  });
  const [undoStack, setUndoStack] = useState<HomeLayout3D[]>([]);
  const [redoStack, setRedoStack] = useState<HomeLayout3D[]>([]);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [savingLayout, setSavingLayout] = useState<boolean>(false);

  // Core UI state
  const [ecoMode, setEcoMode] = useState<boolean>(!entitlements.canUse3DHomeView);
  const [lowFpsBanner, setLowFpsBanner] = useState<boolean>(false);
  const [lowFpsDismissed, setLowFpsDismissed] = useState<boolean>(false);
  const [activeFloor, setActiveFloor] = useState<FloorFilter>('all');
  const [cameraMode, setCameraMode] = useState<CameraMode>('free');
  const [autoCutaway, setAutoCutaway] = useState<boolean>(true);
  const [showRoomLabels, setShowRoomLabels] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [usingCssFullscreen, setUsingCssFullscreen] = useState<boolean>(false);

  // Owner & Admin 3D Customizer Mode State (Phase 11C + 12B Modular Studio)
  const [customizeMode, setCustomizeMode] = useState<boolean>(
    defaultCustomizeOpen && allowCustomize
  );
  const [naturalSnap, setNaturalSnap] = useState<boolean>(true);
  const [customizerTab, setCustomizerTab] = useState<CustomizerTab>('build');
  const [trayCollapsed, setTrayCollapsed] = useState<boolean>(false);
  const [activeBuildFloorId, setActiveBuildFloorId] = useState<string>('gf');
  const [selectedEditRoomId, setSelectedEditRoomId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [pendingBuildKind, setPendingBuildKind] = useState<StructuralElementKind | null>(null);
  const [selectedPlacementDeviceId, setSelectedPlacementDeviceId] = useState<string | null>(null);
  const [snapTargetDeviceId, setSnapTargetDeviceId] = useState<string | null>(null);
  const [selectedApplianceId, setSelectedApplianceId] = useState<string | null>(null);
  const [pendingApplianceKind, setPendingApplianceKind] = useState<PhysicalApplianceKind | null>(null);
  const [xrayWiring, setXrayWiring] = useState<boolean>(false);

  // Active focus state + optional collapsible tiny touch-fallback drawer
  const [focusedRoomId, setFocusedRoomId] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [touchControlsOpen, setTouchControlsOpen] = useState<boolean>(false);
  const [hudNotice, setHudNotice] = useState<{ text: string; tone: 'info' | 'danger' } | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  // Top bar single-dropdown state
  const [openMenu, setOpenMenu] = useState<'floor' | 'camera' | null>(null);
  const topBarRef = useRef<HTMLDivElement>(null);

  // Keep latest devices ref synced before structural roster checks
  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  // Structural device roster key: changes ONLY when devices are added/removed/reassigned,
  // NEVER on 1-second telemetry/state ticks (prevents roof & scene geometry rebuild twitching).
  const deviceRosterKey = useMemo(
    () =>
      Object.values(devices)
        .map((d) => `${d.device_id}:${d.module_code}:${d.room_id}`)
        .sort()
        .join('|'),
    [devices]
  );

  const [structuralDevices, setStructuralDevices] = useState<
    Record<string, VirtualDeviceInstance>
  >(() => devices);
  const prevRosterKeyRef = useRef<string>(deviceRosterKey);

  useEffect(() => {
    if (prevRosterKeyRef.current !== deviceRosterKey) {
      prevRosterKeyRef.current = deviceRosterKey;
      setStructuralDevices(devicesRef.current);
    }
  }, [deviceRosterKey]);

  // Compile renderable architectural blueprint ONLY when layout3D or device roster changes
  const blueprint = useMemo(
    () => layout3DToBlueprint(layout3D, structuralDevices),
    [layout3D, structuralDevices]
  );

  // Derived active floor filter (avoids synchronous setState-in-effect when template floors change)
  const effectiveActiveFloor: FloorFilter =
    activeFloor !== 'all' && !blueprint.floors.some((f) => f.id === activeFloor)
      ? 'all'
      : activeFloor;

  const effectiveBuildFloorId: string =
    blueprint.floors.some((f) => f.id === activeBuildFloorId)
      ? activeBuildFloorId
      : blueprint.floors[0]?.id ?? 'gf';

  // Mutable refs mirrored for the animation loop & pointer handlers
  const blueprintRef = useRef(blueprint);
  const activeFloorRef = useRef<FloorFilter>(effectiveActiveFloor);
  const activeBuildFloorIdRef = useRef<string>(effectiveBuildFloorId);
  const customizerTabRef = useRef<CustomizerTab>(customizerTab);
  const autoCutawayRef = useRef<boolean>(autoCutaway);
  const showRoomLabelsRef = useRef<boolean>(showRoomLabels);
  const selectedDeviceIdRef = useRef<string | null>(selectedDeviceId);
  const customizeModeRef = useRef<boolean>(customizeMode);
  const naturalSnapRef = useRef<boolean>(naturalSnap);
  const selectedElementIdRef = useRef<string | null>(selectedElementId);
  const selectionBoxRef = useRef<THREE.LineSegments | null>(null);
  const snapTargetDeviceIdRef = useRef<string | null>(snapTargetDeviceId);
  const pendingBuildKindRef = useRef<StructuralElementKind | null>(pendingBuildKind);
  const pendingApplianceKindRef = useRef<PhysicalApplianceKind | null>(pendingApplianceKind);
  const lowFpsDismissedRef = useRef<boolean>(lowFpsDismissed);
  const lastSnappedTemplateRef = useRef<string | null>(null);

  const showTransientNotice = useCallback((text: string, tone: 'info' | 'danger' = 'info') => {
    setHudNotice({ text, tone });
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setHudNotice(null);
    }, 2600);
  }, []);
  const showNoticeRef = useRef(showTransientNotice);

  useEffect(() => {
    showNoticeRef.current = showTransientNotice;
  }, [showTransientNotice]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    blueprintRef.current = blueprint;
  }, [blueprint]);

  useEffect(() => {
    activeFloorRef.current = effectiveActiveFloor;
  }, [effectiveActiveFloor]);

  useEffect(() => {
    activeBuildFloorIdRef.current = effectiveBuildFloorId;
  }, [effectiveBuildFloorId]);

  useEffect(() => {
    customizerTabRef.current = customizerTab;
  }, [customizerTab]);

  useEffect(() => {
    autoCutawayRef.current = autoCutaway;
  }, [autoCutaway]);

  useEffect(() => {
    showRoomLabelsRef.current = showRoomLabels;
  }, [showRoomLabels]);

  useEffect(() => {
    selectedDeviceIdRef.current = selectedDeviceId;
  }, [selectedDeviceId]);

  useEffect(() => {
    customizeModeRef.current = customizeMode;
  }, [customizeMode]);

  useEffect(() => {
    naturalSnapRef.current = naturalSnap;
  }, [naturalSnap]);

  useEffect(() => {
    selectedElementIdRef.current = selectedElementId;
  }, [selectedElementId]);

  useEffect(() => {
    snapTargetDeviceIdRef.current = snapTargetDeviceId;
  }, [snapTargetDeviceId]);

  useEffect(() => {
    pendingBuildKindRef.current = pendingBuildKind;
  }, [pendingBuildKind]);

  useEffect(() => {
    pendingApplianceKindRef.current = pendingApplianceKind;
  }, [pendingApplianceKind]);

  useEffect(() => {
    lowFpsDismissedRef.current = lowFpsDismissed;
  }, [lowFpsDismissed]);

  useEffect(() => {
    tariffInrRef.current = tariffInr;
  }, [tariffInr]);

  useEffect(() => {
    onSendCommandRef.current = onSendCommand;
  }, [onSendCommand]);

  const syncSelectionOutline = useCallback(() => {
    const helper = selectionBoxRef.current;
    const arch = archRef.current;
    const scene = sceneRef.current;
    const selId = selectedElementIdRef.current;
    if (!helper) return;

    if (!customizeModeRef.current || !selId || !arch || !scene) {
      helper.visible = false;
      return;
    }

    const objs = arch.elementGroups.get(selId);
    if (!objs || objs.length === 0) {
      helper.visible = false;
      return;
    }

    scene.updateMatrixWorld(true);
    _selBox.makeEmpty();
    for (const obj of objs) {
      _selBox.expandByObject(obj);
    }
    if (_selBox.isEmpty()) {
      helper.visible = false;
      return;
    }
    _selBox.getSize(_selSize);
    _selBox.getCenter(_selCenter);
    helper.position.copy(_selCenter);
    helper.scale.set(
      Math.max(0.18, _selSize.x + 0.08),
      Math.max(0.12, _selSize.y + 0.08),
      Math.max(0.18, _selSize.z + 0.08)
    );
    helper.visible = true;
  }, []);

  const syncSelectionOutlineRef = useRef(syncSelectionOutline);
  useEffect(() => {
    syncSelectionOutlineRef.current = syncSelectionOutline;
  }, [syncSelectionOutline]);

  useEffect(() => {
    syncSelectionOutline();
  }, [selectedElementId, customizeMode, ecoMode, blueprint, syncSelectionOutline]);

  const previewElementInScene = useCallback(
    (elementId: string, patch: Partial<StructuralElement>) => {
      const arch = archRef.current;
      if (!arch) return;
      const spec = arch.elementSpecs.get(elementId);
      const objs = arch.elementGroups.get(elementId);
      if (!spec || !objs || objs.length === 0) return;
      const floorEntry = arch.floors.find((f) => f.spec.id === spec.floorId);
      if (!floorEntry) return;

      const topObj = [...objs].reverse().find((o) => o.parent === floorEntry.group);
      if (!topObj) return;

      if (patch.x !== undefined) topObj.position.x = patch.x;
      if (patch.z !== undefined) topObj.position.z = patch.z;
      if (patch.y !== undefined) {
        const isCenteredGeom = spec.kind === 'ground' || (spec.kind === 'wall' && spec.variant === 'pillar');
        topObj.position.y = isCenteredGeom ? patch.y + Math.max(0.016, spec.h) / 2 : patch.y;
      }
      if (patch.rotationDeg !== undefined) {
        topObj.rotation.y = THREE.MathUtils.degToRad(patch.rotationDeg);
      }
      syncSelectionOutline();
    },
    [syncSelectionOutline]
  );

  // Hydrate saved layout from localStorage / Firestore when homeId changes + cross-page sync
  useEffect(() => {
    let active = true;

    void Promise.resolve().then(async () => {
      if (!active) return;
      const local = loadLocalLayout3D(resolvedHomeId);
      if (local && local.floors && local.floors.length > 0 && local.rooms && local.rooms.length > 0) {
        setLayout3D(ensureMaterializedStructure(local, devicesRef.current));
        setIsDirty(false);
      }

      const cloud = await fetchFirestoreLayout3D(resolvedHomeId);
      if (!active || !cloud) return;
      const hydrated =
        cloud.floors && cloud.floors.length > 0 && cloud.rooms && cloud.rooms.length > 0
          ? ensureMaterializedStructure(cloud, devicesRef.current)
          : createLayout3DFromTemplate(cloud.template_id, devicesRef.current, cloud.eco_fallback);
      setLayout3D(hydrated);
      setIsDirty(false);
    });

    const onSyncEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<{ homeId: string; layout: HomeLayout3D }>).detail;
      if (detail?.homeId === resolvedHomeId && detail.layout) {
        setLayout3D(ensureMaterializedStructure(detail.layout, devicesRef.current));
        setIsDirty(false);
      }
    };
    window.addEventListener('ddoodle:layout3d-sync', onSyncEvent);
    return () => {
      active = false;
      window.removeEventListener('ddoodle:layout3d-sync', onSyncEvent);
    };
  }, [resolvedHomeId]);

  // Close top bar popovers on outside pointer down
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (topBarRef.current && !topBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  // --- Undo / Redo & Layout Mutation Helpers ---
  const mutateLayout = useCallback((updater: (prev: HomeLayout3D) => HomeLayout3D) => {
    setLayout3D((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      setUndoStack((hist) => [...hist.slice(-29), prev]);
      setRedoStack([]);
      setIsDirty(true);
      return next;
    });
  }, []);
  const mutateLayoutRef = useRef(mutateLayout);
  useEffect(() => {
    mutateLayoutRef.current = mutateLayout;
  }, [mutateLayout]);

  const handleUndo = useCallback(() => {
    setUndoStack((hist) => {
      if (hist.length === 0) return hist;
      const previous = hist[hist.length - 1];
      setLayout3D((current) => {
        setRedoStack((r) => [...r.slice(-29), current]);
        return previous;
      });
      setIsDirty(true);
      return hist.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((hist) => {
      if (hist.length === 0) return hist;
      const nextVal = hist[hist.length - 1];
      setLayout3D((current) => {
        setUndoStack((u) => [...u.slice(-29), current]);
        return nextVal;
      });
      setIsDirty(true);
      return hist.slice(0, -1);
    });
  }, []);

  const handleApplyTemplate = useCallback(
    (templateId: HomeTemplateId) => {
      const fresh = createLayout3DFromTemplate(templateId, devicesRef.current);
      mutateLayout(() => fresh);
      setFocusedRoomId(null);
      setSelectedDeviceId(null);
      setTouchControlsOpen(false);
      setSelectedEditRoomId(fresh.rooms?.[0]?.id ?? null);
      lastSnappedTemplateRef.current = null;
      showTransientNotice(`Loaded ${templateId.toUpperCase()} Indian template`, 'info');
    },
    [mutateLayout, showTransientNotice]
  );

  const handleResetTemplate = useCallback(() => {
    const fresh = createLayout3DFromTemplate(layout3D.template_id, devicesRef.current);
    mutateLayout(() => fresh);
    setFocusedRoomId(null);
    setSelectedDeviceId(null);
    setTouchControlsOpen(false);
    setSelectedEditRoomId(fresh.rooms?.[0]?.id ?? null);
    lastSnappedTemplateRef.current = null;
    showTransientNotice(
      `Reset to default ${layout3D.template_id.toUpperCase()} structure`,
      'info'
    );
  }, [layout3D.template_id, mutateLayout, showTransientNotice]);

  const handleSaveLayout = useCallback(async () => {
    setSavingLayout(true);
    try {
      const res = await saveHomeLayout3D(resolvedHomeId, layout3D, devicesRef.current);
      setIsDirty(false);
      onLayoutSaved?.(layout3D);
      showTransientNotice(
        res.savedCloud
          ? 'Saved 3D Twin to Home & Cloud (Firestore)'
          : 'Saved 3D Twin locally (offline sync ready)',
        'info'
      );
    } finally {
      setSavingLayout(false);
    }
  }, [resolvedHomeId, layout3D, onLayoutSaved, showTransientNotice]);

  // Fullscreen lifecycle (Browser API + iOS Safari CSS fallback)
  const exitFullscreen = useCallback(async () => {
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Fallback cleanup below
      }
    }
    setIsFullscreen(false);
    setUsingCssFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    setOpenMenu(null);
    if (isFullscreen) {
      await exitFullscreen();
      return;
    }
    const el = shellRef.current;
    if (el && typeof el.requestFullscreen === 'function') {
      try {
        await el.requestFullscreen();
        setIsFullscreen(true);
        setUsingCssFullscreen(false);
        return;
      } catch {
        // Fallback to CSS fixed fullscreen
      }
    }
    setIsFullscreen(true);
    setUsingCssFullscreen(true);
  }, [isFullscreen, exitFullscreen]);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && !usingCssFullscreen) {
        setIsFullscreen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingBuildKind || snapTargetDeviceId || pendingApplianceKind) {
          setPendingBuildKind(null);
          setSnapTargetDeviceId(null);
          setPendingApplianceKind(null);
          setTrayCollapsed(false);
        } else if (openMenu) {
          setOpenMenu(null);
        } else if (isFullscreen) {
          void exitFullscreen();
        }
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen, usingCssFullscreen, openMenu, snapTargetDeviceId, pendingBuildKind, pendingApplianceKind, exitFullscreen]);

  // Smooth Camera Focus Actions
  const focusRoom = useCallback((roomId: string) => {
    const bp = blueprintRef.current;
    const room = bp.rooms.find((r) => r.id === roomId);
    if (!room) return;
    const floor = getFloorForRoom(bp, room.id);

    setSelectedDeviceId(null);
    setTouchControlsOpen(false);
    setFocusedRoomId(room.id);
    if (customizeModeRef.current) {
      setSelectedEditRoomId(room.id);
    }
    if (activeFloorRef.current !== 'all' && activeFloorRef.current !== room.floorId) {
      setActiveFloor(room.floorId);
    }
    controllerRef.current?.focusRoom(room, floor.baseY);
  }, []);

  const focusModule = useCallback((deviceId: string) => {
    const bp = blueprintRef.current;
    const model = archRef.current?.hardwareModels.get(deviceId);
    const pin = bp.pins.find((p) => p.device_id === deviceId);
    const targetRoomId = model?.roomId ?? pin?.room_id ?? null;

    setSelectedDeviceId(deviceId);
    setTouchControlsOpen(false);
    setFocusedRoomId(targetRoomId);
    if (customizeModeRef.current) {
      setSelectedPlacementDeviceId(deviceId);
    }

    if (targetRoomId) {
      const floor = getFloorForRoom(bp, targetRoomId);
      if (activeFloorRef.current !== 'all' && activeFloorRef.current !== floor.id) {
        setActiveFloor(floor.id);
      }
    }

    if (model && controllerRef.current) {
      model.rootGroup.getWorldPosition(_worldPos);
      controllerRef.current.focusModule(
        _worldPos,
        model.frontNormal,
        model.focusDistance,
        model.focusTargetOffsetY
      );
    } else if (pin && controllerRef.current) {
      controllerRef.current.focusModule(new THREE.Vector3(pin.x, pin.y, pin.z));
    }
  }, []);

  const resetCamera = useCallback(() => {
    const bp = blueprintRef.current;
    setFocusedRoomId(null);
    setSelectedDeviceId(null);
    setTouchControlsOpen(false);
    setCameraMode('free');
    setOpenMenu(null);
    const centerY = bp.floors.length > 2 ? 2.4 : 1.4;
    controllerRef.current?.resetCamera(bp, centerY);
  }, []);

  const handleSelectFloor = useCallback((nextFloor: FloorFilter) => {
    setActiveFloor(nextFloor);
    setOpenMenu(null);
    const bp = blueprintRef.current;
    if (nextFloor === 'all') {
      controllerRef.current?.focusFloor(bp, 0, true);
    } else {
      const fl = bp.floors.find((f) => f.id === nextFloor) ?? bp.floors[0];
      controllerRef.current?.focusFloor(bp, fl.baseY, false);
    }
  }, []);

  const handleSelectCameraMode = useCallback((nextMode: CameraMode) => {
    setCameraMode(nextMode);
    setOpenMenu(null);
    const bp = blueprintRef.current;
    const fl =
      activeFloorRef.current === 'all'
        ? bp.floors[0]
        : bp.floors.find((f) => f.id === activeFloorRef.current) ?? bp.floors[0];
    controllerRef.current?.setCameraMode(nextMode, bp, fl.baseY);
  }, []);

  // Keep refs for raycast click callbacks inside Three.js mount effect
  const focusRoomRef = useRef(focusRoom);
  const focusModuleRef = useRef(focusModule);
  useEffect(() => {
    focusRoomRef.current = focusRoom;
    focusModuleRef.current = focusModule;
  }, [focusRoom, focusModule]);

  const isSoftwareGl = useMemo(() => detectSoftwareWebGL(), []);

  // EFFECT 1: Mount Persistent Three.js Renderer, Studio Lighting, Free Camera & Render Loop
  useEffect(() => {
    if (ecoMode || !mountRef.current) return;

    const container = mountRef.current;
    const width = Math.max(320, container.clientWidth);
    const height = Math.max(380, container.clientHeight || 540);

    // 1. Bright Architectural Studio Scene (Dark & Light theme aware)
    const bgHex = resolvedLightMode ? 0xeef3f8 : 0x151e2e;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, resolvedLightMode ? 0.015 : 0.018);
    sceneRef.current = scene;

    // 2. Perspective Camera
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 140);
    cameraRef.current = camera;

    // 3. Renderer (Three.js r160+ PBR & Software-WebGL Guard)
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = resolvedLightMode ? 1.12 : 1.18;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Procedural Studio Environment Reflection (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = resolvedLightMode ? 0.55 : 0.48;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 5. Three-Point Architectural Lighting Rig
    const hemiLight = new THREE.HemisphereLight(
      resolvedLightMode ? 0xf0f9ff : 0xdbeafe,
      resolvedLightMode ? 0xcbd5e1 : 0x475569,
      resolvedLightMode ? 1.35 : 1.18
    );
    hemiLight.position.set(0, 24, 0);
    scene.add(hemiLight);

    const sunKey = new THREE.DirectionalLight(0xfff7ed, resolvedLightMode ? 1.75 : 1.6);
    sunKey.position.set(13, 22, 11);
    if (!isSoftwareGl) {
      sunKey.castShadow = true;
      sunKey.shadow.mapSize.width = 1024;
      sunKey.shadow.mapSize.height = 1024;
      sunKey.shadow.camera.near = 2;
      sunKey.shadow.camera.far = 48;
      sunKey.shadow.camera.left = -15;
      sunKey.shadow.camera.right = 15;
      sunKey.shadow.camera.top = 15;
      sunKey.shadow.camera.bottom = -15;
      sunKey.shadow.bias = -0.0005;
      sunKey.shadow.normalBias = 0.025;
      sunKey.shadow.radius = 3;
    }
    scene.add(sunKey);

    const warmFill = new THREE.DirectionalLight(0xfef3c7, resolvedLightMode ? 0.55 : 0.68);
    warmFill.position.set(-12, 11, -10);
    scene.add(warmFill);

    // 6. Ground Studio Plinth + Subtle Contact Shadow Grounding (zero Z-fighting)
    const groundGeo = new THREE.PlaneGeometry(80, 80);
    const groundMat = new THREE.MeshStandardMaterial({
      color: resolvedLightMode ? 0xe5ecf3 : 0x1a2436,
      roughness: 0.92,
      metalness: 0.04,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.04;
    ground.receiveShadow = !isSoftwareGl;
    scene.add(ground);

    const gridHelper = new THREE.GridHelper(
      36,
      36,
      resolvedLightMode ? 0xcbd5e1 : 0x334155,
      resolvedLightMode ? 0xdbe3ec : 0x243146
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
    contactPlaneRef.current = contactPlane;

    // 7. Free Camera + Damped Focus Controller
    const controller = new Home3DCameraController(
      camera,
      renderer.domElement,
      isSoftwareGl,
      () => setCameraMode('free')
    );
    const initialBp = blueprintRef.current;
    const initialCenterY = initialBp.floors.length > 2 ? 2.4 : 1.4;
    controller.snapToOverview(initialBp, initialCenterY);
    lastSnappedTemplateRef.current = initialBp.templateId;
    controllerRef.current = controller;

    // Auto-minimize customizer tray whenever the user starts orbiting/panning in Customize 3D mode
    const onOrbitStart = () => {
      if (
        customizeModeRef.current &&
        !snapTargetDeviceIdRef.current &&
        !pendingBuildKindRef.current &&
        !pendingApplianceKindRef.current
      ) {
        setTrayCollapsed(true);
      }
    };
    controller.controls.addEventListener('start', onOrbitStart);

    // 7B. Green / Red Surface-Snap Ghost Preview Mesh (Zero GC allocations during hover)
    const ghostGroup = new THREE.Group();
    ghostGroup.visible = false;
    const ghostBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const ghostBoxMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const ghostBoxMesh = new THREE.Mesh(ghostBoxGeo, ghostBoxMat);
    ghostGroup.add(ghostBoxMesh);

    const ghostRingGeo = new THREE.RingGeometry(0.22, 0.28, 24);
    const ghostRingMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const ghostRingMesh = new THREE.Mesh(ghostRingGeo, ghostRingMat);
    ghostGroup.add(ghostRingMesh);
    scene.add(ghostGroup);

    // 7C. Glowing Selection Wireframe Outline for ANY Selected Structural Element
    const selUnitGeo = new THREE.BoxGeometry(1, 1, 1);
    const selEdgesGeo = new THREE.EdgesGeometry(selUnitGeo);
    selUnitGeo.dispose();
    const selEdgesMat = new THREE.LineBasicMaterial({
      color: resolvedLightMode ? 0x0284c7 : 0x38bdf8,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    const selectionBox = new THREE.LineSegments(selEdgesGeo, selEdgesMat);
    selectionBox.visible = false;
    selectionBox.renderOrder = 999;
    scene.add(selectionBox);
    selectionBoxRef.current = selectionBox;

    // 8. Direct 3D Hardware Interaction, Direct Element Dragging & Tap-to-Snap Raycasting
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const _buildFloorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const _buildPlaneHit = new THREE.Vector3();
    const _ghostNormalVec = new THREE.Vector3();
    const _ghostUp = new THREE.Vector3(0, 0, 1);
    let downX = 0;
    let downY = 0;
    let lastHoverCheckMs = 0;

    interface ActiveSliderDrag {
      deviceId: string;
      capKey: string;
      mesh: THREE.Mesh;
      min: number;
      max: number;
      step: number;
      trackLength: number;
      lastEmittedVal: number;
      lastEmitMs: number;
    }
    let activeSliderDrag: ActiveSliderDrag | null = null;

    interface ActiveElementDrag {
      element: StructuralElement;
      floorId: string;
      targetObj: THREE.Object3D | null;
      isWallOpening: boolean;
      parentWall: StructuralElement | null;
      baseObjY: number;
      hitOffsetX: number;
      hitOffsetZ: number;
      curX: number;
      curZ: number;
      curRatio: number;
      hasMoved: boolean;
    }
    let activeElementDrag: ActiveElementDrag | null = null;

    const setPointerNdcFromEvent = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const isFloorVisibleNow = (floorId: string) => {
      const bp = blueprintRef.current;
      const fl = bp.floors.find((f) => f.id === floorId);
      if (fl?.visible === false) return false;
      const activeFloorFilter = activeFloorRef.current;
      if (activeFloorFilter === 'all') return true;
      const flIdx = bp.floors.findIndex((f) => f.id === floorId);
      const selIdx = bp.floors.findIndex((f) => f.id === activeFloorFilter);
      return flIdx <= selIdx;
    };

    const getVisibleControlMeshes = () => {
      if (!archRef.current) return [];
      return archRef.current.interactiveControlMeshes.filter((mesh) =>
        isFloorVisibleNow(String(mesh.userData.floorId ?? ''))
      );
    };

    const getVisibleStructuralMeshes = () => {
      if (!archRef.current) return [];
      return archRef.current.structuralMeshes.filter((mesh) =>
        isFloorVisibleNow(String(mesh.userData.floorId ?? ''))
      );
    };

    const getSelectableStructuralMeshes = () => {
      if (!archRef.current) return [];
      return archRef.current.structuralMeshes.filter(
        (mesh) =>
          isFloorVisibleNow(String(mesh.userData.floorId ?? '')) &&
          mesh.userData.kind !== 'snap_surface' &&
          mesh.userData.surfaceType !== 'ceiling'
      );
    };

    const getVisibleApplianceMeshes = () => {
      if (!archRef.current) return [];
      return archRef.current.applianceInteractiveMeshes.filter((mesh) =>
        isFloorVisibleNow(String(mesh.userData.floorId ?? ''))
      );
    };

    const findBestRoomForPoint = (
      floorId: string,
      localX: number,
      localZ: number,
      preferredRoomId?: string | null
    ): ArchitecturalRoomSpec | undefined => {
      const bp = blueprintRef.current;
      if (preferredRoomId) {
        const direct = bp.rooms.find((r) => r.id === preferredRoomId);
        if (direct) return direct;
      }
      const floorRooms = bp.rooms.filter((r) => r.floorId === floorId);
      const containing = floorRooms.find(
        (r) => Math.abs(localX - r.x) <= r.w / 2 + 0.25 && Math.abs(localZ - r.z) <= r.d / 2 + 0.25
      );
      if (containing) return containing;
      let nearest = floorRooms[0] ?? bp.rooms[0];
      let bestDist = Infinity;
      for (const r of bp.rooms) {
        const d = Math.hypot(localX - r.x, localZ - r.z) + (r.floorId === floorId ? 0 : 12);
        if (d < bestDist) {
          bestDist = d;
          nearest = r;
        }
      }
      return nearest;
    };

    const getHitNormalTuple = (
      hit: THREE.Intersection,
      meta: Partial<StructuralSurfaceUserData>
    ): [number, number, number] => {
      const snapMeta = hit.object.userData as Partial<SnapSurfaceUserData>;
      if (snapMeta.kind !== 'snap_surface' && hit.face) {
        _faceNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
        if (_faceNormal.lengthSq() > 0.1) {
          return [_faceNormal.x, _faceNormal.y, _faceNormal.z];
        }
      }
      return meta.normal ?? [0, 1, 0];
    };

    const resolveSurfacePlacementCoords = (
      hit: THREE.Intersection,
      meta: StructuralSurfaceUserData,
      room: ArchitecturalRoomSpec,
      slabTopY: number,
      roomWallH: number,
      defaultFloorElev: number,
      useNaturalSnap: boolean
    ): { surface: Layout3DSurface; offsetAlong: number; offsetZ: number; elevationM: number } => {
      const floorEntry = archRef.current?.floors.find((f) => f.spec.id === room.floorId);
      _snapLocal.copy(hit.point);
      if (floorEntry) {
        floorEntry.group.worldToLocal(_snapLocal);
      }

      const snapMeta = hit.object.userData as Partial<SnapSurfaceUserData>;
      let surface: Layout3DSurface = snapMeta.surface ?? 'floor';
      const [nx, , nz] = getHitNormalTuple(hit, meta);

      if (meta.surfaceType === 'ceiling') {
        surface = 'ceiling';
      } else if (meta.surfaceType === 'wall' || meta.surfaceType === 'window' || meta.surfaceType === 'door') {
        if (snapMeta.kind === 'snap_surface' && snapMeta.surface) {
          surface = snapMeta.surface;
        } else if (Math.abs(nx) >= Math.abs(nz)) {
          surface = nx >= 0 ? 'east' : 'west';
        } else {
          surface = nz >= 0 ? 'south' : 'north';
        }
      } else {
        surface = 'floor';
      }

      if (surface === 'north' || surface === 'south') {
        return {
          surface,
          offsetAlong: clampNumber((_snapLocal.x - room.x) / Math.max(1, room.w), -0.44, 0.44),
          offsetZ: 0,
          elevationM: clampNumber(_snapLocal.y - slabTopY, 0.2, Math.max(0.6, roomWallH - 0.18)),
        };
      }
      if (surface === 'east' || surface === 'west') {
        return {
          surface,
          offsetAlong: clampNumber((_snapLocal.z - room.z) / Math.max(1, room.d), -0.44, 0.44),
          offsetZ: 0,
          elevationM: clampNumber(_snapLocal.y - slabTopY, 0.2, Math.max(0.6, roomWallH - 0.18)),
        };
      }
      if (surface === 'ceiling') {
        const rawX = clampNumber(_snapLocal.x - room.x, -room.w * 0.44, room.w * 0.44);
        const rawZ = clampNumber(_snapLocal.z - room.z, -room.d * 0.44, room.d * 0.44);
        const distToCenter = Math.hypot(rawX, rawZ);
        if (useNaturalSnap) {
          return {
            surface: 'ceiling',
            offsetAlong: distToCenter <= 1.25 ? 0 : snapToHalfMeter(rawX),
            offsetZ: distToCenter <= 1.25 ? 0 : snapToHalfMeter(rawZ),
            elevationM: Math.max(0.8, roomWallH - 0.06),
          };
        }
        return {
          surface: 'ceiling',
          offsetAlong: rawX,
          offsetZ: rawZ,
          elevationM: Math.max(0.8, roomWallH - 0.06),
        };
      }
      const rawFX = clampNumber(_snapLocal.x - room.x, -room.w * 0.46, room.w * 0.46);
      const rawFZ = clampNumber(_snapLocal.z - room.z, -room.d * 0.46, room.d * 0.46);
      return {
        surface: 'floor',
        offsetAlong: useNaturalSnap ? snapToHalfMeter(rawFX) : rawFX,
        offsetZ: useNaturalSnap ? snapToHalfMeter(rawFZ) : rawFZ,
        elevationM: defaultFloorElev,
      };
    };

    const updateGhostPreviewAtPointer = (ev: PointerEvent) => {
      const pendingBuild = pendingBuildKindRef.current;
      const pendingDeviceId = snapTargetDeviceIdRef.current;
      const pendingApp = pendingApplianceKindRef.current;
      const natSnap = naturalSnapRef.current;

      if ((!pendingBuild && !pendingDeviceId && !pendingApp) || !archRef.current || !cameraRef.current) {
        ghostGroup.visible = false;
        return;
      }

      setPointerNdcFromEvent(ev);
      raycaster.setFromCamera(pointerNdc, cameraRef.current);

      if (pendingBuild) {
        const preset = MODULAR_BLOCK_CATALOG.find((b) => b.kind === pendingBuild);
        if (!preset) {
          ghostGroup.visible = false;
          return;
        }
        if (preset.requiresWall) {
          const hits = raycaster.intersectObjects(getVisibleStructuralMeshes(), false);
          if (hits.length === 0) {
            ghostGroup.visible = false;
            return;
          }
          const hit = hits[0];
          const meta = hit.object.userData as Partial<StructuralSurfaceUserData>;
          const isValid = meta.surfaceType === 'wall';
          const colorHex = isValid ? 0x10b981 : 0xef4444;
          ghostBoxMat.color.setHex(colorHex);
          ghostRingMat.color.setHex(colorHex);
          ghostBoxMesh.scale.set(preset.defaultW, preset.defaultH, 0.2);
          ghostGroup.position.copy(hit.point);
          if (natSnap && isValid && meta.elementId) {
            const pWall = archRef.current.elementSpecs.get(meta.elementId);
            const flEntry = archRef.current.floors.find((f) => f.spec.id === meta.floorId);
            if (pWall && flEntry) {
              const wallBaseWorld = flEntry.group.position.y + (pWall.y ?? flEntry.spec.slabThickness);
              ghostGroup.position.y =
                pendingBuild === 'door'
                  ? wallBaseWorld + preset.defaultH / 2
                  : wallBaseWorld + 1.0 + preset.defaultH / 2;
            }
          }
          const norm = getHitNormalTuple(hit, meta);
          _ghostNormalVec.set(norm[0], norm[1], norm[2]).normalize();
          if (_ghostNormalVec.lengthSq() > 0.01) {
            ghostGroup.quaternion.setFromUnitVectors(_ghostUp, _ghostNormalVec);
          }
          ghostGroup.visible = true;
          return;
        }

        const bp = blueprintRef.current;
        const targetFl =
          bp.floors.find((f) => f.id === activeBuildFloorIdRef.current) ?? bp.floors[0];
        const planeY = targetFl ? targetFl.baseY + (pendingBuild === 'ground' ? 0 : targetFl.slabThickness) : 0;
        _buildFloorPlane.constant = -planeY;
        if (raycaster.ray.intersectPlane(_buildFloorPlane, _buildPlaneHit)) {
          ghostBoxMat.color.setHex(0x10b981);
          ghostRingMat.color.setHex(0x10b981);
          ghostBoxMesh.scale.set(preset.defaultW, Math.max(0.08, preset.defaultH), preset.defaultD);
          ghostGroup.quaternion.identity();
          let gx = natSnap ? snapGridHalfMeter(_buildPlaneHit.x) : _buildPlaneHit.x;
          let gz = natSnap ? snapGridHalfMeter(_buildPlaneHit.z) : _buildPlaneHit.z;
          if (natSnap && (pendingBuild === 'wall' || pendingBuild === 'fence')) {
            const mag = snapWallEndpointsMagnetic(
              {
                id: '__ghost__',
                kind: pendingBuild,
                variant: preset.defaultVariant,
                floorId: targetFl?.id ?? 'gf',
                x: gx,
                z: gz,
                w: preset.defaultW,
                d: preset.defaultD,
                h: preset.defaultH,
                rotationDeg: 0,
              },
              bp.structure?.elements ?? [],
              0.25
            );
            gx = mag.x;
            gz = mag.z;
          }
          ghostGroup.position.set(gx, planeY + Math.max(0.08, preset.defaultH) / 2, gz);
          ghostGroup.visible = true;
        } else {
          ghostGroup.visible = false;
        }
        return;
      }

      // Device Snap or Physical Appliance Snap (Green = valid surface, Red = invalid surface)
      const hits = raycaster.intersectObjects(getVisibleStructuralMeshes(), false);
      if (hits.length === 0) {
        ghostGroup.visible = false;
        return;
      }
      const hit = hits[0];
      const meta = hit.object.userData as Partial<StructuralSurfaceUserData>;
      const surfType: SurfaceTagType = meta.surfaceType ?? 'floor';
      const floorId = meta.floorId ?? 'gf';
      const room = findBestRoomForPoint(floorId, hit.point.x, hit.point.z, meta.roomId);
      const flEntry = archRef.current.floors.find((f) => f.spec.id === floorId);
      const slabWorldTopY = (flEntry?.group.position.y ?? 0) + (flEntry?.spec.slabThickness ?? 0.18);
      const roomWallH = room?.wallHeight ?? flEntry?.spec.wallHeight ?? 2.65;

      let valid = false;
      if (pendingDeviceId) {
        const dev = devicesRef.current[pendingDeviceId];
        if (dev) {
          valid = isSurfaceValidForDevice(dev, surfType, room?.floorType ?? null, floorId).valid;
        }
      } else if (pendingApp) {
        valid = isSurfaceValidForAppliance(pendingApp, surfType, room?.floorType ?? null, floorId).valid;
      }

      const colorHex = valid ? 0x10b981 : 0xef4444;
      ghostBoxMat.color.setHex(colorHex);
      ghostRingMat.color.setHex(colorHex);
      ghostBoxMesh.scale.set(0.38, 0.24, 0.14);
      ghostGroup.position.copy(hit.point);

      if (natSnap && valid && room) {
        if (pendingDeviceId) {
          const dev = devicesRef.current[pendingDeviceId];
          if (dev) {
            const natSpec = getNaturalDeviceMountSpec(dev, surfType, hit.point.y - slabWorldTopY);
            if (surfType === 'wall') {
              ghostGroup.position.y = slabWorldTopY + natSpec.elevationM;
            }
          }
        } else if (pendingApp) {
          const natApp = getNaturalApplianceMountSpec(pendingApp, roomWallH);
          if (surfType === 'ceiling' && natApp.snapRoomCenterThresholdM > 0) {
            const distCenter = Math.hypot(hit.point.x - room.x, hit.point.z - room.z);
            if (distCenter <= natApp.snapRoomCenterThresholdM) {
              ghostGroup.position.x = room.x;
              ghostGroup.position.z = room.z;
            }
          } else if (surfType === 'wall') {
            ghostGroup.position.y = slabWorldTopY + natApp.elevationM;
          }
        }
      }

      const norm = getHitNormalTuple(hit, meta);
      _ghostNormalVec.set(norm[0], norm[1], norm[2]).normalize();
      if (_ghostNormalVec.lengthSq() > 0.01) {
        ghostGroup.quaternion.setFromUnitVectors(_ghostUp, _ghostNormalVec);
        ghostGroup.position.addScaledVector(_ghostNormalVec, 0.04);
      }
      ghostGroup.visible = true;
    };

    const computeSliderValueFromWorldPoint = (
      drag: ActiveSliderDrag,
      worldPoint: THREE.Vector3
    ): number => {
      _dragHitLocal.copy(worldPoint);
      drag.mesh.worldToLocal(_dragHitLocal);
      const half = Math.max(0.05, drag.trackLength / 2);
      const norm = THREE.MathUtils.clamp((_dragHitLocal.y + half) / (half * 2), 0, 1);
      const raw = drag.min + norm * (drag.max - drag.min);
      const stepped = Math.round(raw / Math.max(1, drag.step)) * Math.max(1, drag.step);
      return THREE.MathUtils.clamp(stepped, drag.min, drag.max);
    };

    const emitSliderValue = (drag: ActiveSliderDrag, value: number, force: boolean) => {
      const model = archRef.current?.hardwareModels.get(drag.deviceId);
      model?.previewSliderValue(drag.capKey, value);
      const now = performance.now();
      if (force || (value !== drag.lastEmittedVal && now - drag.lastEmitMs >= 80)) {
        drag.lastEmittedVal = value;
        drag.lastEmitMs = now;
        onSendCommandRef.current(drag.deviceId, { [drag.capKey]: value });
      }
    };

    const onPointerDown = (ev: PointerEvent) => {
      downX = ev.clientX;
      downY = ev.clientY;

      if (snapTargetDeviceIdRef.current || pendingBuildKindRef.current || pendingApplianceKindRef.current) return;
      if (!archRef.current || !cameraRef.current) return;

      setPointerNdcFromEvent(ev);
      raycaster.setFromCamera(pointerNdc, cameraRef.current);

      const hits = raycaster.intersectObjects(getVisibleControlMeshes(), false);
      if (hits.length > 0) {
        const hit = hits[0];
        const meta = hit.object.userData as HardwareControlUserData | undefined;
        if (meta && meta.controlKind === 'slider_track' && meta.capKey && selectedDeviceIdRef.current === meta.deviceId) {
          const dev = devicesRef.current[meta.deviceId];
          if (!dev) return;

          // G10 Latched Fault Hard Lockout
          if (dev.state.fault !== null) {
            showNoticeRef.current(
              `G10 Locked (${dev.state.fault}) — Hold physical button 3s to reset`,
              'danger'
            );
            return;
          }

          const model = archRef.current.hardwareModels.get(meta.deviceId);
          if (!model) return;

          _sliderWorldNormal.copy(model.frontNormal).normalize();
          hit.object.getWorldPosition(_sliderWorldOrigin);
          _dragPlane.setFromNormalAndCoplanarPoint(_sliderWorldNormal, _sliderWorldOrigin);

          const drag: ActiveSliderDrag = {
            deviceId: meta.deviceId,
            capKey: meta.capKey,
            mesh: hit.object as THREE.Mesh,
            min: meta.sliderMin ?? 0,
            max: meta.sliderMax ?? 100,
            step: meta.sliderStep ?? 5,
            trackLength: meta.trackLength ?? 0.2,
            lastEmittedVal: Number(dev.state.state[meta.capKey] ?? 0),
            lastEmitMs: 0,
          };
          activeSliderDrag = drag;
          controller.setInteractionLocked(true);

          const nextVal = computeSliderValueFromWorldPoint(drag, hit.point);
          emitSliderValue(drag, nextVal, false);
          return;
        }
      }

      // Direct 3D Drag on Already-Selected Structural Element in Customize Mode
      if (customizeModeRef.current && selectedElementIdRef.current && hits.length === 0) {
        const appHits = raycaster.intersectObjects(getVisibleApplianceMeshes(), false);
        if (appHits.length === 0) {
          const sHits = raycaster.intersectObjects(getSelectableStructuralMeshes(), false);
          const sHit = sHits[0];
          const sMeta = sHit?.object.userData as Partial<StructuralSurfaceUserData> | undefined;
          if (sHit && sMeta?.elementId === selectedElementIdRef.current) {
            const spec = archRef.current.elementSpecs.get(sMeta.elementId);
            const floorEntry = archRef.current.floors.find((f) => f.spec.id === sMeta.floorId);
            if (spec && floorEntry) {
              const isWallOpening = (spec.kind === 'door' || spec.kind === 'window') && Boolean(spec.parentWallId);
              const parentWall = isWallOpening && spec.parentWallId
                ? archRef.current.elementSpecs.get(spec.parentWallId) ?? null
                : null;
              const objs = archRef.current.elementGroups.get(spec.id) ?? [];
              const targetObj = [...objs].reverse().find((o) => o.parent === floorEntry.group) ?? null;

              _snapLocal.copy(sHit.point);
              floorEntry.group.worldToLocal(_snapLocal);
              _dragPlane.set(new THREE.Vector3(0, 1, 0), -sHit.point.y);

              activeElementDrag = {
                element: spec,
                floorId: spec.floorId,
                targetObj,
                isWallOpening,
                parentWall,
                baseObjY: targetObj ? targetObj.position.y : spec.y ?? 0,
                hitOffsetX: _snapLocal.x - spec.x,
                hitOffsetZ: _snapLocal.z - spec.z,
                curX: spec.x,
                curZ: spec.z,
                curRatio: spec.wallOffsetRatio ?? 0,
                hasMoved: false,
              };
              controller.setInteractionLocked(true);
              canvasEl.style.cursor = 'move';
            }
          }
        }
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!archRef.current || !cameraRef.current) return;

      if (
        snapTargetDeviceIdRef.current ||
        pendingBuildKindRef.current ||
        pendingApplianceKindRef.current
      ) {
        canvasEl.style.cursor = 'crosshair';
        updateGhostPreviewAtPointer(ev);
        return;
      }
      ghostGroup.visible = false;

      if (activeElementDrag) {
        setPointerNdcFromEvent(ev);
        raycaster.setFromCamera(pointerNdc, cameraRef.current);
        if (raycaster.ray.intersectPlane(_dragPlane, _dragHitWorld)) {
          const flEntry = archRef.current.floors.find((f) => f.spec.id === activeElementDrag?.floorId);
          _snapLocal.copy(_dragHitWorld);
          if (flEntry) flEntry.group.worldToLocal(_snapLocal);

          if (activeElementDrag.isWallOpening && activeElementDrag.parentWall) {
            const pw = activeElementDrag.parentWall;
            const rad = THREE.MathUtils.degToRad(pw.rotationDeg);
            const alongX = Math.cos(rad);
            const alongZ = -Math.sin(rad);
            const proj = (_snapLocal.x - pw.x) * alongX + (_snapLocal.z - pw.z) * alongZ;
            const maxRatio = Math.max(0, (pw.w - activeElementDrag.element.w) / (2 * Math.max(0.5, pw.w)) - 0.04);
            const nextRatio = clampNumber(proj / Math.max(0.6, pw.w), -maxRatio, maxRatio);
            if (Math.abs(nextRatio - activeElementDrag.curRatio) > 0.005) {
              activeElementDrag.hasMoved = true;
            }
            activeElementDrag.curRatio = nextRatio;
            ghostBoxMat.color.setHex(0x10b981);
            ghostRingMat.color.setHex(0x10b981);
            ghostBoxMesh.scale.set(
              activeElementDrag.element.w,
              activeElementDrag.element.h,
              Math.max(0.22, pw.d + 0.08)
            );
            const offsetDist = nextRatio * pw.w;
            const localX = pw.x + alongX * offsetDist;
            const localZ = pw.z + alongZ * offsetDist;
            const worldY = (flEntry?.group.position.y ?? 0) + (activeElementDrag.element.y ?? 0.18) + activeElementDrag.element.h / 2;
            ghostGroup.position.set(localX, worldY, localZ);
            ghostGroup.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rad);
            ghostGroup.visible = true;
          } else {
            const rawX = _snapLocal.x - activeElementDrag.hitOffsetX;
            const rawZ = _snapLocal.z - activeElementDrag.hitOffsetZ;
            let nextX = naturalSnapRef.current ? snapGridHalfMeter(rawX) : Number(rawX.toFixed(2));
            let nextZ = naturalSnapRef.current ? snapGridHalfMeter(rawZ) : Number(rawZ.toFixed(2));
            if (naturalSnapRef.current) {
              const mag = snapWallEndpointsMagnetic(
                { ...activeElementDrag.element, x: nextX, z: nextZ },
                blueprintRef.current.structure?.elements ?? [],
                0.25
              );
              nextX = mag.x;
              nextZ = mag.z;
            }
            if (Math.abs(nextX - activeElementDrag.curX) > 0.01 || Math.abs(nextZ - activeElementDrag.curZ) > 0.01) {
              activeElementDrag.hasMoved = true;
            }
            activeElementDrag.curX = nextX;
            activeElementDrag.curZ = nextZ;
            if (activeElementDrag.targetObj) {
              activeElementDrag.targetObj.position.set(nextX, activeElementDrag.baseObjY, nextZ);
              syncSelectionOutlineRef.current();
            }
          }
        }
        canvasEl.style.cursor = 'move';
        return;
      }

      if (activeSliderDrag) {
        setPointerNdcFromEvent(ev);
        raycaster.setFromCamera(pointerNdc, cameraRef.current);
        if (raycaster.ray.intersectPlane(_dragPlane, _dragHitWorld)) {
          const nextVal = computeSliderValueFromWorldPoint(activeSliderDrag, _dragHitWorld);
          emitSliderValue(activeSliderDrag, nextVal, false);
        }
        canvasEl.style.cursor = 'ns-resize';
        return;
      }

      const now = performance.now();
      if (ev.pointerType !== 'mouse' || now - lastHoverCheckMs < 75) return;
      lastHoverCheckMs = now;

      setPointerNdcFromEvent(ev);
      raycaster.setFromCamera(pointerNdc, cameraRef.current);
      const hits = raycaster.intersectObjects(getVisibleControlMeshes(), false);
      if (hits.length > 0) {
        const meta = hits[0].object.userData as HardwareControlUserData | undefined;
        if (
          meta &&
          selectedDeviceIdRef.current === meta.deviceId &&
          meta.controlKind === 'slider_track'
        ) {
          canvasEl.style.cursor = 'ns-resize';
        } else {
          canvasEl.style.cursor = 'pointer';
        }
      } else if (customizeModeRef.current && selectedElementIdRef.current) {
        const sHits = raycaster.intersectObjects(getSelectableStructuralMeshes(), false);
        const sMeta = sHits[0]?.object.userData as Partial<StructuralSurfaceUserData> | undefined;
        canvasEl.style.cursor = sMeta?.elementId === selectedElementIdRef.current ? 'move' : 'grab';
      } else {
        canvasEl.style.cursor = 'grab';
      }
    };

    const endSliderDrag = (ev?: PointerEvent) => {
      if (!activeSliderDrag) return;
      const drag = activeSliderDrag;
      if (ev && cameraRef.current) {
        setPointerNdcFromEvent(ev);
        raycaster.setFromCamera(pointerNdc, cameraRef.current);
        if (raycaster.ray.intersectPlane(_dragPlane, _dragHitWorld)) {
          const finalVal = computeSliderValueFromWorldPoint(drag, _dragHitWorld);
          emitSliderValue(drag, finalVal, true);
          showNoticeRef.current(`${drag.capKey.replace(/_/g, ' ')} → ${finalVal}%`, 'info');
        }
      } else {
        emitSliderValue(drag, drag.lastEmittedVal, true);
      }
      activeSliderDrag = null;
      controller.setInteractionLocked(false);
      canvasEl.style.cursor = 'grab';
    };

    const endElementDrag = (commit: boolean) => {
      if (!activeElementDrag) return;
      const drag = activeElementDrag;
      activeElementDrag = null;
      ghostGroup.visible = false;
      controller.setInteractionLocked(false);
      canvasEl.style.cursor = 'grab';
      if (!commit || !drag.hasMoved) return;

      const natSnap = naturalSnapRef.current;
      const targetId = drag.element.id;
      mutateLayoutRef.current((prev) => {
        const baseElements =
          prev.structure?.elements && prev.structure.elements.length > 0
            ? prev.structure.elements
            : generateDefaultStructureFromBlueprint(blueprintRef.current).elements;

        if (drag.isWallOpening && drag.parentWall) {
          const nextElements = baseElements.map((el) => {
            if (el.id !== targetId) return el;
            return (
              snapOpeningToWall({ ...el, wallOffsetRatio: drag.curRatio }, drag.parentWall!, {
                naturalSnap: natSnap,
              }) ?? el
            );
          });
          return { ...prev, structure: { elements: nextElements } };
        }

        const movedBase = baseElements.map((el) =>
          el.id === targetId ? { ...el, x: drag.curX, z: drag.curZ } : el
        );
        const movedWall = movedBase.find((e) => e.id === targetId);
        const nextElements =
          movedWall?.kind === 'wall'
            ? movedBase.map((el) =>
                el.parentWallId === targetId
                  ? snapOpeningToWall(el, movedWall, { naturalSnap: natSnap }) ?? el
                  : el
              )
            : movedBase;

        const nextRooms =
          movedWall?.kind === 'floor' && movedWall.roomId && prev.rooms
            ? prev.rooms.map((rm) =>
                rm.id === movedWall.roomId ? { ...rm, x: drag.curX, z: drag.curZ } : rm
              )
            : prev.rooms;

        return {
          ...prev,
          rooms: nextRooms,
          structure: { elements: nextElements },
        };
      });
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (activeElementDrag) {
        const didMove = activeElementDrag.hasMoved;
        endElementDrag(true);
        if (didMove) return;
      }

      if (activeSliderDrag) {
        endSliderDrag(ev);
        return;
      }

      const moved = Math.hypot(ev.clientX - downX, ev.clientY - downY);
      if (moved > 6 || !archRef.current || !cameraRef.current) return;

      setPointerNdcFromEvent(ev);
      raycaster.setFromCamera(pointerNdc, cameraRef.current);

      const natSnap = naturalSnapRef.current;

      // PRIORITY 0A (Phase 11C + 12B): Modular Structure Tap-to-Place
      const pendingBuild = pendingBuildKindRef.current;
      if (pendingBuild) {
        const preset = MODULAR_BLOCK_CATALOG.find((b) => b.kind === pendingBuild);
        if (preset) {
          if (preset.requiresWall) {
            const hits = raycaster.intersectObjects(getVisibleStructuralMeshes(), false);
            const hit = hits[0];
            const meta = hit?.object.userData as Partial<StructuralSurfaceUserData> | undefined;
            if (!hit || !meta || meta.surfaceType !== 'wall') {
              showNoticeRef.current('Windows & doors snap strictly onto an existing 3D wall', 'danger');
              return;
            }
            const floorEntry = archRef.current.floors.find((f) => f.spec.id === meta.floorId);
            _snapLocal.copy(hit.point);
            floorEntry?.group.worldToLocal(_snapLocal);

            const newId = `mod_${pendingBuild}_${Date.now().toString(36).slice(-4)}`;
            mutateLayoutRef.current((prev) => {
              const baseElements =
                prev.structure?.elements && prev.structure.elements.length > 0
                  ? prev.structure.elements
                  : generateDefaultStructureFromBlueprint(blueprintRef.current).elements;
              const parentWall = baseElements.find((e) => e.id === meta.elementId && e.kind === 'wall');
              let nextEl: StructuralElement | null = null;
              if (parentWall) {
                const rad = THREE.MathUtils.degToRad(parentWall.rotationDeg);
                const alongX = Math.cos(rad);
                const alongZ = -Math.sin(rad);
                const proj = (_snapLocal.x - parentWall.x) * alongX + (_snapLocal.z - parentWall.z) * alongZ;
                const offsetRatio = clampNumber(proj / Math.max(0.6, parentWall.w), -0.4, 0.4);
                const wallBaseY = parentWall.y ?? floorEntry?.spec.slabThickness ?? 0.18;
                const freeY = clampNumber(
                  _snapLocal.y - preset.defaultH / 2,
                  wallBaseY,
                  wallBaseY + Math.max(0.2, parentWall.h - preset.defaultH)
                );
                nextEl = snapOpeningToWall(
                  {
                    id: newId,
                    kind: pendingBuild,
                    variant: preset.defaultVariant,
                    floorId: parentWall.floorId,
                    roomId: parentWall.roomId,
                    x: parentWall.x,
                    z: parentWall.z,
                    y: natSnap
                      ? wallBaseY + (pendingBuild === 'window' ? 1.0 : 0)
                      : Number(freeY.toFixed(2)),
                    w: preset.defaultW,
                    d: parentWall.d,
                    h: preset.defaultH,
                    rotationDeg: parentWall.rotationDeg,
                    parentWallId: parentWall.id,
                    wallOffsetRatio: offsetRatio,
                  },
                  parentWall,
                  { naturalSnap: natSnap }
                );
              }
              if (!nextEl) {
                const norm = getHitNormalTuple(hit, meta);
                const wallNormalZ = Math.abs(norm[2]);
                nextEl = {
                  id: newId,
                  kind: pendingBuild,
                  variant: preset.defaultVariant,
                  floorId: meta.floorId ?? activeBuildFloorIdRef.current,
                  roomId: meta.roomId ?? undefined,
                  x: Number(_snapLocal.x.toFixed(2)),
                  z: Number(_snapLocal.z.toFixed(2)),
                  y: (floorEntry?.spec.slabThickness ?? 0.18) + (pendingBuild === 'window' ? 1.0 : 0),
                  w: preset.defaultW,
                  d: preset.defaultD,
                  h: preset.defaultH,
                  rotationDeg: wallNormalZ >= 0.5 ? 0 : 90,
                };
              }
              return {
                ...prev,
                structure: { elements: [...baseElements.slice(0, 159), nextEl] },
              };
            });
            setSelectedElementId(newId);
            setPendingBuildKind(null);
            ghostGroup.visible = false;
            setTrayCollapsed(false);
            showNoticeRef.current(`Snapped ${preset.label} onto wall`, 'info');
            return;
          }

          // Grid placement on active build floor
          const bp = blueprintRef.current;
          const targetFl =
            bp.floors.find((f) => f.id === activeBuildFloorIdRef.current) ?? bp.floors[0];
          const planeY = targetFl ? targetFl.baseY + (pendingBuild === 'ground' ? 0 : targetFl.slabThickness) : 0;
          _buildFloorPlane.constant = -planeY;
          if (!raycaster.ray.intersectPlane(_buildFloorPlane, _buildPlaneHit)) {
            showNoticeRef.current('Tap inside the 3D floor grid to place block', 'info');
            return;
          }
          const newId = `mod_${pendingBuild}_${Date.now().toString(36).slice(-4)}`;
          const rawX = natSnap ? snapGridHalfMeter(_buildPlaneHit.x) : Number(_buildPlaneHit.x.toFixed(2));
          const rawZ = natSnap ? snapGridHalfMeter(_buildPlaneHit.z) : Number(_buildPlaneHit.z.toFixed(2));
          const elevY =
            pendingBuild === 'ground'
              ? -0.02
              : pendingBuild === 'roof'
              ? (targetFl?.slabThickness ?? 0.16) + (targetFl?.wallHeight ?? 2.4) - 0.1
              : targetFl?.slabThickness ?? 0.18;

          mutateLayoutRef.current((prev) => {
            const baseElements =
              prev.structure?.elements && prev.structure.elements.length > 0
                ? prev.structure.elements
                : generateDefaultStructureFromBlueprint(blueprintRef.current).elements;
            let created: StructuralElement = {
              id: newId,
              kind: pendingBuild,
              variant: preset.defaultVariant,
              floorId: targetFl?.id ?? 'gf',
              x: rawX,
              z: rawZ,
              y: Number(elevY.toFixed(2)),
              w: preset.defaultW,
              d: preset.defaultD,
              h: preset.defaultH,
              rotationDeg: 0,
            };
            if (natSnap) {
              created = snapWallEndpointsMagnetic(created, baseElements, 0.25);
            }
            return {
              ...prev,
              structure: { elements: [...baseElements.slice(0, 159), created] },
            };
          });
          setSelectedElementId(newId);
          setPendingBuildKind(null);
          ghostGroup.visible = false;
          setTrayCollapsed(false);
          showNoticeRef.current(`Placed ${preset.label} on ${targetFl?.shortLabel ?? 'GF'}`, 'info');
          return;
        }
      }

      // PRIORITY 0B (Phase 11C + 12B): Device Tap-to-Snap with Auto-Snap Ergonomic Heights
      const pendingSnapDeviceId = snapTargetDeviceIdRef.current;
      if (pendingSnapDeviceId) {
        const snapHits = raycaster.intersectObjects(getVisibleStructuralMeshes(), false);
        if (snapHits.length === 0) {
          showNoticeRef.current('Tap directly on a valid 3D surface', 'danger');
          return;
        }
        const hit = snapHits[0];
        const meta = hit.object.userData as Partial<StructuralSurfaceUserData> | undefined;
        const dev = devicesRef.current[pendingSnapDeviceId];
        if (!meta || !dev) return;

        const floorId = meta.floorId ?? 'gf';
        const room = findBestRoomForPoint(floorId, hit.point.x, hit.point.z, meta.roomId);
        const surfType: SurfaceTagType = meta.surfaceType ?? 'floor';
        const validation = isSurfaceValidForDevice(
          dev,
          surfType,
          room?.floorType ?? null,
          floorId
        );
        if (!validation.valid) {
          showNoticeRef.current(validation.reason, 'danger');
          return;
        }
        if (!room) return;

        const floorSpec = getFloorForRoom(blueprintRef.current, room.id);
        const coords = resolveSurfacePlacementCoords(
          hit,
          meta as StructuralSurfaceUserData,
          room,
          floorSpec.slabThickness + 0.01,
          room.wallHeight ?? floorSpec.wallHeight,
          0.01,
          natSnap
        );

        const natDev = natSnap
          ? getNaturalDeviceMountSpec(dev, surfType, coords.elevationM)
          : null;
        const finalElev = natDev ? natDev.elevationM : coords.elevationM;

        mutateLayoutRef.current((prev) => {
          const prevPlacements = prev.placements ?? [];
          const existing = prevPlacements.find((p) => p.device_id === pendingSnapDeviceId);
          const nextPlacement: Layout3DPlacement = {
            device_id: pendingSnapDeviceId,
            room_id: room.id,
            floor_id: room.floorId,
            surface: coords.surface,
            offset_along: Number(coords.offsetAlong.toFixed(2)),
            offset_z: Number(coords.offsetZ.toFixed(2)),
            elevation_m: Number(finalElev.toFixed(2)),
            rotation_deg: natDev ? natDev.rotationDeg : existing?.rotation_deg ?? 0,
            scale: existing?.scale ?? 1,
            hidden: false,
          };
          const exists = prevPlacements.some((p) => p.device_id === pendingSnapDeviceId);
          return {
            ...prev,
            placements: exists
              ? prevPlacements.map((p) =>
                  p.device_id === pendingSnapDeviceId ? nextPlacement : p
                )
              : [...prevPlacements, nextPlacement],
          };
        });

        setSnapTargetDeviceId(null);
        ghostGroup.visible = false;
        setTrayCollapsed(false);
        showNoticeRef.current(
          `Snapped ${dev.name} to ${room.name} (${coords.surface.toUpperCase()}${natSnap ? ` · ${finalElev.toFixed(2)}m` : ''})`,
          'info'
        );
        return;
      }

      // PRIORITY 0C (Phase 11C + 12B): Physical Appliance Tap-to-Snap + Auto-Snap Center/Heights
      const pendingApp = pendingApplianceKindRef.current;
      if (pendingApp) {
        const appHits = raycaster.intersectObjects(getVisibleStructuralMeshes(), false);
        if (appHits.length === 0) {
          showNoticeRef.current('Tap directly on a valid 3D surface', 'danger');
          return;
        }
        const hit = appHits[0];
        const meta = hit.object.userData as Partial<StructuralSurfaceUserData> | undefined;
        if (!meta) return;

        const floorId = meta.floorId ?? 'gf';
        const room = findBestRoomForPoint(floorId, hit.point.x, hit.point.z, meta.roomId);
        const surfType: SurfaceTagType = meta.surfaceType ?? 'floor';
        const validation = isSurfaceValidForAppliance(
          pendingApp,
          surfType,
          room?.floorType ?? null,
          floorId
        );
        if (!validation.valid) {
          showNoticeRef.current(validation.reason, 'danger');
          return;
        }
        if (!room) return;

        const preset = PHYSICAL_APPLIANCES_CATALOG.find((a) => a.kind === pendingApp);
        const floorSpec = getFloorForRoom(blueprintRef.current, room.id);
        const roomWallH = room.wallHeight ?? floorSpec.wallHeight;
        const coords = resolveSurfacePlacementCoords(
          hit,
          meta as StructuralSurfaceUserData,
          room,
          floorSpec.slabThickness + 0.01,
          roomWallH,
          preset?.defaultElevationM ?? 0.02,
          natSnap
        );

        const natApp = natSnap ? getNaturalApplianceMountSpec(pendingApp, roomWallH) : null;
        const finalElev = natApp ? natApp.elevationM : coords.elevationM;

        const newAppId = `app_${pendingApp}_${Date.now().toString(36).slice(-4)}`;
        const roomDevices = Object.values(devicesRef.current).filter((d) => d.room_id === room.id);
        const defaultDev =
          pendingApp === 'water_tank'
            ? Object.values(devicesRef.current).find((d) => d.module_code.startsWith('WAT-'))
            : roomDevices[0] ?? Object.values(devicesRef.current)[0];
        const defaultCap = defaultDev?.info?.capabilities?.find(
          (c) => c.type === 'switch' || c.type === 'level' || c.type === 'pump_switch'
        );

        const newAppliance: Layout3DAppliance = {
          id: newAppId,
          kind: pendingApp,
          label: preset?.label ?? pendingApp,
          room_id: room.id,
          floor_id: room.floorId,
          surface: coords.surface,
          offset_along: Number(coords.offsetAlong.toFixed(2)),
          offset_z: Number(coords.offsetZ.toFixed(2)),
          elevation_m: Number(finalElev.toFixed(2)),
          rotation_deg: natApp ? natApp.rotationDeg : 0,
          linked_device_id: defaultDev?.device_id ?? null,
          linked_channel_key: defaultCap?.key ?? null,
        };

        mutateLayoutRef.current((prev) => ({
          ...prev,
          appliances: [...(prev.appliances ?? []).slice(0, 63), newAppliance],
        }));
        setSelectedApplianceId(newAppId);
        setPendingApplianceKind(null);
        ghostGroup.visible = false;
        setTrayCollapsed(false);
        showNoticeRef.current(
          `Placed ${newAppliance.label} in ${room.name} (${coords.surface.toUpperCase()})`,
          'info'
        );
        return;
      }

      // Priority 0D: Physical Appliance Selection in Customize Mode (or toggle linked device!)
      const appClickHits = raycaster.intersectObjects(getVisibleApplianceMeshes(), false);
      if (appClickHits.length > 0) {
        const appMeta = appClickHits[0].object.userData as ApplianceControlUserData | undefined;
        if (appMeta?.applianceId) {
          if (customizeModeRef.current) {
            setSelectedApplianceId(appMeta.applianceId);
            setCustomizerTab('appliances');
            setTrayCollapsed(false);
            return;
          }
          const appObj = blueprintRef.current.appliances?.find((a) => a.id === appMeta.applianceId);
          if (appObj?.linked_device_id && appObj?.linked_channel_key) {
            const dev = devicesRef.current[appObj.linked_device_id];
            if (dev && dev.state.fault === null) {
              const cur = dev.state.state[appObj.linked_channel_key];
              const nextVal = typeof cur === 'number' ? (cur > 0 ? 0 : 2) : !Boolean(cur);
              onSendCommandRef.current(dev.device_id, { [appObj.linked_channel_key]: nextVal });
              showNoticeRef.current(`${appObj.label} → ${nextVal ? 'ON' : 'OFF'}`, 'info');
              return;
            }
          }
        }
      }

      // Priority 1: Direct 3D Hardware Models & Controls
      const hits = raycaster.intersectObjects(getVisibleControlMeshes(), false);
      if (hits.length > 0) {
        const hit = hits[0];
        const meta = hit.object.userData as HardwareControlUserData | undefined;
        if (meta?.deviceId) {
          const dev = devicesRef.current[meta.deviceId];
          const isAlreadyFocused = selectedDeviceIdRef.current === meta.deviceId;

          if (customizeModeRef.current) {
            setSelectedPlacementDeviceId(meta.deviceId);
            setCustomizerTab('devices');
            setTrayCollapsed(false);
            return;
          }

          if (!isAlreadyFocused) {
            focusModuleRef.current(meta.deviceId);
            return;
          }

          if (!dev) return;

          // G12 Read-Only Sensor Enforcement — NEVER emit .../cmd
          if (meta.readOnly || meta.controlKind === 'readonly_screen') {
            showNoticeRef.current(`${dev.name} is a G12 read-only display`, 'info');
            return;
          }

          // G10 Latched Fault Enforcement
          if (dev.state.fault !== null) {
            showNoticeRef.current(
              `Locked (${dev.state.fault}) — Hold physical button 3s on hardware`,
              'danger'
            );
            return;
          }

          if (meta.controlKind === 'rocker' && meta.capKey) {
            const capDef = dev.info?.capabilities?.find((c) => c.key === meta.capKey);
            if (capDef?.type === 'sensor') return;
            const nextVal = !Boolean(dev.state.state[meta.capKey]);
            onSendCommandRef.current(dev.device_id, { [meta.capKey]: nextVal });
            showNoticeRef.current(
              `${meta.label ?? meta.capKey} → ${nextVal ? 'ON' : 'OFF'}`,
              'info'
            );
            return;
          }

          if (meta.controlKind === 'fan_step' && meta.capKey) {
            const currentSpd = Math.round(Number(dev.state.state[meta.capKey] ?? 0));
            const nextSpd =
              meta.stepValue === undefined || meta.stepValue < 0
                ? (currentSpd + 1) % 5
                : Math.max(0, Math.min(4, meta.stepValue));
            onSendCommandRef.current(dev.device_id, { [meta.capKey]: nextSpd });
            showNoticeRef.current(
              nextSpd === 0 ? 'Fan Regulator → OFF' : `Fan Speed → ${nextSpd}/4`,
              'info'
            );
            return;
          }

          if (meta.controlKind === 'slider_track' && meta.capKey) {
            const tapDrag: ActiveSliderDrag = {
              deviceId: dev.device_id,
              capKey: meta.capKey,
              mesh: hit.object as THREE.Mesh,
              min: meta.sliderMin ?? 0,
              max: meta.sliderMax ?? 100,
              step: meta.sliderStep ?? 5,
              trackLength: meta.trackLength ?? 0.2,
              lastEmittedVal: -1,
              lastEmitMs: 0,
            };
            const val = computeSliderValueFromWorldPoint(tapDrag, hit.point);
            emitSliderValue(tapDrag, val, true);
            showNoticeRef.current(`${meta.label ?? meta.capKey} → ${val}%`, 'info');
            return;
          }

          return;
        }
      }

      // Priority 2: Edit Mode Structural Selection (ANY wall, door, window, floor, fence, roof, ground)
      if (customizeModeRef.current) {
        const structHits = raycaster.intersectObjects(getSelectableStructuralMeshes(), false);
        if (structHits.length > 0) {
          const sMeta = structHits[0].object.userData as Partial<StructuralSurfaceUserData> | undefined;
          if (sMeta?.elementId) {
            setSelectedElementId(sMeta.elementId);
            if (sMeta.roomId) {
              setSelectedEditRoomId(sMeta.roomId);
            }
            if (sMeta.floorId) {
              setActiveBuildFloorId(sMeta.floorId);
            }
            setCustomizerTab('build');
            setTrayCollapsed(false);
            return;
          }
        }
      }

      // Priority 3: Visible Room Floor Slabs
      const visibleRooms = archRef.current.roomHitMeshes.filter((mesh) =>
        isFloorVisibleNow(String(mesh.userData.floorId ?? ''))
      );
      const roomHits = raycaster.intersectObjects(visibleRooms, false);
      if (roomHits.length > 0 && roomHits[0].object.userData.roomId) {
        const hitRoomId = String(roomHits[0].object.userData.roomId);
        if (customizeModeRef.current) {
          setSelectedEditRoomId(hitRoomId);
          setSelectedElementId(null);
          setCustomizerTab('build');
          setTrayCollapsed(false);
        } else {
          focusRoomRef.current(hitRoomId);
        }
        return;
      }
    };

    const onPointerCancel = () => {
      endElementDrag(false);
      endSliderDrag();
    };

    const canvasEl = renderer.domElement;
    canvasEl.style.touchAction = 'none';
    canvasEl.addEventListener('pointerdown', onPointerDown);
    canvasEl.addEventListener('pointermove', onPointerMove);
    canvasEl.addEventListener('pointerup', onPointerUp);
    canvasEl.addEventListener('pointercancel', onPointerCancel);

    // 9. ResizeObserver for seamless full-viewport & fullscreen sizing
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = Math.max(240, mountRef.current.clientWidth);
      const h = Math.max(240, mountRef.current.clientHeight);
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    // 10. Animation Loop + Rolling Low-FPS Eco 2D Fallback Detector
    const clock = new THREE.Clock();
    let elapsedTotal = 0;
    let frameId = 0;
    let disposed = false;

    let fpsWindowFrames = 0;
    let fpsWindowStart = performance.now();
    let consecutiveLowWindows = 0;

    const afterDraw = (cb: () => void) => {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(0.05, Math.max(0.001, clock.getDelta()));
      elapsedTotal += dt;

      // Rolling FPS detector (offers 1-tap Eco 2D fallback on struggling budget Android phones)
      if (!isSoftwareGl && !lowFpsDismissedRef.current && document.visibilityState === 'visible') {
        fpsWindowFrames += 1;
        const nowMs = performance.now();
        const elapsedMs = nowMs - fpsWindowStart;
        if (elapsedMs >= 2500) {
          const avgFps = (fpsWindowFrames * 1000) / elapsedMs;
          if (avgFps < 16) {
            consecutiveLowWindows += 1;
            if (consecutiveLowWindows >= 2) {
              setLowFpsBanner(true);
            }
          } else {
            consecutiveLowWindows = 0;
          }
          fpsWindowFrames = 0;
          fpsWindowStart = nowMs;
        }
      }

      // A. Update Free Camera + Smooth Focus Transitions
      controller.update(dt);

      const builtArch = archRef.current;
      const bp = blueprintRef.current;

      if (builtArch) {
        // B. Animate Procedural 3D Hardware & Physical Appliance Models
        builtArch.hardwareModels.forEach((model) => {
          model.animate(dt, elapsedTotal);
        });
        builtArch.applianceModels.forEach((appModel) => {
          appModel.animate(dt, elapsedTotal);
        });

        // C. Animate Multi-Floor Vertical Separation, Visibility Toggle & Fade
        const selectedFloor = activeFloorRef.current;
        const selectedFloorIdx =
          selectedFloor === 'all'
            ? builtArch.floors.length - 1
            : builtArch.floors.findIndex((f) => f.spec.id === selectedFloor);

        for (const fl of builtArch.floors) {
          const floorHiddenByOwner = fl.spec.visible === false;
          const isAbove = selectedFloor !== 'all' && fl.index > selectedFloorIdx;
          const isBelow = selectedFloor !== 'all' && fl.index < selectedFloorIdx;
          const targetLiftY = isAbove ? 2.8 * (fl.index - selectedFloorIdx) : 0;
          const targetOpacity = floorHiddenByOwner
            ? 0
            : isAbove
            ? 0
            : isBelow
            ? 0.72
            : 1;

          fl.currentLiftY = THREE.MathUtils.damp(fl.currentLiftY, targetLiftY, 7, dt);
          fl.currentOpacity = THREE.MathUtils.damp(fl.currentOpacity, targetOpacity, 8, dt);

          fl.group.position.y = fl.spec.baseY + fl.currentLiftY;
          fl.group.visible = !floorHiddenByOwner && fl.currentOpacity > 0.03;

          if (fl.group.visible) {
            for (const mat of fl.materials) {
              const baseOp = mat.depthWrite === false ? 0.34 : 1;
              mat.opacity = baseOp * fl.currentOpacity;
            }
          }
        }

        // D. Smart Auto-Cutaway ("Dollhouse") Walls — Keep walls upright during Tap-to-Snap!
        const cutawayOn =
          autoCutawayRef.current &&
          !snapTargetDeviceIdRef.current &&
          !pendingBuildKindRef.current &&
          !pendingApplianceKindRef.current;
        const camX = camera.position.x;
        const camZ = camera.position.z;
        const focusedDevId = selectedDeviceIdRef.current;
        const focusedModel = focusedDevId
          ? builtArch.hardwareModels.get(focusedDevId) ?? null
          : null;

        for (const wall of builtArch.wallCutaways) {
          let targetScaleY = 1;
          const isFocusedMountWall =
            focusedModel !== null &&
            focusedModel.mountWallKey !== null &&
            wall.roomId === focusedModel.roomId &&
            wall.wallKey === focusedModel.mountWallKey;

          if (isFocusedMountWall) {
            targetScaleY = 1;
          } else if (cutawayOn) {
            const dx = camX - wall.roomCenterX;
            const dz = camZ - wall.roomCenterZ;
            const len = Math.hypot(dx, dz) || 1;
            const dot = (dx / len) * wall.normalX + (dz / len) * wall.normalZ;
            if (dot > 0.2) {
              targetScaleY = wall.isParapet ? 0.52 : 0.18;
            }
          }
          wall.currentScaleY = THREE.MathUtils.damp(wall.currentScaleY, targetScaleY, 9, dt);
          wall.group.scale.y = wall.currentScaleY;
        }
      }

      // E. Render Frame
      renderer.render(scene, camera);

      // F. Project Floating Room Name Labels directly to DOM refs
      const labelsEnabled =
        showRoomLabelsRef.current &&
        selectedDeviceIdRef.current === null &&
        !snapTargetDeviceIdRef.current &&
        !pendingBuildKindRef.current &&
        !pendingApplianceKindRef.current;
      const rectW = canvasEl.clientWidth;
      const rectH = canvasEl.clientHeight;
      if (builtArch) {
        const selectedFloor = activeFloorRef.current;
        for (const room of bp.rooms) {
          const labelEl = roomLabelElsRef.current.get(room.id);
          if (!labelEl) continue;

          const flEntry = builtArch.floors.find((f) => f.spec.id === room.floorId);
          const isCoveredByUpperSlab =
            selectedFloor === 'all' &&
            flEntry !== undefined &&
            builtArch.floors.some(
              (upperFl) =>
                upperFl.index > flEntry.index &&
                upperFl.group.visible &&
                upperFl.currentOpacity > 0.25 &&
                bp.rooms.some(
                  (ur) =>
                    ur.floorId === upperFl.spec.id &&
                    Math.abs(room.x - ur.x) <= ur.w / 2 + 0.15 &&
                    Math.abs(room.z - ur.z) <= ur.d / 2 + 0.15
                )
            );

          const visibleOnFloor =
            labelsEnabled &&
            flEntry &&
            flEntry.group.visible &&
            !isCoveredByUpperSlab &&
            (selectedFloor === 'all' || room.floorId === selectedFloor);

          if (!visibleOnFloor) {
            labelEl.style.opacity = '0';
            labelEl.style.pointerEvents = 'none';
            continue;
          }

          _projVec.set(
            room.x,
            flEntry.group.position.y + flEntry.spec.slabThickness + 0.2,
            room.z
          );
          _projVec.project(camera);

          const inFront = _projVec.z >= -1 && _projVec.z <= 1;
          const px = (_projVec.x * 0.5 + 0.5) * rectW;
          const py = (-_projVec.y * 0.5 + 0.5) * rectH;
          const inBounds = px > 48 && px < rectW - 48 && py > 68 && py < rectH - 56;

          if (!inFront || !inBounds) {
            labelEl.style.opacity = '0';
            labelEl.style.pointerEvents = 'none';
          } else {
            labelEl.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%)`;
            labelEl.style.opacity = '1';
            labelEl.style.pointerEvents = 'auto';
          }
        }
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      ro.disconnect();
      controller.controls.removeEventListener('start', onOrbitStart);
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      canvasEl.removeEventListener('pointermove', onPointerMove);
      canvasEl.removeEventListener('pointerup', onPointerUp);
      canvasEl.removeEventListener('pointercancel', onPointerCancel);
      controller.dispose();
      if (archRef.current) {
        scene.remove(archRef.current.rootGroup);
        archRef.current.dispose();
        archRef.current = null;
      }
      groundGeo.dispose();
      groundMat.dispose();
      ghostBoxGeo.dispose();
      ghostBoxMat.dispose();
      ghostRingGeo.dispose();
      ghostRingMat.dispose();
      selEdgesGeo.dispose();
      selEdgesMat.dispose();
      selectionBoxRef.current = null;
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
      contactPlaneRef.current = null;
    };
  }, [ecoMode, resolvedLightMode, isSoftwareGl]);

  const effectiveXrayWiring = xrayWiring || (customizeMode && customizerTab === 'appliances');

  // EFFECT 2: Hot-Swap Architectural Mesh & Placed Hardware Models (Preserves Camera & WebGL Context!)
  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (ecoMode || !scene || !renderer) return;

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
      xrayWiring: effectiveXrayWiring,
      selectedApplianceId: customizeMode ? selectedApplianceId : null,
    });

    // Apply active floor visibility synchronously BEFORE mounting to scene (zero 1-frame flash)
    const selectedFloor = activeFloorRef.current;
    const selectedFloorIdx =
      selectedFloor === 'all'
        ? builtArch.floors.length - 1
        : builtArch.floors.findIndex((f) => f.spec.id === selectedFloor);

    for (const fl of builtArch.floors) {
      const floorHiddenByOwner = fl.spec.visible === false;
      const isAbove = selectedFloor !== 'all' && fl.index > selectedFloorIdx;
      const isBelow = selectedFloor !== 'all' && fl.index < selectedFloorIdx;
      const targetLiftY = isAbove ? 2.8 * (fl.index - selectedFloorIdx) : 0;
      const targetOpacity = floorHiddenByOwner ? 0 : isAbove ? 0 : isBelow ? 0.72 : 1;

      fl.currentLiftY = targetLiftY;
      fl.currentOpacity = targetOpacity;
      fl.group.position.y = fl.spec.baseY + targetLiftY;
      fl.group.visible = !floorHiddenByOwner && targetOpacity > 0.03;

      for (const mat of fl.materials) {
        const baseOp = mat.depthWrite === false ? 0.34 : 1;
        mat.opacity = baseOp * targetOpacity;
      }
    }

    scene.add(builtArch.rootGroup);
    archRef.current = builtArch;

    if (contactPlaneRef.current) {
      contactPlaneRef.current.position.set(blueprint.centerX, -0.015, blueprint.centerZ);
    }

    if (lastSnappedTemplateRef.current !== blueprint.templateId && controllerRef.current) {
      const centerY = blueprint.floors.length > 2 ? 2.4 : 1.4;
      controllerRef.current.snapToOverview(blueprint, centerY);
      lastSnappedTemplateRef.current = blueprint.templateId;
    }

    builtArch.hardwareModels.forEach((model, devId) => {
      const dev = devicesRef.current[devId];
      if (dev) model.updateFromDevice(dev, tariffInrRef.current);
    });
    builtArch.applianceModels.forEach((appModel) => {
      appModel.updateFromDevices(devicesRef.current);
    });
    syncSelectionOutlineRef.current();
  }, [blueprint, ecoMode, resolvedLightMode, isSoftwareGl, effectiveXrayWiring, customizeMode, selectedApplianceId]);

  // Live Device Telemetry & Status Sync into Procedural 3D Hardware & Appliance Models (Zero geometry rebuilds)
  useEffect(() => {
    devicesRef.current = devices;
    const arch = archRef.current;
    if (!arch) return;

    arch.hardwareModels.forEach((model, devId) => {
      const dev = devices[devId];
      if (dev) {
        model.updateFromDevice(dev, tariffInr);
      }
    });
    arch.applianceModels.forEach((appModel) => {
      appModel.updateFromDevices(devices);
    });
  }, [devices, tariffInr]);

  const handleToggleLoad = (dev: VirtualDeviceInstance, key: string, nextVal: boolean | number) => {
    if (dev.state.fault !== null) {
      showTransientNotice(`Locked (${dev.state.fault}) — Hold physical button 3s`, 'danger');
      return;
    }
    const capDef = dev.info?.capabilities?.find((c) => c.key === key);
    if (capDef?.type === 'sensor') return; // G12 strict read-only guard
    onSendCommand(dev.device_id, { [key]: nextVal });
  };

  const handleToggleCustomizeMode = () => {
    setOpenMenu(null);
    if (!allowCustomize) {
      showTransientNotice('Only the Home Owner or Installer can customize 3D layout', 'info');
      return;
    }
    setCustomizeMode((prev) => {
      const next = !prev;
      if (next) {
        setLayout3D((curr) => ensureMaterializedStructure(curr, devicesRef.current));
        setSelectedDeviceId(null);
        setTouchControlsOpen(false);
        setFocusedRoomId(null);
        setTrayCollapsed(false);
        if (!selectedEditRoomId && layout3D.rooms?.[0]) {
          setSelectedEditRoomId(layout3D.rooms[0].id);
        }
      } else {
        setSelectedElementId(null);
        setSnapTargetDeviceId(null);
        setPendingBuildKind(null);
        setPendingApplianceKind(null);
      }
      return next;
    });
  };

  const selectedDev = selectedDeviceId ? devices[selectedDeviceId] ?? null : null;
  const focusedRoom = focusedRoomId
    ? blueprint.rooms.find((r) => r.id === focusedRoomId) ?? null
    : null;
  const focusedRoomPins = focusedRoom
    ? blueprint.pins.filter((p) => p.room_id === focusedRoom.id)
    : [];

  const activeFloorLabel =
    effectiveActiveFloor === 'all'
      ? 'All Floors'
      : blueprint.floors.find((f) => f.id === effectiveActiveFloor)?.label ?? 'Ground Floor';

  const cameraModeLabel =
    cameraMode === 'free' ? 'Free Orbit' : cameraMode === 'iso' ? 'Isometric' : 'Top-Down';

  // Floating surface palette without backdrop-blur over WebGL (Three.js Directive #4)
  const overlayBg = resolvedLightMode
    ? 'bg-[rgba(255,255,255,0.92)] border-slate-300/90 text-slate-900'
    : 'bg-[rgba(15,23,42,0.88)] border-slate-700/80 text-slate-100';

  const menuBg = resolvedLightMode
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-slate-900 border-slate-700 text-slate-100';

  const verticalFloors: Array<{ id: FloorFilter; label: string }> = [
    { id: 'all', label: 'All' },
    ...[...blueprint.floors].reverse().map((f) => ({
      id: f.id as FloorFilter,
      label: f.shortLabel,
    })),
  ];

  return (
    <div
      ref={shellRef}
      className={cn(
        'relative w-full overflow-hidden flex flex-col border border-border bg-surface',
        isFullscreen
          ? usingCssFullscreen
            ? 'fixed inset-0 z-50 h-screen w-screen rounded-none border-0'
            : 'h-screen w-screen rounded-none border-0'
          : 'h-[calc(100dvh-136px)] md:h-[calc(100dvh-96px)] min-h-[500px] rounded-2xl shadow-xl'
      )}
    >
      {/* Compact Top Bar: Opaque docked header in Eco 2D, floating bar in 3D */}
      {ecoMode ? (
        <div
          ref={topBarRef}
          className="relative z-30 flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-surface shrink-0"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {onExitTo2D && (
              <button
                type="button"
                onClick={onExitTo2D}
                aria-label="Back to 2D Home"
                className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-surface-elevated px-2.5 text-xs font-semibold text-foreground hover:border-accent transition-colors cursor-pointer shrink-0"
              >
                <ArrowLeft className="h-3.5 w-3.5 text-accent shrink-0" />
                <span className="hidden sm:inline">2D</span>
              </button>
            )}

            <div className="relative min-w-0">
              <button
                type="button"
                onClick={() => setOpenMenu((m) => (m === 'floor' ? null : 'floor'))}
                aria-expanded={openMenu === 'floor'}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-surface-elevated px-2.5 text-xs font-medium text-foreground hover:border-accent transition-colors cursor-pointer whitespace-nowrap"
              >
                <Layers className="h-3.5 w-3.5 text-accent shrink-0" />
                <span className="max-w-[96px] sm:max-w-none truncate">{activeFloorLabel}</span>
                <ChevronDown className="h-3 w-3 opacity-70 shrink-0" />
              </button>

              {openMenu === 'floor' && (
                <div
                  className={cn(
                    'absolute left-0 top-full mt-1.5 w-48 rounded-xl border p-1.5 shadow-2xl z-40 space-y-0.5 text-xs',
                    menuBg
                  )}
                >
                  <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider opacity-60">
                    Floors · {blueprint.templateId.toUpperCase()}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectFloor('all')}
                    className={cn(
                      'w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors cursor-pointer',
                      effectiveActiveFloor === 'all' ? 'bg-accent-soft text-accent font-semibold' : 'hover:bg-surface-elevated'
                    )}
                  >
                    <span>All Floors</span>
                    {effectiveActiveFloor === 'all' && <Check className="h-3.5 w-3.5" />}
                  </button>
                  {[...blueprint.floors].reverse().map((fl) => (
                    <button
                      key={fl.id}
                      type="button"
                      onClick={() => handleSelectFloor(fl.id)}
                      className={cn(
                        'w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors cursor-pointer',
                        effectiveActiveFloor === fl.id ? 'bg-accent-soft text-accent font-semibold' : 'hover:bg-surface-elevated',
                        fl.visible === false && 'opacity-50'
                      )}
                    >
                      <span className="truncate">{fl.label}</span>
                      <span className="text-[10px] font-mono opacity-65">{fl.shortLabel}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpenMenu(null);
              setCustomizeMode(false);
              setSnapTargetDeviceId(null);
              setEcoMode(false);
            }}
            title="Switch back to 3D Home Twin"
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-semibold text-[var(--dd-accent-fg)] shadow-sm hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
          >
            <Box className="h-3.5 w-3.5 shrink-0" />
            <span>Switch to 3D</span>
          </button>
        </div>
      ) : (
        <div
          ref={topBarRef}
          className={cn(
            'absolute inset-x-3 z-30 flex items-center justify-between gap-1.5 pointer-events-none',
            isFullscreen && usingCssFullscreen
              ? 'top-[max(1rem,env(safe-area-inset-top))]'
              : 'top-3.5 sm:top-4'
          )}
        >
          {/* Left Group: [Back/2D] | [Floor Selector ▾] | [Camera Mode ▾] */}
          <div className="pointer-events-auto flex items-center gap-1 min-w-0">
            {onExitTo2D && (
              <button
                type="button"
                onClick={onExitTo2D}
                aria-label="Back to 2D Home"
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold shadow-md transition-colors cursor-pointer shrink-0',
                  overlayBg
                )}
              >
                <ArrowLeft className="h-3.5 w-3.5 text-accent shrink-0" />
                <span className="hidden sm:inline">2D</span>
              </button>
            )}

            {/* [Floor Selector ▾] */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenMenu((m) => (m === 'floor' ? null : 'floor'))}
                aria-expanded={openMenu === 'floor'}
                className={cn(
                  'inline-flex h-9 items-center gap-1 rounded-full border px-2.5 text-xs font-medium shadow-md transition-colors cursor-pointer whitespace-nowrap',
                  overlayBg
                )}
              >
                <Layers className="h-3.5 w-3.5 text-accent shrink-0" />
                <span className="max-w-[82px] sm:max-w-none truncate">{activeFloorLabel}</span>
                <ChevronDown className="h-3 w-3 opacity-70 shrink-0" />
              </button>

              {openMenu === 'floor' && (
                <div
                  className={cn(
                    'absolute left-0 top-full mt-1.5 w-48 rounded-xl border p-1.5 shadow-2xl z-40 space-y-0.5 text-xs',
                    menuBg
                  )}
                >
                  <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider opacity-60">
                    Floors · {blueprint.templateId.toUpperCase()}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectFloor('all')}
                    className={cn(
                      'w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors cursor-pointer',
                      effectiveActiveFloor === 'all' ? 'bg-accent-soft text-accent font-semibold' : 'hover:bg-surface-elevated'
                    )}
                  >
                    <span>All Floors</span>
                    {effectiveActiveFloor === 'all' && <Check className="h-3.5 w-3.5" />}
                  </button>
                  {[...blueprint.floors].reverse().map((fl) => (
                    <button
                      key={fl.id}
                      type="button"
                      onClick={() => handleSelectFloor(fl.id)}
                      className={cn(
                        'w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors cursor-pointer',
                        effectiveActiveFloor === fl.id ? 'bg-accent-soft text-accent font-semibold' : 'hover:bg-surface-elevated',
                        fl.visible === false && 'opacity-50'
                      )}
                    >
                      <span className="truncate">{fl.label}</span>
                      <span className="text-[10px] font-mono opacity-65">{fl.shortLabel}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* [Camera Mode ▾] */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenMenu((m) => (m === 'camera' ? null : 'camera'))}
                aria-expanded={openMenu === 'camera'}
                className={cn(
                  'inline-flex h-9 items-center gap-1 rounded-full border px-2.5 text-xs font-medium shadow-md transition-colors cursor-pointer whitespace-nowrap',
                  overlayBg
                )}
              >
                <Compass className="h-3.5 w-3.5 text-accent shrink-0" />
                <span className="hidden min-[440px]:inline">{cameraModeLabel}</span>
                <ChevronDown className="h-3 w-3 opacity-70 shrink-0" />
              </button>

              {openMenu === 'camera' && (
                <div
                  className={cn(
                    'absolute left-0 top-full mt-1.5 w-48 rounded-xl border p-1.5 shadow-2xl z-40 space-y-0.5 text-xs',
                    menuBg
                  )}
                >
                  <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider opacity-60">
                    Camera Mode
                  </div>
                  {(
                    [
                      { id: 'free', label: 'Free Orbit' },
                      { id: 'iso', label: 'Isometric' },
                      { id: 'top', label: 'Top-Down Plan' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectCameraMode(opt.id)}
                      className={cn(
                        'w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors cursor-pointer',
                        cameraMode === opt.id
                          ? 'bg-accent-soft text-accent font-semibold'
                          : 'hover:bg-surface-elevated'
                      )}
                    >
                      <span>{opt.label}</span>
                      {cameraMode === opt.id && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                  <div className="my-1 border-t border-border/60 pt-1">
                    <button
                      type="button"
                      onClick={resetCamera}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-elevated cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-accent" />
                      <span>Reset View</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Group: [Customize 3D] | [Fullscreen] | [Eco 2D] */}
          <div className="pointer-events-auto flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleToggleCustomizeMode}
              aria-pressed={customizeMode}
              aria-label="Customize 3D layout"
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium shadow-md transition-colors cursor-pointer whitespace-nowrap',
                customizeMode
                  ? 'border-accent bg-accent text-[var(--dd-accent-fg)] font-semibold'
                  : overlayBg
              )}
            >
              <SlidersHorizontal className={cn('h-3.5 w-3.5 shrink-0', !customizeMode && 'text-accent')} />
              <span className="hidden md:inline">
                {customizeMode ? (isDirty ? 'Editing*' : 'Editing 3D') : 'Customize 3D'}
              </span>
            </button>

            {/* [Fullscreen] */}
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen 3D view'}
              title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen'}
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-md transition-colors cursor-pointer shrink-0',
                overlayBg
              )}
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>

            {/* [Eco 2D] */}
            <button
              type="button"
              onClick={() => {
                setOpenMenu(null);
                setCustomizeMode(false);
                setSnapTargetDeviceId(null);
                setEcoMode(true);
              }}
              title="Switch between 3D Home Twin and low-power Eco 2D Room Grid"
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold shadow-md transition-colors cursor-pointer whitespace-nowrap shrink-0',
                overlayBg
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5 text-accent shrink-0" />
              <span className="hidden sm:inline">Eco 2D</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Full-Bleed Viewport (Three.js WebGL completely unmounted when ecoMode=true) */}
      {!ecoMode ? (
        <div className="relative flex-1 w-full h-full">
          {/* Isolated WebGL Canvas Mount */}
          <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

          {/* Subtle Clickable Floating Room Name Labels (Positioned via direct DOM refs) */}
          <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
            {blueprint.rooms.map((room) => (
              <button
                key={room.id}
                ref={(el) => {
                  if (el) {
                    roomLabelElsRef.current.set(room.id, el);
                  } else {
                    roomLabelElsRef.current.delete(room.id);
                  }
                }}
                type="button"
                onClick={() => {
                  if (customizeMode) {
                    setSelectedEditRoomId(room.id);
                    setSelectedElementId(null);
                    setCustomizerTab('build');
                    setTrayCollapsed(false);
                  } else {
                    focusRoom(room.id);
                  }
                }}
                style={{ opacity: 0, pointerEvents: 'none' }}
                className={cn(
                  'absolute top-0 left-0 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide shadow-sm transition-colors cursor-pointer whitespace-nowrap',
                  (customizeMode ? selectedEditRoomId === room.id : focusedRoomId === room.id)
                    ? 'border-accent bg-accent text-[var(--dd-accent-fg)] font-semibold'
                    : resolvedLightMode
                    ? 'border-slate-300/90 bg-[rgba(255,255,255,0.86)] text-slate-800 hover:border-accent'
                    : 'border-slate-600/80 bg-[rgba(15,23,42,0.82)] text-slate-100 hover:border-accent'
                )}
              >
                {room.shortName}
              </button>
            ))}
          </div>

          {/* Left-Edge Compact Vertical Floor Switcher */}
          <div
            aria-label="Floor switcher"
            className={cn(
              'absolute left-2.5 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1 rounded-2xl border p-1 shadow-lg',
              overlayBg
            )}
          >
            {verticalFloors.map((fl) => {
              const active = effectiveActiveFloor === fl.id;
              return (
                <button
                  key={fl.id}
                  type="button"
                  onClick={() => handleSelectFloor(fl.id)}
                  className={cn(
                    'h-8 min-w-[36px] px-1.5 rounded-xl text-[10px] font-mono font-bold transition-colors cursor-pointer',
                    active
                      ? 'bg-accent text-[var(--dd-accent-fg)] shadow-sm'
                      : 'opacity-75 hover:opacity-100 hover:bg-surface-elevated/60'
                  )}
                >
                  {fl.label}
                </button>
              );
            })}
          </div>

          {/* Rolling Low-FPS Eco 2D Suggestion Pill (Budget Android Protection) */}
          {lowFpsBanner && !lowFpsDismissed && (
            <div className="absolute top-16 inset-x-3 z-25 flex justify-center pointer-events-none">
              <div
                className={cn(
                  'pointer-events-auto inline-flex items-center gap-2 rounded-full border border-amber-500/60 px-3 py-1.5 text-[11px] shadow-xl',
                  overlayBg
                )}
              >
                <Gauge className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="font-medium">Low 3D FPS detected</span>
                <button
                  type="button"
                  onClick={() => {
                    setLowFpsBanner(false);
                    setCustomizeMode(false);
                    setEcoMode(true);
                  }}
                  className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-semibold text-[var(--dd-accent-fg)] cursor-pointer"
                >
                  Switch to Eco 2D
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLowFpsBanner(false);
                    setLowFpsDismissed(true);
                  }}
                  aria-label="Dismiss low FPS notice"
                  className="p-0.5 opacity-70 hover:opacity-100 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Transient 3D Action / G10 Lockout Notice Pill */}
          {hudNotice && (
            <div
              className={cn(
                'absolute inset-x-3 z-20 flex justify-center pointer-events-none',
                lowFpsBanner && !lowFpsDismissed ? 'top-28' : 'top-16'
              )}
            >
              <div
                className={cn(
                  'rounded-full border px-3 py-1 text-[11px] font-mono font-semibold shadow-lg',
                  hudNotice.tone === 'danger'
                    ? 'border-rose-500/70 bg-rose-950/95 text-rose-100'
                    : overlayBg
                )}
              >
                {hudNotice.text}
              </div>
            </div>
          )}

          {/* Phase 11C 3-Tab Modular Studio Tray OR Standard Slim Focus Strip */}
          {customizeMode ? (
            <Home3DCustomizerTray
              layout={layout3D}
              devices={devices}
              activeTab={customizerTab}
              onTabChange={(tab) => {
                setCustomizerTab(tab);
                if (tab === 'appliances') {
                  setXrayWiring(true);
                }
              }}
              collapsed={trayCollapsed}
              onToggleCollapsed={() => setTrayCollapsed((c) => !c)}
              activeBuildFloorId={effectiveBuildFloorId}
              onSelectBuildFloor={(flId) => {
                setActiveBuildFloorId(flId);
                handleSelectFloor(flId);
              }}
              selectedRoomId={selectedEditRoomId}
              onSelectRoom={(rmId) => {
                setSelectedEditRoomId(rmId);
                if (rmId) {
                  const rm = blueprint.rooms.find((r) => r.id === rmId);
                  if (rm) {
                    const fl = getFloorForRoom(blueprint, rm.id);
                    controllerRef.current?.focusRoom(rm, fl.baseY);
                  }
                }
              }}
              selectedElementId={selectedElementId}
              onSelectElement={setSelectedElementId}
              pendingBuildKind={pendingBuildKind}
              onStartBuildPlacement={(kind) => {
                setSnapTargetDeviceId(null);
                setPendingApplianceKind(null);
                setPendingBuildKind(kind);
                setTrayCollapsed(true);
              }}
              onCancelBuildPlacement={() => {
                setPendingBuildKind(null);
                setTrayCollapsed(false);
              }}
              selectedPlacementDeviceId={selectedPlacementDeviceId}
              onSelectPlacementDevice={(devId) => {
                setSelectedPlacementDeviceId(devId);
                if (devId) {
                  const model = archRef.current?.hardwareModels.get(devId);
                  if (model && controllerRef.current) {
                    model.rootGroup.getWorldPosition(_worldPos);
                    controllerRef.current.focusModule(
                      _worldPos,
                      model.frontNormal,
                      Math.max(1.8, model.focusDistance),
                      model.focusTargetOffsetY
                    );
                  }
                }
              }}
              snapTargetDeviceId={snapTargetDeviceId}
              onStartSnapPlacement={(devId) => {
                setPendingBuildKind(null);
                setPendingApplianceKind(null);
                setSnapTargetDeviceId(devId);
                setTrayCollapsed(true);
              }}
              onCancelSnapPlacement={() => {
                setSnapTargetDeviceId(null);
                setTrayCollapsed(false);
              }}
              selectedApplianceId={selectedApplianceId}
              onSelectAppliance={setSelectedApplianceId}
              pendingApplianceKind={pendingApplianceKind}
              onStartAppliancePlacement={(kind) => {
                setPendingBuildKind(null);
                setSnapTargetDeviceId(null);
                setPendingApplianceKind(kind);
                setTrayCollapsed(true);
              }}
              onCancelAppliancePlacement={() => {
                setPendingApplianceKind(null);
                setTrayCollapsed(false);
              }}
              xrayWiring={effectiveXrayWiring}
              onToggleXrayWiring={() => setXrayWiring((v) => !v)}
              onApplyTemplate={handleApplyTemplate}
              onResetTemplate={handleResetTemplate}
              onMutateLayout={mutateLayout}
              autoCutaway={autoCutaway}
              onToggleAutoCutaway={() => setAutoCutaway((v) => !v)}
              showRoomLabels={showRoomLabels}
              onToggleRoomLabels={() => setShowRoomLabels((v) => !v)}
              naturalSnap={naturalSnap}
              onToggleNaturalSnap={() => setNaturalSnap((v) => !v)}
              onPreviewElement={previewElementInScene}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onSave={() => void handleSaveLayout()}
              saving={savingLayout}
              isDirty={isDirty}
              onClose={() => {
                setCustomizeMode(false);
                setSelectedElementId(null);
                setSnapTargetDeviceId(null);
                setPendingBuildKind(null);
                setPendingApplianceKind(null);
              }}
              isLightTheme={resolvedLightMode}
              isAdminInstaller={isAdminInstaller}
            />
          ) : (
            <div className="absolute bottom-3 inset-x-3 z-20 flex flex-col items-center gap-1.5 pointer-events-none">
              {selectedDev ? (
                <>
                  {touchControlsOpen && (
                    <div
                      className={cn(
                        'pointer-events-auto w-full max-w-md rounded-2xl border p-2.5 shadow-2xl space-y-2 text-xs',
                        overlayBg
                      )}
                    >
                      {selectedDev.state.fault !== null ? (
                        <div className="flex items-center gap-2 rounded-xl border border-rose-500/45 bg-rose-500/15 px-2.5 py-2 text-[11px] font-mono text-rose-400">
                          <KeyRound className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            G10 LOCKED ({selectedDev.state.fault}) — Hold physical button 3s on hardware
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selectedDev.info.capabilities.some(
                            (c) => c.type === 'switch' || c.type === 'pump_switch'
                          ) && (
                            <div className="flex flex-wrap gap-1.5">
                              {selectedDev.info.capabilities
                                .filter((c) => c.type === 'switch' || c.type === 'pump_switch')
                                .map((cap) => {
                                  const isOn = Boolean(selectedDev.state.state[cap.key]);
                                  return (
                                    <button
                                      key={cap.key}
                                      type="button"
                                      onClick={() => handleToggleLoad(selectedDev, cap.key, !isOn)}
                                      className={cn(
                                        'h-7 px-2.5 rounded-lg text-[11px] font-mono font-semibold border transition-colors cursor-pointer',
                                        isOn
                                          ? 'border-emerald-500/60 bg-emerald-500 text-slate-950'
                                          : 'border-border/80 bg-surface-elevated hover:border-accent'
                                      )}
                                    >
                                      {cap.label}: {isOn ? 'ON' : 'OFF'}
                                    </button>
                                  );
                                })}
                            </div>
                          )}

                          {selectedDev.info.capabilities
                            .filter((c): c is LevelCapability => c.type === 'level')
                            .map((cap) => {
                              const currentVal = Number(selectedDev.state.state[cap.key] ?? cap.min);
                              if (cap.max <= 5) {
                                return (
                                  <div
                                    key={cap.key}
                                    className="flex items-center justify-between gap-2 font-mono text-[11px]"
                                  >
                                    <span className="opacity-80">{cap.label}</span>
                                    <div className="flex gap-1">
                                      {[0, 1, 2, 3, 4].map((spd) => (
                                        <button
                                          key={spd}
                                          type="button"
                                          onClick={() => handleToggleLoad(selectedDev, cap.key, spd)}
                                          className={cn(
                                            'h-7 min-w-[28px] px-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer',
                                            currentVal === spd
                                              ? 'bg-accent text-[var(--dd-accent-fg)]'
                                              : 'bg-surface-elevated hover:bg-surface-muted'
                                          )}
                                        >
                                          {spd === 0 ? 'OFF' : spd}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <PrecisionSlider
                                  key={cap.key}
                                  compact
                                  label={cap.label}
                                  unit="%"
                                  min={cap.min}
                                  max={cap.max}
                                  step={cap.step ?? 5}
                                  value={currentVal}
                                  onChange={(val) =>
                                    handleToggleLoad(selectedDev, cap.key, val)
                                  }
                                />
                              );
                            })}

                          {!selectedDev.info.capabilities.some(
                            (c) =>
                              c.type === 'switch' || c.type === 'pump_switch' || c.type === 'level'
                          ) && (
                            <div className="text-[11px] font-mono opacity-75">
                              {selectedDev.module_code === 'VEH-01'
                                ? 'Vehicle safety controls & PIN-gated immobilizer live on the Full Vehicle Page.'
                                : 'G12 read-only live telemetry hardware display (no remote actuation).'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ONE Tiny Non-Blocking Floating Focus Strip */}
                  <div
                    className={cn(
                      'pointer-events-auto flex items-center gap-1.5 rounded-full border px-2 py-1.5 shadow-2xl text-xs max-w-full',
                      overlayBg
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const roomId = focusedRoomId ?? selectedDev.room_id;
                        if (roomId && blueprint.rooms.some((r) => r.id === roomId)) {
                          focusRoom(roomId);
                        } else {
                          resetCamera();
                        }
                      }}
                      className="inline-flex h-7 items-center gap-1 rounded-full border border-border/70 px-2.5 text-[11px] font-semibold hover:border-accent cursor-pointer shrink-0"
                    >
                      <ArrowLeft className="h-3 w-3 text-accent shrink-0" />
                      <span className="hidden sm:inline">Back to Room</span>
                      <span className="sm:hidden">Room</span>
                    </button>

                    <div className="min-w-0 flex items-center gap-1.5 px-1">
                      <span className="font-semibold truncate max-w-[110px] sm:max-w-[165px]">
                        {selectedDev.name}
                      </span>
                      {selectedDev.state.fault !== null ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/20 border border-rose-500/50 px-1.5 py-0.5 text-[10px] font-mono font-bold text-rose-500 shrink-0">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          <span>LOCKED</span>
                        </span>
                      ) : (
                        <span className="hidden min-[420px]:inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 px-1.5 py-0.5 text-[10px] font-mono text-emerald-500 shrink-0">
                          <CheckCircle className="h-2.5 w-2.5" />
                          <span>{selectedDev.module_code}</span>
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setTouchControlsOpen((v) => !v)}
                      aria-expanded={touchControlsOpen}
                      title="Quick touch controls fallback"
                      className={cn(
                        'inline-flex h-7 items-center gap-0.5 rounded-full border px-2 text-[10px] font-mono font-semibold transition-colors cursor-pointer shrink-0',
                        touchControlsOpen
                          ? 'border-accent bg-accent text-[var(--dd-accent-fg)]'
                          : 'border-border/70 hover:border-accent'
                      )}
                    >
                      <span>Controls</span>
                      {touchControlsOpen ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronUp className="h-3 w-3" />
                      )}
                    </button>

                    <Link
                      href={
                        selectedDev.module_code === 'VEH-01'
                          ? `/vehicles/${selectedDev.device_id}`
                          : `/devices/${selectedDev.device_id}`
                      }
                      className="inline-flex h-7 items-center gap-1 rounded-full bg-accent px-2.5 text-[11px] font-semibold text-[var(--dd-accent-fg)] hover:opacity-90 shrink-0"
                    >
                      <span className="hidden sm:inline">Full Device Page</span>
                      <span className="sm:hidden">Page</span>
                      <ArrowUpRight className="h-3 w-3 shrink-0" />
                    </Link>
                  </div>
                </>
              ) : focusedRoom ? (
                <div
                  className={cn(
                    'pointer-events-auto w-full max-w-md rounded-2xl border p-2.5 shadow-2xl space-y-2 text-xs',
                    overlayBg
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="font-semibold truncate">{focusedRoom.name}</span>
                      <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-mono text-accent uppercase shrink-0">
                        {getFloorForRoom(blueprint, focusedRoom.id).shortLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={resetCamera}
                        className="h-6 px-2 rounded-full border border-border/70 text-[10px] font-mono hover:border-accent cursor-pointer"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => setFocusedRoomId(null)}
                        aria-label="Close room card"
                        className="h-6 w-6 inline-flex items-center justify-center rounded-full hover:bg-surface-elevated cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {focusedRoomPins.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {focusedRoomPins.map((pin) => {
                        const dev = devices[pin.device_id];
                        if (!dev) return null;
                        return (
                          <button
                            key={pin.device_id}
                            type="button"
                            onClick={() => focusModule(dev.device_id)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface-elevated/80 px-2.5 py-1 text-[11px] hover:border-accent cursor-pointer"
                          >
                            <span className="font-medium">{dev.name}</span>
                            <span className="text-[10px] font-mono opacity-65">{dev.module_code}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[11px] opacity-65 font-mono">
                      No hardware modules pinned in this room yet.
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={cn(
                    'pointer-events-auto flex items-center justify-between gap-2 px-3 py-1.5 w-full max-w-md overflow-hidden rounded-full border text-[11px] shadow-lg',
                    overlayBg
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] opacity-80">
                    Tap a 3D module to control
                  </span>
                  <span className="h-3 w-px bg-border/80 shrink-0" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={resetCamera}
                    className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-accent hover:underline cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-3 w-3 shrink-0" />
                    <span>Reset</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Eco 2D Room Grid Floor Plan (Zero-GPU Fallback, WebGL unmounted) */
        <div className="flex-1 w-full p-3 sm:p-4 overflow-y-auto dd-scroll space-y-3 font-mono">
          <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-foreground">
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>
                <strong>Eco 2D Room Grid Active</strong> — zero-GPU fallback with full hardware
                safety guardrails.
              </span>
            </div>
            <span className="text-[10px] bg-emerald-500/15 text-emerald-500 px-2 py-0.5 rounded border border-emerald-500/30">
              Core Free Forever
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {blueprint.rooms
              .filter((r) => effectiveActiveFloor === 'all' || r.floorId === effectiveActiveFloor)
              .map((room) => {
                const roomPins = blueprint.pins.filter((p) => p.room_id === room.id);
                const fl = getFloorForRoom(blueprint, room.id);
                return (
                  <div
                    key={room.id}
                    className="rounded-xl border border-border bg-surface-elevated/70 p-3 space-y-2.5"
                  >
                    <div className="flex items-center justify-between border-b border-border/70 pb-1.5">
                      <span className="font-bold text-xs text-foreground">{room.name}</span>
                      <span className="text-[10px] text-foreground-muted uppercase">
                        {fl.shortLabel} · {room.floorType}
                      </span>
                    </div>

                    {roomPins.length === 0 ? (
                      <div className="text-[11px] text-foreground-muted py-1">
                        No pinned modules
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {roomPins.map((pin) => {
                          const dev = devices[pin.device_id];
                          if (!dev) return null;
                          const isFault = dev.state.fault !== null;
                          return (
                            <div
                              key={pin.device_id}
                              className={cn(
                                'p-2 rounded-lg border text-xs flex items-center justify-between gap-2',
                                isFault
                                  ? 'border-danger/60 bg-danger/10'
                                  : 'border-border bg-surface/80'
                              )}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-foreground truncate">
                                    {dev.name}
                                  </span>
                                  <span className="text-[10px] text-foreground-muted shrink-0">
                                    ({dev.module_code})
                                  </span>
                                </div>
                                {isFault ? (
                                  <p className="text-[10px] text-danger font-bold">
                                    FAULT: {dev.state.fault}
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-foreground-muted">
                                    Mode: {dev.state.operation_mode}
                                  </p>
                                )}
                              </div>

                              {onInspectDevice && (
                                <button
                                  type="button"
                                  onClick={() => onInspectDevice(dev.device_id)}
                                  className="px-2 py-1 rounded bg-surface-elevated hover:bg-accent-soft text-[10px] font-bold text-accent cursor-pointer shrink-0"
                                >
                                  Inspect
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};
