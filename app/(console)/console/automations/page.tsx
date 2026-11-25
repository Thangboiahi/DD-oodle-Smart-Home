'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
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
  X,
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
  Dropdown,
  SegmentedControl,
  ThemedCheckbox,
  ThemedSelect,
  ThemedTimePicker,
  useToast,
} from '@/components/ui';
import {
  DockablePanel,
  useWorkspace,
} from '@/components/workspace';
import { cn } from '@/lib/utils';

const FORBIDDEN_ACTION_KEYS = new Set(['immobilize', 'config', 'guardrails']);

export default function AutomationsPage() {
  const { snapshot, getDockPanelState, setDockPanelState } = useWorkspace();
  const { pushToast } = useToast();

  const [activeTab, setActiveTab] = useState<'recipes' | 'pro'>('recipes');
  const [selectedModule, setSelectedModule] = useState<Phase1ModuleCode>('PWR-01');
  const [simulateCoreTier, setSimulateCoreTier] = useState(false);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [proModalOpen, setProModalOpen] = useState(false);

  const [rules, setRules] = useState<ProRuleAst[]>(() =>
    INDIAN_RECIPES.map((r) => ({ ...r }))
  );

  // New Pro Logic draft rule state (inside clean modal/drawer composer)
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
    open: false,
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
    setProModalOpen(false);
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

  const displayedRules =
    activeTab === 'recipes'
      ? rules.filter((r) => r.id.startsWith('recipe_'))
      : rules;

  return (
    <div className="max-w-4xl mx-auto space-y-3">
      {/* Slim Header + G17 Compiler Drawer Button */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
              Hybrid Automations
            </h1>
            <Badge variant="mono">
              Quota {compilation.quota.used}/{compilation.quota.max}{' '}
              {isHubNode ? 'HUB' : 'CORE'}
            </Badge>
            <Badge variant="success">
              <ShieldCheck className="h-3 w-3" />
              <span>Guardrails Locked</span>
            </Badge>
          </div>
          <p className="text-xs text-foreground-secondary">
            1-Tap Indian Recipes + G17 Edge Compiler (`.../rules` &amp; Cloud Functions).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant={simulateCoreTier ? 'accent' : 'outline'}
            size="sm"
            onClick={() => setSimulateCoreTier((s) => !s)}
          >
            <span>{simulateCoreTier ? 'Core Tier' : 'Test Core Floor'}</span>
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
            <span>G17 Preview</span>
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

      {/* Compact Control Strip: Segmented [Recipes | Pro Logic] + Target Node + Push */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border hairline-border bg-surface/75 px-3 py-2">
        <SegmentedControl<'recipes' | 'pro'>
          size="sm"
          ariaLabel="Automation Mode"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            {
              value: 'recipes',
              label: 'Recipes',
              icon: <Zap className="h-3.5 w-3.5" />,
              badge: rules.filter((r) => r.id.startsWith('recipe_')).length,
            },
            {
              value: 'pro',
              label: 'Pro Logic',
              icon: <Sparkles className="h-3.5 w-3.5" />,
              badge: entitlements.canUseProLogicAutomations ? 'PLUS' : 'LOCKED',
            },
          ]}
        />

        <div className="flex items-center gap-1.5 flex-wrap">
          {activeTab === 'pro' && (
            <Button
              variant="accent"
              size="sm"
              onClick={() => setProModalOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>+ New Pro Rule</span>
            </Button>
          )}

          <Dropdown
            ariaLabel="Target compilation node"
            value={selectedModule}
            onChange={(v) => setSelectedModule(v as Phase1ModuleCode)}
            triggerClassName="h-8 min-h-0 px-2.5 text-xs"
            options={[
              { value: 'PWR-01', label: 'PWR-01 (≤ 5)' },
              { value: 'PWR-03', label: 'PWR-03 (≤ 5)' },
              { value: 'WAT-01', label: 'WAT-01 (≤ 5)' },
              { value: 'HUB-01', label: 'HUB-01 (≤ 64)' },
            ]}
          />
          <Button variant="primary" size="sm" onClick={pushCompiledRulesToDevice}>
            <Send className="h-3.5 w-3.5" />
            <span>Push Rules</span>
          </Button>
        </div>
      </div>

      {/* Pro Tier Upgrade Notice when previewing Core Floor in Pro Tab */}
      {activeTab === 'pro' && !entitlements.canUseProLogicAutomations && (
        <Banner
          tone="warning"
          title="Pro Logic (OR / NOT / ELSE & Cross-Module) Requires DD oodle Plus"
          description="Your Core (Free Forever) local schedules and 1-Tap Recipes remain 100% active. Upgrade to Plus (₹1,499/yr) to compile multi-branch OR/ELSE rules."
          action={
            <Link href="/console/billing">
              <Button variant="primary" size="sm">
                <Lock className="h-3.5 w-3.5" />
                <span>View Plans</span>
              </Button>
            </Link>
          }
        />
      )}

      {/* Compact 1-Row Expandable Rule Cards */}
      <div className="space-y-2">
        {displayedRules.map((rule) => {
          const isCloud = rule.category === 'cross_category' || rule.trigger.type === 'geofence';
          const isExpanded = expandedRuleId === rule.id;

          return (
            <article
              key={rule.id}
              className="rounded-2xl border hairline-border bg-surface overflow-hidden transition-colors"
            >
              {/* Single-Row Header: Toggle + Title + Badges + Expand Chevron */}
              <div className="flex items-center justify-between gap-2.5 px-3.5 py-2.5">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Compact Tactile Pill Toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rule.enabled}
                    aria-label={`Toggle ${rule.name}`}
                    onClick={() => toggleRule(rule.id, !rule.enabled)}
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer',
                      rule.enabled
                        ? 'border-accent bg-accent'
                        : 'border-border bg-surface-elevated'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                        rule.enabled ? 'translate-x-5' : 'translate-x-1'
                      )}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedRuleId((cur) => (cur === rule.id ? null : rule.id))
                    }
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
                        {rule.name}
                      </span>
                      <Badge variant="mono" className="text-[10px]">
                        {rule.targetModuleCode}
                      </Badge>
                      <Badge variant={isCloud ? 'accent' : 'success'} className="text-[10px]">
                        {isCloud ? (
                          <>
                            <Cloud className="h-2.5 w-2.5" />
                            <span>CLOUD</span>
                          </>
                        ) : (
                          <>
                            <Cpu className="h-2.5 w-2.5" />
                            <span>LOCAL</span>
                          </>
                        )}
                      </Badge>
                    </div>
                    {rule.description && (
                      <p className="text-[11px] text-foreground-muted truncate mt-0.5">
                        {rule.description}
                      </p>
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!rule.id.startsWith('recipe_') && (
                    <button
                      type="button"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => deleteRule(rule.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-foreground-muted hover:text-danger cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    aria-label={`Configure ${rule.name}`}
                    onClick={() =>
                      setExpandedRuleId((cur) => (cur === rule.id ? null : rule.id))
                    }
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-surface-elevated text-foreground-secondary hover:text-foreground cursor-pointer"
                  >
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 transition-transform duration-150',
                        isExpanded && 'rotate-180'
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Expandable Parameters Drawer */}
              {isExpanded && (
                <div className="px-3.5 py-3 border-t hairline-border bg-surface-elevated/40 space-y-2.5 text-xs">
                  {rule.description && (
                    <p className="text-foreground-secondary leading-relaxed">
                      {rule.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[11px]">
                    <div className="space-x-2 text-foreground-secondary">
                      <span>
                        Trigger:{' '}
                        <strong className="text-foreground">
                          {rule.trigger.type} {rule.trigger.key ?? ''}{' '}
                          {rule.trigger.op ?? ''}{' '}
                          {rule.trigger.value ?? rule.trigger.cron ?? ''}
                        </strong>
                      </span>
                      <span>
                        · Window:{' '}
                        <strong className="text-foreground">
                          {rule.window
                            ? `${rule.window.startTime}–${rule.window.endTime}`
                            : '24/7'}
                        </strong>
                      </span>
                    </div>

                    <label className="flex items-center gap-2">
                      <span className="text-foreground-muted">Cooldown (s):</span>
                      <input
                        type="number"
                        min={5}
                        max={3600}
                        value={rule.cooldownSec ?? 60}
                        onChange={(e) =>
                          updateRuleCooldown(rule.id, Number(e.target.value))
                        }
                        className="w-20 h-8 rounded-lg border border-border bg-surface px-2 text-foreground tabular-nums"
                      />
                    </label>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Modal / Bottom Sheet Step Builder for Pro Logic Rules */}
      {proModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setProModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pro-rule-composer-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto dd-scroll rounded-t-2xl sm:rounded-2xl border border-border bg-surface shadow-2xl p-4 sm:p-5 space-y-4 text-xs"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2
                    id="pro-rule-composer-title"
                    className="text-sm font-semibold text-foreground"
                  >
                    Pro Logic Rule Composer (IF / ELSE / AND / OR / NOT)
                  </h2>
                  <Badge variant="accent">G17 AST</Badge>
                </div>
                <p className="text-[11px] text-foreground-muted mt-0.5">
                  OR flattens into parallel rules · NOT inverts operators · ELSE emits complementary rules
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProModalOpen(false)}
                aria-label="Close composer"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-elevated text-foreground-secondary hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-foreground-secondary font-medium">Rule Name</span>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="w-full h-9 rounded-xl border border-border bg-surface-elevated px-3 text-foreground"
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
            <div className="rounded-xl border hairline-border bg-surface-elevated/60 p-3 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-mono font-semibold text-accent">1. IF / WHEN CONDITION</span>
                <SegmentedControl<'AND' | 'OR'>
                  size="sm"
                  value={draftLogic}
                  onChange={setDraftLogic}
                  options={[
                    { value: 'AND', label: 'AND (Single)' },
                    { value: 'OR', label: 'OR (Parallel)' },
                  ]}
                />
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono">
                <input
                  type="text"
                  value={draftTriggerKey}
                  onChange={(e) => setDraftTriggerKey(e.target.value)}
                  placeholder="key (e.g. p)"
                  className="h-9 rounded-lg border border-border bg-surface px-2.5 text-foreground"
                />
                <ThemedSelect
                  ariaLabel="Trigger comparison operator"
                  value={draftTriggerOp}
                  onChange={(val) => setDraftTriggerOp(val as '>' | '<' | '==' | '!=')}
                  options={[
                    { value: '>', label: '> (Greater than)' },
                    { value: '<', label: '< (Less than)' },
                    { value: '==', label: '== (Equals)' },
                    { value: '!=', label: '!= (Not equals)' },
                  ]}
                />
                <input
                  type="text"
                  value={draftTriggerVal}
                  onChange={(e) => setDraftTriggerVal(e.target.value)}
                  placeholder="value"
                  className="h-9 rounded-lg border border-border bg-surface px-2.5 text-foreground tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <ThemedCheckbox
                  checked={draftCondNot}
                  onChange={setDraftCondNot}
                  label={
                    <span className="text-foreground-secondary">
                      Apply <code className="font-mono text-accent">NOT</code> operator inversion (`v &gt; 190` → `v &lt;= 190`)
                    </span>
                  }
                />
                <ThemedCheckbox
                  checked={draftIncludeElse}
                  onChange={setDraftIncludeElse}
                  label={
                    <span className="text-foreground-secondary">
                      Generate <code className="font-mono text-accent">ELSE</code> complementary rule branch
                    </span>
                  }
                />
              </div>
            </div>

            {/* Time Window, Cooldown & Action */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
              <div className="space-y-1">
                <span className="text-[10px] text-foreground-muted block">WINDOW START</span>
                <ThemedTimePicker
                  value={draftWindowStart}
                  onChange={setDraftWindowStart}
                  ariaLabel="Window start time"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-foreground-muted block">WINDOW END</span>
                <ThemedTimePicker
                  value={draftWindowEnd}
                  onChange={setDraftWindowEnd}
                  ariaLabel="Window end time"
                />
              </div>
              <label className="space-y-1">
                <span className="text-[10px] text-foreground-muted">COOLDOWN (s)</span>
                <input
                  type="number"
                  value={draftCooldown}
                  onChange={(e) => setDraftCooldown(Number(e.target.value))}
                  className="w-full h-9 rounded-lg border border-border bg-surface-elevated px-2 text-foreground tabular-nums"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-foreground-muted">THEN ACTION KEY</span>
                <input
                  type="text"
                  value={draftActionKey}
                  onChange={(e) => setDraftActionKey(e.target.value)}
                  placeholder="ch1 / pump_on"
                  className="w-full h-9 rounded-lg border border-border bg-surface-elevated px-2 text-foreground"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t hairline-border">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground-muted">
                <ShieldAlert className="h-3.5 w-3.5 text-danger shrink-0" />
                <span>Blocked: `immobilize`, `config`, `guardrails`</span>
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setProModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={addProRule}>
                  <Plus className="h-3.5 w-3.5" />
                  <span>Compile &amp; Save</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dockable Live G17 Compiler Preview Panel (Collapsed by default on mobile) */}
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
            <div className="rounded-xl border hairline-border bg-surface-elevated p-2.5">
              <div className="text-[9px] text-foreground-muted">LOCAL QUOTA</div>
              <div
                className={`text-sm font-semibold ${
                  compilation.quota.exceeded ? 'text-danger' : 'text-success'
                }`}
              >
                {compilation.quota.used} / {compilation.quota.max}
              </div>
            </div>
            <div className="rounded-xl border hairline-border bg-surface-elevated p-2.5">
              <div className="text-[9px] text-foreground-muted">CLOUD ROUTED</div>
              <div className="text-sm font-semibold text-accent">
                {compilation.cloudRules.length}
              </div>
            </div>
          </div>

          {compilation.warnings.map((w, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-warning/40 bg-warning-soft p-2.5 text-[10px] text-foreground"
            >
              {w}
            </div>
          ))}

          {compilation.errors.map((e, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-danger/50 bg-danger-soft p-2.5 text-[10px] text-danger font-semibold"
            >
              {e}
            </div>
          ))}

          <div>
            <div className="text-[10px] text-foreground-muted mb-1">
              Topic: ddoodle/{snapshot.home_id}/&#123;device_id&#125;/rules
            </div>
            <pre className="rounded-xl border hairline-border bg-canvas p-2.5 text-[10px] text-foreground-secondary overflow-x-auto max-h-80 dd-scroll">
              {JSON.stringify(buildRulesPayload(compilation.localRules), null, 2)}
            </pre>
          </div>
        </div>
      </DockablePanel>
    </div>
  );
}
