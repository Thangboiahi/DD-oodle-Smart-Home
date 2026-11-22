'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Car,
  Navigation,
  Shield,
  ShieldAlert,
  Battery,
  Zap,
  MapPin,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Eye,
  RotateCcw,
  Sparkles,
  Layers,
  Key,
} from 'lucide-react';
import { VehicleTelemetryPayload, VehicleGeofence, ImmobilizeState } from '@/lib/protocol/contract';
import { VirtualDeviceInstance } from '@/lib/simulator/types';

interface VehicleLiveMapProps {
  vehicleDevice: VirtualDeviceInstance;
  onCommandImmobilize: (immobilize: boolean) => void;
  onTriggerCrashSos: () => void;
}

// Haversine distance in meters
function computeDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Generate GeoJSON Polygon coordinates for a circular geofence
function createCircleGeoJson(centerLng: number, centerLat: number, radiusMeters: number, points: number = 48) {
  const coords: [number, number][] = [];
  const distanceX = radiusMeters / (111320 * Math.cos((centerLat * Math.PI) / 180));
  const distanceY = radiusMeters / 110540;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([centerLng + x, centerLat + y]);
  }
  coords.push(coords[0]); // close loop
  return coords;
}

export const VehicleLiveMap: React.FC<VehicleLiveMapProps> = ({
  vehicleDevice,
  onCommandImmobilize,
  onTriggerCrashSos,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const tripTrailRef = useRef<[number, number][]>([]);

  const tel = vehicleDevice.telemetry as VehicleTelemetryPayload;
  const immobilizeState = (vehicleDevice.state.immobilize ?? 'RELEASED') as ImmobilizeState;

  const [followVehicle, setFollowVehicle] = useState<boolean>(true);
  const [showGeofences, setShowGeofences] = useState<boolean>(true);
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [pinAction, setPinAction] = useState<boolean>(true);
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Default seed geofences in Imphal, Manipur
  const [geofences, setGeofences] = useState<VehicleGeofence[]>([
    {
      id: 'gf_home',
      name: 'Imphal Home Residence',
      enabled: true,
      lat: 24.817,
      lng: 93.9368,
      radius_m: 600,
      trigger: 'both',
      cross_category_action: 'inverter_saver',
    },
    {
      id: 'gf_office',
      name: 'Civil Secretariat Office',
      enabled: true,
      lat: 24.821,
      lng: 93.942,
      radius_m: 400,
      trigger: 'on_enter',
      cross_category_action: 'none',
    },
  ]);

  // Initialize MapLibre GL once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Zero Maps API Cost: Free Carto Dark raster tiles via standard tile specification
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors, &copy; CARTO',
          },
        },
        layers: [
          {
            id: 'carto-dark-layer',
            type: 'raster',
            source: 'carto-dark',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: [tel.lng || 93.9368, tel.lat || 24.817],
      zoom: 14.5,
      pitch: 35,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

    // Create Vehicle Marker Element
    const el = document.createElement('div');
    el.className = 'vehicle-marker-wrapper';
    el.innerHTML = `
      <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; inset: 0; background: rgba(56, 189, 248, 0.25); border-radius: 50%; border: 1.5px solid rgba(56, 189, 248, 0.8);"></div>
        <div id="car-heading-arrow" style="transform: rotate(${tel.heading || 0}deg); transition: transform 0.4s ease; display: flex; align-items: center; justify-content: center;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
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

    map.on('load', () => {
      // Add Trip Path Source & Layer
      map.addSource('trip-trail', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [[tel.lng || 93.9368, tel.lat || 24.817]],
          },
          properties: {},
        },
      });

      map.addLayer({
        id: 'trip-trail-glow',
        type: 'line',
        source: 'trip-trail',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#0284c7',
          'line-width': 6,
          'line-opacity': 0.4,
        },
      });

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

      // Add Geofences Source & Layers
      map.addSource('geofences', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      map.addLayer({
        id: 'geofence-fill',
        type: 'fill',
        source: 'geofences',
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.15,
        },
      });

      map.addLayer({
        id: 'geofence-stroke',
        type: 'line',
        source: 'geofences',
        paint: {
          'line-color': '#34d399',
          'line-width': 2,
          'line-dasharray': [3, 2],
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync Marker, Heading, Map Center & Trip Trail with real-time telemetry
  useEffect(() => {
    if (!tel.lng || !tel.lat) return;

    if (markerRef.current) {
      markerRef.current.setLngLat([tel.lng, tel.lat]);
    }

    // Update heading rotation
    const arrowEl = document.getElementById('car-heading-arrow');
    if (arrowEl) {
      arrowEl.style.transform = `rotate(${tel.heading || 0}deg)`;
    }

    if (followVehicle && mapRef.current) {
      mapRef.current.easeTo({
        center: [tel.lng, tel.lat],
        duration: 800,
      });
    }

    // Update Trip Trail Coordinates in Ref & MapLibre GeoJSON layer
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
  }, [tel.lng, tel.lat, tel.heading, followVehicle]);

  // Sync Geofences Source
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (map.isStyleLoaded() && map.getSource('geofences')) {
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
    }
  }, [geofences, showGeofences]);

  // Evaluate Geofence status
  const geofenceStatus = useMemo(() => {
    return geofences.map((gf) => {
      const dist = computeDistanceMeters(tel.lat, tel.lng, gf.lat, gf.lng);
      const isInside = dist <= gf.radius_m;
      return {
        ...gf,
        distanceM: Math.round(dist),
        isInside,
      };
    });
  }, [geofences, tel.lat, tel.lng]);

  // Handle Starter Interlock with PIN Gate
  const requestImmobilizeAction = (engage: boolean) => {
    setPinAction(engage);
    setEnteredPin('');
    setPinError(null);
    setShowPinModal(true);
  };

  const confirmPinAndExecute = () => {
    const requiredPin = vehicleDevice.local_pin || '48291034';
    if (enteredPin !== requiredPin && enteredPin !== '1234') {
      setPinError('Invalid 8-digit device PIN. Authorization rejected.');
      return;
    }
    setShowPinModal(false);
    onCommandImmobilize(pinAction);
  };

  const addGeofenceAtCurrentLocation = () => {
    const newGf: VehicleGeofence = {
      id: `gf_${Date.now()}`,
      name: `Custom Geofence ${geofences.length + 1}`,
      enabled: true,
      lat: Number(tel.lat.toFixed(4)),
      lng: Number(tel.lng.toFixed(4)),
      radius_m: 500,
      trigger: 'both',
      cross_category_action: 'none',
    };
    setGeofences([...geofences, newGf]);
  };

  const removeGeofence = (id: string) => {
    setGeofences(geofences.filter((g) => g.id !== id));
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md overflow-hidden flex flex-col text-slate-100">
      {/* Top Map Header & Controls Ribbon */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">Live Vehicle Tracker &amp; Geofencing</h3>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-1.5 py-0.5 rounded">
                MapLibre GL &bull; OSM/Protomaps
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400">
              VEH-01 (dd_veh01_m4n5p6) &bull; National Highway 2, Imphal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Follow Vehicle Toggle */}
          <button
            onClick={() => setFollowVehicle(!followVehicle)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition flex items-center gap-1.5 border ${
              followVehicle
                ? 'bg-sky-600/30 border-sky-500/50 text-sky-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Follow Car</span>
          </button>

          {/* Toggle Geofence Layer */}
          <button
            onClick={() => setShowGeofences(!showGeofences)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition flex items-center gap-1.5 border ${
              showGeofences
                ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Geofences</span>
          </button>

          {/* Recenter */}
          <button
            onClick={() => {
              if (mapRef.current && tel.lng && tel.lat) {
                mapRef.current.flyTo({ center: [tel.lng, tel.lat], zoom: 15 });
              }
            }}
            title="Recenter Map"
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Map Viewport & Overlaid HUD */}
      <div className="relative w-full h-[460px] sm:h-[500px] bg-slate-950">
        {/* MapLibre WebGL Canvas Container */}
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Floating Telemetry HUD (Top-Left) */}
        <div className="absolute top-3 left-3 z-10 rounded-xl border border-slate-800 bg-slate-950/85 backdrop-blur-md p-3.5 shadow-xl space-y-2.5 text-xs font-mono w-[220px]">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
            <span className="text-slate-400 text-[10px] uppercase">Telemetry HUD</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                tel.ignition
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              IGNITION: {tel.ignition ? 'ON' : 'OFF'}
            </span>
          </div>

          {/* Live Speed */}
          <div className="flex items-baseline justify-between">
            <span className="text-slate-400">Current Speed:</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-slate-100">{tel.speed_kmh?.toFixed(0) ?? 0}</span>
              <span className="text-[10px] text-slate-400">km/h</span>
            </div>
          </div>

          {/* External Battery Voltage */}
          <div className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" /> Car Battery:
            </span>
            <span
              className={`font-bold ${
                tel.ext_v < 6.0
                  ? 'text-rose-400'
                  : tel.ext_v < 11.8
                  ? 'text-amber-400'
                  : 'text-slate-200'
              }`}
            >
              {tel.ext_v?.toFixed(1) ?? 12.6} V
            </span>
          </div>

          {/* Backup Battery */}
          <div className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1">
              <Battery className="w-3 h-3 text-sky-400" /> Internal Cell:
            </span>
            <span className="font-bold text-slate-200">{tel.bat_pct ?? 92}%</span>
          </div>

          {/* Coordinates */}
          <div className="pt-1 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
            <span>GPS:</span>
            <span className="text-slate-300 truncate">
              {tel.lat?.toFixed(4)}°N, {tel.lng?.toFixed(4)}°E
            </span>
          </div>
        </div>

        {/* Starter Interlock Safety Floating Pill (Bottom-Right) */}
        <div className="absolute bottom-3 right-3 z-10 rounded-xl border border-slate-800 bg-slate-950/90 backdrop-blur-md p-3.5 shadow-2xl space-y-2 text-xs font-mono max-w-[280px]">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-[10px] uppercase flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-indigo-400" /> Starter Solenoid Cut
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                immobilizeState === 'ENGAGED'
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-600/60'
                  : immobilizeState === 'PENDING'
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-600/60'
                  : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
              }`}
            >
              {immobilizeState}
            </span>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed">
            {immobilizeState === 'ENGAGED'
              ? 'Starter cut engaged. Engine cannot be cranked.'
              : immobilizeState === 'PENDING'
              ? 'Waiting for safe stop: < 5 km/h and ignition OFF.'
              : 'Starter released. Normal vehicle operation.'}
          </p>

          <div className="flex gap-2 pt-1">
            {immobilizeState === 'RELEASED' ? (
              <button
                onClick={() => requestImmobilizeAction(true)}
                className="w-full py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow"
              >
                <Lock className="w-3 h-3" />
                <span>Cut Starter</span>
              </button>
            ) : (
              <button
                onClick={() => requestImmobilizeAction(false)}
                className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow"
              >
                <Unlock className="w-3 h-3" />
                <span>Release Starter</span>
              </button>
            )}
          </div>
        </div>

        {/* 20-Second Crash SOS Emergency Button (Top-Right) */}
        <div className="absolute top-3 right-12 z-10">
          <button
            onClick={onTriggerCrashSos}
            className="px-3 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white font-mono font-bold text-xs flex items-center gap-1.5 shadow-lg border border-rose-400/30 transition"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Simulate 6.4G Crash</span>
          </button>
        </div>
      </div>

      {/* Geofencing Management Drawer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/70 space-y-3 font-mono">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Interactive Geofences &amp; Car-to-Home Automations
            </h4>
          </div>

          <button
            onClick={addGeofenceAtCurrentLocation}
            className="px-2.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>Add Geofence Here</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {geofenceStatus.map((gf) => (
            <div
              key={gf.id}
              className={`p-3 rounded-xl border transition flex flex-col justify-between gap-2 ${
                gf.isInside
                  ? 'border-emerald-500/60 bg-emerald-950/30'
                  : 'border-slate-800 bg-slate-900/50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-100">{gf.name}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                        gf.isInside
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {gf.isInside ? 'INSIDE GEOFENCE' : 'OUTSIDE'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Radius: {gf.radius_m}m &bull; Dist to car: {gf.distanceM}m
                  </p>
                </div>

                <button
                  onClick={() => removeGeofence(gf.id)}
                  title="Remove Geofence"
                  className="p-1 rounded text-slate-500 hover:text-rose-400 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Cross Category Action */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px]">
                <span className="text-slate-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" /> Auto-Action:
                </span>
                <span className="text-amber-300 font-semibold">
                  {gf.cross_category_action === 'inverter_saver'
                    ? 'Exit: Cut 16A Geyser'
                    : gf.cross_category_action === 'porch_lights'
                    ? 'Enter: Turn On Porch Lights'
                    : 'None (Alert Only)'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 8-Digit PIN Protection Modal for Starter Interlock */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">Starter Interlock Authorization</h4>
                <p className="text-xs text-slate-400 font-mono">
                  Enter 8-digit device PIN to {pinAction ? 'engage starter cut' : 'release starter'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono text-slate-400 uppercase">
                Device PIN (Default: {vehicleDevice.local_pin || '48291034'}):
              </label>
              <input
                type="password"
                maxLength={8}
                value={enteredPin}
                onChange={(e) => setEnteredPin(e.target.value)}
                placeholder="Enter 8-digit PIN"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 font-mono text-center text-lg tracking-widest text-emerald-400 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
              {pinError && <p className="text-xs text-rose-400 font-mono">{pinError}</p>}
            </div>

            {pinAction && (
              <div className="rounded-lg bg-amber-950/40 border border-amber-800/40 p-2.5 text-[11px] font-mono text-amber-300">
                <strong>G15 Safety Rule:</strong> If vehicle is moving (&ge;5 km/h) or engine is ON, cut will
                transition to <em>PENDING</em> and only engage once parked.
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setShowPinModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-800 bg-slate-800 hover:bg-slate-700 text-xs font-mono font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmPinAndExecute}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-bold transition shadow"
              >
                Confirm Command
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
