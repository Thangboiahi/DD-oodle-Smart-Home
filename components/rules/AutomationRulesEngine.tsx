'use client';

import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Zap,
  Sliders,
  Shield,
  Clock,
  Play,
  CheckCircle,
  AlertTriangle,
  Send,
  Plus,
  Trash2,
  Lock,
  ArrowRight,
  Battery,
  Sun,
  Droplets,
  Moon,
  Car,
  Layers,
  ChevronRight,
  Radio,
} from 'lucide-react';
import {
  ProRuleAst,
  INDIAN_RECIPES,
  compileProRules,
  buildRulesPayload,
} from '@/lib/rules/compiler';
import { simulatorEngine } from '@/lib/simulator/engine';
import { ResolvedEntitlements } from '@/lib/entitlements/resolver';
import { Phase1ModuleCode } from '@/lib/protocol/contract';
import { ThemedCheckbox, ThemedSelect } from '@/components/ui';

interface AutomationRulesEngineProps {
  entitlements: ResolvedEntitlements;
  selectedModule: Phase1ModuleCode;
  onSelectModule: (mod: Phase1ModuleCode) => void;
}

export const AutomationRulesEngine: React.FC<AutomationRulesEngineProps> = ({
  entitlements,
  selectedModule,
  onSelectModule,
}) => {
  const [activeTab, setActiveTab] = useState<'recipes' | 'pro_builder' | 'compiled'>('recipes');
  const [rulesList, setRulesList] = useState<ProRuleAst[]>(() => structuredClone(INDIAN_RECIPES));
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // New Pro Rule Builder Form State
  const [newRuleName, setNewRuleName] = useState<string>('AC & Geyser Power Saver');
  const [newRuleDevice, setNewRuleDevice] = useState<string>('dd_pwr03_g7h8i9');
  const [newRuleTriggerKey, setNewRuleTriggerKey] = useState<string>('p');
  const [newRuleTriggerOp, setNewRuleTriggerOp] = useState<'<' | '<=' | '>' | '>=' | '==' | '!='>('>');
  const [newRuleTriggerVal, setNewRuleTriggerVal] = useState<number>(1500);
  const [newRuleLogic, setNewRuleLogic] = useState<'AND' | 'OR'>('AND');
  const [newRuleActionKey, setNewRuleActionKey] = useState<string>('ch1');
  const [newRuleActionVal, setNewRuleActionVal] = useState<boolean>(false);
  const [hasElseAction, setHasElseAction] = useState<boolean>(true);
  const [builderError, setBuilderError] = useState<string | null>(null);

  // Compile rules through the G17 Hybrid Engine
  const compilation = useMemo(() => {
    return compileProRules(rulesList, entitlements, false);
  }, [rulesList, entitlements]);

  // Toggle rule enabled state
  const toggleRule = (id: string) => {
    setRulesList((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  // Test Run Recipe
  const testRunRecipe = (recipeId: string) => {
    if (recipeId === 'recipe_inverter_saver') {
      simulatorEngine.sendCommand('dd_pwr03_g7h8i9', { ch1: false }, 'rule');
    } else if (recipeId === 'recipe_morning_geyser') {
      simulatorEngine.sendCommand('dd_pwr03_g7h8i9', { ch1: true }, 'rule');
    } else if (recipeId === 'recipe_tank_autofill') {
      simulatorEngine.sendCommand('dd_wat01_j1k2l3', { pump_on: true }, 'rule');
    } else if (recipeId === 'recipe_porch_lights') {
      simulatorEngine.sendCommand('dd_pwr01_a1b2c3', { ch3: true }, 'rule');
    } else if (recipeId === 'recipe_coming_home_gps') {
      simulatorEngine.sendCommand('dd_pwr01_a1b2c3', { ch3: true }, 'rule');
    }
    setSyncStatus(`Executed recipe [${recipeId}] test trigger via virtual engine.`);
    setTimeout(() => setSyncStatus(null), 3000);
  };

  // Push compiled LocalRules to Virtual Devices via MQTT (.../rules topic)
  const syncToDevices = () => {
    const payload = buildRulesPayload(compilation.localRules);
    // Push rules to all relevant target devices
    simulatorEngine.updateRules('dd_pwr01_a1b2c3', payload);
    simulatorEngine.updateRules('dd_pwr03_g7h8i9', payload);
    simulatorEngine.updateRules('dd_wat01_j1k2l3', payload);
    setSyncStatus(`Successfully deployed ${compilation.localRules.length} compiled G17 local rules to hardware.`);
    setTimeout(() => setSyncStatus(null), 4000);
  };

  // Create new rule from builder
  const handleCreateProRule = () => {
    setBuilderError(null);
    if (!newRuleName.trim()) {
      setBuilderError('Please provide a descriptive rule name.');
      return;
    }

    const newAst: ProRuleAst = {
      id: `rule_pro_${Date.now()}`,
      name: newRuleName,
      enabled: true,
      category: 'local',
      targetDeviceId: newRuleDevice,
      targetModuleCode: newRuleDevice.includes('pwr03')
        ? 'PWR-03'
        : newRuleDevice.includes('wat01')
        ? 'WAT-01'
        : 'PWR-01',
      trigger: {
        type: 'threshold',
        key: newRuleTriggerKey,
        op: newRuleTriggerOp,
        value: newRuleTriggerVal,
      },
      conditions: {
        logic: newRuleLogic,
        items: [],
      },
      cooldownSec: 60,
      actions: [
        {
          deviceId: newRuleDevice,
          set: { [newRuleActionKey]: newRuleActionVal },
        },
      ],
      elseActions: hasElseAction
        ? [
            {
              deviceId: newRuleDevice,
              set: { [newRuleActionKey]: !newRuleActionVal },
            },
          ]
        : undefined,
    };

    setRulesList([...rulesList, newAst]);
    setActiveTab('compiled');
  };

  const deleteRule = (id: string) => {
    setRulesList(rulesList.filter((r) => r.id !== id));
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl backdrop-blur-md overflow-hidden text-slate-100 flex flex-col font-mono">
      {/* Top Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">Hybrid Automation Engine (v1.4, G17)</h3>
              <span className="text-[10px] text-amber-400 bg-amber-950/60 border border-amber-800/40 px-1.5 py-0.5 rounded font-bold">
                1-Tap Recipes &bull; Pro Logic Compiler
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Local Hardware Execution (&le;5 Core, &le;50 Plus, &le;64 Hub) &bull; Cloud Geofence Triggering
            </p>
          </div>
        </div>

        {/* Tab Switcher & Deploy Button */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('recipes')}
              className={`px-3 py-1.5 rounded font-bold transition ${
                activeTab === 'recipes' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400'
              }`}
            >
              Indian Recipes ({rulesList.length})
            </button>
            <button
              onClick={() => setActiveTab('pro_builder')}
              className={`px-3 py-1.5 rounded font-bold transition flex items-center gap-1 ${
                activeTab === 'pro_builder' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400'
              }`}
            >
              <span>Pro Logic</span>
              {!entitlements.canUseProLogicAutomations && (
                <Lock className="w-3 h-3 text-amber-400" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('compiled')}
              className={`px-3 py-1.5 rounded font-bold transition flex items-center gap-1 ${
                activeTab === 'compiled' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400'
              }`}
            >
              <span>Compiled G17</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                {compilation.localRules.length}
              </span>
            </button>
          </div>

          <button
            onClick={syncToDevices}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow"
            title="Deploy compiled rules to hardware via MQTT ddoodle/.../rules"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Sync (.../rules)</span>
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncStatus && (
        <div className="bg-emerald-950/80 border-b border-emerald-500/40 px-4 py-2 text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{syncStatus}</span>
        </div>
      )}

      {/* Quota & Capacity Status Ribbon */}
      <div className="px-4 py-2.5 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-slate-400">Local Rule Capacity:</span>
          <div className="flex items-center gap-1.5">
            <span
              className={`font-black ${
                compilation.quota.exceeded ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {compilation.quota.used} / {compilation.quota.max}
            </span>
            <span className="text-[10px] text-slate-400">
              ({entitlements.effectiveTier.toUpperCase()} Plan Quota)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <Radio className="w-3.5 h-3.5 text-cyan-400" /> Local ESP32 / Hub: {compilation.localRules.length}
          </span>
          <span className="flex items-center gap-1">
            <Car className="w-3.5 h-3.5 text-indigo-400" /> Cloud GPS Geofence: {compilation.cloudRules.length}
          </span>
        </div>
      </div>

      {/* TAB 1: 1-TAP INDIAN HOME RECIPES */}
      {activeTab === 'recipes' && (
        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-400">
            Hand-tuned for Indian voltage swings, grid shedding, inverter battery conservation, and daily geyser routines.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {rulesList.map((recipe) => {
              const isLocal = recipe.category === 'local';
              return (
                <div
                  key={recipe.id}
                  className={`rounded-xl border p-4 transition flex flex-col justify-between gap-3 ${
                    recipe.enabled
                      ? 'border-slate-800 bg-slate-900/70 hover:border-amber-500/40'
                      : 'border-slate-800/60 bg-slate-950/50 opacity-60'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {recipe.id.includes('inverter') ? (
                          <Battery className="w-4 h-4 text-amber-400" />
                        ) : recipe.id.includes('geyser') ? (
                          <Sun className="w-4 h-4 text-sky-400" />
                        ) : recipe.id.includes('tank') ? (
                          <Droplets className="w-4 h-4 text-blue-400" />
                        ) : recipe.id.includes('porch') ? (
                          <Moon className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Car className="w-4 h-4 text-indigo-400" />
                        )}
                        <h4 className="text-xs font-bold text-slate-100">{recipe.name}</h4>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                            isLocal
                              ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-800/40'
                              : 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/40'
                          }`}
                        >
                          {isLocal ? 'ESP32 / Hub Local' : 'Cloud Geofence'}
                        </span>

                        <ThemedCheckbox
                          checked={recipe.enabled}
                          onChange={() => toggleRule(recipe.id)}
                          aria-label={`Toggle ${recipe.name}`}
                        />
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {recipe.description}
                    </p>
                  </div>

                  {/* Trigger & Action Summary */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">
                      Target: <strong className="text-slate-200">{recipe.targetModuleCode}</strong>
                    </span>

                    <button
                      onClick={() => testRunRecipe(recipe.id)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold flex items-center gap-1 transition"
                    >
                      <Play className="w-3 h-3 fill-amber-300" />
                      <span>Test Trigger</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: PRO LOGIC BUILDER (PLUS GATED) */}
      {activeTab === 'pro_builder' && (
        <div className="p-4 space-y-4">
          {!entitlements.canUseProLogicAutomations && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3.5 flex items-start gap-3 text-xs">
              <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-300">Pro Logic Automations are Gated under Plus:</strong>
                <p className="text-[11px] text-slate-300 mt-1">
                  Enjoy multi-variable IF / ELSE / AND / OR / NOT logic with custom sensor thresholds.
                  Currently active via your 90-Day Free Plus Trial!
                </p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4 text-xs">
            <h4 className="font-bold text-slate-200 uppercase tracking-wider text-xs flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Create Pro Automation Rule</span>
            </h4>

            {builderError && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-[11px]">
                {builderError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Rule Name */}
              <div className="space-y-1.5">
                <label className="text-slate-400 text-[11px]">Rule Name:</label>
                <input
                  type="text"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Target Device */}
              <div className="space-y-1.5">
                <label className="text-slate-400 text-[11px] block">Target Device:</label>
                <ThemedSelect
                  ariaLabel="Target Device"
                  value={newRuleDevice}
                  onChange={setNewRuleDevice}
                  options={[
                    { value: 'dd_pwr03_g7h8i9', label: 'dd_pwr03_g7h8i9', badge: 'PWR-03', description: 'Heavy Appliance Switch' },
                    { value: 'dd_wat01_j1k2l3', label: 'dd_wat01_j1k2l3', badge: 'WAT-01', description: 'Overhead Tank Controller' },
                    { value: 'dd_pwr01_a1b2c3', label: 'dd_pwr01_a1b2c3', badge: 'PWR-01', description: '4-Channel Switch' },
                    { value: 'dd_pwr02_d4e5f6', label: 'dd_pwr02_d4e5f6', badge: 'PWR-02', description: 'Stepped Fan Controller' },
                    { value: 'dd_hub01_u7v8w9', label: 'dd_hub01_u7v8w9', badge: 'HUB-01', description: 'Local Automation Hub' },
                  ]}
                />
              </div>
            </div>

            {/* Condition Block */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-3">
              <span className="text-[11px] font-bold text-amber-400 uppercase">
                Trigger Expression (IF):
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="text-[10px] text-slate-400">Sensor / State Key</label>
                  <input
                    type="text"
                    value={newRuleTriggerKey}
                    onChange={(e) => setNewRuleTriggerKey(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-700 bg-slate-900 text-xs text-slate-200 font-mono"
                    placeholder="e.g. p, v, level_pct"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Operator</label>
                  <ThemedSelect
                    ariaLabel="Trigger operator"
                    value={newRuleTriggerOp}
                    onChange={(v) =>
                      setNewRuleTriggerOp(v as '<' | '<=' | '>' | '>=' | '==' | '!=')
                    }
                    options={[
                      { value: '>', label: '> (Greater than)' },
                      { value: '>=', label: '>= (Greater/equal)' },
                      { value: '<', label: '< (Less than)' },
                      { value: '<=', label: '<= (Less/equal)' },
                      { value: '==', label: '== (Equals)' },
                      { value: '!=', label: '!= (Not equals)' },
                    ]}
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400">Threshold Value</label>
                  <input
                    type="number"
                    value={newRuleTriggerVal}
                    onChange={(e) => setNewRuleTriggerVal(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-700 bg-slate-900 text-xs text-slate-200 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Multi-Condition Logic</label>
                  <ThemedSelect
                    ariaLabel="Multi-Condition Logic"
                    value={newRuleLogic}
                    onChange={(v) => setNewRuleLogic(v as 'AND' | 'OR')}
                    options={[
                      { value: 'AND', label: 'AND (All match)' },
                      { value: 'OR', label: 'OR (Flattened parallel rules)' },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Action Block */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-3">
              <span className="text-[11px] font-bold text-emerald-400 uppercase">
                Action Output (THEN &amp; Optional ELSE):
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400">Actuate Output Key</label>
                  <input
                    type="text"
                    value={newRuleActionKey}
                    onChange={(e) => setNewRuleActionKey(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-700 bg-slate-900 text-xs text-slate-200 font-mono"
                    placeholder="e.g. ch1, pump_on, fan_speed"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">THEN State</label>
                  <ThemedSelect
                    ariaLabel="THEN State"
                    value={newRuleActionVal ? 'true' : 'false'}
                    onChange={(v) => setNewRuleActionVal(v === 'true')}
                    options={[
                      { value: 'false', label: 'Turn OFF (false)' },
                      { value: 'true', label: 'Turn ON (true)' },
                    ]}
                  />
                </div>

                <div className="flex items-center pt-4">
                  <ThemedCheckbox
                    id="hasElse"
                    checked={hasElseAction}
                    onChange={setHasElseAction}
                    label="Generate Complementary ELSE rule"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleCreateProRule}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow"
            >
              <Plus className="w-4 h-4" />
              <span>Compile &amp; Add Pro Rule</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: COMPILED G17 LOCALRULES PAYLOAD */}
      {activeTab === 'compiled' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Compiled against frozen <strong>Protocol Contract v1.4 (G17)</strong> ready for ESP32 flash / HUB-01 execution:
            </span>

            <span className="text-[10px] text-slate-500 font-mono">
              QoS 1 &bull; Retained on ddoodle/.../rules
            </span>
          </div>

          {compilation.errors.length > 0 && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Compilation Security Errors:</span>
              </div>
              {compilation.errors.map((err, i) => (
                <p key={i} className="text-[11px] pl-5">&bull; {err}</p>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 max-h-80 overflow-y-auto space-y-2 text-xs">
            {compilation.localRules.map((rule, idx) => (
              <div
                key={rule.id}
                className="p-2.5 rounded border border-slate-800/80 bg-slate-900/50 space-y-1 text-[11px]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300">
                    Rule #{idx + 1}: {rule.id}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Type: <strong className="text-slate-200">{rule.type}</strong> &bull; Cooldown: {rule.cooldown_sec}s
                  </span>
                </div>

                <div className="text-slate-300">
                  <span className="text-slate-500">WHEN: </span>
                  {rule.cron ? (
                    <span>Cron ({rule.cron})</span>
                  ) : rule.condition ? (
                    <span className="text-sky-300">
                      {rule.condition.key} {rule.condition.op} {String(rule.condition.value)}
                    </span>
                  ) : (
                    <span>State Change</span>
                  )}
                  {rule.and && rule.and.length > 0 && (
                    <span className="text-emerald-300 ml-1">
                      AND {rule.and.map((a) => `${a.key} ${a.op} ${String(a.value)}`).join(', ')}
                    </span>
                  )}
                </div>

                <div className="text-emerald-400">
                  <span className="text-slate-500">THEN: </span>
                  {JSON.stringify(rule.action)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
