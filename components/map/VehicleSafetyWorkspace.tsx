'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Car,
  Check,
  ChevronDown,
  Crosshair,
  ExternalLink,
  Eye,
  Gauge,
  Layers,
  Loader2,
  LocateFixed,
  Lock,
  MapPin,
  Maximize2,
  Moon,
  Navigation,
  Phone,
  Plus,
  Route,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import {
  VehicleGeofence,
  VehicleTelemetryPayload,
  evaluateStarterInterlockSafety,
} from '@/lib/protocol/contract';
import { simulatorEngine } from '@/lib/simulator/engine';
import { MapCameraPadding, VehicleLiveMap } from '@/components/map/VehicleLiveMap';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import {
  Badge,
  Banner,
  Button,
  Card,
  OtpPinInput,
  PrecisionSlider,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import {
  CollapsibleSection,
  useWorkspace,
} from '@/components/workspace';
import {
  UserLocationState,
  VehicleRouteData,
  buildGoogleMapsDirectionsUrl,
  buildStraightLineRoute,
  fetchOsrmDrivingRoute,
  formatRouteDistance,
  getHomeFallbackCoords,
  haversineDistanceMeters,
} from '@/lib/map/vehicleRouting';
import { cn } from '@/lib/utils';

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

interface TripRecord {
  trip_id: string;
  label: string;
  date: string;
  distanceKm: number;
  durationMin: number;
  maxSpeedKmh: number;
  waypoints: Array<{ label: string; lat: number; lng: number }>;
}

const DEMO_TRIPS: TripRecord[] = [
  {
    trip_id: 'trip_2026_1122_01',
    label: 'Imphal Residence → Kangla Fort',
    date: 'Today · 09:15 IST',
    distanceKm: 6.4,
    durationMin: 18,
    maxSpeedKmh: 48,
    waypoints: [
      { label: 'Start · Lamphelpat', lat: 24.817, lng: 93.9368 },
      { label: 'Mid · Thangal Bazar', lat: 24.8112, lng: 93.9395 },
      { label: 'End · Kangla Gate', lat: 24.8074, lng: 93.9442 },
    ],
  },
  {
    trip_id: 'trip_2026_1121_02',
    label: 'Airport Road → Imphal Residence',
    date: 'Yesterday · 18:40 IST',
    distanceKm: 9.8,
    durationMin: 26,
    maxSpeedKmh: 56,
    waypoints: [
      { label: 'Start · Tulihal Airport', lat: 24.7601, lng: 93.8967 },
      { label: 'Mid · Keishampat', lat: 24.7985, lng: 93.9312 },
      { label: 'End · Imphal Residence', lat: 24.817, lng: 93.9368 },
    ],
  },
];

type SheetDetent = 'peek' | 'half' | 'full';
type MapStyleOverride = 'auto' | 'dark' | 'light';

export interface VehicleSafetyWorkspaceProps {
  initialDeviceId?: string;
  compactTopOffset?: boolean;
  onSelectVehicle?: (deviceId: string) => void;
}

export const VehicleSafetyWorkspace: React.FC<VehicleSafetyWorkspaceProps> = ({
  initialDeviceId,
  compactTopOffset = false,
  onSelectVehicle,
}) => {
  const { snapshot, prefs, resolvedLightMode, activePalette, activeHome } = useWorkspace();
  const { pushToast } = useToast();

  const vehicles = useMemo(
    () => Object.values(snapshot.devices).filter((d) => d.module_code === 'VEH-01'),
    [snapshot.devices]
  );

  const [selectedOverride, setSelectedOverride] = useState<{
    forInitial?: string;
    id: string;
  } | null>(null);
  const selectedId =
    selectedOverride && selectedOverride.forInitial === initialDeviceId
      ? selectedOverride.id
      : initialDeviceId || vehicles[0]?.device_id || 'dd_veh01_m4n5p6';

  const [inspectorTab, setInspectorTab] = useState<'hud' | 'trips' | 'geofences' | 'sos'>('hud');
  const [sheetDetent, setSheetDetent] = useState<SheetDetent>('half');

  // Consolidated Map Controls & Simulator Dropdown state
  const [vehicleMenuOpen, setVehicleMenuOpen] = useState(false);
  const [controlsMenuOpen, setControlsMenuOpen] = useState(false);
  const [followVehicle, setFollowVehicle] = useState(true);
  const [showGeofences, setShowGeofences] = useState(true);
  const [showDesktopHud, setShowDesktopHud] = useState(false);
  const [mapStyleState, setMapStyleState] = useState<{
    override: MapStyleOverride;
    forAppLight: boolean;
  }>({ override: 'auto', forAppLight: resolvedLightMode });

  // Map camera one-shot signals
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [fitBothSignal, setFitBothSignal] = useState(0);
  const [locateUserSignal, setLocateUserSignal] = useState(0);
  const [focusPoint, setFocusPoint] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    seq: number;
  } | null>(null);

  // User Geolocation & OSRM Route-to-Vehicle state
  const [userLocation, setUserLocation] = useState<UserLocationState | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'locating' | 'live' | 'fallback'>('idle');
  const [routeActive, setRouteActive] = useState(false);
  const [routeData, setRouteData] = useState<VehicleRouteData | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  // Measured overlay & bottom sheet heights for dynamic MapLibre fitBounds padding
  const desktopTopOverlayRef = useRef<HTMLDivElement>(null);
  const mobileTopOverlayRef = useRef<HTMLDivElement>(null);
  const mobileSheetRef = useRef<HTMLDivElement>(null);
  const [desktopTopHeight, setDesktopTopHeight] = useState(48);
  const [mobileTopHeight, setMobileTopHeight] = useState(48);
  const [mobileSheetHeight, setMobileSheetHeight] = useState(240);

  const vehicleMenuDesktopRef = useRef<HTMLDivElement>(null);
  const vehicleMenuMobileRef = useRef<HTMLDivElement>(null);
  const controlsMenuDesktopRef = useRef<HTMLDivElement>(null);
  const controlsMenuMobileRef = useRef<HTMLDivElement>(null);

  // Geolocation watch & route fetch throttling refs
  const geoWatchIdRef = useRef<number | null>(null);
  const pendingGeoActionRef = useRef<'none' | 'locate_user' | 'fit_both'>('none');
  const lastRouteFetchRef = useRef<{
    vehicleId: string;
    uLat: number;
    uLng: number;
    vLat: number;
    vLng: number;
    fetchedAt: number;
  } | null>(null);

  const [pin, setPin] = useState('');
  const [tripProgressPct, setTripProgressPct] = useState(100);
  const [selectedTripId, setSelectedTripId] = useState(DEMO_TRIPS[0].trip_id);

  // Geofences synced directly with MapLibre GeoJSON layer
  const [geofences, setGeofences] = useState<VehicleGeofence[]>([
    {
      id: 'geo_home',
      name: 'Imphal Residence',
      enabled: true,
      lat: 24.817,
      lng: 93.9368,
      radius_m: 350,
      trigger: 'both',
      cross_category_action: 'inverter_saver',
    },
    {
      id: 'geo_office',
      name: 'City Center',
      enabled: true,
      lat: 24.821,
      lng: 93.942,
      radius_m: 500,
      trigger: 'on_enter',
      cross_category_action: 'none',
    },
  ]);
  const [newGeoName, setNewGeoName] = useState('');
  const [newGeoRadius, setNewGeoRadius] = useState(300);

  const effectiveMapLight =
    mapStyleState.forAppLight === resolvedLightMode && mapStyleState.override !== 'auto'
      ? mapStyleState.override === 'light'
      : resolvedLightMode;

  // Active vehicle resolution
  const vehicle = snapshot.devices[selectedId] ?? vehicles[0];
  const activeDeviceId = vehicle?.device_id ?? '';
  const activeTelemetry = vehicle?.telemetry as VehicleTelemetryPayload | undefined;
  const vehLat = activeTelemetry?.lat ?? 24.817;
  const vehLng = activeTelemetry?.lng ?? 93.9368;

  // G14 Emergency Contacts (0-3 E.164), stored per selected vehicle without sync effect
  const [contactsByDevice, setContactsByDevice] = useState<Record<string, string[]>>({});
  const contacts =
    contactsByDevice[activeDeviceId] ??
    vehicle?.config.sos?.contacts ?? ['+919862011114', '+919862022282'];
  const [newContact, setNewContact] = useState('+91');

  // Close dropdown menus when clicking outside either desktop or mobile menu containers
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inVehicleMenu =
        vehicleMenuDesktopRef.current?.contains(target) ||
        vehicleMenuMobileRef.current?.contains(target);
      if (!inVehicleMenu) {
        setVehicleMenuOpen(false);
      }

      const inControlsMenu =
        controlsMenuDesktopRef.current?.contains(target) ||
        controlsMenuMobileRef.current?.contains(target);
      if (!inControlsMenu) {
        setControlsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  // Measure active top overlay bar & bottom sheet heights via ResizeObserver
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;

    const measure = () => {
      if (desktopTopOverlayRef.current) {
        const h = Math.round(desktopTopOverlayRef.current.getBoundingClientRect().height);
        if (h > 0) setDesktopTopHeight((prev) => (prev === h ? prev : h));
      }
      if (mobileTopOverlayRef.current) {
        const h = Math.round(mobileTopOverlayRef.current.getBoundingClientRect().height);
        if (h > 0) setMobileTopHeight((prev) => (prev === h ? prev : h));
      }
      if (mobileSheetRef.current) {
        const h = Math.round(mobileSheetRef.current.getBoundingClientRect().height);
        if (h > 0) setMobileSheetHeight((prev) => (prev === h ? prev : h));
      }
    };

    const ro = new ResizeObserver(measure);
    if (desktopTopOverlayRef.current) ro.observe(desktopTopOverlayRef.current);
    if (mobileTopOverlayRef.current) ro.observe(mobileTopOverlayRef.current);
    if (mobileSheetRef.current) ro.observe(mobileSheetRef.current);
    measure();

    return () => ro.disconnect();
  }, [routeActive, sheetDetent, inspectorTab, activeDeviceId]);

  // Cleanup geolocation watcher on unmount
  useEffect(() => {
    return () => {
      if (
        geoWatchIdRef.current !== null &&
        typeof navigator !== 'undefined' &&
        'geolocation' in navigator
      ) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
    };
  }, []);

  const applyHomeFallbackLocation = useCallback(
    (reason?: string, action?: 'locate_user' | 'fit_both') => {
      const homeCoords = getHomeFallbackCoords(activeHome.id, activeHome.name);
      const fallbackLoc: UserLocationState = {
        lat: homeCoords.lat,
        lng: homeCoords.lng,
        accuracyM: 120,
        source: 'home_fallback',
        label: homeCoords.label,
        updatedAt: Date.now(),
        errorMessage: reason,
      };
      setUserLocation(fallbackLoc);
      setGeoStatus('fallback');

      const pending = action ?? pendingGeoActionRef.current;
      pendingGeoActionRef.current = 'none';
      if (pending === 'locate_user') {
        setLocateUserSignal((n) => n + 1);
      } else if (pending === 'fit_both') {
        setFitBothSignal((n) => n + 1);
      }

      pushToast({
        title: `Using ${homeCoords.label} Coordinates`,
        description: reason || 'Browser location permission unavailable — using Home coordinates.',
        tone: 'info',
      });
    },
    [activeHome.id, activeHome.name, pushToast]
  );

  const requestUserLocation = useCallback(
    (action: 'locate_user' | 'fit_both') => {
      // If we already have a position, fire the camera action immediately while watchPosition keeps it fresh
      if (userLocation) {
        if (action === 'locate_user') {
          setLocateUserSignal((n) => n + 1);
        } else {
          setFitBothSignal((n) => n + 1);
        }
        if (geoWatchIdRef.current !== null) return;
      }

      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        applyHomeFallbackLocation('Geolocation API unavailable in this browser.', action);
        return;
      }

      pendingGeoActionRef.current = action;
      if (!userLocation) {
        setGeoStatus('locating');
      }

      if (geoWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }

      try {
        geoWatchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const nextLoc: UserLocationState = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracyM: Math.max(15, Math.round(pos.coords.accuracy || 35)),
              source: 'gps',
              label: 'Your Location',
              updatedAt: Date.now(),
            };
            setUserLocation(nextLoc);
            setGeoStatus('live');

            const pending = pendingGeoActionRef.current;
            if (pending !== 'none') {
              pendingGeoActionRef.current = 'none';
              if (pending === 'locate_user') {
                setLocateUserSignal((n) => n + 1);
              } else if (pending === 'fit_both') {
                setFitBothSignal((n) => n + 1);
              }
            }
          },
          (err) => {
            if (geoWatchIdRef.current !== null) {
              navigator.geolocation.clearWatch(geoWatchIdRef.current);
              geoWatchIdRef.current = null;
            }
            const reason =
              err.code === err.PERMISSION_DENIED
                ? 'Location permission denied — fell back to Home coordinates.'
                : 'GPS fix timed out — fell back to Home coordinates.';
            applyHomeFallbackLocation(reason);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 10000,
          }
        );
      } catch {
        applyHomeFallbackLocation('Could not access browser geolocation.', action);
      }
    },
    [userLocation, applyHomeFallbackLocation]
  );

  // Fetch zero-API-key OSRM driving route (with automatic straight-line dashed fallback)
  useEffect(() => {
    if (!routeActive) {
      lastRouteFetchRef.current = null;
      return;
    }

    if (!userLocation || !activeDeviceId) return;

    const origin = { lat: userLocation.lat, lng: userLocation.lng };
    const dest = { lat: vehLat, lng: vehLng };
    const prev = lastRouteFetchRef.current;
    const now = Date.now();

    if (prev && prev.vehicleId === activeDeviceId) {
      const userMovedM = haversineDistanceMeters(origin, { lat: prev.uLat, lng: prev.uLng });
      const vehMovedM = haversineDistanceMeters(dest, { lat: prev.vLat, lng: prev.vLng });
      const elapsedMs = now - prev.fetchedAt;
      // Throttle live OSRM re-fetches while simulator moves so we stay polite to public OSRM
      if (userMovedM < 60 && vehMovedM < 60) return;
      if (elapsedMs < 6000) return;
    }

    lastRouteFetchRef.current = {
      vehicleId: activeDeviceId,
      uLat: origin.lat,
      uLng: origin.lng,
      vLat: dest.lat,
      vLng: dest.lng,
      fetchedAt: now,
    };

    const controller = new AbortController();

    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setRouteLoading(true);
      setRouteData((existing) => existing ?? buildStraightLineRoute(origin, dest));

      try {
        const result = await fetchOsrmDrivingRoute(origin, dest, controller.signal);
        if (!controller.signal.aborted) {
          setRouteData(result);
          setRouteLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setRouteData(buildStraightLineRoute(origin, dest));
          setRouteLoading(false);
        }
      }
    });

    return () => {
      controller.abort();
    };
  }, [routeActive, activeDeviceId, userLocation?.lat, userLocation?.lng, vehLat, vehLng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Memoized dynamic padding objects for Desktop & Mobile MapLibre instances
  const desktopCameraPadding = useMemo<MapCameraPadding>(
    () => ({
      top: desktopTopHeight + 16,
      bottom: 28,
      left: 36,
      right: 36,
    }),
    [desktopTopHeight]
  );

  const mobileCameraPadding = useMemo<MapCameraPadding>(
    () => ({
      top: mobileTopHeight + 16,
      bottom: mobileSheetHeight + 24,
      left: 36,
      right: 36,
    }),
    [mobileTopHeight, mobileSheetHeight]
  );

  const handleUserDragMap = useCallback(() => {
    setFollowVehicle((prev) => (prev ? false : prev));
  }, []);

  if (!vehicle || !activeTelemetry) {
    return (
      <Card className="p-8 text-center text-xs text-foreground-muted">
        No VEH-01 module registered in this home.
      </Card>
    );
  }

  const tel = activeTelemetry;
  const safety = evaluateStarterInterlockSafety(tel.speed_kmh, tel.ignition);
  const isOwner = prefs.userRole === 'OWNER';
  const immobilizeState = vehicle.state.immobilize ?? 'RELEASED';
  const isEngagedOrPending = immobilizeState === 'ENGAGED' || immobilizeState === 'PENDING';
  const cadenceLabel = tel.speed_kmh >= 5 || tel.ignition ? '10s Moving' : '60s Parked';

  const googleMapsUrl = buildGoogleMapsDirectionsUrl(
    userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null,
    { lat: vehLat, lng: vehLng }
  );

  const liveDistanceKm = userLocation
    ? routeData?.distanceKm ??
      Number(
        (
          haversineDistanceMeters(
            { lat: userLocation.lat, lng: userLocation.lng },
            { lat: vehLat, lng: vehLng }
          ) / 1000
        ).toFixed(2)
      )
    : null;

  // --- 100% Wired Map & Simulator Control Handlers ---

  const handleSelectVehicle = (nextId: string) => {
    setSelectedOverride({ forInitial: initialDeviceId, id: nextId });
    setVehicleMenuOpen(false);
    lastRouteFetchRef.current = null;
    if (routeActive && userLocation) {
      setFitBothSignal((n) => n + 1);
    } else {
      setRecenterSignal((n) => n + 1);
    }
    onSelectVehicle?.(nextId);
  };

  const handleMyLocation = () => {
    setFollowVehicle(false);
    setControlsMenuOpen(false);
    requestUserLocation('locate_user');
  };

  const handleToggleRoute = () => {
    setControlsMenuOpen(false);
    if (routeActive) {
      setRouteActive(false);
      setRouteData(null);
      setRouteLoading(false);
      return;
    }
    setFollowVehicle(false);
    setRouteActive(true);
    requestUserLocation('fit_both');
  };

  const handleToggleFollowCar = () => {
    const next = !followVehicle;
    setFollowVehicle(next);
    setControlsMenuOpen(false);
    if (next) {
      setRecenterSignal((n) => n + 1);
    }
  };

  const handleFitBoth = () => {
    setFollowVehicle(false);
    setControlsMenuOpen(false);
    requestUserLocation('fit_both');
  };

  const handleToggleGeofences = () => {
    const next = !showGeofences;
    setShowGeofences(next);
    setInspectorTab('geofences');
    if (sheetDetent === 'peek') {
      setSheetDetent('half');
    }
    setControlsMenuOpen(false);
  };

  const handleToggleMapStyle = () => {
    const next: MapStyleOverride = effectiveMapLight ? 'dark' : 'light';
    setMapStyleState({ override: next, forAppLight: resolvedLightMode });
    setControlsMenuOpen(false);
  };

  const handleSimulateCrash = () => {
    setControlsMenuOpen(false);
    simulatorEngine.triggerVehicleCrash();
    pushToast({
      title: 'G13a Crash Impact Simulated (6.4G)',
      description: '20-second "I\'m Safe — Cancel SOS" countdown activated.',
      tone: 'critical',
    });
  };

  const handleSimulateSosManual = () => {
    setControlsMenuOpen(false);
    simulatorEngine.triggerVehicleFaultAlert('SOS_MANUAL');
    pushToast({
      title: 'G13b Manual SOS Triggered',
      description: 'Driver emergency panic alert dispatched to alert beacon & E.164 contacts.',
      tone: 'critical',
    });
  };

  const handleSimulateBatteryCut = () => {
    setControlsMenuOpen(false);
    simulatorEngine.triggerVehicleFaultAlert('EXT_POWER_LOST');
    pushToast({
      title: 'G13c 12V Battery Cut Simulated',
      description: 'VEH-01 switched to internal backup LiPo cell (< 6.0 V).',
      tone: 'warning',
    });
  };

  const handleImmobilizerAction = () => {
    if (!isOwner) {
      pushToast({
        title: 'Owner Role Required (database.rules.json)',
        description: 'Only the Home Owner can issue set.immobilize commands.',
        tone: 'critical',
      });
      return;
    }
    if (!isEngagedOrPending && pin.length < 4) {
      pushToast({
        title: '4-Digit Safety PIN Required',
        description: 'Confirm your safety PIN before arming starter interlock.',
        tone: 'warning',
      });
      return;
    }
    simulatorEngine.sendCommand(vehicle.device_id, { immobilize: !isEngagedOrPending }, 'pwa_cloud');
    setPin('');
    pushToast({
      title: isEngagedOrPending ? 'Starter Interlock Released' : 'Starter Cut Command Dispatched',
      description: isEngagedOrPending
        ? 'Vehicle starter relay restored.'
        : safety.targetState === 'ENGAGED'
        ? 'Vehicle parked (< 5 km/h & ignition OFF): ENGAGED.'
        : `Safety interlock active (${safety.reason}): queued as PENDING.`,
      tone: isEngagedOrPending ? 'success' : 'warning',
    });
  };

  const addEmergencyContact = () => {
    const clean = newContact.trim();
    if (contacts.length >= 3) {
      pushToast({ title: 'Maximum 3 Contacts (G14)', tone: 'warning' });
      return;
    }
    if (!E164_REGEX.test(clean)) {
      pushToast({
        title: 'Invalid E.164 Phone Number',
        description: 'Format must match ^\\+[1-9]\\d{7,14}$ (e.g. +919862011114).',
        tone: 'warning',
      });
      return;
    }
    const next = [...contacts, clean];
    setContactsByDevice((prev) => ({ ...prev, [activeDeviceId]: next }));
    setNewContact('+91');
    simulatorEngine.updateConfig(vehicle.device_id, {
      ...vehicle.config,
      sos: { contacts: next, sms_fallback: true },
    });
    pushToast({
      title: 'G14 Emergency Contact Saved',
      description: `Synced ${clean} to .../config with sms_fallback: true`,
      tone: 'success',
    });
  };

  const removeEmergencyContact = (phone: string) => {
    const next = contacts.filter((c) => c !== phone);
    setContactsByDevice((prev) => ({ ...prev, [activeDeviceId]: next }));
    simulatorEngine.updateConfig(vehicle.device_id, {
      ...vehicle.config,
      sos: { contacts: next, sms_fallback: true },
    });
  };

  const addGeofence = () => {
    if (!newGeoName.trim()) return;
    setGeofences((prev) => [
      ...prev,
      {
        id: `geo_${Date.now()}`,
        name: newGeoName.trim(),
        enabled: true,
        lat: Number(tel.lat.toFixed(4)),
        lng: Number(tel.lng.toFixed(4)),
        radius_m: newGeoRadius,
        trigger: 'both',
        cross_category_action: 'porch_lights',
      },
    ]);
    setNewGeoName('');
    setShowGeofences(true);
    pushToast({ title: 'Geofence Zone Created at Current GPS', tone: 'success' });
  };

  const toggleGeofenceEnabled = (id: string) => {
    setGeofences((prev) =>
      prev.map((g) => (g.id === id ? { ...g, enabled: !g.enabled } : g))
    );
  };

  const selectedTrip = DEMO_TRIPS.find((t) => t.trip_id === selectedTripId) ?? DEMO_TRIPS[0];
  const waypointIdx = Math.min(
    selectedTrip.waypoints.length - 1,
    Math.floor((tripProgressPct / 100) * selectedTrip.waypoints.length)
  );
  const currentWaypoint = selectedTrip.waypoints[waypointIdx];

  // Unified Map Top Bar + Floating Route Pill builder (parameterized by ref for desktop vs mobile measurement)
  const renderMapTopOverlay = (
    variant: 'desktop' | 'mobile',
    overlayRef: React.RefObject<HTMLDivElement | null>,
    vehRef: React.RefObject<HTMLDivElement | null>,
    ctrlRef: React.RefObject<HTMLDivElement | null>
  ) => (
    <div
      ref={overlayRef}
      className="absolute top-2.5 inset-x-2.5 z-20 flex flex-col gap-1.5 pointer-events-none"
    >
      {/* Row 1: Vehicle Selector + Compact Speed/Ignition Pill + Controls Dropdown */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="pointer-events-auto flex items-center gap-1.5 min-w-0 flex-1">
          <div ref={vehRef} className="relative min-w-0 max-w-[140px] sm:max-w-[210px]">
            <button
              type="button"
              onClick={() => {
                setVehicleMenuOpen((o) => !o);
                setControlsMenuOpen(false);
              }}
              aria-expanded={vehicleMenuOpen}
              aria-label="Select vehicle"
              className="inline-flex h-8 w-full min-w-0 items-center gap-1.5 rounded-full border border-border/80 bg-[var(--dd-surface-0)]/95 backdrop-blur-md px-2.5 text-xs font-semibold text-foreground shadow-lg cursor-pointer"
            >
              <Car className="h-3.5 w-3.5 text-accent shrink-0" />
              <span className="truncate flex-1 text-left">{vehicle.name}</span>
              <ChevronDown className="h-3.5 w-3.5 text-foreground-muted shrink-0" />
            </button>

            {vehicleMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-60 rounded-xl border border-border bg-surface shadow-2xl p-1.5 z-40 space-y-1 text-xs">
                <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-foreground-muted flex items-center justify-between">
                  <span>Registered Vehicles</span>
                  <span>{vehicles.length}</span>
                </div>
                {vehicles.map((v) => {
                  const vTel = v.telemetry as VehicleTelemetryPayload;
                  const active = v.device_id === vehicle.device_id;
                  return (
                    <button
                      key={v.device_id}
                      type="button"
                      onClick={() => handleSelectVehicle(v.device_id)}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors cursor-pointer',
                        active
                          ? 'bg-accent-soft text-accent font-semibold'
                          : 'text-foreground hover:bg-surface-elevated'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'h-1.5 w-1.5 rounded-full shrink-0',
                              vTel.ignition ? 'bg-success' : 'bg-foreground-muted'
                            )}
                          />
                          <span className="truncate">{v.name}</span>
                        </div>
                        <div className="text-[10px] font-mono text-foreground-muted tabular-nums mt-0.5">
                          {vTel.speed_kmh.toFixed(0)} km/h · {vTel.bat_pct}% bat
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant="neutral" className="text-[9px]">
                          {v.state.immobilize ?? 'RELEASED'}
                        </Badge>
                        {active && <Check className="h-3.5 w-3.5 text-accent" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="shrink-0 inline-flex h-8 items-center gap-1.5 rounded-full border border-border/80 bg-[var(--dd-surface-0)]/95 backdrop-blur-md px-2.5 text-[11px] font-mono tabular-nums text-foreground shadow-lg whitespace-nowrap">
            <span
              className={cn(
                'h-2 w-2 rounded-full shrink-0',
                tel.ignition ? 'bg-success animate-pulse' : 'bg-foreground-muted'
              )}
            />
            <span>
              {tel.speed_kmh.toFixed(0)} km/h · {tel.ignition ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Right: Single [Controls ▾] Dropdown */}
        <div ref={ctrlRef} className="pointer-events-auto relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setControlsMenuOpen((o) => !o);
              setVehicleMenuOpen(false);
            }}
            aria-expanded={controlsMenuOpen}
            aria-label="Map controls and simulator"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/80 bg-[var(--dd-surface-0)]/95 backdrop-blur-md px-2.5 text-[11px] font-medium text-foreground shadow-lg hover:border-border-strong transition-colors cursor-pointer whitespace-nowrap"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent shrink-0" />
            <span className="hidden min-[380px]:inline">Controls</span>
            <ChevronDown className="h-3 w-3 text-foreground-muted shrink-0" />
          </button>

          {controlsMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-60 max-h-[70dvh] overflow-y-auto dd-scroll rounded-xl border border-border bg-surface shadow-2xl p-1.5 z-40 space-y-0.5 text-xs">
              <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-foreground-muted">
                Navigation &amp; View
              </div>

              <button
                type="button"
                onClick={handleMyLocation}
                className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  {geoStatus === 'locating' ? (
                    <Loader2 className="h-3.5 w-3.5 text-accent animate-spin" />
                  ) : (
                    <LocateFixed className="h-3.5 w-3.5 text-blue-500" />
                  )}
                  <span>My Location</span>
                </span>
                {userLocation && (
                  <span className="text-[10px] font-mono text-foreground-muted">
                    {userLocation.source === 'gps' ? 'GPS' : 'Home'}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={handleToggleRoute}
                className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Navigation className="h-3.5 w-3.5 text-accent" />
                  <span>Route to Vehicle</span>
                </span>
                {routeActive && <Check className="h-3.5 w-3.5 text-success" />}
              </button>

              <button
                type="button"
                onClick={handleToggleFollowCar}
                className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-accent" />
                  <span>Follow Car</span>
                </span>
                {followVehicle && <Check className="h-3.5 w-3.5 text-success" />}
              </button>

              <button
                type="button"
                onClick={handleFitBoth}
                className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Maximize2 className="h-3.5 w-3.5 text-accent" />
                  <span>Fit Both</span>
                </span>
                <span className="text-[10px] font-mono text-foreground-muted">You + Car</span>
              </button>

              <button
                type="button"
                onClick={handleToggleGeofences}
                className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Geofences</span>
                </span>
                {showGeofences && <Check className="h-3.5 w-3.5 text-success" />}
              </button>

              <button
                type="button"
                onClick={handleToggleMapStyle}
                className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  {effectiveMapLight ? (
                    <Sun className="h-3.5 w-3.5 text-amber-500" />
                  ) : (
                    <Moon className="h-3.5 w-3.5 text-accent" />
                  )}
                  <span>Map Style</span>
                </span>
                <span className="text-[10px] font-mono text-foreground-muted">
                  {mapStyleState.forAppLight !== resolvedLightMode ||
                  mapStyleState.override === 'auto'
                    ? `Auto · ${effectiveMapLight ? 'Light' : 'Dark'}`
                    : effectiveMapLight
                    ? 'Light'
                    : 'Dark'}
                </span>
              </button>

              {variant === 'desktop' && (
                <button
                  type="button"
                  onClick={() => {
                    setShowDesktopHud((v) => !v);
                    setControlsMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <Gauge className="h-3.5 w-3.5 text-accent" />
                    <span>Map HUD Overlay</span>
                  </span>
                  {showDesktopHud && <Check className="h-3.5 w-3.5 text-success" />}
                </button>
              )}

              <div className="my-1 border-t border-border/60 pt-1 px-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground-muted">
                Safety Simulator (v1.4)
              </div>

              <button
                type="button"
                onClick={handleSimulateCrash}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-danger font-semibold hover:bg-danger/10 cursor-pointer"
              >
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span>Dev: Simulate 6.4G Crash</span>
              </button>

              <button
                type="button"
                onClick={handleSimulateSosManual}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                <span>Dev: SOS Manual</span>
              </button>

              <button
                type="button"
                onClick={handleSimulateBatteryCut}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-warning hover:bg-surface-elevated cursor-pointer"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Dev: 12V Battery Cut</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Compact Floating Route Pill (Visible when Route-to-Vehicle is active) */}
      {routeActive && (
        <div className="pointer-events-auto self-start max-w-full flex items-center gap-1.5 rounded-full border border-accent-border bg-[var(--dd-surface-0)]/96 backdrop-blur-md px-2.5 py-1.5 text-[11px] shadow-xl">
          {routeLoading && !routeData ? (
            <Loader2 className="h-3.5 w-3.5 text-accent animate-spin shrink-0" />
          ) : (
            <Navigation className="h-3.5 w-3.5 text-accent shrink-0" />
          )}

          <span className="font-mono font-semibold text-foreground tabular-nums whitespace-nowrap">
            {routeData
              ? `${formatRouteDistance(routeData.distanceKm)} • ~${routeData.durationMin} min`
              : 'Routing…'}
          </span>

          {routeData?.mode === 'straight_fallback' && (
            <span className="hidden min-[380px]:inline rounded bg-surface-elevated px-1.5 py-0.5 text-[9px] font-mono uppercase text-foreground-muted shrink-0">
              Direct
            </span>
          )}

          {userLocation?.source === 'home_fallback' && (
            <span className="hidden sm:inline rounded bg-surface-elevated px-1.5 py-0.5 text-[9px] font-mono uppercase text-foreground-muted shrink-0">
              Home
            </span>
          )}

          <span className="h-3.5 w-px bg-border shrink-0" aria-hidden="true" />

          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span>Google Maps</span>
          </a>

          <button
            type="button"
            onClick={() => {
              setRouteActive(false);
              setRouteData(null);
            }}
            aria-label="Clear route"
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors cursor-pointer shrink-0"
          >
            <X className="h-3 w-3" />
            <span className="hidden min-[400px]:inline">Clear</span>
          </button>
        </div>
      )}
    </div>
  );

  const inspectorTabBar = (
    <SegmentedControl<'hud' | 'trips' | 'geofences' | 'sos'>
      fullWidth
      size="sm"
      ariaLabel="Vehicle Inspector Tabs"
      value={inspectorTab}
      onChange={(tab) => {
        setInspectorTab(tab);
        if (sheetDetent === 'peek') setSheetDetent('half');
      }}
      options={[
        { value: 'hud', label: 'HUD', icon: <Gauge className="h-3 w-3" /> },
        { value: 'trips', label: 'Trips', icon: <Route className="h-3 w-3" /> },
        { value: 'geofences', label: 'Zones', icon: <MapPin className="h-3 w-3" /> },
        { value: 'sos', label: 'Lock & SOS', icon: <Shield className="h-3 w-3" /> },
      ]}
    />
  );

  const inspectorBody = (
    <div className="space-y-3">
      {/* TAB 1: Live HUD */}
      {inspectorTab === 'hud' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2 font-mono text-xs tabular-nums">
            <div className="rounded-xl border hairline-border bg-surface-elevated/70 p-2.5">
              <div className="text-[10px] text-foreground-muted">SPEED</div>
              <div className="text-sm font-bold text-foreground">{tel.speed_kmh.toFixed(1)} km/h</div>
            </div>
            <div className="rounded-xl border hairline-border bg-surface-elevated/70 p-2.5">
              <div className="text-[10px] text-foreground-muted">IGNITION</div>
              <div className="text-sm font-bold text-foreground">{tel.ignition ? 'ON' : 'OFF'}</div>
            </div>
            <div className="rounded-xl border hairline-border bg-surface-elevated/70 p-2.5">
              <div className="text-[10px] text-foreground-muted">VEHICLE 12V</div>
              <div className="text-sm font-bold text-foreground">{tel.ext_v.toFixed(1)} V</div>
            </div>
            <div className="rounded-xl border hairline-border bg-surface-elevated/70 p-2.5">
              <div className="text-[10px] text-foreground-muted">BACKUP CELL</div>
              <div className="text-sm font-bold text-foreground">{tel.bat_pct}%</div>
            </div>
          </div>

          <div className="rounded-xl border hairline-border bg-surface-elevated/50 px-3 py-2 flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
            <span className="text-foreground-muted truncate">GPS FIX ({cadenceLabel})</span>
            <span className="text-foreground font-semibold shrink-0">
              {tel.lat.toFixed(4)}°N, {tel.lng.toFixed(4)}°E
            </span>
          </div>

          {/* Quick Geolocation & Route Bar */}
          <div className="flex items-center gap-1.5">
            <Button
              variant={userLocation ? 'secondary' : 'ghost'}
              size="sm"
              className="flex-1 text-[11px]"
              onClick={handleMyLocation}
            >
              <LocateFixed className="h-3.5 w-3.5 text-blue-500" />
              <span>{userLocation ? (userLocation.source === 'gps' ? 'Located' : 'Home Pin') : 'My Location'}</span>
            </Button>
            <Button
              variant={routeActive ? 'primary' : 'secondary'}
              size="sm"
              className="flex-1 text-[11px]"
              onClick={handleToggleRoute}
            >
              <Navigation className="h-3.5 w-3.5" />
              <span>
                {routeActive && liveDistanceKm !== null
                  ? `${formatRouteDistance(liveDistanceKm)}`
                  : 'Route to Car'}
              </span>
            </Button>
          </div>
        </div>
      )}

      {/* TAB 2: Trips */}
      {inspectorTab === 'trips' && (
        <div className="space-y-2.5 text-xs">
          <div className="space-y-1.5">
            {DEMO_TRIPS.map((trip) => (
              <button
                key={trip.trip_id}
                type="button"
                onClick={() => {
                  setSelectedTripId(trip.trip_id);
                  setTripProgressPct(100);
                }}
                className={cn(
                  'w-full rounded-xl border p-2.5 text-left transition-colors cursor-pointer',
                  selectedTripId === trip.trip_id
                    ? 'border-accent-border bg-accent-soft/60'
                    : 'hairline-border bg-surface-elevated/60'
                )}
              >
                <div className="font-semibold text-foreground">{trip.label}</div>
                <div className="text-[11px] font-mono text-foreground-muted tabular-nums mt-0.5">
                  {trip.date} · {trip.distanceKm} km · {trip.durationMin}m · Max {trip.maxSpeedKmh} km/h
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-xl border hairline-border bg-surface-elevated/60 p-3 space-y-2">
            <PrecisionSlider
              label={`Replay · ${currentWaypoint.label}`}
              value={tripProgressPct}
              min={0}
              max={100}
              unit="%"
              onChange={setTripProgressPct}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-mono text-foreground-muted tabular-nums">
                {currentWaypoint.lat.toFixed(4)}°N, {currentWaypoint.lng.toFixed(4)}°E
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px]"
                onClick={() => {
                  setFollowVehicle(false);
                  setFocusPoint({
                    lat: currentWaypoint.lat,
                    lng: currentWaypoint.lng,
                    zoom: 15.5,
                    seq: Date.now(),
                  });
                }}
              >
                <Crosshair className="h-3 w-3" />
                <span>Show on Map</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Geofence Zones */}
      {inspectorTab === 'geofences' && (
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between rounded-xl border hairline-border bg-surface-elevated/50 px-3 py-2">
            <span className="font-medium text-foreground">Map Geofence Overlay</span>
            <Button
              variant={showGeofences ? 'primary' : 'secondary'}
              size="sm"
              className="h-7 px-2.5 text-[10px]"
              onClick={() => setShowGeofences((v) => !v)}
            >
              {showGeofences ? 'Visible' : 'Hidden'}
            </Button>
          </div>

          <div className="space-y-1.5">
            {geofences.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-2 rounded-xl border hairline-border bg-surface-elevated/60 px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowGeofences(true);
                    setFollowVehicle(false);
                    setFocusPoint({ lat: g.lat, lng: g.lng, zoom: 15, seq: Date.now() });
                  }}
                  className="min-w-0 flex-1 text-left cursor-pointer"
                >
                  <div className="font-medium text-foreground truncate flex items-center gap-1.5">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full shrink-0',
                        g.enabled ? 'bg-emerald-500' : 'bg-foreground-muted'
                      )}
                    />
                    <span className="truncate">{g.name}</span>
                  </div>
                  <div className="text-[10px] font-mono text-foreground-muted tabular-nums">
                    Radius: {g.radius_m} m {g.cross_category_action !== 'none' ? '· Car-to-Home Linked' : ''}
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => toggleGeofenceEnabled(g.id)}
                  >
                    {g.enabled ? 'ON' : 'OFF'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${g.name}`}
                    onClick={() => setGeofences((prev) => prev.filter((x) => x.id !== g.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t hairline-border space-y-2">
            <input
              type="text"
              value={newGeoName}
              onChange={(e) => setNewGeoName(e.target.value)}
              placeholder="New zone name (e.g. School Gate)"
              className="w-full h-9 rounded-xl border border-border bg-surface-elevated px-2.5 text-xs text-foreground"
            />
            <PrecisionSlider
              label="Zone Radius"
              value={newGeoRadius}
              min={100}
              max={2000}
              step={50}
              unit=" m"
              onChange={setNewGeoRadius}
            />
            <Button variant="primary" size="sm" className="w-full" onClick={addGeofence}>
              <Plus className="h-3.5 w-3.5" />
              <span>Add Geofence Zone</span>
            </Button>
          </div>
        </div>
      )}

      {/* TAB 4: PIN-Gated Starter Interlock & G14 Emergency Contacts */}
      {inspectorTab === 'sos' && (
        <div className="space-y-3 text-xs">
          <div className="rounded-xl border hairline-border bg-surface-elevated/50 p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-accent" />
                  <span>Starter-Only Immobilizer (G15a–c)</span>
                </div>
                <p className="text-[11px] text-foreground-muted mt-0.5">
                  Engages only when ignition == OFF &amp; speed &lt; 5 km/h.
                </p>
              </div>
              <Badge
                variant={
                  immobilizeState === 'ENGAGED'
                    ? 'danger'
                    : immobilizeState === 'PENDING'
                    ? 'warning'
                    : 'success'
                }
                dot
              >
                {immobilizeState}
              </Badge>
            </div>

            {vehicle.state.immobilize_reason && (
              <div className="rounded-lg border border-warning/40 bg-warning-soft px-2.5 py-1.5 font-mono text-[11px]">
                Reason: {vehicle.state.immobilize_reason}
              </div>
            )}

            {!isOwner && (
              <Banner
                tone="critical"
                title="Owner-Only Security Gate"
                description="Your active role is MEMBER. Switch to OWNER in Settings to actuate set.immobilize."
              />
            )}

            {!isEngagedOrPending && isOwner && (
              <OtpPinInput
                length={4}
                masked
                label="Owner 4-Digit Safety Confirmation PIN"
                value={pin}
                onChange={setPin}
              />
            )}

            <Button
              variant={isEngagedOrPending ? 'secondary' : 'danger'}
              className="w-full"
              touchTarget
              disabled={!isOwner}
              onClick={handleImmobilizerAction}
            >
              {isEngagedOrPending ? (
                <Unlock className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              <span>
                {isEngagedOrPending ? 'Release Starter Interlock' : 'Engage Starter Immobilizer'}
              </span>
            </Button>
          </div>

          {/* G14 Emergency Contacts (0-3 E.164, sms_fallback locked ON) */}
          <CollapsibleSection
            sectionId="veh_g14_contacts"
            title="Emergency Contacts (G14 · 0–3 E.164)"
            subtitle="sms_fallback: LOCKED ON"
            icon={<Phone className="h-3.5 w-3.5" />}
            defaultCollapsed={false}
          >
            <div className="space-y-2 text-xs">
              {contacts.map((c) => (
                <div
                  key={c}
                  className="flex items-center justify-between rounded-lg border hairline-border bg-surface-elevated px-2.5 py-1.5 font-mono"
                >
                  <span className="tabular-nums">{c}</span>
                  <button
                    type="button"
                    onClick={() => removeEmergencyContact(c)}
                    className="text-foreground-muted hover:text-danger cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <div className="flex gap-2">
                <input
                  type="tel"
                  value={newContact}
                  onChange={(e) => setNewContact(e.target.value)}
                  placeholder="+919862000000"
                  className="flex-1 h-8 rounded-lg border border-border bg-surface-elevated px-2.5 font-mono text-xs text-foreground"
                />
                <Button variant="primary" size="sm" onClick={addEmergencyContact}>
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add</span>
                </Button>
              </div>

              <div className="flex items-center gap-1.5 text-[10px] text-foreground-muted">
                <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />
                <span>`sos.sms_fallback: true` is hardware-locked ON for offline 4G/GSM safety.</span>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative">
      {/* Desktop / Large Screen Layout: Clean Map + Side Panel */}
      <div className="hidden lg:grid lg:grid-cols-12 gap-3 items-start">
        <div className="lg:col-span-8 relative rounded-2xl border hairline-border overflow-hidden h-[620px] bg-surface">
          {renderMapTopOverlay(
            'desktop',
            desktopTopOverlayRef,
            vehicleMenuDesktopRef,
            controlsMenuDesktopRef
          )}

          <ErrorBoundary>
            <VehicleLiveMap
              vehicleDevice={vehicle}
              followVehicle={followVehicle}
              showGeofences={showGeofences}
              recenterSignal={recenterSignal}
              fitBothSignal={fitBothSignal}
              locateUserSignal={locateUserSignal}
              focusPoint={focusPoint}
              isLightTheme={effectiveMapLight}
              routeActive={routeActive}
              routeData={routeData}
              userLocation={userLocation}
              routeColor={activePalette.primary}
              cameraPadding={desktopCameraPadding}
              showDesktopHud={showDesktopHud}
              geofences={geofences}
              onUserDragMap={handleUserDragMap}
            />
          </ErrorBoundary>
        </div>

        <div className="lg:col-span-4 rounded-2xl border hairline-border bg-surface/85 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b hairline-border">
            <span className="text-xs font-semibold text-foreground truncate">{vehicle.name}</span>
            <Badge
              variant={
                immobilizeState === 'ENGAGED'
                  ? 'danger'
                  : immobilizeState === 'PENDING'
                  ? 'warning'
                  : 'success'
              }
              dot
            >
              {immobilizeState}
            </Badge>
          </div>
          {inspectorTabBar}
          {inspectorBody}
        </div>
      </div>

      {/* Mobile & Tablet Layout: Full-Bleed MapLibre Canvas + Content-Fitted Collapsible Bottom Sheet */}
      <div
        className={cn(
          'lg:hidden relative min-h-[480px] rounded-2xl border hairline-border overflow-hidden bg-surface',
          compactTopOffset ? 'h-[calc(100dvh-204px)]' : 'h-[calc(100dvh-160px)]'
        )}
      >
        {renderMapTopOverlay(
          'mobile',
          mobileTopOverlayRef,
          vehicleMenuMobileRef,
          controlsMenuMobileRef
        )}

        {/* MapLibre Canvas */}
        <div className="absolute inset-0">
          <ErrorBoundary>
            <VehicleLiveMap
              vehicleDevice={vehicle}
              followVehicle={followVehicle}
              showGeofences={showGeofences}
              recenterSignal={recenterSignal}
              fitBothSignal={fitBothSignal}
              locateUserSignal={locateUserSignal}
              focusPoint={focusPoint}
              isLightTheme={effectiveMapLight}
              routeActive={routeActive}
              routeData={routeData}
              userLocation={userLocation}
              routeColor={activePalette.primary}
              cameraPadding={mobileCameraPadding}
              showDesktopHud={false}
              geofences={geofences}
              onUserDragMap={handleUserDragMap}
            />
          </ErrorBoundary>
        </div>

        {/* Multi-Detent Content-Fitted Bottom Sheet (Peek | Half | Full — Zero Blank Void) */}
        <div
          ref={mobileSheetRef}
          className={cn(
            'absolute inset-x-0 bottom-0 z-20 rounded-t-2xl border-t border-border/80 bg-[var(--dd-surface-0)]/96 backdrop-blur-xl shadow-2xl transition-[max-height] duration-200 flex flex-col',
            sheetDetent === 'peek'
              ? 'h-auto'
              : sheetDetent === 'half'
              ? 'h-auto max-h-[50%]'
              : 'h-auto max-h-[82%]'
          )}
        >
          {/* Single Clean Non-Wrapping Bottom Sheet Header Row */}
          <div className="px-3 py-2 border-b hairline-border flex items-center justify-between gap-2 shrink-0 flex-nowrap">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-xs font-semibold text-foreground truncate">
                {vehicle.name}
              </span>
              <Badge
                variant={
                  immobilizeState === 'ENGAGED'
                    ? 'danger'
                    : immobilizeState === 'PENDING'
                    ? 'warning'
                    : 'success'
                }
                className="shrink-0 text-[9px] px-1.5 py-0.5"
              >
                {immobilizeState}
              </Badge>
            </div>

            <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-surface-elevated p-0.5 shrink-0">
              {(['peek', 'half', 'full'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSheetDetent(d)}
                  className={cn(
                    'rounded-md px-2 py-1 text-[10px] font-mono uppercase leading-none whitespace-nowrap transition-colors cursor-pointer',
                    sheetDetent === d
                      ? 'bg-accent text-[var(--dd-accent-fg)] font-semibold'
                      : 'text-foreground-muted hover:text-foreground'
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Always-Accessible Compact Tab Switcher */}
          <div className="px-3 pt-2 pb-2 shrink-0">
            {inspectorTabBar}
          </div>

          {/* Content-Fitted Sheet Body (hidden cleanly in peek mode so zero clipped cards) */}
          {sheetDetent !== 'peek' && (
            <div className="min-h-0 flex-1 overflow-y-auto dd-scroll px-3 pb-3">
              {inspectorBody}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
