'use client';

import React, { useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  Home,
  Mic,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Shield,
  Sliders,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  SegmentedControl,
  TactileSwitch,
  useToast,
} from '@/components/ui';
import {
  CollapsibleSection,
  UiDensity,
  useWorkspace,
} from '@/components/workspace';
import { CustomTriColorStudio } from '@/components/theme/CustomTriColorStudio';
import { MotionPreference } from '@/components/theme/triColor';

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export default function SettingsPage() {
  const {
    prefs,
    activeHome,
    setMotionMode,
    setDensity,
    updateWorkspacePrefs,
    resetWorkspacePreferences,
  } = useWorkspace();
  const { pushToast } = useToast();

  // Home & Tariff local fields
  const [homeName, setHomeName] = useState(activeHome.name);
  const [homeAddress, setHomeAddress] = useState('Lamphelpat, Imphal West, Manipur 795004');

  // Family Members & Granular Restrictions
  const [members, setMembers] = useState([
    {
      id: 'mem_1',
      name: 'Priya Sharma',
      phone: '+919862022282',
      role: 'MEMBER' as const,
      allowDoorLocks: true,
      allowImmobilizer: false,
      allowBilling: false,
    },
  ]);
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('+91');

  // Emergency Contacts & Push/WhatsApp
  const [emergencyContacts, setEmergencyContacts] = useState(['+919862011114', '+919862022282']);
  const [newContact, setNewContact] = useState('+91');
  const [whatsappAlerts, setWhatsappAlerts] = useState(true);
  const [pushPerm, setPushPerm] = useState<string>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  // Voice C2C Siri webhook token
  const [siriToken, setSiriToken] = useState('dd_siri_9f4a2c8e7b10');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    pushToast({ title: 'Copied to Clipboard', tone: 'info' });
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const requestPushPermission = async () => {
    if (typeof Notification === 'undefined') {
      pushToast({ title: 'Notifications API not supported in this browser', tone: 'warning' });
      return;
    }
    const res = await Notification.requestPermission();
    setPushPerm(res);
    pushToast({
      title: `FCM Web Push: ${res.toUpperCase()}`,
      tone: res === 'granted' ? 'success' : 'warning',
    });
  };

  const inviteFamilyMember = () => {
    const cleanPhone = invitePhone.trim();
    if (!inviteName.trim() || !E164_REGEX.test(cleanPhone)) {
      pushToast({
        title: 'Enter member name & valid E.164 phone',
        description: 'Example: +919862012345',
        tone: 'warning',
      });
      return;
    }
    setMembers((prev) => [
      ...prev,
      {
        id: `mem_${Date.now()}`,
        name: inviteName.trim(),
        phone: cleanPhone,
        role: 'MEMBER',
        allowDoorLocks: false,
        allowImmobilizer: false,
        allowBilling: false,
      },
    ]);
    setInviteName('');
    setInvitePhone('+91');
    pushToast({ title: 'Family Member Invited', description: cleanPhone, tone: 'success' });
  };

  const addEmergencyContact = () => {
    const clean = newContact.trim();
    if (!E164_REGEX.test(clean)) {
      pushToast({
        title: 'Invalid E.164 Phone',
        description: 'Must match ^\\+[1-9]\\d{7,14}$',
        tone: 'warning',
      });
      return;
    }
    if (emergencyContacts.length >= 3) {
      pushToast({ title: 'Maximum 3 Emergency Contacts', tone: 'warning' });
      return;
    }
    setEmergencyContacts((prev) => [...prev, clean]);
    setNewContact('+91');
    pushToast({ title: 'Emergency Contact Added', tone: 'success' });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {/* Compact Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--dd-radius-card)] bg-surface/75 hairline-border px-3.5 py-2.5">
        <div>
          <h1 className="text-sm sm:text-base font-semibold tracking-tight text-foreground">
            Settings &amp; Theme Studio
          </h1>
          <p className="text-[11px] text-foreground-secondary">
            Tri-color palette, motion &amp; haptics, home tariff, family RBAC, G14 SOS contacts, and Voice C2C.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            resetWorkspacePreferences();
            pushToast({ title: 'Workspace Preferences & Docks Reset', tone: 'info' });
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset Layout</span>
        </Button>
      </div>

      {/* 1. APPEARANCE & TRI-COLOR THEME STUDIO (Expanded by Default) */}
      <CollapsibleSection
        sectionId="settings_appearance"
        title="1. Appearance & Tri-Color Theme Studio"
        subtitle="Preset or custom 3-stop WCAG AA theme persisted across sessions"
        icon={<Palette className="h-3.5 w-3.5" />}
        badge={<Badge variant="mono">PERSISTED</Badge>}
        defaultOpen={true}
      >
        <CustomTriColorStudio />
      </CollapsibleSection>

      {/* 2. MOTION, DENSITY & HAPTICS */}
      <CollapsibleSection
        sectionId="settings_motion_haptics"
        title="2. Motion, Density & Haptics"
        subtitle={`Density: ${prefs.density} · Motion: ${prefs.motionMode}`}
        icon={<Sliders className="h-3.5 w-3.5" />}
        defaultOpen={false}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-foreground-secondary">UI Density</div>
              <SegmentedControl<UiDensity>
                fullWidth
                ariaLabel="UI Density"
                value={prefs.density}
                onChange={setDensity}
                options={[
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'compact', label: 'Compact' },
                ]}
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-foreground-secondary">
                Fluid Motion Performance
              </div>
              <SegmentedControl<MotionPreference>
                fullWidth
                ariaLabel="Motion preference"
                value={prefs.motionMode}
                onChange={setMotionMode}
                options={[
                  { value: 'fluid', label: 'Fluid', icon: <Zap className="h-3.5 w-3.5" /> },
                  { value: 'reduced', label: 'Reduced' },
                  { value: 'eco', label: 'Eco / Off' },
                ]}
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border/50">
            <TactileSwitch
              label="Haptic Feedback (Android)"
              sublabel="Subtle vibration feedback on switch toggles, fan steps & fault locks"
              checked={prefs.hapticsEnabled}
              onChange={(v) => updateWorkspacePrefs({ hapticsEnabled: v })}
            />
            <TactileSwitch
              label="Prefer Eco 2D Grid over 3D Twin"
              sublabel="Saves GPU & battery on low-end Android phones"
              checked={prefs.eco2DDefault}
              onChange={(v) => updateWorkspacePrefs({ eco2DDefault: v })}
            />
            <TactileSwitch
              label="Always Show Custom Thin Scrollbars"
              sublabel="Keep 5px industrial scrollbars visible inside drawers & logs"
              checked={prefs.scrollbarAlwaysVisible}
              onChange={(v) => updateWorkspacePrefs({ scrollbarAlwaysVisible: v })}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* 3. HOME PROFILE, ELECTRICITY TARIFF & LOCAL HUB */}
      <CollapsibleSection
        sectionId="settings_home_tariff"
        title="3. Home Profile, Tariff (₹/kWh) & Local Hub"
        subtitle={`${homeName} · ₹${prefs.tariffInr}/kWh · Hub ${prefs.hubEnabled ? prefs.hubIp : 'Disabled'}`}
        icon={<Home className="h-3.5 w-3.5" />}
        badge={<Badge variant="mono">{activeHome.id}</Badge>}
        defaultOpen={false}
      >
        <div className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-foreground-secondary font-medium">Home Name</span>
              <input
                type="text"
                value={homeName}
                onChange={(e) => setHomeName(e.target.value)}
                className="w-full h-10 rounded-[var(--dd-radius-control)] hairline-border bg-surface-elevated px-3 text-foreground"
              />
            </label>
            <label className="space-y-1">
              <span className="text-foreground-secondary font-medium">
                Electricity Tariff (`tariff_inr`, ₹/kWh)
              </span>
              <input
                type="number"
                step="0.25"
                min="1"
                max="30"
                value={prefs.tariffInr}
                onChange={(e) => updateWorkspacePrefs({ tariffInr: Number(e.target.value) || 7.5 })}
                className="w-full h-10 rounded-[var(--dd-radius-control)] hairline-border bg-surface-elevated px-3 font-mono text-foreground tabular-nums"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-foreground-secondary font-medium">Address</span>
            <input
              type="text"
              value={homeAddress}
              onChange={(e) => setHomeAddress(e.target.value)}
              className="w-full h-10 rounded-[var(--dd-radius-control)] hairline-border bg-surface-elevated px-3 text-foreground"
            />
          </label>

          <div className="pt-2 border-t border-border/50 space-y-2.5">
            <TactileSwitch
              label="Local Offline Hub Enabled (`hub_enabled`)"
              sublabel="Route commands via HUB-01 local broker when internet drops"
              checked={prefs.hubEnabled}
              onChange={(v) => updateWorkspacePrefs({ hubEnabled: v })}
            />
            <label className="block space-y-1">
              <span className="text-foreground-secondary font-medium">Hub Local IP (`hub_ip`)</span>
              <input
                type="text"
                value={prefs.hubIp}
                onChange={(e) => updateWorkspacePrefs({ hubIp: e.target.value })}
                className="w-full h-10 rounded-[var(--dd-radius-control)] hairline-border bg-surface-elevated px-3 font-mono text-foreground tabular-nums"
              />
            </label>
          </div>
        </div>
      </CollapsibleSection>

      {/* 4. FAMILY MEMBERS & ROLE PERMISSIONS */}
      <CollapsibleSection
        sectionId="settings_family_rbac"
        title="4. Family Roles & Sensitive Action Scoping"
        subtitle={`Active Session Role: ${prefs.userRole} · ${members.length} Family Member(s)`}
        icon={<Users className="h-3.5 w-3.5" />}
        badge={<Badge variant="accent">{prefs.userRole}</Badge>}
        defaultOpen={false}
      >
        <div className="space-y-3.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-elevated/70 hairline-border p-3">
            <div>
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-accent" />
                <span>Active Session Role (RBAC Preview)</span>
              </div>
              <div className="text-[11px] text-foreground-muted mt-0.5">
                Test `database.rules.json` Owner-only gating on `set.immobilize` and billing.
              </div>
            </div>
            <SegmentedControl<'OWNER' | 'MEMBER'>
              size="sm"
              value={prefs.userRole}
              onChange={(role) => updateWorkspacePrefs({ userRole: role })}
              options={[
                { value: 'OWNER', label: 'OWNER' },
                { value: 'MEMBER', label: 'MEMBER' },
              ]}
            />
          </div>

          {members.map((m) => (
            <div
              key={m.id}
              className="rounded-lg bg-surface-elevated/60 hairline-border p-3 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-foreground">{m.name}</div>
                  <div className="text-[11px] font-mono text-foreground-muted">{m.phone}</div>
                </div>
                <Badge variant="neutral">{m.role}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <TactileSwitch
                  label="Door Locks"
                  checked={m.allowDoorLocks}
                  onChange={(v) =>
                    setMembers((prev) =>
                      prev.map((x) => (x.id === m.id ? { ...x, allowDoorLocks: v } : x))
                    )
                  }
                />
                <TactileSwitch
                  label="Vehicle Immobilizer"
                  sublabel="Owner-locked by RTDB"
                  checked={false}
                  locked={true}
                  onChange={() => {}}
                />
                <TactileSwitch
                  label="Billing & Plans"
                  checked={m.allowBilling}
                  onChange={(v) =>
                    setMembers((prev) =>
                      prev.map((x) => (x.id === m.id ? { ...x, allowBilling: v } : x))
                    )
                  }
                />
              </div>
            </div>
          ))}

          <div className="pt-2 border-t border-border/50 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Member Name"
              className="h-10 rounded hairline-border bg-surface-elevated px-3 text-foreground"
            />
            <input
              type="tel"
              value={invitePhone}
              onChange={(e) => setInvitePhone(e.target.value)}
              placeholder="+919862000000"
              className="h-10 rounded hairline-border bg-surface-elevated px-3 font-mono text-foreground"
            />
            <Button variant="primary" touchTarget onClick={inviteFamilyMember}>
              <Plus className="h-3.5 w-3.5" />
              <span>Invite Member</span>
            </Button>
          </div>
        </div>
      </CollapsibleSection>

      {/* 5. EMERGENCY CONTACTS (G14) & NOTIFICATIONS */}
      <CollapsibleSection
        sectionId="settings_alerts_sos"
        title="5. Emergency Contacts (G14), FCM Push & WhatsApp"
        subtitle={`${emergencyContacts.length}/3 E.164 Contacts · Push: ${pushPerm.toUpperCase()}`}
        icon={<Bell className="h-3.5 w-3.5" />}
        defaultOpen={false}
      >
        <div className="space-y-3.5 text-xs">
          <div className="flex items-center justify-between rounded-lg bg-surface-elevated/70 hairline-border p-3">
            <div>
              <div className="font-semibold text-foreground">FCM Web Push Notifications</div>
              <div className="text-[11px] font-mono text-foreground-muted">
                Status: {pushPerm.toUpperCase()} · Core Free Forever
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void requestPushPermission()}>
              {pushPerm === 'granted' ? 'Enabled' : 'Enable Push'}
            </Button>
          </div>

          <TactileSwitch
            label="WhatsApp Alert Escalation (Plus Tier)"
            sublabel="Receive critical fault, Crash SOS & renewal alerts on WhatsApp"
            checked={whatsappAlerts}
            onChange={setWhatsappAlerts}
          />

          <div className="space-y-2 pt-2 border-t border-border/50">
            <div className="font-medium text-foreground-secondary">
              Home Emergency Contacts (0–3 E.164 `^\+[1-9]\d&#123;7,14&#125;$`)
            </div>
            {emergencyContacts.map((c) => (
              <div
                key={c}
                className="flex items-center justify-between rounded hairline-border bg-surface-elevated px-3 py-2 font-mono"
              >
                <span className="tabular-nums">{c}</span>
                <button
                  type="button"
                  onClick={() => setEmergencyContacts((prev) => prev.filter((x) => x !== c))}
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
                className="flex-1 h-9 rounded hairline-border bg-surface-elevated px-3 font-mono text-foreground"
              />
              <Button variant="primary" size="sm" onClick={addEmergencyContact}>
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 6. VOICE ECOSYSTEMS (Phase 1.5 Plus Tier — No Matter/HomeKit in PWA) */}
      <CollapsibleSection
        sectionId="settings_voice_c2c"
        title="6. Voice Ecosystems (Phase 1.5 Plus C2C)"
        subtitle="Google Home, Amazon Alexa & Siri Shortcuts webhooks"
        icon={<Mic className="h-3.5 w-3.5" />}
        badge={<Badge variant="success">C2C READY</Badge>}
        defaultOpen={false}
      >
        <div className="space-y-3">
          <Banner
            tone="info"
            title="Cloud-to-Cloud Voice (Phase 1.5 Plus Tier)"
            description="Google Smart Home, Amazon Alexa, and Siri Shortcuts run via authenticated C2C webhooks. Matter / Apple HomeKit local commissioning is intentionally excluded from the PWA and reserved for HUB-01 Phase 2/3."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {[
              {
                key: 'google',
                name: 'Google Smart Home C2C',
                endpoint: '/api/v1/voice/google',
                status: 'READY',
                desc: 'SYNC / QUERY / EXECUTE fulfillment for Google Home & Assistant.',
              },
              {
                key: 'alexa',
                name: 'Amazon Alexa Skill',
                endpoint: '/api/v1/voice/alexa',
                status: 'READY',
                desc: 'Smart Home Skill v3 directives with OAuth account linking.',
              },
              {
                key: 'siri',
                name: 'Siri Shortcuts Webhook',
                endpoint: `/api/v1/voice/siri?token=${siriToken}`,
                status: 'AUTHENTICATED',
                desc: '1-tap iOS Shortcuts scene & device webhook with rotatable bearer token.',
              },
            ].map((v) => (
              <div
                key={v.key}
                className="flex flex-col justify-between space-y-2.5 rounded-lg bg-surface-elevated/60 hairline-border p-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-foreground">{v.name}</div>
                    <Badge variant="success">{v.status}</Badge>
                  </div>
                  <p className="text-[11px] text-foreground-secondary">{v.desc}</p>
                  <div className="rounded hairline-border bg-canvas/70 p-2 font-mono text-[10px] text-accent break-all">
                    {v.endpoint}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => copyText(v.key, v.endpoint)}
                  >
                    {copiedKey === v.key ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{copiedKey === v.key ? 'Copied' : 'Copy URL'}</span>
                  </Button>
                  {v.key === 'siri' && (
                    <Button
                      variant="outline"
                      size="icon"
                      title="Regenerate Siri Webhook Token"
                      onClick={() => {
                        const next = `dd_siri_${Math.random().toString(36).slice(2, 12)}`;
                        setSiriToken(next);
                        pushToast({ title: 'Siri Webhook Token Rotated', tone: 'info' });
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* 6. Unified Full-Stack Demo Workspace Reset Utility (Phase 13B) */}
      <div className="rounded-[var(--dd-radius-card)] bg-surface/80 hairline-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">
              Canonical Demo Workspace Spine (v1.4 · Phase 13B)
            </span>
            <Badge variant="accent">LIVE SYNC</Badge>
          </div>
          <p className="text-[11px] text-foreground-secondary">
            Restore Lamka Smart Residence &amp; Imphal Duplex, all 12 Phase 1–3 interactive devices,
            42-module catalog, quotes, installer jobs, and 2D/3D layout defaults across all open tabs.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            const { resetDemoWorkspace } = await import('@/lib/data/unifiedStore');
            await resetDemoWorkspace();
            resetWorkspacePreferences();
            pushToast({
              title: 'Demo Workspace Restored to Canonical Seed',
              description:
                'Lamka Smart Residence + Imphal Duplex and all 12 live modules have been reset across all portals.',
              tone: 'success',
            });
          }}
        >
          <RotateCcw className="h-3.5 w-3.5 text-accent" />
          <span>Reset Demo Workspace</span>
        </Button>
      </div>
    </div>
  );
}
