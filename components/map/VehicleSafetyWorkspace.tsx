'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Battery,
  Car,
  ChevronDown,
  ChevronUp,
  Gauge,
  Lock,
  MapPin,
  MoreHorizontal,
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
  Dropdown,
  OtpPinInput,
  PrecisionSlider,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import {
  CollapsibleSection,
  useWorkspace,
} from '@/components/workspace';
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

type SheetDetent = 'peek' | 'half' | 'expanded';

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
  const [sheetDetent, setSheetDetent] = useState<SheetDetent>('half');
  const [testMenuOpen, setTestMenuOpen] = useState(false);
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
  const cadenceLabel = tel.speed_kmh >= 5 || tel.ignition ? '10s Moving' : '60s Parked';

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

  const cycleDetent = () => {
    setSheetDetent((cur) =>
      cur === 'peek' ? 'half' : cur === 'half' ? 'expanded' : 'peek'
    );
  };

  const inspectorContent = (
    <div className="space-y-3">
      {/* 4-Tab Bar inside Sheet */}
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

          <div className="rounded-xl border hairline-border bg-surface-elevated/50 px-3 py-2 flex items-center justify-between text-xs font-mono tabular-nums">
            <span className="text-foreground-muted">GPS FIX ({cadenceLabel})</span>
            <span className="text-foreground font-semibold">
              {tel.lat.toFixed(4)}°N, {tel.lng.toFixed(4)}°E
            </span>
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
            <div className="text-[10px] font-mono text-foreground-muted tabular-nums">
              Waypoint GPS: {currentWaypoint.lat.toFixed(4)}°N, {currentWaypoint.lng.toFixed(4)}°E
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Geofence Zones */}
      {inspectorTab === 'geofences' && (
        <div className="space-y-2.5 text-xs">
          <div className="space-y-1.5">
            {geofences.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-xl border hairline-border bg-surface-elevated/60 px-3 py-2"
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
        <div className="lg:col-span-8 relative rounded-2xl border hairline-border overflow-hidden min-h-[580px] bg-surface">
          {/* Minimal Floating Top Pill on Map */}
          <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border hairline-border bg-surface/90 backdrop-blur-md px-2.5 py-1.5 shadow-lg">
              <Dropdown
                ariaLabel="Select vehicle"
                value={vehicle.device_id}
                onChange={setSelectedId}
                triggerClassName="h-7 min-h-0 px-2 text-xs"
                options={vehicles.map((v) => ({
                  value: v.device_id,
                  label: v.name,
                  badge: v.state.immobilize ?? 'RELEASED',
                  icon: <Car className="h-3.5 w-3.5" />,
                }))}
              />
              <Badge variant={tel.ignition ? 'warning' : 'neutral'} dot>
                {tel.ignition ? `${tel.speed_kmh.toFixed(0)} km/h` : 'PARKED'}
              </Badge>
              <Badge variant="mono">
                <Battery className="h-3 w-3" />
                <span>{tel.bat_pct}%</span>
              </Badge>
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border hairline-border bg-surface/90 backdrop-blur-md px-2 py-1 shadow-lg">
              <Button
                variant="danger"
                size="sm"
                onClick={() => simulatorEngine.triggerVehicleCrash()}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Test 20s Crash SOS</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => simulatorEngine.triggerVehicleFaultAlert('EXT_POWER_LOST')}
              >
                <span>Test 12V Cut</span>
              </Button>
            </div>
          </div>

          <ErrorBoundary>
            <VehicleLiveMap
              vehicleDevice={vehicle}
              onTriggerCrashSos={() => simulatorEngine.triggerVehicleCrash()}
              onCommandImmobilize={(engage) =>
                simulatorEngine.sendCommand(vehicle.device_id, { immobilize: engage }, 'pwa_cloud')
              }
            />
          </ErrorBoundary>
        </div>

        <div className="lg:col-span-4 rounded-2xl border hairline-border bg-surface/85 p-3.5 space-y-3">
          {inspectorContent}
        </div>
      </div>

      {/* Mobile & Tablet Layout: Full-Bleed MapLibre Canvas + Multi-Detent Collapsible Bottom Sheet (Peek -> Half -> Expanded) */}
      <div className="lg:hidden relative h-[calc(100vh-132px)] min-h-[500px] rounded-2xl border hairline-border overflow-hidden bg-surface">
        {/* Minimal Floating Top Pill */}
        <div className="absolute top-2.5 inset-x-2.5 z-20 flex items-center justify-between gap-1.5 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border hairline-border bg-surface/90 backdrop-blur-md px-2.5 py-1 shadow-lg">
            <Car className="h-3.5 w-3.5 text-accent shrink-0" />
            <span className="text-xs font-semibold text-foreground truncate max-w-[115px]">
              {vehicle.name}
            </span>
            <Badge variant={tel.ignition ? 'warning' : 'neutral'} dot className="text-[10px]">
              {tel.ignition ? `${tel.speed_kmh.toFixed(0)} km/h` : 'PARKED'}
            </Badge>
          </div>

          <div className="pointer-events-auto relative">
            <button
              type="button"
              onClick={() => setTestMenuOpen((o) => !o)}
              aria-label="Test vehicle alerts"
              className="inline-flex h-8 items-center gap-1 rounded-full border hairline-border bg-surface/90 backdrop-blur-md px-2.5 text-[11px] font-medium text-foreground shadow-lg cursor-pointer"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-danger" />
              <span>SOS Sim</span>
              <MoreHorizontal className="h-3.5 w-3.5 text-foreground-muted" />
            </button>

            {testMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-border bg-surface shadow-2xl p-1.5 z-30 space-y-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    simulatorEngine.triggerVehicleCrash();
                    setTestMenuOpen(false);
                  }}
                  className="w-full text-left rounded-lg px-2.5 py-2 text-danger font-semibold hover:bg-danger/10 cursor-pointer"
                >
                  Trigger 20s Crash SOS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    simulatorEngine.triggerVehicleFaultAlert('SOS_MANUAL');
                    setTestMenuOpen(false);
                  }}
                  className="w-full text-left rounded-lg px-2.5 py-2 text-foreground hover:bg-surface-elevated cursor-pointer"
                >
                  Trigger Manual SOS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    simulatorEngine.triggerVehicleFaultAlert('EXT_POWER_LOST');
                    setTestMenuOpen(false);
                  }}
                  className="w-full text-left rounded-lg px-2.5 py-2 text-warning hover:bg-surface-elevated cursor-pointer"
                >
                  Simulate 12V Battery Cut
                </button>
              </div>
            )}
          </div>
        </div>

        {/* MapLibre Canvas */}
        <div className="absolute inset-0">
          <ErrorBoundary>
            <VehicleLiveMap
              vehicleDevice={vehicle}
              onTriggerCrashSos={() => simulatorEngine.triggerVehicleCrash()}
              onCommandImmobilize={(engage) =>
                simulatorEngine.sendCommand(vehicle.device_id, { immobilize: engage }, 'pwa_cloud')
              }
            />
          </ErrorBoundary>
        </div>

        {/* Multi-Detent Collapsible Bottom Sheet (Peek -> Half -> Expanded) */}
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 z-20 rounded-t-2xl border-t hairline-border bg-surface/95 backdrop-blur-xl shadow-2xl transition-all duration-200 flex flex-col',
            sheetDetent === 'peek'
              ? 'h-[88px]'
              : sheetDetent === 'half'
              ? 'h-[50%]'
              : 'h-[84%]'
          )}
        >
          {/* Sheet Grab Handle & Detent Switcher Bar */}
          <div className="px-3.5 pt-2 pb-1.5 border-b hairline-border flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={cycleDetent}
              className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer"
            >
              <span className="h-1.5 w-8 rounded-full bg-border-strong shrink-0" />
              <span className="text-xs font-semibold text-foreground truncate">
                {vehicle.name}
              </span>
              <span className="text-[11px] font-mono text-foreground-muted tabular-nums">
                · {tel.ext_v.toFixed(1)}V · {immobilizeState}
              </span>
            </button>

            <div className="flex items-center gap-1 shrink-0">
              {(['peek', 'half', 'expanded'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSheetDetent(d)}
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-mono uppercase cursor-pointer',
                    sheetDetent === d
                      ? 'bg-accent text-[var(--dd-accent-fg)] font-semibold'
                      : 'text-foreground-muted hover:text-foreground'
                  )}
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={cycleDetent}
                aria-label="Toggle sheet height"
                className="p-1 text-foreground-muted hover:text-foreground cursor-pointer"
              >
                {sheetDetent === 'expanded' ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Sheet Body */}
          <div className="flex-1 overflow-y-auto dd-scroll p-3">
            {inspectorContent}
          </div>
        </div>
      </div>
    </div>
  );
};
