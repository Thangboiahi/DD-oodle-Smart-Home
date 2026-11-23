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

export interface VehicleLiveMapProps {
  vehicleDevice: VirtualDeviceInstance;
  followVehicle?: boolean;
  showGeofences?: boolean;
  recenterSignal?: number;
  isLightTheme?: boolean;
  showDesktopHud?: boolean;
  geofences?: VehicleGeofence[];
  onCommandImmobilize?: (immobilize: boolean) => void;
  onTriggerCrashSos?: () => void;
}

// Generate GeoJSON Polygon coordinates for a circular geofence
function createCircleGeoJson(
  centerLng: number,
  centerLat: number,
  radiusMeters: number,
  points: number = 48
): [number, number][] {
  const coords: [number, number][] = [];
  const distanceX = radiusMeters / (111320 * Math.cos((centerLat * Math.PI) / 180));
  const distanceY = radiusMeters / 110540;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([centerLng + x, centerLat + y]);
  }
  coords.push(coords[0]);
  return coords;
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

/**
 * Full-Bleed Zero-API-Cost MapLibre GL JS Vehicle Map
 * Uses OpenFreeMap vector styles (dark / positron) with automatic OpenStreetMap raster tile fallback.
 * Telemetry & controls are cleanly managed by VehicleSafetyWorkspace with zero duplicate overlays on mobile.
 */
export const VehicleLiveMap: React.FC<VehicleLiveMapProps> = ({
  vehicleDevice,
  followVehicle = true,
  showGeofences = true,
  recenterSignal = 0,
  isLightTheme = false,
  showDesktopHud = false,
  geofences = DEFAULT_GEOFENCES,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const tripTrailRef = useRef<[number, number][]>([]);
  const fallbackAppliedRef = useRef<boolean>(false);
  const currentStyleIsLightRef = useRef<boolean>(isLightTheme);

  const tel = vehicleDevice.telemetry as VehicleTelemetryPayload;
  const latestGeoRef = useRef<{ geofences: VehicleGeofence[]; show: boolean }>({
    geofences,
    show: showGeofences,
  });

  useEffect(() => {
    latestGeoRef.current = { geofences, show: showGeofences };
  }, [geofences, showGeofences]);

  const syncCustomOverlays = useCallback((map: maplibregl.Map) => {
    const trailCoords =
      tripTrailRef.current.length > 0
        ? tripTrailRef.current
        : [[tel.lng || 93.9368, tel.lat || 24.817]];

    if (!map.getSource('trip-trail')) {
      map.addSource('trip-trail', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: trailCoords,
          },
          properties: {},
        },
      });
    }

    if (!map.getLayer('trip-trail-glow')) {
      map.addLayer({
        id: 'trip-trail-glow',
        type: 'line',
        source: 'trip-trail',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#0284c7',
          'line-width': 6,
          'line-opacity': 0.35,
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
          'line-width': 2.5,
          'line-dasharray': [1, 0.5],
        },
      });
    }

    const { geofences: gfs, show } = latestGeoRef.current;
    const features = gfs
      .filter((gf) => gf.enabled && show)
      .map((gf) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [createCircleGeoJson(gf.lng, gf.lat, gf.radius_m)],
        },
        properties: {
          id: gf.id,
          name: gf.name,
        },
      }));

    if (!map.getSource('geofences')) {
      map.addSource('geofences', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features,
        },
      });
    } else {
      (map.getSource('geofences') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features,
      });
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
  }, [tel.lat, tel.lng]);

  // Initialize MapLibre GL once with OpenFreeMap vector style + OSM raster fallback
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    fallbackAppliedRef.current = false;
    currentStyleIsLightRef.current = isLightTheme;

    const initialStyle = isLightTheme ? OPENFREEMAP_LIGHT_STYLE : OPENFREEMAP_DARK_STYLE;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialStyle,
      center: [tel.lng || 93.9368, tel.lat || 24.817],
      zoom: 14.5,
      pitch: 28,
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

    // Vehicle Marker Element
    const el = document.createElement('div');
    el.className = 'vehicle-marker-wrapper';
    el.innerHTML = `
      <div style="position: relative; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; inset: 0; background: rgba(6, 182, 212, 0.24); border-radius: 50%; border: 2px solid rgba(6, 182, 212, 0.9); box-shadow: 0 0 12px rgba(6,182,212,0.45);"></div>
        <div id="car-heading-arrow-${vehicleDevice.device_id}" style="transform: rotate(${tel.heading || 0}deg); transition: transform 0.4s ease; display: flex; align-items: center; justify-content: center;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
            <circle cx="7" cy="17" r="2"/>
            <path d="M9 17h6"/>
            <circle cx="17" cy="17" r="2"/>
          </svg>
        </div>
      </div>
    `;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([tel.lng || 93.9368, tel.lat || 24.817])
      .addTo(map);

    markerRef.current = marker;

    map.on('style.load', () => {
      syncCustomOverlays(map);
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

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch between OpenFreeMap dark & positron when theme changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || currentStyleIsLightRef.current === isLightTheme) return;
    currentStyleIsLightRef.current = isLightTheme;
    if (!fallbackAppliedRef.current) {
      map.setStyle(isLightTheme ? OPENFREEMAP_LIGHT_STYLE : OPENFREEMAP_DARK_STYLE);
    }
  }, [isLightTheme]);

  // Recenter trigger from workspace Controls dropdown
  useEffect(() => {
    if (recenterSignal <= 0 || !mapRef.current || !tel.lng || !tel.lat) return;
    mapRef.current.flyTo({
      center: [tel.lng, tel.lat],
      zoom: 15,
      duration: 650,
    });
  }, [recenterSignal, tel.lat, tel.lng]);

  // Sync Marker, Heading, Map Center & Trip Trail with live telemetry
  useEffect(() => {
    if (!tel.lng || !tel.lat) return;

    if (markerRef.current) {
      markerRef.current.setLngLat([tel.lng, tel.lat]);
    }

    const arrowEl = document.getElementById(`car-heading-arrow-${vehicleDevice.device_id}`);
    if (arrowEl) {
      arrowEl.style.transform = `rotate(${tel.heading || 0}deg)`;
    }

    if (followVehicle && mapRef.current) {
      mapRef.current.easeTo({
        center: [tel.lng, tel.lat],
        duration: 750,
      });
    }

    const trail = tripTrailRef.current;
    const last = trail[trail.length - 1];
    if (!last || Math.abs(last[0] - tel.lng) > 0.0001 || Math.abs(last[1] - tel.lat) > 0.0001) {
      trail.push([tel.lng, tel.lat]);
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
  }, [tel.lng, tel.lat, tel.heading, followVehicle, vehicleDevice.device_id]);

  // Sync Geofences layer dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource('geofences')) return;
    const features = geofences
      .filter((gf) => gf.enabled && showGeofences)
      .map((gf) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [createCircleGeoJson(gf.lng, gf.lat, gf.radius_m)],
        },
        properties: {
          id: gf.id,
          name: gf.name,
        },
      }));

    (map.getSource('geofences') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features,
    });
  }, [geofences, showGeofences]);

  return (
    <div className="relative w-full h-full min-h-[420px] bg-canvas overflow-hidden">
      {/* MapLibre WebGL Canvas */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Optional Desktop-Only Sleek HUD (Never rendered on mobile so map stays clean & non-duplicate) */}
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
