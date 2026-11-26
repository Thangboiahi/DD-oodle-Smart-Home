/**
 * DD oodle Smart Home — Zero-API-Cost Vehicle Geolocation & OSRM Routing Helpers
 *
 * Uses browser Geolocation API (with Home coordinates fallback), public OSRM driving
 * endpoint (router.project-osrm.org), haversine straight-line offline fallback, and
 * external Google Maps turn-by-turn URLs (zero paid Maps API calls).
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface UserLocationState {
  lat: number;
  lng: number;
  accuracyM: number;
  source: 'gps' | 'home_fallback';
  label: string;
  updatedAt: number;
  errorMessage?: string;
}

export interface VehicleRouteData {
  mode: 'osrm' | 'straight_fallback';
  /** GeoJSON [lng, lat][] coordinate pairs */
  coordinates: [number, number][];
  distanceKm: number;
  durationMin: number;
  fetchedAt: number;
}

export interface HomeCoordinatePreset {
  lat: number;
  lng: number;
  label: string;
}

export const HOME_COORDINATE_PRESETS: Record<string, HomeCoordinatePreset> = {
  home_imphal_001: {
    lat: 24.333,
    lng: 93.683,
    label: 'Lamka Smart Residence (Churachandpur)',
  },
  home_guwahati_002: {
    lat: 24.817,
    lng: 93.9368,
    label: 'Imphal Duplex (Lamphelpat)',
  },
};

export function getHomeFallbackCoords(homeId: string, fallbackName?: string): HomeCoordinatePreset {
  const preset = HOME_COORDINATE_PRESETS[homeId];
  if (preset) return preset;
  return {
    lat: 24.333,
    lng: 93.683,
    label: fallbackName || 'Lamka Smart Residence',
  };
}

/**
 * Great-circle Haversine distance in meters between two WGS84 coordinates.
 */
export function haversineDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/**
 * Builds an offline/fallback straight-line route with Haversine distance and ~30 km/h urban ETA.
 */
export function buildStraightLineRoute(
  origin: GeoPoint,
  destination: GeoPoint
): VehicleRouteData {
  const meters = haversineDistanceMeters(origin, destination);
  const distanceKm = Number((meters / 1000).toFixed(2));
  const durationMin = meters < 50 ? 1 : Math.max(1, Math.round((distanceKm / 30) * 60));

  return {
    mode: 'straight_fallback',
    coordinates: [
      [origin.lng, origin.lat],
      [destination.lng, destination.lat],
    ],
    distanceKm,
    durationMin,
    fetchedAt: Date.now(),
  };
}

interface OsrmRouteApiResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: {
      type?: string;
      coordinates?: [number, number][];
    };
  }>;
}

/**
 * Fetches driving road route from public zero-API-key OSRM.
 * Automatically falls back to dashed straight-line + Haversine distance if offline or unreachable.
 */
export async function fetchOsrmDrivingRoute(
  origin: GeoPoint,
  destination: GeoPoint,
  externalSignal?: AbortSignal
): Promise<VehicleRouteData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException('Aborted', 'AbortError');
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng.toFixed(6)},${origin.lat.toFixed(6)};${destination.lng.toFixed(6)},${destination.lat.toFixed(6)}?overview=full&geometries=geojson`;
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return buildStraightLineRoute(origin, destination);
    }

    const data = (await response.json()) as OsrmRouteApiResponse;
    const primary = data.routes?.[0];
    const coords = primary?.geometry?.coordinates;

    if (
      data.code !== 'Ok' ||
      !primary ||
      !Array.isArray(coords) ||
      coords.length < 2 ||
      typeof primary.distance !== 'number' ||
      typeof primary.duration !== 'number'
    ) {
      return buildStraightLineRoute(origin, destination);
    }

    return {
      mode: 'osrm',
      coordinates: coords,
      distanceKm: Number((primary.distance / 1000).toFixed(2)),
      durationMin: Math.max(1, Math.round(primary.duration / 60)),
      fetchedAt: Date.now(),
    };
  } catch (err) {
    if (externalSignal?.aborted) {
      throw err;
    }
    return buildStraightLineRoute(origin, destination);
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Generates an external 1-tap Google Maps turn-by-turn directions URL (no API key required).
 */
export function buildGoogleMapsDirectionsUrl(
  origin: GeoPoint | null,
  destination: GeoPoint
): string {
  const dest = `${destination.lat.toFixed(6)},${destination.lng.toFixed(6)}`;
  if (origin) {
    const orig = `${origin.lat.toFixed(6)},${origin.lng.toFixed(6)}`;
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(orig)}&destination=${encodeURIComponent(dest)}&travelmode=driving`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

/**
 * Generates GeoJSON Polygon ring coordinates for a circle in meters (used for geofences & GPS accuracy rings).
 */
export function createCirclePolygonCoords(
  centerLng: number,
  centerLat: number,
  radiusMeters: number,
  points: number = 48
): [number, number][] {
  const safeRadius = Math.max(10, radiusMeters);
  const cosLat = Math.max(0.05, Math.cos((centerLat * Math.PI) / 180));
  const distanceX = safeRadius / (111320 * cosLat);
  const distanceY = safeRadius / 110540;

  const coords: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([centerLng + distanceX * Math.cos(theta), centerLat + distanceY * Math.sin(theta)]);
  }
  coords.push(coords[0]);
  return coords;
}

export function formatRouteDistance(distanceKm: number): string {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return '0.0 km';
  return `${distanceKm.toFixed(1)} km`;
}
