'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Battery,
  Car,
  Gauge,
  Lock,
  MapPin,
  Navigation,
  Phone,
  Plus,
  Route,
  Shield,
  ShieldCheck,
  Trash2,
  Unlock,
} from 'lucide-react';
import {
  VehicleTelemetryPayload,
  evaluateStarterInterlockSafety,
} from '@/lib/protocol/contract';
import { simulatorEngine } from '@/lib/simulator/engine';
import { VehicleLiveMap } from '@/components/map/VehicleLiveMap';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dropdown,
  OtpPinInput,
  PrecisionSlider,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import {
  CollapsibleSection,
  FullscreenStage,
  ResizableSplit,
  useWorkspace,
} from '@/components/workspace';

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

export interface VehicleSafetyWorkspaceProps {
  initialDeviceId?: string;
}

export const VehicleSafetyWorkspace: React.FC<VehicleSafetyWorkspaceProps> = ({
  initialDeviceId,
}) => {
  const { snapshot, prefs } = useWorkspace();
  const { pushToast } = useToast();

  const vehicles = useMemo(
    () => Object.values(snapshot.devices).filter((d) => d.module_code === 'VEH-01'),
    [snapshot.devices]
  );

  const [selectedId, setSelectedId] = useState<string>(
    initialDeviceId || vehicles[0]?.device_id || 'dd_veh01_m4n5p6'
  );
  const [inspectorTab, setInspectorTab] = useState<'hud' | 'trips' | 'geofences' | 'sos'>('hud');
  const [pin, setPin] = useState('');
  const [tripProgressPct, setTripProgressPct] = useState(100);
  const [selectedTripId, setSelectedTripId] = useState(DEMO_TRIPS[0].trip_id);

  // Geofences state
  const [geofences, setGeofences] = useState([
    { id: 'geo_home', name: 'Imphal Residence', radiusM: 350, carToHome: true },
    { id: 'geo_office', name: 'City Center', radiusM: 500, carToHome: false },
  ]);
  const [newGeoName, setNewGeoName] = useState('');
  const [newGeoRadius, setNewGeoRadius] = useState(300);

  // G14 Emergency Contacts (0-3 E.164)
  const vehicle = snapshot.devices[selectedId] ?? vehicles[0];
  const [contacts, setContacts] = useState<string[]>(
    () => vehicle?.config.sos?.contacts ?? ['+919862011114', '+919862022282']
  );
  const [newContact, setNewContact] = useState('+91');

  if (!vehicle) {
    return (
      <Card className="p-8 text-center text-xs text-foreground-muted">
        No VEH-01 module registered in this home.
      </Card>
    );
  }

  const tel = vehicle.telemetry as VehicleTelemetryPayload;
  const safety = evaluateStarterInterlockSafety(tel.speed_kmh, tel.ignition);
  const isOwner = prefs.userRole === 'OWNER';
  const immobilizeState = vehicle.state.immobilize ?? 'RELEASED';
  const isEngagedOrPending = immobilizeState === 'ENGAGED' || immobilizeState === 'PENDING';
  const cadenceLabel = tel.speed_kmh >= 5 || tel.ignition ? '5s Moving (G15d)' : '60s Parked (G15d)';

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
    setContacts(next);
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
    setContacts(next);
    simulatorEngine.updateConfig(vehicle.device_id, {
      ...vehicle.config,
      sos: { contacts: next, sms_fallback: true },
    });
  };

  const addGeofence = () => {
    if (!newGeoName.trim()) return;
    setGeofences((prev) => [
      ...prev,
      { id: `geo_${Date.now()}`, name: newGeoName.trim(), radiusM: newGeoRadius, carToHome: true },
    ]);
    setNewGeoName('');
    pushToast({ title: 'Geofence Zone Created', tone: 'success' });
  };

  const selectedTrip = DEMO_TRIPS.find((t) => t.trip_id === selectedTripId) ?? DEMO_TRIPS[0];
  const waypointIdx = Math.min(
    selectedTrip.waypoints.length - 1,
    Math.floor((tripProgressPct / 100) * selectedTrip.waypoints.length)
  );
  const currentWaypoint = selectedTrip.waypoints[waypointIdx];

  const mapPane = (
    <FullscreenStage
      title={`${vehicle.name} — Live Telematics`}
      subtitle={`MapLibre GL · OSM/Protomaps (Zero API Cost) · ${cadenceLabel}`}
      toolbar={
        <div className="flex items-center gap-1.5">
          <Badge variant={tel.ignition ? 'warning' : 'neutral'} dot>
            {tel.ignition ? 'IGN ON' : 'PARKED'}
          </Badge>
          <Badge variant="mono">{tel.speed_kmh.toFixed(0)} km/h</Badge>
          <Badge variant="mono">
            <Battery className="h-3 w-3" />
            <span>{tel.bat_pct}%</span>
          </Badge>
        </div>
      }
    >
      <ErrorBoundary>
        <VehicleLiveMap
          vehicleDevice={vehicle}
          onTriggerCrashSos={() => simulatorEngine.triggerVehicleCrash()}
          onCommandImmobilize={(engage) =>
            simulatorEngine.sendCommand(vehicle.device_id, { immobilize: engage }, 'pwa_cloud')
          }
        />
      </ErrorBoundary>
    </FullscreenStage>
  );

  const inspectorPane = (
    <div className="space-y-3">
      <SegmentedControl<'hud' | 'trips' | 'geofences' | 'sos'>
        fullWidth
        size="sm"
        ariaLabel="Vehicle Inspector Tabs"
        value={inspectorTab}
        onChange={setInspectorTab}
        options={[
          { value: 'hud', label: 'Live HUD', icon: <Gauge className="h-3 w-3" /> },
          { value: 'trips', label: 'Trips', icon: <Route className="h-3 w-3" /> },
          { value: 'geofences', label: 'Zones', icon: <MapPin className="h-3 w-3" /> },
          { value: 'sos', label: 'SOS / Lock', icon: <Shield className="h-3 w-3" /> },
        ]}
      />

      {inspectorTab === 'hud' && (
        <Card className="space-y-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-4 w-4 text-accent" />
              <span>Live Telematics HUD</span>
            </CardTitle>
            <Badge variant="mono">{cadenceLabel}</Badge>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
            <div className="rounded border border-border bg-surface-elevated p-2.5">
              <div className="text-[10px] text-foreground-muted">SPEED</div>
              <div className="text-base font-bold">{tel.speed_kmh.toFixed(1)} km/h</div>
            </div>
            <div className="rounded border border-border bg-surface-elevated p-2.5">
              <div className="text-[10px] text-foreground-muted">IGNITION</div>
              <div className="text-base font-bold">{tel.ignition ? 'ON' : 'OFF'}</div>
            </div>
            <div className="rounded border border-border bg-surface-elevated p-2.5">
              <div className="text-[10px] text-foreground-muted">VEHICLE 12V</div>
              <div className="text-base font-bold">{tel.ext_v.toFixed(1)} V</div>
            </div>
            <div className="rounded border border-border bg-surface-elevated p-2.5">
              <div className="text-[10px] text-foreground-muted">BACKUP BATT</div>
              <div className="text-base font-bold">{tel.bat_pct}%</div>
            </div>
            <div className="col-span-2 rounded border border-border bg-surface-elevated p-2.5 flex items-center justify-between">
              <span className="text-[10px] text-foreground-muted">COORDINATES</span>
              <span>
                {tel.lat.toFixed(4)}°N, {tel.lng.toFixed(4)}°E
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {inspectorTab === 'trips' && (
        <Card className="space-y-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Navigation className="h-4 w-4 text-accent" />
              <span>Trip History &amp; Polyline Replay</span>
            </CardTitle>
            <Badge variant="mono">vehicles/{vehicle.device_id}/trips</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="space-y-1.5">
              {DEMO_TRIPS.map((trip) => (
                <button
                  key={trip.trip_id}
                  type="button"
                  onClick={() => {
                    setSelectedTripId(trip.trip_id);
                    setTripProgressPct(100);
                  }}
                  className={`w-full rounded-[var(--dd-radius-control)] border p-2.5 text-left transition-colors cursor-pointer ${
                    selectedTripId === trip.trip_id
                      ? 'border-accent-border bg-accent-soft/60'
                      : 'border-border bg-surface-elevated'
                  }`}
                >
                  <div className="font-semibold text-foreground">{trip.label}</div>
                  <div className="text-[11px] font-mono text-foreground-muted tabular-nums mt-0.5">
                    {trip.date} · {trip.distanceKm} km · {trip.durationMin}m · Max {trip.maxSpeedKmh} km/h
                  </div>
                </button>
              ))}
            </div>

            <div className="rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated p-3 space-y-2">
              <PrecisionSlider
                label={`Replay Scrubber · ${currentWaypoint.label}`}
                value={tripProgressPct}
                min={0}
                max={100}
                unit="%"
                onChange={setTripProgressPct}
              />
              <div className="text-[10px] font-mono text-foreground-muted tabular-nums">
                Waypoint GPS: {currentWaypoint.lat.toFixed(4)}°N, {currentWaypoint.lng.toFixed(4)}°E
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {inspectorTab === 'geofences' && (
        <Card className="space-y-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-accent" />
              <span>Geofence Zones &amp; Car-to-Home</span>
            </CardTitle>
            <Badge variant="accent">ALL-IN FAMILY</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="space-y-1.5">
              {geofences.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between rounded border border-border bg-surface-elevated px-3 py-2"
                >
                  <div>
                    <div className="font-medium text-foreground">{g.name}</div>
                    <div className="text-[10px] font-mono text-foreground-muted tabular-nums">
                      Radius: {g.radiusM} m {g.carToHome ? '· Car-to-Home Linked' : ''}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${g.name}`}
                    onClick={() => setGeofences((prev) => prev.filter((x) => x.id !== g.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-border space-y-2">
              <input
                type="text"
                value={newGeoName}
                onChange={(e) => setNewGeoName(e.target.value)}
                placeholder="New zone name (e.g. School Gate)"
                className="w-full h-9 rounded border border-border bg-surface-elevated px-2.5 text-xs text-foreground"
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
          </CardContent>
        </Card>
      )}

      {inspectorTab === 'sos' && (
        <div className="space-y-3">
          {/* G15a-c Starter Immobilizer Workflow */}
          <Card className="space-y-3">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-accent" />
                  <span>Starter-Only Immobilizer (G15a–c)</span>
                </CardTitle>
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
            </CardHeader>

            <CardContent className="space-y-3 text-xs">
              {vehicle.state.immobilize_reason && (
                <div className="rounded border border-warning/40 bg-warning-soft px-2.5 py-1.5 font-mono text-[11px]">
                  Reason: {vehicle.state.immobilize_reason}
                </div>
              )}

              {!isOwner && (
                <Banner
                  tone="critical"
                  title="Owner-Only Security Gate (database.rules.json)"
                  description="Your active role is MEMBER. Switch to OWNER in Settings to actuate set.immobilize."
                />
              )}

              {!isEngagedOrPending && isOwner && (
                <OtpPinInput
                  length={4}
                  masked
                  label="Owner Safety Confirmation PIN"
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
            </CardContent>
          </Card>

          {/* G14 Emergency Contacts (0-3 E.164, sms_fallback locked ON) */}
          <CollapsibleSection
            sectionId="veh_g14_contacts"
            title="Emergency Contacts (G14 · 0–3 E.164)"
            subtitle="Synced to .../config with hardware GSM fallback"
            icon={<Phone className="h-3.5 w-3.5" />}
            badge={<Badge variant="success">sms_fallback: LOCKED ON</Badge>}
          >
            <div className="space-y-2.5 text-xs">
              {contacts.map((c) => (
                <div
                  key={c}
                  className="flex items-center justify-between rounded border border-border bg-surface-elevated px-2.5 py-1.5 font-mono"
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
                  className="flex-1 h-9 rounded border border-border bg-surface-elevated px-2.5 font-mono text-xs text-foreground"
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
    <div className="space-y-4">
      {/* Compact Top Vehicle Context Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Dropdown
            ariaLabel="Select vehicle"
            value={vehicle.device_id}
            onChange={setSelectedId}
            options={vehicles.map((v) => ({
              value: v.device_id,
              label: v.name,
              description: v.device_id,
              badge: v.state.immobilize ?? 'RELEASED',
              icon: <Car className="h-3.5 w-3.5" />,
            }))}
          />
          <Badge variant="mono">{cadenceLabel}</Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="danger"
            size="sm"
            touchTarget
            onClick={() => simulatorEngine.triggerVehicleCrash()}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Test 20s Crash SOS</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => simulatorEngine.triggerVehicleFaultAlert('SOS_MANUAL')}
          >
            <span>Test Manual SOS</span>
          </Button>
        </div>
      </div>

      {/* Responsive Split-Pane: Map + Inspector */}
      <ResizableSplit
        splitId="vehicle_workspace_split"
        defaultPrimaryPct={62}
        primary={mapPane}
        secondary={inspectorPane}
      />
    </div>
  );
};
