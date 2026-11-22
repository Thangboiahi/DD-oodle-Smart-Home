'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertOctagon,
  Cloud,
  Code2,
  Cpu,
  Lock,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { Phase1ModuleCode } from '@/lib/protocol/contract';
import { resolveEntitlements } from '@/lib/entitlements/resolver';
import {
  INDIAN_RECIPES,
  ProRuleAst,
  buildRulesPayload,
  compileProRules,
} from '@/lib/rules/compiler';
import { simulatorEngine } from '@/lib/simulator/engine';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dropdown,
  SegmentedControl,
  TactileSwitch,
  useToast,
} from '@/components/ui';
import {
  CollapsibleSection,
  DockablePanel,
  useWorkspace,
} from '@/components/workspace';

const FORBIDDEN_ACTION_KEYS = new Set(['immobilize', 'config', 'guardrails']);

export default function AutomationsPage() {
  const { snapshot, getDockPanelState, setDockPanelState } = useWorkspace();
  const { pushToast } = useToast();

  const [activeTab, setActiveTab] = useState<'recipes' | 'pro'>('recipes');
  const [selectedModule, setSelectedModule] = useState<Phase1ModuleCode>('PWR-01');
  const [simulateCoreTier, setSimulateCoreTier] = useState(false);

  const [rules, setRules] = useState<ProRuleAst[]>(() =>
    INDIAN_RECIPES.map((r) => ({ ...r }))
  );

  // New Pro Logic draft rule state
  const [draftName, setDraftName] = useState('Smart Night Load Guard');
  const [draftCategory, setDraftCategory] = useState<'local' | 'cross_category'>('local');
  const [draftLogic, setDraftLogic] = useState<'AND' | 'OR'>('OR');
  const [draftTriggerKey, setDraftTriggerKey] = useState('p');
  const [draftTriggerOp, setDraftTriggerOp] = useState<'>' | '<' | '==' | '!='>('>');
  const [draftTriggerVal, setDraftTriggerVal] = useState('1500');
  const [draftCondNot, setDraftCondNot] = useState(true);
  const [draftWindowStart, setDraftWindowStart] = useState('22:00');
  const [draftWindowEnd, setDraftWindowEnd] = useState('06:00');
  const [draftCooldown, setDraftCooldown] = useState(60);
  const [draftActionKey, setDraftActionKey] = useState('ch1');
  const [draftIncludeElse, setDraftIncludeElse] = useState(true);

  const compilerDockState = getDockPanelState('g17_compiler_preview', {
    open: true,
    position: 'right',
  });

  const [initialTrialEndsAt] = useState(() => 1771488000000 + 89 * 24 * 60 * 60 * 1000);
  const entitlements = useMemo(
    () =>
      resolveEntitlements(
        simulateCoreTier
          ? {
              tier: 'core',
              status: 'expired',
              trial_ends_at: null,
              expires_at: null,
              dfy_3d_purchased: false,
            }
          : {
              tier: 'core',
              status: 'trial',
              trial_ends_at: initialTrialEndsAt,
              expires_at: null,
              dfy_3d_purchased: false,
            }
      ),
    [simulateCoreTier, initialTrialEndsAt]
  );

  const isHubNode = selectedModule === 'HUB-01';
  const compilation = useMemo(
    () => compileProRules(rules, entitlements, isHubNode),
    [rules, entitlements, isHubNode]
  );

  // Detect any live RULE_REJECTED alert from firmware/hub
  const rejectedAlerts = useMemo(
    () =>
      Object.values(snapshot.devices).filter(
        (d) => d.last_alert?.type === 'RULE_REJECTED'
      ),
    [snapshot.devices]
  );

  const toggleRule = (id: string, next: boolean) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: next } : r)));
  };

  const updateRuleCooldown = (id: string, cooldownSec: number) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, cooldownSec } : r)));
  };

  const deleteRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const addProRule = () => {
    // Hard UI block for forbidden G17 actions
    if (FORBIDDEN_ACTION_KEYS.has(draftActionKey.trim().toLowerCase())) {
      pushToast({
        title: 'G17 RULE_REJECTED — Forbidden Action',
        description: `Rules cannot actuate "${draftActionKey}" (VEH-01 immobilize or guardrail/config writes are blocked).`,
        tone: 'critical',
      });
      return;
    }

    const numericVal = Number(draftTriggerVal);
    const parsedVal = Number.isFinite(numericVal) ? numericVal : draftTriggerVal;
    const targetDev =
      Object.values(snapshot.devices).find((d) => d.module_code === selectedModule) ??
      Object.values(snapshot.devices)[0];

    const newAst: ProRuleAst = {
      id: `pro_${Date.now().toString(36)}`,
      name: draftName.trim() || 'Custom Pro Rule',
      description: `${draftLogic} logic · ${draftCondNot ? 'NOT inverted' : 'Direct'} · ${
        draftIncludeElse ? 'With ELSE branch' : 'Single branch'
      }`,
      enabled: true,
      category: draftCategory,
      targetDeviceId: targetDev?.device_id ?? 'dd_pwr01_a1b2c3',
      targetModuleCode: selectedModule,
      trigger:
        draftCategory === 'cross_category'
          ? { type: 'geofence', geofenceId: 'geo_home_500m', geofenceEvent: 'enter' }
          : {
              type: 'threshold',
              key: draftTriggerKey,
              op: draftTriggerOp,
              value: parsedVal,
            },
      conditions: {
        logic: draftLogic,
        items: [
          { key: 'v', op: '>', value: 190, isNot: draftCondNot },
          { key: 'ch1', op: '==', value: true, isNot: false },
        ],
      },
      window: { startTime: draftWindowStart, endTime: draftWindowEnd },
      cooldownSec: draftCooldown,
      actions: [
        {
          deviceId: targetDev?.device_id ?? 'dd_pwr01_a1b2c3',
          set: { [draftActionKey]: false },
        },
      ],
      elseActions: draftIncludeElse
        ? [
            {
              deviceId: targetDev?.device_id ?? 'dd_pwr01_a1b2c3',
              set: { [draftActionKey]: true },
            },
          ]
        : undefined,
    };

    setRules((prev) => [newAst, ...prev]);
    pushToast({
      title: 'Pro Logic Rule Added',
      description: `Compiled into ${draftCategory === 'cross_category' ? 'Cloud Function' : 'G17 LocalRule(s)'}`,
      tone: 'success',
    });
  };

  const pushCompiledRulesToDevice = () => {
    const targetDev = Object.values(snapshot.devices).find(
      (d) => d.module_code === selectedModule
    );
    if (!targetDev) return;
    const payload = buildRulesPayload(compilation.localRules);
    const ok = simulatorEngine.updateRules(targetDev.device_id, payload);
    if (ok) {
      pushToast({
        title: `Pushed ${compilation.localRules.length} Local Rules`,
        description: `Dispatched to ddoodle/${snapshot.home_id}/${targetDev.device_id}/rules`,
        tone: 'success',
      });
    } else {
      pushToast({
        title: 'RULE_REJECTED by Firmware',
        description: 'Check quota or forbidden actions in the G17 Compiler Preview.',
        tone: 'critical',
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Hybrid Automation Engine
          </h1>
          <p className="text-xs text-foreground-secondary font-mono tabular-nums">
            G17 Edge Compiler · Quota: {compilation.quota.used} / {compilation.quota.max}{' '}
            {isHubNode ? '(HUB-01)' : '(Core Node)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={simulateCoreTier ? 'accent' : 'outline'}
            size="sm"
            onClick={() => setSimulateCoreTier((s) => !s)}
          >
            <span>{simulateCoreTier ? 'Previewing: Core Floor' : 'Preview: Core Downgrade'}</span>
          </Button>
          <Button
            variant={compilerDockState.open ? 'accent' : 'secondary'}
            size="sm"
            onClick={() =>
              setDockPanelState('g17_compiler_preview', {
                open: !compilerDockState.open,
                collapsed: false,
              })
            }
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>G17 Compiler Dock</span>
          </Button>
        </div>
      </div>

      {/* Incoming Firmware RULE_REJECTED Alert Banner */}
      {(rejectedAlerts.length > 0 || compilation.errors.length > 0) && (
        <Banner
          tone="critical"
          title="G17 RULE_REJECTED Warning"
          description={
            compilation.errors[0] ??
            `Firmware/Hub rejected a rule on ${rejectedAlerts[0]?.name}: ${rejectedAlerts[0]?.last_alert?.message ?? 'Safety policy violation'}`
          }
        />
      )}

      {/* Locked Hardware Safety Ceilings Notice */}
      <div className="rounded-[var(--dd-radius-control)] border border-success/35 bg-success-soft px-3.5 py-2.5 flex items-start gap-2.5 text-xs">
        <ShieldCheck className="h-4 w-4 text-success shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground">
            Non-Overridable Safety Ceilings (`guardrails.hard_locked: true`):
          </strong>{' '}
          <span className="text-foreground-secondary">
            WAT-01 30s dry-run cutoff and PWR-03 45-min geyser max-runtime are firmware-locked and
            cannot be bypassed by any automation. Rules targeting VEH-01 `immobilize` or `guardrails`
            are strictly blocked.
          </span>
        </div>
      </div>

      {/* Primary Two-Tab Switcher + Target Node Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<'recipes' | 'pro'>
          ariaLabel="Automation Mode"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            {
              value: 'recipes',
              label: '1-Tap Indian Recipes',
              icon: <Zap className="h-3.5 w-3.5" />,
              badge: rules.filter((r) => r.id.startsWith('recipe_')).length,
            },
            {
              value: 'pro',
              label: 'Pro Logic Builder',
              icon: <Sparkles className="h-3.5 w-3.5" />,
              badge: entitlements.canUseProLogicAutomations ? 'PLUS' : 'LOCKED',
            },
          ]}
        />

        <div className="flex items-center gap-2">
          <Dropdown
            ariaLabel="Target compilation node"
            value={selectedModule}
            onChange={(v) => setSelectedModule(v as Phase1ModuleCode)}
            options={[
              { value: 'PWR-01', label: 'PWR-01 (Core ≤ 5)' },
              { value: 'PWR-03', label: 'PWR-03 (Geyser ≤ 5)' },
              { value: 'WAT-01', label: 'WAT-01 (Pump ≤ 5)' },
              { value: 'HUB-01', label: 'HUB-01 (Hub ≤ 64)' },
            ]}
          />
          <Button variant="primary" size="sm" onClick={pushCompiledRulesToDevice}>
            <Send className="h-3.5 w-3.5" />
            <span>Push to {selectedModule}</span>
          </Button>
        </div>
      </div>

      {/* TAB 1: Recipes (Default Upfront) */}
      {activeTab === 'recipes' && (
        <div className="space-y-3">
          {rules.map((rule) => {
            const isCloud = rule.category === 'cross_category' || rule.trigger.type === 'geofence';
            return (
              <Card key={rule.id} className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground">{rule.name}</h3>
                      <Badge variant={isCloud ? 'accent' : 'success'}>
                        {isCloud ? (
                          <>
                            <Cloud className="h-3 w-3" />
                            <span>CLOUD FUNCTION</span>
                          </>
                        ) : (
                          <>
                            <Cpu className="h-3 w-3" />
                            <span>LOCAL ESP32/HUB</span>
                          </>
                        )}
                      </Badge>
                      <Badge variant="mono">{rule.targetModuleCode}</Badge>
                    </div>
                    {rule.description && (
                      <p className="text-xs text-foreground-secondary">{rule.description}</p>
                    )}
                  </div>

                  {!rule.id.startsWith('recipe_') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => deleteRule(rule.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  )}
                </div>

                <TactileSwitch
                  label={rule.enabled ? 'Automation Enabled' : 'Automation Paused'}
                  sublabel={`Cooldown: ${rule.cooldownSec ?? 60}s · Window: ${
                    rule.window ? `${rule.window.startTime}–${rule.window.endTime}` : 'Always'
                  }`}
                  checked={rule.enabled}
                  onChange={(next) => toggleRule(rule.id, next)}
                />

                <CollapsibleSection
                  sectionId={`recipe_params_${rule.id}`}
                  title="Customize Parameters"
                  defaultCollapsed={true}
                  contentClassName="space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 font-mono">
                    <span className="text-foreground-secondary">
                      Trigger: {rule.trigger.type} {rule.trigger.key ?? ''} {rule.trigger.op ?? ''}{' '}
                      {rule.trigger.value ?? rule.trigger.cron ?? ''}
                    </span>
                    <label className="flex items-center gap-2">
                      <span className="text-foreground-muted">Cooldown (sec):</span>
                      <input
                        type="number"
                        min={5}
                        max={3600}
                        value={rule.cooldownSec ?? 60}
                        onChange={(e) => updateRuleCooldown(rule.id, Number(e.target.value))}
                        className="w-20 h-8 rounded border border-border bg-surface-elevated px-2 text-foreground tabular-nums"
                      />
                    </label>
                  </div>
                </CollapsibleSection>
              </Card>
            );
          })}
        </div>
      )}

      {/* TAB 2: Pro Logic Builder (Plus Gated with Graceful Downgrade UX) */}
      {activeTab === 'pro' && (
        <div className="space-y-4">
          {!entitlements.canUseProLogicAutomations && (
            <Banner
              tone="warning"
              title="Pro Logic (OR / NOT / ELSE & Cross-Module) Requires DD oodle Plus"
              description="Your Core (Free Forever) local schedules and 1-Tap Recipes remain 100% active. Upgrade to Plus (₹1,499/yr) to compile multi-branch OR/ELSE rules."
              action={
                <Link href="/billing">
                  <Button variant="primary" size="sm">
                    <Lock className="h-3.5 w-3.5" />
                    <span>View Plans</span>
                  </Button>
                </Link>
              }
            />
          )}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Visual Pro Logic Rule Composer (IF / ELSE / AND / OR / NOT)</CardTitle>
                <p className="text-xs text-foreground-muted mt-0.5">
                  OR flattens into parallel rules · NOT inverts operators · ELSE emits complementary trigger rules
                </p>
              </div>
              <Badge variant="accent">G17 AST</Badge>
            </CardHeader>

            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-foreground-secondary font-medium">Rule Name</span>
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="w-full h-9 rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated px-3 text-foreground"
                  />
                </label>

                <div className="space-y-1">
                  <span className="text-foreground-secondary font-medium block">Execution Routing</span>
                  <SegmentedControl<'local' | 'cross_category'>
                    fullWidth
                    size="sm"
                    value={draftCategory}
                    onChange={setDraftCategory}
                    options={[
                      { value: 'local', label: 'Local ESP32/Hub' },
                      { value: 'cross_category', label: 'Cloud Geofence' },
                    ]}
                  />
                </div>
              </div>

              {/* IF Trigger + Logic Operator */}
              <div className="rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated p-3 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-mono font-semibold text-accent">IF / WHEN CONDITION</span>
                  <SegmentedControl<'AND' | 'OR'>
                    size="sm"
                    value={draftLogic}
                    onChange={setDraftLogic}
                    options={[
                      { value: 'AND', label: 'AND (Single Rule)' },
                      { value: 'OR', label: 'OR (Parallel Flatten)' },
                    ]}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 font-mono">
                  <input
                    type="text"
                    value={draftTriggerKey}
                    onChange={(e) => setDraftTriggerKey(e.target.value)}
                    placeholder="key (e.g. p)"
                    className="h-9 rounded border border-border bg-surface px-2.5 text-foreground"
                  />
                  <select
                    value={draftTriggerOp}
                    onChange={(e) => setDraftTriggerOp(e.target.value as '>' | '<' | '==' | '!=')}
                    className="h-9 rounded border border-border bg-surface px-2 text-foreground"
                  >
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value="==">==</option>
                    <option value="!=">!=</option>
                  </select>
                  <input
                    type="text"
                    value={draftTriggerVal}
                    onChange={(e) => setDraftTriggerVal(e.target.value)}
                    placeholder="value"
                    className="h-9 rounded border border-border bg-surface px-2.5 text-foreground tabular-nums"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draftCondNot}
                      onChange={(e) => setDraftCondNot(e.target.checked)}
                    />
                    <span className="text-foreground-secondary">
                      Apply <code className="font-mono text-accent">NOT</code> operator inversion (`v &gt; 190` → `v &lt;= 190`)
                    </span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draftIncludeElse}
                      onChange={(e) => setDraftIncludeElse(e.target.checked)}
                    />
                    <span className="text-foreground-secondary">
                      Generate <code className="font-mono text-accent">ELSE</code> complementary rule
                    </span>
                  </label>
                </div>
              </div>

              {/* Time Window, Cooldown & Action */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 font-mono">
                <label className="space-y-1">
                  <span className="text-[10px] text-foreground-muted">WINDOW START</span>
                  <input
                    type="time"
                    value={draftWindowStart}
                    onChange={(e) => setDraftWindowStart(e.target.value)}
                    className="w-full h-9 rounded border border-border bg-surface-elevated px-2 text-foreground tabular-nums"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-foreground-muted">WINDOW END</span>
                  <input
                    type="time"
                    value={draftWindowEnd}
                    onChange={(e) => setDraftWindowEnd(e.target.value)}
                    className="w-full h-9 rounded border border-border bg-surface-elevated px-2 text-foreground tabular-nums"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-foreground-muted">COOLDOWN (s)</span>
                  <input
                    type="number"
                    value={draftCooldown}
                    onChange={(e) => setDraftCooldown(Number(e.target.value))}
                    className="w-full h-9 rounded border border-border bg-surface-elevated px-2 text-foreground tabular-nums"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-foreground-muted">THEN ACTION KEY</span>
                  <input
                    type="text"
                    value={draftActionKey}
                    onChange={(e) => setDraftActionKey(e.target.value)}
                    placeholder="ch1 / pump_on"
                    className="w-full h-9 rounded border border-border bg-surface-elevated px-2 text-foreground"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground-muted">
                  <ShieldAlert className="h-3.5 w-3.5 text-danger" />
                  <span>Blocked keys: `immobilize`, `config`, `guardrails`</span>
                </span>
                <Button variant="primary" touchTarget onClick={addProRule}>
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add &amp; Compile Rule</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dockable Live G17 Compiler Preview Panel */}
      <DockablePanel
        panelId="g17_compiler_preview"
        title="Live G17 Compiler Preview"
        subtitle={`${compilation.localRules.length} Local · ${compilation.cloudRules.length} Cloud`}
        icon={<Code2 className="h-3.5 w-3.5" />}
        defaultOpen={false}
        defaultPosition="right"
      >
        <div className="space-y-3 font-mono text-[11px]">
          <div className="grid grid-cols-2 gap-2 tabular-nums">
            <div className="rounded border border-border bg-surface-elevated p-2">
              <div className="text-[9px] text-foreground-muted">LOCAL QUOTA</div>
              <div
                className={`text-sm font-semibold ${
                  compilation.quota.exceeded ? 'text-danger' : 'text-success'
                }`}
              >
                {compilation.quota.used} / {compilation.quota.max}
              </div>
            </div>
            <div className="rounded border border-border bg-surface-elevated p-2">
              <div className="text-[9px] text-foreground-muted">CLOUD ROUTED</div>
              <div className="text-sm font-semibold text-accent">
                {compilation.cloudRules.length}
              </div>
            </div>
          </div>

          {compilation.warnings.map((w, idx) => (
            <div
              key={idx}
              className="rounded border border-warning/40 bg-warning-soft p-2 text-[10px] text-foreground"
            >
              {w}
            </div>
          ))}

          {compilation.errors.map((err, idx) => (
            <div
              key={idx}
              className="flex items-start gap-1.5 rounded border border-danger/50 bg-danger-soft p-2 text-[10px] text-danger"
            >
              <AlertOctagon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          ))}

          <div className="space-y-1">
            <div className="text-[10px] text-foreground-muted uppercase">
              Compiled LocalRules (`.../rules`)
            </div>
            <pre className="rounded border border-border bg-canvas p-2.5 text-[10px] text-foreground-secondary overflow-x-auto max-h-64 dd-scroll">
              {JSON.stringify(compilation.localRules, null, 2)}
            </pre>
          </div>

          {compilation.cloudRules.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] text-foreground-muted uppercase">
                Cloud Functions Cross-Category Rules
              </div>
              <pre className="rounded border border-border bg-canvas p-2.5 text-[10px] text-accent overflow-x-auto max-h-40 dd-scroll">
                {JSON.stringify(
                  compilation.cloudRules.map((c) => ({
                    id: c.id,
                    name: c.name,
                    trigger: c.trigger,
                  })),
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </div>
      </DockablePanel>
    </div>
  );
}
