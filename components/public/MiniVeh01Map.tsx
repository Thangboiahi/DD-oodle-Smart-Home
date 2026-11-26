'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Battery, LocateFixed, Navigation, ShieldAlert, Zap } from 'lucide-react';
import { useThemeEngine } from '@/components/theme/ThemeEngineProvider';
import { createCirclePolygonCoords } from '@/lib/map/vehicleRouting';

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

/**
 * Churachandpur (Lamka) / Imphal Road Corridor loop around 24.3334, 93.6795
 * `[lng, lat]` coordinates along Tedim Road & IB Road corridor.
 */
const HOME_ORIGIN: [number, number] = [93.6795, 24.3334];
const GEOFENCE_RADIUS_M = 350;

const LAMKA_ROAD_ROUTE: Array<[number, number]> = [
  [93.6795, 24.3334],
  [93.6812, 24.3348],
  [93.6836, 24.3365],
  [93.6854, 24.3352],
  [93.6845, 24.3324],
  [93.6821, 24.3309],
  [93.6788, 24.3316],
  [93.6795, 24.3334],
];

function computeBearingDeg(from: [number, number], to: [number, number]): number {
  const dLng = ((to[0] - from[0]) * Math.PI) / 180;
  const lat1 = (from[1] * Math.PI) / 180;
  const lat2 = (to[1] * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface MiniVeh01MapProps {
  speedKmh: number;
  immobilizeState: 'RELEASED' | 'DISARMED' | 'PENDING' | 'ENGAGED';
  crashActive: boolean;
}

export const MiniVeh01Map: React.FC<MiniVeh01MapProps> = ({
  speedKmh,
  immobilizeState,
  crashActive,
}) => {
  const { resolvedLightMode } = useThemeEngine();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const vehMarkerRef = useRef<maplibregl.Marker | null>(null);
  const homeMarkerRef = useRef<maplibregl.Marker | null>(null);
  const arrowElRef = useRef<HTMLDivElement | null>(null);
  const haloElRef = useRef<HTMLDivElement | null>(null);
  const fallbackAppliedRef = useRef(false);
  const currentStyleLightRef = useRef<boolean | null>(null);

  const posRef = useRef<{ lng: number; lat: number; heading: number; progress: number }>({
    lng: LAMKA_ROAD_ROUTE[1][0],
    lat: LAMKA_ROAD_ROUTE[1][1],
    heading: 42,
    progress: 0.18,
  });

  const [hudCoords, setHudCoords] = useState<{ lat: number; lng: number; heading: number }>({
    lat: LAMKA_ROAD_ROUTE[1][1],
    lng: LAMKA_ROAD_ROUTE[1][0],
    heading: 42,
  });

  const effectiveMoving =
    speedKmh > 0 && immobilizeState !== 'ENGAGED' && !crashActive;
  const ignitionOn = speedKmh > 0 && immobilizeState !== 'ENGAGED';
  const extVoltage = ignitionOn ? '13.8V' : '12.6V';

  const fitBothMarkers = useCallback((duration = 450) => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const pt of LAMKA_ROAD_ROUTE) {
      bounds.extend(pt);
    }
    bounds.extend(HOME_ORIGIN);
    bounds.extend([posRef.current.lng, posRef.current.lat]);
    try {
      map.fitBounds(bounds, {
        padding: { top: 44, bottom: 38, left: 32, right: 32 },
        maxZoom: 15.6,
        duration,
      });
    } catch {
      // Ignore if container is resizing
    }
  }, []);

  const installSourcesAndLayers = useCallback((map: maplibregl.Map) => {
    const geofenceGeo = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              createCirclePolygonCoords(
                HOME_ORIGIN[0],
                HOME_ORIGIN[1],
                GEOFENCE_RADIUS_M,
                48
              ),
            ],
          },
          properties: { name: 'Lamka Home Geofence (350m)' },
        },
      ],
    };

    if (!map.getSource('veh01-geofence')) {
      map.addSource('veh01-geofence', { type: 'geojson', data: geofenceGeo });
    } else {
      (map.getSource('veh01-geofence') as maplibregl.GeoJSONSource).setData(geofenceGeo);
    }

    if (!map.getLayer('veh01-geofence-fill')) {
      map.addLayer({
        id: 'veh01-geofence-fill',
        type: 'fill',
        source: 'veh01-geofence',
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.12,
        },
      });
    }

    if (!map.getLayer('veh01-geofence-line')) {
      map.addLayer({
        id: 'veh01-geofence-line',
        type: 'line',
        source: 'veh01-geofence',
        paint: {
          'line-color': '#10b981',
          'line-width': 1.6,
          'line-dasharray': [3, 2],
          'line-opacity': 0.75,
        },
      });
    }

    const routeGeo = {
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: LAMKA_ROAD_ROUTE,
      },
      properties: {},
    };

    if (!map.getSource('veh01-route')) {
      map.addSource('veh01-route', { type: 'geojson', data: routeGeo });
    } else {
      (map.getSource('veh01-route') as maplibregl.GeoJSONSource).setData(routeGeo);
    }

    if (!map.getLayer('veh01-route-glow')) {
      map.addLayer({
        id: 'veh01-route-glow',
        type: 'line',
        source: 'veh01-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#06b6d4',
          'line-width': 5,
          'line-opacity': 0.25,
        },
      });
    }

    if (!map.getLayer('veh01-route-line')) {
      map.addLayer({
        id: 'veh01-route-line',
        type: 'line',
        source: 'veh01-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#22d3ee',
          'line-width': 2.2,
          'line-dasharray': [2, 1.4],
          'line-opacity': 0.9,
        },
      });
    }
  }, []);

  // Initialize MapLibre GL JS map once and clean up strictly on unmount
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    fallbackAppliedRef.current = false;
    currentStyleLightRef.current = resolvedLightMode;

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

    const initialStyle = resolvedLightMode
      ? OPENFREEMAP_LIGHT_STYLE
      : OPENFREEMAP_DARK_STYLE;

    const map = new maplibregl.Map({
      container,
      style: initialStyle,
      center: HOME_ORIGIN,
      zoom: 14.8,
      pitch: 20,
      attributionControl: false,
    });
    mapRef.current = map;

    // 1. Lamka Smart Residence Home Marker
    const homeEl = document.createElement('div');
    homeEl.style.cssText =
      'display:flex;align-items:center;justify-content:center;width:24px;height:24px;pointer-events:none;';
    homeEl.innerHTML = `
      <div style="width:14px;height:14px;border-radius:9999px;background:#10b981;border:2.5px solid #022c22;box-shadow:0 0 10px rgba(16,185,129,0.75);"></div>
    `;
    const homeMarker = new maplibregl.Marker({ element: homeEl })
      .setLngLat(HOME_ORIGIN)
      .addTo(map);
    homeMarkerRef.current = homeMarker;

    // 2. Directional Live Vehicle Marker
    const vehEl = document.createElement('div');
    vehEl.style.cssText =
      'position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;pointer-events:none;';

    const halo = document.createElement('div');
    halo.style.cssText =
      'position:absolute;inset:0;border-radius:9999px;background:rgba(6,182,212,0.24);border:2px solid rgba(34,211,238,0.95);box-shadow:0 0 12px rgba(6,182,212,0.55);transition:all 0.25s ease;';
    haloElRef.current = halo;

    const arrow = document.createElement('div');
    arrow.style.cssText = `transform:rotate(${posRef.current.heading}deg);display:flex;align-items:center;justify-content:center;position:relative;z-index:2;`;
    arrow.innerHTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 19 21 12 17 5 21 12 2" fill="rgba(6,182,212,0.38)" />
      </svg>
    `;
    arrowElRef.current = arrow;

    vehEl.appendChild(halo);
    vehEl.appendChild(arrow);

    const vehMarker = new maplibregl.Marker({ element: vehEl })
      .setLngLat([posRef.current.lng, posRef.current.lat])
      .addTo(map);
    vehMarkerRef.current = vehMarker;

    map.on('style.load', () => {
      installSourcesAndLayers(map);
    });

    map.on('load', () => {
      installSourcesAndLayers(map);
      fitBothMarkers(0);
    });

    map.on('error', (err) => {
      if (fallbackAppliedRef.current) return;
      const msg = String(err?.error?.message || '');
      if (
        msg.includes('openfreemap') ||
        msg.includes('Failed to fetch') ||
        msg.includes('style')
      ) {
        fallbackAppliedRef.current = true;
        try {
          map.setStyle(OSM_RASTER_FALLBACK_STYLE);
        } catch {
          // Ignore if map already unmounted
        }
      }
    });

    return () => {
      try {
        vehMarker.remove();
        homeMarker.remove();
        map.remove();
      } catch {
        // Ignore cleanup errors
      }
      vehMarkerRef.current = null;
      homeMarkerRef.current = null;
      mapRef.current = null;
    };
  }, [fitBothMarkers, installSourcesAndLayers, resolvedLightMode]);

  // Update vehicle marker halo color when Crash SOS or Starter Lock is active
  useEffect(() => {
    const halo = haloElRef.current;
    if (!halo) return;
    if (crashActive) {
      halo.style.background = 'rgba(244,63,94,0.34)';
      halo.style.borderColor = '#fb7185';
      halo.style.boxShadow = '0 0 16px rgba(244,63,94,0.85)';
    } else if (immobilizeState === 'ENGAGED') {
      halo.style.background = 'rgba(245,158,11,0.28)';
      halo.style.borderColor = '#fbbf24';
      halo.style.boxShadow = '0 0 14px rgba(245,158,11,0.65)';
    } else {
      halo.style.background = 'rgba(6,182,212,0.24)';
      halo.style.borderColor = 'rgba(34,211,238,0.95)';
      halo.style.boxShadow = '0 0 12px rgba(6,182,212,0.55)';
    }
  }, [crashActive, immobilizeState]);

  // Smoothly animate live vehicle position along the Churachandpur road route
  useEffect(() => {
    if (!effectiveMoving) return;

    let rafId = 0;
    let lastTs = performance.now();
    let lastHudUpdateTs = 0;
    const totalSegments = LAMKA_ROAD_ROUTE.length - 1;

    const step = (now: number) => {
      const dtSec = Math.min(0.1, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      // Advance loop progress proportional to simulated speedKmh
      const loopsPerSec = (speedKmh / 42) * 0.038;
      const nextProgress = (posRef.current.progress + dtSec * loopsPerSec) % 1;
      const scaled = nextProgress * totalSegments;
      const segIdx = Math.min(totalSegments - 1, Math.floor(scaled));
      const segT = scaled - segIdx;

      const p0 = LAMKA_ROAD_ROUTE[segIdx];
      const p1 = LAMKA_ROAD_ROUTE[segIdx + 1];
      const lng = p0[0] + (p1[0] - p0[0]) * segT;
      const lat = p0[1] + (p1[1] - p0[1]) * segT;
      const heading = computeBearingDeg(p0, p1);

      posRef.current = { lng, lat, heading, progress: nextProgress };

      if (vehMarkerRef.current) {
        vehMarkerRef.current.setLngLat([lng, lat]);
      }
      if (arrowElRef.current) {
        arrowElRef.current.style.transform = `rotate(${heading.toFixed(1)}deg)`;
      }

      if (now - lastHudUpdateTs > 320) {
        lastHudUpdateTs = now;
        setHudCoords({
          lat: Number(lat.toFixed(4)),
          lng: Number(lng.toFixed(4)),
          heading: Math.round(heading),
        });
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [effectiveMoving, speedKmh]);

  return (
    <div className="relative w-full h-44 sm:h-48 rounded-xl overflow-hidden border border-slate-800/90 bg-slate-950 select-none">
      {/* MapLibre GL JS Canvas Container */}
      <div
        ref={containerRef}
        className="w-full h-full"
        aria-label="VEH-01 Live MapLibre GL JS GPS Tracking Demo"
      />

      {/* Top-Left Live Telemetry HUD Overlay */}
      <div className="pointer-events-none absolute top-2 left-2 right-10 flex flex-wrap items-center gap-1">
        <span className="px-2 py-0.5 rounded bg-slate-950/85 border border-slate-800 text-[10px] font-mono text-cyan-300 backdrop-blur-md tabular-nums">
          speed_kmh: <strong>{effectiveMoving ? speedKmh : 0}</strong>
        </span>
        <span
          className={`px-2 py-0.5 rounded border text-[10px] font-mono backdrop-blur-md ${
            ignitionOn
              ? 'bg-emerald-950/85 border-emerald-500/40 text-emerald-300'
              : 'bg-slate-950/85 border-slate-800 text-slate-400'
          }`}
        >
          ignition: <strong>{ignitionOn ? 'ON' : 'OFF'}</strong>
        </span>
        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-slate-950/85 border border-slate-800 text-[10px] font-mono text-amber-300 backdrop-blur-md tabular-nums">
          <Zap className="w-2.5 h-2.5" /> ext_v {extVoltage}
        </span>
        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-slate-950/85 border border-slate-800 text-[10px] font-mono text-emerald-300 backdrop-blur-md tabular-nums">
          <Battery className="w-2.5 h-2.5" /> bat_pct 95%
        </span>
      </div>

      {/* Top-Right Fit Bounds Control */}
      <button
        type="button"
        onClick={() => fitBothMarkers(450)}
        title="Fit Home Geofence & Live Vehicle"
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-950/85 border border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300 backdrop-blur-md transition-colors"
      >
        <LocateFixed className="w-3.5 h-3.5" />
      </button>

      {/* Bottom Live Coordinates & Status Strip */}
      <div className="pointer-events-none absolute bottom-1.5 left-2 right-2 flex items-center justify-between gap-1 text-[10px] font-mono">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/85 border border-slate-800 text-slate-300 backdrop-blur-md tabular-nums">
          <Navigation className="w-2.5 h-2.5 text-cyan-400" />
          Lamka / Imphal · {hudCoords.lat.toFixed(4)}°N, {hudCoords.lng.toFixed(4)}°E
        </span>

        {crashActive ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/90 border border-rose-500/50 text-rose-300 font-bold backdrop-blur-md">
            <ShieldAlert className="w-2.5 h-2.5" /> 6.4G CRASH SOS
          </span>
        ) : (
          <span className="hidden sm:inline-flex px-2 py-0.5 rounded bg-slate-950/85 border border-slate-800 text-emerald-300 backdrop-blur-md">
            OpenFreeMap GL · ₹0 API
          </span>
        )}
      </div>
    </div>
  );
};

export default MiniVeh01Map;
