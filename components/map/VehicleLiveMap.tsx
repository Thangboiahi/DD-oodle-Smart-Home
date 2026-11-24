'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Battery, Zap } from 'lucide-react';
import {
  VehicleGeofence,
  VehicleTelemetryPayload,
} from '@/lib/protocol/contract';
import { VirtualDeviceInstance } from '@/lib/simulator/types';
import {
  UserLocationState,
  VehicleRouteData,
  createCirclePolygonCoords,
  haversineDistanceMeters,
} from '@/lib/map/vehicleRouting';

const OPENFREEMAP_DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const OPENFREEMAP_LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/positron';

const OSM_RASTER_FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'osm-raster': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm-raster-layer',
      type: 'raster',
      source: 'osm-raster',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export interface MapCameraPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface VehicleLiveMapProps {
  vehicleDevice: VirtualDeviceInstance;
  followVehicle?: boolean;
  showGeofences?: boolean;
  recenterSignal?: number;
  fitBothSignal?: number;
  locateUserSignal?: number;
  focusPoint?: { lat: number; lng: number; zoom?: number; seq: number } | null;
  isLightTheme?: boolean;
  routeActive?: boolean;
  routeData?: VehicleRouteData | null;
  userLocation?: UserLocationState | null;
  routeColor?: string;
  cameraPadding?: MapCameraPadding;
  showDesktopHud?: boolean;
  geofences?: VehicleGeofence[];
  onUserDragMap?: () => void;
  onCommandImmobilize?: (immobilize: boolean) => void;
  onTriggerCrashSos?: () => void;
}

const DEFAULT_GEOFENCES: VehicleGeofence[] = [
  {
    id: 'gf_home',
    name: 'Imphal Residence',
    enabled: true,
    lat: 24.817,
    lng: 93.9368,
    radius_m: 350,
    trigger: 'both',
    cross_category_action: 'inverter_saver',
  },
  {
    id: 'gf_office',
    name: 'City Center',
    enabled: true,
    lat: 24.821,
    lng: 93.942,
    radius_m: 500,
    trigger: 'on_enter',
    cross_category_action: 'none',
  },
];

const DEFAULT_PADDING: MapCameraPadding = {
  top: 64,
  bottom: 32,
  left: 36,
  right: 36,
};

function buildGeofenceCollection(geofences: VehicleGeofence[], show: boolean) {
  return {
    type: 'FeatureCollection' as const,
    features: geofences
      .filter((gf) => gf.enabled && show)
      .map((gf) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [createCirclePolygonCoords(gf.lng, gf.lat, gf.radius_m)],
        },
        properties: {
          id: gf.id,
          name: gf.name,
        },
      })),
  };
}

function buildUserAccuracyCollection(userLocation: UserLocationState | null) {
  if (!userLocation) {
    return {
      type: 'FeatureCollection' as const,
      features: [],
    };
  }
  const radius = Math.max(25, Math.min(userLocation.accuracyM || 45, 1200));
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [createCirclePolygonCoords(userLocation.lng, userLocation.lat, radius, 40)],
        },
        properties: {
          source: userLocation.source,
        },
      },
    ],
  };
}

function buildRouteCollection(routeActive: boolean, routeData: VehicleRouteData | null) {
  if (!routeActive || !routeData || routeData.coordinates.length < 2) {
    return {
      type: 'FeatureCollection' as const,
      features: [],
    };
  }
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: routeData.coordinates,
        },
        properties: {
          mode: routeData.mode,
        },
      },
    ],
  };
}

/**
 * Full-Bleed Zero-API-Cost MapLibre GL JS Vehicle Map
 * - OpenFreeMap vector styles (dark / positron) with automatic OpenStreetMap raster fallback
 * - Pulsing blue user-location marker + GPS accuracy ring
 * - Crisp themed OSRM road route polyline + dashed straight-line offline fallback
 * - Dynamic sheet-aware fitBounds & camera padding so neither user nor vehicle clips behind overlays
 */
export const VehicleLiveMap: React.FC<VehicleLiveMapProps> = ({
  vehicleDevice,
  followVehicle = true,
  showGeofences = true,
  recenterSignal = 0,
  fitBothSignal = 0,
  locateUserSignal = 0,
  focusPoint = null,
  isLightTheme = false,
  routeActive = false,
  routeData = null,
  userLocation = null,
  routeColor = '#06b6d4',
  cameraPadding = DEFAULT_PADDING,
  showDesktopHud = false,
  geofences = DEFAULT_GEOFENCES,
  onUserDragMap,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const headingArrowRef = useRef<HTMLDivElement | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const tripTrailRef = useRef<[number, number][]>([]);
  const prevVehicleIdRef = useRef<string>(vehicleDevice.device_id);
  const fallbackAppliedRef = useRef<boolean>(false);
  const currentStyleIsLightRef = useRef<boolean>(isLightTheme);
  const onUserDragRef = useRef(onUserDragMap);

  const tel = vehicleDevice.telemetry as VehicleTelemetryPayload;
  const vehLat = tel.lat || 24.817;
  const vehLng = tel.lng || 93.9368;

  const latestRef = useRef({
    geofences,
    showGeofences,
    routeActive,
    routeData,
    userLocation,
    routeColor,
    isLightTheme,
    vehLat,
    vehLng,
    cameraPadding,
    followVehicle,
  });

  useEffect(() => {
    onUserDragRef.current = onUserDragMap;
  }, [onUserDragMap]);

  useEffect(() => {
    latestRef.current = {
      geofences,
      showGeofences,
      routeActive,
      routeData,
      userLocation,
      routeColor,
      isLightTheme,
      vehLat,
      vehLng,
      cameraPadding,
      followVehicle,
    };
  }, [
    geofences,
    showGeofences,
    routeActive,
    routeData,
    userLocation,
    routeColor,
    isLightTheme,
    vehLat,
    vehLng,
    cameraPadding,
    followVehicle,
  ]);

  /**
   * Computes MapLibre-safe padding clamped to the real map canvas dimensions
   * so tall bottom sheets never cause MapLibre fitBounds errors.
   */
  const getSafePadding = useCallback((): maplibregl.PaddingOptions => {
    const pad = latestRef.current.cameraPadding ?? DEFAULT_PADDING;
    const container = mapContainerRef.current;
    const w = container?.clientWidth || 360;
    const h = container?.clientHeight || 520;

    let top = Math.max(16, Math.round(pad.top));
    let bottom = Math.max(16, Math.round(pad.bottom));
    let left = Math.max(16, Math.round(pad.left));
    let right = Math.max(16, Math.round(pad.right));

    const maxVertical = Math.max(40, h - 96);
    if (top + bottom > maxVertical) {
      const ratio = maxVertical / (top + bottom);
      top = Math.max(12, Math.floor(top * ratio));
      bottom = Math.max(12, Math.floor(bottom * ratio));
    }

    const maxHorizontal = Math.max(32, w - 80);
    if (left + right > maxHorizontal) {
      const ratio = maxHorizontal / (left + right);
      left = Math.max(12, Math.floor(left * ratio));
      right = Math.max(12, Math.floor(right * ratio));
    }

    return { top, bottom, left, right };
  }, []);

  /**
   * Fits both user location and vehicle (plus full OSRM polyline when present) inside the unobstructed map area.
   */
  const fitUserAndVehicle = useCallback(
    (duration: number = 550) => {
      const map = mapRef.current;
      if (!map) return;

      const {
        userLocation: uLoc,
        vehLat: vLat,
        vehLng: vLng,
        routeActive: rActive,
        routeData: rData,
      } = latestRef.current;

      const padding = getSafePadding();

      if (!uLoc) {
        map.easeTo({
          center: [vLng, vLat],
          zoom: Math.max(map.getZoom(), 14.5),
          padding,
          duration,
        });
        return;
      }

      const distMeters = haversineDistanceMeters(
        { lat: uLoc.lat, lng: uLoc.lng },
        { lat: vLat, lng: vLng }
      );

      if (distMeters < 25) {
        map.easeTo({
          center: [vLng, vLat],
          zoom: 16,
          padding,
          duration,
        });
        return;
      }

      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([uLoc.lng, uLoc.lat]);
      bounds.extend([vLng, vLat]);

      if (rActive && rData && rData.coordinates.length >= 2) {
        for (const coord of rData.coordinates) {
          bounds.extend(coord);
        }
      }

      map.fitBounds(bounds, {
        padding,
        maxZoom: 16,
        duration,
      });
    },
    [getSafePadding]
  );

  const syncCustomOverlays = useCallback((map: maplibregl.Map) => {
    const state = latestRef.current;
    const trailCoords =
      tripTrailRef.current.length > 0
        ? tripTrailRef.current
        : [[state.vehLng, state.vehLat]];

    // 1. Geofences
    const geoData = buildGeofenceCollection(state.geofences, state.showGeofences);
    if (!map.getSource('geofences')) {
      map.addSource('geofences', { type: 'geojson', data: geoData });
    } else {
      (map.getSource('geofences') as maplibregl.GeoJSONSource).setData(geoData);
    }

    if (!map.getLayer('geofence-fill')) {
      map.addLayer({
        id: 'geofence-fill',
        type: 'fill',
        source: 'geofences',
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.16,
        },
      });
    }

    if (!map.getLayer('geofence-stroke')) {
      map.addLayer({
        id: 'geofence-stroke',
        type: 'line',
        source: 'geofences',
        paint: {
          'line-color': '#10b981',
          'line-width': 2,
          'line-dasharray': [3, 2],
        },
      });
    }

    // 2. User GPS Accuracy Ring
    const accData = buildUserAccuracyCollection(state.userLocation);
    if (!map.getSource('user-accuracy')) {
      map.addSource('user-accuracy', { type: 'geojson', data: accData });
    } else {
      (map.getSource('user-accuracy') as maplibregl.GeoJSONSource).setData(accData);
    }

    if (!map.getLayer('user-accuracy-fill')) {
      map.addLayer({
        id: 'user-accuracy-fill',
        type: 'fill',
        source: 'user-accuracy',
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.14,
        },
      });
    }

    if (!map.getLayer('user-accuracy-stroke')) {
      map.addLayer({
        id: 'user-accuracy-stroke',
        type: 'line',
        source: 'user-accuracy',
        paint: {
          'line-color': '#3b82f6',
          'line-width': 1.5,
          'line-opacity': 0.55,
        },
      });
    }

    // 3. Vehicle Trip Breadcrumb Trail
    const trailGeo = {
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: trailCoords,
      },
      properties: {},
    };

    if (!map.getSource('trip-trail')) {
      map.addSource('trip-trail', { type: 'geojson', data: trailGeo });
    } else {
      (map.getSource('trip-trail') as maplibregl.GeoJSONSource).setData(trailGeo);
    }

    if (!map.getLayer('trip-trail-glow')) {
      map.addLayer({
        id: 'trip-trail-glow',
        type: 'line',
        source: 'trip-trail',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#0284c7',
          'line-width': 5,
          'line-opacity': 0.25,
        },
      });
    }

    if (!map.getLayer('trip-trail-line')) {
      map.addLayer({
        id: 'trip-trail-line',
        type: 'line',
        source: 'trip-trail',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#38bdf8',
          'line-width': 2.2,
          'line-dasharray': [1, 0.7],
        },
      });
    }

    // 4. User-to-Vehicle Active Route Polyline (OSRM solid OR offline straight-line dashed)
    const routeGeo = buildRouteCollection(state.routeActive, state.routeData);
    if (!map.getSource('route-line')) {
      map.addSource('route-line', { type: 'geojson', data: routeGeo });
    } else {
      (map.getSource('route-line') as maplibregl.GeoJSONSource).setData(routeGeo);
    }

    const isFallback = state.routeData?.mode === 'straight_fallback';
    const hasRoute = state.routeActive && Boolean(state.routeData && state.routeData.coordinates.length >= 2);
    const casingColor = state.isLightTheme ? '#ffffff' : '#090b0f';

    if (!map.getLayer('route-line-casing')) {
      map.addLayer({
        id: 'route-line-casing',
        type: 'line',
        source: 'route-line',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          visibility: hasRoute ? 'visible' : 'none',
        },
        paint: {
          'line-color': casingColor,
          'line-width': 8,
          'line-opacity': 0.5,
        },
      });
    }

    if (!map.getLayer('route-line-solid')) {
      map.addLayer({
        id: 'route-line-solid',
        type: 'line',
        source: 'route-line',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          visibility: hasRoute && !isFallback ? 'visible' : 'none',
        },
        paint: {
          'line-color': state.routeColor,
          'line-width': 4.5,
          'line-opacity': 0.95,
        },
      });
    }

    if (!map.getLayer('route-line-dashed')) {
      map.addLayer({
        id: 'route-line-dashed',
        type: 'line',
        source: 'route-line',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          visibility: hasRoute && isFallback ? 'visible' : 'none',
        },
        paint: {
          'line-color': state.routeColor,
          'line-width': 3.5,
          'line-dasharray': [2.2, 1.8],
          'line-opacity': 0.92,
        },
      });
    }
  }, []);

  // Initialize MapLibre GL once with OpenFreeMap vector style + OSM raster fallback
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    fallbackAppliedRef.current = false;
    currentStyleIsLightRef.current = isLightTheme;

    if (typeof window !== 'undefined') {
      const origin =
        window.location.origin && window.location.origin !== 'null'
          ? window.location.origin
          : '';
      const workerVersion =
        typeof maplibregl.getVersion === 'function' ? maplibregl.getVersion() : '6.19.0';
      maplibregl.setWorkerUrl(
        `${origin}/maplibre-gl-worker.js?v=${encodeURIComponent(workerVersion)}`
      );
    }

    const initialStyle = isLightTheme ? OPENFREEMAP_LIGHT_STYLE : OPENFREEMAP_DARK_STYLE;

    const map = new maplibregl.Map({
      container,
      style: initialStyle,
      center: [vehLng, vehLat],
      zoom: 14.5,
      pitch: 24,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-left'
    );
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true }),
      'bottom-right'
    );

    // Directional Vehicle Marker Element
    const el = document.createElement('div');
    el.className = 'vehicle-marker-wrapper';
    el.style.pointerEvents = 'none';

    const ring = document.createElement('div');
    ring.style.cssText =
      'position: relative; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center;';

    const halo = document.createElement('div');
    halo.style.cssText =
      'position: absolute; inset: 0; background: rgba(6, 182, 212, 0.24); border-radius: 50%; border: 2px solid rgba(6, 182, 212, 0.92); box-shadow: 0 0 14px rgba(6,182,212,0.48);';

    const arrow = document.createElement('div');
    arrow.style.cssText = `transform: rotate(${tel.heading || 0}deg); transition: transform 0.4s ease; display: flex; align-items: center; justify-content: center; position: relative; z-index: 2;`;
    arrow.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 19 21 12 17 5 21 12 2" fill="rgba(6,182,212,0.35)" />
      </svg>
    `;

    ring.appendChild(halo);
    ring.appendChild(arrow);
    el.appendChild(ring);
    headingArrowRef.current = arrow;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([vehLng, vehLat])
      .addTo(map);
    markerRef.current = marker;

    map.on('style.load', () => {
      syncCustomOverlays(map);
    });

    map.on('load', () => {
      // Apply initial sheet-aware padding cleanly once map loads
      const pad = getSafePadding();
      map.easeTo({
        center: [latestRef.current.vehLng, latestRef.current.vehLat],
        padding: pad,
        duration: 0,
      });
    });

    map.on('dragstart', () => {
      onUserDragRef.current?.();
    });

    // Automatic OpenStreetMap raster fallback if OpenFreeMap vector style fails to fetch
    map.on('error', (evt) => {
      const msg = String(evt?.error?.message ?? '');
      if (
        !fallbackAppliedRef.current &&
        (msg.includes('openfreemap') ||
          msg.includes('Failed to fetch') ||
          msg.includes('style') ||
          !map.isStyleLoaded())
      ) {
        fallbackAppliedRef.current = true;
        map.setStyle(OSM_RASTER_FALLBACK_STYLE);
      }
    });

    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      markerRef.current?.remove();
      markerRef.current = null;
      headingArrowRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch between OpenFreeMap dark & positron when theme/manual map style changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || currentStyleIsLightRef.current === isLightTheme) return;
    currentStyleIsLightRef.current = isLightTheme;
    fallbackAppliedRef.current = false;
    map.setStyle(isLightTheme ? OPENFREEMAP_LIGHT_STYLE : OPENFREEMAP_DARK_STYLE);
  }, [isLightTheme]);

  // Sync Pulsing Blue User Location Marker + Accuracy Ring GeoJSON
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userLocation) {
      if (!userMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'dd-user-location-marker';
        el.style.pointerEvents = 'none';
        el.innerHTML = `
          <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
            <span class="animate-ping" style="position: absolute; width: 24px; height: 24px; border-radius: 9999px; background: rgba(59, 130, 246, 0.45);"></span>
            <span style="position: relative; width: 14px; height: 14px; border-radius: 9999px; background: #2563eb; border: 2.5px solid #ffffff; box-shadow: 0 0 12px rgba(37, 99, 235, 0.75);"></span>
          </div>
        `;
        userMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([userLocation.lng, userLocation.lat])
          .addTo(map);
      } else {
        userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
      }
    } else if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    if (map.isStyleLoaded() && map.getSource('user-accuracy')) {
      (map.getSource('user-accuracy') as maplibregl.GeoJSONSource).setData(
        buildUserAccuracyCollection(userLocation)
      );
    }
  }, [userLocation]);

  // Sync Route Polyline GeoJSON, Theme Color & Solid/Dashed Mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource('route-line')) return;

    (map.getSource('route-line') as maplibregl.GeoJSONSource).setData(
      buildRouteCollection(routeActive, routeData)
    );

    const hasRoute = routeActive && Boolean(routeData && routeData.coordinates.length >= 2);
    const isFallback = routeData?.mode === 'straight_fallback';
    const casingColor = isLightTheme ? '#ffffff' : '#090b0f';

    if (map.getLayer('route-line-casing')) {
      map.setLayoutProperty('route-line-casing', 'visibility', hasRoute ? 'visible' : 'none');
      map.setPaintProperty('route-line-casing', 'line-color', casingColor);
    }
    if (map.getLayer('route-line-solid')) {
      map.setLayoutProperty(
        'route-line-solid',
        'visibility',
        hasRoute && !isFallback ? 'visible' : 'none'
      );
      map.setPaintProperty('route-line-solid', 'line-color', routeColor);
    }
    if (map.getLayer('route-line-dashed')) {
      map.setLayoutProperty(
        'route-line-dashed',
        'visibility',
        hasRoute && isFallback ? 'visible' : 'none'
      );
      map.setPaintProperty('route-line-dashed', 'line-color', routeColor);
    }
  }, [routeActive, routeData, routeColor, isLightTheme]);

  // Sync Geofences layer dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource('geofences')) return;

    (map.getSource('geofences') as maplibregl.GeoJSONSource).setData(
      buildGeofenceCollection(geofences, showGeofences)
    );
  }, [geofences, showGeofences]);

  // Sync Marker, Heading, Trip Trail & Live Vehicle Camera Behavior
  useEffect(() => {
    if (prevVehicleIdRef.current !== vehicleDevice.device_id) {
      prevVehicleIdRef.current = vehicleDevice.device_id;
      tripTrailRef.current = [[vehLng, vehLat]];
    }

    if (markerRef.current) {
      markerRef.current.setLngLat([vehLng, vehLat]);
    }

    if (headingArrowRef.current) {
      headingArrowRef.current.style.transform = `rotate(${tel.heading || 0}deg)`;
    }

    const trail = tripTrailRef.current;
    const last = trail[trail.length - 1];
    if (!last || Math.abs(last[0] - vehLng) > 0.00008 || Math.abs(last[1] - vehLat) > 0.00008) {
      trail.push([vehLng, vehLat]);
      if (trail.length > 200) trail.shift();
      if (mapRef.current && mapRef.current.isStyleLoaded() && mapRef.current.getSource('trip-trail')) {
        (mapRef.current.getSource('trip-trail') as maplibregl.GeoJSONSource).setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: trail,
          },
          properties: {},
        });
      }
    }

    if (!mapRef.current) return;

    if (routeActive && !followVehicle && userLocation) {
      fitUserAndVehicle(550);
    } else if (followVehicle) {
      mapRef.current.easeTo({
        center: [vehLng, vehLat],
        padding: getSafePadding(),
        duration: 650,
      });
    }
  }, [
    vehLng,
    vehLat,
    tel.heading,
    followVehicle,
    routeActive,
    userLocation,
    vehicleDevice.device_id,
    fitUserAndVehicle,
    getSafePadding,
  ]);

  // Re-frame whenever Route mode activates or route geometry arrives
  useEffect(() => {
    if (!routeActive || !mapRef.current) return;
    fitUserAndVehicle(550);
  }, [routeActive, routeData?.fetchedAt, fitUserAndVehicle]);

  // Dynamic Screen Adjustment: re-frame whenever top overlay or bottom sheet height changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const { routeActive: rActive, userLocation: uLoc, vehLat: vLat, vehLng: vLng } = latestRef.current;
    if (rActive && uLoc) {
      fitUserAndVehicle(550);
    } else {
      map.easeTo({
        center: [vLng, vLat],
        padding: getSafePadding(),
        duration: 500,
      });
    }
  }, [
    cameraPadding.top,
    cameraPadding.bottom,
    cameraPadding.left,
    cameraPadding.right,
    fitUserAndVehicle,
    getSafePadding,
  ]);

  // Explicit Fit Both trigger
  useEffect(() => {
    if (fitBothSignal <= 0 || !mapRef.current) return;
    fitUserAndVehicle(550);
  }, [fitBothSignal, fitUserAndVehicle]);

  // Explicit Locate User trigger
  useEffect(() => {
    const uLoc = latestRef.current.userLocation;
    if (locateUserSignal <= 0 || !mapRef.current || !uLoc) return;
    mapRef.current.flyTo({
      center: [uLoc.lng, uLoc.lat],
      zoom: 15.5,
      padding: getSafePadding(),
      duration: 600,
    });
  }, [locateUserSignal, getSafePadding]);

  // Explicit Recenter on Vehicle trigger
  useEffect(() => {
    if (recenterSignal <= 0 || !mapRef.current) return;
    const { vehLat: vLat, vehLng: vLng } = latestRef.current;
    mapRef.current.flyTo({
      center: [vLng, vLat],
      zoom: 15,
      padding: getSafePadding(),
      duration: 600,
    });
  }, [recenterSignal, getSafePadding]);

  // Optional external focusPoint trigger (e.g. clicking a geofence zone or trip waypoint)
  useEffect(() => {
    if (!focusPoint || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [focusPoint.lng, focusPoint.lat],
      zoom: focusPoint.zoom ?? 15,
      padding: getSafePadding(),
      duration: 600,
    });
  }, [focusPoint, getSafePadding]);

  return (
    <div className="relative w-full h-full min-h-[420px] bg-canvas overflow-hidden">
      {/* MapLibre WebGL Canvas */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Optional Desktop-Only Sleek HUD */}
      {showDesktopHud && (
        <div className="hidden lg:block absolute bottom-4 left-4 z-10 rounded-xl border border-border bg-[var(--dd-surface-0)]/94 backdrop-blur-md p-3 shadow-xl space-y-2 text-xs font-mono w-[210px] tabular-nums">
          <div className="flex items-center justify-between border-b border-border/70 pb-1.5">
            <span className="text-foreground-muted text-[10px] uppercase">Live Telemetry</span>
            <span
              className={
                tel.ignition
                  ? 'text-[10px] font-bold text-success'
                  : 'text-[10px] font-bold text-foreground-muted'
              }
            >
              IGN {tel.ignition ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-foreground-secondary">Speed</span>
            <span className="text-base font-bold text-foreground">
              {tel.speed_kmh?.toFixed(0) ?? 0} <span className="text-[10px] font-normal">km/h</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-foreground-secondary inline-flex items-center gap-1">
              <Zap className="h-3 w-3 text-warning" /> 12V Rail
            </span>
            <span className="font-semibold text-foreground">{tel.ext_v?.toFixed(1) ?? 12.6} V</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-foreground-secondary inline-flex items-center gap-1">
              <Battery className="h-3 w-3 text-accent" /> Backup
            </span>
            <span className="font-semibold text-foreground">{tel.bat_pct ?? 92}%</span>
          </div>
        </div>
      )}
    </div>
  );
};
